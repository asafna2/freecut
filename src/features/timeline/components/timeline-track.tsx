import { useState, useRef } from 'react';
import type { TimelineTrack, TimelineItem as TimelineItemType, VideoItem, AudioItem, ImageItem } from '@/types/timeline';
import { TimelineItem } from './timeline-item';
import { useTimelineStore } from '../stores/timeline-store';
import { useTimelineZoom } from '../hooks/use-timeline-zoom';
import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store';
import { mediaLibraryService } from '@/features/media-library/services/media-library-service';
import { getMediaType } from '@/features/media-library/utils/validation';

export interface TimelineTrackProps {
  track: TimelineTrack;
  items: TimelineItemType[];
}

/**
 * Timeline Track Component
 *
 * Renders a single timeline track with:
 * - All items belonging to this track
 * - Appropriate height based on track settings
 * - Generic container that accepts any item types
 * - Drag-and-drop support for media from library
 */
export function TimelineTrack({ track, items }: TimelineTrackProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Store selectors
  const addItem = useTimelineStore((s) => s.addItem);
  const fps = useTimelineStore((s) => s.fps);
  const getMedia = useMediaLibraryStore((s) => s.mediaItems);

  // Zoom utilities for position calculation
  const { pixelsToFrame } = useTimelineZoom();

  // Filter items for this track
  const trackItems = items.filter((item) => item.trackId === track.id);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // Parse drag data
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));

      if (data.type !== 'media-item') {
        return; // Not a media item drop
      }

      const { mediaId, mediaType, fileName } = data;

      // Get media metadata from store
      const media = getMedia.find((m) => m.id === mediaId);
      if (!media) {
        console.error('Media not found:', mediaId);
        return;
      }

      // Calculate drop position in frames
      const trackRect = trackRef.current?.getBoundingClientRect();
      if (!trackRect) return;

      const offsetX = e.clientX - trackRect.left;
      const dropFrame = pixelsToFrame(offsetX);

      // Get media blob URL for playback
      // TODO: Implement blob URL cleanup when timeline items are removed
      // Currently, blob URLs persist until page close, which may cause memory leaks
      // for large files. Consider implementing a blob URL manager service.
      const blobUrl = await mediaLibraryService.getMediaBlobUrl(mediaId);
      if (!blobUrl) {
        console.error('Failed to get media blob URL');
        return;
      }

      // Get thumbnail URL if available
      const thumbnailUrl = await mediaLibraryService.getThumbnailBlobUrl(mediaId);

      // Calculate duration in frames
      const durationInFrames = Math.round(media.duration * fps);

      // Create timeline item based on media type
      let timelineItem: TimelineItemType;
      const baseItem = {
        id: crypto.randomUUID(),
        trackId: track.id,
        from: Math.max(0, dropFrame), // Ensure non-negative
        durationInFrames: durationInFrames > 0 ? durationInFrames : fps, // Default to 1 second for images
        label: fileName,
        mediaId: mediaId,
      };

      if (mediaType === 'video') {
        timelineItem = {
          ...baseItem,
          type: 'video',
          src: blobUrl,
          thumbnailUrl: thumbnailUrl || undefined,
        } as VideoItem;
      } else if (mediaType === 'audio') {
        timelineItem = {
          ...baseItem,
          type: 'audio',
          src: blobUrl,
        } as AudioItem;
      } else if (mediaType === 'image') {
        timelineItem = {
          ...baseItem,
          type: 'image',
          src: blobUrl,
          thumbnailUrl: thumbnailUrl || undefined,
          durationInFrames: fps * 3, // Default 3 seconds for images
        } as ImageItem;
      } else {
        console.warn('Unsupported media type:', mediaType);
        return;
      }

      // Add item to timeline
      addItem(timelineItem);
    } catch (error) {
      console.error('Failed to handle media drop:', error);
    }
  };

  return (
    <div
      ref={trackRef}
      className={`border-b border-border relative transition-colors ${
        isDragOver ? 'bg-primary/5 border-primary' : ''
      }`}
      style={{ height: `${track.height}px` }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop indicator */}
      {isDragOver && (
        <div className="absolute inset-0 border-2 border-dashed border-primary pointer-events-none rounded" />
      )}

      {/* Render all items for this track */}
      {trackItems.map((item) => (
        <TimelineItem key={item.id} item={item} />
      ))}
    </div>
  );
}
