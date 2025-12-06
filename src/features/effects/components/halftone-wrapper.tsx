/**
 * @deprecated UNUSED - Kept for reference only.
 * Halftone effects now use pure CSS approach via getHalftoneStyles() in item.tsx,
 * adjustment-wrapper.tsx, and item-effect-wrapper.tsx.
 * The CSS approach avoids WebGL flickering issues during play/pause transitions.
 */

import React, { useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { useCurrentFrame, useVideoConfig, useRemotionEnvironment, OffthreadVideo, Img, interpolate } from 'remotion';
import { HalftoneRenderer, type HalftoneGLOptions } from '../utils/halftone-shader';
import { renderHalftone } from '../utils/halftone-algorithm';
import { effectsWorkerManager } from '../utils/effects-worker-manager';

// Type augmentation for requestVideoFrameCallback (not in all TS versions)
declare global {
  interface HTMLVideoElement {
    requestVideoFrameCallback(callback: (now: DOMHighResTimeStamp, metadata: object) => void): number;
    cancelVideoFrameCallback(handle: number): void;
  }
}

// Default options for when halftone is disabled (these won't be used but prevent null checks)
const DEFAULT_HALFTONE_OPTIONS: HalftoneGLOptions = {
  dotSize: 8,
  spacing: 10,
  angle: 45,
  intensity: 1,
  backgroundColor: '#ffffff',
  dotColor: '#000000',
};

interface HalftoneWrapperProps {
  children: React.ReactNode;
  options: HalftoneGLOptions | null;
  enabled: boolean;
  mediaSrc?: string;
  itemType: string;
  /** Frames to trim from start of video (for in/out point export) */
  trimBefore?: number;
  /** Playback rate for speed adjustments */
  playbackRate?: number;
  /** Whether audio should be muted (passed through to video during render) */
  muted?: boolean;
  /** Volume in dB for audio (0 = unity gain) */
  volume?: number;
  /** Audio fade in duration in seconds */
  audioFadeIn?: number;
  /** Audio fade out duration in seconds */
  audioFadeOut?: number;
  /** Duration of the item in frames (needed for fade calculations) */
  durationInFrames?: number;
}

// Check if OffscreenCanvas is supported (for worker-based rendering)
const supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

/**
 * HalftoneWrapper applies a halftone dot pattern effect to video/image content.
 *
 * Uses ImageBitmap passthrough pattern for off-main-thread rendering:
 * - Worker creates its own internal OffscreenCanvas (no transfer needed)
 * - Main thread sends video frames as ImageBitmap
 * - Worker renders with WebGL, returns processed ImageBitmap
 * - Main thread draws result to regular canvas with 2D context
 *
 * This avoids React lifecycle issues with canvas transfer.
 */
export const HalftoneWrapper: React.FC<HalftoneWrapperProps> = ({
  children,
  options,
  enabled,
  mediaSrc,
  itemType,
  trimBefore,
  playbackRate = 1,
  muted = false,
  volume = 0,
  audioFadeIn = 0,
  audioFadeOut = 0,
  durationInFrames = 0,
}) => {
  // Resolve options with fallback to defaults (options may be null when disabled)
  const resolvedOptions = options ?? DEFAULT_HALFTONE_OPTIONS;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2dCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const rendererRef = useRef<HalftoneRenderer | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  // Worker-related refs (using singleton manager now)
  const videoFrameCallbackId = useRef<number | null>(null);
  const lastOptionsRef = useRef(resolvedOptions); // Track options without causing re-renders

  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const env = useRemotionEnvironment();

  // Determine if we're in preview mode (Player/Studio) or rendering
  const isPreview = env.isPlayer || env.isStudio;

  // Use worker for video in preview mode if supported
  const useWorker = isPreview && itemType === 'video' && supportsOffscreenCanvas;

  // Calculate audio volume with fades
  const audioVolume = React.useMemo(() => {
    if (muted) return 0;

    const fadeInFrames = Math.min(audioFadeIn * fps, durationInFrames);
    const fadeOutFrames = Math.min(audioFadeOut * fps, durationInFrames);

    let fadeMultiplier = 1;
    const hasFadeIn = fadeInFrames > 0;
    const hasFadeOut = fadeOutFrames > 0;

    if (hasFadeIn || hasFadeOut) {
      const fadeOutStart = durationInFrames - fadeOutFrames;

      if (hasFadeIn && hasFadeOut) {
        if (fadeInFrames >= fadeOutStart) {
          const midPoint = durationInFrames / 2;
          const peakVolume = Math.min(1, midPoint / Math.max(fadeInFrames, 1));
          fadeMultiplier = interpolate(
            frame,
            [0, midPoint, durationInFrames],
            [0, peakVolume, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        } else {
          fadeMultiplier = interpolate(
            frame,
            [0, fadeInFrames, fadeOutStart, durationInFrames],
            [0, 1, 1, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
        }
      } else if (hasFadeIn) {
        fadeMultiplier = interpolate(
          frame,
          [0, fadeInFrames],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      } else {
        fadeMultiplier = interpolate(
          frame,
          [fadeOutStart, durationInFrames],
          [1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      }
    }

    const linearVolume = Math.pow(10, volume / 20);
    return Math.max(0, Math.min(1, linearVolume * fadeMultiplier));
  }, [muted, volume, audioFadeIn, audioFadeOut, durationInFrames, frame, fps]);

  // State for media loading
  const [rendererReady, setRendererReady] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  // Initialize workerReady from singleton - prevents flash on remount when worker already initialized
  const [workerReady, setWorkerReady] = useState(() => effectsWorkerManager.halftone.getIsReady());

  // Initialize 2D context for receiving worker bitmaps
  useLayoutEffect(() => {
    if (!enabled || !useWorker || !canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    canvas2dCtxRef.current = canvas.getContext('2d');

    return () => {
      canvas2dCtxRef.current = null;
    };
  }, [enabled, useWorker, width, height]);

  // Initialize singleton worker (lazy, persists across clip transitions)
  useEffect(() => {
    if (!enabled || !useWorker) return;

    // Initialize singleton worker - it persists even when this component unmounts
    effectsWorkerManager.halftone.init(width, height).then((ready) => {
      if (ready) {
        setWorkerReady(true);
      }
    });

    // NO CLEANUP - worker persists for the session!
    // This is the key to eliminating stutter at clip boundaries
  }, [enabled, useWorker, width, height]);

  // Initialize WebGL renderer for fallback/images (preview mode only)
  useLayoutEffect(() => {
    // Skip if using worker for video
    if (useWorker) return;
    if (!enabled || !canvasRef.current || !isPreview) return;

    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;

    const renderer = new HalftoneRenderer(canvas);
    rendererRef.current = renderer;

    if (renderer.isReady()) {
      setRendererReady(true);
    } else {
      console.error('[HalftoneWrapper] Failed to initialize WebGL renderer');
    }

    return () => {
      renderer.dispose();
      rendererRef.current = null;
      setRendererReady(false);
    };
  }, [enabled, width, height, isPreview, useWorker]);

  // Initialize source canvas for render mode
  useLayoutEffect(() => {
    if (!enabled || isPreview) return;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    sourceCanvasRef.current = canvas;

    return () => {
      sourceCanvasRef.current = null;
    };
  }, [enabled, width, height, isPreview]);

  // Load image for processing (images only) - preview mode only
  useEffect(() => {
    if (!enabled || !mediaSrc || itemType !== 'image' || !isPreview) {
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      imageRef.current = img;
      setImageReady(true);
    };

    img.onerror = (e) => {
      console.error('[HalftoneWrapper] Failed to load image:', mediaSrc, e);
      setImageReady(false);
    };

    img.src = mediaSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [mediaSrc, itemType, enabled, isPreview]);

  // Handle image load callback for render mode
  const handleImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    imageRef.current = img;
    setImageReady(true);
  }, []);

  // Handle video frame callback from OffthreadVideo (render mode)
  const handleVideoFrame = useCallback((frameSource: CanvasImageSource) => {
    const outputCanvas = canvasRef.current;
    if (!outputCanvas) return;

    // Render mode: use Canvas 2D for reliable rendering
    const sourceCanvas = sourceCanvasRef.current;
    if (!sourceCanvas) return;

    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(frameSource, 0, 0, width, height);
    renderHalftone(sourceCanvas, outputCanvas, resolvedOptions);
  }, [resolvedOptions, width, height]);

  // Keep options ref updated and re-capture frame when options change (for live preview)
  useEffect(() => {
    lastOptionsRef.current = resolvedOptions;

    // Re-capture current frame when options change (for live preview in properties panel)
    // Only do this for worker-based video rendering
    if (!enabled || !useWorker || !workerReady) return;

    const video = videoElementRef.current;
    const halftoneWorker = effectsWorkerManager.halftone;
    const ctx = canvas2dCtxRef.current;

    if (!video || !halftoneWorker.getIsReady() || video.readyState < 2) return;

    // Don't capture if already processing (prevents frame pileup)
    if (halftoneWorker.isProcessing()) return;

    createImageBitmap(video)
      .then((bitmap) => {
        halftoneWorker.processFrame(bitmap, {
          dotSize: resolvedOptions.dotSize,
          spacing: resolvedOptions.spacing,
          angle: resolvedOptions.angle,
          intensity: resolvedOptions.intensity,
          backgroundColor: resolvedOptions.backgroundColor,
          dotColor: resolvedOptions.dotColor,
        }, (resultBitmap) => {
          if (ctx) {
            ctx.drawImage(resultBitmap, 0, 0);
          }
          resultBitmap.close();
        });
      })
      .catch(() => {});
  }, [resolvedOptions, enabled, useWorker, workerReady]);

  // Send video frames to singleton worker using requestVideoFrameCallback
  // This decouples frame capture from React's render cycle completely
  useEffect(() => {
    if (!enabled || !useWorker || !workerReady) return;
    if (!contentRef.current) return;

    const halftoneWorker = effectsWorkerManager.halftone;
    const ctx = canvas2dCtxRef.current;

    // Get video element
    let videoElement = videoElementRef.current;
    if (!videoElement || !videoElement.isConnected || !contentRef.current.contains(videoElement)) {
      videoElement = contentRef.current.querySelector('video');
      videoElementRef.current = videoElement;
    }

    if (!videoElement) return;

    // Frame processing callback
    const processVideoFrame = (bitmap: ImageBitmap) => {
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
      }
      bitmap.close();
    };

    // Helper to capture current frame immediately (for initial load and seeks)
    const captureCurrentFrame = () => {
      const video = videoElementRef.current;
      if (!video || !halftoneWorker.getIsReady()) return;
      if (video.readyState < 2 || halftoneWorker.isProcessing()) return;

      createImageBitmap(video)
        .then((bitmap) => {
          const opts = lastOptionsRef.current;
          halftoneWorker.processFrame(bitmap, {
            dotSize: opts.dotSize,
            spacing: opts.spacing,
            angle: opts.angle,
            intensity: opts.intensity,
            backgroundColor: opts.backgroundColor,
            dotColor: opts.dotColor,
          }, processVideoFrame);
        })
        .catch(() => {});
    };

    // Capture initial frame immediately if video is ready
    // This ensures the effect shows right away when clicking into a halftone clip
    captureCurrentFrame();

    // Listen for seek events to capture frame when seeking while paused
    // requestVideoFrameCallback only fires during playback, so we need this for seeks
    const handleSeeked = () => {
      captureCurrentFrame();
    };
    videoElement.addEventListener('seeked', handleSeeked);

    // Listen for pause events to capture the exact paused frame
    // This prevents showing a stale frame when playback stops
    const handlePause = () => {
      captureCurrentFrame();
    };
    videoElement.addEventListener('pause', handlePause);

    // Check if requestVideoFrameCallback is supported
    if (!('requestVideoFrameCallback' in videoElement)) {
      // Fallback: use requestAnimationFrame
      let rafId: number;
      const rafLoop = () => {
        if (!halftoneWorker.getIsReady() || !videoElementRef.current) return;
        if (videoElementRef.current.readyState < 2 || halftoneWorker.isProcessing()) {
          rafId = requestAnimationFrame(rafLoop);
          return;
        }

        createImageBitmap(videoElementRef.current)
          .then((bitmap) => {
            const opts = lastOptionsRef.current;
            halftoneWorker.processFrame(bitmap, {
              dotSize: opts.dotSize,
              spacing: opts.spacing,
              angle: opts.angle,
              intensity: opts.intensity,
              backgroundColor: opts.backgroundColor,
              dotColor: opts.dotColor,
            }, processVideoFrame);
          })
          .catch(() => {});

        rafId = requestAnimationFrame(rafLoop);
      };

      rafId = requestAnimationFrame(rafLoop);
      return () => {
        cancelAnimationFrame(rafId);
        videoElementRef.current?.removeEventListener('seeked', handleSeeked);
        videoElementRef.current?.removeEventListener('pause', handlePause);
      };
    }

    // Use requestVideoFrameCallback for optimal frame timing during playback
    const captureFrame = () => {
      const video = videoElementRef.current;
      if (!video || !halftoneWorker.getIsReady()) return;
      if (video.readyState < 2 || halftoneWorker.isProcessing()) {
        videoFrameCallbackId.current = video.requestVideoFrameCallback(captureFrame);
        return;
      }

      createImageBitmap(video)
        .then((bitmap) => {
          const opts = lastOptionsRef.current;
          halftoneWorker.processFrame(bitmap, {
            dotSize: opts.dotSize,
            spacing: opts.spacing,
            angle: opts.angle,
            intensity: opts.intensity,
            backgroundColor: opts.backgroundColor,
            dotColor: opts.dotColor,
          }, processVideoFrame);
        })
        .catch(() => {});

      videoFrameCallbackId.current = video.requestVideoFrameCallback(captureFrame);
    };

    videoFrameCallbackId.current = videoElement.requestVideoFrameCallback(captureFrame);

    return () => {
      videoElement?.removeEventListener('seeked', handleSeeked);
      videoElement?.removeEventListener('pause', handlePause);
      if (videoFrameCallbackId.current !== null && videoElementRef.current) {
        try {
          videoElementRef.current.cancelVideoFrameCallback(videoFrameCallbackId.current);
        } catch {
          // Video element may be gone
        }
        videoFrameCallbackId.current = null;
      }
    };
  }, [enabled, useWorker, workerReady]);

  // Render halftone for images and fallback video (main thread)
  useLayoutEffect(() => {
    if (!enabled) return;
    // Skip if using worker for video
    if (useWorker && workerReady) return;

    const outputCanvas = canvasRef.current;
    if (!outputCanvas) return;

    // Handle images
    if (itemType === 'image' && imageRef.current && imageReady) {
      if (isPreview && rendererRef.current && rendererReady) {
        rendererRef.current.render(imageRef.current, resolvedOptions);
      } else if (!isPreview) {
        const sourceCanvas = sourceCanvasRef.current;
        if (!sourceCanvas) return;

        const ctx = sourceCanvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(imageRef.current, 0, 0, width, height);
        renderHalftone(sourceCanvas, outputCanvas, resolvedOptions);
      }
    }

    // Handle video fallback (when worker not available)
    if (itemType === 'video' && isPreview && !useWorker && contentRef.current && rendererRef.current && rendererReady) {
      let videoElement = videoElementRef.current;
      if (!videoElement || !videoElement.isConnected || !contentRef.current.contains(videoElement)) {
        videoElement = contentRef.current.querySelector('video');
        videoElementRef.current = videoElement;
      }

      if (videoElement && videoElement.readyState >= 2) {
        rendererRef.current.render(videoElement, resolvedOptions);
      }
    }
  }, [frame, enabled, resolvedOptions, itemType, imageReady, rendererReady, isPreview, width, height, useWorker, workerReady]);

  // If no media source, fall back to children
  if (!mediaSrc) {
    return <>{children}</>;
  }

  // For video - ALWAYS render same structure to avoid DOM changes at boundaries
  if (itemType === 'video') {
    // Determine what should be visible
    // Show canvas as soon as worker is ready (canvas may briefly be empty, but that's better than a flash)
    // Hide children as soon as worker is ready to prevent showing both
    const showCanvas = enabled && (useWorker ? workerReady : rendererReady);
    const showChildren = !enabled || (useWorker && !workerReady);

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Original children - always rendered, visibility controlled by CSS */}
        {isPreview && (
          <div
            ref={contentRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: showChildren ? 1 : 0,
              pointerEvents: 'none',
            }}
          >
            {children}
          </div>
        )}

        {/* OffthreadVideo for frame extraction and audio during render */}
        {!isPreview && mediaSrc && (
          <OffthreadVideo
            src={mediaSrc}
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
            }}
            volume={audioVolume}
            trimBefore={trimBefore && trimBefore > 0 ? trimBefore : undefined}
            playbackRate={playbackRate}
            onVideoFrame={handleVideoFrame}
            onError={(err) => {
              console.warn('[HalftoneWrapper] Frame extraction warning:', err.message);
            }}
          />
        )}

        {/* Output canvas - dimensions set via useLayoutEffect to avoid clearing on re-render */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: showCanvas ? 1 : 0,
          }}
        />
      </div>
    );
  }

  // For images
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isPreview && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          {children}
        </div>
      )}

      {!isPreview && mediaSrc && (
        <Img
          src={mediaSrc}
          onLoad={handleImageLoad}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      )}

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

export default HalftoneWrapper;
