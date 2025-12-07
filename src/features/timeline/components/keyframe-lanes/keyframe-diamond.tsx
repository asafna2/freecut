/**
 * Keyframe diamond marker component.
 * Renders a diamond shape representing a keyframe on a lane.
 */

import { memo, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { Keyframe, AnimatableProperty, EasingType } from '@/types/keyframe';
import { EASING_LABELS } from '@/types/keyframe';
import { useTimelineStore } from '../../stores/timeline-store';

interface KeyframeDiamondProps {
  /** The keyframe data */
  keyframe: Keyframe;
  /** The item ID this keyframe belongs to */
  itemId: string;
  /** The property this keyframe animates */
  property: AnimatableProperty;
  /** Left position in pixels from lane start */
  leftPx: number;
  /** Whether this keyframe is selected */
  isSelected?: boolean;
  /** Callback when keyframe is clicked */
  onSelect?: (keyframeId: string, shiftKey: boolean) => void;
}

/**
 * Individual keyframe marker on a keyframe lane.
 * Diamond-shaped indicator that can be selected and dragged.
 */
/** All available easing types */
const EASING_TYPES: EasingType[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

export const KeyframeDiamond = memo(function KeyframeDiamond({
  keyframe,
  itemId,
  property,
  leftPx,
  isSelected = false,
  onSelect,
}: KeyframeDiamondProps) {
  const removeKeyframe = useTimelineStore((s) => s.removeKeyframe);
  const updateKeyframe = useTimelineStore((s) => s.updateKeyframe);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.(keyframe.id, e.shiftKey);
    },
    [keyframe.id, onSelect]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Double-click to delete
      removeKeyframe(itemId, property, keyframe.id);
    },
    [itemId, property, keyframe.id, removeKeyframe]
  );

  const handleDelete = useCallback(() => {
    removeKeyframe(itemId, property, keyframe.id);
  }, [itemId, property, keyframe.id, removeKeyframe]);

  const handleEasingChange = useCallback(
    (easing: string) => {
      updateKeyframe(itemId, property, keyframe.id, { easing: easing as EasingType });
    },
    [itemId, property, keyframe.id, updateKeyframe]
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
            'w-2.5 h-2.5 rotate-45 cursor-pointer',
            'transition-colors duration-100',
            'hover:scale-110',
            isSelected
              ? 'bg-amber-400 border border-amber-600'
              : 'bg-amber-500/80 border border-amber-600/50 hover:bg-amber-400'
          )}
          style={{ left: leftPx }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          title={`Frame ${keyframe.frame}: ${keyframe.value.toFixed(1)} (${EASING_LABELS[keyframe.easing]})`}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel>Easing</ContextMenuLabel>
        <ContextMenuRadioGroup value={keyframe.easing} onValueChange={handleEasingChange}>
          {EASING_TYPES.map((type) => (
            <ContextMenuRadioItem key={type} value={type}>
              {EASING_LABELS[type]}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Keyframe
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
