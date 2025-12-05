import React, { useMemo } from 'react';
import { useCurrentFrame } from 'remotion';
import type { AdjustmentItem } from '@/types/timeline';
import type { ItemEffect, GlitchEffect } from '@/types/effects';
import { effectsToCSSFilter, getGlitchEffects } from '@/features/effects/utils/effect-to-css';
import { getScanlinesStyle, getGlitchFilterString } from '@/features/effects/utils/glitch-algorithms';
import { useGizmoStore } from '@/features/preview/stores/gizmo-store';

/** Adjustment layer with its track order for scope calculation */
export interface AdjustmentLayerWithTrackOrder {
  layer: AdjustmentItem;
  trackOrder: number;
}

export interface ItemEffectWrapperProps {
  /** The item's track order (used to determine if effects should apply) */
  itemTrackOrder: number;
  /** All adjustment layers (from visible tracks) */
  adjustmentLayers: AdjustmentLayerWithTrackOrder[];
  /** Children to render */
  children: React.ReactNode;
}

/** Internal props including frame for memoization */
interface ItemEffectWrapperInternalProps extends ItemEffectWrapperProps {
  frame: number;
}

/**
 * Per-item effect wrapper that applies adjustment layer effects based on track order.
 *
 * An item is affected by an adjustment layer if:
 * - The item's track order > the adjustment layer's track order
 *   (higher track order = lower zIndex = visually BEHIND the adjustment)
 *
 * This component replaces the container-level AdjustmentWrapper approach,
 * allowing all items to stay in the same DOM location while effects are
 * applied conditionally per-item. This prevents DOM restructuring when
 * adjustment layers are added/removed.
 *
 * Memoized to prevent unnecessary re-renders. Frame is passed as prop
 * from FrameAwareItemEffectWrapper to isolate per-frame updates.
 */
const ItemEffectWrapperInternal = React.memo<ItemEffectWrapperInternalProps>(({
  itemTrackOrder,
  adjustmentLayers,
  children,
  frame,
}) => {
  // Read effects preview from gizmo store for real-time slider updates
  const effectsPreview = useGizmoStore((s) => s.effectsPreview);

  // Find adjustment layers that affect this item (adjustment trackOrder < item trackOrder)
  // AND are active at the current frame
  const activeEffects = useMemo((): ItemEffect[] => {
    if (adjustmentLayers.length === 0) return [];

    // Filter to layers that:
    // 1. Are visually ABOVE this item (adjustment trackOrder < item trackOrder)
    // 2. Are active at current frame
    const affectingLayers = adjustmentLayers.filter(({ layer, trackOrder }) => {
      // Item must be BEHIND the adjustment (higher track order = lower zIndex)
      if (itemTrackOrder <= trackOrder) return false;
      // Adjustment must be active at current frame
      return frame >= layer.from && frame < layer.from + layer.durationInFrames;
    });

    if (affectingLayers.length === 0) return [];

    // Sort by track order (lowest first = applied first) and collect effects
    return [...affectingLayers]
      .sort((a, b) => a.trackOrder - b.trackOrder)
      .flatMap(({ layer }) => {
        // Use preview effects if available, otherwise use actual effects
        const effects = effectsPreview?.[layer.id] ?? layer.effects ?? [];
        return effects.filter(e => e.enabled);
      });
  }, [adjustmentLayers, itemTrackOrder, frame, effectsPreview]);

  // Build CSS filter string from CSS filter effects
  const cssFilterString = useMemo(() => {
    if (activeEffects.length === 0) return '';
    return effectsToCSSFilter(activeEffects);
  }, [activeEffects]);

  // Get glitch effects for special rendering
  const glitchEffects = useMemo(() => {
    if (activeEffects.length === 0) return [];
    return getGlitchEffects(activeEffects) as Array<GlitchEffect & { id: string }>;
  }, [activeEffects]);

  // Calculate glitch-based filters (color glitch adds hue-rotate, RGB split via SVG)
  const glitchFilterString = useMemo(() => {
    if (glitchEffects.length === 0) return '';
    return getGlitchFilterString(glitchEffects, frame);
  }, [glitchEffects, frame]);

  // Combine all CSS filters
  const combinedFilter = [cssFilterString, glitchFilterString].filter(Boolean).join(' ');

  // Check for scanlines effect (needs overlay div, not just CSS filter)
  const scanlinesEffect = glitchEffects.find((e) => e.variant === 'scanlines');

  // No effects - render children directly (no wrapper div to minimize DOM)
  // IMPORTANT: Always render the same div structure to prevent DOM changes
  // when effects activate/deactivate. Use empty filter instead of conditional wrapper.
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        filter: combinedFilter || undefined,
      }}
    >
      {children}
      {/* Scanlines overlay - only rendered when effect is active */}
      {scanlinesEffect && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            ...getScanlinesStyle(scanlinesEffect.intensity),
          }}
        />
      )}
    </div>
  );
});

/**
 * Frame-aware wrapper for ItemEffectWrapper.
 * Isolates useCurrentFrame() to this component so that parent components
 * don't re-render on every frame. Only this component and its children
 * will re-render per frame.
 */
export const ItemEffectWrapper: React.FC<ItemEffectWrapperProps> = (props) => {
  const frame = useCurrentFrame();
  return <ItemEffectWrapperInternal {...props} frame={frame} />;
};

/**
 * Hook to check if an item should have adjustment effects applied.
 * Useful for conditional logic without rendering the wrapper.
 */
export function useIsAffectedByAdjustment(
  itemTrackOrder: number,
  adjustmentLayers: AdjustmentLayerWithTrackOrder[]
): boolean {
  // An item is affected if there's any adjustment layer with lower track order
  return adjustmentLayers.some(({ trackOrder }) => itemTrackOrder > trackOrder);
}
