/**
 * Metadata extraction utilities using mediabunny
 *
 * Extracts video/audio/image metadata for storage in IndexedDB
 */

// Lazy load mediabunny only when needed to avoid loading heavy library upfront
let mediabunnyModule: any = null;
async function getMediabunny() {
  if (!mediabunnyModule) {
    mediabunnyModule = await import('mediabunny');
  }
  return mediabunnyModule;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
}

export interface AudioMetadata {
  duration: number;
  channels?: number;
  sampleRate?: number;
  bitrate?: number;
}

export interface ImageMetadata {
  width: number;
  height: number;
}

/**
 * Extract metadata from video file using mediabunny
 */
export async function extractVideoMetadata(
  file: File
): Promise<VideoMetadata> {
  try {
    const mb = await getMediabunny();

    // Validate video can be decoded
    const canDecode = await mb.canDecode(file);
    if (!canDecode) {
      throw new Error('Video format not supported by browser');
    }

    // Get video metadata
    const metadata = await mb.getMetadata(file);

    return {
      duration: metadata.duration || 0,
      width: metadata.width || 1920,
      height: metadata.height || 1080,
      fps: metadata.fps || 30,
      codec: metadata.codec || 'unknown',
      bitrate: metadata.bitrate || 0,
    };
  } catch (error) {
    console.warn('Failed to extract video metadata with mediabunny:', error);

    // Fallback to basic HTML5 video element
    return extractVideoMetadataFallback(file);
  }
}

/**
 * Fallback video metadata extraction using HTML5 video element
 */
async function extractVideoMetadataFallback(
  file: File
): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Video metadata extraction timeout'));
    }, 10000);

    video.addEventListener('loadedmetadata', () => {
      clearTimeout(timeout);

      const metadata: VideoMetadata = {
        duration: video.duration || 0,
        width: video.videoWidth || 1920,
        height: video.videoHeight || 1080,
        fps: 30, // Default, cannot detect from video element
        codec: 'unknown',
        bitrate: 0,
      };

      URL.revokeObjectURL(url);
      resolve(metadata);
    });

    video.addEventListener('error', () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for metadata extraction'));
    });

    video.src = url;
  });
}

/**
 * Extract metadata from audio file
 */
export async function extractAudioMetadata(
  file: File
): Promise<AudioMetadata> {
  try {
    const mb = await getMediabunny();

    // Get audio metadata
    const metadata = await mb.getMetadata(file);

    return {
      duration: metadata.duration || 0,
      channels: metadata.channels,
      sampleRate: metadata.sampleRate,
      bitrate: metadata.bitrate,
    };
  } catch (error) {
    console.warn('Failed to extract audio metadata with mediabunny:', error);

    // Fallback to basic HTML5 audio element
    return extractAudioMetadataFallback(file);
  }
}

/**
 * Fallback audio metadata extraction using HTML5 audio element
 */
async function extractAudioMetadataFallback(
  file: File
): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Audio metadata extraction timeout'));
    }, 10000);

    audio.addEventListener('loadedmetadata', () => {
      clearTimeout(timeout);

      const metadata: AudioMetadata = {
        duration: audio.duration || 0,
      };

      URL.revokeObjectURL(url);
      resolve(metadata);
    });

    audio.addEventListener('error', () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load audio for metadata extraction'));
    });

    audio.src = url;
  });
}

/**
 * Extract metadata from image file
 */
export async function extractImageMetadata(
  file: File
): Promise<ImageMetadata> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Image metadata extraction timeout'));
    }, 5000);

    img.onload = () => {
      clearTimeout(timeout);

      const metadata: ImageMetadata = {
        width: img.naturalWidth || 1920,
        height: img.naturalHeight || 1080,
      };

      URL.revokeObjectURL(url);
      resolve(metadata);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for metadata extraction'));
    };

    img.src = url;
  });
}

/**
 * Extract metadata based on file type
 */
export async function extractMetadata(
  file: File
): Promise<Partial<VideoMetadata | AudioMetadata | ImageMetadata>> {
  const mimeType = file.type;

  try {
    if (mimeType.startsWith('video/')) {
      return await extractVideoMetadata(file);
    } else if (mimeType.startsWith('audio/')) {
      return await extractAudioMetadata(file);
    } else if (mimeType.startsWith('image/')) {
      return await extractImageMetadata(file);
    } else {
      // Unknown type, return defaults
      return {
        duration: 0,
        width: 0,
        height: 0,
      };
    }
  } catch (error) {
    console.error('Metadata extraction failed:', error);

    // Return safe defaults
    return {
      duration: 0,
      width: 0,
      height: 0,
      fps: 30,
      codec: 'unknown',
      bitrate: 0,
    };
  }
}
