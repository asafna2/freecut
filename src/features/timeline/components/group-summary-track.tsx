import { memo, useMemo } from 'react';
import type { TimelineTrack } from '@/types/timeline';
import { useTimelineStore } from '../stores/timeline-store';
import { useTimelineZoomContext } from '../contexts/timeline-zoom-context';
import { getChildTrackIds, getGroupItemCoverage } from '../utils/group-utils';

/** Color mapping for item types in the summary bar */
const TYPE_COLORS: Record<string, string> = {
  video: 'rgba(59, 130, 246, 0.6)',   // blue
  audio: 'rgba(168, 85, 247, 0.6)',   // purple
  text: 'rgba(34, 197, 94, 0.6)',     // green
  image: 'rgba(249, 115, 22, 0.6)',   // orange
  shape: 'rgba(236, 72, 153, 0.6)',   // pink
  adjustment: 'rgba(156, 163, 175, 0.5)', // gray
};

interface GroupSummaryTrackProps {
  track: TimelineTrack;
}

function arePropsEqual(prev: GroupSummaryTrackProps, next: GroupSummaryTrackProps) {
  return prev.track === next.track;
}

/**
 * Renders a summary bar for a collapsed group track.
 * Shows colored coverage rectangles representing items in child tracks.
 */
export const GroupSummaryTrack = memo(function GroupSummaryTrack({ track }: GroupSummaryTrackProps) {
  const { frameToPixels } = useTimelineZoomContext();

  // Get all tracks to find children
  const allTracks = useTimelineStore((s) => s.tracks);
  const childTrackIds = useMemo(
    () => new Set(getChildTrackIds(allTracks, track.id)),
    [allTracks, track.id]
  );

  // Get items in child tracks (use shallow comparison on the derived coverage array)
  const items = useTimelineStore((s) => s.items);
  const coverage = useMemo(
    () => getGroupItemCoverage(items, childTrackIds),
    [items, childTrackIds]
  );

  return (
    <div
      className="relative border-b border-border bg-secondary/20"
      style={{ height: `${track.height}px` }}
      data-track-id={track.id}
    >
      {/* Coverage bars */}
      {coverage.map((item, i) => {
        const left = frameToPixels(item.from);
        const width = frameToPixels(item.to) - left;
        return (
          <div
            key={i}
            className="absolute top-1 rounded-sm"
            style={{
              left: `${left}px`,
              width: `${Math.max(width, 2)}px`,
              height: `${track.height - 8}px`,
              backgroundColor: TYPE_COLORS[item.type] ?? 'rgba(156, 163, 175, 0.4)',
            }}
          />
        );
      })}
    </div>
  );
}, arePropsEqual);
