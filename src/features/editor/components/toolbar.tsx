import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Download,
  Save,
  Video,
  FolderArchive,
  ChevronDown,
} from 'lucide-react';

export interface ToolbarProps {
  projectId: string;
  project: {
    id: string;
    name: string;
    width: number;
    height: number;
    fps: number;
  };
  onSave?: () => void;
  onExport?: () => void;
  onExportBundle?: () => void;
}

export function Toolbar({ project, onSave, onExport, onExportBundle }: ToolbarProps) {
  return (
    <div className="panel-header h-14 border-b border-border flex items-center px-4 gap-3 flex-shrink-0">
      {/* Project Info */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/projects">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent>Back to Projects</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-6" />

        <div className="flex flex-col -space-y-0.5">
          <h1 className="text-sm font-medium leading-none">
            {project?.name || 'Untitled Project'}
          </h1>
          <span className="text-xs text-muted-foreground font-mono">
            {project?.width}×{project?.height} • {project?.fps}fps
          </span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Save & Export */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={onSave}>
          <Save className="w-4 h-4" />
          Save
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-2 glow-primary-sm">
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onExport} className="gap-2">
              <Video className="w-4 h-4" />
              Export Video
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportBundle} className="gap-2">
              <FolderArchive className="w-4 h-4" />
              Download Project (.vedproj)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
