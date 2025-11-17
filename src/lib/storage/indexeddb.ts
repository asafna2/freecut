import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Project } from '@/types/project';
import type { MediaMetadata, ThumbnailData } from '@/types/storage';

// Database schema
interface VideoEditorDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
    indexes: {
      name: string;
      updatedAt: number;
      createdAt: number;
    };
  };
  media: {
    key: string;
    value: MediaMetadata;
    indexes: {
      fileName: string;
      mimeType: string;
      createdAt: number;
      tags: string;
    };
  };
  thumbnails: {
    key: string;
    value: ThumbnailData;
    indexes: {
      mediaId: string;
    };
  };
}

const DB_NAME = 'video-editor-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<VideoEditorDB>> | null = null;

/**
 * Initialize and get the IndexedDB database instance
 */
export async function getDB(): Promise<IDBPDatabase<VideoEditorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VideoEditorDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Create projects object store (v1)
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', {
            keyPath: 'id',
          });

          // Create indexes for efficient queries
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          projectStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create media object store (v2)
        if (oldVersion < 2 && !db.objectStoreNames.contains('media')) {
          const mediaStore = db.createObjectStore('media', {
            keyPath: 'id',
          });

          // Create indexes for efficient queries
          mediaStore.createIndex('fileName', 'fileName', { unique: false });
          mediaStore.createIndex('mimeType', 'mimeType', { unique: false });
          mediaStore.createIndex('createdAt', 'createdAt', { unique: false });
          mediaStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }

        // Create thumbnails object store (v2)
        if (oldVersion < 2 && !db.objectStoreNames.contains('thumbnails')) {
          const thumbnailStore = db.createObjectStore('thumbnails', {
            keyPath: 'id',
          });

          // Create index for finding thumbnails by media ID
          thumbnailStore.createIndex('mediaId', 'mediaId', { unique: false });
        }
      },
      blocked() {
        console.warn(
          'Database upgrade blocked. Close other tabs with this app open.'
        );
      },
      blocking() {
        console.warn(
          'This connection is blocking a database upgrade in another tab.'
        );
      },
    });
  }

  return dbPromise;
}

/**
 * Check storage quota and usage
 */
export async function checkStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
  available: number;
}> {
  if (!navigator.storage || !navigator.storage.estimate) {
    throw new Error('Storage estimation API not supported');
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage || 0;
  const quota = estimate.quota || 0;
  const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
  const available = quota - usage;

  return {
    usage,
    quota,
    percentUsed,
    available,
  };
}

/**
 * Check if there's enough storage space for a given size
 */
export async function hasEnoughSpace(requiredBytes: number): Promise<boolean> {
  const { available } = await checkStorageQuota();
  return available >= requiredBytes;
}

/**
 * Get all projects from IndexedDB
 */
export async function getAllProjects(): Promise<Project[]> {
  try {
    const db = await getDB();
    return await db.getAll('projects');
  } catch (error) {
    console.error('Failed to get all projects:', error);
    throw new Error('Failed to load projects from database');
  }
}

/**
 * Get a single project by ID
 */
export async function getProject(id: string): Promise<Project | undefined> {
  try {
    const db = await getDB();
    return await db.get('projects', id);
  } catch (error) {
    console.error(`Failed to get project ${id}:`, error);
    throw new Error(`Failed to load project: ${id}`);
  }
}

/**
 * Create a new project in IndexedDB
 */
export async function createProject(project: Project): Promise<Project> {
  try {
    // Check if we have enough storage
    const projectSize = new Blob([JSON.stringify(project)]).size;
    const hasSpace = await hasEnoughSpace(projectSize);

    if (!hasSpace) {
      const { percentUsed } = await checkStorageQuota();
      throw new Error(
        `Insufficient storage space. ${percentUsed.toFixed(1)}% of quota used.`
      );
    }

    const db = await getDB();
    await db.add('projects', project);
    return project;
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new Error(
        'Storage quota exceeded. Please delete some projects to free up space.'
      );
    }
    console.error('Failed to create project:', error);
    throw error;
  }
}

/**
 * Update an existing project in IndexedDB
 */
export async function updateProject(
  id: string,
  updates: Partial<Project>
): Promise<Project> {
  try {
    const db = await getDB();
    const existing = await db.get('projects', id);

    if (!existing) {
      throw new Error(`Project not found: ${id}`);
    }

    const updated: Project = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: Date.now(), // Update timestamp
    };

    await db.put('projects', updated);
    return updated;
  } catch (error) {
    console.error(`Failed to update project ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a project from IndexedDB
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('projects', id);
  } catch (error) {
    console.error(`Failed to delete project ${id}:`, error);
    throw new Error(`Failed to delete project: ${id}`);
  }
}

/**
 * Search projects by name (case-insensitive)
 */
export async function searchProjects(query: string): Promise<Project[]> {
  try {
    const db = await getDB();
    const allProjects = await db.getAll('projects');

    const lowerQuery = query.toLowerCase();
    return allProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(lowerQuery) ||
        project.description?.toLowerCase().includes(lowerQuery)
    );
  } catch (error) {
    console.error('Failed to search projects:', error);
    throw new Error('Failed to search projects');
  }
}

/**
 * Get projects sorted by a specific field
 */
export async function getProjectsSorted(
  field: 'name' | 'updatedAt' | 'createdAt',
  direction: 'asc' | 'desc' = 'desc'
): Promise<Project[]> {
  try {
    const db = await getDB();
    const tx = db.transaction('projects', 'readonly');
    const index = tx.store.index(field);

    const projects =
      direction === 'asc'
        ? await index.getAll()
        : await index.getAll(undefined, undefined);

    if (direction === 'desc') {
      projects.reverse();
    }

    return projects;
  } catch (error) {
    console.error('Failed to get sorted projects:', error);
    throw new Error('Failed to load sorted projects');
  }
}

/**
 * Clear all projects (useful for testing or reset)
 */
export async function clearAllProjects(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear('projects');
  } catch (error) {
    console.error('Failed to clear projects:', error);
    throw new Error('Failed to clear all projects');
  }
}

/**
 * Get database statistics
 */
export async function getDBStats(): Promise<{
  projectCount: number;
  storageUsed: number;
  storageQuota: number;
}> {
  try {
    const db = await getDB();
    const projectCount = await db.count('projects');
    const { usage, quota } = await checkStorageQuota();

    return {
      projectCount,
      storageUsed: usage,
      storageQuota: quota,
    };
  } catch (error) {
    console.error('Failed to get DB stats:', error);
    return {
      projectCount: 0,
      storageUsed: 0,
      storageQuota: 0,
    };
  }
}

// ============================================
// Media Library CRUD Operations
// ============================================

/**
 * Get all media items from IndexedDB
 */
export async function getAllMedia(): Promise<MediaMetadata[]> {
  try {
    const db = await getDB();
    return await db.getAll('media');
  } catch (error) {
    console.error('Failed to get all media:', error);
    throw new Error('Failed to load media from database');
  }
}

/**
 * Get a single media item by ID
 */
export async function getMedia(id: string): Promise<MediaMetadata | undefined> {
  try {
    const db = await getDB();
    return await db.get('media', id);
  } catch (error) {
    console.error(`Failed to get media ${id}:`, error);
    throw new Error(`Failed to load media: ${id}`);
  }
}

/**
 * Create a new media item in IndexedDB
 */
export async function createMedia(media: MediaMetadata): Promise<MediaMetadata> {
  try {
    const db = await getDB();
    await db.add('media', media);
    return media;
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new Error(
        'Storage quota exceeded. Please delete some media to free up space.'
      );
    }
    console.error('Failed to create media:', error);
    throw error;
  }
}

/**
 * Update an existing media item in IndexedDB
 */
export async function updateMedia(
  id: string,
  updates: Partial<MediaMetadata>
): Promise<MediaMetadata> {
  try {
    const db = await getDB();
    const existing = await db.get('media', id);

    if (!existing) {
      throw new Error(`Media not found: ${id}`);
    }

    const updated: MediaMetadata = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: Date.now(), // Update timestamp
    };

    await db.put('media', updated);
    return updated;
  } catch (error) {
    console.error(`Failed to update media ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a media item from IndexedDB
 */
export async function deleteMedia(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('media', id);
  } catch (error) {
    console.error(`Failed to delete media ${id}:`, error);
    throw new Error(`Failed to delete media: ${id}`);
  }
}

/**
 * Search media by filename (case-insensitive)
 */
export async function searchMedia(query: string): Promise<MediaMetadata[]> {
  try {
    const db = await getDB();
    const allMedia = await db.getAll('media');

    const lowerQuery = query.toLowerCase();
    return allMedia.filter((media) =>
      media.fileName.toLowerCase().includes(lowerQuery)
    );
  } catch (error) {
    console.error('Failed to search media:', error);
    throw new Error('Failed to search media');
  }
}

/**
 * Get media items by type
 */
export async function getMediaByType(
  mimeTypePrefix: string
): Promise<MediaMetadata[]> {
  try {
    const db = await getDB();
    const allMedia = await db.getAll('media');

    return allMedia.filter((media) =>
      media.mimeType.startsWith(mimeTypePrefix)
    );
  } catch (error) {
    console.error('Failed to get media by type:', error);
    throw new Error('Failed to load media by type');
  }
}

/**
 * Batch delete multiple media items
 */
export async function batchDeleteMedia(ids: string[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('media', 'readwrite');

    for (const id of ids) {
      await tx.store.delete(id);
    }

    await tx.done;
  } catch (error) {
    console.error('Failed to batch delete media:', error);
    throw new Error('Failed to delete media items');
  }
}

// ============================================
// Thumbnail CRUD Operations
// ============================================

/**
 * Save a thumbnail to IndexedDB
 */
export async function saveThumbnail(thumbnail: ThumbnailData): Promise<void> {
  try {
    const db = await getDB();
    await db.put('thumbnails', thumbnail);
  } catch (error) {
    console.error('Failed to save thumbnail:', error);
    throw new Error('Failed to save thumbnail');
  }
}

/**
 * Get a thumbnail by ID
 */
export async function getThumbnail(
  id: string
): Promise<ThumbnailData | undefined> {
  try {
    const db = await getDB();
    return await db.get('thumbnails', id);
  } catch (error) {
    console.error(`Failed to get thumbnail ${id}:`, error);
    throw new Error(`Failed to load thumbnail: ${id}`);
  }
}

/**
 * Get a thumbnail by media ID
 */
export async function getThumbnailByMediaId(
  mediaId: string
): Promise<ThumbnailData | undefined> {
  try {
    const db = await getDB();
    const tx = db.transaction('thumbnails', 'readonly');
    const index = tx.store.index('mediaId');
    const thumbnails = await index.getAll(mediaId);

    return thumbnails[0]; // Return first thumbnail for this media
  } catch (error) {
    console.error(`Failed to get thumbnail for media ${mediaId}:`, error);
    return undefined;
  }
}

/**
 * Delete a thumbnail from IndexedDB
 */
export async function deleteThumbnail(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('thumbnails', id);
  } catch (error) {
    console.error(`Failed to delete thumbnail ${id}:`, error);
    throw new Error(`Failed to delete thumbnail: ${id}`);
  }
}

/**
 * Delete thumbnails by media ID
 */
export async function deleteThumbnailsByMediaId(mediaId: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('thumbnails', 'readwrite');
    const index = tx.store.index('mediaId');
    const thumbnails = await index.getAll(mediaId);

    for (const thumbnail of thumbnails) {
      await tx.store.delete(thumbnail.id);
    }

    await tx.done;
  } catch (error) {
    console.error(`Failed to delete thumbnails for media ${mediaId}:`, error);
    throw new Error('Failed to delete thumbnails');
  }
}
