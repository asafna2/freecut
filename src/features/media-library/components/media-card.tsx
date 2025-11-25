import { useState, useEffect } from 'react';
import { Video, FileAudio, Image as ImageIcon, MoreVertical, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { MediaMetadata } from '@/types/storage';
import { mediaLibraryService } from '../services/media-library-service';
import { getMediaType, formatDuration } from '../utils/validation';

export interface MediaCardProps {
  media: MediaMetadata;
  selected?: boolean;
  onSelect?: (event: React.MouseEvent) => void;
  onDelete?: () => void;
  viewMode?: 'grid' | 'list';
}

export function MediaCard({ media, selected = false, onSelect, onDelete, viewMode = 'grid' }: MediaCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const mediaType = getMediaType(media.mimeType);

  // Load thumbnail on mount
  useEffect(() => {
    let mounted = true;
    let currentUrl: string | null = null;

    const loadThumbnail = async () => {
      const url = await mediaLibraryService.getThumbnailBlobUrl(media.id);
      if (mounted) {
        currentUrl = url;
        setThumbnailUrl(url);
      } else if (url) {
        // If unmounted during async operation, clean up the created URL
        URL.revokeObjectURL(url);
      }
    };

    loadThumbnail();

    return () => {
      mounted = false;
      // Cleanup blob URL using the ref from closure
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [media.id]);

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.();
  };

  const handleDragStart = (e: React.DragEvent) => {
    // Set drag data for timeline drop
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({
        type: 'media-item',
        mediaId: media.id,
        mediaType: mediaType,
        fileName: media.fileName,
      })
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    onSelect?.(e);
  };

  const getIcon = () => {
    switch (mediaType) {
      case 'video':
        return <Video className="w-5 h-5 text-primary" />;
      case 'audio':
        return <FileAudio className="w-5 h-5 text-green-500" />;
      case 'image':
        return <ImageIcon className="w-5 h-5 text-blue-500" />;
      default:
        return <Video className="w-5 h-5 text-muted-foreground" />;
    }
  };

  // List view
  if (viewMode === 'list') {
    return (
      <div
        className={`
          group panel-bg border rounded overflow-hidden
          transition-all duration-200 cursor-pointer
          flex items-center gap-3 p-2
          ${selected
            ? 'border-primary ring-1 ring-primary/20'
            : 'border-border hover:border-primary/50'
          }
        `}
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
      >
        {/* Thumbnail */}
        <div className="w-16 h-12 bg-secondary rounded overflow-hidden flex-shrink-0 relative">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={media.fileName}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {getIcon()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-medium text-foreground truncate">
            {media.fileName}
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Type badge inline */}
            <div className="p-0.5 rounded bg-primary/90 text-primary-foreground flex-shrink-0">
              {mediaType === 'video' && <Video className="w-2.5 h-2.5" />}
              {mediaType === 'audio' && <FileAudio className="w-2.5 h-2.5" />}
              {mediaType === 'image' && <ImageIcon className="w-2.5 h-2.5" />}
            </div>

            {/* Duration only */}
            {(mediaType === 'video' || mediaType === 'audio') && media.duration > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {formatDuration(media.duration)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 transition-all hover:bg-primary/20 hover:text-primary flex-shrink-0"
            >
              <MoreVertical className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="w-3 h-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Grid view
  return (
    <div
      className={`
        group relative panel-bg border-2 rounded-lg overflow-hidden
        transition-all duration-300 cursor-pointer
        aspect-square flex flex-col hover:scale-[1.02]
        ${selected
          ? 'border-primary ring-2 ring-primary/20 scale-[1.02]'
          : 'border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10'
        }
      `}
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
    >
      {/* Film strip perforations effect */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary via-muted to-secondary" />
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary via-muted to-secondary" />

      {/* Thumbnail - takes most of square space */}
      <div className="flex-1 bg-secondary relative overflow-hidden min-h-0">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={media.fileName}
            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-panel-bg">
            {getIcon()}
          </div>
        )}

        {/* Selection glow - subtle overlay only */}
        {selected && (
          <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
        )}

        {/* Overlaid badges */}
        <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-between gap-1 pointer-events-none">
          {/* Type icon badge - icon only */}
          <div className="p-0.5 rounded bg-primary/90 text-primary-foreground">
            {mediaType === 'video' && <Video className="w-2.5 h-2.5" />}
            {mediaType === 'audio' && <FileAudio className="w-2.5 h-2.5" />}
            {mediaType === 'image' && <ImageIcon className="w-2.5 h-2.5" />}
          </div>

          {/* Duration badge */}
          {(mediaType === 'video' || mediaType === 'audio') && media.duration > 0 && (
            <div className="px-1 py-0.5 bg-black/70 border border-white/20 rounded text-[8px] font-mono text-white">
              {formatDuration(media.duration)}
            </div>
          )}
        </div>
      </div>

      {/* Content footer - minimal */}
      <div className="px-1.5 py-1 bg-panel-bg/50 flex-shrink-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex-1 min-w-0">
            <h3 className="text-[10px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
              {media.fileName}
            </h3>
          </div>

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 transition-all hover:bg-primary/20 hover:text-primary flex-shrink-0"
              >
                <MoreVertical className="w-2.5 h-2.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="w-3 h-3 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Film strip edge detail */}
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-border via-muted to-border opacity-50" />
      <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-border via-muted to-border opacity-50" />
    </div>
  );
}
