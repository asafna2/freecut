/**
 * GPU Texture Import System
 *
 * Bridges decoded video frames to GPU textures with efficient pooling and caching.
 */

import type { DecodedVideoFrame, PixelFormat } from './types';
import type { RenderBackend, TextureHandle, TextureFormat } from '../backend/types';

/**
 * Safe type check for VideoFrame (may not exist in all environments)
 */
function isVideoFrame(data: unknown): data is VideoFrame {
  return typeof VideoFrame !== 'undefined' && data instanceof VideoFrame;
}

/**
 * Safe type check for ImageBitmap (may not exist in all environments)
 */
function isImageBitmap(data: unknown): data is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap;
}

/**
 * Imported texture handle with frame metadata
 */
export interface ImportedTexture {
  /** GPU texture handle */
  handle: TextureHandle;
  /** Source frame number */
  frameNumber: number;
  /** Frame timestamp */
  timestampMs: number;
  /** Whether the texture owns the handle (should be released when done) */
  owned: boolean;
}

/**
 * Texture pool entry
 */
interface PooledTexture {
  handle: TextureHandle;
  lastUsed: number;
  inUse: boolean;
}

/**
 * Texture importer configuration
 */
interface TextureImporterConfig {
  /** Maximum pooled textures per resolution */
  maxPooledPerSize?: number;
  /** Pool cleanup interval in ms */
  cleanupIntervalMs?: number;
  /** Max idle time before texture is released */
  maxIdleMs?: number;
  /** Whether to prefer zero-copy imports when possible */
  preferZeroCopy?: boolean;
}

/**
 * GPU Texture Importer
 *
 * Efficiently imports decoded video frames to GPU textures with pooling.
 */
export class TextureImporter {
  private readonly config: Required<TextureImporterConfig>;
  private backend: RenderBackend | null = null;
  private pools: Map<string, PooledTexture[]> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private importCount = 0;

  constructor(config: TextureImporterConfig = {}) {
    this.config = {
      maxPooledPerSize: config.maxPooledPerSize ?? 4,
      cleanupIntervalMs: config.cleanupIntervalMs ?? 5000,
      maxIdleMs: config.maxIdleMs ?? 10000,
      preferZeroCopy: config.preferZeroCopy ?? true,
    };
  }

  /**
   * Set the render backend to use
   */
  setBackend(backend: RenderBackend): void {
    this.backend = backend;
    this.startCleanup();
  }

  /**
   * Import a decoded video frame to GPU
   */
  import(frame: DecodedVideoFrame): ImportedTexture {
    if (!this.backend) {
      throw new Error('Render backend not set');
    }

    const format = this.pixelFormatToTextureFormat(frame.format);
    const { width, height, data } = frame;

    let handle: TextureHandle;
    let owned = true;

    // Try to get a pooled texture
    const pooledTexture = this.acquireFromPool(width, height, format);

    if (pooledTexture) {
      handle = pooledTexture;
      owned = false;
    }

    // Import based on data type
    // Use safe type checks for browser APIs that may not exist in all environments
    if (isVideoFrame(data)) {
      handle = this.importVideoFrame(data as VideoFrame, pooledTexture);
    } else if (isImageBitmap(data)) {
      handle = this.importImageBitmap(data as ImageBitmap, pooledTexture);
    } else if (data instanceof Uint8Array) {
      handle = this.importPixelData(data, width, height, format, pooledTexture);
    } else {
      throw new Error(`Unsupported frame data type: ${typeof data}`);
    }

    this.importCount++;

    return {
      handle,
      frameNumber: frame.frameNumber,
      timestampMs: frame.timestampMs,
      owned,
    };
  }

  /**
   * Release an imported texture back to the pool
   */
  release(texture: ImportedTexture): void {
    if (texture.owned) {
      // Texture was created fresh, release it to pool
      this.releaseToPool(texture.handle);
    } else {
      // Texture came from pool, just mark it available
      const key = this.makePoolKey(texture.handle);
      const pool = this.pools.get(key);

      if (pool) {
        const entry = pool.find((p) => p.handle.id === texture.handle.id);
        if (entry) {
          entry.inUse = false;
          entry.lastUsed = Date.now();
        }
      }
    }
  }

  /**
   * Get import statistics
   */
  getStats(): {
    totalImports: number;
    pooledTextures: number;
    pooledInUse: number;
  } {
    let pooledTextures = 0;
    let pooledInUse = 0;

    for (const pool of this.pools.values()) {
      pooledTextures += pool.length;
      pooledInUse += pool.filter((p) => p.inUse).length;
    }

    return {
      totalImports: this.importCount,
      pooledTextures,
      pooledInUse,
    };
  }

  /**
   * Clear all pooled textures
   */
  clearPool(): void {
    for (const pool of this.pools.values()) {
      for (const entry of pool) {
        this.destroyTexture(entry.handle);
      }
    }
    this.pools.clear();
  }

  /**
   * Dispose the importer
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clearPool();
    this.backend = null;
  }

  /**
   * Import VideoFrame directly (zero-copy when possible)
   */
  private importVideoFrame(
    frame: VideoFrame,
    existingTexture: TextureHandle | null
  ): TextureHandle {
    const backend = this.backend!;

    if (this.config.preferZeroCopy && backend.capabilities.supportsExternalTextures) {
      // Direct import (creates new texture)
      return backend.importVideoFrame(frame);
    }

    // Fall back to pixel upload
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    const handle =
      existingTexture ?? backend.createTexture(width, height, 'rgba8unorm');

    // Extract pixels from VideoFrame
    const buffer = new Uint8Array(width * height * 4);
    frame.copyTo(buffer, { rect: { x: 0, y: 0, width, height }, format: 'RGBA' });
    backend.uploadPixels(handle, buffer);

    return handle;
  }

  /**
   * Import ImageBitmap
   */
  private importImageBitmap(
    bitmap: ImageBitmap,
    existingTexture: TextureHandle | null
  ): TextureHandle {
    const backend = this.backend!;

    if (this.config.preferZeroCopy) {
      // Direct import
      return backend.importImageBitmap(bitmap);
    }

    // Fall back to pixel upload via canvas
    const { width, height } = bitmap;
    const handle =
      existingTexture ?? backend.createTexture(width, height, 'rgba8unorm');

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    backend.uploadPixels(handle, imageData.data);

    return handle;
  }

  /**
   * Import raw pixel data
   */
  private importPixelData(
    data: Uint8Array,
    width: number,
    height: number,
    format: TextureFormat,
    existingTexture: TextureHandle | null
  ): TextureHandle {
    const backend = this.backend!;
    const handle = existingTexture ?? backend.createTexture(width, height, format);
    backend.uploadPixels(handle, data);
    return handle;
  }

  /**
   * Acquire a texture from the pool
   */
  private acquireFromPool(
    width: number,
    height: number,
    format: TextureFormat
  ): TextureHandle | null {
    const key = this.makePoolKeyFromParams(width, height, format);
    const pool = this.pools.get(key);

    if (!pool) {
      return null;
    }

    // Find available texture
    const available = pool.find((p) => !p.inUse);
    if (available) {
      available.inUse = true;
      return available.handle;
    }

    return null;
  }

  /**
   * Release a texture to the pool
   */
  private releaseToPool(handle: TextureHandle): void {
    const key = this.makePoolKey(handle);
    let pool = this.pools.get(key);

    if (!pool) {
      pool = [];
      this.pools.set(key, pool);
    }

    // Check pool size
    if (pool.length >= this.config.maxPooledPerSize) {
      // Pool full, destroy oldest
      pool.sort((a, b) => a.lastUsed - b.lastUsed);
      const oldest = pool.shift()!;
      this.destroyTexture(oldest.handle);
    }

    pool.push({
      handle,
      lastUsed: Date.now(),
      inUse: false,
    });
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleTextures();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Clean up idle textures
   */
  private cleanupIdleTextures(): void {
    const now = Date.now();

    for (const [key, pool] of this.pools) {
      const toRemove: number[] = [];

      for (let i = 0; i < pool.length; i++) {
        const entry = pool[i];
        if (!entry.inUse && now - entry.lastUsed > this.config.maxIdleMs) {
          toRemove.push(i);
          this.destroyTexture(entry.handle);
        }
      }

      // Remove in reverse order to maintain indices
      for (let i = toRemove.length - 1; i >= 0; i--) {
        pool.splice(toRemove[i], 1);
      }

      // Remove empty pools
      if (pool.length === 0) {
        this.pools.delete(key);
      }
    }
  }

  /**
   * Destroy a texture through the backend
   */
  private destroyTexture(handle: TextureHandle): void {
    void handle;
    // Backend doesn't have a destroy method in the interface,
    // but WebGPU/WebGL2 backends have releaseTexture internally
    // For now, we just let the texture be garbage collected
  }

  /**
   * Make a pool key from texture handle
   */
  private makePoolKey(handle: TextureHandle): string {
    return `${handle.width}x${handle.height}_${handle.format}`;
  }

  /**
   * Make a pool key from parameters
   */
  private makePoolKeyFromParams(
    width: number,
    height: number,
    format: TextureFormat
  ): string {
    return `${width}x${height}_${format}`;
  }

  /**
   * Convert pixel format to texture format
   */
  private pixelFormatToTextureFormat(format: PixelFormat): TextureFormat {
    switch (format) {
      case 'rgba':
        return 'rgba8unorm';
      case 'rgb':
        return 'rgba8unorm'; // Expand to RGBA
      case 'yuv420':
      case 'yuv422':
      case 'yuv444':
      case 'nv12':
        return 'rgba8unorm'; // YUV needs conversion
      default:
        return 'rgba8unorm';
    }
  }
}

/**
 * Create a texture importer
 */
export function createTextureImporter(
  config?: TextureImporterConfig
): TextureImporter {
  return new TextureImporter(config);
}
