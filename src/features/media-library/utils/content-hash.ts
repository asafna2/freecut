/**
 * Content hashing utilities for media deduplication
 *
 * Uses SHA-256 to generate content-addressable hashes for media files.
 * This enables deduplication - same file uploaded multiple times is stored once.
 */

/**
 * Compute SHA-256 hash of a File
 *
 * @param file - The file to hash
 * @param onProgress - Optional progress callback (0-100)
 * @returns Hex-encoded SHA-256 hash string
 */
export async function computeContentHash(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  onProgress?.(0);

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  onProgress?.(50);

  // Compute SHA-256 hash using Web Crypto API
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  onProgress?.(90);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  onProgress?.(100);
  return hashHex;
}

/**
 * Compute SHA-256 hash from an ArrayBuffer
 *
 * @param buffer - The buffer to hash
 * @returns Hex-encoded SHA-256 hash string
 */
export async function computeContentHashFromBuffer(
  buffer: ArrayBuffer
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
