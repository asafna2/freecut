/**
 * Client Render Engine
 *
 * Contains the `createCompositionRenderer` factory that builds the per-frame
 * renderer with full support for effects, masks, transitions, and keyframe
 * animations.
 *
 * The top-level render orchestration functions (`renderComposition`,
 * `renderAudioOnly`, `renderSingleFrame`) have been extracted to
 * `canvas-render-orchestrator.ts`.  They are re-exported here so that
 * existing import sites continue to work unchanged.
 *
 * Per-item rendering helpers (video, image, text, shape, transitions) live
 * in `canvas-item-renderer.ts`.
 */

import type { CompositionInputProps } from '@/types/export';
import type {
  TimelineItem,
  VideoItem,
  ImageItem,
  ShapeItem,
  AdjustmentItem,
} from '@/types/timeline';
import { createLogger } from '@/lib/logger';

// Import subsystems
import { getAnimatedTransform, buildKeyframesMap } from './canvas-keyframes';
import {
  applyAllEffects,
  getAdjustmentLayerEffects,
  combineEffects,
  type AdjustmentLayerWithTrackOrder,
} from './canvas-effects';
import {
  applyMasks,
  buildMaskFrameIndex,
  getActiveMasksForFrame,
  type MaskCanvasSettings,
} from './canvas-masks';
import {
  createTransitionFrameIndex,
  getTransitionFrameState,
  buildClipMap,
  type ActiveTransition,
} from './canvas-transitions';
import { type CachedGifFrames } from '../../timeline/services/gif-frame-cache';
import { gifFrameCache } from '../../timeline/services/gif-frame-cache';
import { isGifUrl } from '@/utils/media-utils';
import { CanvasPool, TextMeasurementCache } from './canvas-pool';
import { VideoFrameExtractor } from './canvas-video-extractor';

// Item renderer
import {
  renderItem,
  renderTransitionToCanvas,
  type CanvasSettings,
  type WorkerLoadedImage,
  type ItemRenderContext,
} from './canvas-item-renderer';

// Re-export orchestration functions so existing import sites keep working
export { renderComposition, renderAudioOnly, renderSingleFrame } from './canvas-render-orchestrator';

const log = createLogger('ClientRenderEngine');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if an image item is an animated GIF
 */
function isAnimatedGif(item: ImageItem): boolean {
  return isGifUrl(item.src) || item.label.toLowerCase().endsWith('.gif');
}

// ---------------------------------------------------------------------------
// createCompositionRenderer
// ---------------------------------------------------------------------------

/**
 * Creates a composition renderer that can render frames to a canvas
 * with full support for effects, masks, transitions, and keyframe animations.
 */
export async function createCompositionRenderer(
  composition: CompositionInputProps,
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
) {
  const {
    fps,
    tracks = [],
    transitions = [],
    backgroundColor = '#000000',
    keyframes = [],
  } = composition;
  const hasDom = typeof document !== 'undefined';

  const canvasSettings: CanvasSettings = {
    width: canvas.width,
    height: canvas.height,
    fps,
  };

  // === PERFORMANCE OPTIMIZATION: Canvas Pool ===
  // Pre-allocate reusable canvases instead of creating new ones per frame
  // Initial size: 10 (1 content + ~5 items + 2 effects + 2 transitions)
  const canvasPool = new CanvasPool(canvas.width, canvas.height, 10, 20);

  // === PERFORMANCE OPTIMIZATION: Text Measurement Cache ===
  const textMeasureCache = new TextMeasurementCache();

  // Build lookup maps
  const keyframesMap = buildKeyframesMap(keyframes);

  // === PERFORMANCE OPTIMIZATION: Use mediabunny for video decoding ===
  // VideoFrameExtractor provides precise frame access without seek delays
  const videoExtractors = new Map<string, VideoFrameExtractor>();
  // Keep video elements as fallback if mediabunny fails
  const videoElements = new Map<string, HTMLVideoElement>();

  for (const track of tracks) {
    for (const item of track.items ?? []) {
      if (item.type === 'video') {
        const videoItem = item as VideoItem;
        if (videoItem.src) {
          log.debug('Creating VideoFrameExtractor', {
            itemId: item.id,
            src: videoItem.src.substring(0, 80),
          });

          // Create mediabunny extractor (primary)
          const extractor = new VideoFrameExtractor(videoItem.src, item.id);
          videoExtractors.set(item.id, extractor);

          // Also create fallback video element in case mediabunny fails (main thread only).
          if (hasDom) {
            const video = document.createElement('video');
            video.src = videoItem.src;
            video.muted = true;
            video.preload = 'auto';
            video.crossOrigin = 'anonymous';
            videoElements.set(item.id, video);
          }
        }
      }
    }
  }

  // Pre-load image elements
  const imageElements = new Map<string, WorkerLoadedImage>();
  const imageLoadPromises: Promise<void>[] = [];

  // Track GIF items for animated frame extraction
  const gifItems: ImageItem[] = [];
  const gifFramesMap = new Map<string, CachedGifFrames>();

  for (const track of tracks) {
    for (const item of track.items ?? []) {
      if (item.type === 'image' && (item as ImageItem).src) {
        const imageItem = item as ImageItem;

        // Check if this is an animated GIF
        if (isAnimatedGif(imageItem)) {
          gifItems.push(imageItem);
          // Still load as regular image for fallback
        }

        if (hasDom && typeof Image !== 'undefined') {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const loadPromise = new Promise<void>((resolve, reject) => {
            img.onload = () => {
              imageElements.set(item.id, {
                source: img,
                width: img.naturalWidth,
                height: img.naturalHeight,
              });
              resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load image: ${imageItem.src}`));
          });
          img.src = imageItem.src;
          imageLoadPromises.push(loadPromise);
        } else {
          const loadPromise = (async () => {
            if (typeof createImageBitmap !== 'function') {
              throw new Error('WORKER_REQUIRES_MAIN_THREAD:imagebitmap');
            }
            const response = await fetch(imageItem.src);
            if (!response.ok) {
              throw new Error(`Failed to load image: ${imageItem.src}`);
            }
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            imageElements.set(item.id, {
              source: bitmap,
              width: bitmap.width,
              height: bitmap.height,
            });
          })();
          imageLoadPromises.push(loadPromise);
        }
      }
    }
  }

  // Collect adjustment layers
  const adjustmentLayers: AdjustmentLayerWithTrackOrder[] = [];
  for (const track of tracks) {
    for (const item of track.items) {
      if (item.type === 'adjustment') {
        adjustmentLayers.push({
          layer: item as AdjustmentItem,
          trackOrder: track.order ?? 0,
        });
      }
    }
  }

  // Build clip map for transitions
  const allClips: TimelineItem[] = [];
  for (const track of tracks) {
    for (const item of track.items) {
      if (item.type === 'video' || item.type === 'image') {
        allClips.push(item);
      }
    }
  }
  const clipMap = buildClipMap(allClips);

  // Precompute frame-invariant render metadata.
  const sortedTracks = [...tracks].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
  const tracksTopToBottom = [...sortedTracks].reverse();
  const trackOrderMap = new Map<string, number>();
  for (const track of tracks) {
    trackOrderMap.set(track.id, track.order ?? 0);
  }

  const transitionFrameIndex = createTransitionFrameIndex(transitions, clipMap);
  const transitionTrackOrderById = new Map<string, number>();
  for (const window of transitionFrameIndex.windows) {
    const transitionTrackId = window.transition.trackId;
    const trackOrder = transitionTrackId
      ? (trackOrderMap.get(transitionTrackId) ?? 0)
      : 0;
    transitionTrackOrderById.set(window.transition.id, trackOrder);
  }

  const maskSettings: MaskCanvasSettings = canvasSettings;
  const maskFrameIndex = buildMaskFrameIndex(tracks, maskSettings);

  // Track which videos successfully use mediabunny (for render decisions)
  const useMediabunny = new Set<string>();
  // Track persistent mediabunny failures and disable extractor after repeated errors.
  const mediabunnyFailureCountByItem = new Map<string, number>();
  const mediabunnyDisabledItems = new Set<string>();

  // Build the shared ItemRenderContext used by canvas-item-renderer functions
  const itemRenderContext: ItemRenderContext = {
    fps,
    canvasSettings,
    canvasPool,
    textMeasureCache,
    videoExtractors,
    videoElements,
    useMediabunny,
    mediabunnyDisabledItems,
    mediabunnyFailureCountByItem,
    imageElements,
    gifFramesMap,
    keyframesMap,
    adjustmentLayers,
  };

  return {
    async preload() {
      log.debug('Preloading media', {
        videoCount: videoExtractors.size,
        imageCount: imageElements.size,
      });

      // Wait for images
      await Promise.all(imageLoadPromises);

      if (!hasDom && gifItems.length > 0) {
        throw new Error('WORKER_REQUIRES_MAIN_THREAD:gif');
      }

      // === Initialize mediabunny video extractors (primary method) ===
      const extractorInitPromises = Array.from(videoExtractors.entries()).map(
        async ([itemId, extractor]) => {
          const success = await extractor.init();
          if (success) {
            useMediabunny.add(itemId);
            log.info('Using mediabunny for video', { itemId: itemId.substring(0, 8) });
          } else {
            log.warn('Falling back to HTML5 video', { itemId: itemId.substring(0, 8) });
          }
        }
      );

      await Promise.all(extractorInitPromises);

      log.info('Video initialization complete', {
        mediabunny: useMediabunny.size,
        fallback: videoExtractors.size - useMediabunny.size,
      });

      // === Handle items that failed mediabunny extraction ===
      const fallbackVideoIds = Array.from(videoExtractors.keys()).filter(id => !useMediabunny.has(id));

      if (!hasDom && fallbackVideoIds.length > 0) {
        throw new Error('WORKER_REQUIRES_MAIN_THREAD:video-fallback');
      }

      if (fallbackVideoIds.length > 0) {
        const videoLoadPromises = fallbackVideoIds.map(
          (itemId) => {
            const video = videoElements.get(itemId)!;
            return new Promise<void>((resolve) => {
              const timeout = setTimeout(() => {
                log.warn('Video load timeout', { itemId });
                resolve();
              }, 10000);

              if (video.readyState >= 2) {
                clearTimeout(timeout);
                resolve();
              } else {
                video.addEventListener('loadeddata', () => {
                  clearTimeout(timeout);
                  resolve();
                }, { once: true });
                video.addEventListener('error', () => {
                  clearTimeout(timeout);
                  log.error('Video load error', { itemId });
                  resolve();
                }, { once: true });
                video.load();
              }
            });
          }
        );

        await Promise.all(videoLoadPromises);
      }

      // Load GIF frames for animated GIFs (main thread only)
      if (hasDom && gifItems.length > 0) {
        log.debug('Preloading GIF frames', { gifCount: gifItems.length });

        const gifLoadPromises = gifItems.map(async (gifItem) => {
          try {
            // Use mediaId if available, otherwise use item id
            const mediaId = gifItem.mediaId ?? gifItem.id;
            const cachedFrames = await gifFrameCache.getGifFrames(mediaId, gifItem.src);
            gifFramesMap.set(gifItem.id, cachedFrames);
            log.debug('GIF frames loaded', {
              itemId: gifItem.id.substring(0, 8),
              frameCount: cachedFrames.frames.length,
              totalDuration: cachedFrames.totalDuration,
            });
          } catch (err) {
            log.error('Failed to load GIF frames', { itemId: gifItem.id, error: err });
            // GIF will fallback to static image rendering
          }
        });

        await Promise.all(gifLoadPromises);
        log.debug('All GIF frames loaded', { loadedCount: gifFramesMap.size });
      }

      log.debug('All media loaded');
    },

    async renderFrame(frame: number) {
      // Clear canvas
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Prepare masks for this frame
      const activeMasks = getActiveMasksForFrame(maskFrameIndex, frame);

      // Find active transitions
      const { activeTransitions, transitionClipIds } = getTransitionFrameState(
        transitionFrameIndex,
        frame,
        fps
      );

      // Debug: Log transition state at key frames (only in development)
      if (import.meta.env.DEV && activeTransitions.length > 0 && (frame === activeTransitions[0]?.transitionStart || frame % 30 === 0)) {
        log.info(`TRANSITION STATE: frame=${frame} activeTransitions=${activeTransitions.length} skippedClipIds=${Array.from(transitionClipIds).map(id => id.substring(0,8)).join(',')}`);
      }

      // Log periodically (only in development)
      if (import.meta.env.DEV && frame % 30 === 0) {
        log.debug('Rendering frame', {
          frame,
          tracksCount: sortedTracks.length,
          activeMasks: activeMasks.length,
          activeTransitions: activeTransitions.length,
        });
      }

      // === PERFORMANCE: Use pooled canvas instead of creating new one each frame ===
      const { canvas: contentCanvas, ctx: contentCtx } = canvasPool.acquire();


      // Helper function to render a single item with effects
      const renderItemWithEffects = async (
        item: TimelineItem,
        trackOrder: number
      ) => {
        // Get animated transform
        const itemKeyframes = keyframesMap.get(item.id);
        const transform = getAnimatedTransform(item, itemKeyframes, frame, canvasSettings);

        // Get effects (item effects + adjustment layer effects)
        const adjEffects = getAdjustmentLayerEffects(
          trackOrder,
          adjustmentLayers,
          frame
        );
        const combinedEffects = combineEffects(item.effects, adjEffects);

        // === PERFORMANCE: Use pooled canvas instead of creating new one ===
        const { canvas: itemCanvas, ctx: itemCtx } = canvasPool.acquire();

        // Render based on item type
        await renderItem(
          itemCtx,
          item,
          transform,
          frame,
          itemRenderContext
        );

        // Debug: check if itemCanvas has content (only in development, expensive operation)
        if (import.meta.env.DEV && frame === 0) {
          const imageData = itemCtx.getImageData(0, 0, 100, 100);
          const hasContent = imageData.data.some((v, i) => i % 4 !== 3 && v > 0);
          const hasAlpha = imageData.data.some((v, i) => i % 4 === 3 && v > 0);
          log.info(`ITEM CANVAS CHECK: hasContent=${hasContent} hasAlpha=${hasAlpha} itemType=${item.type}`);
        }

        // Apply effects
        if (combinedEffects.length > 0) {
          const { canvas: effectCanvas, ctx: effectCtx } = canvasPool.acquire();
          applyAllEffects(effectCtx, itemCanvas, combinedEffects, frame, canvasSettings);
          contentCtx.drawImage(effectCanvas, 0, 0);
          canvasPool.release(effectCanvas);
        } else {
          contentCtx.drawImage(itemCanvas, 0, 0);
        }

        // Release item canvas back to pool
        canvasPool.release(itemCanvas);
      };

      // Helper to check if item should be rendered
      const shouldRenderItem = (item: TimelineItem): boolean => {
        // Skip items not visible at this frame
        if (frame < item.from || frame >= item.from + item.durationInFrames) {
          return false;
        }
        // Skip items being handled by transitions
        if (transitionClipIds.has(item.id)) {
          // Debug log only in development
          if (import.meta.env.DEV && frame === activeTransitions[0]?.transitionStart) {
            log.info(`SKIPPING clip ${item.id.substring(0,8)} - handled by transition`);
          }
          return false;
        }
        // Skip audio items (handled separately)
        if (item.type === 'audio') return false;
        // Skip adjustment items (they apply effects, not render content)
        if (item.type === 'adjustment') return false;
        // Skip mask shapes (handled by mask system)
        if (item.type === 'shape' && (item as ShapeItem).isMask) return false;
        return true;
      };
      // Group transitions by their track order
      const transitionsByTrackOrder = new Map<number, ActiveTransition[]>();
      for (const activeTransition of activeTransitions) {
        const trackOrder = transitionTrackOrderById.get(activeTransition.transition.id) ?? 0;

        if (!transitionsByTrackOrder.has(trackOrder)) {
          transitionsByTrackOrder.set(trackOrder, []);
        }
        transitionsByTrackOrder.get(trackOrder)!.push(activeTransition);
      }

      // === OCCLUSION CULLING OPTIMIZATION ===
      // Find the topmost (lowest order) track with a fully occluding item.
      // Skip rendering all tracks below it (higher order) since they'll be fully covered.
      //
      // An item is fully occluding if:
      // - Covers entire canvas (after transform/keyframes)
      // - Opacity = 1 (after keyframe animation)
      // - No rotation (or 0/180 that still covers)
      // - No corner radius
      // - Is video/image (opaque content)
      // - Not in a transition
      // - No transparency effects
      // - No active masks (masks could reveal content below)

      const isFullyOccluding = (item: TimelineItem, trackOrder: number): boolean => {
        // Only videos and images can be fully opaque
        if (item.type !== 'video' && item.type !== 'image') return false;

        // Items in transitions are blended, not fully occluding
        if (transitionClipIds.has(item.id)) return false;

        // Get animated transform at current frame
        const itemKeyframes = keyframesMap.get(item.id);
        const transform = getAnimatedTransform(item, itemKeyframes, frame, canvasSettings);

        // Check opacity (must be 1.0)
        if (transform.opacity < 1) return false;

        // Check rotation (only 0 or 180 can fully cover without exposing corners)
        const rotation = transform.rotation % 360;
        if (rotation !== 0 && rotation !== 180 && rotation !== -180) return false;

        // Check corner radius (rounded corners expose content)
        if (transform.cornerRadius > 0) return false;

        // Check if item covers entire canvas
        const itemLeft = canvas.width / 2 + transform.x - transform.width / 2;
        const itemTop = canvas.height / 2 + transform.y - transform.height / 2;
        const itemRight = itemLeft + transform.width;
        const itemBottom = itemTop + transform.height;

        // Must cover entire canvas (with small tolerance for floating point)
        const tolerance = 1;
        if (itemLeft > tolerance || itemTop > tolerance) return false;
        if (itemRight < canvas.width - tolerance || itemBottom < canvas.height - tolerance) return false;

        // Check for effects that might add transparency
        const itemEffects = item.effects ?? [];
        const adjEffects = getAdjustmentLayerEffects(trackOrder, adjustmentLayers, frame);
        const allEffects = [...itemEffects, ...adjEffects];

        for (const effectWrapper of allEffects) {
          if (!effectWrapper.enabled) continue;
          const effect = effectWrapper.effect;
          // Effects that could add transparency
          if (effect.type === 'glitch' ||
              effect.type === 'canvas-effect' ||
              ('opacity' in effect && typeof effect.opacity === 'number' && effect.opacity < 1)) {
            return false;
          }
        }

        return true;
      };

      // Find occlusion cutoff – the lowest track order with a fully occluding item
      // If masks are active, disable occlusion culling (masks could reveal content)
      let occlusionCutoffOrder: number | null = null;

      if (activeMasks.length === 0) {
        // Scan tracks from top to bottom (lowest order first) to find first occluding item
        for (const track of tracksTopToBottom) {
          if (track.visible === false) continue;
          const trackOrder = track.order ?? 0;

          for (const item of track.items ?? []) {
            if (!shouldRenderItem(item)) continue;

            if (isFullyOccluding(item, trackOrder)) {
              occlusionCutoffOrder = trackOrder;
              if (import.meta.env.DEV && frame % 30 === 0) {
                log.debug(`Occlusion culling: item ${item.id.substring(0, 8)} on track order ${trackOrder} fully occludes canvas`);
              }
              break;
            }
          }

          if (occlusionCutoffOrder !== null) break;
        }
      }

      // Render tracks in order (bottom to top), with transitions at their track position
      // Track order: higher values render first (behind), lower values render last (on top)
      let skippedTracks = 0;

      for (const track of sortedTracks) {
        if (track.visible === false) continue;
        const trackOrder = track.order ?? 0;

        // OCCLUSION CULLING: Skip tracks that are fully occluded by higher tracks
        if (occlusionCutoffOrder !== null && trackOrder > occlusionCutoffOrder) {
          skippedTracks++;
          continue;
        }

        // Render all items on this track (respecting track order as primary)
        for (const item of track.items ?? []) {
          if (!shouldRenderItem(item)) continue;
          await renderItemWithEffects(item, trackOrder);
        }

        // Render transitions that belong to this track (after the track's items)
        const trackTransitions = transitionsByTrackOrder.get(trackOrder);
        if (trackTransitions) {
          for (const activeTransition of trackTransitions) {
            await renderTransitionToCanvas(
              contentCtx,
              activeTransition,
              frame,
              itemRenderContext,
              trackOrder
            );

            // Debug: Check content after transition (only in development - expensive getImageData)
            if (import.meta.env.DEV && frame === activeTransition.transitionStart) {
              const afterData = contentCtx.getImageData(Math.floor(canvas.width/2), Math.floor(canvas.height/2), 1, 1).data;
              log.info(`TRANSITION RENDERED: frame=${frame} trackOrder=${trackOrder} progress=${activeTransition.progress.toFixed(3)} centerPixel=(${afterData[0]},${afterData[1]},${afterData[2]},${afterData[3]})`);
            }
          }
        }
      }

      // Log occlusion culling stats periodically (only in development)
      if (import.meta.env.DEV && skippedTracks > 0 && frame % 30 === 0) {
        log.debug(`Occlusion culling: skipped ${skippedTracks} tracks at frame ${frame}`);
      }

      // Apply masks to content
      if (activeMasks.length > 0) {
        applyMasks(ctx, contentCanvas, activeMasks, maskSettings);
      } else {
        ctx.drawImage(contentCanvas, 0, 0);
      }

      // Release content canvas back to pool
      canvasPool.release(contentCanvas);

      // Debug: Check final output during transitions (only in development - expensive getImageData)
      if (import.meta.env.DEV && activeTransitions.length > 0 && frame === activeTransitions[0]?.transitionStart) {
        const finalData = ctx.getImageData(Math.floor(canvas.width/2), Math.floor(canvas.height/2), 1, 1).data;
        log.info(`FINAL OUTPUT CHECK: frame=${frame} alpha=${finalData[3]} RGB=(${finalData[0]},${finalData[1]},${finalData[2]})`);
      }
    },

    dispose() {
      // Clean up mediabunny video extractors
      for (const extractor of videoExtractors.values()) {
        extractor.dispose();
      }
      videoExtractors.clear();
      useMediabunny.clear();
      mediabunnyFailureCountByItem.clear();
      mediabunnyDisabledItems.clear();

      // Clean up fallback video elements
      for (const video of videoElements.values()) {
        video.pause();
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
      }
      videoElements.clear();
      for (const image of imageElements.values()) {
        if ('close' in image.source && typeof image.source.close === 'function') {
          image.source.close();
        }
      }
      imageElements.clear();
      gifFramesMap.clear(); // Clear GIF frame references (actual frames are managed by gifFrameCache)

      // === PERFORMANCE: Clean up optimization resources ===
      canvasPool.dispose();
      textMeasureCache.clear();

      // Log pool stats in development
      if (import.meta.env.DEV) {
        log.debug('Canvas pool disposed', canvasPool.getStats());
      }
    },
  };
}
