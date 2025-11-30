import { create } from 'zustand';

export interface ZoomState {
  level: number;
  pixelsPerSecond: number;
}

export interface ZoomActions {
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: (containerWidth: number, contentDurationSeconds: number) => void;
}

// IMPORTANT: Always use granular selectors to prevent unnecessary re-renders!
//
// ✅ CORRECT: Use granular selectors
// const zoomLevel = useZoomStore(s => s.level);
// const zoomIn = useZoomStore(s => s.zoomIn);
//
// ❌ WRONG: Don't destructure the entire store
// const { level, zoomIn } = useZoomStore();

// Throttle zoom updates to reduce re-render frequency during rapid zoom
// Set to 50ms to match typical render time - prevents queueing renders faster than they complete
const ZOOM_THROTTLE_MS = 50;
let lastZoomUpdate = 0;
let pendingZoomLevel: number | null = null;
let zoomThrottleTimeout: ReturnType<typeof setTimeout> | null = null;

export const useZoomStore = create<ZoomState & ZoomActions>((set) => ({
  level: 1,
  pixelsPerSecond: 100,

  setZoomLevel: (level) => {
    const now = performance.now();
    pendingZoomLevel = level;

    // If enough time has passed, update immediately
    if (now - lastZoomUpdate >= ZOOM_THROTTLE_MS) {
      lastZoomUpdate = now;
      set({ level, pixelsPerSecond: level * 100 });
      pendingZoomLevel = null;
      return;
    }

    // Otherwise, schedule update for next throttle window
    if (!zoomThrottleTimeout) {
      zoomThrottleTimeout = setTimeout(() => {
        zoomThrottleTimeout = null;
        if (pendingZoomLevel !== null) {
          lastZoomUpdate = performance.now();
          set({ level: pendingZoomLevel, pixelsPerSecond: pendingZoomLevel * 100 });
          pendingZoomLevel = null;
        }
      }, ZOOM_THROTTLE_MS - (now - lastZoomUpdate));
    }
  },
  zoomIn: () =>
    set((state) => {
      const newLevel = Math.min(state.level * 1.2, 50); // Increased from 10 to 50 for finer detail
      return { level: newLevel, pixelsPerSecond: newLevel * 100 };
    }),
  zoomOut: () =>
    set((state) => {
      const newLevel = Math.max(state.level / 1.2, 0.01);
      return { level: newLevel, pixelsPerSecond: newLevel * 100 };
    }),
  zoomToFit: (containerWidth, contentDurationSeconds) => {
    // Calculate zoom level needed to fit content in viewport
    // pixelsPerSecond = zoomLevel * 100
    // contentWidth = contentDuration * pixelsPerSecond = contentDuration * zoomLevel * 100
    // We want: contentWidth = containerWidth (with some padding)
    // So: zoomLevel = containerWidth / (contentDuration * 100)
    const padding = 50; // Leave some padding on the right
    const targetWidth = containerWidth - padding;
    const duration = Math.max(10, contentDurationSeconds); // Minimum 10 seconds
    const newLevel = Math.max(0.01, Math.min(2, targetWidth / (duration * 100)));
    set({ level: newLevel, pixelsPerSecond: newLevel * 100 });
  },
}));
