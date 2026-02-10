/**
 * Multi-Layer Compositor
 *
 * Manages layer composition with blend modes, opacity, and z-ordering.
 * Generates shader graph for efficient GPU-based compositing.
 */

import type { CompiledPass, BlendMode } from './types';
import { ShaderGraphBuilder } from './shader-graph';
import { GraphCompiler } from './compiler';
import { createTextureSourceNode } from './nodes/source-node';
import { createBlendNode } from './nodes/blend-node';
import { createTransformNode } from './nodes/transform-node';
import { createOpacityNode } from './nodes/effect-nodes';
import { createOutputNode } from './nodes/output-node';

/**
 * Layer definition for compositing
 */
export interface CompositorLayer {
  /** Unique layer ID */
  id: string;
  /** Layer name for display */
  name?: string;
  /** Source texture ID */
  sourceId: string;
  /** Layer visibility */
  visible: boolean;
  /** Layer opacity (0.0 - 1.0) */
  opacity: number;
  /** Blend mode for compositing */
  blendMode: BlendMode;
  /** Z-index for ordering (higher = on top) */
  zIndex: number;
  /** Transform parameters */
  transform?: {
    scaleX?: number;
    scaleY?: number;
    rotation?: number;
    translateX?: number;
    translateY?: number;
    anchorX?: number;
    anchorY?: number;
  };
  /** Optional clip bounds (normalized 0-1) */
  clipBounds?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

/**
 * Composition settings
 */
export interface CompositionSettings {
  /** Composition width in pixels */
  width: number;
  /** Composition height in pixels */
  height: number;
  /** Background color (RGBA normalized 0-1) */
  backgroundColor?: [number, number, number, number];
}

/**
 * Result of compositor build
 */
interface CompositorResult {
  /** Generated shader graph */
  graph: ShaderGraphBuilder;
  /** Compiled render passes */
  passes: CompiledPass[];
  /** Ordered layer IDs (bottom to top) */
  layerOrder: string[];
}

/**
 * Multi-Layer Compositor
 *
 * Composes multiple layers with effects into a single output.
 */
export class Compositor {
  private layers: Map<string, CompositorLayer> = new Map();
  private settings: CompositionSettings = { width: 1920, height: 1080 };
  private compiler: GraphCompiler;

  constructor() {
    this.compiler = new GraphCompiler();
  }

  /**
   * Set composition settings
   */
  setSettings(settings: CompositionSettings): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Get composition settings
   */
  getSettings(): CompositionSettings {
    return { ...this.settings };
  }

  /**
   * Add a layer to the composition
   */
  addLayer(layer: CompositorLayer): void {
    this.layers.set(layer.id, { ...layer });
  }

  /**
   * Remove a layer from the composition
   */
  removeLayer(layerId: string): boolean {
    return this.layers.delete(layerId);
  }

  /**
   * Update a layer's properties
   */
  updateLayer(layerId: string, updates: Partial<CompositorLayer>): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    this.layers.set(layerId, { ...layer, ...updates, id: layerId });
    return true;
  }

  /**
   * Get a layer by ID
   */
  getLayer(layerId: string): CompositorLayer | undefined {
    const layer = this.layers.get(layerId);
    return layer ? { ...layer } : undefined;
  }

  /**
   * Get all layers
   */
  getLayers(): CompositorLayer[] {
    return Array.from(this.layers.values()).map((l) => ({ ...l }));
  }

  /**
   * Get layers sorted by z-index (bottom to top)
   */
  getOrderedLayers(): CompositorLayer[] {
    return this.getLayers()
      .filter((l) => l.visible)
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Set layer z-index
   */
  setLayerZIndex(layerId: string, zIndex: number): boolean {
    return this.updateLayer(layerId, { zIndex });
  }

  /**
   * Move layer to top
   */
  moveLayerToTop(layerId: string): boolean {
    const layers = this.getLayers();
    const maxZ = Math.max(...layers.map((l) => l.zIndex), 0);
    return this.setLayerZIndex(layerId, maxZ + 1);
  }

  /**
   * Move layer to bottom
   */
  moveLayerToBottom(layerId: string): boolean {
    const layers = this.getLayers();
    const minZ = Math.min(...layers.map((l) => l.zIndex), 0);
    return this.setLayerZIndex(layerId, minZ - 1);
  }

  /**
   * Clear all layers
   */
  clear(): void {
    this.layers.clear();
  }

  /**
   * Build the compositor graph
   */
  build(): CompositorResult {
    const graph = new ShaderGraphBuilder();
    const orderedLayers = this.getOrderedLayers();

    if (orderedLayers.length === 0) {
      // No visible layers - create a transparent output
      const outputNode = createOutputNode('output');
      graph.addNode(outputNode);

      return {
        graph,
        passes: [],
        layerOrder: [],
      };
    }

    // Create source nodes for each layer
    const layerNodeIds: Map<string, string> = new Map();

    for (const layer of orderedLayers) {
      const sourceNode = createTextureSourceNode(`source-${layer.id}`, {
        textureId: layer.sourceId,
      });
      graph.addNode(sourceNode);

      let currentNodeId = sourceNode.id;

      // Apply transform if specified
      if (layer.transform) {
        const transformNode = createTransformNode(`transform-${layer.id}`, layer.transform);
        graph.addNode(transformNode);
        graph.connect(currentNodeId, 'output', transformNode.id, 'input');
        currentNodeId = transformNode.id;
      }

      // Apply opacity if not 1.0
      if (layer.opacity < 1.0) {
        const opacityNode = createOpacityNode(`opacity-${layer.id}`, {
          opacity: layer.opacity,
        });
        graph.addNode(opacityNode);
        graph.connect(currentNodeId, 'output', opacityNode.id, 'input');
        currentNodeId = opacityNode.id;
      }

      layerNodeIds.set(layer.id, currentNodeId);
    }

    // Compose layers bottom to top
    let compositeNodeId: string | null = null;

    for (let i = 0; i < orderedLayers.length; i++) {
      const layer = orderedLayers[i];
      const layerNodeId = layerNodeIds.get(layer.id)!;

      if (i === 0) {
        // First layer is the base
        compositeNodeId = layerNodeId;
      } else {
        // Blend with previous composite
        const blendNode = createBlendNode(`blend-${layer.id}`, {
          mode: layer.blendMode,
          opacity: 1.0, // Opacity already applied to layer
        });
        graph.addNode(blendNode);

        // Connect base (previous composite) and blend (current layer)
        graph.connect(compositeNodeId!, 'output', blendNode.id, 'base');
        graph.connect(layerNodeId, 'output', blendNode.id, 'blend');

        compositeNodeId = blendNode.id;
      }
    }

    // Create output node
    const outputNode = createOutputNode('output');
    graph.addNode(outputNode);

    if (compositeNodeId) {
      graph.connect(compositeNodeId, 'output', outputNode.id, 'input');
    }

    // Compile to passes
    const passes = this.compiler.compile(graph.toGraph());

    return {
      graph,
      passes,
      layerOrder: orderedLayers.map((l) => l.id),
    };
  }

  /**
   * Get composition statistics
   */
  getStats(): {
    totalLayers: number;
    visibleLayers: number;
    blendOperations: number;
  } {
    const layers = this.getLayers();
    const visibleLayers = layers.filter((l) => l.visible);

    return {
      totalLayers: layers.length,
      visibleLayers: visibleLayers.length,
      blendOperations: Math.max(0, visibleLayers.length - 1),
    };
  }
}

/**
 * Create a new compositor instance
 */
export function createCompositor(): Compositor {
  return new Compositor();
}

/**
 * Create a compositor with initial layers
 */
export function createCompositorWithLayers(
  layers: CompositorLayer[],
  settings?: CompositionSettings
): Compositor {
  const compositor = new Compositor();

  if (settings) {
    compositor.setSettings(settings);
  }

  for (const layer of layers) {
    compositor.addLayer(layer);
  }

  return compositor;
}
