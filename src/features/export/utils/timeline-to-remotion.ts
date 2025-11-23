import type { TimelineTrack, TimelineItem } from '@/types/timeline';
import type { RemotionInputProps } from '@/types/export';

/**
 * Convert timeline data to Remotion input props
 *
 * Calculates duration from the rightmost timeline item and includes
 * resolution settings from export dialog.
 *
 * When in/out points are set, only exports the range between them:
 * - Filters items that overlap with the in/out range
 * - Adjusts item positions to be relative to in-point
 * - Sets duration to the in/out range length
 *
 * Tracks are sorted by their order property so that higher-numbered tracks
 * (e.g., Track 2) render on top of lower-numbered tracks (e.g., Track 1).
 */
export function convertTimelineToRemotion(
  tracks: TimelineTrack[],
  items: TimelineItem[],
  fps: number,
  width: number,
  height: number,
  inPoint?: number | null,
  outPoint?: number | null
): RemotionInputProps {
  // Determine if we're exporting a specific in/out range
  const hasInOutRange = inPoint !== null && inPoint !== undefined &&
                        outPoint !== null && outPoint !== undefined &&
                        outPoint > inPoint;

  // Process items based on whether in/out points are set
  let processedItems = items;
  let durationInFrames: number;

  if (hasInOutRange) {
    // Filter items that overlap with the in/out range
    processedItems = items
      .filter(item => {
        const itemStart = item.from;
        const itemEnd = item.from + item.durationInFrames;
        // Keep items that overlap with [inPoint, outPoint]
        return itemEnd > inPoint! && itemStart < outPoint!;
      })
      .map(item => {
        const itemStart = item.from;
        const itemEnd = item.from + item.durationInFrames;

        // Calculate new position relative to in-point
        const newFrom = Math.max(0, itemStart - inPoint!);

        // Calculate trimmed duration if item extends beyond in/out range
        let newDuration = item.durationInFrames;
        let additionalTrimStart = 0;
        let additionalTrimEnd = 0;

        // Trim start if item starts before in-point
        if (itemStart < inPoint!) {
          additionalTrimStart = inPoint! - itemStart;
          newDuration -= additionalTrimStart;
        }

        // Trim end if item extends beyond out-point
        if (itemEnd > outPoint!) {
          additionalTrimEnd = itemEnd - outPoint!;
          newDuration -= additionalTrimEnd;
        }

        // Create adjusted item
        const adjustedItem = {
          ...item,
          from: newFrom,
          durationInFrames: newDuration,
        };

        // Update trim properties for video/audio items
        if (item.type === 'video' || item.type === 'audio') {
          const currentTrimStart = item.trimStart || 0;
          const currentTrimEnd = item.trimEnd || 0;
          const currentSourceStart = item.sourceStart || 0;

          (adjustedItem as any).trimStart = currentTrimStart + additionalTrimStart;
          (adjustedItem as any).trimEnd = currentTrimEnd + additionalTrimEnd;
          (adjustedItem as any).sourceStart = currentSourceStart + additionalTrimStart;
          (adjustedItem as any).offset = (adjustedItem as any).trimStart;
        }

        return adjustedItem;
      });

    // Duration is the in/out range length
    durationInFrames = outPoint! - inPoint!;
  } else {
    // No in/out range - calculate duration from the rightmost item
    const maxEndFrame = items.length > 0
      ? Math.max(...items.map(item => item.from + item.durationInFrames))
      : fps * 10; // Default to 10 seconds if no items

    // Ensure minimum duration of 1 second
    durationInFrames = Math.max(maxEndFrame, fps);
  }

  // Populate each track with its processed items
  const tracksWithItems: TimelineTrack[] = tracks.map(track => ({
    ...track,
    items: processedItems.filter(item => item.trackId === track.id),
  }));

  // Sort tracks by order (ascending) so they render in correct z-index
  // Lower order values render first (bottom), higher values render on top
  const sortedTracks = tracksWithItems.sort((a, b) => a.order - b.order);

  return {
    fps,
    durationInFrames,
    width,
    height,
    tracks: sortedTracks,
  };
}
