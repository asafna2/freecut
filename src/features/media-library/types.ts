import type { MediaMetadata } from '@/types/storage';

export interface MediaLibraryNotification {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface MediaLibraryState {
  currentProjectId: string | null; // v3: Project context for scoped operations
  mediaItems: MediaMetadata[];
  isLoading: boolean;
  importingIds: string[]; // IDs of media items currently being imported
  error: string | null;
  notification: MediaLibraryNotification | null;
  selectedMediaIds: string[];
  searchQuery: string;
  filterByType: 'video' | 'audio' | 'image' | null;
  sortBy: 'name' | 'date' | 'size';
  viewMode: 'grid' | 'list';
}

export interface MediaLibraryActions {
  // v3: Project context
  setCurrentProject: (projectId: string | null) => void;

  // CRUD Operations (project-scoped in v3)
  loadMediaItems: () => Promise<void>;
  /**
   * Import media using file picker (instant, no copy - local-first)
   * Uses FileSystemFileHandle to reference files directly on user's disk
   */
  importMedia: () => Promise<MediaMetadata[]>;
  /**
   * Import media from file handles (for drag-drop)
   * Uses FileSystemFileHandle directly without file picker
   */
  importHandles: (handles: FileSystemFileHandle[]) => Promise<MediaMetadata[]>;
  deleteMedia: (id: string) => Promise<void>;
  deleteMediaBatch: (ids: string[]) => Promise<void>;

  // Selection
  selectMedia: (ids: string[]) => void;
  toggleMediaSelection: (id: string) => void;
  clearSelection: () => void;

  // Filters & Search
  setSearchQuery: (query: string) => void;
  setFilterByType: (type: 'video' | 'audio' | 'image' | null) => void;
  setSortBy: (sortBy: 'name' | 'date' | 'size') => void;
  setViewMode: (viewMode: 'grid' | 'list') => void;

  // Utility
  clearError: () => void;
  showNotification: (notification: MediaLibraryNotification) => void;
  clearNotification: () => void;
}
