/**
 * Thumbnail generation utilities for media library
 *
 * Generates thumbnails for video, audio, and image files
 */

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  timestamp?: number; // For video, timestamp in seconds
}

const DEFAULT_THUMBNAIL_OPTIONS: Required<ThumbnailOptions> = {
  width: 320,
  height: 180,
  quality: 0.8,
  timestamp: 1, // Capture at 1 second mark (as specified in requirements)
};

/**
 * Generate thumbnail for video file at specific timestamp
 */
export async function generateVideoThumbnail(
  file: File,
  options: ThumbnailOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    canvas.width = opts.width;
    canvas.height = opts.height;

    video.preload = 'metadata';
    video.muted = true;

    video.onloadedmetadata = () => {
      // Seek to timestamp (ensure it's within video duration)
      const seekTime = Math.min(opts.timestamp, video.duration - 0.1);
      video.currentTime = Math.max(0, seekTime);
    };

    video.onseeked = () => {
      try {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, opts.width, opts.height);

        // Convert canvas to blob
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(video.src);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create thumbnail blob'));
            }
          },
          'image/jpeg',
          opts.quality
        );
      } catch (error) {
        URL.revokeObjectURL(video.src);
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Generate thumbnail for audio file (waveform placeholder)
 */
export async function generateAudioThumbnail(
  file: File,
  options: ThumbnailOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    canvas.width = opts.width;
    canvas.height = opts.height;

    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, opts.width, opts.height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, opts.width, opts.height);

    // Draw audio waveform placeholder
    ctx.strokeStyle = '#00ff88'; // Green for audio
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Simple sine wave pattern
    const amplitude = opts.height * 0.3;
    const frequency = 0.02;
    const centerY = opts.height / 2;

    for (let x = 0; x < opts.width; x++) {
      const y = centerY + Math.sin(x * frequency) * amplitude;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Add audio icon and filename
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "IBM Plex Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const displayName =
      file.name.length > 30 ? file.name.substring(0, 27) + '...' : file.name;
    ctx.fillText(displayName, opts.width / 2, opts.height - 20);

    // Convert canvas to blob
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create audio thumbnail blob'));
        }
      },
      'image/jpeg',
      opts.quality
    );
  });
}

/**
 * Generate thumbnail for image file (resized version)
 */
export async function generateImageThumbnail(
  file: File,
  options: ThumbnailOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_THUMBNAIL_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    canvas.width = opts.width;
    canvas.height = opts.height;

    img.onload = () => {
      // Draw image to canvas (resized)
      ctx.drawImage(img, 0, 0, opts.width, opts.height);

      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(img.src);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create image thumbnail blob'));
          }
        },
        'image/jpeg',
        opts.quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for thumbnail'));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate thumbnail based on file type
 */
export async function generateThumbnail(
  file: File,
  options: ThumbnailOptions = {}
): Promise<Blob> {
  const mimeType = file.type;

  if (mimeType.startsWith('video/')) {
    return generateVideoThumbnail(file, options);
  } else if (mimeType.startsWith('audio/')) {
    return generateAudioThumbnail(file, options);
  } else if (mimeType.startsWith('image/')) {
    return generateImageThumbnail(file, options);
  } else {
    throw new Error(`Unsupported file type for thumbnail: ${mimeType}`);
  }
}
