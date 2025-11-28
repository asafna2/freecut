import React, { useMemo, useState, useEffect } from 'react';
import { useCurrentFrame, useVideoConfig, AbsoluteFill, delayRender, continueRender } from 'remotion';
import { useGifFrames } from '../../../../features/timeline/hooks/use-gif-frames';
import { GifCanvas } from './gif-canvas';

export interface GifPlayerProps {
  /** Media ID for cache lookup */
  mediaId: string;
  /** Blob URL for the GIF file */
  src: string;
  /** How to fit the GIF within the container */
  fit?: 'cover' | 'contain' | 'fill';
  /** Playback speed multiplier */
  playbackRate?: number;
  /** Loop behavior */
  loopBehavior?: 'loop' | 'pause-at-end';
  /** Additional styles */
  style?: React.CSSProperties;
}

/**
 * Custom GIF Player for Remotion
 *
 * Replaces @remotion/gif with pre-extracted frames for:
 * - Lag-free scrubbing via O(1) frame lookup
 * - Memory-efficient caching
 * - IndexedDB persistence
 * - Server-side rendering support via delayRender
 */
export const GifPlayer: React.FC<GifPlayerProps> = ({
  mediaId,
  src,
  fit = 'cover',
  playbackRate = 1,
  loopBehavior = 'loop',
  style,
}) => {
  const currentFrame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Use delayRender to pause Remotion rendering until GIF frames are loaded
  const [handle] = useState(() => delayRender(`Loading GIF: ${mediaId}`));
  const [renderContinued, setRenderContinued] = useState(false);

  const { getFrameAtTime, totalDuration, isLoading, isComplete, frames, error } = useGifFrames({
    mediaId,
    blobUrl: src,
    isVisible: true,
    enabled: true,
  });

  // Continue rendering once frames are loaded (or on error) - only once
  useEffect(() => {
    if (!renderContinued && (isComplete || error)) {
      continueRender(handle);
      setRenderContinued(true);
    }
  }, [isComplete, error, handle, renderContinued]);

  // Calculate which GIF frame to show based on Remotion frame
  const gifFrame = useMemo(() => {
    if (!frames || frames.length === 0 || !totalDuration) {
      return null;
    }

    // Convert Remotion frame to milliseconds
    const timeMs = (currentFrame / fps) * 1000 * playbackRate;

    // Handle loop behavior
    let effectiveTimeMs: number;
    if (loopBehavior === 'loop') {
      effectiveTimeMs = timeMs % totalDuration;
    } else {
      // Pause at end - clamp to last frame
      effectiveTimeMs = Math.min(timeMs, totalDuration - 1);
    }

    return getFrameAtTime(effectiveTimeMs);
  }, [currentFrame, fps, frames, totalDuration, playbackRate, loopBehavior, getFrameAtTime]);

  // Loading state
  if (isLoading || !isComplete || !frames || frames.length === 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...style,
        }}
      >
        {error ? (
          <span style={{ color: '#ff6b6b', fontSize: 14 }}>GIF load failed</span>
        ) : (
          <span style={{ color: '#666', fontSize: 14 }}>Loading GIF...</span>
        )}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={style}>
      <GifCanvas frame={gifFrame} fit={fit} />
    </AbsoluteFill>
  );
};
