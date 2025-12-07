/**
 * Keyframe interpolation utilities.
 * Provides functions to calculate property values at any frame.
 */

import type { Keyframe, ItemKeyframes, AnimatableProperty } from '@/types/keyframe';
import { applyEasing } from './easing';

/**
 * Interpolate a value between two keyframes at a given frame.
 * Uses the easing function from the "from" keyframe.
 *
 * @param prevKf - The keyframe before or at the current frame
 * @param nextKf - The keyframe after the current frame
 * @param frame - The current frame (relative to item start)
 * @returns The interpolated value
 */
export function interpolateBetweenKeyframes(
  prevKf: Keyframe,
  nextKf: Keyframe,
  frame: number
): number {
  // Calculate progress between keyframes (0 to 1)
  const frameRange = nextKf.frame - prevKf.frame;
  if (frameRange <= 0) return prevKf.value;

  const progress = (frame - prevKf.frame) / frameRange;

  // Apply easing (uses the "from" keyframe's easing)
  const easedProgress = applyEasing(progress, prevKf.easing);

  // Linear interpolation with eased progress
  return prevKf.value + (nextKf.value - prevKf.value) * easedProgress;
}

/**
 * Get the interpolated value for a property at a specific frame.
 *
 * @param keyframes - Sorted array of keyframes for this property
 * @param frame - Current frame (relative to item start)
 * @param baseValue - Default value if no keyframes exist
 * @returns The interpolated value at this frame
 */
export function interpolatePropertyValue(
  keyframes: Keyframe[],
  frame: number,
  baseValue: number
): number {
  // No keyframes - use base value
  if (keyframes.length === 0) return baseValue;

  // Get first and last keyframes (guaranteed to exist since length > 0)
  const firstKf = keyframes[0]!;

  // Single keyframe - use that value for all frames
  if (keyframes.length === 1) return firstKf.value;

  // Before first keyframe - hold first value
  if (frame <= firstKf.frame) return firstKf.value;

  // After last keyframe - hold last value
  const lastKf = keyframes[keyframes.length - 1]!;
  if (frame >= lastKf.frame) return lastKf.value;

  // Find surrounding keyframes
  for (let i = 0; i < keyframes.length - 1; i++) {
    const prevKf = keyframes[i]!;
    const nextKf = keyframes[i + 1]!;

    if (prevKf.frame <= frame && nextKf.frame > frame) {
      return interpolateBetweenKeyframes(prevKf, nextKf, frame);
    }
  }

  // Fallback (shouldn't reach here with valid keyframes)
  return baseValue;
}

/**
 * Get keyframes for a specific property from an ItemKeyframes object.
 *
 * @param itemKeyframes - All keyframes for an item
 * @param property - The property to get keyframes for
 * @returns Array of keyframes for the property, or empty array if none
 */
export function getPropertyKeyframes(
  itemKeyframes: ItemKeyframes | undefined,
  property: AnimatableProperty
): Keyframe[] {
  if (!itemKeyframes) return [];

  const propKeyframes = itemKeyframes.properties.find((p) => p.property === property);
  return propKeyframes?.keyframes ?? [];
}

/**
 * Check if a property has any keyframes.
 *
 * @param itemKeyframes - All keyframes for an item
 * @param property - The property to check
 * @returns True if the property has at least one keyframe
 */
export function hasPropertyKeyframes(
  itemKeyframes: ItemKeyframes | undefined,
  property: AnimatableProperty
): boolean {
  return getPropertyKeyframes(itemKeyframes, property).length > 0;
}

/**
 * Get all properties that have keyframes for an item.
 *
 * @param itemKeyframes - All keyframes for an item
 * @returns Array of property names that have keyframes
 */
export function getAnimatedProperties(
  itemKeyframes: ItemKeyframes | undefined
): AnimatableProperty[] {
  if (!itemKeyframes) return [];
  return itemKeyframes.properties
    .filter((p) => p.keyframes.length > 0)
    .map((p) => p.property);
}

/**
 * Find the keyframe at a specific frame for a property.
 *
 * @param itemKeyframes - All keyframes for an item
 * @param property - The property to check
 * @param frame - The frame to look for
 * @returns The keyframe at this frame, or undefined if none exists
 */
export function getKeyframeAtFrame(
  itemKeyframes: ItemKeyframes | undefined,
  property: AnimatableProperty,
  frame: number
): Keyframe | undefined {
  const keyframes = getPropertyKeyframes(itemKeyframes, property);
  return keyframes.find((k) => k.frame === frame);
}

/**
 * Find the nearest keyframes before and after a given frame.
 *
 * @param keyframes - Sorted array of keyframes
 * @param frame - The reference frame
 * @returns Object with prev and next keyframes (both can be undefined)
 */
export function findSurroundingKeyframes(
  keyframes: Keyframe[],
  frame: number
): { prev: Keyframe | undefined; next: Keyframe | undefined } {
  if (keyframes.length === 0) {
    return { prev: undefined, next: undefined };
  }

  let prev: Keyframe | undefined;
  let next: Keyframe | undefined;

  for (const kf of keyframes) {
    if (kf.frame <= frame) {
      prev = kf;
    } else if (!next) {
      next = kf;
      break;
    }
  }

  return { prev, next };
}

/**
 * Get the next keyframe after the given frame.
 *
 * @param itemKeyframes - All keyframes for an item
 * @param property - The property to check
 * @param frame - The reference frame
 * @returns The next keyframe, or undefined if none exists after this frame
 */
export function getNextKeyframe(
  itemKeyframes: ItemKeyframes | undefined,
  property: AnimatableProperty,
  frame: number
): Keyframe | undefined {
  const keyframes = getPropertyKeyframes(itemKeyframes, property);
  return keyframes.find((k) => k.frame > frame);
}

/**
 * Get the previous keyframe before or at the given frame.
 *
 * @param itemKeyframes - All keyframes for an item
 * @param property - The property to check
 * @param frame - The reference frame
 * @returns The previous keyframe, or undefined if none exists before this frame
 */
export function getPreviousKeyframe(
  itemKeyframes: ItemKeyframes | undefined,
  property: AnimatableProperty,
  frame: number
): Keyframe | undefined {
  const keyframes = getPropertyKeyframes(itemKeyframes, property);
  // Find last keyframe at or before the given frame
  for (let i = keyframes.length - 1; i >= 0; i--) {
    const kf = keyframes[i];
    if (kf && kf.frame <= frame) {
      return kf;
    }
  }
  return undefined;
}
