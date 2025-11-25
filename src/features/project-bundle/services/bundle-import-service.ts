/**
 * Project Bundle Import Service
 *
 * Imports a .vedproj bundle (ZIP archive) and creates a project with media
 */

import { unzip } from 'fflate';
import type { Project } from '@/types/project';
import type {
  BundleManifest,
  BundleProject,
  ImportProgress,
  ImportResult,
  ImportConflict,
  ImportOptions,
} from '../types/bundle';
import {
  getAllProjects,
  createProject as createProjectDB,
  getContentByHash,
  findMediaByContentHash,
  associateMediaWithProject,
} from '@/lib/storage/indexeddb';
import { mediaLibraryService } from '@/features/media-library/services/media-library-service';
import { computeContentHashFromBuffer } from '@/features/media-library/utils/content-hash';

/**
 * Import a project bundle
 */
export async function importProjectBundle(
  file: File,
  options: ImportOptions = {},
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  onProgress?.({ percent: 0, stage: 'validating' });

  // Step 1: Read and decompress ZIP
  const buffer = await file.arrayBuffer();
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(new Uint8Array(buffer), (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  // Step 2: Validate manifest
  onProgress?.({ percent: 10, stage: 'validating' });

  const manifestData = files['manifest.json'];
  if (!manifestData) {
    throw new Error('Invalid bundle: missing manifest.json');
  }

  const manifest: BundleManifest = JSON.parse(
    new TextDecoder().decode(manifestData)
  );

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
    throw new Error('Invalid bundle: checksum mismatch. File may be corrupted.');
  }

  // Step 3: Load project data
  const projectData = files['project.json'];
  if (!projectData) {
    throw new Error('Invalid bundle: missing project.json');
  }

  const bundleProject: BundleProject = JSON.parse(
    new TextDecoder().decode(projectData)
  );

  // Step 4: Detect conflicts
  onProgress?.({ percent: 20, stage: 'validating' });

  const conflicts: ImportConflict[] = [];
  const existingProjects = await getAllProjects();

  // Check for project name conflict
  let projectName = options.newProjectName || bundleProject.name;
  const nameExists = existingProjects.some(
    (p) => p.name.toLowerCase() === projectName.toLowerCase()
  );

  if (nameExists && !options.newProjectName) {
    projectName = `${projectName} (Imported)`;
    conflicts.push({
      type: 'project_name',
      description: `Project "${bundleProject.name}" already exists`,
      resolution: 'rename',
      originalValue: bundleProject.name,
      suggestedValue: projectName,
    });
  }

  // Step 5: Import media files
  onProgress?.({ percent: 25, stage: 'importing' });

  // Generate new project ID
  const newProjectId = crypto.randomUUID();

  // Map old media IDs to new ones
  const mediaIdMapping = new Map<string, string>();
  let mediaImported = 0;
  let mediaSkipped = 0;

  const totalMedia = manifest.media.length;

  for (let i = 0; i < manifest.media.length; i++) {
    const mediaEntry = manifest.media[i];
    if (!mediaEntry) continue;

    const progress = 25 + ((i + 1) / totalMedia) * 60;

    onProgress?.({
      percent: progress,
      stage: 'importing',
      currentFile: mediaEntry.fileName,
    });

    // Get file data from bundle
    const mediaFileData = files[mediaEntry.relativePath];
    if (!mediaFileData) {
      console.warn(`Missing media file in bundle: ${mediaEntry.relativePath}`);
      continue;
    }

    // Verify file integrity (convert to ArrayBuffer for hashing)
    const fileHash = await computeContentHashFromBuffer(mediaFileData.buffer.slice(0) as ArrayBuffer);
    if (fileHash !== mediaEntry.sha256) {
      console.warn(`File integrity check failed for: ${mediaEntry.fileName}`);
      // Continue anyway, but log warning
    }

    // Check if this content already exists (deduplication on import)
    const existingContent = await getContentByHash(mediaEntry.sha256);

    if (existingContent && options.skipDuplicateMedia !== false) {
      // Content exists - find existing media entry
      const existingMedia = await findMediaByContentHash(mediaEntry.sha256);

      if (existingMedia) {
        // Reuse existing media - create association with new project
        mediaIdMapping.set(mediaEntry.originalId, existingMedia.id);

        // IMPORTANT: Associate the existing media with this new project
        await associateMediaWithProject(newProjectId, existingMedia.id);

        mediaSkipped++;

        conflicts.push({
          type: 'media_duplicate',
          description: `Media "${mediaEntry.fileName}" already exists (reused)`,
          resolution: 'skip',
          originalValue: mediaEntry.originalId,
          suggestedValue: existingMedia.id,
        });

        continue;
      }
    }

    // Create File object from data (create new Uint8Array to ensure BlobPart compatibility)
    const mediaFile = new File([new Uint8Array(mediaFileData)], mediaEntry.fileName, {
      type: mediaEntry.mimeType,
    });

    // Upload to project (will handle deduplication automatically)
    try {
      const newMedia = await mediaLibraryService.uploadMediaToProject(
        mediaFile,
        newProjectId
      );

      mediaIdMapping.set(mediaEntry.originalId, newMedia.id);
      mediaImported++;
    } catch (error) {
      console.error(`Failed to import media ${mediaEntry.fileName}:`, error);
    }
  }

  // Step 6: Create project with remapped media references
  onProgress?.({ percent: 90, stage: 'linking' });

  // Transform timeline items: map old mediaIds to new ones
  const transformedTimeline = bundleProject.timeline
    ? {
        ...bundleProject.timeline,
        tracks: bundleProject.timeline.tracks.map((track) => ({
          ...track,
          id: crypto.randomUUID(),
        })),
        items: bundleProject.timeline.items.map((item) => {
          const newItem = { ...item };

          // Map mediaRef back to mediaId with new ID
          if ('mediaRef' in item && item.mediaRef) {
            const newMediaId = mediaIdMapping.get(item.mediaRef as string);
            if (newMediaId) {
              newItem.mediaId = newMediaId;
            }
            delete (newItem as Record<string, unknown>).mediaRef;
          }

          // Generate new item ID
          newItem.id = crypto.randomUUID();

          return newItem;
        }),
      }
    : undefined;

  // Build track ID mapping for items
  const trackIdMap = new Map<string, string>();
  if (bundleProject.timeline?.tracks && transformedTimeline?.tracks) {
    for (let i = 0; i < bundleProject.timeline.tracks.length; i++) {
      const bundleTrack = bundleProject.timeline.tracks[i] as { id: string } | undefined;
      const newTrack = transformedTimeline.tracks[i];
      if (bundleTrack && newTrack) {
        trackIdMap.set(bundleTrack.id, newTrack.id);
      }
    }

    // Update trackId references in items
    transformedTimeline.items = transformedTimeline.items.map((item) => ({
      ...item,
      trackId: trackIdMap.get(item.trackId) || item.trackId,
    }));
  }

  // Create new project
  const newProject: Project = {
    ...bundleProject,
    id: newProjectId,
    name: projectName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeline: transformedTimeline as Project['timeline'],
  };

  // Save to database
  await createProjectDB(newProject);

  onProgress?.({ percent: 100, stage: 'complete' });

  return {
    project: newProject,
    mediaImported,
    mediaSkipped,
    conflicts,
  };
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
