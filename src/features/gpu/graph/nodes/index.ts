/**
 * Shader Graph Nodes
 *
 * All built-in node types for the shader graph system.
 */

// Source nodes
export {
  createTextureSourceNode,
  createColorSourceNode,
  createGradientSourceNode,
} from './source-node';

// Effect nodes
export {
  createBrightnessNode,
  createContrastNode,
  createSaturationNode,
  createOpacityNode,
  createBrightnessContrastNode,
} from './effect-nodes';

// Blur nodes
export { createBlurNode, createGaussianBlurNode, createFastBlurNode } from './blur-node';

// Blend nodes
export {
  createBlendNode,
  createNormalBlendNode,
  createMultiplyBlendNode,
  createScreenBlendNode,
  createOverlayBlendNode,
  createAddBlendNode,
  createSubtractBlendNode,
  createDifferenceBlendNode,
  createDarkenBlendNode,
  createLightenBlendNode,
  createColorDodgeBlendNode,
  createColorBurnBlendNode,
  createHardLightBlendNode,
  createSoftLightBlendNode,
  getBlendFunctionsWGSL,
  BLEND_MODES,
} from './blend-node';

// Output nodes
export {
  createOutputNode,
  createExportOutputNode,
  createPreviewOutputNode,
} from './output-node';

// Re-export node registration helper
import { NodeRegistry, globalRegistry } from '../node-registry';
import {
  createTextureSourceNode,
  createColorSourceNode,
  createGradientSourceNode,
} from './source-node';
import {
  createBrightnessNode,
  createContrastNode,
  createSaturationNode,
  createOpacityNode,
  createBrightnessContrastNode,
} from './effect-nodes';
import { createBlurNode, createGaussianBlurNode, createFastBlurNode } from './blur-node';
import {
  createBlendNode,
  createNormalBlendNode,
  createMultiplyBlendNode,
  createScreenBlendNode,
  createOverlayBlendNode,
  createAddBlendNode,
  createSubtractBlendNode,
  createDifferenceBlendNode,
  createDarkenBlendNode,
  createLightenBlendNode,
  createColorDodgeBlendNode,
  createColorBurnBlendNode,
  createHardLightBlendNode,
  createSoftLightBlendNode,
} from './blend-node';
import {
  createOutputNode,
  createExportOutputNode,
  createPreviewOutputNode,
} from './output-node';

/**
 * Register all built-in nodes with a registry
 */
export function registerBuiltinNodes(registry: NodeRegistry = globalRegistry): void {
  // Sources
  registry.register('texture-source', createTextureSourceNode);
  registry.register('color-source', createColorSourceNode);
  registry.register('gradient-source', createGradientSourceNode);

  // Effects
  registry.register('brightness', createBrightnessNode);
  registry.register('contrast', createContrastNode);
  registry.register('saturation', createSaturationNode);
  registry.register('opacity', createOpacityNode);
  registry.register('brightness-contrast', createBrightnessContrastNode);

  // Blur
  registry.register('blur', createBlurNode);
  registry.register('gaussian-blur', createGaussianBlurNode);
  registry.register('fast-blur', createFastBlurNode);

  // Blend
  registry.register('blend', createBlendNode);
  registry.register('normal-blend', createNormalBlendNode);
  registry.register('multiply-blend', createMultiplyBlendNode);
  registry.register('screen-blend', createScreenBlendNode);
  registry.register('overlay-blend', createOverlayBlendNode);
  registry.register('add-blend', createAddBlendNode);
  registry.register('subtract-blend', createSubtractBlendNode);
  registry.register('difference-blend', createDifferenceBlendNode);
  registry.register('darken-blend', createDarkenBlendNode);
  registry.register('lighten-blend', createLightenBlendNode);
  registry.register('color-dodge-blend', createColorDodgeBlendNode);
  registry.register('color-burn-blend', createColorBurnBlendNode);
  registry.register('hard-light-blend', createHardLightBlendNode);
  registry.register('soft-light-blend', createSoftLightBlendNode);

  // Output
  registry.register('output', createOutputNode);
  registry.register('export-output', createExportOutputNode);
  registry.register('preview-output', createPreviewOutputNode);
}
