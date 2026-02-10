/**
 * Resource Pool
 *
 * Manages GPU texture allocation and reuse for efficient rendering.
 */

import type { TextureFormat } from '../backend/types';

/**
 * Descriptor for texture allocation
 */
export interface TextureDescriptor {
  width: number;
  height: number;
  format: TextureFormat;
}

/**
 * Handle to a pooled texture
 */
export interface PooledTexture {
  id: string;
  width: number;
  height: number;
  format: TextureFormat;
  /** Internal reference (GPU texture, canvas, etc.) */
  resource?: unknown;
}

/**
 * Key for texture bucket lookup
 */
function makeKey(desc: TextureDescriptor): string {
  return `${desc.width}x${desc.height}:${desc.format}`;
}

let textureIdCounter = 0;

/**
 * Pool for reusing GPU textures across frames
 */
export class ResourcePool {
  /** Available textures by dimension/format key */
  private available: Map<string, PooledTexture[]> = new Map();

  /** Currently in-use textures for this frame */
  private inUse: Set<string> = new Set();

  /** All allocated textures by ID */
  private allocated: Map<string, PooledTexture> = new Map();

  /** Statistics */
  private stats = {
    totalAllocations: 0,
    reuseCount: 0,
  };

  /**
   * Begin a new frame - resets in-use tracking
   */
  beginFrame(): void {
    this.inUse.clear();
  }

  /**
   * End frame - release all in-use textures back to pool
   */
  endFrame(): void {
    for (const id of this.inUse) {
      const texture = this.allocated.get(id);
      if (texture) {
        this.releaseToPool(texture);
      }
    }
    this.inUse.clear();
  }

  /**
   * Acquire a texture from the pool or create a new one
   */
  acquire(desc: TextureDescriptor): PooledTexture {
    const key = makeKey(desc);
    const bucket = this.available.get(key);

    // Try to reuse existing texture
    if (bucket && bucket.length > 0) {
      const texture = bucket.pop()!;
      this.inUse.add(texture.id);
      this.stats.reuseCount++;
      return texture;
    }

    // Allocate new texture
    const texture: PooledTexture = {
      id: `tex-${++textureIdCounter}`,
      width: desc.width,
      height: desc.height,
      format: desc.format,
    };

    this.allocated.set(texture.id, texture);
    this.inUse.add(texture.id);
    this.stats.totalAllocations++;

    return texture;
  }

  /**
   * Release a texture back to the pool for reuse
   */
  release(texture: PooledTexture): void {
    this.inUse.delete(texture.id);
    this.releaseToPool(texture);
  }

  /**
   * Internal: add texture to available pool
   */
  private releaseToPool(texture: PooledTexture): void {
    const key = makeKey({
      width: texture.width,
      height: texture.height,
      format: texture.format,
    });

    let bucket = this.available.get(key);
    if (!bucket) {
      bucket = [];
      this.available.set(key, bucket);
    }

    // Avoid duplicates
    if (!bucket.find((t) => t.id === texture.id)) {
      bucket.push(texture);
    }
  }

  /**
   * Get count of available textures matching descriptor
   */
  getAvailableCount(desc: TextureDescriptor): number {
    const key = makeKey(desc);
    return this.available.get(key)?.length ?? 0;
  }

  /**
   * Get total number of allocated textures
   */
  getTotalAllocations(): number {
    return this.stats.totalAllocations;
  }

  /**
   * Get number of texture reuses
   */
  getReuseCount(): number {
    return this.stats.reuseCount;
  }

  /**
   * Get total textures in pool (available + in-use)
   */
  getPoolSize(): number {
    return this.allocated.size;
  }

  /**
   * Get number of currently in-use textures
   */
  getInUseCount(): number {
    return this.inUse.size;
  }

  /**
   * Clear all textures and reset statistics
   */
  clear(): void {
    this.available.clear();
    this.inUse.clear();
    this.allocated.clear();
    this.stats.totalAllocations = 0;
    this.stats.reuseCount = 0;
  }

  /**
   * Get a texture by ID
   */
  getTexture(id: string): PooledTexture | undefined {
    return this.allocated.get(id);
  }

  /**
   * Check if a texture is currently in use
   */
  isInUse(id: string): boolean {
    return this.inUse.has(id);
  }
}
