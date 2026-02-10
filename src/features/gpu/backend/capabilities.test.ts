import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectWebGPUSupport,
  detectWebGL2Support,
  detectBestBackend,
} from './capabilities';

describe('Backend Capabilities Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectWebGPUSupport', () => {
    it('should return true when WebGPU is available', async () => {
      const result = await detectWebGPUSupport();
      expect(result).toBe(true);
    });

    it('should return false when navigator.gpu is undefined', async () => {
      const originalGpu = navigator.gpu;
      // @ts-expect-error - testing undefined case
      navigator.gpu = undefined;

      const result = await detectWebGPUSupport();
      expect(result).toBe(false);

      Object.defineProperty(navigator, 'gpu', { value: originalGpu, writable: true });
    });
  });

  describe('detectWebGL2Support', () => {
    it('should return true when WebGL2 is available', () => {
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue({}),
      } as unknown as HTMLCanvasElement;

      const result = detectWebGL2Support(mockCanvas);
      expect(result).toBe(true);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2');
    });

    it('should return false when WebGL2 is not available', () => {
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(null),
      } as unknown as HTMLCanvasElement;

      const result = detectWebGL2Support(mockCanvas);
      expect(result).toBe(false);
    });
  });

  describe('detectBestBackend', () => {
    it('should return webgpu when available', async () => {
      const mockCanvas = {
        getContext: vi.fn().mockReturnValue({}),
      } as unknown as HTMLCanvasElement;

      const result = await detectBestBackend(mockCanvas);
      expect(result).toBe('webgpu');
    });

    it('should return webgl2 when WebGPU unavailable but WebGL2 available', async () => {
      const originalGpu = navigator.gpu;
      // @ts-expect-error - testing undefined case
      navigator.gpu = undefined;

      const mockCanvas = {
        getContext: vi.fn().mockReturnValue({}),
      } as unknown as HTMLCanvasElement;

      const result = await detectBestBackend(mockCanvas);
      expect(result).toBe('webgl2');

      Object.defineProperty(navigator, 'gpu', { value: originalGpu, writable: true });
    });

    it('should return canvas as last resort', async () => {
      const originalGpu = navigator.gpu;
      // @ts-expect-error - testing undefined case
      navigator.gpu = undefined;

      const mockCanvas = {
        getContext: vi.fn().mockReturnValue(null),
      } as unknown as HTMLCanvasElement;

      const result = await detectBestBackend(mockCanvas);
      expect(result).toBe('canvas');

      Object.defineProperty(navigator, 'gpu', { value: originalGpu, writable: true });
    });
  });
});
