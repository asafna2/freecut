import { useState, useEffect, useRef } from 'react';
import {
  VideoPreview,
  PlaybackControls,
  TimecodeDisplay,
  PreviewZoomControls,
} from '@/features/preview';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { useProjectStore } from '@/features/projects/stores/project-store';

interface PreviewAreaProps {
  project: {
    width: number;
    height: number;
    fps: number;
  };
}

/**
 * Preview Area Component
 *
 * Modular composition of preview-related components:
 * - VideoPreview: Canvas with grid, rulers, frame counter
 * - PlaybackControls: Transport controls with React 19 patterns
 * - TimecodeDisplay: Current time display
 * - PreviewZoomControls: Fit-to-panel zoom control
 *
 * Uses granular Zustand selectors in child components
 */
export function PreviewArea({ project }: PreviewAreaProps) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Read current project from store for live updates (e.g., dimension swaps)
  // Falls back to prop values if store hasn't been set yet
  const currentProject = useProjectStore((s) => s.currentProject);
  const width = currentProject?.metadata.width ?? project.width;
  const height = currentProject?.metadata.height ?? project.height;
  const fps = currentProject?.metadata.fps ?? project.fps;
  // Pass stored color to composition; live preview is read directly from gizmo store
  const backgroundColor = currentProject?.metadata.backgroundColor ?? '#000000';

  // Calculate total frames from timeline items
  const items = useTimelineStore((s) => s.items);
  const totalFrames = items.length > 0
    ? Math.max(...items.map(item => item.from + item.durationInFrames))
    : fps * 10; // Default 10 seconds if no items

  // Measure preview container size for zoom calculations
  useEffect(() => {
    const element = previewContainerRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      // Account for padding (p-6 = 24px on each side)
      setContainerSize({
        width: rect.width - 48,
        height: rect.height - 48,
      });
    };

    // Initial measurement
    updateSize();

    // Use ResizeObserver to detect panel resizing
    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Build project object with live values from store
  const liveProject = { width, height, fps, backgroundColor };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Video Preview Canvas */}
      <div ref={previewContainerRef} className="flex-1 min-h-0">
        <VideoPreview project={liveProject} containerSize={containerSize} />
      </div>

      {/* Playback Controls */}
      <div className="h-16 border-t border-border panel-header flex items-center justify-center px-6 flex-shrink-0 relative">
        {/* Left: Timecode Display */}
        <div className="absolute left-6">
          <TimecodeDisplay fps={fps} totalFrames={totalFrames} />
        </div>

        {/* Center: Playback Controls */}
        <PlaybackControls totalFrames={totalFrames} fps={fps} />

        {/* Right: Zoom Controls */}
        <div className="absolute right-6">
          <PreviewZoomControls
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            projectWidth={width}
            projectHeight={height}
          />
        </div>
      </div>
    </div>
  );
}
