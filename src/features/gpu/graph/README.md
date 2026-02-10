# Shader Graph Module

Node-based shader graph system for building GPU effect pipelines.

## Overview

This module provides a directed acyclic graph (DAG) system for composing GPU effects. Users see a simple effect stack, but underneath it's a graph that can be optimized and compiled into efficient render passes.

## Usage

### Building a Graph

```typescript
import {
  ShaderGraphBuilder,
  GraphCompiler,
  NodeRegistry,
  registerBuiltinNodes,
} from '@/features/gpu/graph';

// Create and populate registry
const registry = new NodeRegistry();
registerBuiltinNodes(registry);

// Build graph
const graph = new ShaderGraphBuilder();

graph.addNode(registry.create('texture-source', 'src-1'));
graph.addNode(registry.create('brightness', 'brightness-1', { brightness: 0.2 }));
graph.addNode(registry.create('contrast', 'contrast-1', { contrast: 0.1 }));
graph.addNode(registry.create('output', 'out-1'));

// Connect nodes
graph.connect('src-1', 'output', 'brightness-1', 'input');
graph.connect('brightness-1', 'output', 'contrast-1', 'input');
graph.connect('contrast-1', 'output', 'out-1', 'input');

// Compile to render passes
const compiler = new GraphCompiler();
const passes = compiler.compile(graph.toGraph());
```

### Updating Parameters

```typescript
// Update brightness at runtime
graph.updateNodeParams('brightness-1', { brightness: 0.5 });

// Recompile (or use incremental update in future)
const newPasses = compiler.compile(graph.toGraph());
```

### Serialization

```typescript
// Export to JSON
const json = graph.toJSON();
localStorage.setItem('graph', JSON.stringify(json));

// Restore from JSON
const restored = ShaderGraphBuilder.fromJSON(JSON.parse(savedJson));
```

## Architecture

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

## Built-in Nodes

### Source Nodes
- `texture-source` - Video frame or image texture
- `color-source` - Solid color
- `gradient-source` - Linear gradient

### Effect Nodes
- `brightness` - Brightness adjustment (-1 to 1)
- `contrast` - Contrast adjustment (-1 to 1)
- `saturation` - Saturation adjustment (-1 to 1)
- `opacity` - Alpha/opacity adjustment (0 to 1)
- `brightness-contrast` - Combined brightness/contrast (efficient)

### Blur Nodes
- `blur` - Box blur (radius parameter)
- `gaussian-blur` - Gaussian blur (sigma parameter)
- `fast-blur` - Kawase blur (fast approximation)

### Output Nodes
- `output` - Screen output
- `export-output` - Export with resolution settings
- `preview-output` - Preview at scaled resolution

## API Reference

### ShaderNode

```typescript
interface ShaderNode {
  id: string;
  type: 'source' | 'effect' | 'blend' | 'transform' | 'output';
  name: string;
  inputs: Record<string, NodeInput>;
  outputs: Record<string, NodeOutput>;
  params: Record<string, ParamDef>;
  shader?: WGSLFragment;
}
```

### ShaderGraphBuilder

```typescript
class ShaderGraphBuilder {
  // Node management
  addNode(node: ShaderNode): void;
  removeNode(nodeId: string): boolean;
  getNode(nodeId: string): ShaderNode | undefined;
  updateNodeParams(nodeId: string, params: Record<string, unknown>): void;

  // Connections
  connect(fromNode: string, fromOutput: string, toNode: string, toInput: string): string;
  disconnect(connectionId: string): boolean;

  // Topology
  getTopologicallySorted(): ShaderNode[];

  // Serialization
  toJSON(): { nodes: ShaderNode[]; connections: Connection[] };
  toGraph(): ShaderGraph;
  static fromJSON(data): ShaderGraphBuilder;
}
```

### GraphCompiler

```typescript
class GraphCompiler {
  compile(graph: ShaderGraph): CompiledPass[];
}

interface CompiledPass {
  id: string;
  nodes: string[];
  shader: string;
  inputs: string[];
  output: string;
  uniforms: Record<string, unknown>;
}
```

## File Structure

```
src/features/gpu/graph/
├── types.ts              # Core type definitions
├── types.test.ts
├── node-registry.ts      # Node factory registry
├── node-registry.test.ts
├── shader-graph.ts       # Graph builder
├── shader-graph.test.ts
├── compiler.ts           # Graph to render passes
├── compiler.test.ts
├── integration.test.ts   # Integration tests
├── nodes/
│   ├── source-node.ts    # Source nodes
│   ├── effect-nodes.ts   # Color effects
│   ├── blur-node.ts      # Blur effects
│   ├── output-node.ts    # Output nodes
│   ├── index.ts          # Node exports
│   └── *.test.ts
├── index.ts              # Module exports
└── README.md             # This file
```

## Next Steps (Phase 3)

- **Render Graph**: Resource pool, pass merging, automatic optimization
- **Multi-layer Compositing**: Blend modes, alpha compositing
- **Transform Nodes**: Scale, rotate, translate, perspective
