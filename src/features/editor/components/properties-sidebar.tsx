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
  Settings2,
} from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';

export function PropertiesSidebar() {
  // Use granular selectors - Zustand v5 best practice
  const rightSidebarOpen = useEditorStore((s) => s.rightSidebarOpen);
  const toggleRightSidebar = useEditorStore((s) => s.toggleRightSidebar);

  return (
    <>
      {/* Right Sidebar */}
      <div
        className={`panel-bg border-l border-border transition-all duration-200 flex-shrink-0 ${
          rightSidebarOpen ? 'w-80' : 'w-0'
        }`}
      >
        {/* Use Activity for React 19 performance optimization */}
        <Activity mode={rightSidebarOpen ? 'visible' : 'hidden'}>
          <div className="h-full flex flex-col w-80">
            {/* Sidebar Header */}
            <div className="h-11 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
              <h2 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground flex items-center gap-2">
                <Settings2 className="w-3 h-3" />
                Properties
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleRightSidebar}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Properties Panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Empty state */}
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-xl bg-secondary border border-border flex items-center justify-center mb-4">
                  <Settings2 className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">
                  No Selection
                </h3>
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  Select an item on the timeline to edit its properties
                </p>
              </div>

              {/* TODO: Add property controls when an item is selected
                  Example: Transform, Effects, Opacity, Blend Mode, etc.
              */}
            </div>
          </div>
        </Activity>
      </div>

      {/* Right Sidebar Toggle */}
      {!rightSidebarOpen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleRightSidebar}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-20 bg-secondary/50 hover:bg-secondary border border-border rounded-l-md flex items-center justify-center transition-all hover:w-7"
            >
              <ChevronLeft className="w-3 h-3 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Show Properties Panel</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
