/**
 * OPFS Filmstrip Storage
 *
 * Binary format for efficient filmstrip storage with random access:
 *
 * Header (32 bytes):
 *   - Magic: "FSTRIP" (6 bytes)
 *   - Version: uint8 (1 byte)
 *   - Width: uint16 (2 bytes)
 *   - Height: uint16 (2 bytes)
 *   - Frame count: uint32 (4 bytes)
 *   - Quality: uint8 (1 byte, image quality * 100)
 *   - Reserved: (16 bytes)
 *
 * Index (12 bytes per frame):
 *   - Timestamp: float32 (4 bytes)
 *   - Offset: uint32 (4 bytes)
 *   - Size: uint32 (4 bytes)
 *
 * Data:
 *   - WebP image bytes concatenated
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('FilmstripOPFS');

const MAGIC = 'FSTRIP';
const VERSION = 1;
const HEADER_SIZE = 32;
const INDEX_ENTRY_SIZE = 12; // timestamp(4) + offset(4) + size(4)
const FILMSTRIP_DIR = 'filmstrips';

interface FilmstripHeader {
  width: number;
  height: number;
  frameCount: number;
  quality: number;
}

interface FrameIndex {
  timestamp: number;
  offset: number;
  size: number;
}

/**
 * OPFS Filmstrip Storage Service
 * Provides efficient binary storage with random frame access
 */
class FilmstripOPFSStorage {
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private dirHandle: FileSystemDirectoryHandle | null = null;

  /**
   * Initialize OPFS directory
   */
  private async ensureDirectory(): Promise<FileSystemDirectoryHandle> {
    if (this.dirHandle) return this.dirHandle;

    try {
      this.rootHandle = await navigator.storage.getDirectory();
      this.dirHandle = await this.rootHandle.getDirectoryHandle(FILMSTRIP_DIR, {
        create: true,
      });
      return this.dirHandle;
    } catch (error) {
      logger.error('Failed to initialize OPFS directory:', error);
      throw error;
    }
  }

  /**
   * Write header to buffer
   */
  private writeHeader(
    view: DataView,
    header: FilmstripHeader
  ): void {
    let offset = 0;

    // Magic bytes
    for (let i = 0; i < MAGIC.length; i++) {
      view.setUint8(offset++, MAGIC.charCodeAt(i));
    }

    // Version
    view.setUint8(offset++, VERSION);

    // Width & Height
    view.setUint16(offset, header.width, true);
    offset += 2;
    view.setUint16(offset, header.height, true);
    offset += 2;

    // Frame count
    view.setUint32(offset, header.frameCount, true);
    offset += 4;

    // Quality
    view.setUint8(offset++, header.quality);

    // Reserved bytes (fill with 0)
    // Remaining bytes up to HEADER_SIZE are already 0 from ArrayBuffer
  }

  /**
   * Read header from buffer
   */
  private readHeader(view: DataView): FilmstripHeader | null {
    let offset = 0;

    // Verify magic
    let magic = '';
    for (let i = 0; i < MAGIC.length; i++) {
      magic += String.fromCharCode(view.getUint8(offset++));
    }
    if (magic !== MAGIC) {
      logger.warn('Invalid filmstrip magic bytes');
      return null;
    }

    // Check version
    const version = view.getUint8(offset++);
    if (version !== VERSION) {
      logger.warn(`Unsupported filmstrip version: ${version}`);
      return null;
    }

    // Read dimensions
    const width = view.getUint16(offset, true);
    offset += 2;
    const height = view.getUint16(offset, true);
    offset += 2;

    // Frame count
    const frameCount = view.getUint32(offset, true);
    offset += 4;

    // Quality
    const quality = view.getUint8(offset);

    return { width, height, frameCount, quality };
  }

  /**
   * Write index entry
   */
  private writeIndexEntry(
    view: DataView,
    baseOffset: number,
    index: number,
    entry: FrameIndex
  ): void {
    const offset = baseOffset + index * INDEX_ENTRY_SIZE;
    view.setFloat32(offset, entry.timestamp, true);
    view.setUint32(offset + 4, entry.offset, true);
    view.setUint32(offset + 8, entry.size, true);
  }

  /**
   * Read index entry
   */
  private readIndexEntry(
    view: DataView,
    baseOffset: number,
    index: number
  ): FrameIndex {
    const offset = baseOffset + index * INDEX_ENTRY_SIZE;
    return {
      timestamp: view.getFloat32(offset, true),
      offset: view.getUint32(offset + 4, true),
      size: view.getUint32(offset + 8, true),
    };
  }

  /**
   * Save filmstrip to OPFS
   */
  async save(
    mediaId: string,
    frames: { timestamp: number; blob: Blob }[],
    width: number,
    height: number,
    quality: number = 0.7
  ): Promise<void> {
    const dir = await this.ensureDirectory();
    const fileName = `${mediaId}.bin`;

    try {
      // Calculate sizes
      const frameCount = frames.length;
      const indexSize = frameCount * INDEX_ENTRY_SIZE;
      const headerAndIndexSize = HEADER_SIZE + indexSize;

      // Get all blob data
      const blobData: ArrayBuffer[] = [];
      let totalDataSize = 0;
      for (const frame of frames) {
        const data = await frame.blob.arrayBuffer();
        blobData.push(data);
        totalDataSize += data.byteLength;
      }

      // Create buffer
      const totalSize = headerAndIndexSize + totalDataSize;
      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      const uint8 = new Uint8Array(buffer);

      // Write header
      this.writeHeader(view, {
        width,
        height,
        frameCount,
        quality: Math.round(quality * 100),
      });

      // Write index and data
      let dataOffset = headerAndIndexSize;
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const data = blobData[i];

        // Write index entry
        this.writeIndexEntry(view, HEADER_SIZE, i, {
          timestamp: frame.timestamp,
          offset: dataOffset,
          size: data.byteLength,
        });

        // Write frame data
        uint8.set(new Uint8Array(data), dataOffset);
        dataOffset += data.byteLength;
      }

      // Write to OPFS
      const fileHandle = await dir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();

      logger.debug(`Saved filmstrip ${mediaId}: ${frameCount} frames, ${(totalSize / 1024).toFixed(1)}KB`);
    } catch (error) {
      logger.error(`Failed to save filmstrip ${mediaId}:`, error);
      throw error;
    }
  }

  /**
   * Check if filmstrip exists
   */
  async exists(mediaId: string): Promise<boolean> {
    try {
      const dir = await this.ensureDirectory();
      await dir.getFileHandle(`${mediaId}.bin`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get filmstrip metadata (header + index) without loading frame data
   */
  async getMetadata(
    mediaId: string
  ): Promise<{ header: FilmstripHeader; index: FrameIndex[] } | null> {
    try {
      const dir = await this.ensureDirectory();
      const fileHandle = await dir.getFileHandle(`${mediaId}.bin`);
      const file = await fileHandle.getFile();

      // Read header
      const headerBuffer = await file.slice(0, HEADER_SIZE).arrayBuffer();
      const headerView = new DataView(headerBuffer);
      const header = this.readHeader(headerView);

      if (!header) return null;

      // Read index
      const indexSize = header.frameCount * INDEX_ENTRY_SIZE;
      const indexBuffer = await file
        .slice(HEADER_SIZE, HEADER_SIZE + indexSize)
        .arrayBuffer();
      const indexView = new DataView(indexBuffer);

      const index: FrameIndex[] = [];
      for (let i = 0; i < header.frameCount; i++) {
        index.push(this.readIndexEntry(indexView, 0, i));
      }

      return { header, index };
    } catch {
      return null;
    }
  }

  /**
   * Load a single frame by index
   */
  async getFrame(mediaId: string, frameIndex: number): Promise<Blob | null> {
    try {
      const dir = await this.ensureDirectory();
      const fileHandle = await dir.getFileHandle(`${mediaId}.bin`);
      const file = await fileHandle.getFile();

      // Read header to get frame count
      const headerBuffer = await file.slice(0, HEADER_SIZE).arrayBuffer();
      const header = this.readHeader(new DataView(headerBuffer));
      if (!header || frameIndex >= header.frameCount) return null;

      // Read index entry for this frame
      const indexOffset = HEADER_SIZE + frameIndex * INDEX_ENTRY_SIZE;
      const indexBuffer = await file
        .slice(indexOffset, indexOffset + INDEX_ENTRY_SIZE)
        .arrayBuffer();
      const entry = this.readIndexEntry(new DataView(indexBuffer), 0, 0);

      // Read frame data
      const frameData = await file
        .slice(entry.offset, entry.offset + entry.size)
        .arrayBuffer();

      return new Blob([frameData], { type: 'image/webp' });
    } catch (error) {
      logger.error(`Failed to get frame ${frameIndex} for ${mediaId}:`, error);
      return null;
    }
  }

  /**
   * Load multiple frames by index range (efficient for sequential access)
   */
  async getFrameRange(
    mediaId: string,
    startIndex: number,
    count: number
  ): Promise<{ timestamp: number; blob: Blob }[]> {
    try {
      const dir = await this.ensureDirectory();
      const fileHandle = await dir.getFileHandle(`${mediaId}.bin`);
      const file = await fileHandle.getFile();

      // Read header
      const headerBuffer = await file.slice(0, HEADER_SIZE).arrayBuffer();
      const header = this.readHeader(new DataView(headerBuffer));
      if (!header) return [];

      const endIndex = Math.min(startIndex + count, header.frameCount);
      const actualCount = endIndex - startIndex;
      if (actualCount <= 0) return [];

      // Read index entries for range
      const indexStart = HEADER_SIZE + startIndex * INDEX_ENTRY_SIZE;
      const indexEnd = HEADER_SIZE + endIndex * INDEX_ENTRY_SIZE;
      const indexBuffer = await file.slice(indexStart, indexEnd).arrayBuffer();
      const indexView = new DataView(indexBuffer);

      // Parse index entries
      const entries: FrameIndex[] = [];
      for (let i = 0; i < actualCount; i++) {
        entries.push(this.readIndexEntry(indexView, 0, i));
      }

      // Find data range to read (single read for all frames)
      const dataStart = entries[0].offset;
      const lastEntry = entries[entries.length - 1];
      const dataEnd = lastEntry.offset + lastEntry.size;
      const dataBuffer = await file.slice(dataStart, dataEnd).arrayBuffer();

      // Extract individual frames
      const frames: { timestamp: number; blob: Blob }[] = [];
      for (const entry of entries) {
        const localOffset = entry.offset - dataStart;
        const frameData = dataBuffer.slice(localOffset, localOffset + entry.size);
        frames.push({
          timestamp: entry.timestamp,
          blob: new Blob([frameData], { type: 'image/webp' }),
        });
      }

      return frames;
    } catch (error) {
      logger.error(`Failed to get frame range for ${mediaId}:`, error);
      return [];
    }
  }

  /**
   * Load all frames (for full filmstrip load)
   */
  async getAllFrames(
    mediaId: string
  ): Promise<{ header: FilmstripHeader; frames: { timestamp: number; blob: Blob }[] } | null> {
    try {
      const dir = await this.ensureDirectory();
      const fileHandle = await dir.getFileHandle(`${mediaId}.bin`);
      const file = await fileHandle.getFile();

      // Read entire file
      const buffer = await file.arrayBuffer();
      const view = new DataView(buffer);
      const uint8 = new Uint8Array(buffer);

      // Parse header
      const header = this.readHeader(view);
      if (!header) return null;

      // Parse frames
      const frames: { timestamp: number; blob: Blob }[] = [];
      for (let i = 0; i < header.frameCount; i++) {
        const entry = this.readIndexEntry(view, HEADER_SIZE, i);
        const frameData = uint8.slice(entry.offset, entry.offset + entry.size);
        frames.push({
          timestamp: entry.timestamp,
          blob: new Blob([frameData], { type: 'image/webp' }),
        });
      }

      return { header, frames };
    } catch {
      return null;
    }
  }

  /**
   * Delete filmstrip
   */
  async delete(mediaId: string): Promise<void> {
    try {
      const dir = await this.ensureDirectory();
      await dir.removeEntry(`${mediaId}.bin`);
      logger.debug(`Deleted filmstrip ${mediaId}`);
    } catch {
      // File may not exist, ignore
    }
  }

  /**
   * List all stored filmstrips
   */
  async list(): Promise<string[]> {
    try {
      const dir = await this.ensureDirectory();
      const mediaIds: string[] = [];

      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.bin')) {
          mediaIds.push(entry.name.replace('.bin', ''));
        }
      }

      return mediaIds;
    } catch {
      return [];
    }
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<{ count: number; totalBytes: number }> {
    try {
      const dir = await this.ensureDirectory();
      let count = 0;
      let totalBytes = 0;

      for await (const entry of dir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.bin')) {
          count++;
          const fileHandle = await dir.getFileHandle(entry.name);
          const file = await fileHandle.getFile();
          totalBytes += file.size;
        }
      }

      return { count, totalBytes };
    } catch {
      return { count: 0, totalBytes: 0 };
    }
  }

  /**
   * Clear all filmstrips
   */
  async clearAll(): Promise<void> {
    try {
      const dir = await this.ensureDirectory();
      const entries: string[] = [];

      for await (const entry of dir.values()) {
        if (entry.kind === 'file') {
          entries.push(entry.name);
        }
      }

      for (const name of entries) {
        await dir.removeEntry(name);
      }

      logger.debug(`Cleared ${entries.length} filmstrips from OPFS`);
    } catch (error) {
      logger.error('Failed to clear filmstrips:', error);
    }
  }
}

// Singleton instance
export const filmstripOPFSStorage = new FilmstripOPFSStorage();
