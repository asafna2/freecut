import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useBentoLayoutDialogStore } from './bento-layout-dialog-store';
import { useBentoPresetsStore } from '../stores/bento-presets-store';
import { useProjectStore } from '@/features/projects/stores/project-store';
import { applyBentoLayout } from '../stores/actions/transform-actions';
import type { LayoutPresetType, LayoutConfig } from '../utils/bento-layout';

// ── Built-in presets ─────────────────────────────────────────────────────

interface BuiltInPreset {
  type: LayoutPresetType;
  label: string;
  cols?: number;
  rows?: number;
}

const BUILT_IN_PRESETS: BuiltInPreset[] = [
  { type: 'auto', label: 'Auto' },
  { type: 'row', label: 'Side by Side' },
  { type: 'column', label: 'Stacked' },
  { type: 'pip', label: 'Picture in Picture' },
  { type: 'focus-sidebar', label: 'Focus + Sidebar' },
  { type: 'grid', label: 'Grid 2\u00D72', cols: 2, rows: 2 },
  { type: 'grid', label: 'Grid 3\u00D73', cols: 3, rows: 3 },
];

// ── Preset preview ───────────────────────────────────────────────────────

function PresetPreview({
  preset,
  itemCount,
  cols,
  rows,
}: {
  preset: LayoutPresetType;
  itemCount: number;
  cols?: number;
  rows?: number;
}) {
  const W = 80;
  const H = 50;
  const GAP = 2;

  const rects = useMemo(() => {
    const items: { x: number; y: number; w: number; h: number }[] = [];
    const n = Math.max(1, itemCount);

    switch (preset) {
      case 'auto': {
        const c = Math.ceil(Math.sqrt(n));
        const r = Math.ceil(n / c);
        const cw = (W - GAP * (c - 1)) / c;
        const ch = (H - GAP * (r - 1)) / r;
        for (let i = 0; i < n; i++) {
          items.push({
            x: (i % c) * (cw + GAP),
            y: Math.floor(i / c) * (ch + GAP),
            w: cw,
            h: ch,
          });
        }
        break;
      }
      case 'row': {
        const cw = (W - GAP * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
          items.push({ x: i * (cw + GAP), y: 0, w: cw, h: H });
        }
        break;
      }
      case 'column': {
        const ch = (H - GAP * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
          items.push({ x: 0, y: i * (ch + GAP), w: W, h: ch });
        }
        break;
      }
      case 'pip': {
        items.push({ x: 0, y: 0, w: W, h: H });
        const pipW = W / 4;
        const pipH = pipW * 0.56;
        for (let i = 1; i < n; i++) {
          items.push({
            x: W - pipW - 2,
            y: H - (pipH + 2) * (n - i),
            w: pipW,
            h: pipH,
          });
        }
        break;
      }
      case 'focus-sidebar': {
        const focusW = W * 0.64;
        items.push({ x: 0, y: 0, w: focusW, h: H });
        const sideW = W - focusW - GAP;
        const sideCount = Math.max(1, n - 1);
        const sideH = (H - GAP * (sideCount - 1)) / sideCount;
        for (let i = 1; i < n; i++) {
          items.push({
            x: focusW + GAP,
            y: (i - 1) * (sideH + GAP),
            w: sideW,
            h: sideH,
          });
        }
        break;
      }
      case 'grid': {
        const gc = cols ?? 2;
        const gr = rows ?? 2;
        const cw = (W - GAP * (gc - 1)) / gc;
        const ch = (H - GAP * (gr - 1)) / gr;
        for (let i = 0; i < Math.min(n, gc * gr); i++) {
          items.push({
            x: (i % gc) * (cw + GAP),
            y: Math.floor(i / gc) * (ch + GAP),
            w: cw,
            h: ch,
          });
        }
        break;
      }
    }

    return items;
  }, [preset, itemCount, cols, rows]);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="rounded border border-border/50 bg-muted/30"
    >
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={1}
          className={i === 0 ? 'fill-primary/60' : 'fill-primary/30'}
        />
      ))}
    </svg>
  );
}

// ── Number input helper ──────────────────────────────────────────────────

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        className="w-16 h-7 text-xs px-2"
      />
    </div>
  );
}

// ── Main dialog ──────────────────────────────────────────────────────────

type SelectedPreset =
  | { kind: 'builtin'; index: number }
  | { kind: 'custom'; id: string };

export function BentoLayoutDialog() {
  const isOpen = useBentoLayoutDialogStore((s) => s.isOpen);
  const itemIds = useBentoLayoutDialogStore((s) => s.itemIds);
  const close = useBentoLayoutDialogStore((s) => s.close);

  const customPresets = useBentoPresetsStore((s) => s.customPresets);
  const addPreset = useBentoPresetsStore((s) => s.addPreset);
  const removePreset = useBentoPresetsStore((s) => s.removePreset);

  const canvasWidth = useProjectStore((s) => s.currentProject?.metadata.width ?? 1920);
  const canvasHeight = useProjectStore((s) => s.currentProject?.metadata.height ?? 1080);

  const [selected, setSelected] = useState<SelectedPreset>({ kind: 'builtin', index: 0 });
  const [gap, setGap] = useState(8);
  const [padding, setPadding] = useState(0);

  // Save preset inline state
  const [isSaving, setIsSaving] = useState(false);
  const [presetName, setPresetName] = useState('');

  const itemCount = itemIds.length;

  const resolveConfig = useCallback((): LayoutConfig => {
    if (selected.kind === 'custom') {
      const preset = customPresets.find((p) => p.id === selected.id);
      if (preset) {
        return {
          preset: 'grid',
          cols: preset.cols,
          rows: preset.rows,
          gap: preset.gap,
          padding: preset.padding,
        };
      }
    }

    const builtin = BUILT_IN_PRESETS[selected.kind === 'builtin' ? selected.index : 0];
    if (!builtin) return { preset: 'auto', gap, padding };

    return {
      preset: builtin.type,
      cols: builtin.cols,
      rows: builtin.rows,
      gap,
      padding,
    };
  }, [selected, customPresets, gap, padding]);

  const handleApply = useCallback(() => {
    if (itemIds.length < 2) return;
    const config = resolveConfig();
    applyBentoLayout(itemIds, canvasWidth, canvasHeight, config);
    close();
  }, [itemIds, canvasWidth, canvasHeight, resolveConfig, close]);

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;

    const config = resolveConfig();
    addPreset({
      name: presetName.trim(),
      cols: config.cols ?? Math.ceil(Math.sqrt(itemCount)),
      rows: config.rows ?? Math.ceil(itemCount / Math.ceil(Math.sqrt(itemCount))),
      gap: config.gap ?? 8,
      padding: config.padding ?? 0,
    });

    setPresetName('');
    setIsSaving(false);
  }, [presetName, resolveConfig, itemCount, addPreset]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        close();
        setIsSaving(false);
        setPresetName('');
      }
    },
    [close]
  );

  // Determine which preset's cols/rows to show in the preview
  const selectedBuiltin = selected.kind === 'builtin' ? BUILT_IN_PRESETS[selected.index] : undefined;
  const selectedCustom =
    selected.kind === 'custom' ? customPresets.find((p) => p.id === selected.id) : undefined;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bento Layout</DialogTitle>
          <DialogDescription>
            Arrange {itemCount} selected clip{itemCount !== 1 ? 's' : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Built-in presets */}
        <div className="grid grid-cols-4 gap-2">
          {BUILT_IN_PRESETS.map((preset, idx) => {
            const isSelected =
              selected.kind === 'builtin' && selected.index === idx;

            return (
              <button
                key={`${preset.type}-${idx}`}
                onClick={() => setSelected({ kind: 'builtin', index: idx })}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-md p-2 transition-colors',
                  'hover:bg-accent',
                  isSelected && 'ring-2 ring-primary bg-accent'
                )}
              >
                <PresetPreview
                  preset={preset.type}
                  itemCount={itemCount}
                  cols={preset.cols}
                  rows={preset.rows}
                />
                <span className="text-[11px] leading-tight text-center">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Custom presets */}
        {customPresets.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground font-medium">
              Custom Presets
            </span>
            <div className="grid grid-cols-4 gap-2">
              {customPresets.map((preset) => {
                const isSelected =
                  selected.kind === 'custom' && selected.id === preset.id;

                return (
                  <div key={preset.id} className="relative group">
                    <button
                      onClick={() => setSelected({ kind: 'custom', id: preset.id })}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-md p-2 w-full transition-colors',
                        'hover:bg-accent',
                        isSelected && 'ring-2 ring-primary bg-accent'
                      )}
                    >
                      <PresetPreview
                        preset="grid"
                        itemCount={itemCount}
                        cols={preset.cols}
                        rows={preset.rows}
                      />
                      <span className="text-[11px] leading-tight text-center truncate w-full">
                        {preset.name}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePreset(preset.id);
                        if (isSelected) {
                          setSelected({ kind: 'builtin', index: 0 });
                        }
                      }}
                      className="absolute -top-1 -right-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Options bar */}
        <div className="flex items-center gap-4 pt-1">
          <NumberInput label="Gap" value={gap} onChange={setGap} min={0} max={40} />
          <NumberInput label="Padding" value={padding} onChange={setPadding} min={0} max={80} />

          {/* Preview of currently selected preset */}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {selectedBuiltin && <span>{selectedBuiltin.label}</span>}
            {selectedCustom && <span>{selectedCustom.name}</span>}
          </div>
        </div>

        {/* Save preset inline */}
        {isSaving ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset();
                if (e.key === 'Escape') {
                  setIsSaving(false);
                  setPresetName('');
                }
              }}
              className="h-8 text-sm flex-1"
              autoFocus
            />
            <Button size="sm" variant="secondary" onClick={handleSavePreset} disabled={!presetName.trim()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsSaving(false);
                setPresetName('');
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {!isSaving ? (
            <Button variant="secondary" size="sm" onClick={() => setIsSaving(true)}>
              Save as Preset
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button onClick={handleApply}>Apply</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
