/**
 * Basic Transition Renderers
 *
 * Includes: fade, none (cut)
 */

import type { TransitionRegistry, TransitionRenderer } from '../registry';
import type { TransitionStyleCalculation } from '../engine';
import type { TransitionDefinition } from '@/types/transition';

// ============================================================================
// Fade
// ============================================================================

function calculateFadeOpacity(progress: number, isOutgoing: boolean): number {
  if (isOutgoing) {
    return Math.cos((progress * Math.PI) / 2);
  }
  return Math.sin((progress * Math.PI) / 2);
}

const fadeRenderer: TransitionRenderer = {
  calculateStyles(progress, isOutgoing): TransitionStyleCalculation {
    const p = Math.max(0, Math.min(1, progress));
    return { opacity: calculateFadeOpacity(p, isOutgoing) };
  },
  renderCanvas(ctx, leftCanvas, rightCanvas, progress) {
    const p = Math.max(0, Math.min(1, progress));
    ctx.save();
    ctx.globalAlpha = calculateFadeOpacity(p, false);
    ctx.drawImage(rightCanvas, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = calculateFadeOpacity(p, true);
    ctx.drawImage(leftCanvas, 0, 0);
    ctx.restore();
  },
};

const fadeDef: TransitionDefinition = {
  id: 'fade',
  label: 'Fade',
  description: 'Simple crossfade between clips',
  category: 'basic',
  icon: 'Blend',
  hasDirection: false,
  supportedTimings: ['linear', 'spring', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier'],
  defaultDuration: 30,
  minDuration: 5,
  maxDuration: 90,
};

// ============================================================================
// None (Cut)
// ============================================================================

const noneRenderer: TransitionRenderer = {
  calculateStyles(progress, isOutgoing): TransitionStyleCalculation {
    const midpoint = 0.5;
    return {
      opacity: isOutgoing
        ? progress < midpoint ? 1 : 0
        : progress >= midpoint ? 1 : 0,
    };
  },
  renderCanvas(ctx, leftCanvas, rightCanvas, progress) {
    if (progress < 0.5) {
      ctx.drawImage(leftCanvas, 0, 0);
    } else {
      ctx.drawImage(rightCanvas, 0, 0);
    }
  },
};

const noneDef: TransitionDefinition = {
  id: 'none',
  label: 'Cut',
  description: 'Instant cut with no effect',
  category: 'basic',
  icon: 'Scissors',
  hasDirection: false,
  supportedTimings: ['linear'],
  defaultDuration: 30,
  minDuration: 2,
  maxDuration: 90,
};

// ============================================================================
// Registration
// ============================================================================

export function registerBasicTransitions(registry: TransitionRegistry): void {
  registry.register('fade', fadeDef, fadeRenderer);
  registry.register('none', noneDef, noneRenderer);
}
