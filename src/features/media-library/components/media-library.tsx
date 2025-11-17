import { useEffect, useRef, useState } from 'react';
import { Search, Filter, SortAsc, Video, FileAudio, Image as ImageIcon, Trash2, Grid3x3, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MediaGrid } from './media-grid';
import { useMediaLibraryStore, useStorageQuotaPercent } from '../stores/media-library-store';
import { formatBytes } from '../utils/validation';

export interface MediaLibraryProps {
  onMediaSelect?: (mediaId: string) => void;
}

export function MediaLibrary({ onMediaSelect }: MediaLibraryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Store selectors
  const loadMediaItems = useMediaLibraryStore((s) => s.loadMediaItems);
  const uploadMediaBatch = useMediaLibraryStore((s) => s.uploadMediaBatch);
  const deleteMediaBatch = useMediaLibraryStore((s) => s.deleteMediaBatch);
  const searchQuery = useMediaLibraryStore((s) => s.searchQuery);
  const setSearchQuery = useMediaLibraryStore((s) => s.setSearchQuery);
  const filterByType = useMediaLibraryStore((s) => s.filterByType);
  const setFilterByType = useMediaLibraryStore((s) => s.setFilterByType);
  const sortBy = useMediaLibraryStore((s) => s.sortBy);
  const setSortBy = useMediaLibraryStore((s) => s.setSortBy);
  const viewMode = useMediaLibraryStore((s) => s.viewMode);
  const setViewMode = useMediaLibraryStore((s) => s.setViewMode);
  const selectedMediaIds = useMediaLibraryStore((s) => s.selectedMediaIds);
  const clearSelection = useMediaLibraryStore((s) => s.clearSelection);
  const error = useMediaLibraryStore((s) => s.error);
  const clearError = useMediaLibraryStore((s) => s.clearError);
  const storageUsed = useMediaLibraryStore((s) => s.storageUsed);
  const storageQuota = useMediaLibraryStore((s) => s.storageQuota);
  const storagePercent = useStorageQuotaPercent();

  // Load media items on mount
  useEffect(() => {
    loadMediaItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount - loadMediaItems is a stable Zustand action

  // Clear selection when clicking outside the media library
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Only clear if there's a selection
      if (selectedMediaIds.length === 0) return;

      // Check if click was outside the media library container
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        clearSelection();
      }
    };

    // Add listener
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedMediaIds.length, clearSelection]);

  const handleUpload = async (files: File[]) => {
    try {
      await uploadMediaBatch(files);
    } catch (error) {
      console.error('Upload failed:', error);
      // Error is already set in store
    }
  };

  const handleDeleteSelected = () => {
    if (selectedMediaIds.length === 0) return;
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    setShowDeleteDialog(false);
    try {
      await deleteMediaBatch(selectedMediaIds);
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Header with storage info */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="mb-3">
          <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2">
            <span className="text-primary">MEDIA</span>
            <span>/</span>
            <span>Library</span>
          </h2>
        </div>

        {/* Storage quota - compact progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-muted-foreground uppercase tracking-wider">Storage</span>
            <span className="text-primary font-bold">
              {formatBytes(storageUsed)} / {formatBytes(storageQuota)}
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded overflow-hidden border border-border/50 relative">
            <div
              className={`h-full transition-all duration-500 ${
                storagePercent > 90
                  ? 'bg-destructive'
                  : storagePercent > 70
                  ? 'bg-yellow-500'
                  : 'bg-primary'
              }`}
              style={{ width: `${Math.min(storagePercent, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-destructive/10 border border-destructive/50 rounded text-xs animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-start justify-between gap-2">
            <p className="text-destructive leading-relaxed flex-1">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearError}
              className="h-6 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Search and filters */}
      <div className="px-4 pt-3 pb-2 space-y-2 flex-shrink-0">
        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Search media..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-7 bg-secondary border border-border focus:border-primary text-foreground placeholder:text-muted-foreground text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
        </div>

        {/* Filters and sort */}
        <div className="flex items-center gap-1.5">
          {/* Filter by type */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-6 bg-secondary border text-[10px] px-2 ${
                  filterByType
                    ? 'border-primary text-primary hover:bg-primary/10'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-primary'
                }`}
              >
                <Filter className="w-2.5 h-2.5 mr-1" />
                {filterByType ? filterByType.toUpperCase() : 'ALL'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-popover border border-border">
              <DropdownMenuItem
                onClick={() => setFilterByType(null)}
                className="text-xs hover:bg-accent hover:text-accent-foreground"
              >
                All Types
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={() => setFilterByType('video')}
                className="text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <Video className="w-3 h-3 mr-2" />
                Video
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilterByType('audio')}
                className="text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <FileAudio className="w-3 h-3 mr-2" />
                Audio
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilterByType('image')}
                className="text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <ImageIcon className="w-3 h-3 mr-2" />
                Image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort by */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 bg-secondary border border-border text-muted-foreground hover:border-primary/50 hover:text-primary text-[10px] px-2"
              >
                <SortAsc className="w-2.5 h-2.5 mr-1" />
                {sortBy === 'name' ? 'NAME' : sortBy === 'date' ? 'DATE' : 'SIZE'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-popover border border-border">
              <DropdownMenuItem
                onClick={() => setSortBy('date')}
                className="text-xs hover:bg-accent hover:text-accent-foreground"
              >
                Date (Newest)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy('name')}
                className="text-xs hover:bg-accent hover:text-accent-foreground"
              >
                Name (A-Z)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortBy('size')}
                className="text-xs hover:bg-accent hover:text-accent-foreground"
              >
                Size (Largest)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View mode toggle */}
          <div className="flex items-center border border-border rounded bg-secondary ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('grid')}
              className={`h-6 w-6 p-0 rounded-none rounded-l ${
                viewMode === 'grid'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Grid3x3 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode('list')}
              className={`h-6 w-6 p-0 rounded-none rounded-r ${
                viewMode === 'list'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Media grid (scrollable) - now also acts as dropzone */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <MediaGrid
          onMediaSelect={onMediaSelect}
          onUpload={handleUpload}
          disabled={storagePercent >= 100}
          viewMode={viewMode}
        />
      </div>

      {/* Delete button - anchored at bottom */}
      {selectedMediaIds.length > 0 && (
        <div className="border-t border-border px-4 py-3 flex items-center justify-between animate-in fade-in slide-in-from-bottom-2 duration-200 flex-shrink-0">
          <span className="text-xs font-mono text-primary font-bold">
            {selectedMediaIds.length} SELECTED
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-accent border border-border"
            >
              Clear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteSelected}
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border border-destructive/50 font-medium"
            >
              <Trash2 className="w-3 h-3 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected items?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedMediaIds.length} selected item{selectedMediaIds.length > 1 ? 's' : ''}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete {selectedMediaIds.length} item{selectedMediaIds.length > 1 ? 's' : ''}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
