/**
 * Shader Graph Module
 *
 * Node-based shader graph system for building GPU effect pipelines.
 * Includes render graph execution, resource pooling, and layer compositing.
 */

// Types
export type {
  ShaderNode,
  NodeInput,
  NodeOutput,
  Connection,
  ConnectionEndpoint,
  ShaderGraph,
  CompiledPass,
  NodeType,
  DataType,
  ParamType,
  ParamDef,
  WGSLFragment,
  NodeFactory,
  NodeRegistry as INodeRegistry,
  BlendMode,
} from './types';

// Graph builder
export { ShaderGraphBuilder } from './shader-graph';

// Node registry
export { NodeRegistry, globalRegistry } from './node-registry';

// Graph compiler
export { GraphCompiler, globalCompiler } from './compiler';

// Resource pool
export { ResourcePool } from './resource-pool';
export type { TextureDescriptor, PooledTexture } from './resource-pool';

// Render graph
export { RenderGraph } from './render-graph';
export type { FrameDimensions, PassExecutionContext, PassExecuteCallback } from './render-graph';

// Pass merger
export { PassMerger, createPassMerger, canMergePasses, getNodeCategory, getPassCategory } from './pass-merger';
export type { MergeCategory, PassMergeInfo, MergeResult } from './pass-merger';

// Compositor
export { Compositor, createCompositor, createCompositorWithLayers } from './compositor';
export type { CompositorLayer, CompositionSettings, CompositorResult } from './compositor';

// Graph renderer (backend integration)
export { GraphRenderer, createGraphRenderer } from './graph-renderer';
export type { GraphRendererOptions, SourceTextureInfo, RenderResult } from './graph-renderer';

// Built-in nodes
export * from './nodes';
