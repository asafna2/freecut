/**
 * Project Bundle Import Service
 *
 * Imports a .vedproj bundle (ZIP archive) and creates a project with media
 *
 * TODO: Refactor to use file handles instead of OPFS storage
 * - Extract media to user's chosen directory
 * - Create file handles pointing to extracted files
 * - This will align with the local-first file handle approach
 */

import { unzip } from 'fflate';
import type {
  BundleManifest,
  ImportProgress,
  ImportResult,
  ImportOptions,
} from '../types/bundle';

/**
 * Import a project bundle
 *
 * @throws Error - Bundle import is not yet implemented with file handle approach
 */
export async function importProjectBundle(
  _file: File,
  _options: ImportOptions = {},
  _onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  // TODO: Implement with file handle approach
  // 1. Let user pick a directory to extract media to
  // 2. Extract media files from bundle to that directory
  // 3. Create file handles pointing to extracted files
  // 4. Import using importMediaWithHandle
  throw new Error(
    'Bundle import is not yet implemented. ' +
    'This feature will be refactored to use file handles in a future update.'
  );
}

/**
 * Validate a bundle file without importing
 */
export async function validateBundle(file: File): Promise<{
  valid: boolean;
  manifest?: BundleManifest;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const buffer = await file.arrayBuffer();
    const files = await new Promise<Record<string, Uint8Array>>(
      (resolve, reject) => {
        unzip(new Uint8Array(buffer), (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      }
    );

    // Check manifest
    if (!files['manifest.json']) {
      errors.push('Missing manifest.json');
      return { valid: false, errors };
    }

    const manifest: BundleManifest = JSON.parse(
      new TextDecoder().decode(files['manifest.json'])
    );

    // Check project.json
    if (!files['project.json']) {
      errors.push('Missing project.json');
      return { valid: false, manifest, errors };
    }

    // Verify checksum
    const manifestForHash = { ...manifest, checksum: '' };
    const computedHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(manifestForHash))
    );
    const computedChecksum = Array.from(new Uint8Array(computedHashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (computedChecksum !== manifest.checksum) {
      errors.push('Checksum mismatch - file may be corrupted');
      return { valid: false, manifest, errors };
    }

    // Check media files exist
    for (const media of manifest.media) {
      if (!files[media.relativePath]) {
        errors.push(`Missing media file: ${media.fileName}`);
      }
    }

    return {
      valid: errors.length === 0,
      manifest,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { valid: false, errors };
  }
}
