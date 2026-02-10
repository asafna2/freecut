import { describe, it, expect, beforeEach } from 'vitest';
import { ResourcePool, TextureDescriptor } from './resource-pool';

describe('ResourcePool', () => {
  let pool: ResourcePool;

  beforeEach(() => {
    pool = new ResourcePool();
  });

  describe('texture acquisition', () => {
    it('should acquire a new texture', () => {
      const desc: TextureDescriptor = {
        width: 1920,
        height: 1080,
        format: 'rgba8unorm',
      };

      const handle = pool.acquire(desc);

      expect(handle).toBeDefined();
      expect(handle.id).toBeDefined();
      expect(handle.width).toBe(1920);
      expect(handle.height).toBe(1080);
    });

    it('should assign unique IDs', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      const h1 = pool.acquire(desc);
      const h2 = pool.acquire(desc);

      expect(h1.id).not.toBe(h2.id);
    });
  });

  describe('texture release and reuse', () => {
    it('should release textures back to pool', () => {
      const desc: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm' };

      const handle = pool.acquire(desc);
      pool.release(handle);

      expect(pool.getAvailableCount(desc)).toBe(1);
    });

    it('should reuse released textures with matching dimensions', () => {
      const desc: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm' };

      const h1 = pool.acquire(desc);
      const originalId = h1.id;
      pool.release(h1);

      const h2 = pool.acquire(desc);

      // Should reuse the same texture
      expect(h2.id).toBe(originalId);
      expect(pool.getAvailableCount(desc)).toBe(0);
    });

    it('should not reuse textures with different dimensions', () => {
      const desc1: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm' };
      const desc2: TextureDescriptor = { width: 1280, height: 720, format: 'rgba8unorm' };

      const h1 = pool.acquire(desc1);
      pool.release(h1);

      const h2 = pool.acquire(desc2);

      expect(h2.id).not.toBe(h1.id);
    });

    it('should not reuse textures with different formats', () => {
      const desc1: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm' };
      const desc2: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba16float' };

      const h1 = pool.acquire(desc1);
      pool.release(h1);

      const h2 = pool.acquire(desc2);

      expect(h2.id).not.toBe(h1.id);
    });
  });

  describe('statistics', () => {
    it('should track total allocations', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      pool.acquire(desc);
      pool.acquire(desc);
      pool.acquire(desc);

      expect(pool.getTotalAllocations()).toBe(3);
    });

    it('should track reuse count', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      const h1 = pool.acquire(desc);
      pool.release(h1);
      pool.acquire(desc); // Reuse

      expect(pool.getReuseCount()).toBe(1);
    });

    it('should report pool size', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      const h1 = pool.acquire(desc);
      const h2 = pool.acquire(desc);
      pool.release(h1);
      pool.release(h2);

      expect(pool.getPoolSize()).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should clear all textures', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      pool.acquire(desc);
      pool.acquire(desc);
      pool.clear();

      expect(pool.getPoolSize()).toBe(0);
      expect(pool.getTotalAllocations()).toBe(0);
    });

    it('should reset statistics on clear', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      const h = pool.acquire(desc);
      pool.release(h);
      pool.acquire(desc);
      pool.clear();

      expect(pool.getReuseCount()).toBe(0);
    });
  });

  describe('frame management', () => {
    it('should track in-use textures per frame', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      pool.beginFrame();
      pool.acquire(desc);
      pool.acquire(desc);

      expect(pool.getInUseCount()).toBe(2);
    });

    it('should release frame textures on endFrame', () => {
      const desc: TextureDescriptor = { width: 100, height: 100, format: 'rgba8unorm' };

      pool.beginFrame();
      pool.acquire(desc);
      pool.acquire(desc);
      pool.endFrame();

      expect(pool.getInUseCount()).toBe(0);
      expect(pool.getPoolSize()).toBe(2);
    });
  });
});
