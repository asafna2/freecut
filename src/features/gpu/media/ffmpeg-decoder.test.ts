import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FFmpegDecoder,
  createFFmpegDecoder,
  loadFFmpeg,
  isFFmpegLoaded,
  unloadFFmpeg,
  getFFmpegLoadState,
  getFFmpegDownloadSize,
  canLoadFFmpeg,
  setFFmpegFactory,
  type FFmpegInstance,
} from './ffmpeg-decoder';

/**
 * Create a mock FFmpeg instance for testing
 */
function createMockFFmpegInstance(): FFmpegInstance {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    isLoaded: vi.fn().mockReturnValue(true),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockImplementation(() => {
      // Return mock RGBA frame data
      return Promise.resolve(new Uint8Array(1920 * 1080 * 4));
    }),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    exec: vi.fn().mockResolvedValue(0),
    terminate: vi.fn(),
    on: vi.fn(),
  };
}

describe('FFmpeg Decoder', () => {
  let mockFFmpeg: FFmpegInstance;

  beforeEach(() => {
    // Reset FFmpeg state before each test
    unloadFFmpeg();
    vi.clearAllMocks();

    // Set up mock factory
    mockFFmpeg = createMockFFmpegInstance();
    setFFmpegFactory(() => Promise.resolve(mockFFmpeg));
  });

  afterEach(() => {
    unloadFFmpeg();
    setFFmpegFactory(null);
  });

  describe('createFFmpegDecoder', () => {
    it('should create a decoder instance', () => {
      const decoder = createFFmpegDecoder();

      expect(decoder).toBeInstanceOf(FFmpegDecoder);
      expect(decoder.type).toBe('ffmpeg');
    });

    it('should start in unconfigured state', () => {
      const decoder = createFFmpegDecoder();

      expect(decoder.state).toBe('unconfigured');
    });
  });

  describe('canDecode', () => {
    let decoder: FFmpegDecoder;

    beforeEach(() => {
      decoder = createFFmpegDecoder();
    });

    it('should return true for ProRes', () => {
      expect(decoder.canDecode('prores')).toBe(true);
    });

    it('should return true for DNxHD', () => {
      expect(decoder.canDecode('dnxhd')).toBe(true);
    });

    it('should return true for HEVC/H.265', () => {
      expect(decoder.canDecode('h265')).toBe(true);
    });

    it('should return true for H.264', () => {
      expect(decoder.canDecode('h264')).toBe(true);
    });

    it('should return true for VP9', () => {
      expect(decoder.canDecode('vp9')).toBe(true);
    });

    it('should return true for AV1', () => {
      expect(decoder.canDecode('av1')).toBe(true);
    });

    it('should return true for AC3', () => {
      expect(decoder.canDecode('ac3')).toBe(true);
    });

    it('should return true for AAC', () => {
      expect(decoder.canDecode('aac')).toBe(true);
    });

    it('should return true for FLAC', () => {
      expect(decoder.canDecode('flac')).toBe(true);
    });
  });

  describe('FFmpeg loading', () => {
    it('should report unloaded state initially', () => {
      expect(getFFmpegLoadState()).toBe('unloaded');
      expect(isFFmpegLoaded()).toBe(false);
    });

    it('should load FFmpeg', async () => {
      await loadFFmpeg();

      expect(getFFmpegLoadState()).toBe('loaded');
      expect(isFFmpegLoaded()).toBe(true);
    });

    it('should not reload if already loaded', async () => {
      await loadFFmpeg();
      const state1 = getFFmpegLoadState();

      await loadFFmpeg();
      const state2 = getFFmpegLoadState();

      expect(state1).toBe('loaded');
      expect(state2).toBe('loaded');
    });

    it('should unload FFmpeg', async () => {
      await loadFFmpeg();
      expect(isFFmpegLoaded()).toBe(true);

      unloadFFmpeg();
      expect(isFFmpegLoaded()).toBe(false);
      expect(getFFmpegLoadState()).toBe('unloaded');
    });

    it('should report progress during load', async () => {
      const progressFn = vi.fn();

      await loadFFmpeg({ onProgress: progressFn });

      expect(progressFn).toHaveBeenCalled();
    });
  });

  describe('decoder configuration', () => {
    let decoder: FFmpegDecoder;

    beforeEach(async () => {
      decoder = createFFmpegDecoder();
    });

    afterEach(() => {
      if (decoder.state !== 'closed') {
        decoder.close();
      }
    });

    it('should configure video decoder', async () => {
      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });

      expect(decoder.state).toBe('configured');
    });

    it('should configure audio decoder', async () => {
      await decoder.configure({
        audio: {
          codec: 'ac3',
          sampleRate: 48000,
          numberOfChannels: 6,
        },
      });

      expect(decoder.state).toBe('configured');
    });

    it('should configure both video and audio', async () => {
      await decoder.configure({
        video: {
          codec: 'hevc',
          codedWidth: 3840,
          codedHeight: 2160,
        },
        audio: {
          codec: 'eac3',
          sampleRate: 48000,
          numberOfChannels: 8,
        },
      });

      expect(decoder.state).toBe('configured');
    });

    it('should auto-load FFmpeg on configure', async () => {
      expect(isFFmpegLoaded()).toBe(false);

      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });

      expect(isFFmpegLoaded()).toBe(true);
    });

    it('should throw when configuring closed decoder', async () => {
      decoder.close();

      await expect(
        decoder.configure({
          video: {
            codec: 'prores',
            codedWidth: 1920,
            codedHeight: 1080,
          },
        })
      ).rejects.toThrow('closed');
    });
  });

  describe('video decoding', () => {
    let decoder: FFmpegDecoder;

    beforeEach(async () => {
      decoder = createFFmpegDecoder();
      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });
    });

    afterEach(() => {
      decoder.close();
    });

    it('should decode video chunk', async () => {
      const chunk = {
        type: 'key' as const,
        timestamp: 0,
        duration: 33333,
        data: new ArrayBuffer(1000),
      };

      const frame = await decoder.decodeVideo(chunk);

      expect(frame.frameNumber).toBe(0);
      expect(frame.width).toBe(1920);
      expect(frame.height).toBe(1080);
      expect(frame.format).toBe('rgba');
      expect(frame.source).toBe('ffmpeg');
      expect(frame.isKeyframe).toBe(true);
    });

    it('should increment frame counter', async () => {
      const chunk1 = {
        type: 'key' as const,
        timestamp: 0,
        data: new ArrayBuffer(100),
      };

      const chunk2 = {
        type: 'delta' as const,
        timestamp: 33333,
        data: new ArrayBuffer(100),
      };

      const frame1 = await decoder.decodeVideo(chunk1);
      const frame2 = await decoder.decodeVideo(chunk2);

      expect(frame1.frameNumber).toBe(0);
      expect(frame2.frameNumber).toBe(1);
    });

    it('should use display dimensions if provided', async () => {
      decoder.close();
      decoder = createFFmpegDecoder();

      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
          displayWidth: 1920,
          displayHeight: 816, // Anamorphic
        },
      });

      const chunk = {
        type: 'key' as const,
        timestamp: 0,
        data: new ArrayBuffer(100),
      };

      const frame = await decoder.decodeVideo(chunk);

      expect(frame.width).toBe(1920);
      expect(frame.height).toBe(816);
    });

    it('should throw when decoding without configuration', async () => {
      const newDecoder = createFFmpegDecoder();

      await expect(
        newDecoder.decodeVideo({
          type: 'key',
          timestamp: 0,
          data: new ArrayBuffer(100),
        })
      ).rejects.toThrow('not configured');

      newDecoder.close();
    });

    it('should call FFmpeg exec with correct arguments', async () => {
      const chunk = {
        type: 'key' as const,
        timestamp: 0,
        data: new ArrayBuffer(100),
      };

      await decoder.decodeVideo(chunk);

      expect(mockFFmpeg.exec).toHaveBeenCalled();
      expect(mockFFmpeg.writeFile).toHaveBeenCalled();
      expect(mockFFmpeg.readFile).toHaveBeenCalled();
      expect(mockFFmpeg.deleteFile).toHaveBeenCalled();
    });
  });

  describe('audio decoding', () => {
    let decoder: FFmpegDecoder;

    beforeEach(async () => {
      // Mock audio output - 6 channels of float32 audio
      mockFFmpeg.readFile = vi.fn().mockImplementation(() => {
        const samples = 1024;
        const channels = 6;
        const audioData = new Float32Array(samples * channels);
        for (let i = 0; i < audioData.length; i++) {
          audioData[i] = Math.sin(i * 0.01);
        }
        return Promise.resolve(new Uint8Array(audioData.buffer));
      });

      decoder = createFFmpegDecoder();
      await decoder.configure({
        audio: {
          codec: 'ac3',
          sampleRate: 48000,
          numberOfChannels: 6,
        },
      });
    });

    afterEach(() => {
      decoder.close();
    });

    it('should decode audio chunk', async () => {
      const chunk = {
        type: 'key' as const,
        timestamp: 0,
        duration: 32000,
        data: new ArrayBuffer(500),
      };

      const samples = await decoder.decodeAudio(chunk);

      expect(samples.sampleRate).toBe(48000);
      expect(samples.channels).toBe(6);
      expect(samples.data).toHaveLength(6); // 6 channels
    });

    it('should throw when decoding without configuration', async () => {
      const newDecoder = createFFmpegDecoder();

      await expect(
        newDecoder.decodeAudio({
          type: 'key',
          timestamp: 0,
          data: new ArrayBuffer(100),
        })
      ).rejects.toThrow('not configured');

      newDecoder.close();
    });
  });

  describe('decoder lifecycle', () => {
    let decoder: FFmpegDecoder;

    beforeEach(() => {
      decoder = createFFmpegDecoder();
    });

    afterEach(() => {
      if (decoder.state !== 'closed') {
        decoder.close();
      }
    });

    it('should close decoder', () => {
      decoder.close();

      expect(decoder.state).toBe('closed');
    });

    it('should reset decoder state', async () => {
      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });

      expect(decoder.state).toBe('configured');

      decoder.reset();

      expect(decoder.state).toBe('unconfigured');
    });

    it('should get queue size', () => {
      const queueSize = decoder.getQueueSize();

      expect(queueSize).toEqual({ video: 0, audio: 0 });
    });

    it('should report not hardware accelerated', () => {
      expect(decoder.isHardwareAccelerated()).toBe(false);
    });

    it('should handle seek', async () => {
      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });

      // Decode a frame to increment counter
      await decoder.decodeVideo({
        type: 'key',
        timestamp: 0,
        data: new ArrayBuffer(100),
      });

      await decoder.seek({ timestampMs: 5000, mode: 'exact' });

      // Frame counter should be reset
      const frame = await decoder.decodeVideo({
        type: 'key',
        timestamp: 5000000,
        data: new ArrayBuffer(100),
      });

      expect(frame.frameNumber).toBe(0);
    });

    it('should handle flush', async () => {
      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });

      // Flush should not throw
      await expect(decoder.flush()).resolves.toBeUndefined();
    });
  });

  describe('getFFmpegDownloadSize', () => {
    it('should return approximate download size', () => {
      const size = getFFmpegDownloadSize();

      // Should be around 25MB
      expect(size).toBeGreaterThan(20 * 1024 * 1024);
      expect(size).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('canLoadFFmpeg', () => {
    it('should check for WebAssembly support', () => {
      const canLoad = canLoadFFmpeg();

      // In test environment (Node/jsdom), should return true
      expect(typeof canLoad).toBe('boolean');
    });
  });

  describe('codec argument mapping', () => {
    let decoder: FFmpegDecoder;

    beforeEach(() => {
      decoder = createFFmpegDecoder();
    });

    afterEach(() => {
      decoder.close();
    });

    it('should handle various video codec strings', async () => {
      const codecs = ['avc1.42E01E', 'hvc1.1.6.L93', 'vp09.00.10.08', 'av01.0.04M.08', 'apch', 'dnxhd'];

      for (const codec of codecs) {
        await decoder.configure({
          video: {
            codec,
            codedWidth: 1920,
            codedHeight: 1080,
          },
        });

        decoder.reset();
      }
    });

    it('should handle various audio codec strings', async () => {
      const codecs = ['mp4a.40.2', 'mp3', 'opus', 'vorbis', 'flac', 'ac-3', 'ec-3', 'alac'];

      for (const codec of codecs) {
        await decoder.configure({
          audio: {
            codec,
            sampleRate: 48000,
            numberOfChannels: 2,
          },
        });

        decoder.reset();
      }
    });
  });

  describe('error handling', () => {
    it('should handle FFmpeg exec failure', async () => {
      mockFFmpeg.exec = vi.fn().mockResolvedValue(1); // Non-zero exit code

      const decoder = createFFmpegDecoder();
      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });

      await expect(
        decoder.decodeVideo({
          type: 'key',
          timestamp: 0,
          data: new ArrayBuffer(100),
        })
      ).rejects.toThrow('FFmpeg decode failed');

      decoder.close();
    });

    it('should cleanup files on error', async () => {
      mockFFmpeg.exec = vi.fn().mockResolvedValue(1);

      const decoder = createFFmpegDecoder();
      await decoder.configure({
        video: {
          codec: 'prores',
          codedWidth: 1920,
          codedHeight: 1080,
        },
      });

      try {
        await decoder.decodeVideo({
          type: 'key',
          timestamp: 0,
          data: new ArrayBuffer(100),
        });
      } catch {
        // Expected
      }

      // deleteFile should have been called to cleanup
      expect(mockFFmpeg.deleteFile).toHaveBeenCalled();

      decoder.close();
    });

    it('should throw when FFmpeg not loaded', async () => {
      setFFmpegFactory(null);
      unloadFFmpeg();

      const decoder = createFFmpegDecoder();

      // Manually set state without loading FFmpeg
      (decoder as unknown as { _state: string })._state = 'configured';
      (decoder as unknown as { videoConfig: object }).videoConfig = {
        codec: 'prores',
        codedWidth: 1920,
        codedHeight: 1080,
      };

      await expect(
        decoder.decodeVideo({
          type: 'key',
          timestamp: 0,
          data: new ArrayBuffer(100),
        })
      ).rejects.toThrow('FFmpeg not loaded');

      decoder.close();
    });
  });

  describe('concurrent loading', () => {
    it('should handle concurrent load calls', async () => {
      // Create a delayed factory to test concurrent access
      let factoryCallCount = 0;
      setFFmpegFactory(async () => {
        factoryCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createMockFFmpegInstance();
      });

      // Start two loads concurrently
      const promise1 = loadFFmpeg();
      const promise2 = loadFFmpeg();

      // Both should resolve
      await Promise.all([promise1, promise2]);

      // Factory should only be called once
      expect(factoryCallCount).toBe(1);
      expect(isFFmpegLoaded()).toBe(true);
    });

    it('should not reload when already loaded', async () => {
      await loadFFmpeg();
      expect(getFFmpegLoadState()).toBe('loaded');

      // Second load should return immediately
      await loadFFmpeg();
      expect(getFFmpegLoadState()).toBe('loaded');
    });
  });
});
