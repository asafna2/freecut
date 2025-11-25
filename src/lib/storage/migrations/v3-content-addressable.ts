/**
 * Migration script for v3: Content-Addressable Storage
 *
 * Migrates existing media from the old format (media/{uuid}/{filename})
 * to the new content-addressable format (content/{hash[0:2]}/{hash[2:4]}/{hash}/data)
 * and creates project-media associations based on timeline references.
 */

import {
  getAllMedia,
  getAllProjects,
  updateMedia,
  createContent,
  associateMediaWithProject,
  getContentByHash,
} from '@/lib/storage/indexeddb';
import { opfsService } from '@/features/media-library/services/opfs-service';
import { computeContentHashFromBuffer } from '@/features/media-library/utils/content-hash';
import { getContentPath, isContentPath } from '@/features/media-library/utils/content-path';
import type { MediaMetadata } from '@/types/storage';

export interface MigrationProgress {
  total: number;
  current: number;
  stage: 'analyzing' | 'migrating' | 'complete';
  currentFile?: string;
}

export interface MigrationResult {
  migrated: number;
  deduplicated: number;
  spaceSaved: number;
  errors: string[];
}

/**
 * Check if migration is needed
 */
export async function needsMigration(): Promise<boolean> {
  try {
    const allMedia = await getAllMedia();

    // If any media lacks contentHash or has legacy path format, migration is needed
    for (const media of allMedia) {
      if (!media.contentHash || !isContentPath(media.opfsPath)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
}

/**
 * Migrate existing media to content-addressable storage
 */
export async function migrateToContentAddressable(
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    deduplicated: 0,
    spaceSaved: 0,
    errors: [],
  };

  try {
    // Stage 1: Analyze existing data
    onProgress?.({ total: 0, current: 0, stage: 'analyzing' });

    const allMedia = await getAllMedia();
    const allProjects = await getAllProjects();

    // Build map: which projects use which media (from timeline references)
    const mediaUsage = new Map<string, Set<string>>();
    for (const project of allProjects) {
      if (project.timeline?.items) {
        for (const item of project.timeline.items) {
          if (item.mediaId) {
            if (!mediaUsage.has(item.mediaId)) {
              mediaUsage.set(item.mediaId, new Set());
            }
            mediaUsage.get(item.mediaId)!.add(project.id);
          }
        }
      }
    }

    // Filter media that needs migration
    const mediaToMigrate = allMedia.filter(
      (m) => !m.contentHash || !isContentPath(m.opfsPath)
    );

    const total = mediaToMigrate.length;

    if (total === 0) {
      onProgress?.({ total: 0, current: 0, stage: 'complete' });
      return result;
    }

    // Track content hashes we've seen (for deduplication)
    const seenHashes = new Map<string, MediaMetadata>();

    // Stage 2: Migrate each media item
    onProgress?.({ total, current: 0, stage: 'migrating' });

    for (let i = 0; i < mediaToMigrate.length; i++) {
      const media = mediaToMigrate[i];
      if (!media) continue;

      onProgress?.({
        total,
        current: i + 1,
        stage: 'migrating',
        currentFile: media.fileName,
      });

      try {
        // Read file from old location
        let fileData: ArrayBuffer;
        try {
          fileData = await opfsService.getFile(media.opfsPath);
        } catch (error) {
          // File doesn't exist in OPFS - skip migration
          result.errors.push(`File not found: ${media.fileName}`);
          continue;
        }

        // Compute content hash
        const contentHash = await computeContentHashFromBuffer(fileData);

        // Check if we've already seen this hash (deduplication)
        if (seenHashes.has(contentHash)) {
          // Duplicate file - don't create new content, just update reference
          result.deduplicated++;
          result.spaceSaved += media.fileSize;

          // Update media metadata to point to existing content
          const existingMedia = seenHashes.get(contentHash)!;
          await updateMedia(media.id, {
            contentHash,
            opfsPath: existingMedia.opfsPath,
          });

          // Delete the duplicate file from old location
          try {
            await opfsService.deleteFile(media.opfsPath);
          } catch {
            // File might not exist, ignore
          }
        } else {
          // New unique content
          const newPath = getContentPath(contentHash);

          // Check if content already exists in new location
          const existingContent = await getContentByHash(contentHash);

          if (!existingContent) {
            // Save to new content-addressable path
            await opfsService.saveFile(newPath, fileData);

            // Create content record
            const projectCount = mediaUsage.get(media.id)?.size || 1;
            await createContent({
              hash: contentHash,
              fileSize: media.fileSize,
              mimeType: media.mimeType,
              referenceCount: Math.max(1, projectCount),
              createdAt: media.createdAt,
            });
          }

          // Update media metadata
          await updateMedia(media.id, {
            contentHash,
            opfsPath: newPath,
          });

          // Delete old file (if path changed)
          if (media.opfsPath !== newPath) {
            try {
              await opfsService.deleteFile(media.opfsPath);
            } catch {
              // File might not exist, ignore
            }
          }

          // Track this hash
          seenHashes.set(contentHash, { ...media, contentHash, opfsPath: newPath });
        }

        // Create project-media associations
        const projectIds = mediaUsage.get(media.id) || new Set();
        for (const projectId of projectIds) {
          await associateMediaWithProject(projectId, media.id);
        }

        result.migrated++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to migrate ${media.fileName}: ${errorMsg}`);
      }
    }

    onProgress?.({ total, current: total, stage: 'complete' });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Migration failed: ${errorMsg}`);
    return result;
  }
}

/**
 * Run migration if needed (called on app startup)
 */
export async function runMigrationIfNeeded(
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationResult | null> {
  if (await needsMigration()) {
    console.log('Running v3 content-addressable storage migration...');
    const result = await migrateToContentAddressable(onProgress);
    console.log('Migration complete:', result);
    return result;
  }

  return null;
}
