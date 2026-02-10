import { useTimelineZoomContext } from '../contexts/timeline-zoom-context';
import { useTimelineStore } from '../stores/timeline-store';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';

interface TimelineSplitIndicatorProps {
  /** X position in pixels relative to timeline container */
  cursorX: number | null;
  /** The hovered item element for positioning the indicator to clip height */
  hoveredElement: HTMLElement | null;
  /** Reference to the tracks container for calculating relative position */
  tracksContainerRef: React.RefObject<HTMLDivElement | null>;
}

// Snap threshold in pixels
const SNAP_THRESHOLD_PX = 10;

/**
 * Timeline Split Indicator Component
 *
 * Renders a vertical red line at the cursor position when in razor mode.
 * Positioned above the playhead (z-index > 9999) so it's always visible.
 * Snaps to frame boundaries and playhead position for precise cuts.
 */
export function TimelineSplitIndicator({ cursorX, hoveredElement, tracksContainerRef }: TimelineSplitIndicatorProps) {
  const { pixelsToFrame, frameToPixels } = useTimelineZoomContext();
  const fps = useTimelineStore((s) => s.fps);
  // Don't subscribe to currentFrame - read from store only when needed for snap calculation
  // This prevents re-renders during playback

  if (cursorX === null || !hoveredElement || !tracksContainerRef.current) return null;

  // Read playback state directly from store (no subscription = no re-renders during playback)
  const { currentFrame, isPlaying } = usePlaybackStore.getState();

  // Get playhead position in pixels
  const playheadX = frameToPixels(currentFrame);

  // Check if cursor is near playhead (snap to playhead)
  // Don't snap to playhead when video is playing - it moves too fast
  const distanceToPlayhead = Math.abs(cursorX - playheadX);
  const shouldSnapToPlayhead = !isPlaying && distanceToPlayhead <= SNAP_THRESHOLD_PX;

  let snappedX: number;

  if (shouldSnapToPlayhead) {
    // Snap to playhead
    snappedX = playheadX;
  } else {
    // Snap to nearest frame boundary
    const frameAtCursor = pixelsToFrame(cursorX);
    const snappedFrame = Math.round(frameAtCursor * fps) / fps;
    snappedX = frameToPixels(snappedFrame);
  }

  // Calculate clip position relative to tracks container
  const containerRect = tracksContainerRef.current.getBoundingClientRect();
  const elementRect = hoveredElement.getBoundingClientRect();
  const clipTop = elementRect.top - containerRect.top;
  const clipHeight = elementRect.height;

  return (
    <div
      className="absolute w-0.5 bg-red-500 pointer-events-none"
      style={{
        left: `${snappedX}px`,
        top: `${clipTop}px`,
        height: `${clipHeight}px`,
        zIndex: 10000, // Above playhead (9999)
        boxShadow: '0 0 4px rgba(239, 68, 68, 0.5)',
      }}
    />
  );
}
