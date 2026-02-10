import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebGL2Backend } from './webgl2-backend';

describe('WebGL2Backend', () => {
  let backend: WebGL2Backend;
  let mockCanvas: HTMLCanvasElement;
  let mockGl: WebGL2RenderingContext;

  beforeEach(() => {
    mockGl = {
      createTexture: vi.fn().mockReturnValue({}),
      bindTexture: vi.fn(),
      texImage2D: vi.fn(),
      texParameteri: vi.fn(),
      deleteTexture: vi.fn(),
      createFramebuffer: vi.fn().mockReturnValue({}),
      bindFramebuffer: vi.fn(),
      framebufferTexture2D: vi.fn(),
      deleteFramebuffer: vi.fn(),
      createShader: vi.fn().mockReturnValue({}),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn().mockReturnValue(true),
      getShaderInfoLog: vi.fn().mockReturnValue(''),
      createProgram: vi.fn().mockReturnValue({}),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn().mockReturnValue(true),
      getProgramInfoLog: vi.fn().mockReturnValue(''),
      useProgram: vi.fn(),
      deleteProgram: vi.fn(),
      deleteShader: vi.fn(),
      getUniformLocation: vi.fn().mockReturnValue({}),
      getAttribLocation: vi.fn().mockReturnValue(0),
      createBuffer: vi.fn().mockReturnValue({}),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      deleteBuffer: vi.fn(),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      uniform1i: vi.fn(),
      activeTexture: vi.fn(),
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      drawArrays: vi.fn(),
      readPixels: vi.fn(),
      getParameter: vi.fn().mockReturnValue(8192),
      getExtension: vi.fn().mockReturnValue({}),
      checkFramebufferStatus: vi.fn().mockReturnValue(0x8CD5), // FRAMEBUFFER_COMPLETE
      TEXTURE_2D: 0x0de1,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      LINEAR: 0x2601,
      CLAMP_TO_EDGE: 0x812f,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      FRAMEBUFFER: 0x8d40,
      COLOR_ATTACHMENT0: 0x8ce0,
      FRAMEBUFFER_COMPLETE: 0x8cd5,
      VERTEX_SHADER: 0x8b31,
      FRAGMENT_SHADER: 0x8b30,
      COMPILE_STATUS: 0x8b81,
      LINK_STATUS: 0x8b82,
      ARRAY_BUFFER: 0x8892,
      STATIC_DRAW: 0x88e4,
      FLOAT: 0x1406,
      TRIANGLE_STRIP: 0x0005,
      COLOR_BUFFER_BIT: 0x4000,
      MAX_TEXTURE_SIZE: 0x0d33,
      TEXTURE0: 0x84c0,
      MAX_COLOR_ATTACHMENTS: 0x8cdf,
    } as unknown as WebGL2RenderingContext;

    mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockGl),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    backend = new WebGL2Backend();
  });

  describe('initialization', () => {
    it('should have correct name', () => {
      expect(backend.name).toBe('webgl2');
    });

    it('should report WebGL2 capabilities', () => {
      expect(backend.capabilities.supportsComputeShaders).toBe(false);
      expect(backend.capabilities.supportsFloat16).toBe(true);
    });

    it('should initialize with canvas', async () => {
      await backend.init(mockCanvas);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('webgl2', expect.any(Object));
    });

    it('should throw error if context is not available', async () => {
      const failingCanvas = {
        getContext: vi.fn().mockReturnValue(null),
        width: 1920,
        height: 1080,
      } as unknown as HTMLCanvasElement;

      await expect(backend.init(failingCanvas)).rejects.toThrow(
        'Failed to get WebGL2 context'
      );
    });

    it('should create blit shader program on initialization', async () => {
      await backend.init(mockCanvas);

      expect(mockGl.createShader).toHaveBeenCalledWith(mockGl.VERTEX_SHADER);
      expect(mockGl.createShader).toHaveBeenCalledWith(mockGl.FRAGMENT_SHADER);
      expect(mockGl.createProgram).toHaveBeenCalled();
      expect(mockGl.linkProgram).toHaveBeenCalled();
    });

    it('should create quad vertex buffer on initialization', async () => {
      await backend.init(mockCanvas);

      expect(mockGl.createBuffer).toHaveBeenCalled();
      expect(mockGl.bindBuffer).toHaveBeenCalledWith(mockGl.ARRAY_BUFFER, expect.any(Object));
      expect(mockGl.bufferData).toHaveBeenCalledWith(
        mockGl.ARRAY_BUFFER,
        expect.any(Float32Array),
        mockGl.STATIC_DRAW
      );
    });
  });

  describe('texture management', () => {
    beforeEach(async () => {
      await backend.init(mockCanvas);
    });

    it('should create texture with correct dimensions', () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');

      expect(handle.width).toBe(100);
      expect(handle.height).toBe(100);
      expect(handle.format).toBe('rgba8unorm');
      expect(handle.id).toBeDefined();
      expect(mockGl.createTexture).toHaveBeenCalled();
      expect(mockGl.texImage2D).toHaveBeenCalled();
    });

    it('should create textures with unique IDs', () => {
      const handle1 = backend.createTexture(100, 100, 'rgba8unorm');
      const handle2 = backend.createTexture(200, 200, 'rgba8unorm');

      expect(handle1.id).not.toBe(handle2.id);
    });

    it('should set texture parameters correctly', () => {
      backend.createTexture(100, 100, 'rgba8unorm');

      expect(mockGl.texParameteri).toHaveBeenCalledWith(
        mockGl.TEXTURE_2D,
        mockGl.TEXTURE_MIN_FILTER,
        mockGl.LINEAR
      );
      expect(mockGl.texParameteri).toHaveBeenCalledWith(
        mockGl.TEXTURE_2D,
        mockGl.TEXTURE_MAG_FILTER,
        mockGl.LINEAR
      );
      expect(mockGl.texParameteri).toHaveBeenCalledWith(
        mockGl.TEXTURE_2D,
        mockGl.TEXTURE_WRAP_S,
        mockGl.CLAMP_TO_EDGE
      );
      expect(mockGl.texParameteri).toHaveBeenCalledWith(
        mockGl.TEXTURE_2D,
        mockGl.TEXTURE_WRAP_T,
        mockGl.CLAMP_TO_EDGE
      );
    });

    it('should upload pixels to texture', () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      const pixels = new Uint8Array(100 * 100 * 4);

      backend.uploadPixels(handle, pixels);

      expect(mockGl.bindTexture).toHaveBeenCalledWith(mockGl.TEXTURE_2D, expect.any(Object));
      expect(mockGl.texImage2D).toHaveBeenCalled();
    });

    it('should throw when uploading to non-existent texture', () => {
      const fakeHandle = { id: 'fake', width: 100, height: 100, format: 'rgba8unorm' as const };
      const pixels = new Uint8Array(100 * 100 * 4);

      expect(() => backend.uploadPixels(fakeHandle, pixels)).toThrow('Texture not found: fake');
    });

    it('should release texture', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      backend.releaseTexture(handle);

      expect(mockGl.deleteTexture).toHaveBeenCalled();
      await expect(backend.readPixels(handle)).rejects.toThrow('Texture not found');
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

      expect(mockGl.bindFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, null);
      expect(mockGl.useProgram).toHaveBeenCalled();
      expect(mockGl.drawArrays).toHaveBeenCalledWith(mockGl.TRIANGLE_STRIP, 0, 4);
    });

    it('should set viewport on beginFrame', () => {
      backend.beginFrame();

      expect(mockGl.viewport).toHaveBeenCalledWith(0, 0, 1920, 1080);
    });

    it('should clear on beginFrame', () => {
      backend.beginFrame();

      expect(mockGl.clearColor).toHaveBeenCalledWith(0, 0, 0, 1);
      expect(mockGl.clear).toHaveBeenCalledWith(mockGl.COLOR_BUFFER_BIT);
    });

    it('should handle renderToScreen with non-existent texture gracefully', () => {
      const fakeHandle = { id: 'fake', width: 100, height: 100, format: 'rgba8unorm' as const };

      expect(() => backend.renderToScreen(fakeHandle)).not.toThrow();
    });

    it('should render to texture using framebuffer', () => {
      const input = backend.createTexture(100, 100, 'rgba8unorm');
      const output = backend.createTexture(100, 100, 'rgba8unorm');

      backend.renderToTexture({
        shader: 'blit',
        inputs: [input],
        output: output,
        uniforms: {},
      });

      expect(mockGl.createFramebuffer).toHaveBeenCalled();
      expect(mockGl.bindFramebuffer).toHaveBeenCalledWith(mockGl.FRAMEBUFFER, expect.any(Object));
      expect(mockGl.framebufferTexture2D).toHaveBeenCalled();
      expect(mockGl.drawArrays).toHaveBeenCalled();
    });
  });

  describe('readback', () => {
    beforeEach(async () => {
      await backend.init(mockCanvas);
    });

    it('should read pixels from texture', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      const pixels = await backend.readPixels(handle);

      expect(pixels).toBeInstanceOf(Uint8Array);
      expect(pixels.length).toBe(100 * 100 * 4);
      expect(mockGl.readPixels).toHaveBeenCalled();
    });

    it('should throw when reading from non-existent texture', async () => {
      const fakeHandle = { id: 'fake', width: 100, height: 100, format: 'rgba8unorm' as const };

      await expect(backend.readPixels(fakeHandle)).rejects.toThrow('Texture not found: fake');
    });

    it('should use framebuffer for pixel readback', async () => {
      const handle = backend.createTexture(100, 100, 'rgba8unorm');
      await backend.readPixels(handle);

      expect(mockGl.bindFramebuffer).toHaveBeenCalled();
      expect(mockGl.framebufferTexture2D).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clean up resources on destroy', async () => {
      await backend.init(mockCanvas);
      backend.createTexture(100, 100, 'rgba8unorm');

      backend.destroy();

      expect(mockGl.deleteProgram).toHaveBeenCalled();
      expect(mockGl.deleteBuffer).toHaveBeenCalled();
      expect(mockGl.deleteTexture).toHaveBeenCalled();
    });

    it('should not throw when destroyed before initialization', () => {
      expect(() => backend.destroy()).not.toThrow();
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
      expect(mockGl.texImage2D).toHaveBeenCalled();
    });

    it('should import ImageBitmap', () => {
      const mockBitmap = {
        width: 800,
        height: 600,
      } as ImageBitmap;

      const handle = backend.importImageBitmap(mockBitmap);

      expect(handle.width).toBe(800);
      expect(handle.height).toBe(600);
      expect(mockGl.texImage2D).toHaveBeenCalled();
    });
  });
});
