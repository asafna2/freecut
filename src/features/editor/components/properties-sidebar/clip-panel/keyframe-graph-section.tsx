/**
 * Keyframe graph section for clip properties panel.
 * Shows an interactive value graph editor for keyframe animation.
 */

import { memo, useMemo, useState, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, Activity } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ValueGraphEditor } from '@/features/keyframes/components/value-graph-editor';
import { useKeyframesStore } from '@/features/timeline/stores/keyframes-store';
import { useKeyframeSelectionStore } from '@/features/timeline/stores/keyframe-selection-store';
import { useTimelineCommandStore } from '@/features/timeline/stores/timeline-command-store';
import { captureSnapshot } from '@/features/timeline/stores/commands/snapshot';
import type { TimelineSnapshot } from '@/features/timeline/stores/commands/types';
import { useTimelineSettingsStore } from '@/features/timeline/stores/timeline-settings-store';
import * as timelineActions from '@/features/timeline/stores/timeline-actions';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';
import { useThrottledFrame } from '@/features/preview/hooks/use-throttled-frame';
import type { TimelineItem } from '@/types/timeline';
import type { AnimatableProperty, KeyframeRef, BezierControlPoints, Keyframe } from '@/types/keyframe';

interface KeyframeGraphSectionProps {
  /** Selected timeline items */
  items: TimelineItem[];
}

/**
 * Section showing the keyframe value graph editor.
 * Only shown when a single item with keyframes is selected.
 */
export const KeyframeGraphSection = memo(function KeyframeGraphSection({
  items,
}: KeyframeGraphSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<AnimatableProperty | null>(null);

  // Only show for single item selection
  const item = items.length === 1 ? items[0] : null;

  // Get keyframe data - subscribe to the actual keyframes array for this item
  const itemKeyframes = useKeyframesStore((s) =>
    item ? s.keyframes.find((k) => k.itemId === item.id) : undefined
  );
  const _updateKeyframe = useKeyframesStore((s) => s._updateKeyframe);

  // Ref to store snapshot captured on drag start for undo batching
  const dragSnapshotRef = useRef<TimelineSnapshot | null>(null);

  // Get selection state
  const selectedKeyframes = useKeyframeSelectionStore((s) => s.selectedKeyframes);
  const selectKeyframes = useKeyframeSelectionStore((s) => s.selectKeyframes);

  // Get current frame (throttled to reduce re-renders during playback)
  const currentFrame = useThrottledFrame();

  // Get keyframes by property for the selected item
  const keyframesByProperty = useMemo((): Partial<Record<AnimatableProperty, Keyframe[]>> => {
    if (!itemKeyframes) return {};

    const result: Partial<Record<AnimatableProperty, Keyframe[]>> = {};

    for (const propKeyframes of itemKeyframes.properties) {
      if (propKeyframes.keyframes && propKeyframes.keyframes.length > 0) {
        result[propKeyframes.property] = propKeyframes.keyframes;
      }
    }

    return result;
  }, [itemKeyframes]);

  // Check if item has any keyframes
  const hasKeyframes = Object.keys(keyframesByProperty).length > 0;

  // Get selected keyframe IDs for this item
  const selectedKeyframeIds = useMemo(() => {
    if (!item) return new Set<string>();
    return new Set(
      selectedKeyframes
        .filter((ref) => ref.itemId === item.id)
        .map((ref) => ref.keyframeId)
    );
  }, [item, selectedKeyframes]);

  // Handle drag start - capture snapshot for undo batching
  const handleDragStart = useCallback(() => {
    dragSnapshotRef.current = captureSnapshot();
  }, []);

  // Handle drag end - commit undo entry with pre-captured snapshot
  const handleDragEnd = useCallback(() => {
    const beforeSnapshot = dragSnapshotRef.current;
    if (beforeSnapshot) {
      useTimelineCommandStore.getState().addUndoEntry(
        { type: 'MOVE_KEYFRAME_GRAPH', payload: {} },
        beforeSnapshot
      );
      useTimelineSettingsStore.getState().markDirty();
      dragSnapshotRef.current = null;
    }
  }, []);

  // Handle keyframe move (no undo per call - batched via drag start/end)
  const handleKeyframeMove = useCallback(
    (ref: KeyframeRef, newFrame: number, newValue: number) => {
      _updateKeyframe(ref.itemId, ref.property, ref.keyframeId, {
        frame: Math.max(0, newFrame),
        value: newValue,
      });
    },
    [_updateKeyframe]
  );

  // Handle bezier handle move (no undo per call - batched via drag start/end)
  const handleBezierHandleMove = useCallback(
    (ref: KeyframeRef, bezier: BezierControlPoints) => {
      _updateKeyframe(ref.itemId, ref.property, ref.keyframeId, {
        easingConfig: { type: 'cubic-bezier', bezier },
      });
    },
    [_updateKeyframe]
  );

  // Handle selection change
  const handleSelectionChange = useCallback(
    (keyframeIds: Set<string>) => {
      if (!item || !selectedProperty) return;

      const refs: KeyframeRef[] = Array.from(keyframeIds).map((keyframeId) => ({
        itemId: item.id,
        property: selectedProperty,
        keyframeId,
      }));

      selectKeyframes(refs);
    },
    [item, selectedProperty, selectKeyframes]
  );

  // Handle property change
  const handlePropertyChange = useCallback((property: AnimatableProperty | null) => {
    setSelectedProperty(property);
  }, []);

  // Handle adding a keyframe at the current frame
  const handleAddKeyframe = useCallback(
    (property: AnimatableProperty, frame: number) => {
      if (!item || !itemKeyframes) return;

      // Get the interpolated value at this frame from existing keyframes
      const propKeyframes = itemKeyframes.properties.find(
        (p) => p.property === property
      );
      
      // Default value based on property or interpolate from existing keyframes
      let value = 1; // Default for scale, opacity
      if (property === 'x' || property === 'y') value = 0;
      if (property === 'rotation') value = 0;

      // If there are existing keyframes, interpolate value
      if (propKeyframes && propKeyframes.keyframes.length > 0) {
        const sorted = [...propKeyframes.keyframes].sort((a, b) => a.frame - b.frame);
        const before = sorted.filter((kf) => kf.frame <= frame).pop();
        const after = sorted.find((kf) => kf.frame > frame);

        if (before && after) {
          // Linear interpolation between before and after
          const t = (frame - before.frame) / (after.frame - before.frame);
          value = before.value + (after.value - before.value) * t;
        } else if (before) {
          value = before.value;
        } else if (after) {
          value = after.value;
        }
      }

      timelineActions.addKeyframe(item.id, property, frame, value);
    },
    [item, itemKeyframes]
  );

  // Handle removing keyframes
  const handleRemoveKeyframes = useCallback(
    (refs: KeyframeRef[]) => {
      if (refs.length === 0) return;
      timelineActions.removeKeyframes(refs);
    },
    []
  );

  // Handle navigation to a keyframe - convert clip-relative frame to absolute
  const handleNavigateToKeyframe = useCallback(
    (clipRelativeFrame: number) => {
      if (!item) return;
      const absoluteFrame = item.from + clipRelativeFrame;
      usePlaybackStore.getState().setCurrentFrame(absoluteFrame);
    },
    [item]
  );

  // Don't render if no item or no keyframes
  if (!item || !hasKeyframes) {
    return null;
  }

  // Calculate total frames from item duration
  const totalFrames = item.durationInFrames;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-2 h-auto">
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Keyframe Graph</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {Object.keys(keyframesByProperty).length} properties
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ValueGraphEditor
          itemId={item.id}
          keyframesByProperty={keyframesByProperty}
          selectedProperty={selectedProperty}
          selectedKeyframeIds={selectedKeyframeIds}
          currentFrame={currentFrame}
          totalFrames={totalFrames}
          width={308}
          height={200}
          onKeyframeMove={handleKeyframeMove}
          onBezierHandleMove={handleBezierHandleMove}
          onSelectionChange={handleSelectionChange}
          onPropertyChange={handlePropertyChange}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onAddKeyframe={handleAddKeyframe}
          onRemoveKeyframes={handleRemoveKeyframes}
          onNavigateToKeyframe={handleNavigateToKeyframe}
        />
      </CollapsibleContent>
    </Collapsible>
  );
});
