import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBackend, getAvailableBackendNames } from './create-backend';

describe('createBackend', () => {
  let mockDevice: GPUDevice;
  let mockContext: GPUCanvasContext;
  let mockTexture: GPUTexture;
  let mockTextureView: GPUTextureView;
  let mockBuffer: GPUBuffer;
  let mockCommandEncoder: GPUCommandEncoder;
  let mockRenderPassEncoder: GPURenderPassEncoder;

  beforeEach(() => {
    vi.clearAllMocks();

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
    const mockMappedRange = new ArrayBuffer(256 * 100);
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
  });

  it('should create WebGPU backend when available', async () => {
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockContext),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    const backend = await createBackend(mockCanvas);
    expect(backend.name).toBe('webgpu');
  });

  it('should fall back to WebGL2 when WebGPU unavailable', async () => {
    // Disable WebGPU
    vi.stubGlobal('navigator', { gpu: undefined });

    const mockGl = {
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
      checkFramebufferStatus: vi.fn().mockReturnValue(0x8CD5),
      TEXTURE_2D: 0x0de1,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      LINEAR: 0x2601,
      CLAMP_TO_EDGE: 0x812f,
      RGBA: 0x1908,
      RGBA8: 0x8058,
      RGBA16F: 0x881a,
      RGBA32F: 0x8814,
      HALF_FLOAT: 0x140b,
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

    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockGl),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    const backend = await createBackend(mockCanvas);
    expect(backend.name).toBe('webgl2');
  });

  it('should respect preferred backend option', async () => {
    const mockGl = {
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
      checkFramebufferStatus: vi.fn().mockReturnValue(0x8CD5),
      TEXTURE_2D: 0x0de1,
      TEXTURE_MIN_FILTER: 0x2801,
      TEXTURE_MAG_FILTER: 0x2800,
      TEXTURE_WRAP_S: 0x2802,
      TEXTURE_WRAP_T: 0x2803,
      LINEAR: 0x2601,
      CLAMP_TO_EDGE: 0x812f,
      RGBA: 0x1908,
      RGBA8: 0x8058,
      RGBA16F: 0x881a,
      RGBA32F: 0x8814,
      HALF_FLOAT: 0x140b,
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

    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockGl),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    const backend = await createBackend(mockCanvas, { preferredBackend: 'webgl2' });
    expect(backend.name).toBe('webgl2');
  });

  it('should fall back to canvas when WebGL2 also unavailable', async () => {
    // Disable WebGPU
    vi.stubGlobal('navigator', { gpu: undefined });

    // Mock a canvas that returns 2d context but not webgl2
    const mock2dContext = {
      drawImage: vi.fn(),
      putImageData: vi.fn(),
      getImageData: vi.fn().mockReturnValue({
        data: new Uint8ClampedArray(100 * 100 * 4),
      }),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    const mockCanvas = {
      getContext: vi.fn().mockImplementation((contextId: string) => {
        if (contextId === '2d') return mock2dContext;
        return null; // webgl2 not supported
      }),
      width: 1920,
      height: 1080,
    } as unknown as HTMLCanvasElement;

    // Mock document.createElement for canvas detection
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        getContext: vi.fn().mockImplementation((contextId: string) => {
          if (contextId === '2d') return mock2dContext;
          return null;
        }),
        width: 100,
        height: 100,
      }),
    });

    const backend = await createBackend(mockCanvas);
    expect(backend.name).toBe('canvas');
  });
});

describe('getAvailableBackendNames', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup WebGPU mocks
    const mockAdapter = {
      requestDevice: vi.fn().mockResolvedValue({}),
      features: new Set(),
      limits: {},
    };

    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
        getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
      },
    });

    // Mock document for WebGL2 and Canvas detection
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        getContext: vi.fn().mockReturnValue({}),
        width: 100,
        height: 100,
      }),
    });
  });

  it('should return all available backends', async () => {
    const backends = await getAvailableBackendNames();

    expect(backends).toContain('webgpu');
    expect(backends).toContain('webgl2');
    expect(backends).toContain('canvas');
  });

  it('should not include webgpu when unavailable', async () => {
    vi.stubGlobal('navigator', { gpu: undefined });

    const backends = await getAvailableBackendNames();

    expect(backends).not.toContain('webgpu');
    expect(backends).toContain('webgl2');
    expect(backends).toContain('canvas');
  });

  it('should always include canvas', async () => {
    const backends = await getAvailableBackendNames();

    expect(backends).toContain('canvas');
  });
});
