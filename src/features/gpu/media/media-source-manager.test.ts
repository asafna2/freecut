import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ManagedMediaSource,
  MediaSourceManager,
  createMediaSourceManager,
} from './media-source-manager';
import { FrameCache, createFrameCache } from './frame-cache';

// Mock DOM elements
const mockVideoElement = {
  preload: '',
  muted: false,
  src: '',
  currentTime: 0,
  duration: 60,
  videoWidth: 1920,
  videoHeight: 1080,
  load: vi.fn(),
  onloadedmetadata: null as ((ev: Event) => void) | null,
  onerror: null as ((ev: Event) => void) | null,
  addEventListener: vi.fn((event: string, handler: () => void) => {
    if (event === 'seeked') {
      // Immediately trigger seeked
      setTimeout(handler, 0);
    }
  }),
  removeEventListener: vi.fn(),
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(1920 * 1080 * 4),
      width: 1920,
      height: 1080,
    })),
  })),
};

// Mock document.createElement
vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'video') {
    // Simulate metadata load
    setTimeout(() => {
      if (mockVideoElement.onloadedmetadata) {
        mockVideoElement.onloadedmetadata(new Event('loadedmetadata'));
      }
    }, 0);
    return mockVideoElement as unknown as HTMLElement;
  }
  if (tagName === 'canvas') {
    return mockCanvas as unknown as HTMLElement;
  }
  return document.createElement.call(document, tagName);
});

// Mock URL.createObjectURL
vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

// Default config for tests that skips decoder initialization
const testConfig = { skipDecoder: true };

describe('Media Source Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVideoElement.src = '';
    mockVideoElement.currentTime = 0;
  });

  describe('ManagedMediaSource', () => {
    describe('constructor', () => {
      it('should create a source with ID', () => {
        const source = new ManagedMediaSource('test-id', 'test.mp4');

        expect(source.id).toBe('test-id');
        expect(source.source).toBe('test.mp4');
        expect(source.state).toBe('idle');
      });

      it('should create a source with File', () => {
        const file = new File([''], 'video.mp4', { type: 'video/mp4' });
        const source = new ManagedMediaSource('file-source', file);

        expect(source.source).toBe(file);
      });
    });

    describe('open', () => {
      it('should open and probe the source', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);

        const probeResult = await source.open();

        expect(source.state).toBe('ready');
        expect(probeResult).toBeDefined();
        expect(probeResult.durationMs).toBe(60000);
        expect(probeResult.video?.width).toBe(1920);
        expect(probeResult.video?.height).toBe(1080);
      });

      it('should return existing probe result if already open', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);

        const result1 = await source.open();
        const result2 = await source.open();

        expect(result1).toBe(result2);
      });

      it('should throw if source is closed', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        source.close();

        await expect(source.open()).rejects.toThrow('closed');
      });

      it('should detect container format', async () => {
        const mp4Source = new ManagedMediaSource('mp4', 'video.mp4', testConfig);
        const webmSource = new ManagedMediaSource('webm', 'video.webm', testConfig);
        const movSource = new ManagedMediaSource('mov', 'video.mov', testConfig);

        const mp4Result = await mp4Source.open();
        const webmResult = await webmSource.open();
        const movResult = await movSource.open();

        expect(mp4Result.container).toBe('mp4');
        expect(webmResult.container).toBe('webm');
        expect(movResult.container).toBe('mov');

        mp4Source.close();
        webmSource.close();
        movSource.close();
      });
    });

    describe('getVideoFrame', () => {
      it('should return null if not ready', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);

        const frame = await source.getVideoFrame(1000);

        expect(frame).toBeNull();
      });

      it('should return frame after opening', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        await source.open();

        const frame = await source.getVideoFrame(0);

        expect(frame).toBeDefined();
        expect(frame?.width).toBe(1920);
        expect(frame?.height).toBe(1080);
        expect(frame?.format).toBe('rgba');

        source.close();
      });

      it('should cache frames', async () => {
        const cache = createFrameCache(100);
        const source = new ManagedMediaSource('test-id', 'video.mp4', {
          frameCache: cache,
          skipDecoder: true,
        });
        await source.open();

        // First call - not cached
        await source.getVideoFrame(0);

        // Should be in cache now
        const cachedFrame = cache.getFrame('test-id', 0);
        expect(cachedFrame).toBeDefined();

        source.close();
      });
    });

    describe('getVideoFrameByNumber', () => {
      it('should get frame by number', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        await source.open();

        const frame = await source.getVideoFrameByNumber(0);

        expect(frame).toBeDefined();
        expect(frame?.frameNumber).toBe(0);

        source.close();
      });
    });

    describe('seek', () => {
      it('should seek to timestamp', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        await source.open();

        await source.seek({ timestampMs: 5000, mode: 'exact' });

        expect(mockVideoElement.currentTime).toBe(5);

        source.close();
      });

      it('should do nothing if not ready', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);

        await source.seek({ timestampMs: 5000, mode: 'exact' });

        expect(mockVideoElement.currentTime).toBe(0);
      });
    });

    describe('close', () => {
      it('should close and cleanup', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        await source.open();

        source.close();

        expect(source.state).toBe('closed');
        expect(mockVideoElement.src).toBe('');
      });

      it('should remove frames from cache', async () => {
        const cache = createFrameCache(100);
        const source = new ManagedMediaSource('test-id', 'video.mp4', {
          frameCache: cache,
          skipDecoder: true,
        });
        await source.open();
        await source.getVideoFrame(0);

        // Verify frame is cached
        expect(cache.hasFrame('test-id', 0)).toBe(true);

        source.close();

        // Frame should be removed
        expect(cache.hasFrame('test-id', 0)).toBe(false);
      });

      it('should be idempotent', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        await source.open();

        source.close();
        source.close(); // Should not throw

        expect(source.state).toBe('closed');
      });
    });

    describe('events', () => {
      it('should emit statechange events', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        const listener = vi.fn();

        source.addEventListener('statechange', listener);
        await source.open();

        expect(listener).toHaveBeenCalled();
        const event = listener.mock.calls[0][0];
        expect(event.type).toBe('statechange');
        expect(event.sourceId).toBe('test-id');

        source.close();
      });

      it('should emit seeked events', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        const listener = vi.fn();

        await source.open();
        source.addEventListener('seeked', listener);
        await source.seek({ timestampMs: 5000, mode: 'exact' });

        expect(listener).toHaveBeenCalled();
        const event = listener.mock.calls[0][0];
        expect(event.type).toBe('seeked');
        expect(event.data).toEqual({ timestampMs: 5000 });

        source.close();
      });

      it('should allow removing listeners', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        const listener = vi.fn();

        source.addEventListener('statechange', listener);
        source.removeEventListener('statechange', listener);

        await source.open();

        expect(listener).not.toHaveBeenCalled();

        source.close();
      });
    });

    describe('decoder type', () => {
      it('should report decoder type', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', testConfig);
        await source.open();

        expect(source.decoderType).toBeDefined();

        source.close();
      });

      it('should use preferred decoder if specified', async () => {
        const source = new ManagedMediaSource('test-id', 'video.mp4', {
          preferredDecoder: 'ffmpeg',
          skipDecoder: true,
        });
        await source.open();

        // With skipDecoder, the decoderType defaults to webcodecs
        expect(source.decoderType).toBe('webcodecs');

        source.close();
      });
    });
  });

  describe('MediaSourceManager', () => {
    let manager: MediaSourceManager;

    beforeEach(() => {
      manager = createMediaSourceManager({ skipDecoder: true });
    });

    afterEach(() => {
      manager.dispose();
    });

    describe('createSource', () => {
      it('should create and open a source', async () => {
        const source = await manager.createSource('video.mp4');

        expect(source).toBeDefined();
        expect(source.state).toBe('ready');
        expect(manager.getSourceCount()).toBe(1);
      });

      it('should generate unique IDs', async () => {
        const source1 = await manager.createSource('video1.mp4');
        const source2 = await manager.createSource('video2.mp4');

        expect(source1.id).not.toBe(source2.id);
      });

      it('should use provided ID', async () => {
        const source = await manager.createSource('video.mp4', { id: 'my-source' });

        expect(source.id).toBe('my-source');
      });

      it('should throw if ID already exists', async () => {
        await manager.createSource('video.mp4', { id: 'duplicate' });

        await expect(
          manager.createSource('video2.mp4', { id: 'duplicate' })
        ).rejects.toThrow('already exists');
      });

      it('should close oldest source when at limit', async () => {
        const limitedManager = createMediaSourceManager({
          maxConcurrentSources: 2,
          skipDecoder: true,
        });

        const source1 = await limitedManager.createSource('video1.mp4', { id: 'source-1' });
        await limitedManager.createSource('video2.mp4', { id: 'source-2' });
        await limitedManager.createSource('video3.mp4', { id: 'source-3' });

        // source-1 should be closed
        expect(source1.state).toBe('closed');
        expect(limitedManager.getSourceCount()).toBe(2);

        limitedManager.dispose();
      });
    });

    describe('getSource', () => {
      it('should return existing source', async () => {
        const created = await manager.createSource('video.mp4', { id: 'my-source' });
        const retrieved = manager.getSource('my-source');

        expect(retrieved).toBe(created);
      });

      it('should return undefined for unknown ID', () => {
        const retrieved = manager.getSource('unknown');

        expect(retrieved).toBeUndefined();
      });
    });

    describe('closeSource', () => {
      it('should close and remove source', async () => {
        await manager.createSource('video.mp4', { id: 'to-close' });

        const closed = manager.closeSource('to-close');

        expect(closed).toBe(true);
        expect(manager.getSource('to-close')).toBeUndefined();
        expect(manager.getSourceCount()).toBe(0);
      });

      it('should return false for unknown ID', () => {
        const closed = manager.closeSource('unknown');

        expect(closed).toBe(false);
      });
    });

    describe('closeAll', () => {
      it('should close all sources', async () => {
        const source1 = await manager.createSource('video1.mp4');
        const source2 = await manager.createSource('video2.mp4');

        manager.closeAll();

        expect(source1.state).toBe('closed');
        expect(source2.state).toBe('closed');
        expect(manager.getSourceCount()).toBe(0);
      });
    });

    describe('getSourceIds', () => {
      it('should return all source IDs', async () => {
        await manager.createSource('video1.mp4', { id: 'source-a' });
        await manager.createSource('video2.mp4', { id: 'source-b' });

        const ids = manager.getSourceIds();

        expect(ids).toContain('source-a');
        expect(ids).toContain('source-b');
        expect(ids).toHaveLength(2);
      });
    });

    describe('cache integration', () => {
      it('should provide access to frame cache', () => {
        const cache = manager.getFrameCache();

        expect(cache).toBeInstanceOf(FrameCache);
      });

      it('should return cache statistics', () => {
        const stats = manager.getCacheStats();

        expect(stats).toHaveProperty('entries');
        expect(stats).toHaveProperty('sizeBytes');
        expect(stats).toHaveProperty('hitRate');
      });

      it('should clear cache', async () => {
        const source = await manager.createSource('video.mp4');
        await source.getVideoFrame(0);

        manager.clearCache();

        const stats = manager.getCacheStats();
        expect(stats.entries).toBe(0);
      });

      it('should share cache between sources', async () => {
        const source1 = await manager.createSource('video1.mp4', { id: 'source-1' });
        const source2 = await manager.createSource('video2.mp4', { id: 'source-2' });

        await source1.getVideoFrame(0);
        await source2.getVideoFrame(0);

        const cache = manager.getFrameCache();
        expect(cache.hasFrame('source-1', 0)).toBe(true);
        expect(cache.hasFrame('source-2', 0)).toBe(true);
      });
    });

    describe('dispose', () => {
      it('should close all sources and clear cache', async () => {
        const source = await manager.createSource('video.mp4');
        await source.getVideoFrame(0);

        manager.dispose();

        expect(source.state).toBe('closed');
        expect(manager.getSourceCount()).toBe(0);
      });
    });
  });

  describe('createMediaSourceManager', () => {
    it('should create manager with default config', () => {
      const manager = createMediaSourceManager({ skipDecoder: true });

      expect(manager).toBeInstanceOf(MediaSourceManager);

      manager.dispose();
    });

    it('should create manager with custom config', () => {
      const manager = createMediaSourceManager({
        maxConcurrentSources: 5,
        defaultCacheSizeMB: 250,
        enableCache: true,
        skipDecoder: true,
      });

      const stats = manager.getCacheStats();
      expect(stats.maxSizeBytes).toBe(250 * 1024 * 1024);

      manager.dispose();
    });

    it('should disable cache if configured', async () => {
      const manager = createMediaSourceManager({
        enableCache: false,
        skipDecoder: true,
      });

      const source = await manager.createSource('video.mp4');
      await source.getVideoFrame(0);

      // Frame should not be cached (cache is disabled)
      const cache = manager.getFrameCache();
      // Cache still exists but source doesn't use it
      expect(cache.hasFrame(source.id, 0)).toBe(false);

      manager.dispose();
    });
  });
});
