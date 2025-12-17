import { memo, useEffect, useState, useMemo, useDeferredValue, useCallback } from 'react';
import { FilmstripSkeleton } from './filmstrip-skeleton';
import { useFilmstrip, type FilmstripFrame } from '../../hooks/use-filmstrip';
import { mediaLibraryService } from '@/features/media-library/services/media-library-service';
import { THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from '../../services/filmstrip-cache';

export interface ClipFilmstripProps {
  /** Media ID from the timeline item */
  mediaId: string;
  /** Width of the clip in pixels */
  clipWidth: number;
  /** Source start time in seconds (for trimmed clips) */
  sourceStart: number;
  /** Total source duration in seconds */
  sourceDuration: number;
  /** Trim start in seconds (how much trimmed from beginning) */
  trimStart: number;
  /** Playback speed multiplier */
  speed: number;
  /** Frames per second */
  fps: number;
  /** Whether the clip is visible (from IntersectionObserver) */
  isVisible: boolean;
  /** Pixels per second from parent (avoids redundant zoom subscription) */
  pixelsPerSecond: number;
  /** Optional height override */
  height?: number;
  /** Optional className for positioning */
  className?: string;
}

/**
 * Find closest frame using binary search
 */
function findClosestFrame(frames: FilmstripFrame[], targetTime: number): FilmstripFrame | null {
  if (frames.length === 0) return null;

  let left = 0;
  let right = frames.length - 1;
  let bestFrame = frames[0]!;
  let bestDiff = Math.abs(bestFrame.timestamp - targetTime);

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const frame = frames[mid]!;
    const diff = Math.abs(frame.timestamp - targetTime);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestFrame = frame;
    }

    if (frame.timestamp < targetTime) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return bestFrame;
}

/**
 * Simple filmstrip tile - memoized to prevent unnecessary re-renders
 * Hides itself on error to avoid broken image icons
 */
const FilmstripTile = memo(function FilmstripTile({
  src,
  x,
}: {
  src: string;
  x: number;
}) {
  const [errorSrc, setErrorSrc] = useState<string | null>(null);

  const handleError = useCallback(() => {
    setErrorSrc(src);
  }, [src]);

  // Hide if this specific src failed, but allow new src to try again
  if (errorSrc === src) {
    return null;
  }

  return (
    <img
      src={src}
      alt=""
      decoding="async"
      className="absolute top-0"
      onError={handleError}
      style={{
        left: x,
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        objectFit: 'cover',
      }}
    />
  );
});

/**
 * Clip Filmstrip Component
 *
 * Renders video frame thumbnails as a tiled filmstrip.
 * Uses useDeferredValue to keep zoom interactions responsive.
 */
export const ClipFilmstrip = memo(function ClipFilmstrip({
  mediaId,
  clipWidth,
  sourceStart,
  sourceDuration,
  trimStart,
  speed,
  fps: _fps,
  isVisible,
  pixelsPerSecond,
  height = THUMBNAIL_HEIGHT,
  className = 'top-1',
}: ClipFilmstripProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Defer zoom values to keep zoom slider responsive
  const deferredPixelsPerSecond = useDeferredValue(pixelsPerSecond);
  const deferredClipWidth = useDeferredValue(clipWidth);

  // Load blob URL for the media
  useEffect(() => {
    let mounted = true;

    // Reset blob URL when mediaId changes to force fresh load
    setBlobUrl(null);

    const loadBlobUrl = async () => {
      try {
        const url = await mediaLibraryService.getMediaBlobUrl(mediaId);
        if (mounted && url) {
          setBlobUrl(url);
        }
      } catch (error) {
        console.error('Failed to load media blob URL:', error);
      }
    };

    if (isVisible && mediaId) {
      loadBlobUrl();
    }

    return () => {
      mounted = false;
    };
  }, [mediaId, isVisible]);

  // Use filmstrip hook
  const { frames, isComplete, error } = useFilmstrip({
    mediaId,
    blobUrl,
    duration: sourceDuration,
    isVisible,
    enabled: isVisible && !!blobUrl && sourceDuration > 0,
  });

  // Calculate tiles - maps each tile position to the best frame
  // Browser's native loading="lazy" handles performance optimization
  const tiles = useMemo(() => {
    if (!frames || frames.length === 0) return [];

    const effectiveStart = sourceStart + trimStart;
    const tileCount = Math.ceil(deferredClipWidth / THUMBNAIL_WIDTH);
    const result: { tileIndex: number; frame: FilmstripFrame; x: number }[] = [];

    for (let tile = 0; tile < tileCount; tile++) {
      const tileX = tile * THUMBNAIL_WIDTH;
      const tileTime = effectiveStart + (tileX / deferredPixelsPerSecond) * speed;
      const frame = findClosestFrame(frames, tileTime);

      if (frame) {
        result.push({ tileIndex: tile, frame, x: tileX });
      }
    }

    return result;
  }, [frames, deferredClipWidth, deferredPixelsPerSecond, sourceStart, trimStart, speed]);

  if (error) {
    return null;
  }

  // Show skeleton only if no frames yet
  if (!frames || frames.length === 0) {
    return <FilmstripSkeleton clipWidth={clipWidth} height={height} className={className} />;
  }

  return (
    <>
      {/* Show shimmer skeleton behind while loading */}
      {!isComplete && (
        <FilmstripSkeleton clipWidth={clipWidth} height={height} className={className} />
      )}
      <div
        className={`absolute left-0 ${className} overflow-hidden pointer-events-none`}
        style={{
          width: deferredClipWidth,
          height,
          contentVisibility: 'auto',
          containIntrinsicSize: `${deferredClipWidth}px ${height}px`,
        }}
      >
        {tiles.map(({ tileIndex, frame, x }) => (
          <FilmstripTile key={tileIndex} src={frame.url} x={x} />
        ))}
      </div>
    </>
  );
});

export { THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT };
