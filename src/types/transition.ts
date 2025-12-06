/**
 * Transition Types
 *
 * Transitions are effects applied between two adjacent clips.
 * Uses Remotion's @remotion/transitions for rendering.
 * Clips stay adjacent in timeline UI - TransitionSeries handles overlap at render time.
 */

export type TransitionType = 'crossfade';

/**
 * Visual presentation styles for transitions
 * Maps to @remotion/transitions presentations
 */
export type TransitionPresentation = 'fade' | 'wipe' | 'slide' | 'flip' | 'clockWipe' | 'iris' | 'none';

/**
 * Wipe direction options
 */
export type WipeDirection = 'from-left' | 'from-right' | 'from-top' | 'from-bottom';

/**
 * Slide direction options
 */
export type SlideDirection = 'from-left' | 'from-right' | 'from-top' | 'from-bottom';

/**
 * Flip direction options
 */
export type FlipDirection = 'from-left' | 'from-right' | 'from-top' | 'from-bottom';

/**
 * Timing function for transitions
 */
export type TransitionTiming = 'linear' | 'spring';

/**
 * A transition between two adjacent clips.
 * Clips stay at their original positions - TransitionSeries calculates overlap at render time.
 */
export interface Transition {
  /** Unique identifier */
  id: string;
  /** Type of transition (for UI display) */
  type: TransitionType;
  /** Visual presentation style */
  presentation: TransitionPresentation;
  /** Timing function */
  timing: TransitionTiming;
  /** ID of the clip ending */
  leftClipId: string;
  /** ID of the clip starting */
  rightClipId: string;
  /** Track where both clips reside */
  trackId: string;
  /** Duration of the transition in frames */
  durationInFrames: number;
  /** Direction for wipe/slide/flip transitions */
  direction?: WipeDirection | SlideDirection | FlipDirection;
}

/**
 * Configuration for transition types
 */
export interface TransitionConfig {
  label: string;
  description: string;
  /** Default duration in frames */
  defaultDuration: number;
  /** Minimum duration in frames */
  minDuration: number;
  /** Maximum duration in frames */
  maxDuration: number;
}

/**
 * Default configuration for each transition type
 */
export const TRANSITION_CONFIGS: Record<TransitionType, TransitionConfig> = {
  crossfade: {
    label: 'Crossfade',
    description: 'Smooth opacity blend between clips',
    defaultDuration: 30, // 1 second at 30fps
    minDuration: 5,
    maxDuration: 90,
  },
};

/**
 * Configuration for each presentation type
 */
export interface PresentationConfig {
  id: TransitionPresentation;
  label: string;
  description: string;
  icon: string; // Icon name from lucide-react
  category: 'basic' | 'wipe' | 'slide' | 'flip' | 'special';
  direction?: WipeDirection | SlideDirection | FlipDirection;
}

/**
 * All available transition presentations with their configurations
 * Each direction is a separate card for easy selection
 */
export const PRESENTATION_CONFIGS: PresentationConfig[] = [
  // Basic transitions
  {
    id: 'fade',
    label: 'Fade',
    description: 'Simple crossfade between clips',
    icon: 'Blend',
    category: 'basic',
  },
  {
    id: 'none',
    label: 'Cut',
    description: 'Instant cut with no effect',
    icon: 'Scissors',
    category: 'basic',
  },
  // Wipe transitions (each direction as separate card)
  {
    id: 'wipe',
    label: 'Left',
    description: 'Wipe from left to right',
    icon: 'ArrowRight',
    category: 'wipe',
    direction: 'from-left',
  },
  {
    id: 'wipe',
    label: 'Right',
    description: 'Wipe from right to left',
    icon: 'ArrowLeft',
    category: 'wipe',
    direction: 'from-right',
  },
  {
    id: 'wipe',
    label: 'Top',
    description: 'Wipe from top to bottom',
    icon: 'ArrowDown',
    category: 'wipe',
    direction: 'from-top',
  },
  {
    id: 'wipe',
    label: 'Bottom',
    description: 'Wipe from bottom to top',
    icon: 'ArrowUp',
    category: 'wipe',
    direction: 'from-bottom',
  },
  // Slide transitions (each direction as separate card)
  {
    id: 'slide',
    label: 'Left',
    description: 'Slide in from left',
    icon: 'MoveRight',
    category: 'slide',
    direction: 'from-left',
  },
  {
    id: 'slide',
    label: 'Right',
    description: 'Slide in from right',
    icon: 'MoveLeft',
    category: 'slide',
    direction: 'from-right',
  },
  {
    id: 'slide',
    label: 'Top',
    description: 'Slide in from top',
    icon: 'MoveDown',
    category: 'slide',
    direction: 'from-top',
  },
  {
    id: 'slide',
    label: 'Bottom',
    description: 'Slide in from bottom',
    icon: 'MoveUp',
    category: 'slide',
    direction: 'from-bottom',
  },
  // Flip transitions (each direction as separate card)
  {
    id: 'flip',
    label: 'Left',
    description: '3D flip from left',
    icon: 'FlipHorizontal',
    category: 'flip',
    direction: 'from-left',
  },
  {
    id: 'flip',
    label: 'Right',
    description: '3D flip from right',
    icon: 'FlipHorizontal2',
    category: 'flip',
    direction: 'from-right',
  },
  {
    id: 'flip',
    label: 'Top',
    description: '3D flip from top',
    icon: 'FlipVertical',
    category: 'flip',
    direction: 'from-top',
  },
  {
    id: 'flip',
    label: 'Bottom',
    description: '3D flip from bottom',
    icon: 'FlipVertical2',
    category: 'flip',
    direction: 'from-bottom',
  },
  // Special transitions
  {
    id: 'clockWipe',
    label: 'Clock Wipe',
    description: 'Circular wipe like a clock hand',
    icon: 'Clock',
    category: 'special',
  },
  {
    id: 'iris',
    label: 'Iris',
    description: 'Circular iris expanding/contracting',
    icon: 'Circle',
    category: 'special',
  },
];

/**
 * Result of checking if a transition can be added
 */
export interface CanAddTransitionResult {
  canAdd: boolean;
  reason?: string;
  /** Available handle frames on left clip's end */
  leftHandle?: number;
  /** Available handle frames on right clip's start */
  rightHandle?: number;
}
