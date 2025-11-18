export interface EditorState {
  activePanel: 'media' | 'effects' | 'properties' | null;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  activeTab: 'media' | 'effects';
  sidebarWidth: number;
  timelineHeight: number;
}

export interface EditorActions {
  setActivePanel: (panel: 'media' | 'effects' | 'properties' | null) => void;
  setLeftSidebarOpen: (open: boolean) => void;
  setRightSidebarOpen: (open: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setActiveTab: (tab: 'media' | 'effects') => void;
  setSidebarWidth: (width: number) => void;
  setTimelineHeight: (height: number) => void;
}

export interface SelectionState {
  selectedItemIds: string[];
  selectedTrackId: string | null;
  selectionType: 'item' | 'track' | null;
  // Drag state for visual feedback
  dragState: {
    isDragging: boolean;
    draggedItemIds: string[];
    offset: { x: number; y: number };
  } | null;
}

export interface SelectionActions {
  selectItems: (ids: string[]) => void;
  selectTrack: (id: string | null) => void;
  clearSelection: () => void;
  setDragState: (dragState: SelectionState['dragState']) => void;
}
