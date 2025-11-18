import { useRef, useEffect } from 'react';
import type { TimelineItem } from '@/types/timeline';
import { useTimelineZoom } from '../../hooks/use-timeline-zoom';
import { useTimelineStore } from '../../stores/timeline-store';
import { useSelectionStore } from '@/features/editor/stores/selection-store';
import { useTimelineDrag, dragOffsetRef } from '../../hooks/use-timeline-drag';
import { DRAG_OPACITY } from '../../constants';

export interface TimelineItemProps {
  item: TimelineItem;
  timelineDuration?: number;
}

/**
 * Timeline Item Component
 *
 * Renders an individual item on the timeline with drag-and-drop support:
 * - Positioned based on start frame (from)
 * - Width based on duration in frames
 * - Visual styling based on item type
 * - Selection state
 * - Click to select
 * - Drag to move (horizontal and vertical)
 * - Grid snapping support
 *
 * Future enhancements:
 * - Resize handles
 * - Trim indicators
 * - Thumbnail preview
 */
export function TimelineItem({ item, timelineDuration = 30 }: TimelineItemProps) {
  const { timeToPixels } = useTimelineZoom();
  const selectedItemIds = useSelectionStore((s) => s.selectedItemIds);
  const selectItems = useSelectionStore((s) => s.selectItems);
  const dragState = useSelectionStore((s) => s.dragState);

  const isSelected = selectedItemIds.includes(item.id);

  // Drag-and-drop functionality (local state for anchor item)
  const { isDragging, dragOffset, handleDragStart } = useTimelineDrag(item, timelineDuration);

  // Check if this item is part of a multi-drag (but not the anchor)
  const isPartOfDrag = dragState?.isDragging && dragState.draggedItemIds.includes(item.id) && !isDragging;

  // Ref for transform style (updated via RAF for smooth dragging without re-renders)
  const transformRef = useRef<HTMLDivElement>(null);
  const wasDraggingRef = useRef(false);

  // Disable transition when anchor item drag ends to avoid animation
  useEffect(() => {
    if (wasDraggingRef.current && !isDragging && transformRef.current) {
      // Drag just ended - disable transition temporarily
      transformRef.current.style.transition = 'none';
      requestAnimationFrame(() => {
        if (transformRef.current) {
          transformRef.current.style.transition = '';
        }
      });
    }
    wasDraggingRef.current = isDragging;
  }, [isDragging]);

  // Use RAF to update transform for items being dragged along (not the anchor)
  useEffect(() => {
    if (!isPartOfDrag || !transformRef.current) return;

    let rafId: number;
    const updateTransform = () => {
      if (transformRef.current && isPartOfDrag) {
        const offset = dragOffsetRef.current;
        transformRef.current.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
        transformRef.current.style.opacity = String(DRAG_OPACITY);
        transformRef.current.style.transition = 'none';
        transformRef.current.style.pointerEvents = 'none';
        rafId = requestAnimationFrame(updateTransform);
      }
    };

    rafId = requestAnimationFrame(updateTransform);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      // Reset styles when drag ends
      if (transformRef.current) {
        transformRef.current.style.transition = 'none';
        transformRef.current.style.transform = '';
        transformRef.current.style.opacity = '';
        transformRef.current.style.pointerEvents = '';
        // Re-enable transitions after position updates (next frame)
        requestAnimationFrame(() => {
          if (transformRef.current) {
            transformRef.current.style.transition = '';
          }
        });
      }
    };
  }, [isPartOfDrag]);

  // Determine if this item is being dragged (anchor or follower)
  const isBeingDragged = isDragging || isPartOfDrag;

  // Get FPS for frame-to-time conversion
  const fps = useTimelineStore((s) => s.fps);

  // Calculate position and width (convert frames to seconds, then to pixels)
  const left = timeToPixels(item.from / fps);
  const width = timeToPixels(item.durationInFrames / fps);

  // Get color based on item type (using timeline theme colors)
  const getItemColor = () => {
    switch (item.type) {
      case 'video':
        return 'bg-timeline-video/30 border-timeline-video';
      case 'audio':
        return 'bg-timeline-audio/30 border-timeline-audio';
      case 'image':
        return 'bg-timeline-image/30 border-timeline-image';
      case 'text':
        return 'bg-timeline-text/30 border-timeline-text';
      case 'shape':
        return 'bg-timeline-shape/30 border-timeline-shape';
      default:
        return 'bg-timeline-video/30 border-timeline-video';
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (e.metaKey || e.ctrlKey) {
      // Multi-select: add to selection
      if (isSelected) {
        selectItems(selectedItemIds.filter((id) => id !== item.id));
      } else {
        selectItems([...selectedItemIds, item.id]);
      }
    } else {
      // Single select
      selectItems([item.id]);
    }
  };

  return (
    <div
      ref={transformRef}
      data-item-id={item.id}
      className={`
        absolute top-2 h-12 rounded overflow-hidden transition-all
        ${getItemColor()}
        ${isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}
        ${isBeingDragged ? 'cursor-grabbing' : 'cursor-grab'}
        ${!isBeingDragged && 'hover:brightness-110'}
      `}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        // Anchor item uses its own dragOffset, followers get updated via RAF
        transform: isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
        opacity: isDragging ? DRAG_OPACITY : 1,
        transition: isDragging ? 'none' : 'all 0.2s',
        pointerEvents: isDragging ? 'none' : 'auto',
      }}
      onClick={handleClick}
      onMouseDown={handleDragStart}
    >
      {/* Item label */}
      <div className="px-2 py-1 text-xs font-medium text-primary-foreground truncate">
        {item.label}
      </div>

      {/* Resize handles (placeholder for future implementation) */}
      {isSelected && (
        <>
          {/* Left handle */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary cursor-ew-resize" />
          {/* Right handle */}
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-primary cursor-ew-resize" />
        </>
      )}
    </div>
  );
}
