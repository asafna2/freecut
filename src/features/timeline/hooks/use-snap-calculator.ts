import { useMemo } from 'react';
import type { SnapTarget } from '../types/drag';
import { useTimelineStore } from '../stores/timeline-store';
import { useZoomStore } from '../stores/zoom-store';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';
import { useTimelineZoom } from './use-timeline-zoom';
import {
  generateGridSnapPoints,
  findNearestSnapTarget,
  calculateAdaptiveSnapThreshold,
} from '../utils/snap-utils';
import { BASE_SNAP_THRESHOLD_PIXELS } from '../constants';

/**
 * Advanced snap calculator hook
 *
 * Combines grid snapping (timeline markers) with magnetic snapping (item edges)
 * Magnetic snapping takes priority when both are within threshold
 *
 * Phase 2 enhancement over basic grid snapping
 *
 * @param timelineDuration - Total timeline duration in seconds
 * @param excludeItemIds - Item ID(s) to exclude from snap targets (for dragging items)
 *                         Accepts a single ID string or an array of IDs for group selection
 */
export function useSnapCalculator(
  timelineDuration: number,
  excludeItemIds: string | string[] | null
) {
  // Normalize to array for consistent handling
  const excludeIds = useMemo(() => {
    if (!excludeItemIds) return [];
    return Array.isArray(excludeItemIds) ? excludeItemIds : [excludeItemIds];
  }, [excludeItemIds]);
  // Get state with granular selectors
  const items = useTimelineStore((s) => s.items);
  const fps = useTimelineStore((s) => s.fps);
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);
  const zoomLevel = useZoomStore((s) => s.level);
  const currentFrame = usePlaybackStore((s) => s.currentFrame);
  const { pixelsPerSecond } = useTimelineZoom();

  /**
   * Calculate adaptive snap threshold in frames
   */
  const snapThresholdFrames = useMemo(() => {
    return calculateAdaptiveSnapThreshold(
      zoomLevel,
      BASE_SNAP_THRESHOLD_PIXELS,
      pixelsPerSecond,
      fps
    );
  }, [zoomLevel, pixelsPerSecond, fps]);

  /**
   * Generate all snap targets (grid + magnetic)
   * Memoized for performance - only recalculates when items/zoom changes
   */
  const snapTargets = useMemo(() => {
    const targets: SnapTarget[] = [];

    // 1. Grid snap points (timeline markers)
    const gridFrames = generateGridSnapPoints(timelineDuration, fps, zoomLevel);
    gridFrames.forEach((frame) => {
      targets.push({ frame, type: 'grid' });
    });

    // 2. Magnetic snap points (item edges)
    // Exclude all dragging items (single or group selection)
    items
      .filter((item) => !excludeIds.includes(item.id))
      .forEach((item) => {
        // Item start
        targets.push({
          frame: item.from,
          type: 'item-start',
          itemId: item.id,
        });
        // Item end
        targets.push({
          frame: item.from + item.durationInFrames,
          type: 'item-end',
          itemId: item.id,
        });
      });

    // 3. Playhead snap point
    targets.push({
      frame: currentFrame,
      type: 'playhead',
    });

    return targets;
  }, [items, excludeIds, timelineDuration, fps, zoomLevel, currentFrame]);

  /**
   * Calculate snap for a given position
   * Checks both start and end positions of the item
   * Returns snapped position and snap information
   *
   * @param targetStartFrame - The proposed start frame of the item
   * @param itemDurationInFrames - Duration of the item in frames
   */
  const calculateSnap = (targetStartFrame: number, itemDurationInFrames: number) => {
    if (!snapEnabled) {
      return {
        snappedFrame: targetStartFrame,
        snapTarget: null,
        didSnap: false,
      };
    }

    // Calculate end frame
    const targetEndFrame = targetStartFrame + itemDurationInFrames;

    // Find nearest snap target for start position
    const nearestStartTarget = findNearestSnapTarget(
      targetStartFrame,
      snapTargets,
      snapThresholdFrames
    );

    // Find nearest snap target for end position
    const nearestEndTarget = findNearestSnapTarget(
      targetEndFrame,
      snapTargets,
      snapThresholdFrames
    );

    // Determine which snap is stronger (closer)
    const startDistance = nearestStartTarget
      ? Math.abs(targetStartFrame - nearestStartTarget.frame)
      : Infinity;
    const endDistance = nearestEndTarget
      ? Math.abs(targetEndFrame - nearestEndTarget.frame)
      : Infinity;

    // Use the closest snap (prioritize magnetic snaps over grid snaps if distances are equal)
    if (startDistance < endDistance) {
      if (nearestStartTarget) {
        return {
          snappedFrame: nearestStartTarget.frame,
          snapTarget: nearestStartTarget,
          didSnap: true,
        };
      }
    } else if (endDistance < Infinity) {
      if (nearestEndTarget) {
        // Snap the end, so adjust start position accordingly
        const adjustedStartFrame = nearestEndTarget.frame - itemDurationInFrames;
        return {
          snappedFrame: adjustedStartFrame,
          snapTarget: nearestEndTarget,
          didSnap: true,
        };
      }
    }

    return {
      snappedFrame: targetStartFrame,
      snapTarget: null,
      didSnap: false,
    };
  };

  /**
   * Get magnetic snap targets only (item edges + playhead, for visual guidelines)
   */
  const magneticSnapTargets = useMemo(() => {
    return snapTargets.filter(
      (t) => t.type === 'item-start' || t.type === 'item-end' || t.type === 'playhead'
    );
  }, [snapTargets]);

  /**
   * Get grid snap targets only
   */
  const gridSnapTargets = useMemo(() => {
    return snapTargets.filter((t) => t.type === 'grid');
  }, [snapTargets]);

  return {
    calculateSnap,
    snapTargets,
    magneticSnapTargets,
    gridSnapTargets,
    snapThresholdFrames,
    snapEnabled,
  };
}
