/**
 * Pass Merger
 *
 * Optimizes render passes by merging compatible operations into single passes.
 * This reduces GPU draw calls and texture reads for chained effects.
 */

import type { CompiledPass } from './types';

/**
 * Categories of operations that can be merged
 */
type MergeCategory = 'color' | 'transform' | 'blur' | 'blend' | 'unknown';

/**
 * Information about a pass's merge compatibility
 */
interface PassMergeInfo {
  pass: CompiledPass;
  category: MergeCategory;
  canMerge: boolean;
  dependencies: Set<string>;
}

/**
 * Result of pass merging
 */
interface MergeResult {
  passes: CompiledPass[];
  mergedCount: number;
  originalCount: number;
}

/**
 * Determine the merge category for a node based on its name/type
 */
export function getNodeCategory(nodeName: string): MergeCategory {
  // Color correction operations (can be merged)
  const colorOps = [
    'brightness',
    'contrast',
    'saturation',
    'opacity',
    'brightness-contrast',
    'color',
  ];
  if (colorOps.some((op) => nodeName.includes(op))) {
    return 'color';
  }

  // Transform operations (generally can't merge with color)
  const transformOps = ['scale', 'rotate', 'translate', 'transform', 'flip', 'crop'];
  if (transformOps.some((op) => nodeName.includes(op))) {
    return 'transform';
  }

  // Blur operations (multi-pass, can't easily merge)
  if (nodeName.includes('blur')) {
    return 'blur';
  }

  // Blend operations (needs two inputs, can't merge with single-input ops)
  if (nodeName.includes('blend')) {
    return 'blend';
  }

  return 'unknown';
}

/**
 * Check if two passes can be merged
 */
export function canMergePasses(passA: CompiledPass, passB: CompiledPass): boolean {
  // Can only merge if B depends on A's output
  if (!passB.inputs.includes(passA.output)) {
    return false;
  }

  // Can't merge if B has multiple inputs (blend nodes)
  if (passB.inputs.length > 1) {
    return false;
  }

  // Get categories
  const categoryA = getPassCategory(passA);
  const categoryB = getPassCategory(passB);

  // Can only merge same category color operations
  if (categoryA === 'color' && categoryB === 'color') {
    return true;
  }

  return false;
}

/**
 * Get the merge category for a pass
 */
export function getPassCategory(pass: CompiledPass): MergeCategory {
  // Analyze the pass nodes to determine category
  for (const nodeId of pass.nodes) {
    const category = getNodeCategory(nodeId);
    if (category !== 'unknown') {
      return category;
    }
  }
  return 'unknown';
}

/**
 * Merge two compatible passes into one
 */
export function mergeTwoPasses(passA: CompiledPass, passB: CompiledPass): CompiledPass {
  // Combine node IDs
  const nodes = [...passA.nodes, ...passB.nodes];

  // Combine shaders - B's shader operates on A's output
  const combinedShader = mergeShaderCode(passA.shader, passB.shader);

  // Inputs from A (B's input was A's output)
  const inputs = passA.inputs;

  // Output is B's output
  const output = passB.output;

  // Combine uniforms with namespacing to avoid conflicts
  const uniforms: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(passA.uniforms)) {
    uniforms[`pass0_${key}`] = value;
  }
  for (const [key, value] of Object.entries(passB.uniforms)) {
    uniforms[`pass1_${key}`] = value;
  }

  return {
    id: `merged-${passA.id}-${passB.id}`,
    nodes,
    shader: combinedShader,
    inputs,
    output,
    uniforms,
  };
}

/**
 * Merge shader code from two passes
 * Creates a combined shader that applies both operations in sequence
 */
export function mergeShaderCode(shaderA: string, shaderB: string): string {
  // For now, return a combined marker
  // In a full implementation, this would actually combine the WGSL code
  return `// Merged shader\n// Pass A:\n${shaderA}\n// Pass B:\n${shaderB}`;
}

/**
 * Pass Merger class for optimizing render passes
 */
export class PassMerger {
  /**
   * Merge compatible passes in a list
   */
  merge(passes: CompiledPass[]): MergeResult {
    if (passes.length <= 1) {
      return {
        passes,
        mergedCount: 0,
        originalCount: passes.length,
      };
    }

    const result: CompiledPass[] = [];
    let i = 0;
    let mergedCount = 0;

    while (i < passes.length) {
      let current = passes[i];

      // Try to merge with subsequent passes
      while (i + 1 < passes.length && canMergePasses(current, passes[i + 1])) {
        current = mergeTwoPasses(current, passes[i + 1]);
        mergedCount++;
        i++;
      }

      result.push(current);
      i++;
    }

    return {
      passes: result,
      mergedCount,
      originalCount: passes.length,
    };
  }

  /**
   * Analyze passes and return merge info for debugging
   */
  analyze(passes: CompiledPass[]): PassMergeInfo[] {
    return passes.map((pass, index) => {
      const category = getPassCategory(pass);
      const dependencies = new Set<string>();

      // Find which passes this one depends on
      for (let j = 0; j < index; j++) {
        if (pass.inputs.includes(passes[j].output)) {
          dependencies.add(passes[j].id);
        }
      }

      // Determine if this pass can potentially be merged
      const canMerge = category === 'color' && pass.inputs.length === 1;

      return {
        pass,
        category,
        canMerge,
        dependencies,
      };
    });
  }

  /**
   * Get statistics about potential optimizations
   */
  getOptimizationStats(passes: CompiledPass[]): {
    totalPasses: number;
    mergeablePasses: number;
    estimatedReduction: number;
  } {
    const analysis = this.analyze(passes);
    const mergeablePasses = analysis.filter((a) => a.canMerge).length;

    // Estimate reduction: adjacent mergeable passes can be combined
    let estimatedReduction = 0;
    for (let i = 0; i < passes.length - 1; i++) {
      if (canMergePasses(passes[i], passes[i + 1])) {
        estimatedReduction++;
      }
    }

    return {
      totalPasses: passes.length,
      mergeablePasses,
      estimatedReduction,
    };
  }
}

/**
 * Create a new pass merger instance
 */
export function createPassMerger(): PassMerger {
  return new PassMerger();
}
