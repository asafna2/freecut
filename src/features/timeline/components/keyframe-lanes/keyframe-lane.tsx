/**
 * Keyframe lane component.
 * A single row showing keyframes for one property.
 */

import { memo, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { AnimatableProperty, Keyframe } from '@/types/keyframe';
import { PROPERTY_SHORT_LABELS } from '@/types/keyframe';
import { KeyframeDiamond } from './keyframe-diamond';
import { useTimelineStore } from '../../stores/timeline-store';
import { useZoomStore } from '../../stores/zoom-store';

interface KeyframeLaneProps {
  /** The item ID */
  itemId: string;
  /** The property being displayed */
  property: AnimatableProperty;
  /** Keyframes for this property */
  keyframes: Keyframe[];
  /** Item start frame (for calculating positions) */
  itemFrom: number;
  /** Item duration in frames */
  itemDuration: number;
  /** Timeline FPS */
  fps: number;
  /** Currently selected keyframe IDs */
  selectedKeyframeIds?: Set<string>;
  /** Callback when keyframe selection changes */
  onKeyframeSelect?: (keyframeId: string, shiftKey: boolean) => void;
}

/**
 * Lane height in pixels.
 */
export const LANE_HEIGHT = 18;

/**
 * A single keyframe lane showing diamonds for one property.
 */
export const KeyframeLane = memo(function KeyframeLane({
  itemId,
  property,
  keyframes,
  itemFrom: _itemFrom, // Reserved for future use (playhead relative positioning)
  itemDuration,
  fps,
  selectedKeyframeIds = new Set(),
  onKeyframeSelect,
}: KeyframeLaneProps) {
  // Get zoom level for positioning
  const zoomLevel = useZoomStore((s) => s.level);

  const addKeyframe = useTimelineStore((s) => s.addKeyframe);

  // Calculate pixels per frame based on zoom
  const pixelsPerFrame = useMemo(() => {
    // Base calculation: at zoom level 1, ~100px per second
    const pixelsPerSecond = 100 * zoomLevel;
    return pixelsPerSecond / fps;
  }, [zoomLevel, fps]);

  // Calculate left position for each keyframe
  const keyframePositions = useMemo(() => {
    return keyframes.map((kf) => ({
      keyframe: kf,
      leftPx: kf.frame * pixelsPerFrame,
    }));
  }, [keyframes, pixelsPerFrame]);

  // Lane width based on item duration
  const laneWidth = itemDuration * pixelsPerFrame;

  // Handle click on empty lane area to add keyframe
  const handleLaneClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Calculate frame from click position
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const frame = Math.round(clickX / pixelsPerFrame);

      // Clamp to valid range
      if (frame >= 0 && frame <= itemDuration) {
        // Get default value for property (we'd need to resolve the transform here)
        // For now, use a sensible default
        const defaultValue = property === 'opacity' ? 1 : 0;
        addKeyframe(itemId, property, frame, defaultValue);
      }
    },
    [itemId, property, itemDuration, pixelsPerFrame, addKeyframe]
  );

  return (
    <div
      className={cn(
        'relative flex items-center',
        'bg-muted/30 border-t border-border/30',
        'cursor-crosshair'
      )}
      style={{ height: LANE_HEIGHT, width: laneWidth }}
      onClick={handleLaneClick}
    >
      {/* Property label */}
      <div
        className={cn(
          'absolute left-1 top-1/2 -translate-y-1/2',
          'text-[9px] text-muted-foreground/60 font-medium',
          'pointer-events-none select-none'
        )}
      >
        {PROPERTY_SHORT_LABELS[property]}
      </div>

      {/* Keyframe diamonds */}
      {keyframePositions.map(({ keyframe, leftPx }) => (
        <KeyframeDiamond
          key={keyframe.id}
          keyframe={keyframe}
          itemId={itemId}
          property={property}
          leftPx={leftPx}
          isSelected={selectedKeyframeIds.has(keyframe.id)}
          onSelect={onKeyframeSelect}
        />
      ))}
    </div>
  );
});
