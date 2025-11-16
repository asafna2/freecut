import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Project } from '@/types/project';

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
}

const DB_NAME = 'video-editor-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<VideoEditorDB>> | null = null;

/**
 * Initialize and get the IndexedDB database instance
 */
export async function getDB(): Promise<IDBPDatabase<VideoEditorDB>> {
  if (!dbPromise) {
    dbPromise = openDB<VideoEditorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create projects object store
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', {
            keyPath: 'id',
          });

          // Create indexes for efficient queries
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          projectStore.createIndex('createdAt', 'createdAt', { unique: false });
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
