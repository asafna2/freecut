import { useEffect, useRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Lock, GripVertical, Volume2, VolumeX, Radio } from 'lucide-react';
import type { TimelineTrack } from '@/types/timeline';
import { useTrackDrag, trackDragOffsetRef } from '../hooks/use-track-drag';
import { useSelectionStore } from '@/features/editor/stores/selection-store';

export interface TrackHeaderProps {
  track: TimelineTrack;
  isActive: boolean;
  isSelected: boolean;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onSelect: (e: React.MouseEvent) => void;
}

/**
 * Custom equality for TrackHeader memo - ignores callback props which are recreated each render
 */
function areTrackHeaderPropsEqual(prev: TrackHeaderProps, next: TrackHeaderProps): boolean {
  return (
    prev.track === next.track &&
    prev.isActive === next.isActive &&
    prev.isSelected === next.isSelected
  );
  // Callbacks (onToggleLock, etc.) are ignored - they're recreated each render but functionality is same
}

/**
 * Track Header Component
 *
 * Displays track name, controls, and handles selection.
 * Shows active state with background color.
 * Memoized to prevent re-renders when props haven't changed.
 */
export const TrackHeader = memo(function TrackHeader({
  track,
  isActive,
  isSelected,
  onToggleLock,
  onToggleVisibility,
  onToggleMute,
  onToggleSolo,
  onSelect,
}: TrackHeaderProps) {
  // Use track drag hook
  const { isDragging, dragOffset, handleDragStart } = useTrackDrag(track);

  // Check if this track is part of multi-drag (not anchor) using granular selector
  // Returns boolean only - avoids re-renders from dragState.offset changes
  const isPartOfDrag = useSelectionStore((s) =>
    s.dragState?.isDragging &&
    (s.dragState.draggedTrackIds?.includes(track.id) ?? false)
  ) && !isDragging; // Not the anchor track

  const isBeingDragged = isDragging || isPartOfDrag;

  // Ref for transform style (updated via RAF for smooth dragging without re-renders)
  const transformRef = useRef<HTMLDivElement>(null);

  // Use RAF to update transform for tracks being dragged along (not the anchor)
  useEffect(() => {
    if (!isPartOfDrag || !transformRef.current) return;

    let rafId: number;
    const updateTransform = () => {
      if (transformRef.current && isPartOfDrag) {
        const offset = trackDragOffsetRef.current;
        transformRef.current.style.transform = `translateY(${offset}px) scale(1.02)`;
        transformRef.current.style.opacity = '0.5';
        transformRef.current.style.transition = 'none';
        transformRef.current.style.pointerEvents = 'none';
        transformRef.current.style.zIndex = '100';
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
        transformRef.current.style.zIndex = '';
        // Re-enable transitions after position updates (next frame)
        requestAnimationFrame(() => {
          if (transformRef.current) {
            transformRef.current.style.transition = '';
          }
        });
      }
    };
  }, [isPartOfDrag]);

  return (
    <div
      ref={transformRef}
      className={`
        flex items-center justify-between px-2 border-b border-border
        cursor-grab active:cursor-grabbing relative
        ${isSelected ? 'bg-primary/10' : 'hover:bg-secondary/50'}
        ${isActive ? 'border-l-3 border-l-primary' : 'border-l-3 border-l-transparent'}
        ${isBeingDragged ? 'opacity-50 pointer-events-none shadow-lg ring-2 ring-primary/30' : ''}
        ${!isBeingDragged ? 'transition-all duration-150' : ''}
      `}
      style={{
        height: `${track.height}px`,
        transform: isDragging ? `translateY(${dragOffset}px) scale(1.02)` : undefined,
        transition: isDragging ? 'none' : undefined,
        zIndex: isBeingDragged ? 100 : undefined,
        // content-visibility optimization for long track lists (rendering-content-visibility)
        contentVisibility: 'auto',
        containIntrinsicSize: `192px ${track.height}px`,
      }}
      onClick={onSelect}
      onMouseDown={handleDragStart}
      data-track-id={track.id}
    >
      {/* Drag Handle Icon & Track Name */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <GripVertical className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium font-mono whitespace-nowrap">
          {track.name}
        </span>
      </div>

      <div className="flex items-center gap-0.2 shrink-0">
        {/* Visibility Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {track.visible ? (
            <Eye className="w-1 h-1" />
          ) : (
            <EyeOff className="w-1 h-1 opacity-50" />
          )}
        </Button>

        {/* Audio Mute Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {track.muted ? (
            <VolumeX className="w-1 h-1 text-muted-foreground" />
          ) : (
            <Volume2 className="w-1 h-1" />
          )}
        </Button>

        {/* Solo Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSolo();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Radio
            className={`w-1 h-1 ${track.solo ? 'text-primary' : ''}`}
          />
        </Button>

        {/* Lock Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Lock
            className={`w-1 h-1 ${track.locked ? 'text-primary' : ''}`}
          />
        </Button>
      </div>
    </div>
  );
}, areTrackHeaderPropsEqual);
