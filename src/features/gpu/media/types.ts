/**
 * Media Layer Types
 *
 * Core type definitions for the hybrid media decoding system.
 */

import type { VideoCodec, AudioCodec, DecoderPath } from './codec-support';

/**
 * Media source state
 */
export type MediaSourceState = 'idle' | 'loading' | 'ready' | 'error' | 'closed';

/**
 * Decoded frame pixel format
 */
export type PixelFormat = 'rgba' | 'rgb' | 'yuv420' | 'yuv422' | 'yuv444' | 'nv12';

/**
 * Probe result from format detection
 */
export interface ProbeResult {
  /** Container format (mp4, webm, mov, etc.) */
  container: string;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Video track info (if present) */
  video?: VideoTrackInfo;
  /** Audio track info (if present) */
  audio?: AudioTrackInfo;
  /** Additional metadata */
  metadata?: Record<string, string>;
}

/**
 * Video track information
 */
export interface VideoTrackInfo {
  /** Detected video codec */
  codec: VideoCodec;
  /** Raw codec string from container */
  codecString: string;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Frame rate (fps) */
  frameRate: number;
  /** Pixel aspect ratio (1.0 for square pixels) */
  pixelAspectRatio: number;
  /** Bitrate in bits per second (if available) */
  bitrate?: number;
  /** Total frame count (if available) */
  frameCount?: number;
  /** Recommended decoder path */
  decoderPath: DecoderPath;
}

/**
 * Audio track information
 */
export interface AudioTrackInfo {
  /** Detected audio codec */
  codec: AudioCodec;
  /** Raw codec string from container */
  codecString: string;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Bits per sample (for PCM) */
  bitsPerSample?: number;
  /** Bitrate in bits per second (if available) */
  bitrate?: number;
  /** Recommended decoder path */
  decoderPath: DecoderPath;
}

/**
 * Decoded video frame
 */
export interface DecodedVideoFrame {
  /** Frame number (0-indexed) */
  frameNumber: number;
  /** Presentation timestamp in milliseconds */
  timestampMs: number;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Pixel format */
  format: PixelFormat;
  /**
   * Frame data - one of:
   * - VideoFrame (WebCodecs)
   * - ImageBitmap
   * - Uint8Array (raw pixels)
   */
  data: VideoFrame | ImageBitmap | Uint8Array;
  /** Duration of this frame in milliseconds */
  durationMs: number;
  /** Whether this is a keyframe */
  isKeyframe: boolean;
  /** Source decoder that produced this frame */
  source: DecoderPath;
}

/**
 * Decoded audio samples
 */
export interface DecodedAudioSamples {
  /** Timestamp in milliseconds */
  timestampMs: number;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Audio data (planar float32) */
  data: Float32Array[];
  /** Number of samples per channel */
  sampleCount: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Seek target specification
 */
export interface SeekTarget {
  /** Target time in milliseconds */
  timestampMs: number;
  /** Seek mode */
  mode: 'exact' | 'keyframe' | 'fast';
}

/**
 * Decoder configuration
 */
export interface DecoderConfig {
  /** Video configuration */
  video?: VideoDecoderConfig;
  /** Audio configuration */
  audio?: AudioDecoderConfig;
}

/**
 * Video decoder configuration
 */
export interface VideoDecoderConfig {
  /** Codec string for initialization */
  codec: string;
  /** Coded width */
  codedWidth: number;
  /** Coded height */
  codedHeight: number;
  /** Display width (may differ from coded) */
  displayWidth?: number;
  /** Display height */
  displayHeight?: number;
  /** Color space info */
  colorSpace?: VideoColorSpaceInit;
  /** Hardware acceleration preference */
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
  /** Codec-specific data (e.g., SPS/PPS for H.264) */
  description?: ArrayBuffer;
}

/**
 * Audio decoder configuration
 */
export interface AudioDecoderConfig {
  /** Codec string */
  codec: string;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  numberOfChannels: number;
  /** Codec-specific data */
  description?: ArrayBuffer;
}

/**
 * Encoded video chunk
 */
export interface EncodedVideoChunk {
  /** Chunk type */
  type: 'key' | 'delta';
  /** Timestamp in microseconds */
  timestamp: number;
  /** Duration in microseconds */
  duration?: number;
  /** Encoded data */
  data: ArrayBuffer;
}

/**
 * Encoded audio chunk
 */
export interface EncodedAudioChunk {
  /** Chunk type */
  type: 'key' | 'delta';
  /** Timestamp in microseconds */
  timestamp: number;
  /** Duration in microseconds */
  duration?: number;
  /** Encoded data */
  data: ArrayBuffer;
}

/**
 * Media decoder interface
 */
export interface MediaDecoder {
  /** Decoder type */
  readonly type: DecoderPath;
  /** Current state */
  readonly state: 'unconfigured' | 'configured' | 'closed';

  /** Check if decoder can handle this codec */
  canDecode(codec: VideoCodec | AudioCodec): boolean;

  /** Configure the decoder */
  configure(config: DecoderConfig): Promise<void>;

  /** Decode a video chunk */
  decodeVideo(chunk: EncodedVideoChunk): Promise<DecodedVideoFrame>;

  /** Decode an audio chunk */
  decodeAudio(chunk: EncodedAudioChunk): Promise<DecodedAudioSamples>;

  /** Seek to a position */
  seek(target: SeekTarget): Promise<void>;

  /** Flush pending frames */
  flush(): Promise<void>;

  /** Reset the decoder */
  reset(): void;

  /** Close and release resources */
  close(): void;
}

/**
 * Media source interface
 */
export interface MediaSource {
  /** Unique source ID */
  readonly id: string;
  /** Source file/URL */
  readonly source: File | string;
  /** Current state */
  readonly state: MediaSourceState;
  /** Probe result (available after open) */
  readonly probeResult: ProbeResult | null;
  /** Active decoder type */
  readonly decoderType: DecoderPath;

  /** Open the source and probe format */
  open(): Promise<ProbeResult>;

  /** Get a video frame at the specified time */
  getVideoFrame(timestampMs: number): Promise<DecodedVideoFrame | null>;

  /** Get a video frame by frame number */
  getVideoFrameByNumber(frameNumber: number): Promise<DecodedVideoFrame | null>;

  /** Get audio samples for a time range */
  getAudioSamples(startMs: number, durationMs: number): Promise<DecodedAudioSamples | null>;

  /** Seek to a position */
  seek(target: SeekTarget): Promise<void>;

  /** Close the source */
  close(): void;
}

/**
 * Frame request for batch operations
 */
export interface FrameRequest {
  /** Source ID */
  sourceId: string;
  /** Frame number or timestamp */
  frame: number | { timestampMs: number };
  /** Priority (higher = more urgent) */
  priority: number;
}

/**
 * Frame cache entry
 */
export interface FrameCacheEntry {
  /** Cache key */
  key: string;
  /** Decoded frame */
  frame: DecodedVideoFrame;
  /** Entry size in bytes */
  sizeBytes: number;
  /** Last access timestamp */
  lastAccess: number;
  /** Access count */
  accessCount: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries in cache */
  entries: number;
  /** Total size in bytes */
  sizeBytes: number;
  /** Maximum size in bytes */
  maxSizeBytes: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Eviction count */
  evictions: number;
  /** Hit rate (0-1) */
  hitRate: number;
}

/**
 * Prefetch configuration
 */
export interface PrefetchConfig {
  /** Number of frames to prefetch ahead */
  aheadFrames: number;
  /** Number of frames to keep behind */
  behindFrames: number;
  /** Maximum concurrent decode operations */
  maxConcurrent: number;
  /** Priority for prefetch requests */
  priority: number;
}

/**
 * Event types for media sources
 */
export type MediaEventType =
  | 'statechange'
  | 'progress'
  | 'error'
  | 'frameready'
  | 'seeked'
  | 'ended';

/**
 * Media event
 */
export interface MediaEvent {
  type: MediaEventType;
  sourceId: string;
  timestamp: number;
  data?: unknown;
}

/**
 * Media event listener
 */
export type MediaEventListener = (event: MediaEvent) => void;
