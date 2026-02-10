/**
 * Cache for media drag data
 *
 * This module provides a way to share drag data between the media library
 * and timeline components. This is necessary because dataTransfer.getData()
 * is not accessible during dragover events for security reasons.
 */

interface DragMediaItem {
  mediaId: string;
  mediaType: string;
  fileName: string;
  duration: number;
}

interface MediaDragData {
  type: 'media-item' | 'media-items';
  items?: DragMediaItem[];
  mediaId?: string;
  mediaType?: string;
  fileName?: string;
  duration?: number;
}

let cachedDragData: MediaDragData | null = null;

export function setMediaDragData(data: MediaDragData): void {
  cachedDragData = data;
}

export function getMediaDragData(): MediaDragData | null {
  return cachedDragData;
}

export function clearMediaDragData(): void {
  cachedDragData = null;
}
