import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { createLogger } from '@/lib/logger';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import type { ImperativePanelHandle } from 'react-resizable-panels';

const logger = createLogger('Editor');
import { Toolbar } from './toolbar';
import { MediaSidebar } from './media-sidebar';
import { PropertiesSidebar } from './properties-sidebar';
import { PreviewArea } from './preview-area';
import { ProjectDebugPanel } from './project-debug-panel';
import { Timeline } from '@/features/timeline/components/timeline';
import { ExportDialog } from '@/features/export/components/export-dialog';
import { useEditorHotkeys } from '@/hooks/use-editor-hotkeys';
import { useTimelineShortcuts } from '@/features/timeline/hooks/use-timeline-shortcuts';
import { useTransitionBreakageNotifications } from '@/features/timeline/hooks/use-transition-breakage-notifications';
import { initTransitionChainSubscription } from '@/features/timeline/stores/transition-chain-store';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';
import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store';
import { useProjectStore } from '@/features/projects/stores/project-store';
/** Project metadata passed from route loader (timeline loaded separately via loadTimeline) */
export interface EditorProps {
  projectId: string;
  project: {
    id: string;
    name: string;
    width: number;
    height: number;
    fps: number;
    backgroundColor?: string;
  };
}

/**
 * Video Editor Component
 *
 * Modular architecture following CLAUDE.md guidelines:
 * - Uses Zustand stores with granular selectors (not local useState)
 * - Composed of specialized components (toolbar, sidebars, preview, timeline)
 * - React 19 optimizations with Activity components in sidebars
 * - Zundo temporal middleware for undo/redo in timeline
 * - Comprehensive keyboard shortcuts
 *
 * Memoized to prevent re-renders from route changes cascading to all children.
 */
/** Extra percentage to add to timeline panel when graph editor is open */
const GRAPH_PANEL_SIZE_INCREASE = 12; // ~12% extra height

export const Editor = memo(function Editor({ projectId, project }: EditorProps) {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // Guard against concurrent saves (e.g., spamming Ctrl+S)
  const isSavingRef = useRef(false);

  // Refs for imperative panel resizing
  const timelinePanelRef = useRef<ImperativePanelHandle>(null);
  const baseTimelineSizeRef = useRef(30); // Store the user's base timeline size

  // Initialize transition chain subscription (pre-computes chains from timeline data)
  // This subscription recomputes chains when items/transitions change
  useEffect(() => {
    const unsubscribe = initTransitionChainSubscription();
    return unsubscribe;
  }, []);

  // Initialize timeline from project data (or create default tracks for new projects)
  useEffect(() => {
    const { setCurrentProject: setMediaProject } = useMediaLibraryStore.getState();
    const { setCurrentProject } = useProjectStore.getState();

    // Set current project context for media library (v3: project-scoped media)
    setMediaProject(projectId);

    // Set current project in project store for properties panel
    setCurrentProject({
      id: project.id,
      name: project.name,
      description: '',
      duration: 0,
      metadata: {
        width: project.width,
        height: project.height,
        fps: project.fps,
        backgroundColor: project.backgroundColor,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Load timeline from IndexedDB - single source of truth for all timeline state
    const { loadTimeline } = useTimelineStore.getState();
    loadTimeline(projectId).catch((error) => {
      logger.error('Failed to load timeline:', error);
    });

    // Cleanup: clear project context and stop playback when leaving editor
    return () => {
      useMediaLibraryStore.getState().setCurrentProject(null);
      useProjectStore.getState().setCurrentProject(null);
      usePlaybackStore.getState().pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Re-initialize when projectId changes

  // Track unsaved changes
  const isDirty = useTimelineStore((s: { isDirty: boolean }) => s.isDirty);

  // Save timeline to project (with guard against concurrent saves)
  const handleSave = useCallback(async () => {
    // Prevent concurrent saves (e.g., spamming Ctrl+S)
    if (isSavingRef.current) {
      return;
    }

    isSavingRef.current = true;
    const { saveTimeline } = useTimelineStore.getState();

    try {
      await saveTimeline(projectId);
      logger.debug('Project saved successfully');
      // TODO: Show success toast notification
    } catch (error) {
      logger.error('Failed to save project:', error);
      // TODO: Show error toast notification
      throw error; // Re-throw so callers know save failed
    } finally {
      isSavingRef.current = false;
    }
  }, [projectId]);

  const handleExport = () => {
    setExportDialogOpen(true);
  };

  const handleExportBundle = async () => {
    try {
      // Dynamically import to avoid loading bundle service until needed
      const { exportProjectBundle, downloadBundle } = await import(
        '@/features/project-bundle/services/bundle-export-service'
      );

      // Save timeline first to ensure latest changes are included
      await handleSave();

      logger.debug('Exporting project bundle...');
      const result = await exportProjectBundle(projectId, (progress) => {
        logger.debug(`Export progress: ${progress.percent}% - ${progress.stage}`);
      });

      // Trigger download
      downloadBundle(result);
      logger.debug(`Project bundle exported: ${result.filename} (${result.mediaCount} media files)`);
    } catch (error) {
      logger.error('Failed to export project bundle:', error);
      // TODO: Show error toast notification
    }
  };

  // Enable keyboard shortcuts
  useEditorHotkeys({
    onSave: handleSave,
    onExport: handleExport,
  });

  // Enable timeline shortcuts (space, cut tool, rate tool, etc.)
  useTimelineShortcuts();

  // Enable transition breakage notifications
  useTransitionBreakageNotifications();

  // TODO: Get actual timeline duration from project/timeline store
  const timelineDuration = 30; // 30 seconds placeholder

  // Track whether graph panel is currently open to avoid storing expanded size as base
  const isGraphOpenRef = useRef(false);
  // Track the current graph panel height for dynamic resizing
  const graphPanelHeightRef = useRef(0);

  // Handle graph panel open/close - resize timeline panel accordingly
  const handleGraphPanelOpenChange = useCallback((isOpen: boolean) => {
    const panel = timelinePanelRef.current;
    if (!panel) return;

    if (isOpen && !isGraphOpenRef.current) {
      // Opening: store current size before expanding (only if not already open)
      baseTimelineSizeRef.current = panel.getSize();
      // Expand panel to accommodate graph editor
      const newSize = Math.min(50, baseTimelineSizeRef.current + GRAPH_PANEL_SIZE_INCREASE);
      panel.resize(newSize);
      isGraphOpenRef.current = true;
    } else if (!isOpen && isGraphOpenRef.current) {
      // Closing: restore to base size
      panel.resize(baseTimelineSizeRef.current);
      isGraphOpenRef.current = false;
      graphPanelHeightRef.current = 0;
    }
  }, []);

  // Handle graph panel height change during resize
  const handleGraphPanelHeightChange = useCallback((newHeight: number) => {
    const panel = timelinePanelRef.current;
    if (!panel || !isGraphOpenRef.current) return;

    // Calculate the height difference and convert to percentage
    const previousHeight = graphPanelHeightRef.current;
    if (previousHeight === 0) {
      // First resize - just store the height
      graphPanelHeightRef.current = newHeight;
      return;
    }

    const heightDelta = newHeight - previousHeight;
    graphPanelHeightRef.current = newHeight;

    // Convert pixel delta to approximate percentage (rough estimate based on viewport)
    // This is approximate but works well enough for smooth resizing
    const viewportHeight = window.innerHeight;
    const percentDelta = (heightDelta / viewportHeight) * 100;

    const currentSize = panel.getSize();
    const newSize = Math.min(50, Math.max(15, currentSize + percentDelta));
    panel.resize(newSize);
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Top Toolbar */}
        <Toolbar
          projectId={projectId}
          project={project}
          isDirty={isDirty}
          onSave={handleSave}
          onExport={handleExport}
          onExportBundle={handleExportBundle}
        />

        {/* Resizable Layout: Main Content + Timeline */}
        <ResizablePanelGroup direction="vertical" className="flex-1">
          {/* Main Content Area */}
          <ResizablePanel defaultSize={70} minSize={50} maxSize={85}>
            <div className="h-full flex overflow-hidden relative">
              {/* Left Sidebar - Media Library */}
              <MediaSidebar />

              {/* Center - Preview */}
              <PreviewArea project={project} />

              {/* Right Sidebar - Properties */}
              <PropertiesSidebar />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Bottom - Timeline */}
          <ResizablePanel
            ref={timelinePanelRef}
            defaultSize={30}
            minSize={15}
            maxSize={50}
          >
            <Timeline
              duration={timelineDuration}
              onGraphPanelOpenChange={handleGraphPanelOpenChange}
              onGraphPanelHeightChange={handleGraphPanelHeightChange}
            />
          </ResizablePanel>
        </ResizablePanelGroup>

      {/* Export Dialog */}
      <ExportDialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} />

      {/* Debug Panel (dev mode only) */}
      <ProjectDebugPanel projectId={projectId} />
    </div>
  );
});
