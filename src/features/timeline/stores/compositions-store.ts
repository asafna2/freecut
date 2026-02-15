import { create } from 'zustand';
import type { TimelineItem, TimelineTrack } from '@/types/timeline';
import type { Transition } from '@/types/transition';
import type { ItemKeyframes } from '@/types/keyframe';

/**
 * Sub-composition data — a self-contained mini-timeline stored independently.
 * Multiple CompositionItem instances can reference the same compositionId,
 * enabling reuse of pre-comp contents across the project.
 */
export interface SubComposition {
  id: string;
  name: string;
  items: TimelineItem[];
  tracks: TimelineTrack[];
  transitions: Transition[];
  keyframes: ItemKeyframes[];
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  backgroundColor?: string;
}

interface CompositionsState {
  compositions: SubComposition[];
}

interface CompositionsActions {
  addComposition: (composition: SubComposition) => void;
  updateComposition: (id: string, updates: Partial<Omit<SubComposition, 'id'>>) => void;
  removeComposition: (id: string) => void;
  getComposition: (id: string) => SubComposition | undefined;
  setCompositions: (compositions: SubComposition[]) => void;
}

export const useCompositionsStore = create<CompositionsState & CompositionsActions>()(
  (set, get) => ({
    compositions: [],

    addComposition: (composition) =>
      set((state) => ({
        compositions: [...state.compositions, composition],
      })),

    updateComposition: (id, updates) =>
      set((state) => ({
        compositions: state.compositions.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      })),

    removeComposition: (id) =>
      set((state) => ({
        compositions: state.compositions.filter((c) => c.id !== id),
      })),

    getComposition: (id) => get().compositions.find((c) => c.id === id),

    setCompositions: (compositions) => set({ compositions }),
  })
);
