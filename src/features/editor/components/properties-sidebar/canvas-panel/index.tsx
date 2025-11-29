import { useMemo, useCallback, useState, useRef, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowLeftRight, RotateCcw, LayoutDashboard, Clock, Palette } from 'lucide-react';
import { useProjectStore } from '@/features/projects/stores/project-store';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { useGizmoStore } from '@/features/preview/stores/gizmo-store';
import { HexColorPicker } from 'react-colorful';
import {
  PropertySection,
  PropertyRow,
  LinkedDimensions,
} from '../components';

/**
 * Isolated color picker using react-colorful.
 * Local state for instant preview, commits on mouse release.
 * Uses gizmo store for live canvas preview during drag.
 * Click outside to close.
 */
const ColorPicker = memo(function ColorPicker({
  initialColor,
  onColorChange,
}: {
  initialColor: string;
  onColorChange: (color: string) => void;
}) {
  const [color, setColor] = useState(initialColor);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const setCanvasBackgroundPreview = useGizmoStore((s) => s.setCanvasBackgroundPreview);
  const clearCanvasBackgroundPreview = useGizmoStore((s) => s.clearCanvasBackgroundPreview);

  const handleColorChange = useCallback((newColor: string) => {
    setColor(newColor);
    // Live preview on canvas
    setCanvasBackgroundPreview(newColor);
  }, [setCanvasBackgroundPreview]);

  const handleCommit = useCallback(() => {
    // Clear preview and commit to store
    clearCanvasBackgroundPreview();
    onColorChange(color);
  }, [color, onColorChange, clearCanvasBackgroundPreview]);

  const handleClose = useCallback(() => {
    handleCommit();
    setIsOpen(false);
  }, [handleCommit]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full"
      >
        <div
          className="w-6 h-6 rounded border border-border flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-mono text-muted-foreground uppercase">
          {color}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-8 left-0 z-50 p-2 bg-popover border border-border rounded-lg shadow-lg">
          <HexColorPicker color={color} onChange={handleColorChange} />
        </div>
      )}
    </div>
  );
});

/**
 * Canvas properties panel - shown when no clip is selected.
 * Displays and allows editing of canvas dimensions and shows project duration.
 */
export function CanvasPanel() {
  // Granular selectors
  const currentProject = useProjectStore((s) => s.currentProject);
  const updateProject = useProjectStore((s) => s.updateProject);
  const items = useTimelineStore((s) => s.items);
  const fps = useTimelineStore((s) => s.fps);

  // Calculate timeline duration from rightmost item
  const timelineDuration = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.max(...items.map((item) => item.from + item.durationInFrames));
  }, [items]);


  // All handlers must be defined before any early returns (Rules of Hooks)
  const projectId = currentProject?.id;
  const width = currentProject?.metadata.width ?? 1920;
  const height = currentProject?.metadata.height ?? 1080;
  const storedBackgroundColor = currentProject?.metadata.backgroundColor ?? '#000000';


  const handleWidthChange = useCallback(
    (newWidth: number) => {
      if (projectId) updateProject(projectId, { width: newWidth });
    },
    [projectId, updateProject]
  );

  const handleHeightChange = useCallback(
    (newHeight: number) => {
      if (projectId) updateProject(projectId, { height: newHeight });
    },
    [projectId, updateProject]
  );

  const handleSwapDimensions = useCallback(() => {
    if (projectId) updateProject(projectId, { width: height, height: width });
  }, [projectId, width, height, updateProject]);

  const handleResetDimensions = useCallback(() => {
    if (projectId) updateProject(projectId, { width: 1920, height: 1080 });
  }, [projectId, updateProject]);

  // Commit background color to store on release
  const handleBackgroundColorChange = useCallback(
    (color: string) => {
      if (projectId) updateProject(projectId, { backgroundColor: color });
    },
    [projectId, updateProject]
  );

  // Format duration as MM:SS.FF
  const formatDuration = (frames: number): string => {
    const totalSeconds = frames / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const remainingFrames = frames % fps;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainingFrames).padStart(2, '0')}`;
  };

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-xs text-muted-foreground">No project loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Canvas Section */}
      <PropertySection title="Canvas" icon={LayoutDashboard} defaultOpen={true}>
        <LinkedDimensions
          width={width}
          height={height}
          aspectLocked={false}
          onWidthChange={handleWidthChange}
          onHeightChange={handleHeightChange}
          onAspectLockToggle={() => {}}
          minWidth={320}
          minHeight={240}
          maxWidth={7680}
          maxHeight={4320}
        />

        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={handleSwapDimensions}
          >
            <ArrowLeftRight className="w-3 h-3 mr-1.5" />
            Swap
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={handleResetDimensions}
          >
            <RotateCcw className="w-3 h-3 mr-1.5" />
            Reset
          </Button>
        </div>
      </PropertySection>

      <Separator />

      {/* Background Section */}
      <PropertySection title="Background" icon={Palette} defaultOpen={true}>
        <PropertyRow label="Color">
          <ColorPicker
            initialColor={storedBackgroundColor}
            onColorChange={handleBackgroundColorChange}
          />
        </PropertyRow>
      </PropertySection>

      <Separator />

      {/* Duration Section */}
      <PropertySection title="Duration" icon={Clock} defaultOpen={true}>
        <PropertyRow label="Duration">
          <span className="text-xs font-mono text-foreground">
            {formatDuration(timelineDuration)}
          </span>
        </PropertyRow>

        <PropertyRow label="Frame Rate">
          <span className="text-xs font-mono text-muted-foreground">
            {currentProject.metadata.fps} fps
          </span>
        </PropertyRow>

        <PropertyRow label="Total Frames">
          <span className="text-xs font-mono text-muted-foreground">
            {timelineDuration}
          </span>
        </PropertyRow>
      </PropertySection>
    </div>
  );
}
