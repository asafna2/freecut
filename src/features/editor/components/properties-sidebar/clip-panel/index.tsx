import { useMemo, useCallback } from 'react';
import { Separator } from '@/components/ui/separator';
import { useSelectionStore } from '@/features/editor/stores/selection-store';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { useProjectStore } from '@/features/projects/stores/project-store';
import type { TransformProperties } from '@/types/transform';

import { SourceSection } from './source-section';
import { LayoutSection } from './layout-section';
import { FillSection } from './fill-section';
import { VideoSection } from './video-section';
import { AudioSection } from './audio-section';
import { TextSection } from './text-section';
import { ShapeSection } from './shape-section';

/**
 * Clip properties panel - shown when one or more clips are selected.
 * Displays and allows editing of clip transforms and media properties.
 */
export function ClipPanel() {
  // Granular selectors
  const selectedItemIds = useSelectionStore((s) => s.selectedItemIds);
  const items = useTimelineStore((s) => s.items);
  const fps = useTimelineStore((s) => s.fps);
  const updateItemsTransform = useTimelineStore((s) => s.updateItemsTransform);
  const currentProject = useProjectStore((s) => s.currentProject);

  // Get selected items
  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.includes(item.id)),
    [items, selectedItemIds]
  );

  // Canvas settings
  const canvas = useMemo(
    () => ({
      width: currentProject?.metadata.width ?? 1920,
      height: currentProject?.metadata.height ?? 1080,
      fps: currentProject?.metadata.fps ?? 30,
    }),
    [currentProject]
  );

  // Check if selection includes visual items (not just audio)
  const hasVisualItems = useMemo(
    () => selectedItems.some((item) => item.type !== 'audio'),
    [selectedItems]
  );

  // Check if selection includes video items
  const hasVideoItems = useMemo(
    () => selectedItems.some((item) => item.type === 'video'),
    [selectedItems]
  );

  // Check if selection includes audio-capable items
  const hasAudioItems = useMemo(
    () =>
      selectedItems.some(
        (item) => item.type === 'video' || item.type === 'audio'
      ),
    [selectedItems]
  );

  // Check if selection includes text items
  const hasTextItems = useMemo(
    () => selectedItems.some((item) => item.type === 'text'),
    [selectedItems]
  );

  // Check if selection includes shape items
  const hasShapeItems = useMemo(
    () => selectedItems.some((item) => item.type === 'shape'),
    [selectedItems]
  );

  // Check if selection is only text/shape items (no aspect ratio lock by default)
  const isOnlyTextOrShape = useMemo(
    () => selectedItems.length > 0 && selectedItems.every(
      (item) => item.type === 'text' || item.type === 'shape'
    ),
    [selectedItems]
  );

  // Compute aspectLocked from items' transforms
  // If any item has explicit aspectRatioLocked, use that; otherwise use default based on type
  const aspectLocked = useMemo(() => {
    if (selectedItems.length === 0) return true;

    // Check if any item has explicit aspectRatioLocked set
    const firstWithExplicit = selectedItems.find(
      (item) => item.transform?.aspectRatioLocked !== undefined
    );
    if (firstWithExplicit) {
      return firstWithExplicit.transform!.aspectRatioLocked!;
    }

    // Default based on item types: text/shape = unlocked, others = locked
    return !isOnlyTextOrShape;
  }, [selectedItems, isOnlyTextOrShape]);

  // Toggle aspect lock - updates all selected items' transforms
  const handleAspectLockToggle = useCallback(() => {
    const newValue = !aspectLocked;
    const itemIds = selectedItems.map((item) => item.id);
    updateItemsTransform(itemIds, { aspectRatioLocked: newValue });
  }, [aspectLocked, selectedItems, updateItemsTransform]);

  // Handle transform changes
  const handleTransformChange = useCallback(
    (ids: string[], updates: Partial<TransformProperties>) => {
      updateItemsTransform(ids, updates);
    },
    [updateItemsTransform]
  );

  if (selectedItems.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Source info - always shown */}
      <SourceSection items={selectedItems} fps={fps} />

      <Separator />

      {/* Layout - only for visual items */}
      {hasVisualItems && (
        <>
          <LayoutSection
            items={selectedItems.filter((item) => item.type !== 'audio')}
            canvas={canvas}
            onTransformChange={handleTransformChange}
            aspectLocked={aspectLocked}
            onAspectLockToggle={handleAspectLockToggle}
          />
          <Separator />
        </>
      )}

      {/* Fill - only for visual items */}
      {hasVisualItems && (
        <>
          <FillSection
            items={selectedItems.filter((item) => item.type !== 'audio')}
            canvas={canvas}
            onTransformChange={handleTransformChange}
          />
          <Separator />
        </>
      )}

      {/* Text - only for text items */}
      {hasTextItems && (
        <>
          <TextSection items={selectedItems} />
          <Separator />
        </>
      )}

      {/* Shape - only for shape items */}
      {hasShapeItems && (
        <>
          <ShapeSection items={selectedItems} />
          <Separator />
        </>
      )}

      {/* Video - only for video items */}
      {hasVideoItems && (
        <>
          <VideoSection items={selectedItems} />
          <Separator />
        </>
      )}

      {/* Audio - for video and audio items */}
      {hasAudioItems && <AudioSection items={selectedItems} />}
    </div>
  );
}
