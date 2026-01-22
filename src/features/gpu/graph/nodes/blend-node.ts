/**
 * Blend Nodes
 *
 * Compositing nodes for blending multiple layers together.
 * Supports standard blend modes used in image/video editing.
 */

import type { ShaderNode, BlendMode } from '../types';

/**
 * Standard blend modes
 */
export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'add',
  'subtract',
  'difference',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
];

/**
 * WGSL code for blend mode functions
 */
const BLEND_FUNCTIONS_WGSL = `
// Normal blend (simple alpha composite)
fn blend_normal(base: vec4f, blend: vec4f) -> vec4f {
  return blend;
}

// Multiply: darkens the image
fn blend_multiply(base: vec4f, blend: vec4f) -> vec4f {
  return vec4f(base.rgb * blend.rgb, blend.a);
}

// Screen: lightens the image
fn blend_screen(base: vec4f, blend: vec4f) -> vec4f {
  return vec4f(1.0 - (1.0 - base.rgb) * (1.0 - blend.rgb), blend.a);
}

// Overlay: combines multiply and screen
fn blend_overlay(base: vec4f, blend: vec4f) -> vec4f {
  let result = select(
    1.0 - 2.0 * (1.0 - base.rgb) * (1.0 - blend.rgb),
    2.0 * base.rgb * blend.rgb,
    base.rgb < vec3f(0.5)
  );
  return vec4f(result, blend.a);
}

// Add: adds colors together
fn blend_add(base: vec4f, blend: vec4f) -> vec4f {
  return vec4f(min(base.rgb + blend.rgb, vec3f(1.0)), blend.a);
}

// Subtract: subtracts blend from base
fn blend_subtract(base: vec4f, blend: vec4f) -> vec4f {
  return vec4f(max(base.rgb - blend.rgb, vec3f(0.0)), blend.a);
}

// Difference: absolute difference between colors
fn blend_difference(base: vec4f, blend: vec4f) -> vec4f {
  return vec4f(abs(base.rgb - blend.rgb), blend.a);
}

// Darken: keeps the darker of the two colors
fn blend_darken(base: vec4f, blend: vec4f) -> vec4f {
  return vec4f(min(base.rgb, blend.rgb), blend.a);
}

// Lighten: keeps the lighter of the two colors
fn blend_lighten(base: vec4f, blend: vec4f) -> vec4f {
  return vec4f(max(base.rgb, blend.rgb), blend.a);
}

// Color Dodge: brightens base color
fn blend_color_dodge(base: vec4f, blend: vec4f) -> vec4f {
  let result = select(
    min(base.rgb / (1.0 - blend.rgb), vec3f(1.0)),
    vec3f(1.0),
    blend.rgb >= vec3f(1.0)
  );
  return vec4f(result, blend.a);
}

// Color Burn: darkens base color
fn blend_color_burn(base: vec4f, blend: vec4f) -> vec4f {
  let result = select(
    1.0 - min((1.0 - base.rgb) / blend.rgb, vec3f(1.0)),
    vec3f(0.0),
    blend.rgb <= vec3f(0.0)
  );
  return vec4f(result, blend.a);
}

// Hard Light: similar to overlay but with blend and base swapped
fn blend_hard_light(base: vec4f, blend: vec4f) -> vec4f {
  let result = select(
    1.0 - 2.0 * (1.0 - base.rgb) * (1.0 - blend.rgb),
    2.0 * base.rgb * blend.rgb,
    blend.rgb < vec3f(0.5)
  );
  return vec4f(result, blend.a);
}

// Soft Light: softer version of hard light
fn blend_soft_light(base: vec4f, blend: vec4f) -> vec4f {
  let result = select(
    base.rgb + (2.0 * blend.rgb - 1.0) * (sqrt(base.rgb) - base.rgb),
    base.rgb - (1.0 - 2.0 * blend.rgb) * base.rgb * (1.0 - base.rgb),
    blend.rgb > vec3f(0.5)
  );
  return vec4f(result, blend.a);
}

// Alpha composite: porter-duff "over" operation
fn alpha_composite_over(base: vec4f, blend: vec4f) -> vec4f {
  let outAlpha = blend.a + base.a * (1.0 - blend.a);
  if (outAlpha <= 0.0) {
    return vec4f(0.0);
  }
  let outRgb = (blend.rgb * blend.a + base.rgb * base.a * (1.0 - blend.a)) / outAlpha;
  return vec4f(outRgb, outAlpha);
}

// Alpha composite: porter-duff "under" operation
fn alpha_composite_under(base: vec4f, blend: vec4f) -> vec4f {
  return alpha_composite_over(blend, base);
}
`;

/**
 * Get WGSL code for a specific blend mode
 */
function getBlendModeCode(mode: BlendMode): string {
  const modeMap: Record<BlendMode, string> = {
    normal: 'blend_normal',
    multiply: 'blend_multiply',
    screen: 'blend_screen',
    overlay: 'blend_overlay',
    add: 'blend_add',
    subtract: 'blend_subtract',
    difference: 'blend_difference',
    darken: 'blend_darken',
    lighten: 'blend_lighten',
    'color-dodge': 'blend_color_dodge',
    'color-burn': 'blend_color_burn',
    'hard-light': 'blend_hard_light',
    'soft-light': 'blend_soft_light',
  };
  return modeMap[mode] || 'blend_normal';
}

/**
 * Create a blend node with configurable blend mode
 */
export function createBlendNode(
  id: string,
  params?: { mode?: BlendMode; opacity?: number }
): ShaderNode {
  const mode = params?.mode ?? 'normal';
  const opacity = params?.opacity ?? 1.0;
  const blendFn = getBlendModeCode(mode);

  return {
    id,
    type: 'blend',
    name: 'blend',
    inputs: {
      base: { name: 'base', type: 'color', required: true },
      blend: { name: 'blend', type: 'color', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'color' },
    },
    params: {
      mode: {
        name: 'mode',
        type: 'string',
        default: 'normal',
        value: mode,
      },
      opacity: {
        name: 'opacity',
        type: 'number',
        default: 1.0,
        min: 0.0,
        max: 1.0,
        value: opacity,
      },
    },
    shader: {
      functions: BLEND_FUNCTIONS_WGSL,
      main: `
  let baseColor = textureSample(baseTexture, texSampler, uv);
  let blendColor = textureSample(blendTexture, texSampler, uv);

  // Apply blend mode
  let blended = ${blendFn}(baseColor, blendColor);

  // Apply opacity and alpha composite
  let finalBlend = vec4f(blended.rgb, blended.a * params.opacity);
  output = alpha_composite_over(baseColor, finalBlend);
`,
      uniforms: {
        opacity: 'f32',
      },
    },
  };
}

/**
 * Create a normal blend node (simple alpha composite)
 */
export function createNormalBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'normal', opacity: params?.opacity });
}

/**
 * Create a multiply blend node
 */
export function createMultiplyBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'multiply', opacity: params?.opacity });
}

/**
 * Create a screen blend node
 */
export function createScreenBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'screen', opacity: params?.opacity });
}

/**
 * Create an overlay blend node
 */
export function createOverlayBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'overlay', opacity: params?.opacity });
}

/**
 * Create an add blend node
 */
export function createAddBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'add', opacity: params?.opacity });
}

/**
 * Create a subtract blend node
 */
export function createSubtractBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'subtract', opacity: params?.opacity });
}

/**
 * Create a difference blend node
 */
export function createDifferenceBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'difference', opacity: params?.opacity });
}

/**
 * Create a darken blend node
 */
export function createDarkenBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'darken', opacity: params?.opacity });
}

/**
 * Create a lighten blend node
 */
export function createLightenBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'lighten', opacity: params?.opacity });
}

/**
 * Create a color dodge blend node
 */
export function createColorDodgeBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'color-dodge', opacity: params?.opacity });
}

/**
 * Create a color burn blend node
 */
export function createColorBurnBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'color-burn', opacity: params?.opacity });
}

/**
 * Create a hard light blend node
 */
export function createHardLightBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'hard-light', opacity: params?.opacity });
}

/**
 * Create a soft light blend node
 */
export function createSoftLightBlendNode(
  id: string,
  params?: { opacity?: number }
): ShaderNode {
  return createBlendNode(id, { mode: 'soft-light', opacity: params?.opacity });
}

/**
 * Get blend functions WGSL code for inclusion in shaders
 */
export function getBlendFunctionsWGSL(): string {
  return BLEND_FUNCTIONS_WGSL;
}
