import { useState, useCallback, useRef, useEffect } from 'react';
import { Layers, Trash2, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useCompositionsStore, type SubComposition } from '@/features/timeline/stores/compositions-store';
import { useCompositionNavigationStore } from '@/features/timeline/stores/composition-navigation-store';
import { useItemsStore } from '@/features/timeline/stores/items-store';
import { setMediaDragData, clearMediaDragData } from '../utils/drag-data-cache';

/**
 * Compositions section in the media library.
 * Displays all sub-compositions as reusable assets.
 * Hidden when no compositions exist.
 */
export function CompositionsSection() {
  const compositions = useCompositionsStore((s) => s.compositions);
  const removeComposition = useCompositionsStore((s) => s.removeComposition);
  const updateComposition = useCompositionsStore((s) => s.updateComposition);
  const enterComposition = useCompositionNavigationStore((s) => s.enterComposition);
  const activeCompositionId = useCompositionNavigationStore((s) => s.activeCompositionId);

  const [open, setOpen] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<SubComposition | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  if (compositions.length === 0) return null;

  const handleEnter = (comp: SubComposition) => {
    enterComposition(comp.id, comp.name);
  };

  const handleDeleteRequest = (comp: SubComposition) => {
    setDeleteTarget(comp);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const items = useItemsStore.getState().items;
    const refsOnTimeline = items.filter(
      (i) => i.type === 'composition' && i.compositionId === deleteTarget.id
    );
    if (refsOnTimeline.length > 0) {
      useItemsStore.getState()._removeItems(refsOnTimeline.map((i) => i.id));
    }
    removeComposition(deleteTarget.id);
    setDeleteTarget(null);
  };

  const handleStartRename = (comp: SubComposition) => {
    setEditingId(comp.id);
    setEditValue(comp.name);
  };

  const handleCommitRename = (id: string) => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== useCompositionsStore.getState().getComposition(id)?.name) {
      updateComposition(id, { name: trimmed });
    }
    setEditingId(null);
  };

  const refsOnTimeline = deleteTarget
    ? useItemsStore.getState().items.filter(
        (i) => i.type === 'composition' && i.compositionId === deleteTarget.id
      )
    : [];

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover:bg-secondary/50 rounded-md px-2 -mx-2 transition-colors">
          <ChevronRight
            className={cn(
              'w-3 h-3 text-muted-foreground transition-transform',
              open && 'rotate-90'
            )}
          />
          <Layers className="w-3 h-3 text-violet-400" />
          <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Compositions
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {compositions.length}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1 pb-2 space-y-0.5">
          {compositions.map((comp) => (
            <CompositionCard
              key={comp.id}
              composition={comp}
              isInsideSubComp={activeCompositionId !== null}
              isEditing={editingId === comp.id}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onEnter={handleEnter}
              onDelete={handleDeleteRequest}
              onStartRename={handleStartRename}
              onCommitRename={handleCommitRename}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete composition?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;?
                  This action cannot be undone.
                </p>
                {refsOnTimeline.length > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                    <Trash2 className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-600 dark:text-yellow-400">
                      <p className="font-medium">Timeline references will be removed</p>
                      <p className="text-xs mt-1 text-yellow-600/80 dark:text-yellow-400/80">
                        {refsOnTimeline.length} composition item{refsOnTimeline.length > 1 ? 's' : ''} on the timeline will also be deleted.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// --- Composition card ---

interface CompositionCardProps {
  composition: SubComposition;
  isInsideSubComp: boolean;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onEnter: (comp: SubComposition) => void;
  onDelete: (comp: SubComposition) => void;
  onStartRename: (comp: SubComposition) => void;
  onCommitRename: (id: string) => void;
}

function CompositionCard({
  composition,
  isInsideSubComp,
  isEditing,
  editValue,
  onEditValueChange,
  onEnter,
  onDelete,
  onStartRename,
  onCommitRename,
}: CompositionCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (isInsideSubComp) {
        e.preventDefault();
        return;
      }
      const data = {
        type: 'composition' as const,
        compositionId: composition.id,
        name: composition.name,
        durationInFrames: composition.durationInFrames,
        width: composition.width,
        height: composition.height,
      };
      e.dataTransfer.setData('application/json', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'copy';
      setMediaDragData(data);
    },
    [composition, isInsideSubComp]
  );

  const handleDragEnd = useCallback(() => {
    clearMediaDragData();
  }, []);

  const handleDoubleClick = useCallback(() => {
    onEnter(composition);
  }, [composition, onEnter]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onCommitRename(composition.id);
      } else if (e.key === 'Escape') {
        onCommitRename(composition.id);
      }
    },
    [composition.id, onCommitRename]
  );

  const itemCount = composition.items.length;
  const fps = composition.fps || 30;
  const durationSecs = composition.durationInFrames / fps;
  const durationLabel =
    durationSecs < 60
      ? `${durationSecs.toFixed(1)}s`
      : `${Math.floor(durationSecs / 60)}:${String(Math.floor(durationSecs % 60)).padStart(2, '0')}`;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable={!isInsideSubComp && !isEditing}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDoubleClick={handleDoubleClick}
          className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors group',
            isInsideSubComp ? 'opacity-50 cursor-not-allowed' : 'cursor-grab hover:bg-accent/50'
          )}
        >
          {/* Purple composition icon */}
          <div className="flex items-center justify-center w-6 h-6 rounded bg-violet-600/30 flex-shrink-0">
            <Layers className="w-3.5 h-3.5 text-violet-400" />
          </div>

          {/* Name / inline edit */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => onEditValueChange(e.target.value)}
                onBlur={() => onCommitRename(composition.id)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent border border-primary rounded px-1 py-0.5 text-xs text-foreground outline-none"
              />
            ) : (
              <p className="truncate text-foreground">{composition.name}</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              {durationLabel} &middot; {itemCount} item{itemCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={() => onEnter(composition)}>
          Enter Composition
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onStartRename(composition)}>
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onDelete(composition)}
          className="text-destructive focus:text-destructive"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
