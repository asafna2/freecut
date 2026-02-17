/**
 * OPFS Filmstrip Storage
 *
 * Progressive extraction writes per-frame webp files for fast incremental updates.
 * Completed filmstrips are compacted into binary bins plus an index manifest to:
 * - reduce OPFS file count
 * - avoid directory scans on load
 * - speed up existing-index lookup for resume/load paths
 *
 * Storage structure:
 *   filmstrips/{mediaId}/
 *     meta.json
 *     index.json               (optional, binned complete storage)
 *     bin-0.bin, bin-1.bin... (optional, binned complete storage)
 *     0.webp, 1.webp...       (legacy / in-progress extraction)
 */

import { createLogger } from '@/lib/logger';
import { getCacheMigration } from '@/lib/storage/cache-version';

const logger = createLogger('FilmstripOPFS');

const FILMSTRIP_DIR = 'filmstrips';
const FRAME_RATE = 1; // Must match worker - 1fps for filmstrip thumbnails
const BIN_INDEX_FILE = 'index.json';
const BIN_VERSION = 1;
const FRAMES_PER_BIN = 16;
const BIN_HEADER_BYTES = 4; // uint32 entry count
const BIN_ENTRY_BYTES = 12; // uint32 index, uint32 offset, uint32 size

interface FilmstripMetadata {
  width: number;
  height: number;
  isComplete: boolean;
  frameCount: number;
}

interface FilmstripBinDescriptor {
  binIndex: number;
  fileName: string;
  frameIndices: number[];
}

interface FilmstripBinIndex {
  version: number;
  framesPerBin: number;
  frameCount: number;
  bins: FilmstripBinDescriptor[];
}

interface ParsedBinEntry {
  index: number;
  offset: number;
  size: number;
}

export interface FilmstripFrame {
  index: number;
  timestamp: number;
  url: string; // Object URL for img src
}

interface LoadedFilmstrip {
  metadata: FilmstripMetadata;
  frames: FilmstripFrame[];
  existingIndices: number[];
}

/**
 * OPFS Filmstrip Storage Service
 */
class FilmstripOPFSStorage {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private initPromise: Promise<FileSystemDirectoryHandle> | null = null;
  private objectUrls = new Map<string, string[]>(); // mediaId -> urls for cleanup
  private binIndexCache = new Map<string, FilmstripBinIndex>();
  private binBufferCache = new Map<string, Map<number, ArrayBuffer>>();
  private compactionPromises = new Map<string, Promise<void>>();

  /**
   * Initialize OPFS directory
   */
  private async ensureDirectory(): Promise<FileSystemDirectoryHandle> {
    if (this.dirHandle) return this.dirHandle;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.initialize();
    return this.initPromise;
  }

  private async initialize(): Promise<FileSystemDirectoryHandle> {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(FILMSTRIP_DIR, { create: true });

      // Run migration if needed
      const migration = getCacheMigration('filmstrip');
      if (migration.needsMigration) {
        const entries: string[] = [];
        for await (const entry of dir.values()) {
          entries.push(entry.name);
        }
        for (const name of entries) {
          await dir.removeEntry(name, { recursive: true }).catch(() => {});
        }
        migration.markComplete();
        logger.info(`Filmstrip cache cleared for v${migration.newVersion}`);
      }

      this.dirHandle = dir;
      return dir;
    } catch (error) {
      logger.error('Failed to initialize OPFS:', error);
      throw error;
    }
  }

  private clearMediaCaches(mediaId: string): void {
    this.binIndexCache.delete(mediaId);
    this.binBufferCache.delete(mediaId);
  }

  private getBinBufferMap(mediaId: string): Map<number, ArrayBuffer> {
    let map = this.binBufferCache.get(mediaId);
    if (!map) {
      map = new Map<number, ArrayBuffer>();
      this.binBufferCache.set(mediaId, map);
    }
    return map;
  }

  /**
   * Get media directory handle
   */
  private async getMediaDir(mediaId: string): Promise<FileSystemDirectoryHandle | null> {
    const dir = await this.ensureDirectory();
    try {
      return await dir.getDirectoryHandle(mediaId);
    } catch {
      return null;
    }
  }

  /**
   * Get or create media directory handle
   */
  private async getOrCreateMediaDir(mediaId: string): Promise<FileSystemDirectoryHandle> {
    const dir = await this.ensureDirectory();
    return dir.getDirectoryHandle(mediaId, { create: true });
  }

  private async readMetadata(mediaDir: FileSystemDirectoryHandle): Promise<FilmstripMetadata | null> {
    try {
      const metaHandle = await mediaDir.getFileHandle('meta.json');
      const metaFile = await metaHandle.getFile();
      return JSON.parse(await metaFile.text()) as FilmstripMetadata;
    } catch {
      return null;
    }
  }

  private async writeJsonFile(
    mediaDir: FileSystemDirectoryHandle,
    fileName: string,
    data: unknown
  ): Promise<void> {
    const fileHandle = await mediaDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  }

  private async readLegacyFrameFiles(
    mediaDir: FileSystemDirectoryHandle
  ): Promise<{ index: number; file: File }[]> {
    const frameFiles: { index: number; file: File }[] = [];
    for await (const entry of mediaDir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.webp')) {
        const index = parseInt(entry.name.replace('.webp', ''), 10);
        if (!Number.isFinite(index)) continue;
        try {
          const fileHandle = await mediaDir.getFileHandle(entry.name);
          const file = await fileHandle.getFile();
          if (file.size > 0) {
            frameFiles.push({ index, file });
          }
        } catch {
          // Skip unreadable files.
        }
      }
    }
    frameFiles.sort((a, b) => a.index - b.index);
    return frameFiles;
  }

  private trackUrl(mediaId: string, url: string): void {
    const urls = this.objectUrls.get(mediaId) || [];
    urls.push(url);
    this.objectUrls.set(mediaId, urls);
  }

  /**
   * Create and track an object URL for a frame blob.
   * Useful when frames are streamed from workers (without immediate OPFS read-back).
   */
  createFrameUrl(mediaId: string, blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.trackUrl(mediaId, url);
    return url;
  }

  private isValidBinIndex(value: unknown): value is FilmstripBinIndex {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<FilmstripBinIndex>;
    if (candidate.version !== BIN_VERSION) return false;
    if (!Number.isFinite(candidate.framesPerBin) || (candidate.framesPerBin ?? 0) <= 0) return false;
    if (!Number.isFinite(candidate.frameCount) || (candidate.frameCount ?? 0) < 0) return false;
    if (!Array.isArray(candidate.bins)) return false;

    for (const bin of candidate.bins) {
      if (!bin || typeof bin !== 'object') return false;
      const desc = bin as Partial<FilmstripBinDescriptor>;
      if (!Number.isFinite(desc.binIndex)) return false;
      if (typeof desc.fileName !== 'string' || desc.fileName.length === 0) return false;
      if (!Array.isArray(desc.frameIndices)) return false;
      for (const frameIndex of desc.frameIndices) {
        if (!Number.isFinite(frameIndex)) return false;
      }
    }

    return true;
  }

  private async getBinIndex(
    mediaId: string,
    mediaDir: FileSystemDirectoryHandle
  ): Promise<FilmstripBinIndex | null> {
    const cached = this.binIndexCache.get(mediaId);
    if (cached) return cached;

    try {
      const handle = await mediaDir.getFileHandle(BIN_INDEX_FILE);
      const file = await handle.getFile();
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!this.isValidBinIndex(parsed)) {
        logger.warn(`Invalid bin index for filmstrip ${mediaId}`);
        return null;
      }
      const sortedBins = [...parsed.bins].sort((a, b) => a.binIndex - b.binIndex);
      const normalized: FilmstripBinIndex = {
        version: parsed.version,
        framesPerBin: parsed.framesPerBin,
        frameCount: parsed.frameCount,
        bins: sortedBins,
      };
      this.binIndexCache.set(mediaId, normalized);
      return normalized;
    } catch {
      return null;
    }
  }

  private getFrameIndicesFromBinIndex(index: FilmstripBinIndex): number[] {
    const out: number[] = [];
    for (const bin of index.bins) {
      out.push(...bin.frameIndices);
    }
    return out.sort((a, b) => a - b);
  }

  private parseBinEntries(buffer: ArrayBuffer): ParsedBinEntry[] | null {
    if (buffer.byteLength < BIN_HEADER_BYTES) return null;

    const view = new DataView(buffer);
    const entryCount = view.getUint32(0, true);
    const tableBytes = entryCount * BIN_ENTRY_BYTES;
    const payloadStart = BIN_HEADER_BYTES + tableBytes;
    if (payloadStart > buffer.byteLength) return null;

    const entries: ParsedBinEntry[] = [];
    for (let i = 0; i < entryCount; i++) {
      const offset = BIN_HEADER_BYTES + i * BIN_ENTRY_BYTES;
      const index = view.getUint32(offset, true);
      const payloadOffset = view.getUint32(offset + 4, true);
      const size = view.getUint32(offset + 8, true);
      if (size <= 0) return null;

      const start = payloadStart + payloadOffset;
      const end = start + size;
      if (start < payloadStart || end > buffer.byteLength) return null;

      entries.push({
        index,
        offset: payloadOffset,
        size,
      });
    }

    return entries;
  }

  private async getBinBuffer(
    mediaId: string,
    mediaDir: FileSystemDirectoryHandle,
    descriptor: FilmstripBinDescriptor
  ): Promise<ArrayBuffer | null> {
    const cache = this.getBinBufferMap(mediaId);
    const cached = cache.get(descriptor.binIndex);
    if (cached) return cached;

    try {
      const handle = await mediaDir.getFileHandle(descriptor.fileName);
      const file = await handle.getFile();
      if (file.size === 0) return null;
      const buffer = await file.arrayBuffer();
      cache.set(descriptor.binIndex, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  private async loadFramesFromBins(
    mediaId: string,
    mediaDir: FileSystemDirectoryHandle,
    binIndex: FilmstripBinIndex
  ): Promise<{ frames: FilmstripFrame[]; existingIndices: number[] } | null> {
    const frameRecords: { index: number; blob: Blob }[] = [];

    for (const descriptor of binIndex.bins) {
      const buffer = await this.getBinBuffer(mediaId, mediaDir, descriptor);
      if (!buffer) return null;

      const entries = this.parseBinEntries(buffer);
      if (!entries) return null;

      const payloadStart = BIN_HEADER_BYTES + entries.length * BIN_ENTRY_BYTES;
      for (const entry of entries) {
        const start = payloadStart + entry.offset;
        const end = start + entry.size;
        const blob = new Blob([buffer.slice(start, end)], { type: 'image/webp' });
        frameRecords.push({ index: entry.index, blob });
      }
    }

    frameRecords.sort((a, b) => a.index - b.index);

    const urls: string[] = [];
    const frames: FilmstripFrame[] = frameRecords.map(({ index, blob }) => {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return {
        index,
        timestamp: index / FRAME_RATE,
        url,
      };
    });
    this.objectUrls.set(mediaId, urls);

    return {
      frames,
      existingIndices: frameRecords.map((r) => r.index),
    };
  }

  private async loadSingleFrameFromBins(
    mediaId: string,
    index: number,
    mediaDir: FileSystemDirectoryHandle,
    binIndex: FilmstripBinIndex
  ): Promise<FilmstripFrame | null> {
    const descriptor = binIndex.bins.find((bin) => bin.frameIndices.includes(index));
    if (!descriptor) return null;

    const buffer = await this.getBinBuffer(mediaId, mediaDir, descriptor);
    if (!buffer) return null;

    const entries = this.parseBinEntries(buffer);
    if (!entries) return null;

    const target = entries.find((entry) => entry.index === index);
    if (!target) return null;

    const payloadStart = BIN_HEADER_BYTES + entries.length * BIN_ENTRY_BYTES;
    const start = payloadStart + target.offset;
    const end = start + target.size;
    const blob = new Blob([buffer.slice(start, end)], { type: 'image/webp' });
    const url = URL.createObjectURL(blob);
    this.trackUrl(mediaId, url);

    return {
      index,
      timestamp: index / FRAME_RATE,
      url,
    };
  }

  /**
   * Save metadata file (used by worker and fallback extraction)
   */
  async saveMetadata(
    mediaId: string,
    metadata: { width: number; height: number; isComplete: boolean; frameCount: number }
  ): Promise<void> {
    const mediaDir = await this.getOrCreateMediaDir(mediaId);
    await this.writeJsonFile(mediaDir, 'meta.json', metadata);
  }

  /**
   * Save a frame blob at a specific index
   */
  async saveFrameBlob(mediaId: string, index: number, blob: Blob): Promise<void> {
    const mediaDir = await this.getOrCreateMediaDir(mediaId);
    const fileHandle = await mediaDir.getFileHandle(`${index}.webp`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  /**
   * Compact a completed legacy filmstrip into binned storage.
   * Safe to call repeatedly; no-op if already compacted or incomplete.
   */
  async compactToBins(mediaId: string): Promise<void> {
    const pending = this.compactionPromises.get(mediaId);
    if (pending) {
      return pending;
    }

    const promise = this.runCompaction(mediaId).finally(() => {
      this.compactionPromises.delete(mediaId);
    });
    this.compactionPromises.set(mediaId, promise);
    return promise;
  }

  private async runCompaction(mediaId: string): Promise<void> {
    const mediaDir = await this.getMediaDir(mediaId);
    if (!mediaDir) return;

    const metadata = await this.readMetadata(mediaDir);
    if (!metadata || !metadata.isComplete) return;

    const existingBinIndex = await this.getBinIndex(mediaId, mediaDir);
    if (existingBinIndex) return;

    const legacyFrames = await this.readLegacyFrameFiles(mediaDir);
    if (legacyFrames.length === 0) return;

    type RawFrame = { index: number; bytes: ArrayBuffer };
    const byBin = new Map<number, RawFrame[]>();
    for (const frame of legacyFrames) {
      const bytes = await frame.file.arrayBuffer();
      if (bytes.byteLength === 0) continue;
      const binIndex = Math.floor(frame.index / FRAMES_PER_BIN);
      const group = byBin.get(binIndex) ?? [];
      group.push({ index: frame.index, bytes });
      byBin.set(binIndex, group);
    }

    const sortedBinIndexes = Array.from(byBin.keys()).sort((a, b) => a - b);
    const descriptors: FilmstripBinDescriptor[] = [];

    for (const binIndex of sortedBinIndexes) {
      const frames = byBin.get(binIndex);
      if (!frames || frames.length === 0) continue;
      frames.sort((a, b) => a.index - b.index);

      const entryCount = frames.length;
      const tableBytes = entryCount * BIN_ENTRY_BYTES;
      const payloadStart = BIN_HEADER_BYTES + tableBytes;
      const payloadBytes = frames.reduce((sum, frame) => sum + frame.bytes.byteLength, 0);
      const totalBytes = payloadStart + payloadBytes;

      const out = new ArrayBuffer(totalBytes);
      const view = new DataView(out);
      const outBytes = new Uint8Array(out);

      view.setUint32(0, entryCount, true);

      let payloadOffset = 0;
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]!;
        const tableOffset = BIN_HEADER_BYTES + i * BIN_ENTRY_BYTES;
        view.setUint32(tableOffset, frame.index, true);
        view.setUint32(tableOffset + 4, payloadOffset, true);
        view.setUint32(tableOffset + 8, frame.bytes.byteLength, true);

        outBytes.set(new Uint8Array(frame.bytes), payloadStart + payloadOffset);
        payloadOffset += frame.bytes.byteLength;
      }

      const fileName = `bin-${binIndex}.bin`;
      const handle = await mediaDir.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(out);
      await writable.close();

      descriptors.push({
        binIndex,
        fileName,
        frameIndices: frames.map((frame) => frame.index),
      });
    }

    const compactedFrameCount = descriptors.reduce((sum, descriptor) => sum + descriptor.frameIndices.length, 0);
    if (compactedFrameCount === 0) return;

    const index: FilmstripBinIndex = {
      version: BIN_VERSION,
      framesPerBin: FRAMES_PER_BIN,
      frameCount: compactedFrameCount,
      bins: descriptors,
    };
    await this.writeJsonFile(mediaDir, BIN_INDEX_FILE, index);
    this.binIndexCache.set(mediaId, index);
    this.binBufferCache.delete(mediaId);

    // Remove legacy per-frame files once the bin index is durable.
    for (const frame of legacyFrames) {
      await mediaDir.removeEntry(`${frame.index}.webp`).catch(() => {});
    }

    logger.info(
      `Compacted filmstrip ${mediaId}: ${compactedFrameCount} frames -> ${descriptors.length} bins`
    );
  }

  /**
   * Load filmstrip - returns object URLs for img src
   */
  async load(mediaId: string): Promise<LoadedFilmstrip | null> {
    try {
      const mediaDir = await this.getMediaDir(mediaId);
      if (!mediaDir) return null;

      const metadata = await this.readMetadata(mediaDir);
      if (!metadata) return null;

      let frames: FilmstripFrame[] = [];
      let existingIndices: number[] = [];

      const binIndex = await this.getBinIndex(mediaId, mediaDir);
      if (binIndex) {
        const binned = await this.loadFramesFromBins(mediaId, mediaDir, binIndex);
        if (binned) {
          frames = binned.frames;
          existingIndices = binned.existingIndices;
        } else {
          // Index is unusable; clear cache and fall back to legacy files.
          this.clearMediaCaches(mediaId);
        }
      }

      if (frames.length === 0) {
        const frameFiles = await this.readLegacyFrameFiles(mediaDir);

        // Don't revoke URLs here - they may still be in use by displayed components.
        // URLs are only cleaned up when filmstrip is explicitly deleted or cleared.
        const urls: string[] = [];
        frames = frameFiles.map(({ index, file }) => {
          const url = URL.createObjectURL(file);
          urls.push(url);
          return {
            index,
            timestamp: index / FRAME_RATE,
            url,
          };
        });
        this.objectUrls.set(mediaId, urls);
        existingIndices = frameFiles.map((f) => f.index);
      }

      // Sanity check: if marked complete but no frames, treat as incomplete
      if (metadata.isComplete && frames.length === 0) {
        logger.warn(`Filmstrip ${mediaId} marked complete but has 0 frames - resetting`);
        metadata.isComplete = false;
        metadata.frameCount = 0;
      }

      logger.debug(`Loaded filmstrip ${mediaId}: ${frames.length} frames, complete: ${metadata.isComplete}`);
      return { metadata, frames, existingIndices };
    } catch (error) {
      logger.warn('Failed to load filmstrip:', error);
      return null;
    }
  }

  /**
   * Get existing frame indices (for resume)
   */
  async getExistingIndices(mediaId: string): Promise<number[]> {
    try {
      const mediaDir = await this.getMediaDir(mediaId);
      if (!mediaDir) return [];

      const binIndex = await this.getBinIndex(mediaId, mediaDir);
      if (binIndex) {
        return this.getFrameIndicesFromBinIndex(binIndex);
      }

      const legacy = await this.readLegacyFrameFiles(mediaDir);
      return legacy.map((frame) => frame.index);
    } catch {
      return [];
    }
  }

  /**
   * Load a single frame by index - for incremental updates during extraction
   */
  async loadSingleFrame(mediaId: string, index: number): Promise<FilmstripFrame | null> {
    try {
      const mediaDir = await this.getMediaDir(mediaId);
      if (!mediaDir) return null;

      const binIndex = await this.getBinIndex(mediaId, mediaDir);
      if (binIndex) {
        const binnedFrame = await this.loadSingleFrameFromBins(mediaId, index, mediaDir, binIndex);
        if (binnedFrame) return binnedFrame;
      }

      // Fallback for legacy/in-progress extraction.
      const fileHandle = await mediaDir.getFileHandle(`${index}.webp`);
      const file = await fileHandle.getFile();
      if (file.size === 0) return null;

      const url = URL.createObjectURL(file);
      this.trackUrl(mediaId, url);

      return {
        index,
        timestamp: index / FRAME_RATE,
        url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if filmstrip is complete
   */
  async isComplete(mediaId: string): Promise<boolean> {
    try {
      const mediaDir = await this.getMediaDir(mediaId);
      if (!mediaDir) return false;

      const metadata = await this.readMetadata(mediaDir);
      return metadata?.isComplete ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Delete filmstrip
   */
  async delete(mediaId: string): Promise<void> {
    this.revokeUrls(mediaId);
    this.clearMediaCaches(mediaId);
    this.compactionPromises.delete(mediaId);
    try {
      const dir = await this.ensureDirectory();
      await dir.removeEntry(mediaId, { recursive: true });
      logger.debug(`Deleted filmstrip ${mediaId}`);
    } catch {
      // May not exist.
    }
  }

  /**
   * Revoke object URLs for a media
   */
  revokeUrls(mediaId: string): void {
    const urls = this.objectUrls.get(mediaId);
    if (urls) {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      this.objectUrls.delete(mediaId);
    }
  }

  /**
   * Clear all filmstrips
   */
  async clearAll(): Promise<void> {
    // Revoke all URLs
    for (const mediaId of this.objectUrls.keys()) {
      this.revokeUrls(mediaId);
    }
    this.binIndexCache.clear();
    this.binBufferCache.clear();
    this.compactionPromises.clear();

    try {
      const dir = await this.ensureDirectory();
      const entries: string[] = [];
      for await (const entry of dir.values()) {
        entries.push(entry.name);
      }
      for (const name of entries) {
        await dir.removeEntry(name, { recursive: true });
      }
      logger.debug(`Cleared ${entries.length} filmstrips`);
    } catch (error) {
      logger.error('Failed to clear filmstrips:', error);
    }
  }

  /**
   * List all stored filmstrips
   */
  async list(): Promise<string[]> {
    try {
      const dir = await this.ensureDirectory();
      const ids: string[] = [];
      for await (const entry of dir.values()) {
        if (entry.kind === 'directory') {
          ids.push(entry.name);
        }
      }
      return ids;
    } catch {
      return [];
    }
  }
}

// Singleton
export const filmstripOPFSStorage = new FilmstripOPFSStorage();
