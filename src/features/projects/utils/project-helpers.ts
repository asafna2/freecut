import type { Project } from '@/types/project';

/**
 * Generate a unique project ID (8-character base62 hash)
 */
export function generateProjectId(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => chars[b % 62]).join('');
}

/**
 * Format date to relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (weeks < 4) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

/**
 * Format date to locale string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date and time
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Search filter function
 */
export function filterProjects(
  projects: Project[],
  searchQuery: string
): Project[] {
  if (!searchQuery.trim()) return projects;

  const query = searchQuery.toLowerCase().trim();

  return projects.filter(
    (project) =>
      project.name.toLowerCase().includes(query) ||
      project.description?.toLowerCase().includes(query)
  );
}

/**
 * Filter projects by resolution
 */
export function filterByResolution(
  projects: Project[],
  resolution?: string
): Project[] {
  if (!resolution) return projects;

  return projects.filter((project) => {
    if (!project?.metadata?.width || !project?.metadata?.height) return false;
    const projectResolution = `${project.metadata.width}x${project.metadata.height}`;
    return projectResolution === resolution;
  });
}

/**
 * Filter projects by FPS
 */
export function filterByFps(projects: Project[], fps?: number): Project[] {
  if (!fps) return projects;

  return projects.filter((project) => project?.metadata?.fps === fps);
}

/**
 * Sort projects
 */
export type SortField = 'name' | 'createdAt' | 'updatedAt' | 'resolution';
export type SortDirection = 'asc' | 'desc';

export function sortProjects(
  projects: Project[],
  field: SortField,
  direction: SortDirection = 'desc'
): Project[] {
  const sorted = [...projects].sort((a, b) => {
    let comparison = 0;

    switch (field) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'createdAt':
        comparison = a.createdAt - b.createdAt;
        break;
      case 'updatedAt':
        comparison = a.updatedAt - b.updatedAt;
        break;
      case 'resolution':
        const aRes = (a?.metadata?.width || 0) * (a?.metadata?.height || 0);
        const bRes = (b?.metadata?.width || 0) * (b?.metadata?.height || 0);
        comparison = aRes - bRes;
        break;
    }

    return direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

/**
 * Get unique resolutions from projects
 */
export function getUniqueResolutions(projects: Project[]): string[] {
  const resolutions = new Set(
    projects
      .filter((p) => p?.metadata?.width && p?.metadata?.height)
      .map((p) => `${p.metadata.width}x${p.metadata.height}`)
  );
  return Array.from(resolutions).sort();
}

/**
 * Get unique FPS values from projects
 */
export function getUniqueFps(projects: Project[]): number[] {
  const fpsSet = new Set(
    projects
      .filter((p) => p?.metadata?.fps)
      .map((p) => p.metadata.fps)
  );
  return Array.from(fpsSet).sort((a, b) => a - b);
}

/**
 * Debounce function for search
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Create a new project object
 */
export function createProjectObject(
  formData: {
    name: string;
    description?: string;
    width: number;
    height: number;
    fps: number;
  },
  id?: string
): Project {
  const now = Date.now();

  return {
    id: id || generateProjectId(),
    name: formData.name,
    description: formData.description || '',
    metadata: {
      width: formData.width,
      height: formData.height,
      fps: formData.fps,
    },
    createdAt: now,
    updatedAt: now,
    thumbnail: undefined,
  };
}

/**
 * Duplicate project with new ID and name
 */
export function duplicateProject(project: Project): Project {
  const now = Date.now();

  return {
    ...project,
    id: generateProjectId(),
    name: `${project.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Calculate project statistics
 */
export function calculateProjectStats(projects: Project[]): {
  totalProjects: number;
  totalSize: number;
  averageResolution: { width: number; height: number };
  mostCommonFps: number;
} {
  const totalProjects = projects.length;

  if (totalProjects === 0) {
    return {
      totalProjects: 0,
      totalSize: 0,
      averageResolution: { width: 0, height: 0 },
      mostCommonFps: 30,
    };
  }

  // Calculate average resolution
  const totalWidth = projects.reduce((sum, p) => sum + (p?.metadata?.width || 0), 0);
  const totalHeight = projects.reduce((sum, p) => sum + (p?.metadata?.height || 0), 0);

  const averageResolution = {
    width: Math.round(totalWidth / totalProjects),
    height: Math.round(totalHeight / totalProjects),
  };

  // Find most common FPS
  const fpsCount: Record<number, number> = {};
  projects.forEach((p) => {
    const fps = p?.metadata?.fps;
    if (fps) {
      fpsCount[fps] = (fpsCount[fps] || 0) + 1;
    }
  });

  const mostCommonFps =
    parseInt(
      Object.entries(fpsCount).sort(([, a], [, b]) => b - a)[0]?.[0] || '30'
    ) || 30;

  return {
    totalProjects,
    totalSize: 0, // TODO: Calculate from actual media files
    averageResolution,
    mostCommonFps,
  };
}
