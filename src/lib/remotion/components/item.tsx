import React from 'react';
import { AbsoluteFill, OffthreadVideo } from 'remotion';
import type { TimelineItem } from '@/types/timeline';
import { DebugOverlay } from './debug-overlay';
import { PitchCorrectedAudio } from './pitch-corrected-audio';
import { GifPlayer } from './gif-player';

/**
 * Check if a URL points to a GIF file
 */
function isGifUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.gif') || lowerUrl.includes('.gif');
}

// Set to true to show debug overlay on video items during rendering
const DEBUG_VIDEO_OVERLAY = false;

export interface ItemProps {
  item: TimelineItem;
  muted?: boolean;
}

/**
 * Remotion Item Component
 *
 * Renders different item types following Remotion best practices:
 * - Video: Uses OffthreadVideo for better performance with trim support
 * - Audio: Uses Audio component with trim support
 * - Image: Uses img tag
 * - Text: Renders text with styling
 * - Shape: Renders solid colors or shapes
 * - Respects mute state for audio/video items (reads directly from store for reactivity)
 * - Supports trimStart/trimEnd for media trimming (uses trimStart as trimBefore)
 */
export const Item: React.FC<ItemProps> = ({ item, muted = false }) => {
  // Use muted prop directly - MainComposition already passes track.muted
  // Avoiding store subscription here prevents re-render issues with @remotion/media Audio
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
    const playbackRate = item.speed ?? 1;

    // Calculate source frames needed for playback
    // Use Math.round to minimize rounding errors (ceil can exceed by 1 frame)
    const sourceFramesNeeded = Math.round(item.durationInFrames * playbackRate);
    const sourceEndPosition = trimBefore + sourceFramesNeeded;
    const sourceDuration = item.sourceDuration || 0;

    // Validate sourceStart doesn't exceed source duration
    // Use small tolerance (2 frames) for floating point rounding errors
    const tolerance = 2;
    const isInvalidSeek = sourceDuration > 0 && trimBefore >= sourceDuration;
    const exceedsSource = sourceDuration > 0 && sourceEndPosition > sourceDuration + tolerance;

    // Safety check: if sourceStart is unreasonably high (>1 hour) and no sourceDuration is set,
    // this indicates corrupted metadata from split/trim operations
    // Show error state instead of crashing Remotion
    const MAX_REASONABLE_FRAMES = 30 * 60 * 60; // 1 hour at 30fps
    const hasCorruptedMetadata = sourceDuration === 0 && trimBefore > MAX_REASONABLE_FRAMES;

    if (hasCorruptedMetadata || isInvalidSeek) {
      console.error('[Remotion Item] Invalid source position detected:', {
        itemId: item.id,
        sourceStart: item.sourceStart,
        trimBefore,
        sourceDuration,
        hasCorruptedMetadata,
        isInvalidSeek,
      });
      return (
        <AbsoluteFill style={{ backgroundColor: '#2a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#ff6b6b', fontSize: 14 }}>Invalid source position</p>
        </AbsoluteFill>
      );
    }

    // Clamp trimBefore to valid range if source duration is known
    let safeTrimBefore = trimBefore;
    if (sourceDuration > 0) {
      // Ensure we don't seek past the source
      const maxTrimBefore = Math.max(0, sourceDuration - sourceFramesNeeded);
      if (trimBefore > maxTrimBefore) {
        console.warn('[Remotion Item] trimBefore exceeds valid range, clamping:', {
          original: trimBefore,
          clamped: maxTrimBefore,
          sourceDuration,
          sourceFramesNeeded,
        });
        safeTrimBefore = maxTrimBefore;
      }
    }

    // If clip would exceed source even after clamping, show error
    // This happens when durationInFrames * playbackRate > sourceDuration
    if (exceedsSource && safeTrimBefore === 0 && sourceFramesNeeded > sourceDuration) {
      console.error('[Remotion Item] Clip duration exceeds source duration:', {
        itemId: item.id,
        sourceFramesNeeded,
        sourceDuration,
        durationInFrames: item.durationInFrames,
        playbackRate,
      });
      return (
        <AbsoluteFill style={{ backgroundColor: '#2a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#ff6b6b', fontSize: 14 }}>Clip exceeds source duration</p>
        </AbsoluteFill>
      );
    }

    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <OffthreadVideo
          src={item.src}
          trimBefore={safeTrimBefore > 0 ? safeTrimBefore : undefined}
          volume={muted ? 0 : 1}
          playbackRate={playbackRate}
          pauseWhenBuffering
        />
        {DEBUG_VIDEO_OVERLAY && (
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
      </AbsoluteFill>
    );
  }

  if (item.type === 'audio') {
    // Guard against missing src (media resolution failed)
    if (!item.src) {
      return null; // Audio can fail silently
    }

    // Use sourceStart for trimBefore (absolute position in source)
    const trimBefore = item.sourceStart ?? item.trimStart ?? item.offset ?? 0;
    // Get playback rate from speed property (default 1x)
    const playbackRate = item.speed ?? 1;

    // Use PitchCorrectedAudio for pitch-preserved playback during preview
    // and toneFrequency correction during rendering
    return (
      <PitchCorrectedAudio
        src={item.src}
        trimBefore={trimBefore}
        volume={muted ? 0 : 1}
        playbackRate={playbackRate}
        muted={muted}
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
      // Get playback rate from speed property (default 1x)
      const gifPlaybackRate = item.speed ?? 1;

      return (
        <AbsoluteFill>
          <GifPlayer
            mediaId={item.mediaId!}
            src={item.src}
            fit="cover"
            playbackRate={gifPlaybackRate}
            loopBehavior="loop"
          />
        </AbsoluteFill>
      );
    }

    // Regular static images
    return (
      <AbsoluteFill>
        <img
          src={item.src}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      </AbsoluteFill>
    );
  }

  if (item.type === 'text') {
    return (
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <h1
          style={{
            fontSize: item.fontSize || 60,
            fontFamily: item.fontFamily || 'Arial, sans-serif',
            color: item.color,
            textAlign: 'center',
          }}
        >
          {item.text}
        </h1>
      </AbsoluteFill>
    );
  }

  if (item.type === 'shape') {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: item.fillColor
        }}
      />
    );
  }

  throw new Error(`Unknown item type: ${JSON.stringify(item)}`);
};
