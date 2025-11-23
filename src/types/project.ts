export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  thumbnailUrl?: string;
  metadata: ProjectResolution;
  timeline?: ProjectTimeline;
}

export interface ProjectTimeline {
  tracks: Array<{
    id: string;
    name: string;
    height: number;
    locked: boolean;
    visible: boolean;
    muted: boolean;
    solo: boolean;
    color?: string;
    order: number;
  }>;
  items: Array<{
    id: string;
    trackId: string;
    from: number;
    durationInFrames: number;
    label: string;
    mediaId?: string;
    type: 'video' | 'audio' | 'text' | 'image' | 'shape';
    // Type-specific fields stored as optional for flexibility
    src?: string;
    thumbnailUrl?: string;
    offset?: number;
    waveformData?: number[];
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    shapeType?: 'rectangle' | 'circle' | 'triangle' | 'solid';
    fillColor?: string;
  }>;
  // Playback and view state
  currentFrame?: number;
  zoomLevel?: number;
  // In/Out markers
  inPoint?: number;
  outPoint?: number;
}

export interface ProjectResolution {
  width: number;
  height: number;
  fps: number;
}

export interface ProjectFormData {
  name: string;
  description: string;
  metadata: ProjectResolution;
}
