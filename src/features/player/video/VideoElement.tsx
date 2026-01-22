/**
 * VideoElement.tsx - Individual video component with frame-accurate control
 *
 * Wraps HTMLVideoElement with:
 * - Frame-accurate seeking using requestVideoFrameCallback
 * - Playback rate control
 * - Volume control (including >1x boost via Web Audio API)
 * - Buffering detection
 * - Error handling
 *
 * This component manages a single video element and handles all the
 * complexities of HTML5 video playback.
 */

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { VideoElementProps, VideoElementState } from './types';
import { useVideoFrame, seekToTimeAccurate } from './use-video-frame';

/**
 * Imperative handle for VideoElement
 */
export interface VideoElementHandle {
  /** Get the underlying video element */
  getVideoElement: () => HTMLVideoElement | null;
  /** Seek to a specific time in seconds */
  seekTo: (time: number) => Promise<void>;
  /** Play the video */
  play: () => Promise<void>;
  /** Pause the video */
  pause: () => void;
  /** Get current time in seconds */
  getCurrentTime: () => number;
  /** Get video duration in seconds */
  getDuration: () => number;
  /** Get current state */
  getState: () => VideoElementState;
}

// Track video elements connected to Web Audio API
// A video can only be connected to ONE MediaElementSourceNode ever
const connectedVideoElements = new WeakSet<HTMLVideoElement>();
const videoGainNodes = new WeakMap<HTMLVideoElement, GainNode>();
const videoAudioContexts = new WeakMap<HTMLVideoElement, AudioContext>();

/**
 * VideoElement Component
 *
 * A controlled video component that syncs its playback state
 * with external props.
 */
export const VideoElement = forwardRef<VideoElementHandle, VideoElementProps>(
  (
    {
      src,
      id,
      startTime = 0,
      isPlaying,
      currentTime,
      playbackRate = 1,
      volume = 1,
      muted = false,
      visible = true,
      onReady,
      onError,
      onFrame,
      onBuffering,
      className,
      style,
    },
    ref
  ) => {
    // Refs
    const videoRef = useRef<HTMLVideoElement>(null);
    const lastSeekTimeRef = useRef<number>(0);
    const isSeekingRef = useRef<boolean>(false);

    // State
    const [state, setState] = useState<VideoElementState>({
      ready: false,
      loading: true,
      error: null,
      buffering: false,
      currentTime: 0,
      duration: 0,
    });

    // Use the video frame hook for frame-accurate callbacks
    useVideoFrame(videoRef, {
      enabled: isPlaying && visible,
      onFrame,
    });

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        getVideoElement: () => videoRef.current,

        seekTo: async (time: number) => {
          const video = videoRef.current;
          if (!video) return;

          isSeekingRef.current = true;
          lastSeekTimeRef.current = time;

          try {
            await seekToTimeAccurate(video, time);
          } finally {
            isSeekingRef.current = false;
          }
        },

        play: async () => {
          const video = videoRef.current;
          if (!video) return;

          try {
            await video.play();
          } catch (error) {
            // Ignore AbortError (play was interrupted)
            if ((error as Error).name !== 'AbortError') {
              console.error('[VideoElement] Play failed:', error);
              onError?.(error as Error);
            }
          }
        },

        pause: () => {
          videoRef.current?.pause();
        },

        getCurrentTime: () => {
          return videoRef.current?.currentTime ?? 0;
        },

        getDuration: () => {
          return videoRef.current?.duration ?? 0;
        },

        getState: () => state,
      }),
      [state, onError]
    );

    // Set up Web Audio API for volume boost (>1x)
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      // Only set up Web Audio if we need volume boost
      // For normal volume (0-1), use native volume
      if (volume <= 1) {
        video.volume = muted ? 0 : volume;
        return;
      }

      // Check if already connected
      if (connectedVideoElements.has(video)) {
        // Update existing gain node
        const gainNode = videoGainNodes.get(video);
        const audioContext = videoAudioContexts.get(video);

        if (gainNode) {
          gainNode.gain.value = muted ? 0 : volume;
        }

        if (audioContext?.state === 'suspended') {
          audioContext.resume();
        }

        // Set video volume to 1 (gain node handles the boost)
        video.volume = 1;
        return;
      }

      // Set up new Web Audio connection
      try {
        const audioContext = new AudioContext();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = muted ? 0 : volume;

        const sourceNode = audioContext.createMediaElementSource(video);
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Track this connection
        connectedVideoElements.add(video);
        videoGainNodes.set(video, gainNode);
        videoAudioContexts.set(video, audioContext);

        // Resume if suspended
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }

        // Set video volume to 1 (gain node handles the boost)
        video.volume = 1;
      } catch (error) {
        console.warn('[VideoElement] Failed to set up Web Audio:', error);
        // Fallback to max native volume
        video.volume = muted ? 0 : Math.min(1, volume);
      }
    }, [volume, muted]);

    // Update gain node when volume/muted changes
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (volume <= 1) {
        video.volume = muted ? 0 : volume;
      } else {
        const gainNode = videoGainNodes.get(video);
        if (gainNode) {
          gainNode.gain.value = muted ? 0 : volume;
        }
      }
    }, [volume, muted]);

    // Sync playback rate
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      if (video.playbackRate !== playbackRate) {
        video.playbackRate = playbackRate;
      }
    }, [playbackRate]);

    // Sync play/pause state
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !state.ready) return;

      if (isPlaying && video.paused) {
        video.play().catch((error) => {
          if (error.name !== 'AbortError') {
            console.error('[VideoElement] Play failed:', error);
            onError?.(error);
          }
        });
      } else if (!isPlaying && !video.paused) {
        video.pause();
      }
    }, [isPlaying, state.ready, onError]);

    // Sync current time (seeking)
    useEffect(() => {
      const video = videoRef.current;
      if (!video || isSeekingRef.current) return;

      // Calculate target time considering startTime offset
      const targetTime = startTime + currentTime;

      // Only seek if difference is significant (avoid micro-seeks)
      const drift = Math.abs(video.currentTime - targetTime);
      const threshold = isPlaying ? 0.1 : 0.01; // More lenient during playback

      if (drift > threshold && targetTime !== lastSeekTimeRef.current) {
        lastSeekTimeRef.current = targetTime;
        video.currentTime = targetTime;
      }
    }, [currentTime, startTime, isPlaying]);

    // Event handlers
    const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      setState((prev) => ({
        ...prev,
        duration: video.duration,
        loading: false,
      }));
    }, []);

    const handleCanPlay = useCallback(() => {
      setState((prev) => ({
        ...prev,
        ready: true,
        loading: false,
        buffering: false,
      }));
      onReady?.();
    }, [onReady]);

    const handleWaiting = useCallback(() => {
      setState((prev) => ({ ...prev, buffering: true }));
      onBuffering?.(true);
    }, [onBuffering]);

    const handlePlaying = useCallback(() => {
      setState((prev) => ({ ...prev, buffering: false }));
      onBuffering?.(false);
    }, [onBuffering]);

    const handleError = useCallback(() => {
      const video = videoRef.current;
      const error = video?.error;

      const errorMessage = error
        ? `Video error: ${error.code} - ${error.message}`
        : 'Unknown video error';

      const err = new Error(errorMessage);

      setState((prev) => ({
        ...prev,
        error: err,
        loading: false,
        ready: false,
      }));

      onError?.(err);
    }, [onError]);

    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      setState((prev) => ({
        ...prev,
        currentTime: video.currentTime,
      }));
    }, []);

    // Memoize video style
    const videoStyle = useMemo(
      () => ({
        width: '100%',
        height: '100%',
        objectFit: 'contain' as const,
        display: visible ? 'block' : 'none',
        ...style,
      }),
      [visible, style]
    );

    // Show error state
    if (state.error) {
      return (
        <div
          className={className}
          style={{
            ...videoStyle,
            backgroundColor: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#666', fontSize: 14 }}>Video unavailable</p>
        </div>
      );
    }

    return (
      <video
        ref={videoRef}
        data-video-id={id}
        src={src}
        className={className}
        style={videoStyle}
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={handleCanPlay}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onError={handleError}
        onTimeUpdate={handleTimeUpdate}
      />
    );
  }
);

VideoElement.displayName = 'VideoElement';

export default VideoElement;
