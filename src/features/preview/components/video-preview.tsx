import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { useSelectionStore } from '@/features/editor/stores/selection-store';
import { useGizmoStore } from '@/features/preview/stores/gizmo-store';
import { MainComposition } from '@/lib/remotion/compositions/main-composition';
import { useRemotionPlayer } from '../hooks/use-remotion-player';
import { resolveMediaUrl, cleanupBlobUrls } from '../utils/media-resolver';
import { GizmoOverlay } from './gizmo-overlay';

interface VideoPreviewProps {
  project: {
    width: number;
    height: number;
    backgroundColor?: string;
  };
  containerSize: {
    width: number;
    height: number;
  };
}


/**
 * Video Preview Component
 *
 * Displays the Remotion Player with:
 * - Real-time video rendering
 * - Bidirectional sync with timeline
 * - Responsive sizing based on zoom and container
 * - Frame counter
 * - Fullscreen toggle
 */
export function VideoPreview({ project, containerSize }: VideoPreviewProps) {
  const playerRef = useRef<PlayerRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // State for gizmo overlay positioning
  const [playerContainerRect, setPlayerContainerRect] = useState<DOMRect | null>(null);

  // Granular selectors - avoid subscribing to currentFrame here to prevent re-renders
  const fps = useTimelineStore((s) => s.fps);
  const tracks = useTimelineStore((s) => s.tracks);
  const items = useTimelineStore((s) => s.items);
  const zoom = usePlaybackStore((s) => s.zoom);
  const canvasBackgroundPreview = useGizmoStore((s) => s.canvasBackgroundPreview);

  // Note: Preview transform is now read directly in TransformWrapper component
  // to avoid re-rendering the entire composition on every gizmo update

  // Remotion Player integration (hook handles bidirectional sync)
  const { isBuffering } = useRemotionPlayer(playerRef);

  // Cache for resolved blob URLs (mediaId -> blobUrl)
  const [resolvedUrls, setResolvedUrls] = useState<Map<string, string>>(new Map());
  const [isResolving, setIsResolving] = useState(false);

  // Combine tracks and items into TimelineTrack format
  // Sort in descending order so Track 1 (order: 0) renders last and appears on top
  const combinedTracks = useMemo(() => {
    return tracks
      .map((track) => ({
        ...track,
        items: items.filter((item) => item.trackId === track.id),
      }))
      .sort((a, b) => b.order - a.order);
  }, [tracks, items]);

  // Create resolved tracks by merging cached URLs with current items
  // This updates instantly when items change, without re-resolving media
  const resolvedTracks = useMemo(() => {
    return combinedTracks.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.mediaId && resolvedUrls.has(item.mediaId)) {
          const resolvedSrc = resolvedUrls.get(item.mediaId);
          return { ...item, src: resolvedSrc };
        }
        return item;
      }),
    }));
  }, [combinedTracks, resolvedUrls]);

  // Create a stable fingerprint for media resolution
  // Only changes when media-relevant properties change (not transform/position)
  const mediaFingerprint = useMemo(() => {
    return items
      .filter((item) => item.mediaId)
      .map((item) => item.mediaId!)
      .sort()
      .join('|');
  }, [items]);

  // Calculate total frames from items
  // Add buffer at the end for empty timeline space
  const totalFrames = useMemo(() => {
    if (items.length === 0) return 900; // Default 30s at 30fps
    const itemsEnd = Math.max(...items.map((item) => item.from + item.durationInFrames));
    // Add 5 seconds buffer at the end
    return itemsEnd + (fps * 5);
  }, [items, fps]);

  // Cleanup on mount to clear any stale blob URLs from previous sessions
  // Add small delay to allow garbage collection of old Blob objects
  useEffect(() => {
    cleanupBlobUrls();
    setResolvedUrls(new Map());

    // Small delay to allow GC to clear Blob references before creating new ones
    const cleanup = setTimeout(() => {
      // Trigger GC hint (if available in dev tools)
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
      }
    }, 100);

    return () => clearTimeout(cleanup);
  }, []);

  // Resolve media URLs when media fingerprint changes (not on transform changes)
  useEffect(() => {
    let isCancelled = false;

    async function resolve() {
      // Get unique mediaIds that need resolution
      const mediaIds = items
        .filter((item) => item.mediaId)
        .map((item) => item.mediaId!);
      const uniqueMediaIds = [...new Set(mediaIds)];

      if (uniqueMediaIds.length === 0) {
        setResolvedUrls(new Map());
        return;
      }

      // Check which mediaIds are not yet resolved
      const unresolved = uniqueMediaIds.filter((id) => !resolvedUrls.has(id));

      // Only show loading for initial load with unresolved media
      if (unresolved.length > 0 && resolvedUrls.size === 0) {
        setIsResolving(true);
        // Small delay before resolving to allow cleanup and GC
        await new Promise(r => setTimeout(r, 150));
      }

      if (isCancelled) return;

      try {
        // Resolve all media URLs (resolver has its own cache)
        const newUrls = new Map(resolvedUrls);
        await Promise.all(
          uniqueMediaIds.map(async (mediaId) => {
            if (!newUrls.has(mediaId)) {
              const url = await resolveMediaUrl(mediaId);
              if (url) {
                newUrls.set(mediaId, url);
              }
            }
          })
        );

        if (!isCancelled) {
          setResolvedUrls(newUrls);
        }
      } catch (error) {
        console.error('Failed to resolve media URLs:', error);
      } finally {
        if (!isCancelled) {
          setIsResolving(false);
        }
      }
    }

    resolve();

    return () => {
      isCancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Use mediaFingerprint for stability
  }, [mediaFingerprint]);

  // Cleanup blob URLs and clear state on unmount
  useEffect(() => {
    return () => {
      cleanupBlobUrls();
      setResolvedUrls(new Map());
    };
  }, []);

  // Memoize inputProps to prevent Player from re-rendering
  // Note: previewTransform is no longer passed here - TransformWrapper reads directly from store
  // Use preview color from gizmo store if actively picking, otherwise use project color
  const inputProps = useMemo(() => ({
    fps,
    tracks: resolvedTracks,
    backgroundColor: canvasBackgroundPreview ?? project.backgroundColor,
  }), [fps, resolvedTracks, canvasBackgroundPreview, project.backgroundColor]);

  // Calculate player size based on zoom mode
  const playerSize = useMemo(() => {
    const aspectRatio = project.width / project.height;

    // Auto-fit mode (zoom = -1)
    if (zoom === -1) {
      if (containerSize.width > 0 && containerSize.height > 0) {
        const containerAspectRatio = containerSize.width / containerSize.height;

        let width: number;
        let height: number;

        // Compare aspect ratios to determine limiting dimension
        if (containerAspectRatio > aspectRatio) {
          // Container is wider - height is the limiting factor
          height = containerSize.height;
          width = height * aspectRatio;
        } else {
          // Container is taller - width is the limiting factor
          width = containerSize.width;
          height = width / aspectRatio;
        }

        return { width, height };
      }
      // Fallback while measuring
      return { width: project.width, height: project.height };
    }

    // Specific zoom level - show at exact size, no constraining
    const targetWidth = project.width * zoom;
    const targetHeight = project.height * zoom;
    return { width: targetWidth, height: targetHeight };
  }, [project.width, project.height, zoom, containerSize]);

  // Check if overflow is needed (video larger than container)
  const needsOverflow = useMemo(() => {
    if (zoom === -1) return false; // Auto-fit never needs overflow
    if (containerSize.width === 0 || containerSize.height === 0) return false;
    return playerSize.width > containerSize.width || playerSize.height > containerSize.height;
  }, [zoom, playerSize, containerSize]);

  // Track player container rect for gizmo positioning
  useEffect(() => {
    const container = playerContainerRef.current;
    if (!container) return;

    const updateRect = () => {
      setPlayerContainerRect(container.getBoundingClientRect());
    };

    // Initial measurement
    updateRect();

    // Update on resize
    const resizeObserver = new ResizeObserver(updateRect);
    resizeObserver.observe(container);

    // Update on scroll (container rect changes position)
    window.addEventListener('scroll', updateRect, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [playerSize]); // Re-run when player size changes

  // Handle click on background area to deselect items
  const backgroundRef = useRef<HTMLDivElement>(null);
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking directly on the background containers (not on player/gizmo)
    if (e.target === backgroundRef.current || e.target === e.currentTarget) {
      useSelectionStore.getState().clearItemSelection();
    }
  }, []);

  return (
    <div
      ref={backgroundRef}
      className="w-full h-full bg-gradient-to-br from-background to-secondary/20 relative"
      style={{ overflow: needsOverflow ? 'auto' : 'hidden' }}
      onClick={handleBackgroundClick}
    >
      <div
        className="min-w-full min-h-full grid place-items-center p-6"
        onClick={handleBackgroundClick}
      >
        {/* Wrapper for player + gizmo overlay - gizmo must be outside overflow-hidden */}
        <div className="relative">
          {/* Player container with overflow-hidden for video content */}
          <div
            ref={(el) => {
              // Assign both refs
              (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              (playerContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            }}
            className="relative overflow-hidden shadow-2xl"
            style={{
              width: `${playerSize.width}px`,
              height: `${playerSize.height}px`,
              transition: 'none',
              // Use outline instead of border to avoid affecting content area
              outline: '2px solid hsl(var(--border))',
              outlineOffset: 0,
            }}
            onDoubleClick={(e) => e.preventDefault()}
          >
            {isResolving && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-20">
                <p className="text-white text-sm">Loading media...</p>
              </div>
            )}

            {/* Buffering indicator - shows when Remotion is buffering video data */}
            {isBuffering && !isResolving && (
              <div className="absolute top-2 left-2 z-20 flex items-center gap-2 bg-black/70 px-2 py-1 rounded">
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="text-white text-xs">Buffering...</span>
              </div>
            )}

            <Player
              ref={playerRef}
              component={MainComposition}
              inputProps={inputProps}
              durationInFrames={totalFrames}
              compositionWidth={project.width}
              compositionHeight={project.height}
              bufferStateDelayInMilliseconds={300}
              acknowledgeRemotionLicense={true}
              fps={fps}
              style={{
                width: '100%',
                height: '100%',
              }}
              controls={false}
              loop={false}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              moveToBeginningWhenEnded={false}
              showPosterWhenPaused={false}
              showPosterWhenEnded={false}
              showPosterWhenUnplayed={false}
              errorFallback={({ error }) => (
                <div className="flex items-center justify-center h-full bg-red-500/10">
                  <p className="text-red-500">Player Error: {error.message}</p>
                </div>
              )}
            />
          </div>

          {/* Transform gizmo overlay - positioned over player but outside overflow-hidden */}
          <GizmoOverlay
            containerRect={playerContainerRect}
            playerSize={playerSize}
            projectSize={{ width: project.width, height: project.height }}
            zoom={zoom}
          />
        </div>
      </div>
    </div>
  );
}
