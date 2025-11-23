import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import {
  Film,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Scissors,
  CornerRightDown,
  CornerRightUp,
  X,
} from 'lucide-react';
import { useTimelineZoom } from '../../hooks/use-timeline-zoom';
import { useTimelineStore } from '../../stores/timeline-store';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';
import { useSelectionStore } from '@/features/editor/stores/selection-store';

export interface TimelineHeaderProps {
  onZoomChange?: (newZoom: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

/**
 * Timeline Header Component
 *
 * Contains timeline controls:
 * - Title and icon
 * - Zoom in/out buttons with slider
 * - Snap to grid toggle
 * - Additional timeline tools
 */
export function TimelineHeader({ onZoomChange, onZoomIn, onZoomOut }: TimelineHeaderProps) {
  const { zoomLevel, zoomIn, zoomOut, setZoom } = useTimelineZoom();
  const snapEnabled = useTimelineStore((s) => s.snapEnabled);
  const toggleSnap = useTimelineStore((s) => s.toggleSnap);
  const inPoint = useTimelineStore((s) => s.inPoint);
  const outPoint = useTimelineStore((s) => s.outPoint);
  const setInPoint = useTimelineStore((s) => s.setInPoint);
  const setOutPoint = useTimelineStore((s) => s.setOutPoint);
  const clearInOutPoints = useTimelineStore((s) => s.clearInOutPoints);
  const currentFrame = usePlaybackStore((s) => s.currentFrame);
  const activeTool = useSelectionStore((s) => s.activeTool);
  const setActiveTool = useSelectionStore((s) => s.setActiveTool);

  return (
    <div className="h-11 flex items-center justify-between px-4 border-b border-border">
      <div className="flex items-center gap-4">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2">
          <Film className="w-3 h-3" />
          Timeline
        </h2>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  // Use provided handler with playhead centering if available, otherwise fallback
                  if (onZoomOut) {
                    onZoomOut();
                  } else {
                    zoomOut();
                  }
                }}
              >
                <ZoomOut className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <Slider
            value={[zoomLevel]}
            onValueChange={(values) => {
              const newZoom = values[0] ?? 1;
              // Use provided handler with playhead centering if available, otherwise fallback
              if (onZoomChange) {
                onZoomChange(newZoom);
              } else {
                setZoom(newZoom);
              }
            }}
            min={0.01}
            max={2}
            step={0.01}
            className="w-24"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  // Use provided handler with playhead centering if available, otherwise fallback
                  if (onZoomIn) {
                    onZoomIn();
                  } else {
                    zoomIn();
                  }
                }}
              >
                <ZoomIn className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>

          <span className="text-xs text-muted-foreground font-mono w-12 text-right">
            {Math.round(zoomLevel * 100)}%
          </span>
        </div>
      </div>

      {/* Timeline Tools */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-xs focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 active:scale-100 ${
                activeTool === 'razor' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''
              }`}
              onClick={(e) => {
                e.currentTarget.blur();
                setActiveTool(activeTool === 'razor' ? 'select' : 'razor');
              }}
            >
              <Scissors className="w-3 h-3 mr-1.5" />
              Razor
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {activeTool === 'razor' ? 'Razor Tool Active (C)' : 'Activate Razor Tool (C)'}
          </TooltipContent>
        </Tooltip>

        {/* In/Out Point Buttons */}
        <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setInPoint(currentFrame)}
              >
                <CornerRightDown className="w-3 h-3" style={{ color: 'oklch(0.65 0.18 142)' }} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Set In Point (I)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setOutPoint(currentFrame)}
              >
                <CornerRightUp className="w-3 h-3" style={{ color: 'oklch(0.61 0.22 29)' }} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Set Out Point (O)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={clearInOutPoints}
                disabled={inPoint === null && outPoint === null}
              >
                <X className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear In/Out Points</TooltipContent>
          </Tooltip>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={snapEnabled ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={toggleSnap}
            >
              <Grid3x3 className="w-3 h-3 mr-1.5" />
              Snap
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {snapEnabled ? 'Snap Enabled' : 'Snap Disabled'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
