import { create } from 'zustand';

export interface SourcePlayerMethods {
  toggle: () => void;
  seek: (frame: number) => void;
  frameBack: (frames: number) => void;
  frameForward: (frames: number) => void;
  getDurationInFrames: () => number;
}

interface SourcePlayerState {
  hoveredPanel: 'source' | null;
  playerMethods: SourcePlayerMethods | null;
  setHoveredPanel: (panel: 'source' | null) => void;
  setPlayerMethods: (methods: SourcePlayerMethods | null) => void;
}

export const useSourcePlayerStore = create<SourcePlayerState>((set) => ({
  hoveredPanel: null,
  playerMethods: null,
  setHoveredPanel: (panel) => set({ hoveredPanel: panel }),
  setPlayerMethods: (methods) => set({ playerMethods: methods }),
}));
