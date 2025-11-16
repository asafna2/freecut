import { create } from 'zustand';
import type { PlaybackState, PlaybackActions } from '../types';

// IMPORTANT: Always use granular selectors to prevent unnecessary re-renders!
//
// ✅ CORRECT: Use granular selectors
// const isPlaying = usePlaybackStore(s => s.isPlaying);
// const togglePlayPause = usePlaybackStore(s => s.togglePlayPause);
//
// ❌ WRONG: Don't destructure the entire store
// const { isPlaying, togglePlayPause } = usePlaybackStore();

export const usePlaybackStore = create<PlaybackState & PlaybackActions>((set) => ({
  // State
  currentFrame: 90, // Start at 3 seconds (30fps * 3) for visibility
  isPlaying: false,
  playbackRate: 1,
  loop: false,
  volume: 1,
  muted: false,

  // Actions
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  toggleLoop: () => set((state) => ({ loop: !state.loop })),
  setVolume: (volume) => set({ volume }),
  toggleMute: () => set((state) => ({ muted: !state.muted })),
}));
