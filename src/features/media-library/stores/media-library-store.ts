import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MediaLibraryState, MediaLibraryActions } from '../types';
import type { MediaMetadata } from '@/types/storage';
import { mediaLibraryService } from '../services/media-library-service';

// IMPORTANT: Always use granular selectors to prevent unnecessary re-renders!
//
// ✅ CORRECT: Use granular selectors
// const mediaItems = useMediaLibraryStore(s => s.mediaItems);
// const uploadMedia = useMediaLibraryStore(s => s.uploadMedia);
//
// ❌ WRONG: Don't destructure the entire store
// const { mediaItems, uploadMedia } = useMediaLibraryStore();

export const useMediaLibraryStore = create<
  MediaLibraryState & MediaLibraryActions
>()(
  devtools(
    (set, get) => ({
      // Initial state
      mediaItems: [],
      isLoading: false,
      uploadProgress: {},
      error: null,
      selectedMediaIds: [],
      searchQuery: '',
      filterByType: null,
      sortBy: 'date',
      viewMode: 'grid',
      storageUsed: 0,
      storageQuota: 0,

      // Load all media items from IndexedDB
      loadMediaItems: async () => {
        set({ isLoading: true, error: null });

        try {
          const mediaItems = await mediaLibraryService.getAllMedia();

          // Also refresh storage quota
          const { used, quota } = await mediaLibraryService.getStorageUsage();

          set({
            mediaItems,
            storageUsed: used,
            storageQuota: quota,
            isLoading: false,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load media';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      // Upload a single media file with optimistic update
      uploadMedia: async (file: File) => {
        const tempId = crypto.randomUUID();

        // Create temporary placeholder
        const tempItem: MediaMetadata = {
          id: tempId,
          opfsPath: '',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          duration: 0,
          width: 0,
          height: 0,
          fps: 30,
          codec: 'uploading...',
          bitrate: 0,
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Optimistic add
        const previousItems = get().mediaItems;
        set((state) => ({
          mediaItems: [tempItem, ...state.mediaItems],
          uploadProgress: { ...state.uploadProgress, [tempId]: 0 },
          error: null,
        }));

        try {
          // Upload with progress tracking
          const metadata = await mediaLibraryService.uploadMedia(
            file,
            (percent, stage) => {
              set((state) => ({
                uploadProgress: { ...state.uploadProgress, [tempId]: percent },
              }));
            }
          );

          // Replace temp with actual metadata
          set((state) => ({
            mediaItems: state.mediaItems.map((item) =>
              item.id === tempId ? metadata : item
            ),
            uploadProgress: Object.fromEntries(
              Object.entries(state.uploadProgress).filter(
                ([id]) => id !== tempId
              )
            ),
          }));

          // Refresh storage quota
          get().refreshStorageQuota();

          return metadata;
        } catch (error) {
          // Rollback optimistic update
          set((state) => ({
            mediaItems: previousItems,
            uploadProgress: Object.fromEntries(
              Object.entries(state.uploadProgress).filter(
                ([id]) => id !== tempId
              )
            ),
            error: error instanceof Error ? error.message : 'Upload failed',
          }));
          throw error;
        }
      },

      // Upload multiple files in batch
      uploadMediaBatch: async (files: File[]) => {
        set({ isLoading: true, error: null });

        try {
          const results = await mediaLibraryService.uploadMediaBatch(
            files,
            (current, total, fileName) => {
              // Could update progress UI here if needed
              console.log(`Uploading ${current}/${total}: ${fileName}`);
            }
          );

          // Add all successfully uploaded items
          set((state) => ({
            mediaItems: [...results, ...state.mediaItems],
            isLoading: false,
          }));

          // Refresh storage quota
          get().refreshStorageQuota();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Batch upload failed';
          set({ error: errorMessage, isLoading: false });
          throw error;
        }
      },

      // Delete a media item with optimistic update
      deleteMedia: async (id: string) => {
        set({ error: null });

        const previousItems = get().mediaItems;

        // Optimistic remove
        set((state) => ({
          mediaItems: state.mediaItems.filter((item) => item.id !== id),
          selectedMediaIds: state.selectedMediaIds.filter(
            (selectedId) => selectedId !== id
          ),
        }));

        try {
          await mediaLibraryService.deleteMedia(id);

          // Refresh storage quota
          get().refreshStorageQuota();
        } catch (error) {
          // Rollback on error
          set({
            mediaItems: previousItems,
            error: error instanceof Error ? error.message : 'Delete failed',
          });
          throw error;
        }
      },

      // Delete multiple media items in batch
      deleteMediaBatch: async (ids: string[]) => {
        set({ error: null });

        const previousItems = get().mediaItems;

        // Optimistic remove
        set((state) => ({
          mediaItems: state.mediaItems.filter((item) => !ids.includes(item.id)),
          selectedMediaIds: state.selectedMediaIds.filter(
            (selectedId) => !ids.includes(selectedId)
          ),
        }));

        try {
          await mediaLibraryService.deleteMediaBatch(ids);

          // Refresh storage quota
          get().refreshStorageQuota();
        } catch (error) {
          // Rollback on error
          set({
            mediaItems: previousItems,
            error:
              error instanceof Error ? error.message : 'Batch delete failed',
          });
          throw error;
        }
      },

      // Selection management
      selectMedia: (ids) => set({ selectedMediaIds: ids }),

      toggleMediaSelection: (id) =>
        set((state) => ({
          selectedMediaIds: state.selectedMediaIds.includes(id)
            ? state.selectedMediaIds.filter((selectedId) => selectedId !== id)
            : [...state.selectedMediaIds, id],
        })),

      clearSelection: () => set({ selectedMediaIds: [] }),

      // Filters and search
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFilterByType: (type) => set({ filterByType: type }),
      setSortBy: (sortBy) => set({ sortBy }),
      setViewMode: (viewMode) => set({ viewMode }),

      // Utility actions
      refreshStorageQuota: async () => {
        try {
          const { used, quota } = await mediaLibraryService.getStorageUsage();
          set({ storageUsed: used, storageQuota: quota });
        } catch (error) {
          console.error('Failed to refresh storage quota:', error);
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'MediaLibraryStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);

// Selector hooks for common use cases (optional, but recommended)
export const useMediaItems = () =>
  useMediaLibraryStore((s) => s.mediaItems);
export const useFilteredMediaItems = () => {
  const mediaItems = useMediaLibraryStore((s) => s.mediaItems);
  const searchQuery = useMediaLibraryStore((s) => s.searchQuery);
  const filterByType = useMediaLibraryStore((s) => s.filterByType);
  const sortBy = useMediaLibraryStore((s) => s.sortBy);

  // Filter by search query
  let filtered = mediaItems;
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter((item) =>
      item.fileName.toLowerCase().includes(query)
    );
  }

  // Filter by type
  if (filterByType) {
    filtered = filtered.filter((item) =>
      item.mimeType.startsWith(filterByType)
    );
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.fileName.localeCompare(b.fileName);
      case 'date':
        return b.createdAt - a.createdAt; // Newest first
      case 'size':
        return b.fileSize - a.fileSize; // Largest first
      default:
        return 0;
    }
  });

  return sorted;
};

export const useStorageQuotaPercent = () => {
  const storageUsed = useMediaLibraryStore((s) => s.storageUsed);
  const storageQuota = useMediaLibraryStore((s) => s.storageQuota);

  if (storageQuota === 0) return 0;
  return (storageUsed / storageQuota) * 100;
};
