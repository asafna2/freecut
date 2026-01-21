/**
 * Backend Capability Detection
 *
 * Detects available rendering backends and their capabilities.
 */

import type { BackendName } from './types';

export async function detectWebGPUSupport(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

export function detectWebGL2Support(canvas?: HTMLCanvasElement): boolean {
  const testCanvas = canvas ?? document.createElement('canvas');

  try {
    const gl = testCanvas.getContext('webgl2');
    return gl !== null;
  } catch {
    return false;
  }
}

export function detectCanvasSupport(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    return ctx !== null;
  } catch {
    return false;
  }
}

export async function detectBestBackend(canvas?: HTMLCanvasElement): Promise<BackendName> {
  if (await detectWebGPUSupport()) {
    return 'webgpu';
  }

  if (detectWebGL2Support(canvas)) {
    return 'webgl2';
  }

  return 'canvas';
}

export async function getAvailableBackends(canvas?: HTMLCanvasElement): Promise<BackendName[]> {
  const available: BackendName[] = [];

  if (await detectWebGPUSupport()) {
    available.push('webgpu');
  }

  if (detectWebGL2Support(canvas)) {
    available.push('webgl2');
  }

  if (detectCanvasSupport()) {
    available.push('canvas');
  }

  return available;
}
