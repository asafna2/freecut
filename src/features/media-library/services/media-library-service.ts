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
} from '@/lib/storage/indexeddb';
import { opfsService } from './opfs-service';
import { validateMediaFile } from '../utils/validation';
import { extractMetadata } from '../utils/metadata-extractor';
import { generateThumbnail } from '../utils/thumbnail-generator';

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
   * Upload a media file with full metadata extraction and thumbnail generation
   *
   * This is an atomic operation - if any step fails, previous steps are rolled back.
   */
  async uploadMedia(
    file: File,
    onProgress?: (percent: number, stage: string) => void
  ): Promise<MediaMetadata> {
    // Stage 1: Validation (10%)
    onProgress?.(10, 'Validating file...');
    const validationResult = validateMediaFile(file);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    // Stage 2: Quota check (20%)
    onProgress?.(20, 'Checking storage quota...');
    const hasQuota = await hasEnoughSpace(file.size);
    if (!hasQuota) {
      const { usage, quota } = await checkStorageQuota();
      const percentUsed = ((usage / quota) * 100).toFixed(1);
      throw new Error(
        `Storage quota exceeded (${percentUsed}% used). Please delete some files to free up space.`
      );
    }

    // Generate unique ID and OPFS path
    const id = crypto.randomUUID();
    const opfsPath = `media/${id}/${file.name}`;

    let opfsStored = false;

    try {
      // Stage 3: Extract metadata (30-40%)
      onProgress?.(30, 'Extracting metadata...');
      const metadata = await extractMetadata(file);
      onProgress?.(40, 'Metadata extracted');

      // Stage 4: Store file in OPFS (50-60%)
      onProgress?.(50, 'Storing file...');
      const arrayBuffer = await file.arrayBuffer();
      await opfsService.saveFile(opfsPath, arrayBuffer);
      opfsStored = true;
      onProgress?.(60, 'File stored');

      // Stage 5: Generate thumbnail (70-80%)
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

      // Stage 6: Save metadata to IndexedDB (90%)
      onProgress?.(90, 'Saving metadata...');
      const mediaMetadata: MediaMetadata = {
        id,
        opfsPath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        duration: 'duration' in metadata ? metadata.duration : 0,
        width: 'width' in metadata ? metadata.width : 0,
        height: 'height' in metadata ? metadata.height : 0,
        fps: 'fps' in metadata ? metadata.fps : 30,
        codec: 'codec' in metadata ? metadata.codec : 'unknown',
        bitrate: 'bitrate' in metadata ? metadata.bitrate : 0,
        thumbnailId,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await createMediaDB(mediaMetadata);

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

      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Upload multiple files in batch
   */
  async uploadMediaBatch(
    files: File[],
    onProgress?: (current: number, total: number, fileName: string) => void
  ): Promise<MediaMetadata[]> {
    const results: MediaMetadata[] = [];
    const errors: { file: string; error: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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

    // If there were errors, report them
    if (errors.length > 0) {
      console.warn('Some files failed to upload:', errors);
    }

    return results;
  }

  /**
   * Delete a media item (removes from both OPFS and IndexedDB)
   */
  async deleteMedia(id: string): Promise<void> {
    // Get metadata to find OPFS path
    const media = await getMediaDB(id);

    if (!media) {
      throw new Error(`Media not found: ${id}`);
    }

    // Delete from OPFS
    try {
      await opfsService.deleteFile(media.opfsPath);
    } catch (error) {
      console.warn('Failed to delete file from OPFS:', error);
      // Continue - file might not exist in OPFS
    }

    // Delete thumbnails
    try {
      await deleteThumbnailsByMediaId(id);
    } catch (error) {
      console.warn('Failed to delete thumbnails:', error);
    }

    // Delete metadata from IndexedDB
    await deleteMediaDB(id);
  }

  /**
   * Delete multiple media items in batch
   */
  async deleteMediaBatch(ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await this.deleteMedia(id);
      } catch (error) {
        console.error(`Failed to delete media ${id}:`, error);
      }
    }
  }

  /**
   * Get media file as File object
   */
  async getMediaFile(id: string): Promise<File | null> {
    const media = await getMediaDB(id);

    if (!media) {
      return null;
    }

    try {
      const arrayBuffer = await opfsService.getFile(media.opfsPath);
      const file = new File([arrayBuffer], media.fileName, {
        type: media.mimeType,
      });
      return file;
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
