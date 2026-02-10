/**
 * WebGPU Render Backend
 *
 * Full GPU-accelerated rendering using WebGPU API.
 */

import type {
  RenderBackend,
  BackendCapabilities,
  TextureHandle,
  TextureFormat,
  RenderPassDescriptor,
} from './types';

interface WebGPUTexture {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
  format: TextureFormat;
}

// WGSL vertex shader for fullscreen quad
const VERTEX_SHADER = `
@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0)
  );
  return vec4f(pos[vertexIndex], 0.0, 1.0);
}
`;

// WGSL fragment shader for texture sampling
const FRAGMENT_SHADER = `
@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@fragment
fn main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let texCoord = pos.xy / vec2f(textureDimensions(tex));
  return textureSample(tex, texSampler, texCoord);
}
`;

function toGPUFormat(format: TextureFormat): GPUTextureFormat {
  switch (format) {
    case 'rgba8unorm':
      return 'rgba8unorm';
    case 'rgba16float':
      return 'rgba16float';
    case 'rgba32float':
      return 'rgba32float';
    case 'bgra8unorm':
      return 'bgra8unorm';
    default:
      return 'rgba8unorm';
  }
}

export class WebGPUBackend implements RenderBackend {
  readonly name = 'webgpu' as const;

  readonly capabilities: BackendCapabilities = {
    maxTextureSize: 8192,
    supportsFloat16: true,
    supportsComputeShaders: true,
    supportsExternalTextures: true,
    maxColorAttachments: 8,
  };

  private canvas: HTMLCanvasElement | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private textures: Map<string, WebGPUTexture> = new Map();
  private nextTextureId = 0;

  private blitPipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;

    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      throw new Error('No WebGPU adapter found');
    }

    this.device = await adapter.requestDevice();

    // Update capabilities based on actual GPU limits
    const limits = this.device.limits;
    (this.capabilities as { maxTextureSize: number }).maxTextureSize =
      limits.maxTextureDimension2D;

    this.context = canvas.getContext('webgpu') as GPUCanvasContext;

    if (!this.context) {
      throw new Error('Failed to get WebGPU context');
    }

    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'premultiplied',
    });

    this.createRenderResources();
  }

  private createRenderResources(): void {
    const device = this.device!;

    // Create sampler with linear filtering and edge clamping
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // Create bind group layout for texture sampling
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    // Create shader modules
    const vertexModule = device.createShaderModule({ code: VERTEX_SHADER });
    const fragmentModule = device.createShaderModule({ code: FRAGMENT_SHADER });

    // Create render pipeline
    this.blitPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'main',
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
      },
      primitive: {
        topology: 'triangle-strip',
      },
    });
  }

  destroy(): void {
    // Destroy all textures
    for (const tex of this.textures.values()) {
      tex.texture.destroy();
    }
    this.textures.clear();

    // Destroy device (releases all resources)
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.canvas = null;
    this.blitPipeline = null;
    this.sampler = null;
    this.bindGroupLayout = null;
  }

  createTexture(width: number, height: number, format: TextureFormat): TextureHandle {
    if (!this.device) {
      throw new Error('WebGPU backend not initialized');
    }
    const device = this.device;
    const id = `webgpu_tex_${this.nextTextureId++}`;

    const texture = device.createTexture({
      size: { width, height },
      format: toGPUFormat(format),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const view = texture.createView();
    this.textures.set(id, { texture, view, width, height, format });

    return { id, width, height, format };
  }

  uploadPixels(handle: TextureHandle, data: Uint8Array | Uint8ClampedArray): void {
    if (!this.device) {
      throw new Error('WebGPU backend not initialized');
    }
    const device = this.device;
    const tex = this.textures.get(handle.id);

    if (!tex) {
      throw new Error(`Texture not found: ${handle.id}`);
    }

    device.queue.writeTexture(
      { texture: tex.texture },
      data,
      { bytesPerRow: tex.width * 4 },
      { width: tex.width, height: tex.height }
    );
  }

  importVideoFrame(frame: VideoFrame): TextureHandle {
    if (!this.device) {
      throw new Error('WebGPU backend not initialized');
    }
    const device = this.device;
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    const handle = this.createTexture(width, height, 'rgba8unorm');

    const tex = this.textures.get(handle.id)!;
    device.queue.copyExternalImageToTexture(
      { source: frame },
      { texture: tex.texture },
      { width, height }
    );

    return handle;
  }

  importImageBitmap(bitmap: ImageBitmap): TextureHandle {
    if (!this.device) {
      throw new Error('WebGPU backend not initialized');
    }
    const device = this.device;
    const handle = this.createTexture(bitmap.width, bitmap.height, 'rgba8unorm');

    const tex = this.textures.get(handle.id)!;
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: tex.texture },
      { width: bitmap.width, height: bitmap.height }
    );

    return handle;
  }

  beginFrame(): void {
    // WebGPU doesn't need explicit frame begin
  }

  endFrame(): void {
    // WebGPU presents automatically when command buffer is submitted
  }

  renderToScreen(texture: TextureHandle): void {
    if (!this.device || !this.context) return;
    const device = this.device;
    const context = this.context;
    const tex = this.textures.get(texture.id);

    if (!tex) return;

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: this.sampler! },
        { binding: 1, resource: tex.view },
      ],
    });

    renderPass.setPipeline(this.blitPipeline!);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(4);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  renderToTexture(pass: RenderPassDescriptor): void {
    if (!this.device || !pass.output || pass.inputs.length === 0) return;
    const device = this.device;

    const output = this.textures.get(pass.output.id);
    const input = this.textures.get(pass.inputs[0].id);

    if (!output || !input) return;

    const commandEncoder = device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    const bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout!,
      entries: [
        { binding: 0, resource: this.sampler! },
        { binding: 1, resource: input.view },
      ],
    });

    renderPass.setPipeline(this.blitPipeline!);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(4);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
  }

  async readPixels(texture: TextureHandle): Promise<Uint8Array> {
    if (!this.device) {
      throw new Error('WebGPU backend not initialized');
    }
    const device = this.device;
    const tex = this.textures.get(texture.id);

    if (!tex) {
      throw new Error(`Texture not found: ${texture.id}`);
    }

    // Calculate aligned bytes per row (must be multiple of 256 for WebGPU)
    const bytesPerRow = Math.ceil((tex.width * 4) / 256) * 256;
    const bufferSize = bytesPerRow * tex.height;

    // Create staging buffer for readback
    const readBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // Copy texture to buffer
    const commandEncoder = device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: tex.texture },
      { buffer: readBuffer, bytesPerRow },
      { width: tex.width, height: tex.height }
    );

    device.queue.submit([commandEncoder.finish()]);

    // Map buffer and read data
    await readBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(readBuffer.getMappedRange());

    // Copy data row by row (removing alignment padding)
    const result = new Uint8Array(tex.width * tex.height * 4);
    for (let y = 0; y < tex.height; y++) {
      const srcOffset = y * bytesPerRow;
      const dstOffset = y * tex.width * 4;
      result.set(data.subarray(srcOffset, srcOffset + tex.width * 4), dstOffset);
    }

    readBuffer.unmap();
    readBuffer.destroy();

    return result;
  }

  releaseTexture(handle: TextureHandle): void {
    const tex = this.textures.get(handle.id);
    if (tex) {
      tex.texture.destroy();
      this.textures.delete(handle.id);
    }
  }
}
