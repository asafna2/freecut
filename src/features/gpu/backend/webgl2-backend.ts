/**
 * WebGL2 Render Backend
 *
 * GPU-accelerated fallback backend using WebGL2 API.
 * Provides better performance than Canvas 2D but without WebGPU compute shaders.
 */

import type {
  RenderBackend,
  BackendCapabilities,
  TextureHandle,
  TextureFormat,
  RenderPassDescriptor,
} from './types';

// GLSL ES 3.0 vertex shader for fullscreen quad
const BLIT_VERTEX_SHADER = `#version 300 es
precision highp float;

// Fullscreen quad vertices (triangle strip)
const vec2 positions[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);

const vec2 texCoords[4] = vec2[4](
  vec2(0.0, 0.0),
  vec2(1.0, 0.0),
  vec2(0.0, 1.0),
  vec2(1.0, 1.0)
);

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
  v_texCoord = texCoords[gl_VertexID];
}
`;

// GLSL ES 3.0 fragment shader for texture sampling
const BLIT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}
`;

interface WebGL2Texture {
  glTexture: WebGLTexture;
  width: number;
  height: number;
  format: TextureFormat;
}

export class WebGL2Backend implements RenderBackend {
  readonly name = 'webgl2' as const;

  readonly capabilities: BackendCapabilities = {
    maxTextureSize: 8192,
    supportsFloat16: true,
    supportsComputeShaders: false,
    supportsExternalTextures: true,
    maxColorAttachments: 8,
  };

  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private textures: Map<string, WebGL2Texture> = new Map();
  private nextTextureId = 0;

  // Blit shader resources
  private blitProgram: WebGLProgram | null = null;
  private blitTextureLocation: WebGLUniformLocation | null = null;
  private quadBuffer: WebGLBuffer | null = null;

  // Framebuffer for render-to-texture operations
  private tempFramebuffer: WebGLFramebuffer | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error('Failed to get WebGL2 context');
    }

    this.gl = gl;

    // Update capabilities based on actual GPU limits
    this.updateCapabilities();

    // Initialize shader program
    this.initBlitProgram();

    // Initialize quad vertex buffer
    this.initQuadBuffer();

    // Create reusable framebuffer
    this.tempFramebuffer = gl.createFramebuffer();
  }

  private updateCapabilities(): void {
    if (!this.gl) return;

    const maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
    const maxColorAttachments = this.gl.getParameter(this.gl.MAX_COLOR_ATTACHMENTS);

    // Update capabilities with mutable properties
    (this.capabilities as { maxTextureSize: number }).maxTextureSize = maxTextureSize;
    (this.capabilities as { maxColorAttachments: number }).maxColorAttachments = maxColorAttachments;

    // Check for float texture extension
    const hasFloatTextures = this.gl.getExtension('EXT_color_buffer_float') !== null;
    (this.capabilities as { supportsFloat16: boolean }).supportsFloat16 = hasFloatTextures;
  }

  private initBlitProgram(): void {
    if (!this.gl) return;
    const gl = this.gl;

    // Create vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) {
      throw new Error('Failed to create vertex shader');
    }
    gl.shaderSource(vertexShader, BLIT_VERTEX_SHADER);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(vertexShader);
      gl.deleteShader(vertexShader);
      throw new Error(`Vertex shader compilation failed: ${info}`);
    }

    // Create fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      throw new Error('Failed to create fragment shader');
    }
    gl.shaderSource(fragmentShader, BLIT_FRAGMENT_SHADER);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(fragmentShader);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`Fragment shader compilation failed: ${info}`);
    }

    // Create and link program
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error('Failed to create shader program');
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      throw new Error(`Shader program linking failed: ${info}`);
    }

    // Shaders can be deleted after linking
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    this.blitProgram = program;
    this.blitTextureLocation = gl.getUniformLocation(program, 'u_texture');
  }

  private initQuadBuffer(): void {
    if (!this.gl) return;
    const gl = this.gl;

    // Create a buffer with quad vertices (using gl_VertexID in shader, but buffer needed for VAO)
    const quadVertices = new Float32Array([
      -1.0, -1.0, // bottom-left
      1.0, -1.0, // bottom-right
      -1.0, 1.0, // top-left
      1.0, 1.0, // top-right
    ]);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
  }

  destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;

    // Delete all textures
    for (const texture of this.textures.values()) {
      gl.deleteTexture(texture.glTexture);
    }
    this.textures.clear();

    // Delete framebuffer
    if (this.tempFramebuffer) {
      gl.deleteFramebuffer(this.tempFramebuffer);
      this.tempFramebuffer = null;
    }

    // Delete shader program
    if (this.blitProgram) {
      gl.deleteProgram(this.blitProgram);
      this.blitProgram = null;
    }

    // Delete quad buffer
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer);
      this.quadBuffer = null;
    }

    this.canvas = null;
    this.gl = null;
  }

  createTexture(width: number, height: number, format: TextureFormat): TextureHandle {
    if (!this.gl) {
      throw new Error('WebGL2 backend not initialized');
    }
    const gl = this.gl;

    const id = `webgl2_tex_${this.nextTextureId++}`;

    const glTexture = gl.createTexture();
    if (!glTexture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, glTexture);

    // Set texture parameters for LINEAR filtering and CLAMP_TO_EDGE wrapping
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Allocate texture storage
    const { internalFormat, glFormat, type } = this.getGLFormat(format);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, glFormat, type, null);

    this.textures.set(id, { glTexture, width, height, format });

    return { id, width, height, format };
  }

  private getGLFormat(format: TextureFormat): {
    internalFormat: GLenum;
    glFormat: GLenum;
    type: GLenum;
  } {
    if (!this.gl) {
      throw new Error('WebGL2 backend not initialized');
    }
    const gl = this.gl;

    switch (format) {
      case 'rgba8unorm':
      case 'bgra8unorm': // WebGL2 doesn't have native BGRA, use RGBA
        return { internalFormat: gl.RGBA8, glFormat: gl.RGBA, type: gl.UNSIGNED_BYTE };
      case 'rgba16float':
        return { internalFormat: gl.RGBA16F, glFormat: gl.RGBA, type: gl.HALF_FLOAT };
      case 'rgba32float':
        return { internalFormat: gl.RGBA32F, glFormat: gl.RGBA, type: gl.FLOAT };
      default:
        return { internalFormat: gl.RGBA8, glFormat: gl.RGBA, type: gl.UNSIGNED_BYTE };
    }
  }

  uploadPixels(handle: TextureHandle, data: Uint8Array | Uint8ClampedArray): void {
    if (!this.gl) {
      throw new Error('WebGL2 backend not initialized');
    }
    const gl = this.gl;

    const texture = this.textures.get(handle.id);
    if (!texture) {
      throw new Error(`Texture not found: ${handle.id}`);
    }

    const { internalFormat, glFormat, type } = this.getGLFormat(texture.format);

    gl.bindTexture(gl.TEXTURE_2D, texture.glTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      texture.width,
      texture.height,
      0,
      glFormat,
      type,
      data
    );
  }

  importVideoFrame(frame: VideoFrame): TextureHandle {
    if (!this.gl) {
      throw new Error('WebGL2 backend not initialized');
    }
    const gl = this.gl;

    const width = frame.displayWidth;
    const height = frame.displayHeight;
    const handle = this.createTexture(width, height, 'rgba8unorm');

    const texture = this.textures.get(handle.id)!;

    gl.bindTexture(gl.TEXTURE_2D, texture.glTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      frame as unknown as TexImageSource
    );

    return handle;
  }

  importImageBitmap(bitmap: ImageBitmap): TextureHandle {
    if (!this.gl) {
      throw new Error('WebGL2 backend not initialized');
    }
    const gl = this.gl;

    const handle = this.createTexture(bitmap.width, bitmap.height, 'rgba8unorm');

    const texture = this.textures.get(handle.id)!;

    gl.bindTexture(gl.TEXTURE_2D, texture.glTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);

    return handle;
  }

  beginFrame(): void {
    if (!this.gl || !this.canvas) return;
    const gl = this.gl;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  endFrame(): void {
    // WebGL2 presents automatically, nothing to do
  }

  renderToScreen(texture: TextureHandle): void {
    if (!this.gl || !this.canvas) return;
    const gl = this.gl;

    const tex = this.textures.get(texture.id);
    if (!tex) return;

    // Render to screen (default framebuffer)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    this.drawQuadWithTexture(tex.glTexture);
  }

  renderToTexture(pass: RenderPassDescriptor): void {
    if (!this.gl || !pass.output || pass.inputs.length === 0) return;
    const gl = this.gl;

    const inputTex = this.textures.get(pass.inputs[0].id);
    const outputTex = this.textures.get(pass.output.id);

    if (!inputTex || !outputTex) return;

    // Create and bind framebuffer with output texture
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      outputTex.glTexture,
      0
    );

    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      throw new Error(`Framebuffer incomplete: ${status}`);
    }

    // Set viewport to output texture size
    const viewport = pass.viewport || { width: outputTex.width, height: outputTex.height };
    gl.viewport(0, 0, viewport.width, viewport.height);

    // Draw input texture to output
    this.drawQuadWithTexture(inputTex.glTexture);

    // Cleanup
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
  }

  private drawQuadWithTexture(glTexture: WebGLTexture): void {
    if (!this.gl || !this.blitProgram) return;
    const gl = this.gl;

    gl.useProgram(this.blitProgram);

    // Bind texture to texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.uniform1i(this.blitTextureLocation, 0);

    // Draw fullscreen quad using triangle strip
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  async readPixels(texture: TextureHandle): Promise<Uint8Array> {
    if (!this.gl) {
      throw new Error('WebGL2 backend not initialized');
    }
    const gl = this.gl;

    const tex = this.textures.get(texture.id);
    if (!tex) {
      throw new Error(`Texture not found: ${texture.id}`);
    }

    // Create framebuffer for reading
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.glTexture, 0);

    // Read pixels
    const pixels = new Uint8Array(tex.width * tex.height * 4);
    gl.readPixels(0, 0, tex.width, tex.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Cleanup
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);

    return pixels;
  }

  releaseTexture(handle: TextureHandle): void {
    if (!this.gl) return;

    const texture = this.textures.get(handle.id);
    if (texture) {
      this.gl.deleteTexture(texture.glTexture);
      this.textures.delete(handle.id);
    }
  }
}
