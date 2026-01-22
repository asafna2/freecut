# WebGPU Phase 3: Render Graph + Compositing Implementation Plan

**Goal:** Build the render graph execution system with resource pooling, pass optimization, multi-layer compositing with blend modes, and transform nodes.

**Deliverable:** Full layered composition on GPU with automatic optimization.

---

## Prerequisites

- Phase 1 complete (RenderBackend abstraction)
- Phase 2 complete (Shader Graph Core)
- All tests pass (`npm run test:run`)

---

## Task 1: Resource Pool for Texture Reuse

**Files:**
- Create: `src/features/gpu/graph/resource-pool.ts`
- Create: `src/features/gpu/graph/resource-pool.test.ts`

Implement a texture pool that:
- Allocates textures on demand
- Reuses textures when safe (after a pass completes)
- Tracks texture lifetimes
- Handles resolution changes

---

## Task 2: Render Graph Executor

**Files:**
- Create: `src/features/gpu/graph/render-graph.ts`
- Create: `src/features/gpu/graph/render-graph.test.ts`

Build the execution engine that:
- Takes compiled passes from GraphCompiler
- Manages texture allocation via ResourcePool
- Executes passes in order
- Handles screen vs texture output

---

## Task 3: Blend Node for Compositing

**Files:**
- Create: `src/features/gpu/graph/nodes/blend-node.ts`
- Create: `src/features/gpu/graph/nodes/blend-node.test.ts`

Implement blend modes:
- Normal, Multiply, Screen, Overlay
- Add, Subtract, Difference
- Darken, Lighten
- Alpha compositing (over, under)

---

## Task 4: Transform Node

**Files:**
- Create: `src/features/gpu/graph/nodes/transform-node.ts`
- Create: `src/features/gpu/graph/nodes/transform-node.test.ts`

Implement transforms:
- Scale (uniform and non-uniform)
- Rotate (degrees)
- Translate (x, y)
- Anchor point
- Matrix composition

---

## Task 5: Pass Merging Optimization

**Files:**
- Update: `src/features/gpu/graph/compiler.ts`
- Create: `src/features/gpu/graph/pass-merger.ts`
- Create: `src/features/gpu/graph/pass-merger.test.ts`

Optimize render passes:
- Merge adjacent color operations into single shader
- Detect compatible passes (same resolution, no branching)
- Generate combined WGSL code

---

## Task 6: Multi-Layer Compositor

**Files:**
- Create: `src/features/gpu/graph/compositor.ts`
- Create: `src/features/gpu/graph/compositor.test.ts`

Build layer compositor:
- Stack multiple layers with blend modes
- Handle layer opacity
- Z-ordering
- Clip to composition bounds

---

## Task 7: Integration with Backend

**Files:**
- Create: `src/features/gpu/graph/graph-renderer.ts`
- Create: `src/features/gpu/graph/graph-renderer.test.ts`

Connect graph execution to RenderBackend:
- Create textures via backend
- Execute render passes
- Handle screen output
- Support export readback

---

## Task 8: Integration Tests

**Files:**
- Create: `src/features/gpu/graph/render-integration.test.ts`

Full pipeline tests:
- Build graph → compile → execute → verify output
- Multi-layer compositing
- Transform + effects chain
- Resource pool efficiency

---

## Task 9: Documentation and Cleanup

**Files:**
- Update: `src/features/gpu/graph/README.md`
- Update: `src/features/gpu/graph/index.ts`

---

## Phase 3 Complete Checklist

- [x] Resource pool for texture reuse
- [x] Render graph executor
- [x] Blend nodes (13 blend modes)
- [x] Transform nodes (scale, rotate, translate, flip, crop)
- [x] Pass merging optimization
- [x] Multi-layer compositor
- [x] Backend integration (GraphRenderer)
- [x] Integration tests (14 comprehensive tests)
- [x] Documentation and exports
