import { Activity } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Layers,
} from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';
import { MediaLibrary } from '@/features/media-library/components/media-library';

export function MediaSidebar() {
  // Use granular selectors - Zustand v5 best practice
  const leftSidebarOpen = useEditorStore((s) => s.leftSidebarOpen);
  const toggleLeftSidebar = useEditorStore((s) => s.toggleLeftSidebar);
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  return (
    <>
      {/* Left Sidebar */}
      <div
        className={`panel-bg border-r border-border transition-all duration-200 flex-shrink-0 ${
          leftSidebarOpen ? 'w-72' : 'w-0'
        }`}
      >
        <div className={`h-full flex flex-col w-72 ${leftSidebarOpen ? 'block' : 'hidden'}`}>
          {/* Sidebar Header */}
          <div className="h-11 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant={activeTab === 'media' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveTab('media')}
              >
                <Film className="w-3 h-3 mr-1.5" />
                Media
              </Button>
              <Button
                variant={activeTab === 'effects' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveTab('effects')}
              >
                <Layers className="w-3 h-3 mr-1.5" />
                Effects
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleLeftSidebar}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>

          {/* Media Tab - Full Media Library */}
          <div className={`flex-1 overflow-hidden ${activeTab === 'media' ? 'block' : 'hidden'}`}>
            <MediaLibrary />
          </div>

          {/* Effects Tab */}
          <div className={`flex-1 overflow-y-auto p-3 ${activeTab === 'effects' ? 'block' : 'hidden'}`}>
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
              Effects library coming soon
            </div>
          </div>
        </div>
      </div>

      {/* Left Sidebar Toggle */}
      {!leftSidebarOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleLeftSidebar}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-20 bg-secondary/50 hover:bg-secondary border border-border rounded-r-md flex items-center justify-center transition-all hover:w-7"
            >
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Show Media Panel</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
