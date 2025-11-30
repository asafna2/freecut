import { useMemo, useCallback, useState, useRef, useEffect, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, Trash2, RotateCcw } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { useSelectionStore } from '@/features/editor/stores/selection-store';
import { PropertySection, PropertyRow, NumberInput } from '../components';

const DEFAULT_MARKER_COLOR = 'oklch(0.65 0.20 250)';

// Preset colors for quick selection
const PRESET_COLORS = [
  'oklch(0.65 0.20 250)', // Blue (default)
  'oklch(0.65 0.20 30)',  // Red
  'oklch(0.70 0.20 140)', // Green
  'oklch(0.70 0.18 85)',  // Yellow
  'oklch(0.60 0.20 310)', // Purple
  'oklch(0.70 0.15 180)', // Cyan
];

/**
 * Marker color picker with presets.
 * Local state for instant preview, commits on close.
 */
const MarkerColorPicker = memo(function MarkerColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  const [localColor, setLocalColor] = useState(color);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local state when color prop changes
  useEffect(() => {
    setLocalColor(color);
  }, [color]);

  const handleClose = useCallback(() => {
    onChange(localColor);
    setIsOpen(false);
  }, [localColor, onChange]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, handleClose]);

  return (
    <div ref={containerRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-6 h-6 rounded border border-border flex-shrink-0"
        style={{ backgroundColor: localColor }}
      />

      {isOpen && (
        <div className="absolute top-8 left-0 z-50 p-2 bg-popover border border-border rounded-lg shadow-lg">
          {/* Preset color swatches */}
          <div className="flex gap-1 mb-2">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setLocalColor(preset);
                  onChange(preset);
                }}
                className="w-6 h-6 rounded border border-border hover:ring-1 hover:ring-ring transition-all"
                style={{ backgroundColor: preset }}
                title={preset}
              />
            ))}
          </div>
          {/* Full color picker */}
          <HexColorPicker color={localColor} onChange={setLocalColor} />
        </div>
      )}
    </div>
  );
});

/**
 * Marker properties panel - shown when a marker is selected.
 * Allows editing frame position, label, and color.
 */
export function MarkerPanel() {
  // Granular selectors (Zustand v5 best practice)
  const selectedMarkerId = useSelectionStore((s) => s.selectedMarkerId);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const markers = useTimelineStore((s) => s.markers);
  const updateMarker = useTimelineStore((s) => s.updateMarker);
  const removeMarker = useTimelineStore((s) => s.removeMarker);
  const fps = useTimelineStore((s) => s.fps);

  // Derive selected marker
  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId),
    [markers, selectedMarkerId]
  );

  // Handle frame change
  const handleFrameChange = useCallback(
    (frame: number) => {
      if (selectedMarkerId) {
        updateMarker(selectedMarkerId, { frame: Math.max(0, Math.round(frame)) });
      }
    },
    [selectedMarkerId, updateMarker]
  );

  // Handle label change
  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedMarkerId) {
        // Store undefined if empty string to keep data clean
        updateMarker(selectedMarkerId, { label: e.target.value || undefined });
      }
    },
    [selectedMarkerId, updateMarker]
  );

  // Handle color change
  const handleColorChange = useCallback(
    (color: string) => {
      if (selectedMarkerId) {
        updateMarker(selectedMarkerId, { color });
      }
    },
    [selectedMarkerId, updateMarker]
  );

  // Handle delete
  const handleDelete = useCallback(() => {
    if (selectedMarkerId) {
      removeMarker(selectedMarkerId);
      clearSelection();
    }
  }, [selectedMarkerId, removeMarker, clearSelection]);

  // Handle reset color to default
  const handleResetColor = useCallback(() => {
    if (selectedMarkerId && selectedMarker?.color !== DEFAULT_MARKER_COLOR) {
      updateMarker(selectedMarkerId, { color: DEFAULT_MARKER_COLOR });
    }
  }, [selectedMarkerId, selectedMarker?.color, updateMarker]);

  // Format frame as timecode (MM:SS.FF)
  const formatTimecode = useCallback(
    (frame: number): string => {
      const totalSeconds = frame / fps;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const remainingFrames = frame % fps;
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainingFrames).padStart(2, '0')}`;
    },
    [fps]
  );

  if (!selectedMarker) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground/50 mb-2" />
        <p className="text-xs text-muted-foreground">Marker not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PropertySection title="Marker" icon={MapPin} defaultOpen={true}>
        {/* Frame position */}
        <PropertyRow label="Frame">
          <NumberInput
            value={selectedMarker.frame}
            onChange={handleFrameChange}
            min={0}
            step={1}
          />
        </PropertyRow>

        {/* Timecode (read-only) */}
        <PropertyRow label="Time">
          <span className="text-xs font-mono text-muted-foreground">
            {formatTimecode(selectedMarker.frame)}
          </span>
        </PropertyRow>

        {/* Label */}
        <PropertyRow label="Label">
          <Input
            value={selectedMarker.label || ''}
            onChange={handleLabelChange}
            placeholder="Enter label..."
            className="h-7 text-xs"
          />
        </PropertyRow>

        {/* Color */}
        <PropertyRow label="Color">
          <div className="flex items-center gap-1 flex-1">
            <MarkerColorPicker
              color={selectedMarker.color}
              onChange={handleColorChange}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={handleResetColor}
              title="Reset to default color"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </PropertyRow>

        {/* Delete button */}
        <div className="pt-2">
          <Button
            variant="destructive"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleDelete}
          >
            <Trash2 className="w-3 h-3 mr-1.5" />
            Delete Marker
          </Button>
        </div>
      </PropertySection>
    </div>
  );
}
