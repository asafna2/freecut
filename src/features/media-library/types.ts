import type { MediaMetadata } from '@/types/storage';

export interface MediaLibraryState {
  mediaItems: MediaMetadata[];
  isLoading: boolean;
  uploadProgress: Record<string, number>; // Progress per file (fileId -> percent)
  error: string | null;
  selectedMediaIds: string[];
  searchQuery: string;
  filterByType: 'video' | 'audio' | 'image' | null;
  sortBy: 'name' | 'date' | 'size';
  viewMode: 'grid' | 'list';
  storageUsed: number;
  storageQuota: number;
}

export interface MediaLibraryActions {
  // CRUD Operations
  loadMediaItems: () => Promise<void>;
  uploadMedia: (file: File) => Promise<MediaMetadata>;
  uploadMediaBatch: (files: File[]) => Promise<void>;
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
  refreshStorageQuota: () => Promise<void>;
  clearError: () => void;
}
