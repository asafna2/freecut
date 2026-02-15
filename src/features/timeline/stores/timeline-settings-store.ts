import { create } from 'zustand';

/**
 * Timeline settings state - FPS, scroll position, snap, dirty tracking.
 * These are UI/editor settings, not timeline content.
 */

interface TimelineSettingsState {
  fps: number;
  scrollPosition: number;
  snapEnabled: boolean;
  /** When true, gaps are auto-closed on delete, move, and trim operations */
  magneticMode: boolean;
  isDirty: boolean;
  /** True while loadTimeline() is in progress - used to coordinate initial player sync */
  isTimelineLoading: boolean;
}

interface TimelineSettingsActions {
  setFps: (fps: number) => void;
  setScrollPosition: (position: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
  toggleSnap: () => void;
  setMagneticMode: (enabled: boolean) => void;
  toggleMagneticMode: () => void;
  setIsDirty: (dirty: boolean) => void;
  markDirty: () => void;
  markClean: () => void;
  setTimelineLoading: (loading: boolean) => void;
}

export const useTimelineSettingsStore = create<TimelineSettingsState & TimelineSettingsActions>()(
  (set, get) => ({
    // State
    fps: 30,
    scrollPosition: 0,
    snapEnabled: true,
    magneticMode: false,
    isDirty: false,
    isTimelineLoading: true, // Start true - set false after loadTimeline completes

    // Actions
    setFps: (fps) => set({ fps }),
    setScrollPosition: (position) => set({ scrollPosition: position }),
    setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
    toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
    setMagneticMode: (enabled) => set({ magneticMode: enabled }),
    toggleMagneticMode: () => set((state) => ({ magneticMode: !state.magneticMode })),
    setIsDirty: (dirty) => set({ isDirty: dirty }),
    markDirty: () => { if (!get().isDirty) set({ isDirty: true }); },
    markClean: () => set({ isDirty: false }),
    setTimelineLoading: (loading) => set({ isTimelineLoading: loading }),
  })
);
