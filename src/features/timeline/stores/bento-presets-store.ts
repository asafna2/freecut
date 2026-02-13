import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CustomBentoPreset {
  id: string;
  name: string;
  cols: number;
  rows: number;
  gap: number;
  padding: number;
}

interface BentoPresetsState {
  customPresets: CustomBentoPreset[];
  addPreset: (preset: Omit<CustomBentoPreset, 'id'>) => void;
  removePreset: (id: string) => void;
}

export const useBentoPresetsStore = create<BentoPresetsState>()(
  persist(
    (set) => ({
      customPresets: [],

      addPreset: (preset) =>
        set((state) => ({
          customPresets: [
            ...state.customPresets,
            { ...preset, id: crypto.randomUUID() },
          ],
        })),

      removePreset: (id) =>
        set((state) => ({
          customPresets: state.customPresets.filter((p) => p.id !== id),
        })),
    }),
    {
      name: 'freecut-bento-presets',
    }
  )
);
