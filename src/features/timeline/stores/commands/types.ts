import type { TimelineItem, TimelineTrack, ProjectMarker } from '@/types/timeline';
import type { Transition } from '@/types/transition';
import type { ItemKeyframes } from '@/types/keyframe';

/**
 * Snapshot of all timeline state for undo/redo.
 * This captures the complete state that can be restored.
 * Excludes ephemeral state (pendingBreakages, isDirty) that shouldn't be in history.
 */
export interface TimelineSnapshot {
  items: TimelineItem[];
  tracks: TimelineTrack[];
  transitions: Transition[];
  keyframes: ItemKeyframes[];
  markers: ProjectMarker[];
  inPoint: number | null;
  outPoint: number | null;
  fps: number;
  scrollPosition: number;
  snapEnabled: boolean;
  currentFrame: number;
}

/**
 * Base command interface.
 * Commands are metadata about what action was performed.
 * The actual undo/redo uses snapshots, not command-specific logic.
 */
export interface TimelineCommand {
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * Entry in the undo/redo history stack.
 * Stores the command metadata and the state snapshot from before the command was executed.
 */
export interface CommandEntry {
  command: TimelineCommand;
  beforeSnapshot: TimelineSnapshot;
  timestamp: number;
}

/**
 * Command types for debugging and analytics.
 * These are the string values for TimelineCommand.type
 */
export type CommandType =
  // Item commands
  | 'ADD_ITEM'
  | 'UPDATE_ITEM'
  | 'REMOVE_ITEMS'
  | 'RIPPLE_DELETE_ITEMS'
  | 'MOVE_ITEM'
  | 'MOVE_ITEMS'
  | 'DUPLICATE_ITEMS'
  | 'TRIM_ITEM_START'
  | 'TRIM_ITEM_END'
  | 'SPLIT_ITEM'
  | 'JOIN_ITEMS'
  | 'RATE_STRETCH_ITEM'
  | 'CLOSE_GAP'
  // Transform commands
  | 'UPDATE_TRANSFORM'
  | 'RESET_TRANSFORM'
  | 'UPDATE_TRANSFORMS'
  // Effect commands
  | 'ADD_EFFECT'
  | 'ADD_EFFECTS'
  | 'UPDATE_EFFECT'
  | 'REMOVE_EFFECT'
  | 'TOGGLE_EFFECT'
  // Transition commands
  | 'ADD_TRANSITION'
  | 'UPDATE_TRANSITION'
  | 'REMOVE_TRANSITION'
  // Keyframe commands
  | 'ADD_KEYFRAME'
  | 'UPDATE_KEYFRAME'
  | 'REMOVE_KEYFRAME'
  | 'REMOVE_KEYFRAMES_FOR_ITEM'
  | 'REMOVE_KEYFRAMES_FOR_PROPERTY'
  // Marker commands
  | 'ADD_MARKER'
  | 'UPDATE_MARKER'
  | 'REMOVE_MARKER'
  | 'CLEAR_MARKERS'
  // In/out point commands
  | 'SET_IN_POINT'
  | 'SET_OUT_POINT'
  | 'CLEAR_IN_OUT_POINTS'
  // Settings commands
  | 'SET_FPS'
  | 'TOGGLE_SNAP'
  // Track commands
  | 'SET_TRACKS'
  // Bulk operations
  | 'LOAD_TIMELINE'
  | 'CLEAR_TIMELINE';
