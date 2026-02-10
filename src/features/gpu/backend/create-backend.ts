/**
 * Backend Factory
 *
 * Creates the best available render backend for the current environment.
 */

import { createLogger } from '@/lib/logger';
import type { RenderBackend, BackendOptions, BackendName } from './types';
import { detectBestBackend, detectWebGPUSupport, detectWebGL2Support } from './capabilities';

const log = createLogger('GPU');
import { WebGPUBackend } from './webgpu-backend';
import { WebGL2Backend } from './webgl2-backend';
import { CanvasBackend } from './canvas-backend';

function createBackendInstance(name: BackendName): RenderBackend {
  switch (name) {
    case 'webgpu': return new WebGPUBackend();
    case 'webgl2': return new WebGL2Backend();
    case 'canvas': return new CanvasBackend();
    default: throw new Error(`Unknown backend: ${name}`);
  }
}

export async function createBackend(
  canvas: HTMLCanvasElement,
  options: BackendOptions = {}
): Promise<RenderBackend> {
  const { preferredBackend, debug } = options;

  let backendName: BackendName;

  if (preferredBackend) {
    const isAvailable = await isBackendAvailable(preferredBackend, canvas);
    if (isAvailable) {
      backendName = preferredBackend;
      if (debug) log.debug(`Using preferred backend: ${backendName}`);
    } else {
      backendName = await detectBestBackend(canvas);
      if (debug) log.debug(`Preferred backend ${preferredBackend} not available, falling back to: ${backendName}`);
    }
  } else {
    backendName = await detectBestBackend(canvas);
    if (debug) log.debug(`Auto-detected backend: ${backendName}`);
  }

  const backend = createBackendInstance(backendName);
  await backend.init(canvas);

  if (debug) log.debug(`Initialized ${backendName} backend with capabilities:`, backend.capabilities);

  return backend;
}

async function isBackendAvailable(name: BackendName, canvas?: HTMLCanvasElement): Promise<boolean> {
  switch (name) {
    case 'webgpu': return detectWebGPUSupport();
    case 'webgl2': return detectWebGL2Support(canvas);
    case 'canvas': return true;
    default: return false;
  }
}

export async function getAvailableBackendNames(canvas?: HTMLCanvasElement): Promise<BackendName[]> {
  const available: BackendName[] = [];
  if (await detectWebGPUSupport()) available.push('webgpu');
  if (detectWebGL2Support(canvas)) available.push('webgl2');
  available.push('canvas');
  return available;
}
