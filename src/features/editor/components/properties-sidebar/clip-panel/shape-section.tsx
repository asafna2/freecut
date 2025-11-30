import { useCallback, useMemo, useState, useRef, useEffect, memo } from 'react';
import { Shapes, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HexColorPicker } from 'react-colorful';
import type { ShapeItem, ShapeType, TimelineItem } from '@/types/timeline';
import { useTimelineStore } from '@/features/timeline/stores/timeline-store';
import { useGizmoStore } from '@/features/preview/stores/gizmo-store';
import {
  PropertySection,
  PropertyRow,
  NumberInput,
} from '../components';

// Shape type options
const SHAPE_TYPE_OPTIONS: { value: ShapeType; label: string }[] = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'star', label: 'Star' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'heart', label: 'Heart' },
];

// Triangle direction options
const DIRECTION_OPTIONS: { value: 'up' | 'down' | 'left' | 'right'; label: string; icon: typeof ChevronUp }[] = [
  { value: 'up', label: 'Up', icon: ChevronUp },
  { value: 'down', label: 'Down', icon: ChevronDown },
  { value: 'left', label: 'Left', icon: ChevronLeft },
  { value: 'right', label: 'Right', icon: ChevronRight },
];

interface ShapeSectionProps {
  items: TimelineItem[];
}

/**
 * Color picker component for shape properties.
 * Supports live preview during picker drag via onLiveChange.
 */
const ShapeColorPicker = memo(function ShapeColorPicker({
  label,
  color,
  onChange,
  onLiveChange,
  onReset,
  defaultColor,
  disabled,
}: {
  label: string;
  color: string;
  onChange: (color: string) => void;
  onLiveChange?: (color: string) => void;
  onReset?: () => void;
  defaultColor?: string;
  disabled?: boolean;
}) {
  const [localColor, setLocalColor] = useState(color);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalColor(color);
  }, [color]);

  const handleColorChange = useCallback((newColor: string) => {
    setLocalColor(newColor);
    onLiveChange?.(newColor);
  }, [onLiveChange]);

  const handleCommit = useCallback(() => {
    onChange(localColor);
  }, [localColor, onChange]);

  const handleClose = useCallback(() => {
    handleCommit();
    setIsOpen(false);
  }, [handleCommit]);

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
    <PropertyRow label={label}>
      <div ref={containerRef} className="relative flex items-center gap-1 flex-1">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`flex items-center gap-2 flex-1 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={disabled}
        >
          <div
            className="w-6 h-6 rounded border border-border flex-shrink-0"
            style={{ backgroundColor: localColor }}
          />
          <span className="text-xs font-mono text-muted-foreground uppercase">
            {localColor}
          </span>
        </button>

        {onReset && defaultColor && color !== defaultColor && !disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={onReset}
            title="Reset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}

        {isOpen && !disabled && (
          <div className="absolute top-8 left-0 z-50 p-2 bg-popover border border-border rounded-lg shadow-lg">
            <HexColorPicker color={localColor} onChange={handleColorChange} />
          </div>
        )}
      </div>
    </PropertyRow>
  );
});

/**
 * Shape section - properties for shape items (shapeType, colors, stroke, etc.)
 */
export function ShapeSection({ items }: ShapeSectionProps) {
  const updateItem = useTimelineStore((s) => s.updateItem);

  // Gizmo store for live property preview
  const setItemPropertiesPreview = useGizmoStore((s) => s.setItemPropertiesPreview);
  const clearItemPropertiesPreview = useGizmoStore((s) => s.clearItemPropertiesPreview);

  // Filter to only shape items
  const shapeItems = useMemo(
    () => items.filter((item): item is ShapeItem => item.type === 'shape'),
    [items]
  );

  // Memoize item IDs for stable callback dependencies
  const itemIds = useMemo(() => shapeItems.map((item) => item.id), [shapeItems]);

  // Get shared values across selected shape items
  const sharedValues = useMemo(() => {
    if (shapeItems.length === 0) return null;

    const first = shapeItems[0]!;
    return {
      shapeType: shapeItems.every(i => i.shapeType === first.shapeType) ? first.shapeType : undefined,
      fillColor: shapeItems.every(i => i.fillColor === first.fillColor) ? first.fillColor : undefined,
      strokeColor: shapeItems.every(i => (i.strokeColor ?? '') === (first.strokeColor ?? '')) ? (first.strokeColor ?? '') : undefined,
      strokeWidth: shapeItems.every(i => (i.strokeWidth ?? 0) === (first.strokeWidth ?? 0)) ? (first.strokeWidth ?? 0) : 'mixed' as const,
      cornerRadius: shapeItems.every(i => (i.cornerRadius ?? 0) === (first.cornerRadius ?? 0)) ? (first.cornerRadius ?? 0) : 'mixed' as const,
      direction: shapeItems.every(i => (i.direction ?? 'up') === (first.direction ?? 'up')) ? (first.direction ?? 'up') : undefined,
      points: shapeItems.every(i => (i.points ?? 5) === (first.points ?? 5)) ? (first.points ?? 5) : 'mixed' as const,
      innerRadius: shapeItems.every(i => (i.innerRadius ?? 0.5) === (first.innerRadius ?? 0.5)) ? (first.innerRadius ?? 0.5) : 'mixed' as const,
    };
  }, [shapeItems]);

  // Check which controls should be shown based on shape type
  const showCornerRadius = sharedValues?.shapeType && ['rectangle', 'triangle', 'star', 'polygon'].includes(sharedValues.shapeType);
  const showDirection = sharedValues?.shapeType === 'triangle';
  const showPoints = sharedValues?.shapeType && ['star', 'polygon'].includes(sharedValues.shapeType);
  const showInnerRadius = sharedValues?.shapeType === 'star';

  // Update all selected shape items
  const updateShapeItems = useCallback(
    (updates: Partial<ShapeItem>) => {
      shapeItems.forEach((item) => {
        updateItem(item.id, updates);
      });
    },
    [shapeItems, updateItem]
  );

  // Shape type change
  const handleShapeTypeChange = useCallback(
    (value: string) => {
      updateShapeItems({ shapeType: value as ShapeType });
    },
    [updateShapeItems]
  );

  // Fill color handlers with live preview
  const handleFillColorLiveChange = useCallback(
    (value: string) => {
      const previews: Record<string, { fillColor: string }> = {};
      itemIds.forEach((id) => {
        previews[id] = { fillColor: value };
      });
      setItemPropertiesPreview(previews);
    },
    [itemIds, setItemPropertiesPreview]
  );

  const handleFillColorChange = useCallback(
    (value: string) => {
      updateShapeItems({ fillColor: value });
      queueMicrotask(() => clearItemPropertiesPreview());
    },
    [updateShapeItems, clearItemPropertiesPreview]
  );

  // Stroke color handlers with live preview
  const handleStrokeColorLiveChange = useCallback(
    (value: string) => {
      const previews: Record<string, { strokeColor: string }> = {};
      itemIds.forEach((id) => {
        previews[id] = { strokeColor: value };
      });
      setItemPropertiesPreview(previews);
    },
    [itemIds, setItemPropertiesPreview]
  );

  const handleStrokeColorChange = useCallback(
    (value: string) => {
      updateShapeItems({ strokeColor: value || undefined });
      queueMicrotask(() => clearItemPropertiesPreview());
    },
    [updateShapeItems, clearItemPropertiesPreview]
  );

  // Stroke width handlers with live preview
  const handleStrokeWidthLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { strokeWidth: number; strokeColor?: string }> = {};
      itemIds.forEach((id) => {
        // Include default stroke color in preview if not already set
        if (value > 0 && !sharedValues?.strokeColor) {
          previews[id] = { strokeWidth: value, strokeColor: '#1e40af' };
        } else {
          previews[id] = { strokeWidth: value };
        }
      });
      setItemPropertiesPreview(previews);
    },
    [itemIds, setItemPropertiesPreview, sharedValues?.strokeColor]
  );

  const handleStrokeWidthChange = useCallback(
    (value: number) => {
      // When increasing stroke width from 0, also set default stroke color if not set
      if (value > 0 && sharedValues?.strokeWidth === 0 && !sharedValues?.strokeColor) {
        updateShapeItems({ strokeWidth: value, strokeColor: '#1e40af' });
      } else {
        updateShapeItems({ strokeWidth: value });
      }
      queueMicrotask(() => clearItemPropertiesPreview());
    },
    [updateShapeItems, clearItemPropertiesPreview, sharedValues?.strokeWidth, sharedValues?.strokeColor]
  );

  // Corner radius handlers with live preview
  const handleCornerRadiusLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { cornerRadius: number }> = {};
      itemIds.forEach((id) => {
        previews[id] = { cornerRadius: value };
      });
      setItemPropertiesPreview(previews);
    },
    [itemIds, setItemPropertiesPreview]
  );

  const handleCornerRadiusChange = useCallback(
    (value: number) => {
      updateShapeItems({ cornerRadius: value });
      queueMicrotask(() => clearItemPropertiesPreview());
    },
    [updateShapeItems, clearItemPropertiesPreview]
  );

  // Direction handler
  const handleDirectionChange = useCallback(
    (value: string) => {
      updateShapeItems({ direction: value as 'up' | 'down' | 'left' | 'right' });
    },
    [updateShapeItems]
  );

  // Points handlers with live preview
  const handlePointsLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { points: number }> = {};
      itemIds.forEach((id) => {
        previews[id] = { points: value };
      });
      setItemPropertiesPreview(previews);
    },
    [itemIds, setItemPropertiesPreview]
  );

  const handlePointsChange = useCallback(
    (value: number) => {
      updateShapeItems({ points: value });
      queueMicrotask(() => clearItemPropertiesPreview());
    },
    [updateShapeItems, clearItemPropertiesPreview]
  );

  // Inner radius handlers with live preview
  const handleInnerRadiusLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { innerRadius: number }> = {};
      itemIds.forEach((id) => {
        previews[id] = { innerRadius: value };
      });
      setItemPropertiesPreview(previews);
    },
    [itemIds, setItemPropertiesPreview]
  );

  const handleInnerRadiusChange = useCallback(
    (value: number) => {
      updateShapeItems({ innerRadius: value });
      queueMicrotask(() => clearItemPropertiesPreview());
    },
    [updateShapeItems, clearItemPropertiesPreview]
  );

  if (shapeItems.length === 0 || !sharedValues) {
    return null;
  }

  return (
    <PropertySection title="Shape" icon={Shapes} defaultOpen={true}>
      {/* Shape Type */}
      <PropertyRow label="Type">
        <Select
          value={sharedValues.shapeType}
          onValueChange={handleShapeTypeChange}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder={sharedValues.shapeType === undefined ? 'Mixed' : 'Select shape'} />
          </SelectTrigger>
          <SelectContent>
            {SHAPE_TYPE_OPTIONS.map((shape) => (
              <SelectItem key={shape.value} value={shape.value} className="text-xs">
                {shape.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {/* Fill Color */}
      <ShapeColorPicker
        label="Fill"
        color={sharedValues.fillColor ?? '#3b82f6'}
        onChange={handleFillColorChange}
        onLiveChange={handleFillColorLiveChange}
        onReset={() => handleFillColorChange('#3b82f6')}
        defaultColor="#3b82f6"
      />

      {/* Stroke Width */}
      <PropertyRow label="Stroke W.">
        <NumberInput
          value={sharedValues.strokeWidth}
          onChange={handleStrokeWidthChange}
          onLiveChange={handleStrokeWidthLiveChange}
          min={0}
          max={50}
          step={1}
          unit="px"
        />
      </PropertyRow>

      {/* Stroke Color - only show when stroke width > 0 */}
      {(sharedValues.strokeWidth === 'mixed' || sharedValues.strokeWidth > 0) && (
        <ShapeColorPicker
          label="Stroke"
          color={sharedValues.strokeColor || '#1e40af'}
          onChange={handleStrokeColorChange}
          onLiveChange={handleStrokeColorLiveChange}
          onReset={() => handleStrokeColorChange('')}
          defaultColor=""
        />
      )}

      {/* Corner Radius - shown for rectangle, triangle, star, polygon */}
      {showCornerRadius && (
        <PropertyRow label="Radius">
          <NumberInput
            value={sharedValues.cornerRadius}
            onChange={handleCornerRadiusChange}
            onLiveChange={handleCornerRadiusLiveChange}
            min={0}
            max={100}
            step={1}
            unit="px"
          />
        </PropertyRow>
      )}

      {/* Direction - shown for triangle only */}
      {showDirection && (
        <PropertyRow label="Direction">
          <div className="flex gap-1">
            {DIRECTION_OPTIONS.map((dir) => (
              <Button
                key={dir.value}
                variant={sharedValues.direction === dir.value ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleDirectionChange(dir.value)}
                title={dir.label}
              >
                <dir.icon className="w-3.5 h-3.5" />
              </Button>
            ))}
          </div>
        </PropertyRow>
      )}

      {/* Points - shown for star and polygon */}
      {showPoints && (
        <PropertyRow label="Points">
          <NumberInput
            value={sharedValues.points}
            onChange={handlePointsChange}
            onLiveChange={handlePointsLiveChange}
            min={3}
            max={12}
            step={1}
          />
        </PropertyRow>
      )}

      {/* Inner Radius - shown for star only */}
      {showInnerRadius && (
        <PropertyRow label="Inner R.">
          <NumberInput
            value={sharedValues.innerRadius}
            onChange={handleInnerRadiusChange}
            onLiveChange={handleInnerRadiusLiveChange}
            min={0.1}
            max={0.9}
            step={0.05}
          />
        </PropertyRow>
      )}
    </PropertySection>
  );
}
