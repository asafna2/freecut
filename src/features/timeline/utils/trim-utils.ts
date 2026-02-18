import type { TimelineItem } from '@/types/timeline';
import {
  getSourceProperties,
  getMaxTimelineDuration as calcMaxDuration,
  getMaxStartExtension,
  isMediaItem,
  timelineToSourceFrames,
} from './source-calculations';

export type TrimHandle = 'start' | 'end';

interface TrimClampResult {
  clampedAmount: number;
  maxExtend: number | null;
}

/**
 * Calculate the clamped trim amount respecting source boundaries.
 *
 * For media items (video/audio), trimming is constrained by:
 * - Start handle: can't extend past source start (0)
 * - End handle: can't extend past source end (sourceDuration)
 * - Both: can't shrink below 1 frame duration
 *
 * Speed is accounted for: timeline frames = source frames / speed
 *
 * @param item - The timeline item being trimmed
 * @param handle - Which handle is being dragged ('start' or 'end')
 * @param trimAmount - The requested trim amount in timeline frames
 *                     Positive = shrink for start, extend for end
 *                     Negative = extend for start, shrink for end
 * @returns The clamped trim amount and max extend value (if applicable)
 */
export function clampTrimAmount(
  item: TimelineItem,
  handle: TrimHandle,
  trimAmount: number,
  timelineFps: number = 30
): TrimClampResult {
  let clampedAmount = trimAmount;
  let maxExtend: number | null = null;

  if (isMediaItem(item)) {
    const { sourceStart, sourceDuration, sourceFps, speed } = getSourceProperties(item);
    const effectiveSourceFps = sourceFps ?? timelineFps;

    if (handle === 'start') {
      // Start handle: negative trimAmount = extending left
      if (trimAmount < 0) {
        maxExtend = getMaxStartExtension(sourceStart, speed, effectiveSourceFps, timelineFps);
        if (-trimAmount > maxExtend) {
          clampedAmount = -maxExtend;
        }
      }
    } else {
      // End handle: positive trimAmount = extending right
      // Always use sourceDuration - trimming should always be reversible
      // (user can extend back to full source regardless of rate stretch state)
      if (sourceDuration !== undefined) {
        const maxDuration = calcMaxDuration(sourceDuration, sourceStart, speed, effectiveSourceFps, timelineFps);
        maxExtend = maxDuration - item.durationInFrames;

        if (item.durationInFrames + trimAmount > maxDuration) {
          clampedAmount = maxDuration - item.durationInFrames;
        }
      }
    }
  }

  // Clamp to minimum duration of 1 frame (applies to all items)
  clampedAmount = clampToMinDuration(item.durationInFrames, handle, clampedAmount);

  return { clampedAmount, maxExtend };
}

/**
 * Clamp trim amount to ensure minimum duration of 1 frame.
 */
function clampToMinDuration(
  currentDuration: number,
  handle: TrimHandle,
  trimAmount: number
): number {
  if (handle === 'start') {
    // Start: positive trim shrinks, negative extends
    const newDuration = currentDuration - trimAmount;
    if (newDuration <= 0) {
      return currentDuration - 1;
    }
  } else {
    // End: positive trim extends, negative shrinks
    const newDuration = currentDuration + trimAmount;
    if (newDuration <= 0) {
      return -currentDuration + 1;
    }
  }
  return trimAmount;
}

/**
 * Calculate new source boundaries after a trim operation.
 */
interface TrimSourceUpdate {
  sourceStart?: number;
  sourceEnd?: number;
}

export function calculateTrimSourceUpdate(
  item: TimelineItem,
  handle: TrimHandle,
  clampedAmount: number,
  newDuration: number,
  timelineFps: number = 30
): TrimSourceUpdate | null {
  if (!isMediaItem(item)) return null;

  const { sourceStart, sourceDuration, sourceFps, speed } = getSourceProperties(item);
  const effectiveSourceFps = sourceFps ?? timelineFps;

  if (handle === 'start') {
    // Trimming start: update sourceStart
    const sourceFramesDelta = timelineToSourceFrames(clampedAmount, speed, timelineFps, effectiveSourceFps);
    return {
      sourceStart: sourceStart + sourceFramesDelta,
    };
  } else {
    // Trimming end: update sourceEnd.
    // For clips with explicit sourceEnd, update by delta to avoid
    // cumulative one-frame loss from duration-based recomputation.
    const sourceFramesDelta = timelineToSourceFrames(clampedAmount, speed, timelineFps, effectiveSourceFps);
    const explicitSourceEnd = item.sourceEnd;
    const recomputedSourceEnd = sourceStart + timelineToSourceFrames(newDuration, speed, timelineFps, effectiveSourceFps);
    const newSourceEnd = explicitSourceEnd !== undefined
      ? explicitSourceEnd + sourceFramesDelta
      : recomputedSourceEnd;

    // Keep at least 1 source frame and clamp to media bounds.
    const minSourceEnd = sourceStart + 1;
    const boundedByMin = Math.max(minSourceEnd, newSourceEnd);
    const clampedSourceEnd = sourceDuration !== undefined
      ? Math.min(boundedByMin, sourceDuration)
      : boundedByMin;
    return {
      sourceEnd: clampedSourceEnd,
    };
  }
}
