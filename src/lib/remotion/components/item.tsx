import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AbsoluteFill, interpolate, useSequenceContext } from '@/features/player/composition';
import { Rect, Circle, Triangle, Ellipse, Star, Polygon, Heart } from '@/lib/shapes';
import { useGizmoStore } from '@/features/preview/stores/gizmo-store';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';
import { useDebugStore } from '@/features/editor/stores/debug-store';
import { useVideoConfig, useIsPlaying } from '../hooks/use-remotion-compat';
import type { TimelineItem, VideoItem, TextItem, ShapeItem } from '@/types/timeline';
import type { TransformProperties } from '@/types/transform';
import { DebugOverlay } from './debug-overlay';
import { PitchCorrectedAudio } from './pitch-corrected-audio';
import { GifPlayer } from './gif-player';
import { loadFont, FONT_WEIGHT_MAP } from '../utils/fonts';
import { ItemVisualWrapper } from './item-visual-wrapper';
import {
  timelineToSourceFrames,
  isValidSeekPosition,
  isWithinSourceBounds,
  getSafeTrimBefore,
  DEFAULT_SPEED,
} from '@/features/timeline/utils/source-calculations';
import { useVideoSourcePool } from '@/features/player/video/VideoSourcePoolContext';

/** Mask information passed from composition to items */
export interface MaskInfo {
  shape: ShapeItem;
  transform: TransformProperties;
}

// Track video elements that have been connected to Web Audio API
// A video element can only be connected to ONE MediaElementSourceNode ever
const connectedVideoElements = new WeakSet<HTMLVideoElement>();
// Store gain nodes by video element for volume updates
const videoGainNodes = new WeakMap<HTMLVideoElement, GainNode>();
const videoAudioContexts = new WeakMap<HTMLVideoElement, AudioContext>();

/**
 * Hook to calculate video audio volume with fades and preview support.
 * Returns the final volume (0-1) to apply to the video component.
 * Applies master preview volume from playback controls.
 */
function useVideoAudioVolume(item: VideoItem & { _sequenceFrameOffset?: number }, muted: boolean): number {
  const { fps } = useVideoConfig();
  // Get local frame from Sequence context (0-based within this Sequence)
  const sequenceContext = useSequenceContext();
  const sequenceFrame = sequenceContext?.localFrame ?? 0;

  // Adjust frame for shared Sequences (split clips)
  // In a shared Sequence, localFrame is relative to the shared Sequence start,
  // not relative to this specific item. _sequenceFrameOffset corrects this.
  const frame = sequenceFrame - (item._sequenceFrameOffset ?? 0);

  // Read preview values from unified preview system
  const itemPreview = useGizmoStore(
    useCallback((s) => s.preview?.[item.id], [item.id])
  );
  const preview = itemPreview?.properties;

  // Read master preview volume from playback store (only used during preview, not render)
  const previewMasterVolume = usePlaybackStore((s) => s.volume);
  const previewMasterMuted = usePlaybackStore((s) => s.muted);

  // Use preview values if available, otherwise use item's stored values
  // Volume is stored in dB (0 = unity gain)
  const volumeDb = preview?.volume ?? item.volume ?? 0;
  const audioFadeIn = preview?.audioFadeIn ?? item.audioFadeIn ?? 0;
  const audioFadeOut = preview?.audioFadeOut ?? item.audioFadeOut ?? 0;

  if (muted) return 0;

  // Calculate fade multiplier
  const fadeInFrames = Math.min(audioFadeIn * fps, item.durationInFrames);
  const fadeOutFrames = Math.min(audioFadeOut * fps, item.durationInFrames);

  let fadeMultiplier = 1;
  const hasFadeIn = fadeInFrames > 0;
  const hasFadeOut = fadeOutFrames > 0;

  if (hasFadeIn || hasFadeOut) {
    const fadeOutStart = item.durationInFrames - fadeOutFrames;

    if (hasFadeIn && hasFadeOut) {
      if (fadeInFrames >= fadeOutStart) {
        // Overlapping fades
        const midPoint = item.durationInFrames / 2;
        const peakVolume = Math.min(1, midPoint / Math.max(fadeInFrames, 1));
        fadeMultiplier = interpolate(
          frame,
          [0, midPoint, item.durationInFrames],
          [0, peakVolume, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
      } else {
        fadeMultiplier = interpolate(
          frame,
          [0, fadeInFrames, fadeOutStart, item.durationInFrames],
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
        [fadeOutStart, item.durationInFrames],
        [1, 0],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );
    }
  }

  // Convert dB to linear (0 dB = unity gain = 1.0)
  // +20dB = 10x, -20dB = 0.1x, -60dB ≈ 0.001x
  const linearVolume = Math.pow(10, volumeDb / 20);
  // Item volume with fades - allow values > 1 for volume boost (Web Audio API handles this)
  const itemVolume = Math.max(0, linearVolume * fadeMultiplier);

  // Apply master preview volume from playback controls
  const effectiveMasterVolume = previewMasterMuted ? 0 : previewMasterVolume;

  return itemVolume * effectiveMasterVolume;
}

/**
 * Check if a URL points to a GIF file
 */
function isGifUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.gif') || lowerUrl.includes('.gif');
}

/**
 * Native HTML5 video component for preview mode using VideoSourcePool.
 * Uses pooled video elements instead of creating new ones per clip.
 * Split clips from the same source share video elements for efficiency.
 */
const NativePreviewVideo: React.FC<{
  itemId: string;
  src: string;
  safeTrimBefore: number;
  playbackRate: number;
  audioVolume: number;
  onError: (error: Error) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ itemId, src, safeTrimBefore, playbackRate, audioVolume, onError, containerRef }) => {
  // Get local frame from Sequence context (not global frame from Clock)
  // The Sequence provides localFrame which is 0-based within this sequence
  const sequenceContext = useSequenceContext();
  const frame = sequenceContext?.localFrame ?? 0;
  const { fps } = useVideoConfig();
  const pool = useVideoSourcePool();
  const elementRef = useRef<HTMLVideoElement | null>(null);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const needsInitialSyncRef = useRef<boolean>(true);
  const lastFrameRef = useRef<number>(-1);
  const [isReady, setIsReady] = useState(false);

  // Get playing state from our clock
  const isPlaying = useIsPlaying();

  // Calculate target time in the source video
  // safeTrimBefore is in SOURCE frames (where playback starts in the source)
  // frame is in TIMELINE frames (current position within the Sequence)
  // For seeking, we need: sourceStart + localFrame * speed
  // The playbackRate affects how many source frames we advance per timeline frame
  const targetTime = (safeTrimBefore / fps) + (frame * playbackRate / fps);

  // DEBUG mode (set to false for production)
  const DEBUG = false;
  const shortId = itemId?.slice(0, 8) ?? 'no-id';

  // Acquire element from pool on mount
  useEffect(() => {
    // Guard: itemId and src are required
    if (!itemId || !src) {
      console.error('[NativePreviewVideo] Missing itemId or src');
      return;
    }

    if (DEBUG) console.log(`[NativePreviewVideo ${shortId}] acquiring element for:`, src);

    // Ensure source is preloaded
    pool.preloadSource(src).catch((error) => {
      console.warn(`[NativePreviewVideo] Failed to preload ${src}:`, error);
    });

    // Acquire element for this clip
    const element = pool.acquireForClip(itemId, src);
    if (!element) {
      console.error(`[NativePreviewVideo] Failed to acquire element for ${itemId}`);
      return;
    }

    if (DEBUG) console.log(`[NativePreviewVideo ${shortId}] acquired:`, element.readyState);

    // CRITICAL: Unmute video element immediately after acquisition
    // Pool creates elements muted, and we need audio to work.
    // This must happen here (not just in volume effect) because when crossing
    // split boundaries, itemId changes causing this effect to re-run, but
    // the volume effect won't re-run if audioVolume hasn't changed.
    element.muted = false;

    // Also resume AudioContext if this element was previously connected
    // (e.g., when crossing split boundary and reusing the same video element)
    if (connectedVideoElements.has(element)) {
      const audioContext = videoAudioContexts.get(element);
      if (audioContext?.state === 'suspended') {
        audioContext.resume();
      }
    }

    // Pause immediately - will be played based on isPlaying state
    element.pause();
    elementRef.current = element;

    // Set up event listeners
    const handleCanPlay = () => {
      if (DEBUG) console.log(`[NativePreviewVideo ${shortId}] canplay:`, element.readyState);
      setIsReady(true);
    };
    const handleSeeked = () => {
      if (DEBUG) console.log(`[NativePreviewVideo ${shortId}] seeked:`, element.currentTime);
      if (element.readyState >= 3) {
        setIsReady(true);
      }
    };
    const handleError = () => {
      const error = new Error(`Video error: ${element.error?.message || 'Unknown'}`);
      onError(error);
    };
    // Prevent black frames when video reaches its natural end
    // Seek back slightly to show the last frame
    const handleEnded = () => {
      if (DEBUG) console.log(`[NativePreviewVideo ${shortId}] ended, seeking to last frame`);
      if (element.duration && element.duration > 0.1) {
        element.currentTime = element.duration - 0.05;
      }
    };

    element.addEventListener('canplay', handleCanPlay);
    element.addEventListener('seeked', handleSeeked);
    element.addEventListener('error', handleError);
    element.addEventListener('ended', handleEnded);

    // Mount element into container
    const container = containerRef.current;
    if (container && element.parentElement !== container) {
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'contain';
      element.style.display = 'block';
      element.style.position = 'absolute';
      element.style.top = '0';
      element.style.left = '0';
      element.id = `pooled-video-${itemId}`;
      container.appendChild(element);

      if (DEBUG) {
        console.log(`[NativePreviewVideo ${shortId}] mounted to container`);
      }
    }

    // Seek to initial position - need to calculate here since deps don't include targetTime
    // Use playbackRate to correctly calculate source position for speed-adjusted clips
    const initialTargetTime = (safeTrimBefore / fps) + (frame * playbackRate / fps);
    if (DEBUG) {
      console.log(`[NativePreviewVideo ${shortId}] initial seek to:`, initialTargetTime.toFixed(3),
        'safeTrimBefore:', safeTrimBefore, 'frame:', frame, 'playbackRate:', playbackRate,
        'fps:', fps,
        'videoDuration:', element.duration?.toFixed(3),
        'seekPastEnd:', initialTargetTime > element.duration);
    }
    // Clamp to video duration to avoid seeking past end
    const clampedTime = Math.min(initialTargetTime, (element.duration || Infinity) - 0.1);
    element.currentTime = clampedTime;

    // Force a frame render by doing a quick play/pause - some browsers need this
    // to actually display the video frame after seeking
    const forceFrameRender = () => {
      if (element.paused && element.readyState >= 2) {
        element.play().then(() => {
          element.pause();
          if (DEBUG) console.log(`[NativePreviewVideo ${shortId}] forced frame render`);
        }).catch(() => {
          // Ignore - autoplay might be blocked
        });
      }
    };

    // Try after a short delay to allow the seek to complete
    setTimeout(forceFrameRender, 100);

    // Check if already ready
    if (element.readyState >= 3) {
      setIsReady(true);
    }

    return () => {
      element.removeEventListener('canplay', handleCanPlay);
      element.removeEventListener('seeked', handleSeeked);
      element.removeEventListener('error', handleError);
      element.removeEventListener('ended', handleEnded);

      // Pause and remove from DOM
      element.pause();
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }

      // Release back to pool
      pool.releaseClip(itemId);
      elementRef.current = null;
      setIsReady(false);

      if (DEBUG) console.log(`[NativePreviewVideo ${shortId}] released`);
    };
    // Note: frame, fps, targetTime intentionally NOT in deps - we only want to acquire once on mount
    // Ongoing seeking is handled by the separate sync effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, src, pool, onError, containerRef, shortId]);

  // Sync video playback with timeline
  useEffect(() => {
    const video = elementRef.current;
    if (!video) return;

    // Set playback rate
    video.playbackRate = playbackRate;

    // Detect if frame actually changed (for scrub detection)
    const frameChanged = frame !== lastFrameRef.current;
    lastFrameRef.current = frame;

    // Check if we're in premount phase (frame < 0 means clip hasn't started yet)
    // During premount, we should NOT play - just prepare the video at the start position
    const isPremounted = frame < 0;

    // Guard: Only seek if video has enough data loaded
    const canSeek = video.readyState >= 1;

    // During premount, seek to the start of the clip (frame 0 position), not negative time
    // This ensures the video is ready at the correct starting frame when playback reaches this clip
    const effectiveTargetTime = isPremounted
      ? (safeTrimBefore / fps) // Start position of this clip in source video
      : targetTime;

    // Clamp target time to video duration to prevent seeking past the end
    // This prevents black frames when the clip extends to the edge of the source
    const videoDuration = video.duration || Infinity;
    const clampedTargetTime = Math.min(Math.max(0, effectiveTargetTime), videoDuration - 0.05);

    // DEBUG: Log when approaching end of video
    if (DEBUG && targetTime > videoDuration - 1) {
      console.log(`[NativePreviewVideo ${shortId}] NEAR END:`, {
        targetTime: targetTime.toFixed(2),
        videoDuration: videoDuration.toFixed(2),
        clampedTargetTime: clampedTargetTime.toFixed(2),
        frame,
        playbackRate,
        safeTrimBefore,
        fps,
      });
    }

    // During premount, always pause - don't play until clip is actually visible
    if (isPremounted) {
      if (!video.paused) {
        video.pause();
      }
      // Seek to start position so video is ready when playback reaches this clip
      if (canSeek && Math.abs(video.currentTime - clampedTargetTime) > 0.1) {
        video.currentTime = clampedTargetTime;
      }
      return;
    }

    if (isPlaying && isReady) {
      const currentTime = video.currentTime;
      const now = Date.now();

      // Calculate drift direction: positive = video ahead, negative = video behind
      const drift = currentTime - clampedTargetTime;
      const timeSinceLastSync = now - lastSyncTimeRef.current;

      // Determine if we need to seek:
      // 1. Initial sync when component first plays
      // 2. Video is BEHIND by more than threshold (needs to catch up)
      const videoBehind = drift < -0.2;
      const needsSync = needsInitialSyncRef.current || (videoBehind && timeSinceLastSync > 500);

      if (needsSync && canSeek) {
        try {
          video.currentTime = clampedTargetTime;
          lastSyncTimeRef.current = now;
          needsInitialSyncRef.current = false;
        } catch {
          // Seek failed - video may not be ready yet
        }
      }

      // Play if paused and video is ready
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {
          // Autoplay might be blocked - this is fine
        });
      }
    } else {
      // Pause video when not playing
      if (!video.paused) {
        video.pause();
      }
      // Only seek when paused if frame actually changed (user is scrubbing)
      if (frameChanged && canSeek) {
        try {
          video.currentTime = clampedTargetTime;
        } catch {
          // Seek failed - video may not be ready yet
        }
      }
    }
  }, [frame, fps, isPlaying, isReady, playbackRate, safeTrimBefore, targetTime]);

  // Update volume using Web Audio API for values > 1
  useEffect(() => {
    const video = elementRef.current;
    if (!video) return;

    // CRITICAL: Unmute video element - pool creates them muted
    // This must happen regardless of volume path (native or Web Audio)
    video.muted = false;

    // Check if already connected to Web Audio API
    if (connectedVideoElements.has(video)) {
      const gainNode = videoGainNodes.get(video);
      const audioContext = videoAudioContexts.get(video);
      if (gainNode) {
        gainNode.gain.value = audioVolume;
      }
      // CRITICAL: Resume AudioContext if suspended - browser autoplay policy
      // After split, the component remounts but the video element and AudioContext
      // may be reused. The AudioContext can be suspended and needs to be resumed.
      if (audioContext?.state === 'suspended') {
        audioContext.resume();
      }
      return;
    }

    // For volume <= 1, use native volume
    if (audioVolume <= 1) {
      video.volume = Math.max(0, audioVolume);
      return;
    }

    // Set up Web Audio API for volume boost > 1
    try {
      const audioContext = new AudioContext();
      const gainNode = audioContext.createGain();
      gainNode.gain.value = audioVolume;
      const sourceNode = audioContext.createMediaElementSource(video);
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      connectedVideoElements.add(video);
      videoGainNodes.set(video, gainNode);
      videoAudioContexts.set(video, audioContext);

      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
    } catch {
      // Failed to set up Web Audio - use native volume
      video.volume = Math.min(1, Math.max(0, audioVolume));
    }
  }, [audioVolume]);

  // Guard: itemId is required for rendering
  if (!itemId) {
    return <div style={{ width: '100%', height: '100%', backgroundColor: '#1a1a1a' }} />;
  }

  // DEBUG: Give container a unique ID so we can verify in DOM
  const containerId = `video-container-${itemId}`;

  // When premounted, frame will be negative. Hide the video until it's visible.
  // frame < 0 means we're premounted but not yet at the clip's start
  const isVisible = frame >= 0;

  return (
    <div
      ref={containerRef}
      id={containerId}
      data-item-id={itemId}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        // Hide when premounted (frame < 0), show when visible
        visibility: isVisible ? 'visible' : 'hidden',
        // border: '5px solid lime', // DEBUG: make container visible
        // backgroundColor: 'rgba(255,0,0,0.3)', // DEBUG: red tint
      }}
    >
      {/* Video element is mounted here by the useEffect */}
    </div>
  );
};

/**
 * Video content with audio volume/fades support.
 * Separate component so we can use hooks for audio calculation.
 *
 * Uses native HTML5 video for both preview and export (via Canvas + WebCodecs).
 */
const VideoContent: React.FC<{
  item: VideoItem;
  muted: boolean;
  safeTrimBefore: number;
  playbackRate: number;
}> = ({ item, muted, safeTrimBefore, playbackRate }) => {
  const audioVolume = useVideoAudioVolume(item, muted);
  const [hasError, setHasError] = useState(false);

  // Web Audio API refs for volume boost > 1
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentVideoRef = useRef<HTMLVideoElement | null>(null);

  // Set up Web Audio API when video element is available (for volume > 1 boost)
  useEffect(() => {
    if (!containerRef.current) return;

    // Find the video element rendered by NativePreviewVideo
    const findAndConnectVideo = () => {
      const video = containerRef.current?.querySelector('video');
      if (!video) return;

      currentVideoRef.current = video;

      // Check if this video is already connected (can only connect once ever)
      if (connectedVideoElements.has(video)) {
        // Already connected - just update the gain
        const gainNode = videoGainNodes.get(video);
        const audioContext = videoAudioContexts.get(video);
        if (gainNode) {
          gainNode.gain.value = audioVolume;
        }
        if (audioContext?.state === 'suspended') {
          audioContext.resume();
        }
        return;
      }

      // Set up Web Audio API for this video element
      try {
        const audioContext = new AudioContext();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = audioVolume;
        const sourceNode = audioContext.createMediaElementSource(video);
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Track this video as connected
        connectedVideoElements.add(video);
        videoGainNodes.set(video, gainNode);
        videoAudioContexts.set(video, audioContext);

        // Resume if suspended (browsers require user interaction)
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
      } catch {
        // Failed to set up Web Audio - volume boost won't work but audio still plays
      }
    };

    // Try immediately and also observe for changes
    findAndConnectVideo();
    const observer = new MutationObserver(findAndConnectVideo);
    observer.observe(containerRef.current, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      // Don't disconnect audio - video element might be reused
    };
  }, [audioVolume]);

  // Update gain node volume (allows > 1 for boost)
  useEffect(() => {
    const video = currentVideoRef.current;
    if (video) {
      const gainNode = videoGainNodes.get(video);
      const audioContext = videoAudioContexts.get(video);
      if (gainNode) {
        gainNode.gain.value = audioVolume;
      }
      if (audioContext?.state === 'suspended') {
        audioContext.resume();
      }
    }
  }, [audioVolume]);

  // Handle media errors (e.g., invalid blob URL after HMR or cache cleanup)
  const handleError = useCallback((error: Error) => {
    console.warn(`[VideoContent] Media error for item ${item.id}:`, error.message);
    setHasError(true);
  }, [item.id]);

  // Show error state if media failed to load
  if (hasError) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: '#666', fontSize: 14 }}>Media unavailable</p>
      </div>
    );
  }

  // Use native HTML5 video with VideoSourcePool for element reuse
  // Export uses Canvas + WebCodecs (client-render-engine.ts), not Remotion's renderer
  return (
    <NativePreviewVideo
      itemId={item.id}
      src={item.src!}
      safeTrimBefore={safeTrimBefore}
      playbackRate={playbackRate}
      audioVolume={audioVolume}
      onError={handleError}
      containerRef={containerRef}
    />
  );
};

/**
 * Text content with live property preview support.
 * Reads preview values from gizmo store for real-time updates during slider/picker drag.
 */
const TextContent: React.FC<{ item: TextItem }> = ({ item }) => {
  // Read preview values from unified preview system
  const itemPreview = useGizmoStore(
    useCallback((s) => s.preview?.[item.id], [item.id])
  );
  const preview = itemPreview?.properties;

  // Use preview values if available, otherwise use item's stored values
  const fontSize = preview?.fontSize ?? item.fontSize ?? 60;
  const letterSpacing = preview?.letterSpacing ?? item.letterSpacing ?? 0;
  const lineHeight = preview?.lineHeight ?? item.lineHeight ?? 1.2;
  const color = preview?.color ?? item.color;

  // Load the Google Font and get the CSS fontFamily value
  // loadFont() blocks rendering until the font is ready (works for both preview and server render)
  const fontName = item.fontFamily ?? 'Inter';
  const fontFamily = loadFont(fontName);

  // Get font weight from shared map
  const fontWeight = FONT_WEIGHT_MAP[item.fontWeight ?? 'normal'] ?? 400;

  // Map text align to flexbox justify-content (horizontal)
  const textAlignMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };
  const justifyContent = textAlignMap[item.textAlign ?? 'center'] ?? 'center';

  // Map vertical align to flexbox align-items
  const verticalAlignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  };
  const alignItems = verticalAlignMap[item.verticalAlign ?? 'middle'] ?? 'center';

  // Build text shadow CSS if present
  const textShadow = item.textShadow
    ? `${item.textShadow.offsetX}px ${item.textShadow.offsetY}px ${item.textShadow.blur}px ${item.textShadow.color}`
    : undefined;

  // Build stroke/outline effect using text-stroke or text shadow workaround
  // Note: -webkit-text-stroke is not well supported in Remotion rendering
  // Using multiple text shadows as a fallback for stroke effect
  const strokeShadows = item.stroke
    ? [
        `${item.stroke.width}px 0 ${item.stroke.color}`,
        `-${item.stroke.width}px 0 ${item.stroke.color}`,
        `0 ${item.stroke.width}px ${item.stroke.color}`,
        `0 -${item.stroke.width}px ${item.stroke.color}`,
      ].join(', ')
    : undefined;

  const finalTextShadow = [textShadow, strokeShadows].filter(Boolean).join(', ') || undefined;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems,
        justifyContent,
        padding: '16px',
        backgroundColor: item.backgroundColor,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize,
          // Use the fontFamily returned by loadFont (includes proper CSS value)
          fontFamily: fontFamily,
          fontWeight,
          fontStyle: item.fontStyle ?? 'normal',
          color,
          textAlign: item.textAlign ?? 'center',
          lineHeight,
          letterSpacing,
          textShadow: finalTextShadow,
          // Best practice: use inline-block and pre-wrap to match measureText behavior
          display: 'inline-block',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          width: '100%',
        }}
      >
        {item.text}
      </div>
    </div>
  );
};

/**
 * Shape content with live property preview support.
 * Renders Remotion shapes (Rect, Circle, Triangle, Ellipse, Star, Polygon).
 * Reads preview values from gizmo store for real-time updates during editing.
 */
const ShapeContent: React.FC<{ item: ShapeItem }> = ({ item }) => {
  // Read transform preview from gizmo store for real-time scaling
  const activeGizmo = useGizmoStore((s) => s.activeGizmo);
  const previewTransform = useGizmoStore((s) => s.previewTransform);
  // Read from unified preview system (includes transforms, properties, and effects)
  const itemPreview = useGizmoStore(
    useCallback((s) => s.preview?.[item.id], [item.id])
  );

  // Use preview values if available, otherwise use item's stored values
  const shapePropsPreview = itemPreview?.properties;
  const fillColor = shapePropsPreview?.fillColor ?? item.fillColor ?? '#3b82f6';
  const strokeColor = shapePropsPreview?.strokeColor ?? item.strokeColor;
  const strokeWidth = shapePropsPreview?.strokeWidth ?? item.strokeWidth ?? 0;
  const cornerRadius = shapePropsPreview?.cornerRadius ?? item.cornerRadius ?? 0;
  const direction = shapePropsPreview?.direction ?? item.direction ?? 'up';
  const points = shapePropsPreview?.points ?? item.points ?? 5;
  const innerRadius = shapePropsPreview?.innerRadius ?? item.innerRadius ?? 0.5;
  const shapeType = shapePropsPreview?.shapeType ?? item.shapeType;

  // Get dimensions with preview support for real-time gizmo scaling
  // Priority: Unified preview (group/properties) > Single gizmo preview > Base transform
  let width = item.transform?.width ?? 200;
  let height = item.transform?.height ?? 200;

  const itemPreviewTransform = itemPreview?.transform;
  const isGizmoPreviewActive = activeGizmo?.itemId === item.id && previewTransform !== null;

  if (itemPreviewTransform) {
    width = itemPreviewTransform.width ?? width;
    height = itemPreviewTransform.height ?? height;
  } else if (isGizmoPreviewActive && previewTransform) {
    width = previewTransform.width;
    height = previewTransform.height;
  }

  // Common stroke props
  const strokeProps = strokeWidth > 0 && strokeColor ? {
    stroke: strokeColor,
    strokeWidth,
  } : {};

  // Check if aspect ratio is locked (for squish/squash behavior)
  // Read from preview transforms if available, otherwise from item
  let aspectLocked = item.transform?.aspectRatioLocked ?? true;
  if (itemPreviewTransform?.aspectRatioLocked !== undefined) {
    aspectLocked = itemPreviewTransform.aspectRatioLocked;
  } else if (isGizmoPreviewActive && previewTransform?.aspectRatioLocked !== undefined) {
    aspectLocked = previewTransform.aspectRatioLocked;
  }

  // Centering wrapper style for SVG shapes
  const centerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // For shapes that need to squish/squash when aspect is unlocked,
  // we render at base size and apply CSS scale transform
  const baseSize = Math.min(width, height);
  const scaleX = aspectLocked ? 1 : width / baseSize;
  const scaleY = aspectLocked ? 1 : height / baseSize;
  const needsScale = !aspectLocked && (scaleX !== 1 || scaleY !== 1);

  const scaleStyle: React.CSSProperties = needsScale ? {
    transform: `scale(${scaleX}, ${scaleY})`,
  } : {};

  // Render appropriate shape based on shapeType
  switch (shapeType) {
    case 'rectangle':
      // Rectangle fills the entire container (naturally supports non-proportional)
      return (
        <div style={centerStyle}>
          <Rect
            width={width}
            height={height}
            fill={fillColor}
            cornerRadius={cornerRadius}
            {...strokeProps}
          />
        </div>
      );

    case 'circle': {
      // Circle: squish/squash when aspect unlocked
      const radius = baseSize / 2;
      return (
        <div style={centerStyle}>
          <div style={scaleStyle}>
            <Circle
              radius={radius}
              fill={fillColor}
              {...strokeProps}
            />
          </div>
        </div>
      );
    }

    case 'triangle': {
      // Triangle: squish/squash when aspect unlocked
      return (
        <div style={centerStyle}>
          <div style={scaleStyle}>
            <Triangle
              length={baseSize}
              direction={direction}
              fill={fillColor}
              cornerRadius={cornerRadius}
              {...strokeProps}
            />
          </div>
        </div>
      );
    }

    case 'ellipse': {
      // Ellipse naturally supports non-proportional via rx/ry
      const rx = width / 2;
      const ry = height / 2;
      return (
        <div style={centerStyle}>
          <Ellipse
            rx={rx}
            ry={ry}
            fill={fillColor}
            {...strokeProps}
          />
        </div>
      );
    }

    case 'star': {
      // Star: squish/squash when aspect unlocked
      const outerRadius = baseSize / 2;
      const innerRadiusValue = outerRadius * innerRadius;
      return (
        <div style={centerStyle}>
          <div style={scaleStyle}>
            <Star
              points={points}
              outerRadius={outerRadius}
              innerRadius={innerRadiusValue}
              fill={fillColor}
              cornerRadius={cornerRadius}
              {...strokeProps}
            />
          </div>
        </div>
      );
    }

    case 'polygon': {
      // Polygon: squish/squash when aspect unlocked
      const radius = baseSize / 2;
      return (
        <div style={centerStyle}>
          <div style={scaleStyle}>
            <Polygon
              points={points}
              radius={radius}
              fill={fillColor}
              cornerRadius={cornerRadius}
              {...strokeProps}
            />
          </div>
        </div>
      );
    }

    case 'heart': {
      // Heart: use Remotion's Heart component for consistency with mask path generation
      // Heart output width = 1.1 × input height, so we scale input to fit within baseSize
      // Using height = baseSize / 1.1 ensures output width = baseSize (fits container)
      const heartHeight = baseSize / 1.1;
      return (
        <div style={centerStyle}>
          <div style={scaleStyle}>
            <Heart
              height={heartHeight}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          </div>
        </div>
      );
    }

    default:
      // Fallback to simple colored div for unknown types
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: fillColor,
            borderRadius: cornerRadius,
          }}
        />
      );
  }
};


export interface ItemProps {
  item: TimelineItem;
  muted?: boolean;
  /** Active masks that should clip this item's content */
  masks?: MaskInfo[];
}

/**
 * Remotion Item Component
 *
 * Renders different item types following Remotion best practices:
 * - Video: OffthreadVideo for preview (resilient to UI), @remotion/media Video for rendering
 * - Audio: Uses Audio component with trim support
 * - Image: Uses img tag
 * - Text: Renders text with styling
 * - Shape: Renders solid colors or shapes
 * - Respects mute state for audio/video items (reads directly from store for reactivity)
 * - Supports trimStart/trimEnd for media trimming (uses trimStart as trimBefore)
 *
 * Memoized to prevent unnecessary re-renders when parent (MainComposition) updates.
 */
export const Item = React.memo<ItemProps>(({ item, muted = false, masks = [] }) => {
  // Use muted prop directly - MainComposition already passes track.muted
  // Avoiding store subscription here prevents re-render issues with @remotion/media Audio

  // Debug overlay toggle (always false in production via store)
  const showDebugOverlay = useDebugStore((s) => s.showVideoDebugOverlay);

  if (item.type === 'video') {

    // Guard against missing src (media resolution failed)
    if (!item.src) {
      return (
        <AbsoluteFill style={{ backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#666', fontSize: 14 }}>Media not loaded</p>
        </AbsoluteFill>
      );
    }
    // Use sourceStart for trimBefore (absolute position in source)
    // Fall back to trimStart or offset for backward compatibility
    const trimBefore = item.sourceStart ?? item.trimStart ?? item.offset ?? 0;
    // Get playback rate from speed property (default 1x)
    const playbackRate = item.speed ?? DEFAULT_SPEED;

    // Calculate source frames needed for playback using shared utility
    const sourceFramesNeeded = timelineToSourceFrames(item.durationInFrames, playbackRate);
    const sourceEndPosition = trimBefore + sourceFramesNeeded;
    const sourceDuration = item.sourceDuration || 0;

    // Calculate the effective source segment this clip represents
    // This is more accurate than sourceDuration for rate-stretched clips
    // sourceEnd - sourceStart defines the actual source frames used
    const effectiveSourceSegment = item.sourceEnd !== undefined && item.sourceStart !== undefined
      ? item.sourceEnd - item.sourceStart
      : sourceDuration;

    // Only validate if we have valid source duration info
    const hasValidSourceDuration = sourceDuration > 0 || effectiveSourceSegment > 0;

    // Validate using shared utilities - skip if no valid duration info
    const isInvalidSeek = hasValidSourceDuration && !isValidSeekPosition(trimBefore, sourceDuration || undefined);
    const exceedsSource = hasValidSourceDuration && !isWithinSourceBounds(trimBefore, item.durationInFrames, playbackRate, sourceDuration || undefined);

    // Safety check: if sourceStart is unreasonably high (>1 hour) and no sourceDuration is set,
    // this indicates corrupted metadata from split/trim operations
    const MAX_REASONABLE_FRAMES = 30 * 60 * 60; // 1 hour at 30fps
    const hasCorruptedMetadata = sourceDuration === 0 && effectiveSourceSegment === 0 && trimBefore > MAX_REASONABLE_FRAMES;

    if (hasCorruptedMetadata || isInvalidSeek) {
      console.error('[Remotion Item] Invalid source position detected:', {
        itemId: item.id,
        sourceStart: item.sourceStart,
        trimBefore,
        sourceDuration,
        effectiveSourceSegment,
        hasCorruptedMetadata,
        isInvalidSeek,
      });
      return (
        <AbsoluteFill style={{ backgroundColor: '#2a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#ff6b6b', fontSize: 14 }}>Invalid source position</p>
        </AbsoluteFill>
      );
    }

    // Clamp trimBefore to valid range using shared utility
    const safeTrimBefore = getSafeTrimBefore(trimBefore, item.durationInFrames, playbackRate, sourceDuration || undefined);

    // If clip would exceed source even after clamping, show error
    // This happens when durationInFrames * playbackRate > sourceDuration
    // Skip this check if we don't have valid source duration info (can't validate)
    // Also use effectiveSourceSegment as fallback for rate-stretched clips
    const effectiveDuration = sourceDuration > 0 ? sourceDuration : effectiveSourceSegment;
    if (exceedsSource && safeTrimBefore === 0 && effectiveDuration > 0 && sourceFramesNeeded > effectiveDuration) {
      console.error('[Remotion Item] Clip duration exceeds source duration:', {
        itemId: item.id,
        sourceFramesNeeded,
        sourceDuration,
        effectiveSourceSegment,
        effectiveDuration,
        durationInFrames: item.durationInFrames,
        playbackRate,
      });
      return (
        <AbsoluteFill style={{ backgroundColor: '#2a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#ff6b6b', fontSize: 14 }}>Clip exceeds source duration</p>
        </AbsoluteFill>
      );
    }

    const videoContent = (
      <>
        <VideoContent
          item={item}
          muted={muted}
          safeTrimBefore={safeTrimBefore}
          playbackRate={playbackRate}
        />
        {showDebugOverlay && (
          <DebugOverlay
            id={item.id}
            speed={playbackRate}
            trimBefore={trimBefore}
            safeTrimBefore={safeTrimBefore}
            sourceStart={item.sourceStart}
            sourceDuration={sourceDuration}
            durationInFrames={item.durationInFrames}
            sourceFramesNeeded={sourceFramesNeeded}
            sourceEndPosition={sourceEndPosition}
            isInvalidSeek={isInvalidSeek}
            exceedsSource={exceedsSource}
          />
        )}
      </>
    );

    // Use new ItemVisualWrapper for consolidated state and fixed DOM structure
    // resolveTransform handles defaults (fit-to-canvas) when no explicit transform is set
    return (
      <ItemVisualWrapper item={item} masks={masks}>
        {videoContent}
      </ItemVisualWrapper>
    );
  }

  if (item.type === 'audio') {
    // Guard against missing src (media resolution failed)
    if (!item.src) {
      return null; // Audio can fail silently
    }

    // Use sourceStart for trimBefore (absolute position in source)
    const trimBefore = item.sourceStart ?? item.trimStart ?? item.offset ?? 0;
    // Get playback rate from speed property
    const playbackRate = item.speed ?? DEFAULT_SPEED;

    // Use PitchCorrectedAudio for pitch-preserved playback during preview
    // and toneFrequency correction during rendering
    return (
      <PitchCorrectedAudio
        src={item.src}
        itemId={item.id}
        trimBefore={trimBefore}
        volume={item.volume ?? 0}
        playbackRate={playbackRate}
        muted={muted}
        durationInFrames={item.durationInFrames}
        audioFadeIn={item.audioFadeIn}
        audioFadeOut={item.audioFadeOut}
      />
    );
  }

  if (item.type === 'image') {
    // Guard against missing src (media resolution failed)
    if (!item.src) {
      return (
        <AbsoluteFill style={{ backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#666', fontSize: 14 }}>Image not loaded</p>
        </AbsoluteFill>
      );
    }

    // Use Remotion's Gif component for animated GIFs
    // This ensures proper frame-by-frame rendering during export
    // Check both src URL and item label (original filename) for .gif extension
    const isAnimatedGif = isGifUrl(item.src) || (item.label && item.label.toLowerCase().endsWith('.gif'));

    if (isAnimatedGif) {
      // Get playback rate from speed property
      const gifPlaybackRate = item.speed ?? DEFAULT_SPEED;

      const gifContent = (
        <GifPlayer
          mediaId={item.mediaId!}
          src={item.src}
          fit="cover"
          playbackRate={gifPlaybackRate}
          loopBehavior="loop"
        />
      );

      // Use new ItemVisualWrapper for consolidated state and fixed DOM structure
      return (
        <ItemVisualWrapper item={item} masks={masks}>
          {gifContent}
        </ItemVisualWrapper>
      );
    }

    // Regular static images - use native img element
    const imageContent = (
      <img
        src={item.src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />
    );

    // Use new ItemVisualWrapper for consolidated state and fixed DOM structure
    return (
      <ItemVisualWrapper item={item} masks={masks}>
        {imageContent}
      </ItemVisualWrapper>
    );
  }

  if (item.type === 'text') {
    // Use new ItemVisualWrapper for consolidated state and fixed DOM structure
    return (
      <ItemVisualWrapper item={item} masks={masks}>
        <TextContent item={item} />
      </ItemVisualWrapper>
    );
  }

  if (item.type === 'shape') {
    // Use new ItemVisualWrapper for consolidated state and fixed DOM structure
    // ShapeContent renders the appropriate Remotion shape based on shapeType
    return (
      <ItemVisualWrapper item={item} masks={masks}>
        <ShapeContent item={item} />
      </ItemVisualWrapper>
    );
  }

  throw new Error(`Unknown item type: ${JSON.stringify(item)}`);
});
