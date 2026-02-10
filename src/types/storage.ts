/**
 * Storage type for media files
 * - 'handle': Uses FileSystemFileHandle (instant import, reads from user's disk)
 * - 'opfs': Uses OPFS copy (for drag-drop without handle, or imported URLs)
 */
export type MediaStorageType = 'handle' | 'opfs';

export interface MediaMetadata {
  id: string;
  /**
   * How the media file is stored
   * - 'handle': FileSystemFileHandle references user's original file (instant, no copy)
   * - 'opfs': File copied to Origin Private File System (for drag-drop, URLs)
   */
  storageType: MediaStorageType;
  /**
   * FileSystemFileHandle for direct disk access (when storageType === 'handle')
   * Stored in IndexedDB - requires permission re-request on new sessions
   */
  fileHandle?: FileSystemFileHandle;
  /**
   * OPFS path (when storageType === 'opfs')
   * Format: content/{shard1}/{shard2}/{uuid}/data
   */
  opfsPath?: string;
  /**
   * Content identifier for deduplication (hash or UUID)
   * Only computed when needed for dedup checks
   */
  contentHash?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  /**
   * Audio codec identifier (e.g., 'aac', 'ec-3', 'ac-3')
   * Only present for video files with audio tracks
   */
  audioCodec?: string;
  /**
   * Whether the audio codec is supported for waveform generation
   * false for codecs like EC-3 (Dolby Digital Plus), AC-3, DTS that can't be decoded in browser
   */
  audioCodecSupported?: boolean;
  thumbnailId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// Content record for reference counting in content-addressable storage
export interface ContentRecord {
  hash: string; // SHA-256 hash (primary key)
  fileSize: number;
  mimeType: string;
  referenceCount: number; // Number of media entries referencing this content
  createdAt: number;
}

// Project-media association for per-project media isolation
export interface ProjectMediaAssociation {
  projectId: string;
  mediaId: string;
  addedAt: number;
}

export interface ThumbnailData {
  id: string;
  mediaId: string;
  blob: Blob;
  timestamp: number;
  width: number;
  height: number;
}

// Density tier for filmstrip thumbnails
export type FilmstripDensity = 'low' | 'medium' | 'high';

// Filmstrip data for timeline video clip thumbnails
export interface FilmstripData {
  id: string; // Format: `${mediaId}:${density}`
  mediaId: string;
  density: FilmstripDensity;
  frames: Blob[]; // JPEG blobs for each frame
  timestamps: number[]; // Frame timestamps in seconds
  width: number; // Thumbnail width in pixels
  height: number; // Thumbnail height in pixels
  createdAt: number;
}

// Waveform data for timeline audio clip visualization
export interface WaveformData {
  id: string; // Same as mediaId
  mediaId: string;
  peaks: ArrayBuffer; // Float32Array as ArrayBuffer (normalized 0-1)
  duration: number; // Audio duration in seconds
  sampleRate: number; // Samples per second in peaks data
  channels: number; // Number of audio channels
  createdAt: number;
}

// GIF frame data for pre-extracted animation frames
export interface GifFrameData {
  id: string; // Same as mediaId
  mediaId: string;
  frames: Blob[]; // PNG blobs for each frame (preserves transparency)
  durations: number[]; // Per-frame delay in milliseconds
  totalDuration: number; // Total animation duration in milliseconds
  width: number; // Frame width in pixels
  height: number; // Frame height in pixels
  frameCount: number; // Total number of frames
  createdAt: number;
}
