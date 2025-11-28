import type { MediaMetadata, ThumbnailData } from '@/types/storage';
import {
  getAllMedia as getAllMediaDB,
  getMedia as getMediaDB,
  createMedia as createMediaDB,
  deleteMedia as deleteMediaDB,
  saveThumbnail as saveThumbnailDB,
  getThumbnailByMediaId,
  deleteThumbnailsByMediaId,
  checkStorageQuota,
  hasEnoughSpace,
  // v3: Content-addressable storage
  getContentByHash,
  createContent,
  incrementContentRef,
  decrementContentRef,
  deleteContent,
  findMediaByContentHash,
  // v3: Project-media associations
  associateMediaWithProject,
  removeMediaFromProject as removeMediaFromProjectDB,
  getProjectMediaIds,
  getProjectsUsingMedia,
  getMediaForProject as getMediaForProjectDB,
} from '@/lib/storage/indexeddb';
import { opfsService } from './opfs-service';
import { validateMediaFile } from '../utils/validation';
import { extractMetadata } from '../utils/metadata-extractor';
import { generateThumbnail } from '../utils/thumbnail-generator';
import { computeContentHash } from '../utils/content-hash';
import { getContentPath } from '../utils/content-path';

/**
 * Media Library Service - Coordinates OPFS + IndexedDB + metadata extraction
 *
 * Provides atomic operations for media management, ensuring OPFS and IndexedDB
 * stay in sync.
 */
export class MediaLibraryService {
  /**
   * Get all media items from IndexedDB
   */
  async getAllMedia(): Promise<MediaMetadata[]> {
    return getAllMediaDB();
  }

  /**
   * Get a single media item by ID
   */
  async getMedia(id: string): Promise<MediaMetadata | null> {
    const media = await getMediaDB(id);
    return media || null;
  }

  /**
   * Upload a media file to a project with content-based deduplication
   *
   * v3: Uses SHA-256 content hashing for deduplication. If the same file
   * is uploaded multiple times (same project or different), the actual file
   * is stored only once in content-addressable storage.
   *
   * @param file - The file to upload
   * @param projectId - The project to associate the media with
   * @param onProgress - Optional progress callback
   */
  async uploadMediaToProject(
    file: File,
    projectId: string,
    onProgress?: (percent: number, stage: string) => void
  ): Promise<MediaMetadata> {
    // Stage 1: Validation (5%)
    onProgress?.(5, 'Validating file...');
    const validationResult = validateMediaFile(file);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    // Stage 2: Compute content hash (5-25%)
    onProgress?.(10, 'Computing file signature...');
    const contentHash = await computeContentHash(file, (p) => {
      onProgress?.(10 + p * 0.15, 'Computing file signature...');
    });
    onProgress?.(25, 'Signature computed');

    // Stage 3: Check for existing content (deduplication)
    const existingContent = await getContentByHash(contentHash);

    if (existingContent) {
      // DEDUP HIT: Content already exists
      onProgress?.(30, 'File already stored, creating reference...');

      // Find existing media entry with this hash
      const existingMedia = await findMediaByContentHash(contentHash);

      if (existingMedia) {
        // Associate existing media with this project
        await associateMediaWithProject(projectId, existingMedia.id);
        await incrementContentRef(contentHash);

        onProgress?.(100, 'Upload complete (deduplicated)');
        return existingMedia;
      }
      // Content exists but no media entry - should not happen normally
      // Fall through to create new media entry
    }

    // Stage 4: Quota check (30-35%)
    onProgress?.(30, 'Checking storage quota...');
    const hasQuota = await hasEnoughSpace(file.size);
    if (!hasQuota) {
      const { usage, quota } = await checkStorageQuota();
      const percentUsed = ((usage / quota) * 100).toFixed(1);
      throw new Error(
        `Storage quota exceeded (${percentUsed}% used). Please delete some files to free up space.`
      );
    }

    // Generate unique ID and content-addressable path
    const id = crypto.randomUUID();
    const opfsPath = getContentPath(contentHash);

    let opfsStored = false;
    let contentCreated = false;

    try {
      // Stage 5: Extract metadata (35-45%)
      onProgress?.(35, 'Extracting metadata...');
      const metadata = await extractMetadata(file);
      onProgress?.(45, 'Metadata extracted');

      // Stage 6: Store file in OPFS (45-60%)
      onProgress?.(50, 'Storing file...');
      const arrayBuffer = await file.arrayBuffer();
      await opfsService.saveFile(opfsPath, arrayBuffer);
      opfsStored = true;
      onProgress?.(60, 'File stored');

      // Stage 7: Create content record (60-65%) - only if it doesn't exist
      onProgress?.(62, 'Creating content record...');
      if (!existingContent) {
        await createContent({
          hash: contentHash,
          fileSize: file.size,
          mimeType: file.type,
          referenceCount: 1,
          createdAt: Date.now(),
        });
        contentCreated = true;
      } else {
        // Content exists but media entry was orphaned - just increment ref count
        await incrementContentRef(contentHash);
      }

      // Stage 8: Generate thumbnail (65-80%)
      onProgress?.(70, 'Generating thumbnail...');
      let thumbnailId: string | undefined;

      try {
        const thumbnailBlob = await generateThumbnail(file, { timestamp: 1 });
        thumbnailId = crypto.randomUUID();

        const thumbnailData: ThumbnailData = {
          id: thumbnailId,
          mediaId: id,
          blob: thumbnailBlob,
          timestamp: 1,
          width: 320,
          height: 180,
        };

        await saveThumbnailDB(thumbnailData);
        onProgress?.(80, 'Thumbnail generated');
      } catch (error) {
        console.warn('Failed to generate thumbnail:', error);
        // Continue without thumbnail - not critical
      }

      // Stage 9: Save metadata to IndexedDB (80-90%)
      onProgress?.(85, 'Saving metadata...');
      const mediaMetadata: MediaMetadata = {
        id,
        contentHash,
        opfsPath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        duration: (metadata as { duration?: number }).duration ?? 0,
        width: (metadata as { width?: number }).width ?? 0,
        height: (metadata as { height?: number }).height ?? 0,
        fps: (metadata as { fps?: number }).fps ?? 30,
        codec: (metadata as { codec?: string }).codec ?? 'unknown',
        bitrate: (metadata as { bitrate?: number }).bitrate ?? 0,
        thumbnailId,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await createMediaDB(mediaMetadata);

      // Stage 10: Associate with project (90-100%)
      onProgress?.(92, 'Adding to project...');
      await associateMediaWithProject(projectId, id);

      // Pre-extract GIF frames in background for faster timeline scrubbing
      // This is non-blocking - extraction continues after upload completes
      if (file.type === 'image/gif') {
        const blobUrl = URL.createObjectURL(file);
        import('@/features/timeline/services/gif-frame-cache')
          .then(({ gifFrameCache }) => {
            return gifFrameCache.getGifFrames(id, blobUrl);
          })
          .catch((err) => {
            console.warn('Failed to pre-extract GIF frames:', err);
          })
          .finally(() => {
            URL.revokeObjectURL(blobUrl);
          });
      }

      // Complete (100%)
      onProgress?.(100, 'Upload complete');

      return mediaMetadata;
    } catch (error) {
      // Rollback: Delete from OPFS if it was stored
      if (opfsStored) {
        try {
          await opfsService.deleteFile(opfsPath);
        } catch (cleanupError) {
          console.error('Failed to cleanup OPFS file:', cleanupError);
        }
      }

      // Rollback: Delete content record if it was created
      if (contentCreated) {
        try {
          await deleteContent(contentHash);
        } catch (cleanupError) {
          console.error('Failed to cleanup content record:', cleanupError);
        }
      }

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * @deprecated Use uploadMediaToProject instead for proper project isolation
   * Legacy upload method for backward compatibility (no project association)
   */
  async uploadMedia(
    file: File,
    onProgress?: (percent: number, stage: string) => void
  ): Promise<MediaMetadata> {
    // For backward compatibility, upload without project association
    // This creates orphaned media that isn't associated with any project
    console.warn(
      'uploadMedia is deprecated. Use uploadMediaToProject for proper project isolation.'
    );

    // Stage 1: Validation (5%)
    onProgress?.(5, 'Validating file...');
    const validationResult = validateMediaFile(file);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    // Stage 2: Compute content hash
    onProgress?.(10, 'Computing file signature...');
    const contentHash = await computeContentHash(file);
    onProgress?.(25, 'Signature computed');

    // Check for existing content (deduplication)
    const existingContent = await getContentByHash(contentHash);
    if (existingContent) {
      const existingMedia = await findMediaByContentHash(contentHash);
      if (existingMedia) {
        await incrementContentRef(contentHash);
        onProgress?.(100, 'Upload complete (deduplicated)');
        return existingMedia;
      }
    }

    // Stage 3: Quota check
    onProgress?.(30, 'Checking storage quota...');
    const hasQuota = await hasEnoughSpace(file.size);
    if (!hasQuota) {
      const { usage, quota } = await checkStorageQuota();
      const percentUsed = ((usage / quota) * 100).toFixed(1);
      throw new Error(
        `Storage quota exceeded (${percentUsed}% used). Please delete some files to free up space.`
      );
    }

    const id = crypto.randomUUID();
    const opfsPath = getContentPath(contentHash);

    let opfsStored = false;
    let contentCreated = false;

    try {
      // Extract metadata
      onProgress?.(35, 'Extracting metadata...');
      const metadata = await extractMetadata(file);

      // Store file in OPFS
      onProgress?.(50, 'Storing file...');
      const arrayBuffer = await file.arrayBuffer();
      await opfsService.saveFile(opfsPath, arrayBuffer);
      opfsStored = true;

      // Create content record
      await createContent({
        hash: contentHash,
        fileSize: file.size,
        mimeType: file.type,
        referenceCount: 1,
        createdAt: Date.now(),
      });
      contentCreated = true;

      // Generate thumbnail
      onProgress?.(70, 'Generating thumbnail...');
      let thumbnailId: string | undefined;
      try {
        const thumbnailBlob = await generateThumbnail(file, { timestamp: 1 });
        thumbnailId = crypto.randomUUID();
        const thumbnailData: ThumbnailData = {
          id: thumbnailId,
          mediaId: id,
          blob: thumbnailBlob,
          timestamp: 1,
          width: 320,
          height: 180,
        };
        await saveThumbnailDB(thumbnailData);
      } catch {
        console.warn('Failed to generate thumbnail');
      }

      // Save metadata
      onProgress?.(90, 'Saving metadata...');
      const mediaMetadata: MediaMetadata = {
        id,
        contentHash,
        opfsPath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        duration: (metadata as { duration?: number }).duration ?? 0,
        width: (metadata as { width?: number }).width ?? 0,
        height: (metadata as { height?: number }).height ?? 0,
        fps: (metadata as { fps?: number }).fps ?? 30,
        codec: (metadata as { codec?: string }).codec ?? 'unknown',
        bitrate: (metadata as { bitrate?: number }).bitrate ?? 0,
        thumbnailId,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await createMediaDB(mediaMetadata);
      onProgress?.(100, 'Upload complete');
      return mediaMetadata;
    } catch (error) {
      if (opfsStored) {
        try {
          await opfsService.deleteFile(opfsPath);
        } catch {
          console.error('Failed to cleanup OPFS file');
        }
      }
      if (contentCreated) {
        try {
          await deleteContent(contentHash);
        } catch {
          console.error('Failed to cleanup content record');
        }
      }
      throw error;
    }
  }

  /**
   * Upload multiple files to a project in batch
   */
  async uploadMediaBatchToProject(
    files: File[],
    projectId: string,
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<MediaMetadata[]> {
    const results: MediaMetadata[] = [];
    const errors: { file: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      onProgress?.(i + 1, files.length, file.name);

      try {
        const metadata = await this.uploadMediaToProject(file, projectId);
        results.push(metadata);
      } catch (error) {
        errors.push({
          file: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (errors.length > 0) {
      console.warn('Some files failed to upload:', errors);
    }

    return results;
  }

  /**
   * @deprecated Use uploadMediaBatchToProject instead
   */
  async uploadMediaBatch(
    files: File[],
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<MediaMetadata[]> {
    console.warn(
      'uploadMediaBatch is deprecated. Use uploadMediaBatchToProject for proper project isolation.'
    );
    const results: MediaMetadata[] = [];
    const errors: { file: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      onProgress?.(i + 1, files.length, file.name);

      try {
        const metadata = await this.uploadMedia(file);
        results.push(metadata);
      } catch (error) {
        errors.push({
          file: file.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (errors.length > 0) {
      console.warn('Some files failed to upload:', errors);
    }

    return results;
  }

  /**
   * Delete media from a project with reference counting
   *
   * v3: Removes the media association from the project. If no other projects
   * use this media, the actual file is deleted from storage.
   *
   * @param projectId - The project to remove media from
   * @param mediaId - The media to remove
   */
  async deleteMediaFromProject(
    projectId: string,
    mediaId: string
  ): Promise<void> {
    // Get media metadata
    const media = await getMediaDB(mediaId);
    if (!media) {
      throw new Error(`Media not found: ${mediaId}`);
    }

    // Remove project-media association
    await removeMediaFromProjectDB(projectId, mediaId);

    // Check if any other projects still use this media
    const remainingProjects = await getProjectsUsingMedia(mediaId);

    if (remainingProjects.length === 0) {
      // No other projects use this media - safe to fully delete

      // Decrement content reference count
      const newRefCount = await decrementContentRef(media.contentHash);

      // Delete media metadata
      await deleteMediaDB(mediaId);

      // Delete thumbnails
      try {
        await deleteThumbnailsByMediaId(mediaId);
      } catch (error) {
        console.warn('Failed to delete thumbnails:', error);
      }

      // Delete GIF frame cache if applicable
      try {
        const { gifFrameCache } = await import(
          '@/features/timeline/services/gif-frame-cache'
        );
        await gifFrameCache.clearMedia(mediaId);
      } catch (error) {
        console.warn('Failed to delete GIF frame cache:', error);
      }

      // If no more references to content, delete the actual file
      if (newRefCount === 0) {
        try {
          await opfsService.deleteFile(media.opfsPath);
        } catch (error) {
          console.warn('Failed to delete file from OPFS:', error);
        }

        // Delete content record
        try {
          await deleteContent(media.contentHash);
        } catch (error) {
          console.warn('Failed to delete content record:', error);
        }
      }
    }
  }

  /**
   * Delete multiple media items from a project in batch
   */
  async deleteMediaBatchFromProject(
    projectId: string,
    mediaIds: string[]
  ): Promise<void> {
    const errors: Array<{ id: string; error: unknown }> = [];

    for (const mediaId of mediaIds) {
      try {
        await this.deleteMediaFromProject(projectId, mediaId);
      } catch (error) {
        console.error(`Failed to delete media ${mediaId}:`, error);
        errors.push({ id: mediaId, error });
      }
    }

    if (errors.length === mediaIds.length) {
      throw new Error(
        `Failed to delete all ${mediaIds.length} items. Check console for details.`
      );
    }

    if (errors.length > 0) {
      console.warn(
        `Partially deleted: ${mediaIds.length - errors.length}/${mediaIds.length} items deleted successfully.`
      );
    }
  }

  /**
   * Delete all media associations for a project
   * Used when deleting a project
   */
  async deleteAllMediaFromProject(projectId: string): Promise<void> {
    const mediaIds = await getProjectMediaIds(projectId);

    for (const mediaId of mediaIds) {
      try {
        await this.deleteMediaFromProject(projectId, mediaId);
      } catch (error) {
        console.error(`Failed to delete media ${mediaId} from project:`, error);
      }
    }
  }

  /**
   * @deprecated Use deleteMediaFromProject instead for proper reference counting
   */
  async deleteMedia(id: string): Promise<void> {
    console.warn(
      'deleteMedia is deprecated. Use deleteMediaFromProject for proper reference counting.'
    );

    const media = await getMediaDB(id);
    if (!media) {
      throw new Error(`Media not found: ${id}`);
    }

    // Decrement ref count and delete file if needed
    const newRefCount = await decrementContentRef(media.contentHash);

    if (newRefCount === 0) {
      try {
        await opfsService.deleteFile(media.opfsPath);
      } catch (error) {
        console.warn('Failed to delete file from OPFS:', error);
      }

      try {
        await deleteContent(media.contentHash);
      } catch (error) {
        console.warn('Failed to delete content record:', error);
      }
    }

    try {
      await deleteThumbnailsByMediaId(id);
    } catch (error) {
      console.warn('Failed to delete thumbnails:', error);
    }

    await deleteMediaDB(id);
  }

  /**
   * @deprecated Use deleteMediaBatchFromProject instead
   */
  async deleteMediaBatch(ids: string[]): Promise<void> {
    console.warn(
      'deleteMediaBatch is deprecated. Use deleteMediaBatchFromProject for proper reference counting.'
    );

    const errors: Array<{ id: string; error: unknown }> = [];

    for (const id of ids) {
      try {
        await this.deleteMedia(id);
      } catch (error) {
        console.error(`Failed to delete media ${id}:`, error);
        errors.push({ id, error });
      }
    }

    if (errors.length === ids.length) {
      throw new Error(
        `Failed to delete all ${ids.length} items. Check console for details.`
      );
    }

    if (errors.length > 0) {
      console.warn(
        `Partially deleted: ${ids.length - errors.length}/${ids.length} items deleted successfully.`
      );
    }
  }

  /**
   * Get all media for a specific project
   */
  async getMediaForProject(projectId: string): Promise<MediaMetadata[]> {
    return getMediaForProjectDB(projectId);
  }

  /**
   * Copy media to another project (no file duplication due to CAS)
   */
  async copyMediaToProject(
    mediaId: string,
    targetProjectId: string
  ): Promise<void> {
    const media = await getMediaDB(mediaId);
    if (!media) {
      throw new Error(`Media not found: ${mediaId}`);
    }

    // Just create association - file stays in place due to CAS
    await associateMediaWithProject(targetProjectId, mediaId);
    await incrementContentRef(media.contentHash);
  }

  /**
   * Get media file as Blob object
   *
   * Note: Returns Blob instead of File to prevent OPFS access handle leaks.
   * File objects maintain stronger internal references that can prevent
   * new access handles from being created on the same file.
   */
  async getMediaFile(id: string): Promise<Blob | null> {
    const media = await getMediaDB(id);

    if (!media) {
      return null;
    }

    try {
      const arrayBuffer = await opfsService.getFile(media.opfsPath);
      const blob = new Blob([arrayBuffer], {
        type: media.mimeType,
      });
      return blob;
    } catch (error) {
      console.error('Failed to get media file from OPFS:', error);
      return null;
    }
  }

  /**
   * Get media file as blob URL (for preview/playback)
   */
  async getMediaBlobUrl(id: string): Promise<string | null> {
    const file = await this.getMediaFile(id);

    if (!file) {
      return null;
    }

    return URL.createObjectURL(file);
  }

  /**
   * Get thumbnail for a media item
   */
  async getThumbnail(mediaId: string): Promise<ThumbnailData | null> {
    const thumbnail = await getThumbnailByMediaId(mediaId);
    return thumbnail || null;
  }

  /**
   * Get thumbnail as blob URL
   */
  async getThumbnailBlobUrl(mediaId: string): Promise<string | null> {
    const thumbnail = await this.getThumbnail(mediaId);

    if (!thumbnail) {
      return null;
    }

    return URL.createObjectURL(thumbnail.blob);
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage(): Promise<{ used: number; quota: number }> {
    const { usage, quota } = await checkStorageQuota();
    return { used: usage, quota };
  }

  /**
   * Validate sync between OPFS and IndexedDB
   * Returns list of issues found
   */
  async validateSync(): Promise<{
    orphanedMetadata: string[]; // Metadata without OPFS file
    orphanedFiles: string[]; // OPFS files without metadata
  }> {
    const allMedia = await getAllMediaDB();
    const orphanedMetadata: string[] = [];
    const orphanedFiles: string[] = [];

    // Check each metadata entry has corresponding OPFS file
    for (const media of allMedia) {
      try {
        await opfsService.getFile(media.opfsPath);
      } catch (error) {
        // File not found in OPFS
        orphanedMetadata.push(media.id);
      }
    }

    // Note: Checking for orphaned OPFS files would require listing all
    // files in OPFS and cross-referencing with metadata, which is expensive.
    // Can be implemented if needed.

    return { orphanedMetadata, orphanedFiles };
  }

  /**
   * Repair sync issues
   */
  async repairSync(): Promise<{ cleaned: number }> {
    const { orphanedMetadata } = await this.validateSync();

    // Clean up orphaned metadata
    for (const id of orphanedMetadata) {
      try {
        await deleteMediaDB(id);
        await deleteThumbnailsByMediaId(id);
      } catch (error) {
        console.error(`Failed to cleanup orphaned metadata ${id}:`, error);
      }
    }

    return { cleaned: orphanedMetadata.length };
  }
}

// Singleton instance
export const mediaLibraryService = new MediaLibraryService();
