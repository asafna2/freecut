/**
 * Easing functions for keyframe interpolation.
 * Each function takes a progress value (0-1) and returns an eased value (0-1).
 */

import type { EasingType } from '@/types/keyframe';

/**
 * Linear easing - constant speed
 */
export function linear(t: number): number {
  return t;
}

/**
 * Ease in - starts slow, accelerates
 * Uses quadratic function (t^2)
 */
export function easeIn(t: number): number {
  return t * t;
}

/**
 * Ease out - starts fast, decelerates
 * Uses inverse quadratic function
 */
export function easeOut(t: number): number {
  return t * (2 - t);
}

/**
 * Ease in-out - starts slow, accelerates, then decelerates
 * Uses piecewise quadratic function
 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Map of easing type to easing function
 */
export const easingFunctions: Record<EasingType, (t: number) => number> = {
  'linear': linear,
  'ease-in': easeIn,
  'ease-out': easeOut,
  'ease-in-out': easeInOut,
};

/**
 * Get an easing function by type
 */
export function getEasingFunction(type: EasingType): (t: number) => number {
  return easingFunctions[type] ?? linear;
}

/**
 * Apply easing to a progress value
 * @param t Progress value (0-1)
 * @param type Easing type
 * @returns Eased progress value (0-1)
 */
export function applyEasing(t: number, type: EasingType): number {
  // Clamp input to valid range
  const clampedT = Math.max(0, Math.min(1, t));
  return getEasingFunction(type)(clampedT);
}
