/**
 * Media Source Manager
 *
 * Unified interface for media file handling, format probing,
 * decoder selection, and frame retrieval.
 */

import type {
  MediaSource,
  MediaSourceState,
  ProbeResult,
  DecodedVideoFrame,
  DecodedAudioSamples,
  SeekTarget,
  MediaEventType,
  MediaEvent,
  MediaEventListener,
} from './types';
import type { DecoderPath, VideoCodec, AudioCodec } from './codec-support';
import {
  getVideoDecoderPath,
  getAudioDecoderPath,
} from './codec-support';
import { WebCodecsDecoder, createWebCodecsDecoder } from './webcodecs-decoder';
import { FFmpegDecoder, createFFmpegDecoder } from './ffmpeg-decoder';
import { FrameCache, createFrameCache } from './frame-cache';

/**
 * Media source configuration
 */
interface MediaSourceConfig {
  /** Frame cache to use (shared across sources) */
  frameCache?: FrameCache;
  /** Preferred decoder path */
  preferredDecoder?: DecoderPath;
  /** Enable hardware acceleration */
  hardwareAcceleration?: boolean;
  /** Skip decoder initialization (for testing) */
  skipDecoder?: boolean;
}

/**
 * Media source manager configuration
 */
interface MediaSourceManagerConfig {
  /** Maximum number of concurrent sources */
  maxConcurrentSources?: number;
  /** Default frame cache size in MB */
  defaultCacheSizeMB?: number;
  /** Enable global frame cache */
  enableCache?: boolean;
  /** Preferred decoder path */
  preferredDecoder?: DecoderPath;
  /** Skip decoder initialization (for testing) */
  skipDecoder?: boolean;
}

/**
 * Managed media source implementation
 */
export class ManagedMediaSource implements MediaSource {
  readonly id: string;
  readonly source: File | string;

  private _state: MediaSourceState = 'idle';
  private _probeResult: ProbeResult | null = null;
  private _decoderType: DecoderPath = 'webcodecs';

  private decoder: WebCodecsDecoder | FFmpegDecoder | null = null;
  private frameCache: FrameCache | null = null;
  private listeners: Map<MediaEventType, Set<MediaEventListener>> = new Map();
  private videoElement: HTMLVideoElement | null = null;
  private config: MediaSourceConfig;

  constructor(id: string, source: File | string, config: MediaSourceConfig = {}) {
    this.id = id;
    this.source = source;
    this.config = config;
    this.frameCache = config.frameCache ?? null;
  }

  get state(): MediaSourceState {
    return this._state;
  }

  get probeResult(): ProbeResult | null {
    return this._probeResult;
  }

  get decoderType(): DecoderPath {
    return this._decoderType;
  }

  /**
   * Open the source and probe format
   */
  async open(): Promise<ProbeResult> {
    if (this._state === 'ready') {
      return this._probeResult!;
    }

    if (this._state === 'loading') {
      throw new Error('Source is already loading');
    }

    if (this._state === 'closed') {
      throw new Error('Source is closed');
    }

    this.setState('loading');

    try {
      // Create video element for probing
      this.videoElement = document.createElement('video');
      this.videoElement.preload = 'metadata';
      this.videoElement.muted = true;

      // Load metadata
      const probeResult = await this.probeFormat();
      this._probeResult = probeResult;

      // Select and configure decoder
      await this.selectDecoder(probeResult);

      this.setState('ready');
      return probeResult;
    } catch (error) {
      this.setState('error');
      throw error;
    }
  }

  /**
   * Get a video frame at the specified time
   */
  async getVideoFrame(timestampMs: number): Promise<DecodedVideoFrame | null> {
    if (this._state !== 'ready' || !this._probeResult?.video) {
      return null;
    }

    const frameRate = this._probeResult.video.frameRate;
    const frameNumber = Math.floor(timestampMs * frameRate / 1000);

    return this.getVideoFrameByNumber(frameNumber);
  }

  /**
   * Get a video frame by frame number
   */
  async getVideoFrameByNumber(frameNumber: number): Promise<DecodedVideoFrame | null> {
    if (this._state !== 'ready' || !this._probeResult?.video) {
      return null;
    }

    // Check cache first
    if (this.frameCache) {
      const cached = this.frameCache.getFrame(this.id, frameNumber);
      if (cached) {
        return cached;
      }
    }

    // Decode frame
    const frame = await this.decodeVideoFrame(frameNumber);

    // Store in cache
    if (frame && this.frameCache) {
      this.frameCache.setFrame(this.id, frame);
    }

    return frame;
  }

  /**
   * Get audio samples for a time range
   */
  async getAudioSamples(
    startMs: number,
    durationMs: number
  ): Promise<DecodedAudioSamples | null> {
    void startMs;
    void durationMs;
    if (this._state !== 'ready' || !this._probeResult?.audio) {
      return null;
    }

    // Audio is typically handled through AudioContext
    // This is a placeholder for the audio decoding pipeline
    return null;
  }

  /**
   * Seek to a position
   */
  async seek(target: SeekTarget): Promise<void> {
    if (this._state !== 'ready') {
      return;
    }

    if (this.videoElement) {
      this.videoElement.currentTime = target.timestampMs / 1000;
      await new Promise<void>((resolve) => {
        const handler = () => {
          this.videoElement?.removeEventListener('seeked', handler);
          resolve();
        };
        this.videoElement?.addEventListener('seeked', handler);
      });
    }

    if (this.decoder) {
      await this.decoder.seek(target);
    }

    this.emitEvent('seeked', { timestampMs: target.timestampMs });
  }

  /**
   * Close the source
   */
  close(): void {
    if (this._state === 'closed') {
      return;
    }

    // Close decoder
    if (this.decoder) {
      this.decoder.close();
      this.decoder = null;
    }

    // Release video element
    if (this.videoElement) {
      this.videoElement.src = '';
      this.videoElement.load();
      this.videoElement = null;
    }

    // Remove frames from cache
    if (this.frameCache) {
      this.frameCache.removeSource(this.id);
    }

    this.setState('closed');
  }

  /**
   * Subscribe to events
   */
  addEventListener(type: MediaEventType, listener: MediaEventListener): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  /**
   * Unsubscribe from events
   */
  removeEventListener(type: MediaEventType, listener: MediaEventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  /**
   * Probe media format using video element
   */
  private async probeFormat(): Promise<ProbeResult> {
    const video = this.videoElement!;

    // Set source
    if (this.source instanceof File) {
      video.src = URL.createObjectURL(this.source);
    } else {
      video.src = this.source;
    }

    // Wait for metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load media'));
    });

    // Extract probe result
    const durationMs = video.duration * 1000;
    const container = this.detectContainer();

    // Try to detect codecs from MIME type or container
    const videoCodec = this.detectVideoCodec();
    const audioCodec = this.detectAudioCodec();

    const result: ProbeResult = {
      container,
      durationMs,
    };

    // Add video track info
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      result.video = {
        codec: videoCodec,
        codecString: videoCodec,
        width: video.videoWidth,
        height: video.videoHeight,
        frameRate: 30, // Default, will be detected more accurately if possible
        pixelAspectRatio: 1.0,
        decoderPath: getVideoDecoderPath(videoCodec),
      };
    }

    // Add audio track info (assume audio exists if duration > 0)
    if (durationMs > 0) {
      result.audio = {
        codec: audioCodec,
        codecString: audioCodec,
        sampleRate: 48000, // Default
        channels: 2, // Default
        decoderPath: getAudioDecoderPath(audioCodec),
      };
    }

    return result;
  }

  /**
   * Detect container format from source
   */
  private detectContainer(): string {
    let filename = '';

    if (this.source instanceof File) {
      filename = this.source.name.toLowerCase();
    } else {
      const url = new URL(this.source, window.location.href);
      filename = url.pathname.toLowerCase();
    }

    if (filename.endsWith('.mp4') || filename.endsWith('.m4v')) {
      return 'mp4';
    }
    if (filename.endsWith('.webm')) {
      return 'webm';
    }
    if (filename.endsWith('.mov')) {
      return 'mov';
    }
    if (filename.endsWith('.avi')) {
      return 'avi';
    }
    if (filename.endsWith('.mkv')) {
      return 'mkv';
    }
    if (filename.endsWith('.ogv')) {
      return 'ogv';
    }

    return 'unknown';
  }

  /**
   * Detect video codec from container/MIME
   */
  private detectVideoCodec(): VideoCodec {
    const container = this.detectContainer();

    // Map common containers to likely codecs
    switch (container) {
      case 'mp4':
      case 'mov':
      case 'm4v':
        return 'h264'; // Most common
      case 'webm':
        return 'vp9'; // Most common for webm
      case 'mkv':
        return 'h264'; // Common default
      case 'ogv':
        return 'theora';
      default:
        return 'unknown';
    }
  }

  /**
   * Detect audio codec from container/MIME
   */
  private detectAudioCodec(): AudioCodec {
    const container = this.detectContainer();

    switch (container) {
      case 'mp4':
      case 'mov':
      case 'm4v':
        return 'aac';
      case 'webm':
        return 'opus';
      case 'ogv':
        return 'vorbis';
      default:
        return 'aac'; // Reasonable default
    }
  }

  /**
   * Select and configure decoder
   */
  private async selectDecoder(probeResult: ProbeResult): Promise<void> {
    if (!probeResult.video) {
      return;
    }

    // Skip decoder initialization if configured (for testing)
    if (this.config.skipDecoder) {
      this._decoderType = 'webcodecs';
      return;
    }

    // Determine decoder path
    let decoderPath = probeResult.video.decoderPath;

    // Apply preference if set
    if (this.config.preferredDecoder) {
      decoderPath = this.config.preferredDecoder;
    }

    // Check if WebCodecs is available, fall back to FFmpeg if not
    if (decoderPath === 'webcodecs' && typeof VideoDecoder === 'undefined') {
      decoderPath = 'ffmpeg';
    }

    this._decoderType = decoderPath;

    // Create decoder
    try {
      if (decoderPath === 'webcodecs') {
        this.decoder = createWebCodecsDecoder();
      } else {
        this.decoder = createFFmpegDecoder();
      }

      // Configure decoder
      await this.decoder.configure({
        video: {
          codec: probeResult.video.codecString,
          codedWidth: probeResult.video.width,
          codedHeight: probeResult.video.height,
          hardwareAcceleration: this.config.hardwareAcceleration !== false
            ? 'prefer-hardware'
            : 'prefer-software',
        },
      });
    } catch {
      // If decoder configuration fails, continue without decoder
      // Frame extraction will fall back to canvas capture
      this.decoder = null;
    }
  }

  /**
   * Decode a video frame
   */
  private async decodeVideoFrame(frameNumber: number): Promise<DecodedVideoFrame | null> {
    if (!this._probeResult?.video || !this.videoElement) {
      return null;
    }

    const frameRate = this._probeResult.video.frameRate;
    const timestampMs = (frameNumber / frameRate) * 1000;

    // Seek video element to frame time
    this.videoElement.currentTime = timestampMs / 1000;

    await new Promise<void>((resolve) => {
      const handler = () => {
        this.videoElement?.removeEventListener('seeked', handler);
        resolve();
      };
      this.videoElement?.addEventListener('seeked', handler);
    });

    // Capture frame using canvas
    const canvas = document.createElement('canvas');
    canvas.width = this._probeResult.video.width;
    canvas.height = this._probeResult.video.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    ctx.drawImage(this.videoElement, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const frame: DecodedVideoFrame = {
      frameNumber,
      timestampMs,
      width: canvas.width,
      height: canvas.height,
      format: 'rgba',
      data: new Uint8Array(imageData.data.buffer),
      durationMs: 1000 / frameRate,
      isKeyframe: true, // Canvas always gives us full frames
      source: 'webcodecs',
    };

    this.emitEvent('frameready', { frame });

    return frame;
  }

  /**
   * Set state and emit event
   */
  private setState(state: MediaSourceState): void {
    const previousState = this._state;
    this._state = state;

    if (previousState !== state) {
      this.emitEvent('statechange', { previousState, state });
    }
  }

  /**
   * Emit an event
   */
  private emitEvent(type: MediaEventType, data?: unknown): void {
    const event: MediaEvent = {
      type,
      sourceId: this.id,
      timestamp: Date.now(),
      data,
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }
}

/**
 * Media source manager
 */
export class MediaSourceManager {
  private readonly config: Required<MediaSourceManagerConfig>;
  private readonly sources: Map<string, ManagedMediaSource> = new Map();
  private readonly frameCache: FrameCache;
  private sourceCounter = 0;

  constructor(config: MediaSourceManagerConfig = {}) {
    this.config = {
      maxConcurrentSources: config.maxConcurrentSources ?? 10,
      defaultCacheSizeMB: config.defaultCacheSizeMB ?? 500,
      enableCache: config.enableCache ?? true,
      preferredDecoder: config.preferredDecoder ?? 'webcodecs',
      skipDecoder: config.skipDecoder ?? false,
    };

    this.frameCache = createFrameCache(this.config.defaultCacheSizeMB);
  }

  /**
   * Create and open a media source
   */
  async createSource(
    source: File | string,
    options: { id?: string } = {}
  ): Promise<ManagedMediaSource> {
    const id = options.id ?? `source-${++this.sourceCounter}`;

    // Check if source already exists
    if (this.sources.has(id)) {
      throw new Error(`Source with ID '${id}' already exists`);
    }

    // Check concurrent limit
    if (this.sources.size >= this.config.maxConcurrentSources) {
      // Close oldest source
      const oldestId = this.sources.keys().next().value;
      if (oldestId) {
        this.closeSource(oldestId);
      }
    }

    const managedSource = new ManagedMediaSource(id, source, {
      frameCache: this.config.enableCache ? this.frameCache : undefined,
      preferredDecoder: this.config.preferredDecoder,
      skipDecoder: this.config.skipDecoder,
    });

    this.sources.set(id, managedSource);

    // Open the source
    await managedSource.open();

    return managedSource;
  }

  /**
   * Get an existing source
   */
  getSource(id: string): ManagedMediaSource | undefined {
    return this.sources.get(id);
  }

  /**
   * Close a source
   */
  closeSource(id: string): boolean {
    const source = this.sources.get(id);

    if (!source) {
      return false;
    }

    source.close();
    this.sources.delete(id);

    return true;
  }

  /**
   * Close all sources
   */
  closeAll(): void {
    for (const source of this.sources.values()) {
      source.close();
    }
    this.sources.clear();
  }

  /**
   * Get all source IDs
   */
  getSourceIds(): string[] {
    return Array.from(this.sources.keys());
  }

  /**
   * Get number of active sources
   */
  getSourceCount(): number {
    return this.sources.size;
  }

  /**
   * Get the shared frame cache
   */
  getFrameCache(): FrameCache {
    return this.frameCache;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.frameCache.getStats();
  }

  /**
   * Clear frame cache
   */
  clearCache(): void {
    this.frameCache.clear();
  }

  /**
   * Dispose of the manager
   */
  dispose(): void {
    this.closeAll();
    this.frameCache.clear();
  }
}

/**
 * Create a media source manager
 */
export function createMediaSourceManager(
  config?: MediaSourceManagerConfig
): MediaSourceManager {
  return new MediaSourceManager(config);
}
