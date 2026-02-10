import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGPUBackend } from './webgpu-backend';

describe('WebGPUBackend', () => {
  let backend: WebGPUBackend;
  let mockCanvas: HTMLCanvasElement;
  let mockDevice: GPUDevice;
  let mockContext: GPUCanvasContext;
  let mockTexture: GPUTexture;
  let mockTextureView: GPUTextureView;
  let mockBuffer: GPUBuffer;
  let mockCommandEncoder: GPUCommandEncoder;
  let mockRenderPassEncoder: GPURenderPassEncoder;

  beforeEach(() => {
    // Create mock texture view
    mockTextureView = {} as GPUTextureView;

    // Create mock texture
    mockTexture = {
      createView: vi.fn().mockReturnValue(mockTextureView),
      destroy: vi.fn(),
    } as unknown as GPUTexture;

    // Create mock render pass encoder
    mockRenderPassEncoder = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
      end: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    // Create mock command encoder
    mockCommandEncoder = {
      beginRenderPass: vi.fn().mockReturnValue(mockRenderPassEncoder),
      copyTextureToBuffer: vi.fn(),
      finish: vi.fn().mockReturnValue({}),
    } as unknown as GPUCommandEncoder;

    // Create mock buffer for pixel readback
    const mockMappedRange = new ArrayBuffer(256 * 100); // bytesPerRow * height
    mockBuffer = {
      mapAsync: vi.fn().mockResolvedValue(undefined),
      getMappedRange: vi.fn().mockReturnValue(mockMappedRange),
      unmap: vi.fn(),
      destroy: vi.fn(),
    } as unknown as GPUBuffer;

    // Create mock device
    mockDevice = {
      createShaderModule: vi.fn().mockReturnValue({}),
      createBindGroupLayout: vi.fn().mockReturnValue({}),
      createPipelineLayout: vi.fn().mockReturnValue({}),
      createRenderPipeline: vi.fn().mockReturnValue({}),
      createBuffer: vi.fn().mockReturnValue(mockBuffer),
      createTexture: vi.fn().mockReturnValue(mockTexture),
      createSampler: vi.fn().mockReturnValue({}),
      createBindGroup: vi.fn().mockReturnValue({}),
      createCommandEncoder: vi.fn().mockReturnValue(mockCommandEncoder),
      queue: {
        submit: vi.fn(),
        writeTexture: vi.fn(),
        copyExternalImageToTexture: vi.fn(),
      },
      destroy: vi.fn(),
      limits: { maxTextureDimension2D: 16384 },
    } as unknown as GPUDevice;

    // Create mock context
    mockContext = {
      configure: vi.fn(),
      getCurrentTexture: vi.fn().mockReturnValue({
        createView: vi.fn().mockReturnValue(mockTextureView),
      }),
    } as unknown as GPUCanvasContext;

    // Create mock canvas
    mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockContext),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    // Mock navigator.gpu
    const mockAdapter = {
      requestDevice: vi.fn().mockResolvedValue(mockDevice),
      features: new Set(),
      limits: {},
    };

    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
      },
    });

    // Mock GPUShaderStage
    vi.stubGlobal('GPUShaderStage', {
      FRAGMENT: 2,
      VERTEX: 1,
      COMPUTE: 4,
    });

    // Mock GPUTextureUsage
    vi.stubGlobal('GPUTextureUsage', {
      TEXTURE_BINDING: 4,
      COPY_DST: 2,
      COPY_SRC: 1,
      RENDER_ATTACHMENT: 16,
    });

    // Mock GPUBufferUsage
    vi.stubGlobal('GPUBufferUsage', {
      COPY_DST: 8,
      MAP_READ: 1,
    });

    // Mock GPUMapMode
    vi.stubGlobal('GPUMapMode', {
      READ: 1,
    });

    backend = new WebGPUBackend();
  });

  describe('initialization', () => {
    it('should have correct name', () => {
      expect(backend.name).toBe('webgpu');
    });

    it('should report full capabilities', () => {
      expect(backend.capabilities.supportsComputeShaders).toBe(true);
      expect(backend.capabilities.supportsExternalTextures).toBe(true);
      expect(backend.capabilities.supportsFloat16).toBe(true);
    });

    it('should initialize with canvas', async () => {
      await backend.init(mockCanvas);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgpu');
    });

    it('should throw error if WebGPU not supported', async () => {
      vi.stubGlobal('navigator', { gpu: undefined });

      await expect(backend.init(mockCanvas)).rejects.toThrow('WebGPU not supported');
    });

    it('should throw error if no adapter found', async () => {
      vi.stubGlobal('navigator', {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(null),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      });

      await expect(backend.init(mockCanvas)).rejects.toThrow('No WebGPU adapter found');
    });

    it('should throw error if context not available', async () => {
      const failingCanvas = {
        getContext: vi.fn().mockReturnValue(null),
        width: 1920,
        height: 1080,
      } as unknown as HTMLCanvasElement;

      await expect(backend.init(failingCanvas)).rejects.toThrow(
        'Failed to get WebGPU context'
      );
    });

    it('should configure context with correct settings', async () => {
      await backend.init(mockCanvas);

      expect(mockContext.configure).toHaveBeenCalledWith({
        device: mockDevice,
        format: 'bgra8unorm',
        alphaMode: 'premultiplied',
      });
    });

    it('should create render resources on initialization', async () => {
      await backend.init(mockCanvas);

      expect(mockDevice.createSampler).toHaveBeenCalledWith({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });
      expect(mockDevice.createBindGroupLayout).toHaveBeenCalled();
      expect(mockDevice.createShaderModule).toHaveBeenCalledTimes(2);
      expect(mockDevice.createRenderPipeline).toHaveBeenCalled();
    });

    it('should update capabilities from device limits', async () => {
      await backend.init(mockCanvas);

      expect(backend.capabilities.maxTextureSize).toBe(16384);
    });
  });

  describe('texture management', () => {
    beforeEach(async () => {
      await backend.init(mockCanvas);
    });

    it('should create texture handle with correct properties', () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');

      expect(handle.width).toBe(100);
      expect(handle.height).toBe(100);
      expect(handle.format).toBe('rgba8unorm');
      expect(handle.id).toBeDefined();
    });

    it('should create textures with unique IDs', () => {
      const handle1 = backend.createTexture(100, 100, 'rgba8unorm');
      const handle2 = backend.createTexture(200, 200, 'rgba8unorm');

      expect(handle1.id).not.toBe(handle2.id);
    });

    it('should create GPU texture with correct usage flags', () => {
      backend.createTexture(100, 100, 'rgba8unorm');

      expect(mockDevice.createTexture).toHaveBeenCalledWith({
        size: { width: 100, height: 100 },
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    });

    it('should support different texture formats', () => {
      const formats = [
        'rgba8unorm',
        'rgba16float',
        'rgba32float',
        'bgra8unorm',
      ] as const;

      for (const format of formats) {
        const handle = backend.createTexture(100, 100, format);
        expect(handle.format).toBe(format);
      }
    });

    it('should throw when creating texture before initialization', () => {
      const uninitBackend = new WebGPUBackend();

      expect(() => uninitBackend.createTexture(100, 100, 'rgba8unorm')).toThrow(
        'WebGPU backend not initialized'
      );
    });

    it('should upload pixels to texture', () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      const pixels = new Uint8Array(100 * 100 * 4);

      backend.uploadPixels(handle, pixels);

      expect(mockDevice.queue.writeTexture).toHaveBeenCalledWith(
        { texture: mockTexture },
        pixels,
        { bytesPerRow: 400 },
        { width: 100, height: 100 }
      );
    });

    it('should throw when uploading to non-existent texture', () => {
      const fakeHandle = { id: 'fake', width: 100, height: 100, format: 'rgba8unorm' as const };
      const pixels = new Uint8Array(100 * 100 * 4);

      expect(() => backend.uploadPixels(fakeHandle, pixels)).toThrow('Texture not found: fake');
    });

    it('should release texture', () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      backend.releaseTexture(handle);

      expect(mockTexture.destroy).toHaveBeenCalled();
    });

    it('should handle releasing non-existent texture gracefully', () => {
      const fakeHandle = { id: 'fake', width: 100, height: 100, format: 'rgba8unorm' as const };

      expect(() => backend.releaseTexture(fakeHandle)).not.toThrow();
    });
  });

  describe('video frame import', () => {
    beforeEach(async () => {
      await backend.init(mockCanvas);
    });

    it('should import VideoFrame', () => {
      const mockFrame = {
        displayWidth: 1920,
        displayHeight: 1080,
      } as VideoFrame;

      const handle = backend.importVideoFrame(mockFrame);

      expect(handle.width).toBe(1920);
      expect(handle.height).toBe(1080);
      expect(mockDevice.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
        { source: mockFrame },
        { texture: mockTexture },
        { width: 1920, height: 1080 }
      );
    });

    it('should import ImageBitmap', () => {
      const mockBitmap = {
        width: 800,
        height: 600,
      } as ImageBitmap;

      const handle = backend.importImageBitmap(mockBitmap);

      expect(handle.width).toBe(800);
      expect(handle.height).toBe(600);
      expect(mockDevice.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
        { source: mockBitmap },
        { texture: mockTexture },
        { width: 800, height: 600 }
      );
    });

    it('should throw when importing before initialization', () => {
      const uninitBackend = new WebGPUBackend();
      const mockFrame = { displayWidth: 100, displayHeight: 100 } as VideoFrame;

      expect(() => uninitBackend.importVideoFrame(mockFrame)).toThrow(
        'WebGPU backend not initialized'
      );
    });
  });

  describe('rendering', () => {
    beforeEach(async () => {
      await backend.init(mockCanvas);
    });

    it('should render texture to screen', () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');

      backend.beginFrame();
      backend.renderToScreen(handle);
      backend.endFrame();

      expect(mockDevice.createCommandEncoder).toHaveBeenCalled();
      expect(mockCommandEncoder.beginRenderPass).toHaveBeenCalled();
      expect(mockRenderPassEncoder.setPipeline).toHaveBeenCalled();
      expect(mockRenderPassEncoder.setBindGroup).toHaveBeenCalledWith(0, expect.any(Object));
      expect(mockRenderPassEncoder.draw).toHaveBeenCalledWith(4);
      expect(mockRenderPassEncoder.end).toHaveBeenCalled();
      expect(mockDevice.queue.submit).toHaveBeenCalled();
    });

    it('should handle renderToScreen with non-existent texture gracefully', () => {
      const fakeHandle = { id: 'fake', width: 100, height: 100, format: 'rgba8unorm' as const };

      expect(() => backend.renderToScreen(fakeHandle)).not.toThrow();
    });

    it('should render to texture', () => {
      const input = backend.createTexture(100, 100, 'rgba8unorm');
      const output = backend.createTexture(100, 100, 'rgba8unorm');

      backend.renderToTexture({
        shader: 'blit',
        inputs: [input],
        output: output,
        uniforms: {},
      });

      expect(mockDevice.createCommandEncoder).toHaveBeenCalled();
      expect(mockCommandEncoder.beginRenderPass).toHaveBeenCalled();
      expect(mockRenderPassEncoder.draw).toHaveBeenCalledWith(4);
      expect(mockDevice.queue.submit).toHaveBeenCalled();
    });

    it('should not render when output is null', () => {
      const input = backend.createTexture(100, 100, 'rgba8unorm');

      backend.renderToTexture({
        shader: 'blit',
        inputs: [input],
        output: null,
        uniforms: {},
      });

      expect(mockDevice.createCommandEncoder).not.toHaveBeenCalled();
    });

    it('should not render when inputs are empty', () => {
      const output = backend.createTexture(100, 100, 'rgba8unorm');

      backend.renderToTexture({
        shader: 'blit',
        inputs: [],
        output: output,
        uniforms: {},
      });

      expect(mockDevice.createCommandEncoder).not.toHaveBeenCalled();
    });

    it('should create bind group with sampler and texture', () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');

      backend.renderToScreen(handle);

      expect(mockDevice.createBindGroup).toHaveBeenCalledWith({
        layout: expect.any(Object),
        entries: [
          { binding: 0, resource: expect.any(Object) },
          { binding: 1, resource: expect.any(Object) },
        ],
      });
    });
  });

  describe('pixel readback', () => {
    beforeEach(async () => {
      await backend.init(mockCanvas);
    });

    it('should read pixels from texture', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      const pixels = await backend.readPixels(handle);

      expect(pixels).toBeInstanceOf(Uint8Array);
      expect(pixels.length).toBe(100 * 100 * 4);
    });

    it('should throw when reading from non-existent texture', async () => {
      const fakeHandle = { id: 'fake', width: 100, height: 100, format: 'rgba8unorm' as const };

      await expect(backend.readPixels(fakeHandle)).rejects.toThrow('Texture not found: fake');
    });

    it('should create buffer with 256-byte aligned rows', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      await backend.readPixels(handle);

      // 100 * 4 = 400 bytes per row, aligned to 256 = 512
      const expectedBytesPerRow = Math.ceil(400 / 256) * 256;
      const expectedSize = expectedBytesPerRow * 100;

      expect(mockDevice.createBuffer).toHaveBeenCalledWith({
        size: expectedSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
    });

    it('should copy texture to buffer', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      await backend.readPixels(handle);

      expect(mockCommandEncoder.copyTextureToBuffer).toHaveBeenCalledWith(
        { texture: mockTexture },
        { buffer: mockBuffer, bytesPerRow: 512 },
        { width: 100, height: 100 }
      );
    });

    it('should map buffer for reading', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      await backend.readPixels(handle);

      expect(mockBuffer.mapAsync).toHaveBeenCalledWith(GPUMapMode.READ);
      expect(mockBuffer.getMappedRange).toHaveBeenCalled();
      expect(mockBuffer.unmap).toHaveBeenCalled();
    });

    it('should destroy buffer after reading', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      await backend.readPixels(handle);

      expect(mockBuffer.destroy).toHaveBeenCalled();
    });

    it('should throw when reading before initialization', async () => {
      const uninitBackend = new WebGPUBackend();
      const fakeHandle = { id: 'test', width: 100, height: 100, format: 'rgba8unorm' as const };

      await expect(uninitBackend.readPixels(fakeHandle)).rejects.toThrow(
        'WebGPU backend not initialized'
      );
    });
  });

  describe('destroy', () => {
    it('should clean up resources on destroy', async () => {
      await backend.init(mockCanvas);
      backend.createTexture(100, 100, 'rgba8unorm');

      backend.destroy();

      expect(mockTexture.destroy).toHaveBeenCalled();
      expect(mockDevice.destroy).toHaveBeenCalled();
    });

    it('should clear texture map on destroy', async () => {
      await backend.init(mockCanvas);
      const handle = backend.createTexture(100, 100, 'rgba8unorm');

      backend.destroy();

      // Reinitialize to test texture was cleared
      await backend.init(mockCanvas);
      expect(() => backend.uploadPixels(handle, new Uint8Array(40000))).toThrow();
    });

    it('should not throw when destroyed before initialization', () => {
      expect(() => backend.destroy()).not.toThrow();
    });

    it('should handle multiple destroy calls gracefully', async () => {
      await backend.init(mockCanvas);

      expect(() => {
        backend.destroy();
        backend.destroy();
      }).not.toThrow();
    });
  });

  describe('frame lifecycle', () => {
    beforeEach(async () => {
      await backend.init(mockCanvas);
    });

    it('should not throw on beginFrame', () => {
      expect(() => backend.beginFrame()).not.toThrow();
    });

    it('should not throw on endFrame', () => {
      expect(() => backend.endFrame()).not.toThrow();
    });
  });
});
