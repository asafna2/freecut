import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Upload,
  MousePointer2,
  Scissors,
  Type,
  Undo2,
  Redo2,
  Settings2,
  ZoomIn,
  ZoomOut,
  Volume2,
  Film,
  Music,
  MessageSquare,
  Download,
  Maximize2,
  Grid3x3,
  Layers,
  Image as ImageIcon,
  Video,
  FileAudio,
  Plus,
  MoreVertical,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Unlock,
} from 'lucide-react';

export const Route = createFileRoute('/projects/$projectId/editor')({
  component: EditorPage,
  loader: async ({ params }) => {
    // TODO: Load project data for editor
    return {
      project: {
        id: params.projectId,
        name: 'Summer Vacation 2024',
        width: 1920,
        height: 1080,
        fps: 30,
      },
    };
  },
});

function EditorPage() {
  const { project } = Route.useLoaderData();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [zoom, setZoom] = useState([1]);
  const [volume, setVolume] = useState([75]);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'media' | 'effects'>('media');

  // TODO: Integrate with actual timeline and playback stores
  const totalFrames = 900; // 30 seconds at 30fps
  const duration = totalFrames / (project?.fps || 30);

  // Mock media items
  const mediaItems = [
    { id: '1', name: 'intro.mp4', type: 'video', duration: '0:15', size: '24.5 MB' },
    { id: '2', name: 'background.mp3', type: 'audio', duration: '0:30', size: '3.2 MB' },
    { id: '3', name: 'logo.png', type: 'image', size: '1.2 MB' },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Top Toolbar */}
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

          {/* Tool Buttons */}
          <div className="flex items-center gap-1 px-1.5 py-1 bg-secondary/50 rounded-md border border-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-state="active"
                >
                  <MousePointer2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Selection Tool (V)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Scissors className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Razor Tool (C)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Type className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Text Tool (T)</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* History */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Undo2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Redo2 className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Export */}
          <Button size="sm" className="gap-2 glow-primary-sm">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Media Library */}
          <div
            className={`panel-bg border-r border-border transition-all duration-200 flex-shrink-0 ${
              leftSidebarOpen ? 'w-72' : 'w-0'
            }`}
          >
            {leftSidebarOpen && (
              <div className="h-full flex flex-col w-72 animate-slide-in-left">
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
                    onClick={() => setLeftSidebarOpen(false)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </div>

                {/* Media Items */}
                {activeTab === 'media' && (
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {/* Import Button */}
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2 h-auto py-3 border-dashed hover:border-primary/50 hover:bg-primary/5"
                    >
                      <Upload className="w-4 h-4 text-primary" />
                      <div className="text-left">
                        <div className="text-sm font-medium">Import Media</div>
                        <div className="text-xs text-muted-foreground">
                          Drag files here or click
                        </div>
                      </div>
                    </Button>

                    <Separator className="my-3" />

                    {/* Media Grid */}
                    <div className="space-y-1.5">
                      {mediaItems.map((item) => (
                        <div
                          key={item.id}
                          className="group relative rounded-md border border-border hover:border-primary/50 bg-secondary/30 hover:bg-secondary/50 p-2 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-2">
                            {/* Icon */}
                            <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                              {item.type === 'video' && (
                                <Video className="w-5 h-5 text-primary" />
                              )}
                              {item.type === 'audio' && (
                                <FileAudio className="w-5 h-5 text-green-500" />
                              )}
                              {item.type === 'image' && (
                                <ImageIcon className="w-5 h-5 text-blue-500" />
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {item.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.duration && `${item.duration} • `}
                                {item.size}
                              </div>
                            </div>

                            {/* Actions */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                >
                                  <MoreVertical className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Plus className="w-3 h-3 mr-2" />
                                  Add to Timeline
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Copy className="w-3 h-3 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">
                                  <Trash2 className="w-3 h-3 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Effects Tab */}
                {activeTab === 'effects' && (
                  <div className="flex-1 overflow-y-auto p-3">
                    <div className="text-center py-12 text-muted-foreground text-sm">
                      <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      Effects library coming soon
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Left Sidebar Toggle */}
          {!leftSidebarOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setLeftSidebarOpen(true)}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-20 bg-secondary/50 hover:bg-secondary border border-border rounded-r-md flex items-center justify-center transition-all hover:w-7"
                >
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Show Media Panel</TooltipContent>
            </Tooltip>
          )}

          {/* Center - Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Preview Area */}
            <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-background to-secondary/20">
              <div
                className="relative w-full max-w-6xl"
                style={{
                  aspectRatio: `${project?.width || 16}/${project?.height || 9}`,
                }}
              >
                {/* Video Preview Canvas */}
                <div className="absolute inset-0 rounded-lg overflow-hidden bg-black border-2 border-border shadow-2xl">
                  {/* Placeholder */}
                  <div className="w-full h-full bg-gradient-to-br from-secondary/40 to-background/60 flex items-center justify-center relative">
                    {/* Grid overlay */}
                    <div className="absolute inset-0 opacity-[0.03]">
                      <div className="w-full h-full" style={{
                        backgroundImage: `
                          linear-gradient(to right, oklch(0.95 0 0) 1px, transparent 1px),
                          linear-gradient(to bottom, oklch(0.95 0 0) 1px, transparent 1px)
                        `,
                        backgroundSize: '20px 20px'
                      }} />
                    </div>

                    <div className="text-center relative z-10">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                        <Play className="w-10 h-10 text-primary ml-1" />
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">
                        Preview Canvas
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {project?.width}×{project?.height}
                      </p>
                    </div>

                    {/* Corner rulers for professional feel */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-primary/20" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 border-primary/20" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 border-primary/20" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 border-primary/20" />
                  </div>
                </div>

                {/* Frame Counter */}
                <div className="absolute -bottom-7 right-0 font-mono text-xs text-primary tabular-nums flex items-center gap-2">
                  <span className="text-muted-foreground">Frame:</span>
                  <span className="font-medium">
                    {String(currentFrame).padStart(5, '0')} / {String(totalFrames).padStart(5, '0')}
                  </span>
                </div>

                {/* Fullscreen toggle */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute -top-3 -right-3 h-8 w-8 rounded-full shadow-lg"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Fullscreen Preview</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="h-16 border-t border-border panel-header flex items-center justify-center gap-6 px-6 flex-shrink-0">
              {/* Transport Controls */}
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <SkipBack className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Go to Start (Home)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous Frame (←)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      className="h-11 w-11 glow-primary-sm"
                      onClick={() => setIsPlaying(!isPlaying)}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isPlaying ? 'Pause' : 'Play'} (Space)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next Frame (→)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <SkipForward className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Go to End (End)</TooltipContent>
                </Tooltip>
              </div>

              <Separator orientation="vertical" className="h-8" />

              {/* Timecode Display */}
              <div className="px-4 py-2.5 bg-secondary/50 rounded-md border border-border">
                <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
                  <span className="text-primary font-semibold">
                    {Math.floor(currentFrame / (project?.fps || 30))
                      .toString()
                      .padStart(2, '0')}
                    :
                    {Math.floor(
                      ((currentFrame % (project?.fps || 30)) / (project?.fps || 30)) * 60
                    )
                      .toString()
                      .padStart(2, '0')}
                  </span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-muted-foreground">
                    {Math.floor(duration).toString().padStart(2, '0')}:
                    {Math.floor((duration % 1) * 60)
                      .toString()
                      .padStart(2, '0')}
                  </span>
                </div>
              </div>

              <Separator orientation="vertical" className="h-8" />

              {/* Volume Control */}
              <div className="flex items-center gap-2.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Volume</TooltipContent>
                </Tooltip>
                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  max={100}
                  step={1}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground font-mono w-8">
                  {volume[0]}%
                </span>
              </div>
            </div>
          </div>

          {/* Right Sidebar - Properties */}
          <div
            className={`panel-bg border-l border-border transition-all duration-200 flex-shrink-0 ${
              rightSidebarOpen ? 'w-80' : 'w-0'
            }`}
          >
            {rightSidebarOpen && (
              <div className="h-full flex flex-col w-80 animate-slide-in-right">
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
                    onClick={() => setRightSidebarOpen(false)}
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
                      Select a clip on the timeline to edit its properties
                    </p>
                  </div>

                  {/* Example properties when something is selected */}
                  {/* Uncomment to show
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-foreground mb-2 block">
                        Transform
                      </label>
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-muted-foreground">Position X</span>
                            <span className="text-xs font-mono">960</span>
                          </div>
                          <Slider defaultValue={[50]} max={100} step={1} />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-muted-foreground">Position Y</span>
                            <span className="text-xs font-mono">540</span>
                          </div>
                          <Slider defaultValue={[50]} max={100} step={1} />
                        </div>
                      </div>
                    </div>
                  </div>
                  */}
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar Toggle */}
          {!rightSidebarOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setRightSidebarOpen(true)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-20 bg-secondary/50 hover:bg-secondary border border-border rounded-l-md flex items-center justify-center transition-all hover:w-7"
                >
                  <ChevronLeft className="w-3 h-3 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Show Properties Panel</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Bottom - Timeline */}
        <div className="timeline-bg h-72 border-t border-border flex flex-col flex-shrink-0">
          {/* Timeline Header */}
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
                      onClick={() => setZoom([Math.max(0.1, zoom[0] - 0.1)])}
                    >
                      <ZoomOut className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom Out</TooltipContent>
                </Tooltip>

                <Slider
                  value={zoom}
                  onValueChange={setZoom}
                  min={0.1}
                  max={2}
                  step={0.1}
                  className="w-24"
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setZoom([Math.min(2, zoom[0] + 0.1)])}
                    >
                      <ZoomIn className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom In</TooltipContent>
                </Tooltip>

                <span className="text-xs text-muted-foreground font-mono w-12 text-right">
                  {Math.round(zoom[0] * 100)}%
                </span>
              </div>
            </div>

            {/* Timeline Tools */}
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    <Grid3x3 className="w-3 h-3 mr-1.5" />
                    Snap
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Snap to Grid</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Timeline Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Track Headers */}
            <div className="w-36 border-r border-border panel-bg flex-shrink-0">
              <div className="h-11 flex items-center px-3 border-b border-border bg-secondary/20">
                <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                  Tracks
                </span>
              </div>

              {/* Track labels */}
              <div className="space-y-px">
                {/* Video Track 1 */}
                <div className="h-16 flex items-center justify-between px-3 video-track border-b border-border group">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Video className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium font-mono truncate">
                      Video 1
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Lock className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Audio Track 1 */}
                <div className="h-16 flex items-center justify-between px-3 audio-track border-b border-border group">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Music className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium font-mono truncate">
                      Audio 1
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Lock className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Subtitle Track */}
                <div className="h-14 flex items-center justify-between px-3 subtitle-track border-b border-border group">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-xs font-medium font-mono truncate">
                      Subtitles
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Lock className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Canvas */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden relative bg-background/30">
              {/* Ruler */}
              <div className="h-11 bg-secondary/20 border-b border-border relative">
                {/* Time markers */}
                <div className="absolute inset-0 flex">
                  {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-shrink-0 border-l border-border/50 relative"
                      style={{ width: `${zoom[0] * 100}px` }}
                    >
                      <span className="absolute top-2 left-2 font-mono text-xs text-muted-foreground tabular-nums">
                        {i}s
                      </span>
                      {/* Frame ticks */}
                      <div className="absolute top-7 left-0 right-0 flex justify-between px-0.5">
                        {Array.from({ length: 10 }).map((_, j) => (
                          <div
                            key={j}
                            className="w-px h-1.5 bg-border/40"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Playhead in ruler */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 playhead pointer-events-none z-20"
                  style={{
                    left: `${(currentFrame / totalFrames) * duration * zoom[0] * 100}px`,
                  }}
                >
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 playhead rotate-45 rounded-sm" />
                </div>
              </div>

              {/* Track lanes */}
              <div className="relative">
                {/* Video track lane */}
                <div className="h-16 border-b border-border video-track relative">
                  {/* Example clip */}
                  <div
                    className="absolute top-2 h-12 bg-primary/30 border border-primary rounded overflow-hidden cursor-pointer hover:bg-primary/40 transition-colors"
                    style={{ left: '100px', width: '300px' }}
                  >
                    <div className="px-2 py-1 text-xs font-medium text-primary-foreground truncate">
                      intro.mp4
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent pointer-events-none" />
                  </div>
                </div>

                {/* Audio track lane */}
                <div className="h-16 border-b border-border audio-track relative">
                  {/* Waveform visualization */}
                  <div className="absolute inset-0 flex items-center px-2 opacity-20">
                    <svg className="w-full h-10" preserveAspectRatio="none" viewBox="0 0 1000 100">
                      <path
                        d="M0 50 Q25 20, 50 50 T100 50 T150 50 T200 50 T250 50 T300 50 T350 50 T400 50 T450 50 T500 50 T550 50 T600 50 T650 50 T700 50 T750 50 T800 50 T850 50 T900 50 T950 50 T1000 50"
                        stroke="currentColor"
                        className="text-green-400"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                  </div>
                </div>

                {/* Subtitle track lane */}
                <div className="h-14 border-b border-border subtitle-track relative" />

                {/* Playhead line through all tracks */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 playhead pointer-events-none z-10"
                  style={{
                    left: `${(currentFrame / totalFrames) * duration * zoom[0] * 100}px`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
