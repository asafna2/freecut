import { create } from 'zustand';
import type { SelectionState, SelectionActions } from '../types';

// IMPORTANT: Always use granular selectors to prevent unnecessary re-renders!
//
// ✅ CORRECT: Use granular selectors
// const selectedItemIds = useSelectionStore(s => s.selectedItemIds);
// const selectItems = useSelectionStore(s => s.selectItems);
//
// ❌ WRONG: Don't destructure the entire store
// const { selectedItemIds, selectItems } = useSelectionStore();

export const useSelectionStore = create<SelectionState & SelectionActions>((set) => ({
  // State
  selectedItemIds: [],
  selectedTrackId: null,
  selectionType: null,
  dragState: null,

  // Actions
  selectItems: (ids) => set({
    selectedItemIds: ids,
    selectedTrackId: null,
    selectionType: ids.length > 0 ? 'item' : null,
  }),
  selectTrack: (id) => set({
    selectedTrackId: id,
    selectedItemIds: [],
    selectionType: id ? 'track' : null,
  }),
  clearSelection: () => set({
    selectedItemIds: [],
    selectedTrackId: null,
    selectionType: null,
  }),
  setDragState: (dragState) => set({ dragState }),
}));
