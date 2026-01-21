# GPU Rendering Module

GPU-accelerated rendering abstraction layer for FreeCut video editor.

## Overview

This module provides a unified interface for rendering video frames using WebGPU, WebGL2, or Canvas 2D, with automatic fallback based on browser capabilities.

## Usage

### Basic Usage with React Hook

```tsx
import { useRenderBackend } from '@/features/gpu';

function VideoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { backend, isLoading, error } = useRenderBackend(canvasRef);

  useEffect(() => {
    if (!backend) return;

    // Create a texture from video frame
    const texture = backend.importVideoFrame(videoFrame);

    // Render to screen
    backend.beginFrame();
    backend.renderToScreen(texture);
    backend.endFrame();
  }, [backend]);

  if (isLoading) return <div>Loading GPU...</div>;
  if (error) return <div>Error: {error}</div>;

  return <canvas ref={canvasRef} width={1920} height={1080} />;
}
```

### Manual Backend Creation

```typescript
import { createBackend } from '@/features/gpu';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const backend = await createBackend(canvas, {
  preferredBackend: 'webgpu', // optional: 'webgpu' | 'webgl2' | 'canvas'
  debug: true,                // optional: enable debug logging
});

console.log(`Using ${backend.name} backend`);
console.log('Capabilities:', backend.capabilities);

// Clean up when done
backend.destroy();
```

### Capability Detection

```typescript
import { detectBestBackend, getAvailableBackendNames } from '@/features/gpu';

const available = await getAvailableBackendNames();
console.log('Available backends:', available);
// e.g., ['webgpu', 'webgl2', 'canvas']

const best = await detectBestBackend();
console.log('Best backend:', best);
// e.g., 'webgpu'
```

## Architecture

```
┌─────────────────────────────────────────┐
│          RenderBackend Interface        │
├─────────────────────────────────────────┤
│ createTexture()  │ importVideoFrame()   │
│ uploadPixels()   │ importImageBitmap()  │
│ beginFrame()     │ renderToScreen()     │
│ endFrame()       │ renderToTexture()    │
│ readPixels()     │ destroy()            │
└────────┬────────────────┬───────────────┘
         │                │
    ┌────┴────┐      ┌────┴────┐      ┌────────────┐
    │ WebGPU  │      │ WebGL2  │      │   Canvas   │
    │ Backend │      │ Backend │      │   Backend  │
    └─────────┘      └─────────┘      └────────────┘
```

## Backends

### WebGPU (Primary)
- Full GPU acceleration with WGSL shaders
- Compute shader support for advanced effects
- External video texture import (zero-copy when possible)
- Best performance and capabilities
- Requires Chrome 113+, Edge 113+, or Safari 18+

### WebGL2 (Fallback)
- GPU acceleration with GLSL ES 3.0 shaders
- Wide browser support (95%+ coverage)
- Good performance for most use cases
- No compute shader support

### Canvas 2D (Last Resort)
- CPU-based rendering
- Universal browser support
- Limited to basic operations (no shaders)
- Suitable for simple previews

## API Reference

### RenderBackend Interface

```typescript
interface RenderBackend {
  // Properties
  readonly name: 'webgpu' | 'webgl2' | 'canvas';
  readonly capabilities: BackendCapabilities;

  // Lifecycle
  init(canvas: HTMLCanvasElement): Promise<void>;
  destroy(): void;

  // Texture Management
  createTexture(width: number, height: number, format: TextureFormat): TextureHandle;
  uploadPixels(handle: TextureHandle, data: Uint8Array | Uint8ClampedArray): void;
  importVideoFrame(frame: VideoFrame): TextureHandle;
  importImageBitmap(bitmap: ImageBitmap): TextureHandle;

  // Rendering
  beginFrame(): void;
  endFrame(): void;
  renderToScreen(texture: TextureHandle): void;
  renderToTexture(pass: RenderPassDescriptor): void;

  // Readback (for export)
  readPixels(texture: TextureHandle): Promise<Uint8Array>;
}
```

### BackendCapabilities

```typescript
interface BackendCapabilities {
  maxTextureSize: number;         // Maximum texture dimension
  supportsFloat16: boolean;       // 16-bit float textures
  supportsComputeShaders: boolean;// Compute shaders (WebGPU only)
  supportsExternalTextures: boolean; // Direct video import
  maxColorAttachments: number;    // MRT support
}
```

### TextureHandle

```typescript
interface TextureHandle {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
}

type TextureFormat = 'rgba8unorm' | 'rgba16float' | 'rgba32float' | 'bgra8unorm';
```

## Testing

```bash
# Run all GPU tests
npm run test:run -- src/features/gpu/

# Run with coverage
npm run test:coverage -- src/features/gpu/

# Run specific test file
npm run test:run -- src/features/gpu/backend/webgpu-backend.test.ts
```

## File Structure

```
src/features/gpu/
├── backend/
│   ├── types.ts              # Core type definitions
│   ├── types.test.ts
│   ├── capabilities.ts       # Backend detection
│   ├── capabilities.test.ts
│   ├── canvas-backend.ts     # Canvas 2D implementation
│   ├── canvas-backend.test.ts
│   ├── webgl2-backend.ts     # WebGL2 implementation
│   ├── webgl2-backend.test.ts
│   ├── webgpu-backend.ts     # WebGPU implementation
│   ├── webgpu-backend.test.ts
│   ├── create-backend.ts     # Factory function
│   ├── create-backend.test.ts
│   └── index.ts              # Backend exports
├── hooks/
│   ├── use-render-backend.ts     # React hook
│   ├── use-render-backend.test.tsx
│   └── index.ts
├── integration.test.ts       # Integration tests
├── index.ts                  # Main module exports
└── README.md                 # This file
```

## Next Steps (Phase 2)

This Phase 1 implementation establishes the rendering backend foundation. Future phases will add:

- **Shader Graph Core**: Effect node system and graph compiler
- **WASM Integration**: Video decoding with WebCodecs/FFmpeg.wasm
- **Effect Pipeline**: Built-in effects (blur, color correction, transitions)
- **Render Graph**: Automatic batching and optimization
