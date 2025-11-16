import { create } from 'zustand';
import { temporal } from 'zundo';
import type { TimelineState, TimelineActions } from '../types';

// IMPORTANT: Always use granular selectors to prevent unnecessary re-renders!
//
// ✅ CORRECT: Use granular selectors
// const currentFrame = useTimelineStore(s => s.currentFrame);
// const setCurrentFrame = useTimelineStore(s => s.setCurrentFrame);
//
// ❌ WRONG: Don't destructure the entire store
// const { currentFrame, setCurrentFrame } = useTimelineStore();
//
// UNDO/REDO: This store is wrapped with Zundo's temporal middleware
// Access undo/redo functionality:
// const undo = useTimelineStore.temporal.getState().undo;
// const redo = useTimelineStore.temporal.getState().redo;
// const canUndo = useTimelineStore((state) => state.pastStates.length > 0);

export const useTimelineStore = create<TimelineState & TimelineActions>()(
  temporal((set) => ({
  // State
  tracks: [],
  items: [],
  fps: 30,
  scrollPosition: 0,
  snapEnabled: true,

  // Actions
  setTracks: (tracks) => set({ tracks }),
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  updateItem: (id, updates) => set((state) => ({
    items: state.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
  })),
  removeItems: (ids) => set((state) => ({
    items: state.items.filter((i) => !ids.includes(i.id)),
  })),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  }))
);
