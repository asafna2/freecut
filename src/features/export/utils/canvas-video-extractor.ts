/**
 * Video frame extractor using mediabunny for precise frame access.
 *
 * This replaces HTML5 video element seeking which is slow and imprecise.
 * Benefits:
 * - Precise frame-by-frame access (no seek delays)
 * - Pre-decoded frames for instant access
 * - No 500ms timeout fallbacks needed
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('VideoFrameExtractor');

/** Types for dynamically imported mediabunny module */
interface MediabunnySink {
  samples(startTimestamp?: number, endTimestamp?: number): AsyncGenerator<MediabunnySample, void, unknown>;
}

interface MediabunnySample {
  timestamp: number;
  toVideoFrame(): VideoFrame | null;
  close(): void;
}

interface MediabunnyInput {
  getPrimaryVideoTrack(): Promise<MediabunnyVideoTrack | null>;
  computeDuration(): Promise<number>;
  close(): void;
}

interface MediabunnyVideoTrack {
  duration: number;
  displayWidth: number;
  displayHeight: number;
  canDecode?: () => Promise<boolean>;
}

export class VideoFrameExtractor {
  private static readonly TIMESTAMP_EPSILON = 1e-4;

  private sink: MediabunnySink | null = null;
  private input: MediabunnyInput | null = null;
  private videoTrack: MediabunnyVideoTrack | null = null;
  private duration: number = 0;
  private ready: boolean = false;
  private drawFailureCount = 0;
  private sampleIterator: AsyncGenerator<MediabunnySample, void, unknown> | null = null;
  private currentSample: MediabunnySample | null = null;
  private nextSample: MediabunnySample | null = null;
  private iteratorDone = false;
  private lastRequestedTimestamp: number | null = null;
  private sampleLoopError: unknown = null;

  constructor(
    private src: string,
    private itemId: string
  ) {}

  /**
   * Initialize the extractor - must be called before drawFrame()
   */
  async init(): Promise<boolean> {
    try {
      const mb = await import('mediabunny');

      // Fetch the video data from blob URL
      const response = await fetch(this.src);
      const blob = await response.blob();

      // Create input from blob
      this.input = new mb.Input({
        formats: mb.ALL_FORMATS,
        source: new mb.BlobSource(blob),
      });

      // Get video track
      this.videoTrack = await this.input.getPrimaryVideoTrack();
      if (!this.videoTrack) {
        log.warn('No video track found', { itemId: this.itemId });
        return false;
      }

      if (typeof this.videoTrack.canDecode === 'function') {
        const decodable = await this.videoTrack.canDecode();
        if (!decodable) {
          log.warn('Video track is not decodable via mediabunny/WebCodecs', {
            itemId: this.itemId,
          });
          return false;
        }
      }

      // Get duration
      this.duration = await this.input.computeDuration();

      // Create video sample sink for frame extraction
      this.sink = new mb.VideoSampleSink(this.videoTrack);

      this.ready = true;
      log.debug('Initialized', {
        itemId: this.itemId,
        duration: this.duration,
        width: this.videoTrack.displayWidth,
        height: this.videoTrack.displayHeight,
      });

      return true;
    } catch (error) {
      log.error('Failed to initialize', { itemId: this.itemId, error });
      return false;
    }
  }

  /**
   * Draw a frame at the specified timestamp directly to canvas.
   * Properly manages VideoSample lifecycle by closing immediately after draw.
   */
  async drawFrame(
    ctx: OffscreenCanvasRenderingContext2D,
    timestamp: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<boolean> {
    if (!this.ready || !this.sink) {
      return false;
    }

    const maxTime = Math.max(0, this.duration - 0.001);
    const clampedTime = Math.max(0, Math.min(timestamp, maxTime));
    let videoFrame: VideoFrame | null = null;
    let lastError: unknown = this.sampleLoopError;

    try {
      await this.ensureSampleForTimestamp(clampedTime);
      const sample = this.currentSample;
      if (!sample) {
        return this.reportDrawFailure(timestamp, clampedTime, lastError);
      }

      videoFrame = sample.toVideoFrame();
      if (!videoFrame) {
        lastError = new Error('Decoded sample could not be converted to VideoFrame');
        this.sampleLoopError = lastError;
        return this.reportDrawFailure(timestamp, clampedTime, lastError);
      }

      ctx.drawImage(videoFrame, x, y, width, height);
      this.drawFailureCount = 0;
      return true;
    } catch (error) {
      lastError = error;
      this.sampleLoopError = error;
      return this.reportDrawFailure(timestamp, clampedTime, lastError);
    } finally {
      if (videoFrame) {
        try {
          videoFrame.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  private async ensureSampleForTimestamp(timestamp: number): Promise<void> {
    if (!this.sink) return;

    // Use a forward sample stream instead of samplesAtTimestamps/getSample.
    // Mediabunny's timestamp-based path can flush decoders at GOP boundaries;
    // for some files that leads to repeated "key frame required after flush".
    if (!this.sampleIterator) {
      this.resetSampleIterator(timestamp, 'init');
    } else if (
      this.lastRequestedTimestamp !== null
      && timestamp + VideoFrameExtractor.TIMESTAMP_EPSILON < this.lastRequestedTimestamp
    ) {
      // Timeline time moved backward for this clip (rare during export). Restart stream.
      this.resetSampleIterator(timestamp, 'backward');
    }

    this.lastRequestedTimestamp = timestamp;

    while (true) {
      const candidate = await this.peekNextSample();
      if (!candidate) break;
      if (candidate.timestamp <= timestamp + VideoFrameExtractor.TIMESTAMP_EPSILON) {
        this.closeSample(this.currentSample);
        this.currentSample = candidate;
        this.nextSample = null;
        continue;
      }
      break;
    }
  }

  private async peekNextSample(): Promise<MediabunnySample | null> {
    if (this.nextSample) {
      return this.nextSample;
    }
    if (!this.sampleIterator || this.iteratorDone) {
      return null;
    }

    const nextResult = await this.sampleIterator.next();
    if (nextResult.done) {
      this.iteratorDone = true;
      return null;
    }

    this.nextSample = nextResult.value;
    return this.nextSample;
  }

  private resetSampleIterator(startTimestamp: number, reason: 'init' | 'backward'): void {
    this.closeStreamState();
    if (!this.sink) return;

    if (reason === 'backward') {
      log.debug('Restarting mediabunny sample stream after backward time request', {
        itemId: this.itemId,
        startTimestamp,
      });
    }

    this.sampleIterator = this.sink.samples(startTimestamp, Infinity);
    this.iteratorDone = false;
    this.lastRequestedTimestamp = null;
  }

  private closeStreamState(): void {
    if (this.sampleIterator) {
      void this.sampleIterator.return?.();
    }
    this.sampleIterator = null;
    this.iteratorDone = true;
    this.lastRequestedTimestamp = null;
    this.sampleLoopError = null;
    this.closeSample(this.currentSample);
    this.closeSample(this.nextSample);
    this.currentSample = null;
    this.nextSample = null;
  }

  private closeSample(sample: MediabunnySample | null): void {
    if (!sample) return;
    try {
      sample.close();
    } catch {
      // Ignore close errors
    }
  }

  private reportDrawFailure(timestamp: number, clampedTime: number, error: unknown): boolean {
    this.drawFailureCount += 1;
    const shouldWarn = this.drawFailureCount <= 3 || this.drawFailureCount % 20 === 0;
    const logData = {
      itemId: this.itemId,
      timestamp,
      clampedTime,
      duration: this.duration,
      failures: this.drawFailureCount,
      error: error instanceof Error ? error.message : String(error),
    };

    if (shouldWarn) {
      log.warn('Mediabunny frame extraction failed', logData);
    } else {
      log.debug('Mediabunny frame extraction failed', logData);
    }
    return false;
  }

  /**
   * Get video dimensions
   */
  getDimensions(): { width: number; height: number } {
    if (!this.videoTrack) {
      return { width: 1920, height: 1080 };
    }
    return {
      width: this.videoTrack.displayWidth,
      height: this.videoTrack.displayHeight,
    };
  }

  /**
   * Get video duration in seconds
   */
  getDuration(): number {
    return this.duration;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.closeStreamState();

    try {
      this.input?.close();
    } catch {
      // Ignore close errors
    }
    this.sink = null;
    this.input = null;
    this.videoTrack = null;
    this.ready = false;
    this.drawFailureCount = 0;
  }
}
