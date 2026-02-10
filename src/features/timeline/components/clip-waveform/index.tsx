import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { TiledCanvas } from '../clip-filmstrip/tiled-canvas';
import { WaveformSkeleton } from './waveform-skeleton';
import { useWaveform } from '../../hooks/use-waveform';
import { mediaLibraryService } from '@/features/media-library/services/media-library-service';
import { WAVEFORM_FILL_COLOR, WAVEFORM_STROKE_COLOR } from '../../constants';

// Waveform dimensions
const BAR_WIDTH = 2;
const BAR_GAP = 1;

interface ClipWaveformProps {
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
}

/**
 * Clip Waveform Component
 *
 * Renders audio waveform as a mirrored bar visualization for timeline clips.
 * Uses tiled canvas for large clips and shows skeleton while loading.
 */
export const ClipWaveform = memo(function ClipWaveform({
  mediaId,
  clipWidth,
  sourceStart,
  sourceDuration,
  trimStart,
  speed,
  fps,
  isVisible,
  pixelsPerSecond,
}: ClipWaveformProps) {
  void fps;
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const hasStartedLoadingRef = useRef(false);
  const lastMediaIdRef = useRef<string | null>(null);

  // Measure container height
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const parent = container.parentElement;
      if (parent) {
        setHeight(parent.clientHeight);
      }
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    if (container.parentElement) {
      resizeObserver.observe(container.parentElement);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Reset loading state when mediaId changes (e.g., after relinking)
  useEffect(() => {
    if (lastMediaIdRef.current !== null && lastMediaIdRef.current !== mediaId) {
      // Media ID changed - reset to allow fresh loading
      hasStartedLoadingRef.current = false;
      setBlobUrl(null);
    }
    lastMediaIdRef.current = mediaId;
  }, [mediaId]);

  // Track if audio codec is supported for waveform generation
  const [audioCodecSupported, setAudioCodecSupported] = useState(true);

  // Load blob URL for the media - only once when first visible
  useEffect(() => {
    // Skip if already started loading (prevents re-triggering on visibility changes)
    if (hasStartedLoadingRef.current) {
      return;
    }

    // Only start loading when visible
    if (!isVisible || !mediaId) {
      return;
    }

    hasStartedLoadingRef.current = true;
    let mounted = true;

    const loadBlobUrl = async () => {
      try {
        // First check if audio codec is supported
        const media = await mediaLibraryService.getMedia(mediaId);
        if (!mounted) return;

        // Check audioCodecSupported - default to true if not set (for existing media)
        const codecSupported = media?.audioCodecSupported !== false;
        setAudioCodecSupported(codecSupported);

        if (!codecSupported) {
          // Skip waveform generation for unsupported codecs
          return;
        }

        const url = await mediaLibraryService.getMediaBlobUrl(mediaId);
        if (mounted && url) {
          setBlobUrl(url);
        }
      } catch (error) {
        console.error('Failed to load media blob URL:', error);
      }
    };

    loadBlobUrl();

    return () => {
      mounted = false;
    };
  }, [mediaId, isVisible]);

  // Use waveform hook - enabled once we have blobUrl (independent of visibility after that)
  const { peaks, duration, sampleRate, isLoading } = useWaveform({
    mediaId,
    blobUrl,
    isVisible: true, // Always consider visible once we start - prevents re-triggers
    enabled: !!blobUrl,
  });

  // Render function for tiled canvas
  const renderTile = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      _tileIndex: number,
      tileOffset: number,
      tileWidth: number
    ) => {
      if (!peaks || peaks.length === 0 || duration === 0) {
        return;
      }

      ctx.fillStyle = WAVEFORM_FILL_COLOR;
      ctx.strokeStyle = WAVEFORM_STROKE_COLOR;
      ctx.lineWidth = 0.5;

      // Calculate the time range visible in this tile
      const effectiveStart = sourceStart + trimStart;

      // Calculate bar positions
      const barSpacing = BAR_WIDTH + BAR_GAP;
      const centerY = height / 2;
      const maxBarHeight = height / 2; // Fill container height

      // Iterate through bars that should be in this tile
      for (let x = 0; x < tileWidth; x += barSpacing) {
        // Calculate timeline position for this bar
        const timelinePosition = (tileOffset + x) / pixelsPerSecond;

        // Convert to source time
        // sourceTime = effectiveStart + (timelinePosition * speed)
        const sourceTime = effectiveStart + (timelinePosition * speed);

        // Skip if outside source duration
        if (sourceTime < 0 || sourceTime > sourceDuration) {
          continue;
        }

        // Find the corresponding peak value
        // peaks index = sourceTime * sampleRate
        const peakIndex = Math.floor(sourceTime * sampleRate);
        if (peakIndex < 0 || peakIndex >= peaks.length) {
          continue;
        }

        const peakValue = peaks[peakIndex] ?? 0;

        // Calculate bar height (mirrored from center)
        const barHeight = Math.max(2, peakValue * maxBarHeight);

        // Draw mirrored bar (extends both up and down from center)
        const barX = Math.round(x);
        const barY = Math.round(centerY - barHeight);
        const fullBarHeight = Math.round(barHeight * 2);

        // Fill
        ctx.fillRect(barX, barY, BAR_WIDTH, fullBarHeight);

        // Optional: stroke for sharper edges
        // ctx.strokeRect(barX, barY, BAR_WIDTH, fullBarHeight);
      }
    },
    [peaks, duration, sampleRate, pixelsPerSecond, sourceStart, trimStart, speed, sourceDuration, height]
  );

  // Show empty state for unsupported codecs (no skeleton, just flat line)
  if (!audioCodecSupported) {
    return (
      <div ref={containerRef} className="absolute inset-0 flex items-center">
        {/* Flat line to indicate no waveform available */}
        <div
          className="w-full h-[1px] bg-foreground/20"
          style={{ marginTop: 0 }}
        />
      </div>
    );
  }

  // Show skeleton while loading or height not yet measured
  if (!peaks || peaks.length === 0 || height === 0) {
    return (
      <div ref={containerRef} className="absolute inset-0">
        <WaveformSkeleton clipWidth={clipWidth} height={height || 24} />
      </div>
    );
  }

  // Include quantized pixelsPerSecond in version to force re-render on zoom changes
  // Quantize to steps of 5 to reduce canvas redraws on small zoom changes
  const quantizedPPS = Math.round(pixelsPerSecond / 5) * 5;
  const renderVersion = peaks.length * 10000 + quantizedPPS + height;

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* Show shimmer skeleton behind canvas while loading progressively */}
      {isLoading && (
        <WaveformSkeleton clipWidth={clipWidth} height={height} />
      )}
      <TiledCanvas
        width={clipWidth}
        height={height}
        renderTile={renderTile}
        version={renderVersion}
      />
    </div>
  );
});
