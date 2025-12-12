import { create } from 'zustand';

interface DebugState {
  /** Show debug overlay on video clips */
  showVideoDebugOverlay: boolean;
  setShowVideoDebugOverlay: (show: boolean) => void;
  toggleVideoDebugOverlay: () => void;
}

/**
 * Debug store for development-only settings
 * In production, all values are false/no-op for tree-shaking
 */
export const useDebugStore = import.meta.env.DEV
  ? create<DebugState>((set) => ({
      showVideoDebugOverlay: false,
      setShowVideoDebugOverlay: (show) => set({ showVideoDebugOverlay: show }),
      toggleVideoDebugOverlay: () => set((s) => ({ showVideoDebugOverlay: !s.showVideoDebugOverlay })),
    }))
  : create<DebugState>(() => ({
      showVideoDebugOverlay: false,
      setShowVideoDebugOverlay: () => {},
      toggleVideoDebugOverlay: () => {},
    }));
