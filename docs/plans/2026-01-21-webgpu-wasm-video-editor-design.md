# WebGPU & WASM Video Editor Design

## Overview

Transform FreeCut into a GPU-accelerated video editor using WebGPU for rendering and WASM (FFmpeg) for universal codec support, with graceful fallback to WebGL2/Canvas for broader browser compatibility.

## Goals

- **Preview performance** - Real-time effects, filters, color grading
- **Export speed** - GPU-accelerated rendering pipeline
- **Advanced effects** - Shader-based transitions, blur, keying, stabilization
- **Memory efficiency** - Better handling of multiple video streams, 4K content
- **Universal codec support** - Play any video format via FFmpeg.wasm fallback

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Browser support | Modern + fallback | WebGPU primary, WebGL2/Canvas fallback |
| WASM approach | Hybrid | WebCodecs fast path, FFmpeg.wasm for exotic codecs |
| Effects architecture | Shader graph | Stack UI for users, graph engine internally |
| Memory strategy | External texture import | Zero-copy from video elements when possible |
| Render pipeline | Render graph | Automatic pass merging and optimization |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FreeCut Editor                           │
├─────────────────────────────────────────────────────────────────┤
│  Timeline UI ←→ Composition Graph ←→ Playback Controller       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Rendering Abstraction Layer                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ WebGPU Backend  │  │ WebGL2 Backend  │  │ Canvas Backend  │ │
│  │   (Primary)     │  │   (Fallback)    │  │  (Last Resort)  │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
└───────────┼────────────────────┼────────────────────┼──────────┘
            │                    │                    │
┌───────────▼────────────────────▼────────────────────▼──────────┐
│                      Media Layer                                │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ WebCodecs (Fast Path)│  │ FFmpeg.wasm (Exotic Codecs)  │    │
│  │ H.264, VP9, AV1      │  │ ProRes, HEVC*, DNxHD         │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key principles:**
- **Rendering abstraction** - Same composition renders identically across backends
- **Capability detection** - Runtime check for WebGPU → WebGL2 → Canvas fallback chain
- **Media flexibility** - WebCodecs handles 90% of files fast, FFmpeg.wasm catches the rest
- **Existing HTML5 player** - Becomes the Canvas backend with minimal changes

---

## Shader Graph Engine

The core of the effects system. Users see a simple stack, but underneath it's a directed acyclic graph (DAG).

```
User sees (Stack UI):          Engine builds (Graph):
┌─────────────────────┐
│ Clip: video.mp4     │        ┌─────────┐
├─────────────────────┤        │ Source  │──┐
│ ▸ Color Correction  │        └─────────┘  │
│ ▸ Sharpen           │                     ▼
│ ▸ Vignette          │        ┌────────────────────┐
└─────────────────────┘        │ ColorCorrect Node  │──┐
                               └────────────────────┘  │
                                                       ▼
                               ┌────────────────────┐
                               │   Sharpen Node     │──┐
                               └────────────────────┘  │
                                                       ▼
                               ┌────────────────────┐
                               │   Vignette Node    │──► Output
                               └────────────────────┘
```

### Node Types

- **Source nodes** - Video frame, image, solid color, gradient
- **Effect nodes** - Color ops, blur, sharpen, distort, stylize
- **Blend nodes** - Combine two inputs with blend mode + mask
- **Transform nodes** - Scale, rotate, translate, perspective
- **Output nodes** - Final composition, export target

### Graph Features

- Nodes declare inputs/outputs with types (Color, Alpha, Vector, Number)
- Automatic type coercion (grayscale → color, etc.)
- Nodes can be "merged" when compatible (adjacent color ops → single shader)
- Each node is a WGSL shader fragment that gets compiled into render passes

### Data Structures

```typescript
interface ShaderNode {
  id: string;
  type: NodeType;
  inputs: Record<string, Connection | Value>;
  outputs: Record<string, ConnectionPoint>;
  params: Record<string, ParamValue>;  // User-adjustable
  shader: WGSLFragment;                 // GPU code
}

interface ShaderGraph {
  nodes: Map<string, ShaderNode>;
  connections: Connection[];
  compile(): RenderGraph;  // Optimizes into render passes
}
```

---

## Render Graph Execution

The render graph takes a compiled shader graph and figures out the optimal GPU execution strategy.

```
Shader Graph (what)          Render Graph (how)
────────────────────         ──────────────────────────────────

Source → ColorCorrect        Pass 0: Import video texture
       → Sharpen             Pass 1: ColorCorrect + Sharpen (merged!)
       → Vignette → Out      Pass 2: Vignette → Screen

                             Optimization: Adjacent color ops
                             merged into single pass
```

### Responsibilities

1. **Pass merging** - Combines compatible operations
   - Sequential color math → single shader
   - Same-resolution effects → batched

2. **Resource management**
   - Allocates GPU textures on demand
   - Reuses textures when safe (A finishes before B needs space)
   - Handles resolution changes (blur at half-res, upscale back)

3. **Dependency tracking**
   - Builds execution order from graph topology
   - Identifies parallel opportunities (two independent branches)

### Core Structures

```typescript
interface RenderPass {
  id: string;
  shader: GPUShaderModule;
  inputs: GPUTexture[];
  output: GPUTexture | 'screen';
  uniforms: GPUBuffer;
  viewport: { width: number; height: number };
}

interface RenderGraph {
  passes: RenderPass[];
  resources: ResourcePool;

  execute(encoder: GPUCommandEncoder, frame: FrameContext): void;
  recompile(shaderGraph: ShaderGraph): void;
}

interface ResourcePool {
  acquireTexture(width: number, height: number, format: GPUTextureFormat): GPUTexture;
  release(texture: GPUTexture): void;
}
```

### Frame Execution Flow

1. Decode frame (WebCodecs or FFmpeg.wasm)
2. Import to GPU texture
3. Execute render passes in order
4. Present final texture to canvas (preview) or read back (export)

---

## Media Layer (WASM + WebCodecs)

The hybrid decoder system that handles any format.

```
┌─────────────────────────────────────────────────────────────┐
│                     MediaSourceManager                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  file.mp4 ──► Probe Format ──► Can WebCodecs handle it?    │
│                                       │                     │
│                          ┌────────────┴────────────┐        │
│                          ▼                         ▼        │
│                   ┌─────────────┐          ┌─────────────┐  │
│                   │ WebCodecs   │          │ FFmpeg.wasm │  │
│                   │ Decoder     │          │ Decoder     │  │
│                   │ (fast path) │          │ (fallback)  │  │
│                   └──────┬──────┘          └──────┬──────┘  │
│                          │                        │         │
│                          ▼                        ▼         │
│                   ┌─────────────────────────────────────┐   │
│                   │      Unified Frame Interface        │   │
│                   │  VideoFrame | ImageBitmap | Buffer  │   │
│                   └─────────────────────────────────────┘   │
│                                    │                        │
└────────────────────────────────────┼────────────────────────┘
                                     ▼
                              GPU Texture Import
```

### Codec Routing

```typescript
interface MediaDecoder {
  canDecode(codec: string): boolean;
  decode(packet: EncodedPacket): Promise<DecodedFrame>;
  seek(timeMs: number): Promise<void>;
  destroy(): void;
}

class MediaSourceManager {
  private webCodecsDecoder: WebCodecsDecoder;
  private ffmpegDecoder: FFmpegDecoder;  // Lazy-loaded

  async openSource(file: File): Promise<MediaSource> {
    const probe = await this.probeFormat(file);

    // Try WebCodecs first (fast path)
    if (this.webCodecsDecoder.canDecode(probe.videoCodec)) {
      return new WebCodecsSource(file, probe);
    }

    // Fall back to FFmpeg.wasm (lazy load ~25MB)
    if (!this.ffmpegDecoder) {
      this.ffmpegDecoder = await FFmpegDecoder.load();
    }
    return new FFmpegSource(file, probe, this.ffmpegDecoder);
  }
}
```

### WebCodecs Fast Path (90% of files)

- H.264, VP8, VP9, AV1
- Hardware-accelerated on most devices
- Frames arrive as `VideoFrame` - direct GPU import via `importExternalTexture()`

### FFmpeg.wasm Fallback

- ProRes, DNxHD, HEVC (on Safari), exotic formats
- Decodes to raw pixels in WASM memory
- Uploaded to GPU via staging buffer
- Lazy-loaded only when needed (keeps initial bundle small)

### Frame Cache

```typescript
class FrameCache {
  private cache: LRUCache<string, GPUTexture>;
  private maxMemoryMB: number = 512;  // Configurable

  get(source: string, frame: number): GPUTexture | null;
  set(source: string, frame: number, texture: GPUTexture): void;
  prefetch(source: string, startFrame: number, count: number): void;
}
```

---

## Rendering Backend Abstraction

The layer that makes WebGPU, WebGL2, and Canvas interchangeable.

### Interface

```typescript
interface RenderBackend {
  readonly name: 'webgpu' | 'webgl2' | 'canvas';
  readonly capabilities: BackendCapabilities;

  // Lifecycle
  init(canvas: HTMLCanvasElement): Promise<void>;
  destroy(): void;

  // Textures
  createTexture(width: number, height: number, format: TextureFormat): TextureHandle;
  importVideoFrame(frame: VideoFrame): TextureHandle;
  importImageBitmap(bitmap: ImageBitmap): TextureHandle;
  uploadPixels(handle: TextureHandle, data: Uint8Array): void;

  // Rendering
  beginFrame(): FrameEncoder;
  executePass(pass: RenderPassDescriptor): void;
  endFrame(): void;

  // Readback (for export)
  readPixels(texture: TextureHandle): Promise<Uint8Array>;
}

interface BackendCapabilities {
  maxTextureSize: number;
  supportsFloat16: boolean;
  supportsComputeShaders: boolean;  // WebGPU only
  supportsExternalTextures: boolean;
  maxColorAttachments: number;
}
```

### Backend Selection

```typescript
async function createBestBackend(canvas: HTMLCanvasElement): Promise<RenderBackend> {
  // Try WebGPU first
  if (navigator.gpu) {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      const device = await adapter.requestDevice();
      return new WebGPUBackend(canvas, device);
    }
  }

  // Fall back to WebGL2
  const gl = canvas.getContext('webgl2');
  if (gl) {
    return new WebGL2Backend(canvas, gl);
  }

  // Last resort: Canvas 2D (limited effects)
  return new CanvasBackend(canvas);
}
```

### Shader Translation

- Effects authored in WGSL (WebGPU's shader language)
- **WebGL2 backend**: Auto-transpile WGSL → GLSL at build time using `naga`
- **Canvas backend**: Pre-baked effect implementations using Canvas filters

### Feature Support Matrix

| Feature | WebGPU | WebGL2 | Canvas |
|---------|--------|--------|--------|
| Color grading | Full | Full | Basic |
| Blur/Sharpen | Compute | Multi-pass | CSS filter |
| Blend modes | All | All | Common |
| Custom shaders | Yes | Yes | No |
| 4K realtime | Yes | Maybe | No |
| Compute shaders | Yes | No | No |

---

## Integration with Existing Codebase

```
Current Architecture:              New Architecture:

Timeline Store ──────────────────► Timeline Store (unchanged)
      │                                  │
      ▼                                  ▼
MainComposition                    CompositionCompiler
      │                                  │
      ▼                                  ▼
HTML5 Video/Audio                  ShaderGraph + AudioGraph
      │                                  │
      ▼                                  ▼
DOM Rendering                      RenderGraph
      │                                  │
      ▼                                  ▼
Canvas (export only)               GPU Backend ──► Canvas Output
```

### Composition Compiler

```typescript
class CompositionCompiler {
  compile(items: TimelineItem[], frame: number): ShaderGraph {
    const graph = new ShaderGraph();

    const visible = items.filter(item =>
      frame >= item.from && frame < item.from + item.duration
    );

    for (const item of visible) {
      const sourceNode = this.createSourceNode(item);
      const effectChain = this.buildEffectChain(item.effects, sourceNode);
      graph.addBranch(effectChain);
    }

    graph.addCompositeNode(visible.map(v => v.id));
    return graph;
  }
}
```

### Clock Integration

```typescript
class GPUPlayer {
  private clock: Clock;
  private compiler: CompositionCompiler;
  private renderGraph: RenderGraph;
  private backend: RenderBackend;

  constructor(clock: Clock, backend: RenderBackend) {
    this.clock = clock;
    clock.on('framechange', (frame) => this.renderFrame(frame));
  }

  private renderFrame(frame: number) {
    const shaderGraph = this.compiler.compile(this.items, frame);
    this.renderGraph.recompile(shaderGraph);
    this.renderGraph.execute(frame);
  }
}
```

### Fallback Strategy

```typescript
function VideoPreview() {
  const backend = useRenderBackend();

  if (backend.name === 'canvas' && !hasGPUEffects(items)) {
    return <LegacyHTMLPlayer items={items} />;
  }

  return <GPUCompositionPlayer items={items} backend={backend} />;
}
```

---

## Export Pipeline

GPU-accelerated export with pipelining.

### Optimizations

1. **Batch readback** - Read multiple frames before encoding
2. **Double/triple buffering** - Render frame N+1 while encoding frame N
3. **Resolution scaling** - Render at export resolution
4. **Compute shader prep** - GPU-side RGB→YUV conversion

### Implementation

```typescript
class GPUExporter {
  private backend: RenderBackend;
  private encoder: VideoEncoder;
  private framePool: GPUTexture[];  // Triple buffer

  async export(
    items: TimelineItem[],
    options: ExportOptions,
    onProgress: (p: number) => void
  ): Promise<Blob> {
    const { width, height, fps, codec } = options;
    const totalFrames = Math.ceil(options.duration * fps);

    this.encoder = new VideoEncoder({
      output: (chunk) => this.muxer.addVideoChunk(chunk),
      error: (e) => console.error(e),
    });

    await this.encoder.configure({
      codec, width, height,
      bitrate: options.bitrate,
      framerate: fps,
    });

    for (let frame = 0; frame < totalFrames; frame++) {
      const bufferIdx = frame % 3;
      const texture = this.framePool[bufferIdx];

      const graph = this.compiler.compile(items, frame);
      await this.renderGraph.executeToTexture(graph, texture);

      const pixels = await this.backend.readPixels(texture);

      const videoFrame = new VideoFrame(pixels, {
        timestamp: (frame / fps) * 1_000_000,
        codedWidth: width,
        codedHeight: height,
      });

      this.encoder.encode(videoFrame);
      videoFrame.close();

      onProgress(frame / totalFrames);
    }

    await this.encoder.flush();
    return this.muxer.finalize();
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation
- Implement `RenderBackend` interface
- WebGPU backend with basic texture ops
- WebGL2 backend as fallback
- Single full-screen quad rendering
- Replace current canvas export path with GPU backend
- **Deliverable:** Same functionality, GPU-accelerated path available

### Phase 2: Shader Graph Core
- Node system with Source, Effect, Output nodes
- Graph compiler (nodes → render passes)
- 3-4 essential effects: Brightness/Contrast, Saturation, Blur, Opacity
- Effect stack UI wired to graph
- **Deliverable:** Basic color grading on GPU

### Phase 3: Render Graph + Compositing
- Resource pool for texture reuse
- Pass merging optimization
- Multi-layer compositing (blend modes, alpha)
- Transform nodes (scale, rotate, translate)
- **Deliverable:** Full layered composition on GPU

### Phase 4: Media Layer (FFmpeg.wasm)
- Lazy-loaded FFmpeg.wasm integration
- Codec detection and routing
- Frame cache with LRU eviction
- Preloading during playback
- **Deliverable:** Play any video format

### Phase 5: Advanced Effects + Polish
- Expanded effect library (LUTs, masks, keying)
- Transitions as graph connections
- Performance profiling and optimization
- Mobile/tablet testing
- **Deliverable:** Production-ready editor

---

## File Structure

```
src/features/gpu/
├── backend/
│   ├── types.ts              # RenderBackend interface
│   ├── webgpu-backend.ts
│   ├── webgl2-backend.ts
│   ├── canvas-backend.ts
│   └── create-backend.ts     # Auto-selection
├── graph/
│   ├── shader-graph.ts
│   ├── render-graph.ts
│   ├── nodes/
│   │   ├── source-node.ts
│   │   ├── effect-node.ts
│   │   ├── blend-node.ts
│   │   └── output-node.ts
│   └── compiler.ts
├── effects/
│   ├── color-correct.wgsl
│   ├── blur.wgsl
│   ├── sharpen.wgsl
│   └── index.ts
├── media/
│   ├── media-source-manager.ts
│   ├── webcodecs-decoder.ts
│   ├── ffmpeg-decoder.ts
│   ├── frame-cache.ts
│   └── codec-support.ts
├── export/
│   └── gpu-exporter.ts
└── player/
    ├── gpu-player.tsx
    └── composition-compiler.ts
```

---

## Dependencies

### Required
- None for WebGPU/WebGL2 (browser native)

### Optional
- `@ffmpeg/ffmpeg` - FFmpeg.wasm for exotic codec support (~25MB lazy-loaded)
- `naga-wasm` or build-time transpiler - WGSL → GLSL for WebGL2 backend

---

## Browser Support

| Browser | WebGPU | WebGL2 | Canvas |
|---------|--------|--------|--------|
| Chrome 113+ | Yes | Fallback | Fallback |
| Edge 113+ | Yes | Fallback | Fallback |
| Firefox 118+ | Yes | Fallback | Fallback |
| Safari 17+ | Yes | Fallback | Fallback |
| Older browsers | No | Yes | Yes |

---

## Success Criteria

1. **Preview**: 30fps playback with 3+ effects on 1080p content
2. **Export**: 2x faster than current canvas-based export
3. **Compatibility**: Graceful degradation on WebGL2/Canvas
4. **Codec support**: Play ProRes, DNxHD via FFmpeg.wasm
5. **Memory**: Handle 3+ 4K video tracks without crashing
