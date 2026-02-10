/**
 * Transform Nodes
 *
 * Geometric transformation nodes for scale, rotation, and translation.
 * Supports anchor points and matrix composition.
 */

import type { ShaderNode } from '../types';

/**
 * Transform parameters
 */
interface TransformParams {
  /** Scale X factor (1.0 = no scale) */
  scaleX?: number;
  /** Scale Y factor (1.0 = no scale) */
  scaleY?: number;
  /** Rotation in degrees */
  rotation?: number;
  /** Translation X (in normalized coordinates -1 to 1) */
  translateX?: number;
  /** Translation Y (in normalized coordinates -1 to 1) */
  translateY?: number;
  /** Anchor point X (0.0 = left, 0.5 = center, 1.0 = right) */
  anchorX?: number;
  /** Anchor point Y (0.0 = top, 0.5 = center, 1.0 = bottom) */
  anchorY?: number;
}

/**
 * WGSL code for transform matrix functions
 */
const TRANSFORM_FUNCTIONS_WGSL = `
// Convert degrees to radians
fn deg_to_rad(deg: f32) -> f32 {
  return deg * 3.14159265359 / 180.0;
}

// Create 2D rotation matrix
fn rotation_matrix(angle: f32) -> mat2x2f {
  let c = cos(angle);
  let s = sin(angle);
  return mat2x2f(
    vec2f(c, s),
    vec2f(-s, c)
  );
}

// Create 2D scale matrix
fn scale_matrix(sx: f32, sy: f32) -> mat2x2f {
  return mat2x2f(
    vec2f(sx, 0.0),
    vec2f(0.0, sy)
  );
}

// Apply 2D transform with anchor point
fn apply_transform_2d(
  uv: vec2f,
  scale_x: f32,
  scale_y: f32,
  rotation_deg: f32,
  translate: vec2f,
  anchor: vec2f
) -> vec2f {
  // Move to anchor point
  var p = uv - anchor;

  // Apply scale
  p = scale_matrix(1.0 / scale_x, 1.0 / scale_y) * p;

  // Apply rotation
  p = rotation_matrix(-deg_to_rad(rotation_deg)) * p;

  // Apply translation (inverse for sampling)
  p = p - translate;

  // Move back from anchor point
  p = p + anchor;

  return p;
}

// Check if UV is within bounds
fn in_bounds(uv: vec2f) -> bool {
  return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
}
`;

/**
 * Create a full transform node with all parameters
 */
export function createTransformNode(
  id: string,
  params?: TransformParams
): ShaderNode {
  const scaleX = params?.scaleX ?? 1.0;
  const scaleY = params?.scaleY ?? 1.0;
  const rotation = params?.rotation ?? 0.0;
  const translateX = params?.translateX ?? 0.0;
  const translateY = params?.translateY ?? 0.0;
  const anchorX = params?.anchorX ?? 0.5;
  const anchorY = params?.anchorY ?? 0.5;

  return {
    id,
    type: 'transform',
    name: 'transform',
    inputs: {
      input: { name: 'input', type: 'color', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'color' },
    },
    params: {
      scaleX: {
        name: 'scaleX',
        type: 'number',
        default: 1.0,
        min: 0.01,
        max: 10.0,
        step: 0.01,
        value: scaleX,
      },
      scaleY: {
        name: 'scaleY',
        type: 'number',
        default: 1.0,
        min: 0.01,
        max: 10.0,
        step: 0.01,
        value: scaleY,
      },
      rotation: {
        name: 'rotation',
        type: 'number',
        default: 0.0,
        min: -360.0,
        max: 360.0,
        step: 0.1,
        value: rotation,
      },
      translateX: {
        name: 'translateX',
        type: 'number',
        default: 0.0,
        min: -2.0,
        max: 2.0,
        step: 0.01,
        value: translateX,
      },
      translateY: {
        name: 'translateY',
        type: 'number',
        default: 0.0,
        min: -2.0,
        max: 2.0,
        step: 0.01,
        value: translateY,
      },
      anchorX: {
        name: 'anchorX',
        type: 'number',
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: anchorX,
      },
      anchorY: {
        name: 'anchorY',
        type: 'number',
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: anchorY,
      },
    },
    shader: {
      functions: TRANSFORM_FUNCTIONS_WGSL,
      main: `
  let transformedUV = apply_transform_2d(
    uv,
    params.scaleX,
    params.scaleY,
    params.rotation,
    vec2f(params.translateX, params.translateY),
    vec2f(params.anchorX, params.anchorY)
  );

  if (in_bounds(transformedUV)) {
    output = textureSample(inputTexture, texSampler, transformedUV);
  } else {
    output = vec4f(0.0, 0.0, 0.0, 0.0);
  }
`,
      uniforms: {
        scaleX: 'f32',
        scaleY: 'f32',
        rotation: 'f32',
        translateX: 'f32',
        translateY: 'f32',
        anchorX: 'f32',
        anchorY: 'f32',
      },
    },
  };
}

/**
 * Create a scale-only transform node
 */
export function createScaleNode(
  id: string,
  params?: { scaleX?: number; scaleY?: number; uniform?: number; anchorX?: number; anchorY?: number }
): ShaderNode {
  // If uniform is specified, use it for both X and Y
  const scaleX = params?.uniform ?? params?.scaleX ?? 1.0;
  const scaleY = params?.uniform ?? params?.scaleY ?? 1.0;
  const anchorX = params?.anchorX ?? 0.5;
  const anchorY = params?.anchorY ?? 0.5;

  return {
    id,
    type: 'transform',
    name: 'scale',
    inputs: {
      input: { name: 'input', type: 'color', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'color' },
    },
    params: {
      scaleX: {
        name: 'scaleX',
        type: 'number',
        default: 1.0,
        min: 0.01,
        max: 10.0,
        step: 0.01,
        value: scaleX,
      },
      scaleY: {
        name: 'scaleY',
        type: 'number',
        default: 1.0,
        min: 0.01,
        max: 10.0,
        step: 0.01,
        value: scaleY,
      },
      anchorX: {
        name: 'anchorX',
        type: 'number',
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: anchorX,
      },
      anchorY: {
        name: 'anchorY',
        type: 'number',
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: anchorY,
      },
    },
    shader: {
      functions: TRANSFORM_FUNCTIONS_WGSL,
      main: `
  let transformedUV = apply_transform_2d(
    uv,
    params.scaleX,
    params.scaleY,
    0.0,
    vec2f(0.0, 0.0),
    vec2f(params.anchorX, params.anchorY)
  );

  if (in_bounds(transformedUV)) {
    output = textureSample(inputTexture, texSampler, transformedUV);
  } else {
    output = vec4f(0.0, 0.0, 0.0, 0.0);
  }
`,
      uniforms: {
        scaleX: 'f32',
        scaleY: 'f32',
        anchorX: 'f32',
        anchorY: 'f32',
      },
    },
  };
}

/**
 * Create a rotation-only transform node
 */
export function createRotateNode(
  id: string,
  params?: { rotation?: number; anchorX?: number; anchorY?: number }
): ShaderNode {
  const rotation = params?.rotation ?? 0.0;
  const anchorX = params?.anchorX ?? 0.5;
  const anchorY = params?.anchorY ?? 0.5;

  return {
    id,
    type: 'transform',
    name: 'rotate',
    inputs: {
      input: { name: 'input', type: 'color', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'color' },
    },
    params: {
      rotation: {
        name: 'rotation',
        type: 'number',
        default: 0.0,
        min: -360.0,
        max: 360.0,
        step: 0.1,
        value: rotation,
      },
      anchorX: {
        name: 'anchorX',
        type: 'number',
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: anchorX,
      },
      anchorY: {
        name: 'anchorY',
        type: 'number',
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: anchorY,
      },
    },
    shader: {
      functions: TRANSFORM_FUNCTIONS_WGSL,
      main: `
  let transformedUV = apply_transform_2d(
    uv,
    1.0,
    1.0,
    params.rotation,
    vec2f(0.0, 0.0),
    vec2f(params.anchorX, params.anchorY)
  );

  if (in_bounds(transformedUV)) {
    output = textureSample(inputTexture, texSampler, transformedUV);
  } else {
    output = vec4f(0.0, 0.0, 0.0, 0.0);
  }
`,
      uniforms: {
        rotation: 'f32',
        anchorX: 'f32',
        anchorY: 'f32',
      },
    },
  };
}

/**
 * Create a translation-only transform node
 */
export function createTranslateNode(
  id: string,
  params?: { translateX?: number; translateY?: number }
): ShaderNode {
  const translateX = params?.translateX ?? 0.0;
  const translateY = params?.translateY ?? 0.0;

  return {
    id,
    type: 'transform',
    name: 'translate',
    inputs: {
      input: { name: 'input', type: 'color', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'color' },
    },
    params: {
      translateX: {
        name: 'translateX',
        type: 'number',
        default: 0.0,
        min: -2.0,
        max: 2.0,
        step: 0.01,
        value: translateX,
      },
      translateY: {
        name: 'translateY',
        type: 'number',
        default: 0.0,
        min: -2.0,
        max: 2.0,
        step: 0.01,
        value: translateY,
      },
    },
    shader: {
      functions: TRANSFORM_FUNCTIONS_WGSL,
      main: `
  let transformedUV = uv - vec2f(params.translateX, params.translateY);

  if (in_bounds(transformedUV)) {
    output = textureSample(inputTexture, texSampler, transformedUV);
  } else {
    output = vec4f(0.0, 0.0, 0.0, 0.0);
  }
`,
      uniforms: {
        translateX: 'f32',
        translateY: 'f32',
      },
    },
  };
}

/**
 * Create a flip node (horizontal/vertical)
 */
export function createFlipNode(
  id: string,
  params?: { horizontal?: boolean; vertical?: boolean }
): ShaderNode {
  const horizontal = params?.horizontal ?? false;
  const vertical = params?.vertical ?? false;

  return {
    id,
    type: 'transform',
    name: 'flip',
    inputs: {
      input: { name: 'input', type: 'color', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'color' },
    },
    params: {
      horizontal: {
        name: 'horizontal',
        type: 'boolean',
        default: false,
        value: horizontal,
      },
      vertical: {
        name: 'vertical',
        type: 'boolean',
        default: false,
        value: vertical,
      },
    },
    shader: {
      main: `
  var transformedUV = uv;
  if (params.horizontal > 0.5) {
    transformedUV.x = 1.0 - transformedUV.x;
  }
  if (params.vertical > 0.5) {
    transformedUV.y = 1.0 - transformedUV.y;
  }
  output = textureSample(inputTexture, texSampler, transformedUV);
`,
      uniforms: {
        horizontal: 'f32',
        vertical: 'f32',
      },
    },
  };
}

/**
 * Create a crop node
 */
export function createCropNode(
  id: string,
  params?: { left?: number; right?: number; top?: number; bottom?: number }
): ShaderNode {
  const left = params?.left ?? 0.0;
  const right = params?.right ?? 1.0;
  const top = params?.top ?? 0.0;
  const bottom = params?.bottom ?? 1.0;

  return {
    id,
    type: 'transform',
    name: 'crop',
    inputs: {
      input: { name: 'input', type: 'color', required: true },
    },
    outputs: {
      output: { name: 'output', type: 'color' },
    },
    params: {
      left: {
        name: 'left',
        type: 'number',
        default: 0.0,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: left,
      },
      right: {
        name: 'right',
        type: 'number',
        default: 1.0,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: right,
      },
      top: {
        name: 'top',
        type: 'number',
        default: 0.0,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: top,
      },
      bottom: {
        name: 'bottom',
        type: 'number',
        default: 1.0,
        min: 0.0,
        max: 1.0,
        step: 0.01,
        value: bottom,
      },
    },
    shader: {
      main: `
  // Map UV to crop region
  let cropWidth = params.right - params.left;
  let cropHeight = params.bottom - params.top;
  let sourceUV = vec2f(
    params.left + uv.x * cropWidth,
    params.top + uv.y * cropHeight
  );

  output = textureSample(inputTexture, texSampler, sourceUV);
`,
      uniforms: {
        left: 'f32',
        right: 'f32',
        top: 'f32',
        bottom: 'f32',
      },
    },
  };
}

/**
 * Get transform functions WGSL code for inclusion in shaders
 */
export function getTransformFunctionsWGSL(): string {
  return TRANSFORM_FUNCTIONS_WGSL;
}
