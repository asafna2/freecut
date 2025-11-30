import React, { useMemo } from 'react';
import { AbsoluteFill, Sequence, useVideoConfig, useCurrentFrame } from 'remotion';
import type { RemotionInputProps } from '@/types/export';
import type { TextItem, ShapeItem } from '@/types/timeline';
import { Item, type MaskInfo, GroupMaskWrapper } from '../components/item';
import { generateStableKey } from '../utils/generate-stable-key';
import { loadFonts } from '../utils/fonts';
import { resolveTransform } from '../utils/transform-resolver';

/** Mask shape with its track order for scope calculation */
interface MaskWithTrackOrder {
  mask: ShapeItem;
  trackOrder: number;
}

/**
 * Check if a mask is active at the current frame (within its time range).
 */
function isMaskActiveAtFrame(mask: ShapeItem, currentFrame: number): boolean {
  const maskStart = mask.from;
  const maskEnd = mask.from + mask.durationInFrames;
  return currentFrame >= maskStart && currentFrame < maskEnd;
}

/**
 * Check if a mask should affect a target item based on track order.
 * A mask affects ALL items on tracks below it (higher order numbers).
 */
function shouldMaskAffectItem(
  maskTrackOrder: number,
  targetTrackOrder: number
): boolean {
  // Mask affects items on tracks with higher order (visually below)
  return maskTrackOrder < targetTrackOrder;
}

/**
 * Main Remotion Composition
 *
 * Renders all tracks following Remotion best practices:
 * - Media items (video/audio) rendered at composition level for stable keys
 *   This prevents remounting when items are split or moved across tracks
 * - Non-media items (text, images, shapes) rendered per-track
 * - Z-index based on track order for proper layering (top track = highest z-index)
 * - Respects track visibility, mute, and solo states
 * - Pre-mounts media items 2 seconds early for smooth transitions
 */
export const MainComposition: React.FC<RemotionInputProps> = ({ tracks, backgroundColor = '#000000' }) => {
  const { fps, width: canvasWidth, height: canvasHeight } = useVideoConfig();
  const currentFrame = useCurrentFrame();
  const canvas = { width: canvasWidth, height: canvasHeight, fps };
  const hasSoloTracks = tracks.some((track) => track.solo);

  // Calculate max order for z-index inversion (top track should have highest z-index)
  const maxOrder = Math.max(...tracks.map((t) => t.order ?? 0), 0);

  // Filter visible tracks (tracks are already sorted by store)
  const visibleTracks = tracks.filter((track) => {
    if (hasSoloTracks) return track.solo;
    return track.visible !== false;
  });

  // Collect ALL media items (video/audio) from visible tracks with z-index and mute state
  // Invert z-index: top track (order=0) gets highest z-index, bottom track gets lowest
  const mediaItems = visibleTracks.flatMap((track) =>
    track.items
      .filter((item) => item.type === 'video' || item.type === 'audio')
      .map((item) => ({
        ...item,
        zIndex: maxOrder - (track.order ?? 0),
        muted: track.muted,
      }))
  );

  // Collect all mask shapes with their track orders
  const allMasks: MaskWithTrackOrder[] = useMemo(() => {
    const masks: MaskWithTrackOrder[] = [];
    visibleTracks.forEach((track) => {
      track.items.forEach((item) => {
        if (item.type === 'shape' && item.isMask) {
          masks.push({
            mask: item,
            trackOrder: track.order ?? 0,
          });
        }
      });
    });
    return masks;
  }, [visibleTracks]);

  // Collect non-media items per track (text, image, shape)
  // Filter out mask shapes - they don't render visually
  const nonMediaByTrack = visibleTracks.map((track) => ({
    ...track,
    items: track.items.filter(
      (item) =>
        item.type !== 'video' &&
        item.type !== 'audio' &&
        !(item.type === 'shape' && item.isMask) // Exclude masks from rendering
    ),
  }));

  /**
   * Get active masks at the current frame that could affect items below them.
   * Returns MaskInfo array for group-level masking.
   */
  const getActiveMasks = useMemo((): MaskInfo[] => {
    return allMasks
      .filter(({ mask }) => isMaskActiveAtFrame(mask, currentFrame))
      .map(({ mask }) => {
        const resolved = resolveTransform(mask, canvas);
        return {
          shape: mask,
          transform: {
            x: resolved.x,
            y: resolved.y,
            width: resolved.width,
            height: resolved.height,
            rotation: resolved.rotation,
            opacity: resolved.opacity,
          },
        };
      });
  }, [allMasks, currentFrame, canvas]);

  // Find the topmost mask's track order (lowest order number = topmost)
  const topmostMaskTrackOrder = useMemo(() => {
    if (allMasks.length === 0) return null;
    const activeMaskOrders = allMasks
      .filter(({ mask }) => isMaskActiveAtFrame(mask, currentFrame))
      .map(({ trackOrder }) => trackOrder);
    if (activeMaskOrders.length === 0) return null;
    return Math.min(...activeMaskOrders);
  }, [allMasks, currentFrame]);

  // Separate media items into those affected by the mask and those not affected
  const { maskedMediaItems, unmaskedMediaItems } = useMemo(() => {
    if (topmostMaskTrackOrder === null) {
      return { maskedMediaItems: [], unmaskedMediaItems: mediaItems };
    }
    const masked: typeof mediaItems = [];
    const unmasked: typeof mediaItems = [];
    mediaItems.forEach((item) => {
      const trackOrder = maxOrder - item.zIndex;
      if (shouldMaskAffectItem(topmostMaskTrackOrder, trackOrder)) {
        masked.push(item);
      } else {
        unmasked.push(item);
      }
    });
    return { maskedMediaItems: masked, unmaskedMediaItems: unmasked };
  }, [mediaItems, topmostMaskTrackOrder, maxOrder]);

  // Separate non-media tracks into those affected by the mask and those not affected
  const { maskedNonMediaTracks, unmaskedNonMediaTracks } = useMemo(() => {
    if (topmostMaskTrackOrder === null) {
      return { maskedNonMediaTracks: [], unmaskedNonMediaTracks: nonMediaByTrack };
    }
    const masked: typeof nonMediaByTrack = [];
    const unmasked: typeof nonMediaByTrack = [];
    nonMediaByTrack.forEach((track) => {
      const trackOrder = track.order ?? 0;
      if (shouldMaskAffectItem(topmostMaskTrackOrder, trackOrder)) {
        masked.push(track);
      } else {
        unmasked.push(track);
      }
    });
    return { maskedNonMediaTracks: masked, unmaskedNonMediaTracks: unmasked };
  }, [nonMediaByTrack, topmostMaskTrackOrder]);

  // Load fonts for all text items
  // This ensures Google Fonts are loaded before rendering
  useMemo(() => {
    const textItems = visibleTracks
      .flatMap((track) => track.items)
      .filter((item): item is TextItem => item.type === 'text');

    const fontFamilies = textItems
      .map((item) => item.fontFamily ?? 'Inter')
      .filter((font, index, arr) => arr.indexOf(font) === index); // unique

    if (fontFamilies.length > 0) {
      loadFonts(fontFamilies);
    }
  }, [visibleTracks]);

  // Check if any VIDEO items (not audio) are active at current frame
  // Used to render a clearing layer when no videos are visible
  const hasActiveVideo = mediaItems.some(
    (item) =>
      item.type === 'video' &&
      currentFrame >= item.from &&
      currentFrame < item.from + item.durationInFrames
  );

  return (
    <AbsoluteFill>
      {/* BACKGROUND LAYER - Ensures empty areas show canvas background color */}
      <AbsoluteFill style={{ backgroundColor, zIndex: -1 }} />

      {/* UNMASKED MEDIA LAYER - Items above the mask, rendered without masking */}
      {unmaskedMediaItems.map((item) => {
        const premountFrames = Math.round(fps * 2);
        return (
          <Sequence
            key={generateStableKey(item)}
            from={item.from}
            durationInFrames={item.durationInFrames}
            premountFor={premountFrames}
          >
            <AbsoluteFill style={{ zIndex: item.zIndex }}>
              <Item item={item} muted={item.muted} masks={[]} />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* MASKED MEDIA LAYER - Items below the mask, grouped and masked together */}
      {/* This ensures items composite FIRST (Video A covers Video B), then mask applies to composite */}
      {maskedMediaItems.length > 0 && (
        <GroupMaskWrapper masks={getActiveMasks}>
          {maskedMediaItems.map((item) => {
            const premountFrames = Math.round(fps * 2);
            return (
              <Sequence
                key={generateStableKey(item)}
                from={item.from}
                durationInFrames={item.durationInFrames}
                premountFor={premountFrames}
              >
                <AbsoluteFill style={{ zIndex: item.zIndex }}>
                  <Item item={item} muted={item.muted} masks={[]} />
                </AbsoluteFill>
              </Sequence>
            );
          })}
        </GroupMaskWrapper>
      )}

      {/* CLEARING LAYER - Paints background color over stale video frames when no videos are active */}
      {/* z-index: 1000 - above media (0-999), below non-media (1001+) */}
      {!hasActiveVideo && (
        <AbsoluteFill style={{ backgroundColor, zIndex: 1000 }} />
      )}

      {/* UNMASKED NON-MEDIA LAYERS - Items above the mask */}
      {unmaskedNonMediaTracks
        .filter((track) => track.items.length > 0)
        .map((track) => {
          const trackOrder = track.order ?? 0;
          return (
            <AbsoluteFill key={track.id} style={{ zIndex: 1001 + (maxOrder - trackOrder) }}>
              {track.items.map((item) => (
                <Sequence
                  key={item.id}
                  from={item.from}
                  durationInFrames={item.durationInFrames}
                >
                  <Item item={item} muted={false} masks={[]} />
                </Sequence>
              ))}
            </AbsoluteFill>
          );
        })}

      {/* MASKED NON-MEDIA LAYERS - Items below the mask, grouped and masked together */}
      {maskedNonMediaTracks.some((track) => track.items.length > 0) && (
        <GroupMaskWrapper masks={getActiveMasks}>
          {maskedNonMediaTracks
            .filter((track) => track.items.length > 0)
            .map((track) => {
              const trackOrder = track.order ?? 0;
              return (
                <AbsoluteFill key={track.id} style={{ zIndex: 1001 + (maxOrder - trackOrder) }}>
                  {track.items.map((item) => (
                    <Sequence
                      key={item.id}
                      from={item.from}
                      durationInFrames={item.durationInFrames}
                    >
                      <Item item={item} muted={false} masks={[]} />
                    </Sequence>
                  ))}
                </AbsoluteFill>
              );
            })}
        </GroupMaskWrapper>
      )}
    </AbsoluteFill>
  );
};
