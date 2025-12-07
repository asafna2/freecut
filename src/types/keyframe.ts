/**
 * Keyframe animation system types.
 * Supports animating transform properties over time with easing.
 */

/** Properties that can be animated via keyframes */
export type AnimatableProperty = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity';

/** Available easing functions for interpolation between keyframes */
export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/**
 * Individual keyframe data point.
 * Represents a specific value at a specific frame.
 */
export interface Keyframe {
  /** Unique identifier for this keyframe */
  id: string;
  /** Frame number relative to item start (0 = first frame of item) */
  frame: number;
  /** The property value at this keyframe */
  value: number;
  /** Easing function used when interpolating TO the next keyframe */
  easing: EasingType;
}

/**
 * Keyframes for a single property on a single item.
 * Keyframes are stored sorted by frame number.
 */
export interface PropertyKeyframes {
  /** The property being animated */
  property: AnimatableProperty;
  /** Sorted array of keyframes for this property */
  keyframes: Keyframe[];
}

/**
 * All keyframes for a single timeline item.
 * Groups keyframes by property for efficient lookup.
 */
export interface ItemKeyframes {
  /** The timeline item ID these keyframes belong to */
  itemId: string;
  /** Array of property keyframe groups */
  properties: PropertyKeyframes[];
}

/**
 * All animatable property names as an array (useful for iteration)
 */
export const ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'opacity',
];

/**
 * Display labels for animatable properties
 */
export const PROPERTY_LABELS: Record<AnimatableProperty, string> = {
  x: 'X Position',
  y: 'Y Position',
  width: 'Width',
  height: 'Height',
  rotation: 'Rotation',
  opacity: 'Opacity',
};

/**
 * Short labels for compact UI (keyframe lanes)
 */
export const PROPERTY_SHORT_LABELS: Record<AnimatableProperty, string> = {
  x: 'X',
  y: 'Y',
  width: 'W',
  height: 'H',
  rotation: 'R',
  opacity: 'O',
};

/**
 * Easing type display labels
 */
export const EASING_LABELS: Record<EasingType, string> = {
  'linear': 'Linear',
  'ease-in': 'Ease In',
  'ease-out': 'Ease Out',
  'ease-in-out': 'Ease In Out',
};
