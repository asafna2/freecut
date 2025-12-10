import { create } from 'zustand';
import type { ItemKeyframes, AnimatableProperty, Keyframe, EasingType } from '@/types/keyframe';

/**
 * Keyframes state - animation keyframes for timeline items.
 * Keyframes reference items by itemId - orphaned keyframes should be cleaned up
 * when items are deleted (handled by timeline-actions).
 */

export interface KeyframesState {
  keyframes: ItemKeyframes[];
}

export interface KeyframesActions {
  // Bulk setter for snapshot restore
  setKeyframes: (keyframes: ItemKeyframes[]) => void;

  // Internal mutations (prefixed with _ to indicate called by command system)
  _addKeyframe: (itemId: string, property: AnimatableProperty, frame: number, value: number, easing?: EasingType) => string;
  _updateKeyframe: (itemId: string, property: AnimatableProperty, keyframeId: string, updates: Partial<Omit<Keyframe, 'id'>>) => void;
  _removeKeyframe: (itemId: string, property: AnimatableProperty, keyframeId: string) => void;
  _removeKeyframesForItem: (itemId: string) => void;
  _removeKeyframesForItems: (itemIds: string[]) => void;
  _removeKeyframesForProperty: (itemId: string, property: AnimatableProperty) => void;
  _scaleKeyframesForItem: (itemId: string, oldDuration: number, newDuration: number) => void;

  // Read-only helpers
  getKeyframesForItem: (itemId: string) => ItemKeyframes | undefined;
  hasKeyframesAtFrame: (itemId: string, property: AnimatableProperty, frame: number) => boolean;
}

export const useKeyframesStore = create<KeyframesState & KeyframesActions>()(
  (set, get) => ({
    // State
    keyframes: [],

    // Bulk setter
    setKeyframes: (keyframes) => set({ keyframes }),

    // Add keyframe
    _addKeyframe: (itemId, property, frame, value, easing = 'linear') => {
      const keyframeId = crypto.randomUUID();

      set((state) => {
        const existingItemKeyframes = state.keyframes.find((k) => k.itemId === itemId);

        if (existingItemKeyframes) {
          // Item already has keyframes
          const existingPropKeyframes = existingItemKeyframes.properties.find(
            (p) => p.property === property
          );

          if (existingPropKeyframes) {
            // Property already has keyframes - check for existing at this frame
            const existingAtFrame = existingPropKeyframes.keyframes.find((k) => k.frame === frame);
            if (existingAtFrame) {
              // Update existing keyframe value
              return {
                keyframes: state.keyframes.map((ik) =>
                  ik.itemId === itemId
                    ? {
                        ...ik,
                        properties: ik.properties.map((pk) =>
                          pk.property === property
                            ? {
                                ...pk,
                                keyframes: pk.keyframes.map((k) =>
                                  k.frame === frame ? { ...k, value, easing } : k
                                ),
                              }
                            : pk
                        ),
                      }
                    : ik
                ),
              };
            }

            // Add new keyframe to existing property
            return {
              keyframes: state.keyframes.map((ik) =>
                ik.itemId === itemId
                  ? {
                      ...ik,
                      properties: ik.properties.map((pk) =>
                        pk.property === property
                          ? {
                              ...pk,
                              keyframes: [...pk.keyframes, { id: keyframeId, frame, value, easing }]
                                .sort((a, b) => a.frame - b.frame),
                            }
                          : pk
                      ),
                    }
                  : ik
              ),
            };
          }

          // Add new property with first keyframe
          return {
            keyframes: state.keyframes.map((ik) =>
              ik.itemId === itemId
                ? {
                    ...ik,
                    properties: [
                      ...ik.properties,
                      { property, keyframes: [{ id: keyframeId, frame, value, easing }] },
                    ],
                  }
                : ik
            ),
          };
        }

        // Create new item keyframes entry
        return {
          keyframes: [
            ...state.keyframes,
            {
              itemId,
              properties: [{ property, keyframes: [{ id: keyframeId, frame, value, easing }] }],
            },
          ],
        };
      });

      return keyframeId;
    },

    // Update keyframe
    _updateKeyframe: (itemId, property, keyframeId, updates) =>
      set((state) => ({
        keyframes: state.keyframes.map((ik) =>
          ik.itemId === itemId
            ? {
                ...ik,
                properties: ik.properties.map((pk) =>
                  pk.property === property
                    ? {
                        ...pk,
                        keyframes: pk.keyframes
                          .map((k) => (k.id === keyframeId ? { ...k, ...updates } : k))
                          .sort((a, b) => a.frame - b.frame),
                      }
                    : pk
                ),
              }
            : ik
        ),
      })),

    // Remove keyframe
    _removeKeyframe: (itemId, property, keyframeId) =>
      set((state) => ({
        keyframes: state.keyframes.map((ik) =>
          ik.itemId === itemId
            ? {
                ...ik,
                properties: ik.properties.map((pk) =>
                  pk.property === property
                    ? {
                        ...pk,
                        keyframes: pk.keyframes.filter((k) => k.id !== keyframeId),
                      }
                    : pk
                ),
              }
            : ik
        ),
      })),

    // Remove all keyframes for an item
    _removeKeyframesForItem: (itemId) =>
      set((state) => ({
        keyframes: state.keyframes.filter((k) => k.itemId !== itemId),
      })),

    // Remove keyframes for multiple items (cascade delete)
    _removeKeyframesForItems: (itemIds) =>
      set((state) => {
        const idsSet = new Set(itemIds);
        return {
          keyframes: state.keyframes.filter((k) => !idsSet.has(k.itemId)),
        };
      }),

    // Remove keyframes for a specific property
    _removeKeyframesForProperty: (itemId, property) =>
      set((state) => ({
        keyframes: state.keyframes.map((ik) =>
          ik.itemId === itemId
            ? {
                ...ik,
                properties: ik.properties.filter((pk) => pk.property !== property),
              }
            : ik
        ),
      })),

    // Scale keyframes when item duration changes (rate stretch)
    // Scales frame positions proportionally: newFrame = oldFrame * (newDuration / oldDuration)
    // Handles edge cases:
    // - Clamps keyframes to valid range [0, newDuration - 1]
    // - Merges colliding keyframes (keeps the one with higher original frame)
    // - Preserves keyframe at frame 0
    _scaleKeyframesForItem: (itemId, oldDuration, newDuration) => {
      // Skip if no change or invalid values
      if (oldDuration === newDuration || oldDuration <= 0 || newDuration <= 0) return;

      const scaleFactor = newDuration / oldDuration;
      const maxFrame = newDuration - 1;

      set((state) => {
        const itemKeyframes = state.keyframes.find((k) => k.itemId === itemId);
        if (!itemKeyframes) return state;

        return {
          keyframes: state.keyframes.map((ik) => {
            if (ik.itemId !== itemId) return ik;

            return {
              ...ik,
              properties: ik.properties.map((pk) => {
                if (pk.keyframes.length === 0) return pk;

                // Scale each keyframe's frame position
                const scaledKeyframes = pk.keyframes.map((kf) => ({
                  ...kf,
                  // Scale and round, but clamp to valid range
                  frame: Math.min(maxFrame, Math.max(0, Math.round(kf.frame * scaleFactor))),
                }));

                // Handle collisions: when multiple keyframes land on the same frame,
                // keep the one that was originally later (higher original frame)
                // This preserves the "destination" value of an animation
                const frameMap = new Map<number, Keyframe>();
                for (const kf of scaledKeyframes) {
                  const existing = frameMap.get(kf.frame);
                  if (!existing) {
                    frameMap.set(kf.frame, kf);
                  } else {
                    // Find original frames to determine which was later
                    const existingOriginal = pk.keyframes.find((k) => k.id === existing.id);
                    const currentOriginal = pk.keyframes.find((k) => k.id === kf.id);
                    if (existingOriginal && currentOriginal && currentOriginal.frame > existingOriginal.frame) {
                      frameMap.set(kf.frame, kf);
                    }
                  }
                }

                // Convert back to sorted array
                const deduped = Array.from(frameMap.values()).sort((a, b) => a.frame - b.frame);

                return {
                  ...pk,
                  keyframes: deduped,
                };
              }),
            };
          }),
        };
      });
    },

    // Read-only: Get keyframes for an item
    getKeyframesForItem: (itemId) => {
      return get().keyframes.find((k) => k.itemId === itemId);
    },

    // Read-only: Check if keyframe exists at frame
    hasKeyframesAtFrame: (itemId, property, frame) => {
      const itemKeyframes = get().keyframes.find((k) => k.itemId === itemId);
      if (!itemKeyframes) return false;

      const propKeyframes = itemKeyframes.properties.find((p) => p.property === property);
      if (!propKeyframes) return false;

      return propKeyframes.keyframes.some((k) => k.frame === frame);
    },
  })
);
