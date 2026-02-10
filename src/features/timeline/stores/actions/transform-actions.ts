/**
 * Transform Actions - Item transform operations with undo/redo support.
 */

import type { TransformProperties } from '@/types/transform';
import { useItemsStore } from '../items-store';
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
