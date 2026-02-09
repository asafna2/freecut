import type { ExportMode } from '@/types/export';

export type ExportExecutionEngine = 'worker' | 'main-thread';

export interface ExportTelemetryEvent {
  timestamp: number;
  success: boolean;
  cancelled: boolean;
  durationMs: number;
  engine: ExportExecutionEngine;
  fallbackReason: string | null;
  exportMode: ExportMode;
  container: string;
  codec: string;
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
}

export interface ExportTelemetrySummary {
  total: number;
  workerCount: number;
  mainThreadCount: number;
  workerAvgMs: number | null;
  mainThreadAvgMs: number | null;
  estimatedSpeedup: number | null;
}

const STORAGE_KEY = 'freecut.export.telemetry.v1';
const MAX_EVENTS = 200;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParseEvents(raw: string | null): ExportTelemetryEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ExportTelemetryEvent[];
  } catch {
    return [];
  }
}

export function readExportTelemetry(): ExportTelemetryEvent[] {
  if (!canUseStorage()) return [];
  return safeParseEvents(window.localStorage.getItem(STORAGE_KEY));
}

export function appendExportTelemetry(event: ExportTelemetryEvent): void {
  if (!canUseStorage()) return;
  const events = readExportTelemetry();
  events.push(event);
  const trimmed = events.slice(-MAX_EVENTS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function summarizeExportTelemetry(
  events: ExportTelemetryEvent[]
): ExportTelemetrySummary {
  const successful = events.filter((e) => e.success && !e.cancelled);
  const workerEvents = successful.filter((e) => e.engine === 'worker');
  const mainThreadEvents = successful.filter((e) => e.engine === 'main-thread');

  const avg = (values: number[]): number | null => {
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  };

  const workerAvgMs = avg(workerEvents.map((e) => e.durationMs));
  const mainThreadAvgMs = avg(mainThreadEvents.map((e) => e.durationMs));

  let estimatedSpeedup: number | null = null;
  if (workerAvgMs && mainThreadAvgMs && workerAvgMs > 0) {
    estimatedSpeedup = Number((mainThreadAvgMs / workerAvgMs).toFixed(2));
  }

  return {
    total: successful.length,
    workerCount: workerEvents.length,
    mainThreadCount: mainThreadEvents.length,
    workerAvgMs,
    mainThreadAvgMs,
    estimatedSpeedup,
  };
}

export function mapFallbackReasonToUi(reason: string | null): string | null {
  if (!reason) return null;

  if (reason.startsWith('WORKER_REQUIRES_MAIN_THREAD:gif')) {
    return 'Animated GIF rendering currently runs on main thread';
  }
  if (reason.startsWith('WORKER_REQUIRES_MAIN_THREAD:video-fallback')) {
    return 'Video fallback decode path requires main thread';
  }
  if (reason.startsWith('WORKER_REQUIRES_MAIN_THREAD:imagebitmap')) {
    return 'This browser worker cannot decode images via ImageBitmap';
  }
  if (reason.startsWith('WORKER_UNAVAILABLE')) {
    return 'Worker API unavailable in this environment';
  }
  if (reason.startsWith('EXPORT_WORKER_RUNTIME_ERROR:')) {
    return 'Worker runtime failed, switched to main thread';
  }

  return reason;
}
