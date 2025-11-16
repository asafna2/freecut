/**
 * Thumbnail generation utilities for video projects
 */

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number; // 0-1
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

const DEFAULT_THUMBNAIL_OPTIONS: Required<ThumbnailOptions> = {
  width: 320,
  height: 180,
  quality: 0.8,
  format: 'image/jpeg',
};

/**
 * Generate a thumbnail from a video file
 * Captures a frame from the video at a specific time
 */
export async function generateVideoThumbnail(
  videoFile: File,
  timeInSeconds: number = 0,
  options: ThumbnailOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Set canvas dimensions
    canvas.width = opts.width;
    canvas.height = opts.height;

    video.preload = 'metadata';
    video.muted = true;

    video.onloadedmetadata = () => {
      // Seek to the desired time
      video.currentTime = Math.min(timeInSeconds, video.duration);
    };

    video.onseeked = () => {
      try {
        // Draw the video frame to canvas
        ctx.drawImage(video, 0, 0, opts.width, opts.height);

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL(opts.format, opts.quality);

        // Clean up
        URL.revokeObjectURL(video.src);
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };

    // Load the video
    video.src = URL.createObjectURL(videoFile);
  });
}

/**
 * Generate a placeholder thumbnail with gradient and text
 * Used when no video content is available yet
 */
export function generatePlaceholderThumbnail(
  text: string,
  options: ThumbnailOptions = {}
): string {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = opts.width;
  canvas.height = opts.height;

  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, opts.width, opts.height);
  gradient.addColorStop(0, '#1a1a1a');
  gradient.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, opts.width, opts.height);

  // Add text
  ctx.fillStyle = '#666666';
  ctx.font = 'bold 16px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Truncate text if too long
  const maxChars = 20;
  const displayText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
  ctx.fillText(displayText, opts.width / 2, opts.height / 2);

  return canvas.toDataURL(opts.format, opts.quality);
}

/**
 * Generate a thumbnail from the first frame of timeline clips
 * This would be used when the user has added clips to the timeline
 */
export async function generateTimelineThumbnail(
  clips: Array<{ videoElement: HTMLVideoElement }>,
  options: ThumbnailOptions = {}
): Promise<string> {
  if (clips.length === 0) {
    throw new Error('No clips provided for thumbnail generation');
  }

  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = opts.width;
  canvas.height = opts.height;

  return new Promise((resolve, reject) => {
    const firstClip = clips[0].videoElement;

    // Ensure video is loaded
    if (firstClip.readyState >= 2) {
      try {
        ctx.drawImage(firstClip, 0, 0, opts.width, opts.height);
        const dataUrl = canvas.toDataURL(opts.format, opts.quality);
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      }
    } else {
      firstClip.onloadeddata = () => {
        try {
          ctx.drawImage(firstClip, 0, 0, opts.width, opts.height);
          const dataUrl = canvas.toDataURL(opts.format, opts.quality);
          resolve(dataUrl);
        } catch (error) {
          reject(error);
        }
      };

      firstClip.onerror = () => {
        reject(new Error('Failed to load video clip'));
      };
    }
  });
}

/**
 * Convert data URL to Blob for storage
 */
export function dataURLtoBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
}

/**
 * Store thumbnail in IndexedDB
 */
export async function storeThumbnail(projectId: string, dataURL: string): Promise<void> {
  const blob = dataURLtoBlob(dataURL);

  // Open IndexedDB
  const db = await openThumbnailDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['thumbnails'], 'readwrite');
    const store = transaction.objectStore('thumbnails');
    const request = store.put({ projectId, blob, createdAt: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve thumbnail from IndexedDB
 */
export async function getThumbnail(projectId: string): Promise<string | null> {
  const db = await openThumbnailDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['thumbnails'], 'readonly');
    const store = transaction.objectStore('thumbnails');
    const request = store.get(projectId);

    request.onsuccess = () => {
      if (request.result) {
        const blob = request.result.blob as Blob;
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete thumbnail from IndexedDB
 */
export async function deleteThumbnail(projectId: string): Promise<void> {
  const db = await openThumbnailDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['thumbnails'], 'readwrite');
    const store = transaction.objectStore('thumbnails');
    const request = store.delete(projectId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Open or create the thumbnails IndexedDB database
 */
function openThumbnailDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VideoEditorThumbnails', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('thumbnails')) {
        const store = db.createObjectStore('thumbnails', { keyPath: 'projectId' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Resize image data URL to fit specific dimensions
 */
export function resizeThumbnail(
  dataURL: string,
  targetWidth: number,
  targetHeight: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataURL;
  });
}
