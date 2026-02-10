/**
 * Frame Prefetch System
 *
 * Intelligent prefetching based on playhead position and timeline state.
 * Keeps frames ahead of playback warm in cache.
 */

import type { DecodedVideoFrame, PrefetchConfig, FrameRequest } from './types';
import type { FrameCache } from './frame-cache';
import type { ManagedMediaSource } from './media-source-manager';

/**
 * Prefetch priority levels
 */
export type PrefetchPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

/**
 * Priority values for sorting
 */
const PRIORITY_VALUES: Record<PrefetchPriority, number> = {
  critical: 100,
  high: 75,
  normal: 50,
  low: 25,
  background: 10,
};

/**
 * Prefetch request
 */
export interface PrefetchRequest {
  /** Source ID */
  sourceId: string;
  /** Frame number to prefetch */
  frameNumber: number;
  /** Priority level */
  priority: PrefetchPriority;
  /** Request timestamp */
  requestedAt: number;
  /** Optional callback when complete */
  onComplete?: (frame: DecodedVideoFrame | null) => void;
}

/**
 * Prefetch statistics
 */
interface PrefetchStats {
  /** Total requests made */
  totalRequests: number;
  /** Completed requests */
  completedRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Requests in progress */
  inProgress: number;
  /** Requests in queue */
  queued: number;
  /** Average fetch time in ms */
  averageFetchTimeMs: number;
}

/**
 * Prefetcher configuration
 */
interface PrefetcherConfig {
  /** Maximum concurrent fetches */
  maxConcurrent?: number;
  /** Default frames ahead to prefetch */
  defaultAheadFrames?: number;
  /** Default frames behind to keep */
  defaultBehindFrames?: number;
  /** Request timeout in ms */
  requestTimeoutMs?: number;
  /** Enable adaptive prefetch based on system load */
  adaptivePrefetch?: boolean;
}

/**
 * Source registration info
 */
interface SourceInfo {
  source: ManagedMediaSource;
  frameRate: number;
  totalFrames: number;
}

/**
 * Frame prefetcher
 */
export class FramePrefetcher {
  private readonly config: Required<PrefetcherConfig>;
  private readonly queue: PrefetchRequest[] = [];
  private readonly inProgress: Map<string, PrefetchRequest> = new Map();
  private readonly sources: Map<string, SourceInfo> = new Map();
  private frameCache: FrameCache | null = null;

  private isRunning = false;
  private currentPlayhead: Map<string, number> = new Map(); // sourceId -> frameNumber
  private playbackDirection: Map<string, 1 | -1> = new Map(); // 1 = forward, -1 = reverse

  // Statistics
  private stats = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalFetchTimeMs: 0,
  };

  constructor(config: PrefetcherConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 4,
      defaultAheadFrames: config.defaultAheadFrames ?? 30,
      defaultBehindFrames: config.defaultBehindFrames ?? 5,
      requestTimeoutMs: config.requestTimeoutMs ?? 5000,
      adaptivePrefetch: config.adaptivePrefetch ?? true,
    };
  }

  /**
   * Set the frame cache to use
   */
  setFrameCache(cache: FrameCache): void {
    this.frameCache = cache;
  }

  /**
   * Register a media source for prefetching
   */
  registerSource(source: ManagedMediaSource): void {
    const probeResult = source.probeResult;

    if (!probeResult?.video) {
      return;
    }

    const frameRate = probeResult.video.frameRate;
    const totalFrames = probeResult.video.frameCount ??
      Math.ceil(probeResult.durationMs * frameRate / 1000);

    this.sources.set(source.id, {
      source,
      frameRate,
      totalFrames,
    });

    this.currentPlayhead.set(source.id, 0);
    this.playbackDirection.set(source.id, 1);
  }

  /**
   * Unregister a media source
   */
  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId);
    this.currentPlayhead.delete(sourceId);
    this.playbackDirection.delete(sourceId);

    // Cancel pending requests for this source
    this.cancelSourceRequests(sourceId);
  }

  /**
   * Update playhead position
   */
  updatePlayhead(sourceId: string, frameNumber: number): void {
    const previousFrame = this.currentPlayhead.get(sourceId) ?? 0;
    this.currentPlayhead.set(sourceId, frameNumber);

    // Detect playback direction
    if (frameNumber > previousFrame) {
      this.playbackDirection.set(sourceId, 1);
    } else if (frameNumber < previousFrame) {
      this.playbackDirection.set(sourceId, -1);
    }

    // Trigger prefetch for new position
    if (this.isRunning) {
      this.schedulePrefetch(sourceId, frameNumber);
    }
  }

  /**
   * Update playhead from timestamp
   */
  updatePlayheadFromTimestamp(sourceId: string, timestampMs: number): void {
    const info = this.sources.get(sourceId);
    if (!info) {
      return;
    }

    const frameNumber = Math.floor(timestampMs * info.frameRate / 1000);
    this.updatePlayhead(sourceId, frameNumber);
  }

  /**
   * Request a specific frame with priority
   */
  requestFrame(
    sourceId: string,
    frameNumber: number,
    priority: PrefetchPriority = 'normal',
    onComplete?: (frame: DecodedVideoFrame | null) => void
  ): void {
    // Check if already cached
    if (this.frameCache?.hasFrame(sourceId, frameNumber)) {
      if (onComplete) {
        const frame = this.frameCache.getFrame(sourceId, frameNumber);
        onComplete(frame);
      }
      return;
    }

    // Check if already in progress
    const key = this.makeRequestKey(sourceId, frameNumber);
    if (this.inProgress.has(key)) {
      // Upgrade priority if needed
      const existing = this.inProgress.get(key)!;
      if (PRIORITY_VALUES[priority] > PRIORITY_VALUES[existing.priority]) {
        existing.priority = priority;
      }
      return;
    }

    // Check if already queued
    const existingIndex = this.queue.findIndex(
      (r) => r.sourceId === sourceId && r.frameNumber === frameNumber
    );

    if (existingIndex !== -1) {
      // Upgrade priority if needed
      const existing = this.queue[existingIndex];
      if (PRIORITY_VALUES[priority] > PRIORITY_VALUES[existing.priority]) {
        existing.priority = priority;
        this.sortQueue();
      }
      return;
    }

    // Add to queue
    const request: PrefetchRequest = {
      sourceId,
      frameNumber,
      priority,
      requestedAt: Date.now(),
      onComplete,
    };

    this.queue.push(request);
    this.stats.totalRequests++;
    this.sortQueue();

    // Process queue
    this.processQueue();
  }

  /**
   * Request multiple frames
   */
  requestFrames(requests: FrameRequest[]): void {
    for (const req of requests) {
      const frameNumber = typeof req.frame === 'number'
        ? req.frame
        : this.timestampToFrame(req.sourceId, req.frame.timestampMs);

      if (frameNumber !== null) {
        this.requestFrame(
          req.sourceId,
          frameNumber,
          this.priorityFromNumber(req.priority)
        );
      }
    }
  }

  /**
   * Start prefetching
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Schedule initial prefetch for all sources
    for (const [sourceId] of this.sources) {
      const playhead = this.currentPlayhead.get(sourceId) ?? 0;
      this.schedulePrefetch(sourceId, playhead);
    }

    this.processQueue();
  }

  /**
   * Stop prefetching
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Clear all pending requests
   */
  clearQueue(): void {
    this.queue.length = 0;
  }

  /**
   * Get prefetch statistics
   */
  getStats(): PrefetchStats {
    const avgTime = this.stats.completedRequests > 0
      ? this.stats.totalFetchTimeMs / this.stats.completedRequests
      : 0;

    return {
      totalRequests: this.stats.totalRequests,
      completedRequests: this.stats.completedRequests,
      failedRequests: this.stats.failedRequests,
      inProgress: this.inProgress.size,
      queued: this.queue.length,
      averageFetchTimeMs: avgTime,
    };
  }

  /**
   * Get default prefetch config
   */
  getDefaultConfig(): PrefetchConfig {
    return {
      aheadFrames: this.config.defaultAheadFrames,
      behindFrames: this.config.defaultBehindFrames,
      maxConcurrent: this.config.maxConcurrent,
      priority: PRIORITY_VALUES.normal,
    };
  }

  /**
   * Schedule prefetch around playhead
   */
  private schedulePrefetch(sourceId: string, playhead: number): void {
    const info = this.sources.get(sourceId);
    if (!info) {
      return;
    }

    const direction = this.playbackDirection.get(sourceId) ?? 1;
    const aheadFrames = this.getAheadFrames();
    const behindFrames = this.config.defaultBehindFrames;

    // Calculate frame range
    let startFrame: number;
    let endFrame: number;

    if (direction === 1) {
      // Forward playback
      startFrame = Math.max(0, playhead - behindFrames);
      endFrame = Math.min(info.totalFrames - 1, playhead + aheadFrames);
    } else {
      // Reverse playback
      startFrame = Math.max(0, playhead - aheadFrames);
      endFrame = Math.min(info.totalFrames - 1, playhead + behindFrames);
    }

    // Request frames with decreasing priority based on distance
    for (let frame = startFrame; frame <= endFrame; frame++) {
      const distance = Math.abs(frame - playhead);
      const priority = this.distanceToPriority(distance);

      this.requestFrame(sourceId, frame, priority);
    }
  }

  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    while (
      this.isRunning &&
      this.queue.length > 0 &&
      this.inProgress.size < this.config.maxConcurrent
    ) {
      const request = this.queue.shift();
      if (!request) {
        break;
      }

      const key = this.makeRequestKey(request.sourceId, request.frameNumber);
      this.inProgress.set(key, request);

      this.fetchFrame(request)
        .then((frame) => {
          this.inProgress.delete(key);
          this.stats.completedRequests++;

          if (request.onComplete) {
            request.onComplete(frame);
          }

          // Continue processing
          if (this.isRunning) {
            this.processQueue();
          }
        })
        .catch(() => {
          this.inProgress.delete(key);
          this.stats.failedRequests++;

          // Continue processing
          if (this.isRunning) {
            this.processQueue();
          }
        });
    }
  }

  /**
   * Fetch a single frame
   */
  private async fetchFrame(request: PrefetchRequest): Promise<DecodedVideoFrame | null> {
    const startTime = Date.now();
    const info = this.sources.get(request.sourceId);

    if (!info) {
      return null;
    }

    try {
      const frame = await Promise.race([
        info.source.getVideoFrameByNumber(request.frameNumber),
        this.timeout(this.config.requestTimeoutMs),
      ]);

      const elapsed = Date.now() - startTime;
      this.stats.totalFetchTimeMs += elapsed;

      return frame;
    } catch {
      return null;
    }
  }

  /**
   * Create timeout promise
   */
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), ms);
    });
  }

  /**
   * Cancel requests for a source
   */
  private cancelSourceRequests(sourceId: string): void {
    // Remove from queue
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].sourceId === sourceId) {
        this.queue.splice(i, 1);
      }
    }

    // Note: in-progress requests will complete but callbacks won't be called
    // since source is unregistered
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Higher priority first
      const priorityDiff = PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      // Earlier requests first (FIFO within priority)
      return a.requestedAt - b.requestedAt;
    });
  }

  /**
   * Generate request key
   */
  private makeRequestKey(sourceId: string, frameNumber: number): string {
    return `${sourceId}:${frameNumber}`;
  }

  /**
   * Convert timestamp to frame number
   */
  private timestampToFrame(sourceId: string, timestampMs: number): number | null {
    const info = this.sources.get(sourceId);
    if (!info) {
      return null;
    }

    return Math.floor(timestampMs * info.frameRate / 1000);
  }

  /**
   * Convert numeric priority to level
   */
  private priorityFromNumber(priority: number): PrefetchPriority {
    if (priority >= 90) return 'critical';
    if (priority >= 70) return 'high';
    if (priority >= 40) return 'normal';
    if (priority >= 20) return 'low';
    return 'background';
  }

  /**
   * Convert distance to priority
   */
  private distanceToPriority(distance: number): PrefetchPriority {
    if (distance === 0) return 'critical';
    if (distance <= 3) return 'high';
    if (distance <= 10) return 'normal';
    if (distance <= 20) return 'low';
    return 'background';
  }

  /**
   * Get adaptive ahead frames based on system load
   */
  private getAheadFrames(): number {
    if (!this.config.adaptivePrefetch) {
      return this.config.defaultAheadFrames;
    }

    // Reduce prefetch if many requests are in progress
    const load = this.inProgress.size / this.config.maxConcurrent;

    if (load > 0.8) {
      return Math.floor(this.config.defaultAheadFrames * 0.5);
    }
    if (load > 0.5) {
      return Math.floor(this.config.defaultAheadFrames * 0.75);
    }

    return this.config.defaultAheadFrames;
  }
}

/**
 * Create a frame prefetcher
 */
export function createPrefetcher(config?: PrefetcherConfig): FramePrefetcher {
  return new FramePrefetcher(config);
}
