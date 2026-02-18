/**
 * Detects whether a media item's audio codec requires custom decoding
 * for preview playback (browser can't natively decode it).
 *
 * AC-3 (Dolby Digital) and E-AC-3 (Dolby Digital Plus) are common in
 * screen recordings and downloaded videos but aren't supported by
 * Chrome's <video> element audio decoder.
 */

const AC3_CODEC_PATTERN = /(^|[^a-z0-9])(ac-?3|ec-?3|e-?ac-?3|eac3)([^a-z0-9]|$)/i;

export function needsCustomAudioDecoder(audioCodec: string | undefined): boolean {
  if (!audioCodec) return false;

  const normalized = audioCodec.toLowerCase().trim();
  if (AC3_CODEC_PATTERN.test(normalized)) return true;

  // Some containers expose human-readable codec labels instead of short IDs.
  return normalized.includes('dolby digital');
}
