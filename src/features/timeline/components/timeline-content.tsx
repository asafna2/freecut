// Stores and selectors
import { useTimelineStore } from '../stores/timeline-store';

// Components
import { TimelineMarkers } from './timeline-markers';
import { TimelinePlayhead } from './timeline-playhead';
import { TimelineTrack } from './timeline-track';

export interface TimelineContentProps {
  duration: number; // Total timeline duration in seconds
}

/**
 * Timeline Content Component
 *
 * Main timeline rendering area that composes:
 * - TimelineMarkers (time ruler)
 * - TimelinePlayhead (in ruler)
 * - TimelineTracks (all tracks with items)
 * - TimelinePlayhead (through tracks)
 */
export function TimelineContent({ duration }: TimelineContentProps) {
  // Use granular selectors - Zustand v5 best practice
  const tracks = useTimelineStore((s) => s.tracks);
  const items = useTimelineStore((s) => s.items);

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden relative bg-background/30 timeline-container">
      {/* Time Ruler */}
      <div className="relative timeline-ruler">
        <TimelineMarkers duration={duration} />
        <TimelinePlayhead inRuler />
      </div>

      {/* Track lanes */}
      <div className="relative timeline-tracks">
        {tracks.map((track) => (
          <TimelineTrack key={track.id} track={track} items={items} />
        ))}

        {/* Playhead line through all tracks */}
        <TimelinePlayhead />
      </div>
    </div>
  );
}
