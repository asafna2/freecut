/**
 * Content path utilities for content-addressable storage
 *
 * Generates OPFS paths based on content hash using directory sharding
 * to avoid large directories (browser limitations).
 *
 * Path structure: content/{hash[0:2]}/{hash[2:4]}/{full-hash}/data
 * Example: content/a1/b2/a1b2c3d4e5f6.../data
 */

/**
 * Get the OPFS path for a content hash
 *
 * Uses 2-level directory sharding (256 x 256 = 65,536 possible directories)
 * to keep directory sizes manageable.
 *
 * @param contentHash - SHA-256 hash of the content
 * @returns OPFS path string
 */
export function getContentPath(contentHash: string): string {
  const shard1 = contentHash.substring(0, 2);
  const shard2 = contentHash.substring(2, 4);
  return `content/${shard1}/${shard2}/${contentHash}/data`;
}

/**
 * Extract the content hash from a content path
 *
 * @param path - OPFS path in format content/{s1}/{s2}/{hash}/data
 * @returns The content hash, or null if path is invalid
 */
export function getHashFromContentPath(path: string): string | null {
  const match = path.match(/^content\/[a-f0-9]{2}\/[a-f0-9]{2}\/([a-f0-9]{64})\/data$/);
  return match?.[1] ?? null;
}

/**
 * Check if a path is a content-addressable path
 *
 * @param path - OPFS path to check
 * @returns True if path is in content-addressable format
 */
export function isContentPath(path: string): boolean {
  return path.startsWith('content/') && path.endsWith('/data');
}

/**
 * Get the legacy media path format (for migration)
 *
 * @param mediaId - UUID of the media
 * @param fileName - Original filename
 * @returns Legacy OPFS path string
 */
export function getLegacyMediaPath(mediaId: string, fileName: string): string {
  return `media/${mediaId}/${fileName}`;
}
