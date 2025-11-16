import { z } from 'zod';

/**
 * Validation schema for project creation/update form
 */
export const projectFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be less than 100 characters')
    .refine((name) => name.trim().length > 0, {
      message: 'Project name cannot be only whitespace',
    }),

  description: z
    .string()
    .max(500, 'Description must be less than 500 characters')
    .optional()
    .or(z.literal('')),

  width: z
    .number()
    .int('Width must be an integer')
    .min(320, 'Width must be at least 320px')
    .max(7680, 'Width must be at most 7680px (8K)'),

  height: z
    .number()
    .int('Height must be an integer')
    .min(240, 'Height must be at least 240px')
    .max(4320, 'Height must be at most 4320px (8K)'),

  fps: z
    .number()
    .int('FPS must be an integer')
    .min(1, 'FPS must be at least 1')
    .max(240, 'FPS must be at most 240')
    .refine((fps) => [24, 25, 30, 50, 60, 120, 240].includes(fps), {
      message: 'FPS should be a common frame rate (24, 25, 30, 50, 60, 120, 240)',
    }),
});

/**
 * Type inferred from the schema
 */
export type ProjectFormData = z.infer<typeof projectFormSchema>;

/**
 * Common resolution presets
 */
export const RESOLUTION_PRESETS = [
  { label: '1280×720 (HD)', value: '1280x720', width: 1280, height: 720 },
  { label: '1920×1080 (Full HD)', value: '1920x1080', width: 1920, height: 1080 },
  { label: '2560×1440 (2K)', value: '2560x1440', width: 2560, height: 1440 },
  { label: '3840×2160 (4K)', value: '3840x2160', width: 3840, height: 2160 },
  { label: '7680×4320 (8K)', value: '7680x4320', width: 7680, height: 4320 },
] as const;

/**
 * Common FPS presets
 */
export const FPS_PRESETS = [
  { label: '24 fps (Film)', value: 24 },
  { label: '25 fps (PAL)', value: 25 },
  { label: '30 fps (Standard)', value: 30 },
  { label: '50 fps (PAL High)', value: 50 },
  { label: '60 fps (Smooth)', value: 60 },
  { label: '120 fps (High Speed)', value: 120 },
  { label: '240 fps (Ultra High Speed)', value: 240 },
] as const;

/**
 * Default form values
 */
export const DEFAULT_PROJECT_VALUES: ProjectFormData = {
  name: '',
  description: '',
  width: 1920,
  height: 1080,
  fps: 30,
};

/**
 * Validate project name uniqueness (async validation)
 */
export async function validateProjectNameUnique(
  name: string,
  existingNames: string[],
  currentProjectName?: string
): Promise<boolean> {
  const trimmedName = name.trim().toLowerCase();

  // If editing, allow the current name
  if (currentProjectName && trimmedName === currentProjectName.toLowerCase()) {
    return true;
  }

  return !existingNames.some((existing) => existing.toLowerCase() === trimmedName);
}

/**
 * Get resolution aspect ratio
 */
export function getAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);

  const ratioWidth = width / divisor;
  const ratioHeight = height / divisor;

  // Common aspect ratios
  if (ratioWidth === 16 && ratioHeight === 9) return '16:9';
  if (ratioWidth === 4 && ratioHeight === 3) return '4:3';
  if (ratioWidth === 21 && ratioHeight === 9) return '21:9';
  if (ratioWidth === 1 && ratioHeight === 1) return '1:1';

  return `${ratioWidth}:${ratioHeight}`;
}

/**
 * Calculate estimated file size based on resolution and fps
 */
export function estimateProjectSize(
  width: number,
  height: number,
  fps: number,
  durationSeconds: number = 60
): {
  raw: number; // bytes
  compressed: number; // bytes
  formatted: string;
} {
  // Very rough estimation:
  // Raw: width * height * 3 (RGB) * fps * duration
  // Compressed: ~10% of raw (typical H.264 compression)
  const raw = width * height * 3 * fps * durationSeconds;
  const compressed = raw * 0.1;

  const formatted = formatBytes(compressed);

  return { raw, compressed, formatted };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
