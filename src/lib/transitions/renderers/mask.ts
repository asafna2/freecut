/**
 * Mask Transition Renderers
 *
 * Includes: clockWipe, iris
 */

import type { TransitionRegistry, TransitionRenderer } from '../registry';
import type { TransitionStyleCalculation } from '../engine';
import type { TransitionDefinition } from '@/types/transition';

const ALL_TIMINGS = ['linear', 'spring', 'ease-in', 'ease-out', 'ease-in-out', 'cubic-bezier'] as const;

// ============================================================================
// Clock Wipe
// ============================================================================

const clockWipeRenderer: TransitionRenderer = {
  calculateStyles(progress, isOutgoing): TransitionStyleCalculation {
    const p = Math.max(0, Math.min(1, progress));
    if (isOutgoing) {
      const degrees = p * 360;
      const maskImage = `conic-gradient(from 0deg, transparent ${degrees}deg, black ${degrees}deg)`;
      return { maskImage, webkitMaskImage: maskImage, maskSize: '100% 100%', webkitMaskSize: '100% 100%' };
    }
    return {};
  },
  renderCanvas(ctx, leftCanvas, rightCanvas, progress, _dir, canvas) {
    const p = Math.max(0, Math.min(1, progress));
    const w = canvas?.width ?? leftCanvas.width;
    const h = canvas?.height ?? leftCanvas.height;
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.sqrt(w * w + h * h);
    const startAngle = -Math.PI / 2;
    const sweepAngle = p * Math.PI * 2;
    const currentAngle = startAngle + sweepAngle;

    ctx.drawImage(rightCanvas, 0, 0);
    ctx.save();
    const clipPath = new Path2D();
    clipPath.moveTo(centerX, centerY);
    clipPath.arc(centerX, centerY, radius, currentAngle, startAngle + Math.PI * 2, false);
    clipPath.closePath();
    ctx.clip(clipPath);
    ctx.drawImage(leftCanvas, 0, 0);
    ctx.restore();
  },
};

const clockWipeDef: TransitionDefinition = {
  id: 'clockWipe',
  label: 'Clock Wipe',
  description: 'Circular wipe like a clock hand',
  category: 'mask',
  icon: 'Clock',
  hasDirection: false,
  supportedTimings: [...ALL_TIMINGS],
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
};

// ============================================================================
// Iris
// ============================================================================

const irisRenderer: TransitionRenderer = {
  calculateStyles(progress, isOutgoing): TransitionStyleCalculation {
    const p = Math.max(0, Math.min(1, progress));
    if (isOutgoing) {
      const maxRadius = 120;
      const radius = p * maxRadius;
      const maskImage = `radial-gradient(circle, transparent ${radius}%, black ${radius}%)`;
      return { maskImage, webkitMaskImage: maskImage, maskSize: '100% 100%', webkitMaskSize: '100% 100%' };
    }
    return {};
  },
  renderCanvas(ctx, leftCanvas, rightCanvas, progress, _dir, canvas) {
    const p = Math.max(0, Math.min(1, progress));
    const w = canvas?.width ?? leftCanvas.width;
    const h = canvas?.height ?? leftCanvas.height;
    const maxRadius = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(h / 2, 2)) * 1.2;
    const radius = p * maxRadius;
    const centerX = w / 2;
    const centerY = h / 2;

    ctx.drawImage(rightCanvas, 0, 0);
    ctx.save();
    const clipPath = new Path2D();
    clipPath.rect(0, 0, w, h);
    clipPath.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip(clipPath, 'evenodd');
    ctx.drawImage(leftCanvas, 0, 0);
    ctx.restore();
  },
};

const irisDef: TransitionDefinition = {
  id: 'iris',
  label: 'Iris',
  description: 'Circular iris expanding/contracting',
  category: 'mask',
  icon: 'Circle',
  hasDirection: false,
  supportedTimings: [...ALL_TIMINGS],
  defaultDuration: 30,
  minDuration: 10,
  maxDuration: 90,
};

// ============================================================================
// Registration
// ============================================================================

export function registerMaskTransitions(registry: TransitionRegistry): void {
  registry.register('clockWipe', clockWipeDef, clockWipeRenderer);
  registry.register('iris', irisDef, irisRenderer);
}
