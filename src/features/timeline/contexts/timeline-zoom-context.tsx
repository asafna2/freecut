/**
 * Timeline Zoom Context
 *
 * Centralizes zoom state for the timeline subtree to prevent
 * multiple independent store subscriptions from causing parallel re-renders.
 *
 * Instead of each component subscribing to the zoom store independently,
 * this context provides a single subscription point. All consumers update
 * in a single batched render cycle.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useZoomStore } from '../stores/zoom-store';
import { useTimelineStore } from '../stores/timeline-store';

interface TimelineZoomContextValue {
  /** Current zoom level */
  zoomLevel: number;
  /** Pixels per second at current zoom */
  pixelsPerSecond: number;
  /** Convert time in seconds to pixels */
  timeToPixels: (timeInSeconds: number) => number;
  /** Convert pixels to time in seconds */
  pixelsToTime: (pixels: number) => number;
  /** Convert frame number to pixels */
  frameToPixels: (frame: number) => number;
  /** Convert pixels to frame number */
  pixelsToFrame: (pixels: number) => number;
  /** FPS from timeline settings */
  fps: number;
}

const TimelineZoomContext = createContext<TimelineZoomContextValue | null>(null);

interface TimelineZoomProviderProps {
  children: ReactNode;
}

/**
 * Provider that wraps timeline components and provides zoom values.
 * Single subscription point prevents multiple independent store subscriptions.
 */
export function TimelineZoomProvider({ children }: TimelineZoomProviderProps) {
  // Single subscription to zoom store
  const zoomLevel = useZoomStore((s) => s.level);
  const fps = useTimelineStore((s) => s.fps);
  const pixelsPerSecond = zoomLevel * 100;

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo<TimelineZoomContextValue>(() => ({
    zoomLevel,
    pixelsPerSecond,
    fps,
    timeToPixels: (timeInSeconds: number) => timeInSeconds * pixelsPerSecond,
    pixelsToTime: (pixels: number) => pixelsPerSecond > 0 ? pixels / pixelsPerSecond : 0,
    frameToPixels: (frame: number) => (frame / fps) * pixelsPerSecond,
    pixelsToFrame: (pixels: number) => Math.round((pixels / pixelsPerSecond) * fps),
  }), [zoomLevel, pixelsPerSecond, fps]);

  return (
    <TimelineZoomContext.Provider value={value}>
      {children}
    </TimelineZoomContext.Provider>
  );
}

/**
 * Hook to consume timeline zoom context.
 * Must be used within TimelineZoomProvider.
 */
export function useTimelineZoomContext(): TimelineZoomContextValue {
  const context = useContext(TimelineZoomContext);
  if (!context) {
    throw new Error('useTimelineZoomContext must be used within TimelineZoomProvider');
  }
  return context;
}

/**
 * Optional hook that returns null if outside provider (for components that may be used outside timeline)
 */
export function useTimelineZoomContextOptional(): TimelineZoomContextValue | null {
  return useContext(TimelineZoomContext);
}
