/**
 * WebCodecs Decoder
 *
 * Fast path decoder using browser's native WebCodecs API.
 * Supports H.264, VP8, VP9, AV1 with hardware acceleration.
 */

import type {
  MediaDecoder,
  DecoderConfig,
  DecodedVideoFrame,
  DecodedAudioSamples,
  EncodedVideoChunk,
  EncodedAudioChunk,
  SeekTarget,
  VideoDecoderConfig,
  AudioDecoderConfig,
} from './types';
import type { VideoCodec, AudioCodec, DecoderPath } from './codec-support';
import { getVideoDecoderPath, getAudioDecoderPath } from './codec-support';

/**
 * WebCodecs decoder state
 */
type WebCodecsState = 'unconfigured' | 'configured' | 'closed';

/**
 * Pending frame in decode queue
 */
interface PendingFrame {
  resolve: (frame: DecodedVideoFrame) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Pending audio in decode queue
 */
interface PendingAudio {
  resolve: (samples: DecodedAudioSamples) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * WebCodecs-based media decoder
 */
export class WebCodecsDecoder implements MediaDecoder {
  readonly type: DecoderPath = 'webcodecs';

  private _state: WebCodecsState = 'unconfigured';
  private videoDecoder: VideoDecoder | null = null;
  private audioDecoder: AudioDecoder | null = null;

  private pendingVideoFrames: Map<number, PendingFrame> = new Map();
  private pendingAudioSamples: Map<number, PendingAudio> = new Map();

  private frameCounter = 0;
  private lastKeyframeTimestamp = 0;

  get state(): WebCodecsState {
    return this._state;
  }

  /**
   * Check if this decoder can handle the codec
   */
  canDecode(codec: VideoCodec | AudioCodec): boolean {
    // Check if it's a video codec
    if (['h264', 'h265', 'vp8', 'vp9', 'av1', 'prores', 'dnxhd', 'mjpeg', 'mpeg2', 'mpeg4', 'theora', 'unknown'].includes(codec)) {
      return getVideoDecoderPath(codec as VideoCodec) === 'webcodecs';
    }

    // Check if it's an audio codec
    return getAudioDecoderPath(codec as AudioCodec) === 'webcodecs';
  }

  /**
   * Configure the decoder
   */
  async configure(config: DecoderConfig): Promise<void> {
    if (this._state === 'closed') {
      throw new Error('Decoder is closed');
    }

    // Configure video decoder
    if (config.video) {
      await this.configureVideoDecoder(config.video);
    }

    // Configure audio decoder
    if (config.audio) {
      await this.configureAudioDecoder(config.audio);
    }

    this._state = 'configured';
  }

  /**
   * Configure video decoder
   */
  private async configureVideoDecoder(config: VideoDecoderConfig): Promise<void> {
    // Check if VideoDecoder is available
    if (typeof VideoDecoder === 'undefined') {
      throw new Error('VideoDecoder not available');
    }

    // Check codec support
    const support = await VideoDecoder.isConfigSupported({
      codec: config.codec,
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight,
      hardwareAcceleration: config.hardwareAcceleration,
    });

    if (!support.supported) {
      throw new Error(`Codec not supported: ${config.codec}`);
    }

    // Create decoder
    this.videoDecoder = new VideoDecoder({
      output: (frame) => this.handleVideoFrame(frame),
      error: (error) => this.handleVideoError(error),
    });

    // Configure with supported config
    this.videoDecoder.configure({
      codec: config.codec,
      codedWidth: config.codedWidth,
      codedHeight: config.codedHeight,
      displayWidth: config.displayWidth,
      displayHeight: config.displayHeight,
      colorSpace: config.colorSpace,
      hardwareAcceleration: config.hardwareAcceleration ?? 'prefer-hardware',
      description: config.description ? new Uint8Array(config.description) : undefined,
    });
  }

  /**
   * Configure audio decoder
   */
  private async configureAudioDecoder(config: AudioDecoderConfig): Promise<void> {
    // Check if AudioDecoder is available
    if (typeof AudioDecoder === 'undefined') {
      throw new Error('AudioDecoder not available');
    }

    // Check codec support
    const support = await AudioDecoder.isConfigSupported({
      codec: config.codec,
      sampleRate: config.sampleRate,
      numberOfChannels: config.numberOfChannels,
    });

    if (!support.supported) {
      throw new Error(`Audio codec not supported: ${config.codec}`);
    }

    // Create decoder
    this.audioDecoder = new AudioDecoder({
      output: (data) => this.handleAudioData(data),
      error: (error) => this.handleAudioError(error),
    });

    // Configure
    this.audioDecoder.configure({
      codec: config.codec,
      sampleRate: config.sampleRate,
      numberOfChannels: config.numberOfChannels,
      description: config.description ? new Uint8Array(config.description) : undefined,
    });
  }

  /**
   * Decode a video chunk
   */
  async decodeVideo(chunk: EncodedVideoChunk): Promise<DecodedVideoFrame> {
    if (this._state !== 'configured' || !this.videoDecoder) {
      throw new Error('Video decoder not configured');
    }

    return new Promise((resolve, reject) => {
      // Store pending frame
      this.pendingVideoFrames.set(chunk.timestamp, {
        resolve,
        reject,
        timestamp: chunk.timestamp,
      });

      // Track keyframes
      if (chunk.type === 'key') {
        this.lastKeyframeTimestamp = chunk.timestamp;
      }

      // Create and decode EncodedVideoChunk
      const encodedChunk = new EncodedVideoChunk({
        type: chunk.type,
        timestamp: chunk.timestamp,
        duration: chunk.duration,
        data: chunk.data,
      });

      try {
        this.videoDecoder!.decode(encodedChunk);
      } catch (error) {
        this.pendingVideoFrames.delete(chunk.timestamp);
        reject(error);
      }
    });
  }

  /**
   * Decode an audio chunk
   */
  async decodeAudio(chunk: EncodedAudioChunk): Promise<DecodedAudioSamples> {
    if (this._state !== 'configured' || !this.audioDecoder) {
      throw new Error('Audio decoder not configured');
    }

    return new Promise((resolve, reject) => {
      // Store pending audio
      this.pendingAudioSamples.set(chunk.timestamp, {
        resolve,
        reject,
        timestamp: chunk.timestamp,
      });

      // Create and decode EncodedAudioChunk
      const encodedChunk = new EncodedAudioChunk({
        type: chunk.type,
        timestamp: chunk.timestamp,
        duration: chunk.duration,
        data: chunk.data,
      });

      try {
        this.audioDecoder!.decode(encodedChunk);
      } catch (error) {
        this.pendingAudioSamples.delete(chunk.timestamp);
        reject(error);
      }
    });
  }

  /**
   * Handle decoded video frame
   */
  private handleVideoFrame(frame: VideoFrame): void {
    const timestamp = frame.timestamp ?? 0;
    const pending = this.pendingVideoFrames.get(timestamp);

    if (pending) {
      this.pendingVideoFrames.delete(timestamp);

      const decodedFrame: DecodedVideoFrame = {
        frameNumber: this.frameCounter++,
        timestampMs: timestamp / 1000, // Convert microseconds to ms
        width: frame.displayWidth,
        height: frame.displayHeight,
        format: 'rgba', // VideoFrame handles format internally
        data: frame,
        durationMs: (frame.duration ?? 0) / 1000,
        isKeyframe: timestamp === this.lastKeyframeTimestamp,
        source: 'webcodecs',
      };

      pending.resolve(decodedFrame);
    } else {
      // Frame not expected, close it
      frame.close();
    }
  }

  /**
   * Handle video decoder error
   */
  private handleVideoError(error: Error): void {
    // Reject all pending frames
    for (const [timestamp, pending] of this.pendingVideoFrames) {
      pending.reject(error);
      this.pendingVideoFrames.delete(timestamp);
    }
  }

  /**
   * Handle decoded audio data
   */
  private handleAudioData(data: AudioData): void {
    const timestamp = data.timestamp ?? 0;
    const pending = this.pendingAudioSamples.get(timestamp);

    if (pending) {
      this.pendingAudioSamples.delete(timestamp);

      // Extract audio samples
      const channels = data.numberOfChannels;
      const sampleCount = data.numberOfFrames;
      const planarData: Float32Array[] = [];

      for (let ch = 0; ch < channels; ch++) {
        const channelData = new Float32Array(sampleCount);
        data.copyTo(channelData, { planeIndex: ch, format: 'f32-planar' });
        planarData.push(channelData);
      }

      const samples: DecodedAudioSamples = {
        timestampMs: timestamp / 1000,
        sampleRate: data.sampleRate,
        channels,
        data: planarData,
        sampleCount,
        durationMs: (data.duration ?? 0) / 1000,
      };

      data.close();
      pending.resolve(samples);
    } else {
      data.close();
    }
  }

  /**
   * Handle audio decoder error
   */
  private handleAudioError(error: Error): void {
    for (const [timestamp, pending] of this.pendingAudioSamples) {
      pending.reject(error);
      this.pendingAudioSamples.delete(timestamp);
    }
  }

  /**
   * Seek to a position
   */
  async seek(target: SeekTarget): Promise<void> {
    void target;
    // Reset decoder state for seek
    await this.flush();
    this.frameCounter = 0;
  }

  /**
   * Flush pending frames
   */
  async flush(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.videoDecoder && this.videoDecoder.state === 'configured') {
      promises.push(this.videoDecoder.flush());
    }

    if (this.audioDecoder && this.audioDecoder.state === 'configured') {
      promises.push(this.audioDecoder.flush());
    }

    await Promise.all(promises);
  }

  /**
   * Reset the decoder
   */
  reset(): void {
    if (this.videoDecoder && this.videoDecoder.state === 'configured') {
      this.videoDecoder.reset();
    }

    if (this.audioDecoder && this.audioDecoder.state === 'configured') {
      this.audioDecoder.reset();
    }

    this.pendingVideoFrames.clear();
    this.pendingAudioSamples.clear();
    this.frameCounter = 0;
    this._state = 'unconfigured';
  }

  /**
   * Close and release resources
   */
  close(): void {
    if (this.videoDecoder) {
      this.videoDecoder.close();
      this.videoDecoder = null;
    }

    if (this.audioDecoder) {
      this.audioDecoder.close();
      this.audioDecoder = null;
    }

    this.pendingVideoFrames.clear();
    this.pendingAudioSamples.clear();
    this._state = 'closed';
  }

  /**
   * Get decoder queue size
   */
  getQueueSize(): { video: number; audio: number } {
    return {
      video: this.videoDecoder?.decodeQueueSize ?? 0,
      audio: this.audioDecoder?.decodeQueueSize ?? 0,
    };
  }

  /**
   * Check if decoder is hardware accelerated
   */
  isHardwareAccelerated(): boolean {
    // WebCodecs doesn't expose this directly, but we assume hardware
    // acceleration when available since we request it
    return true;
  }
}

/**
 * Create a new WebCodecs decoder
 */
export function createWebCodecsDecoder(): WebCodecsDecoder {
  return new WebCodecsDecoder();
}

/**
 * Check if WebCodecs is available
 */
export function isWebCodecsAvailable(): boolean {
  return typeof VideoDecoder !== 'undefined' || typeof AudioDecoder !== 'undefined';
}

/**
 * Get WebCodecs codec string for a video codec
 */
export function getWebCodecsVideoCodec(codec: VideoCodec, profile?: string): string | null {
  switch (codec) {
    case 'h264':
      return profile ?? 'avc1.42E01E'; // Baseline Profile Level 3.0
    case 'h265':
      return profile ?? 'hvc1.1.6.L93.B0';
    case 'vp8':
      return 'vp8';
    case 'vp9':
      return profile ?? 'vp09.00.10.08';
    case 'av1':
      return profile ?? 'av01.0.04M.08';
    default:
      return null;
  }
}

/**
 * Get WebCodecs codec string for an audio codec
 */
export function getWebCodecsAudioCodec(codec: AudioCodec): string | null {
  switch (codec) {
    case 'aac':
      return 'mp4a.40.2';
    case 'mp3':
      return 'mp3';
    case 'opus':
      return 'opus';
    case 'vorbis':
      return 'vorbis';
    case 'flac':
      return 'flac';
    default:
      return null;
  }
}
