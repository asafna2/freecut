/**
 * Transform Actions - Item transform operations with undo/redo support.
 */

import type { TransformProperties } from '@/types/transform';
import type { AnimatableProperty } from '@/types/keyframe';
import type { LayoutConfig } from '../../utils/bento-layout';
import { computeLayout } from '../../utils/bento-layout';
import { useItemsStore } from '../items-store';
import { useKeyframesStore } from '../keyframes-store';
import { useTimelineSettingsStore } from '../timeline-settings-store';
import { execute } from './shared';

export function updateItemTransform(id: string, transform: Partial<TransformProperties>): void {
  execute('UPDATE_TRANSFORM', () => {
    useItemsStore.getState()._updateItemTransform(id, transform);
    useTimelineSettingsStore.getState().markDirty();
  }, { id });
}

export function resetItemTransform(id: string): void {
  execute('RESET_TRANSFORM', () => {
    useItemsStore.getState()._resetItemTransform(id);
    useTimelineSettingsStore.getState().markDirty();
  }, { id });
}

export function updateItemsTransform(ids: string[], transform: Partial<TransformProperties>): void {
  execute('UPDATE_TRANSFORMS', () => {
    useItemsStore.getState()._updateItemsTransform(ids, transform);
    useTimelineSettingsStore.getState().markDirty();
  }, { ids });
}

export function updateItemsTransformMap(
  transformsMap: Map<string, Partial<TransformProperties>>
): void {
  execute('UPDATE_TRANSFORMS', () => {
    useItemsStore.getState()._updateItemsTransformMap(transformsMap);
    useTimelineSettingsStore.getState().markDirty();
  }, { count: transformsMap.size });
}

/** Transform properties that bento layout controls (cleared from keyframes) */
const BENTO_PROPERTIES: AnimatableProperty[] = ['x', 'y', 'width', 'height', 'rotation'];

export function applyBentoLayout(
  itemIds: string[],
  canvasWidth: number,
  canvasHeight: number,
  config?: LayoutConfig,
): void {
  const items = useItemsStore.getState().items;

  // Filter to visual items only (exclude audio)
  const visualItems = itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i) => i != null && i.type !== 'audio');

  if (visualItems.length < 2) return;

  // Build layout input — use sourceWidth/sourceHeight for video/image, canvas dims for others
  const layoutItems = visualItems.map((item) => {
    const sw = ('sourceWidth' in item && item.sourceWidth) || canvasWidth;
    const sh = ('sourceHeight' in item && item.sourceHeight) || canvasHeight;
    return { id: item.id, sourceWidth: sw, sourceHeight: sh };
  });

  const resolvedConfig: LayoutConfig = config ?? { preset: 'auto' };
  const transformsMap = computeLayout(layoutItems, canvasWidth, canvasHeight, resolvedConfig);

  execute('APPLY_BENTO_LAYOUT', () => {
    // Clear transform keyframes that would conflict
    const kfStore = useKeyframesStore.getState();
    for (const item of visualItems) {
      for (const prop of BENTO_PROPERTIES) {
        kfStore._removeKeyframesForProperty(item.id, prop);
      }
    }

    // Apply computed transforms
    useItemsStore.getState()._updateItemsTransformMap(transformsMap);
    useTimelineSettingsStore.getState().markDirty();
  }, { count: visualItems.length });
}
