import { useMemo, useCallback, useEffect } from 'react';
import type { TimelineItem } from '@/types/timeline';
import type { GizmoHandle, Transform, CoordinateParams } from '../types/gizmo';
import { useGizmoStore } from '../stores/gizmo-store';
import { useAnimatedTransform } from '@/features/keyframes/hooks/use-animated-transform';
import {
  transformToScreenBounds,
  screenToCanvas,
  getScaleCursor,
} from '../utils/coordinate-transform';

const HANDLE_SIZE = 8;
const ROTATION_HANDLE_OFFSET = 24;

const SCALE_HANDLES: GizmoHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

interface TransformGizmoProps {
  item: TimelineItem;
  coordParams: CoordinateParams;
  onTransformStart: () => void;
  onTransformEnd: (transform: Transform) => void;
  /** Whether video is currently playing - gizmo shows at lower opacity during playback */
  isPlaying?: boolean;
}

/**
 * Transform gizmo for a single selected item.
 * Renders selection box, scale handles, and rotation handle.
 */
export function TransformGizmo({
  item,
  coordParams,
  onTransformStart,
  onTransformEnd,
  isPlaying = false,
}: TransformGizmoProps) {
  // Gizmo store
  const activeGizmo = useGizmoStore((s) => s.activeGizmo);
  const previewTransform = useGizmoStore((s) => s.previewTransform);
  const propertiesPreview = useGizmoStore((s) => s.propertiesPreview);
  const itemPropertiesPreview = useGizmoStore((s) => s.itemPropertiesPreview);
  const startTranslate = useGizmoStore((s) => s.startTranslate);
  const startScale = useGizmoStore((s) => s.startScale);
  const startRotate = useGizmoStore((s) => s.startRotate);
  const updateInteraction = useGizmoStore((s) => s.updateInteraction);
  const endInteraction = useGizmoStore((s) => s.endInteraction);
  const clearInteraction = useGizmoStore((s) => s.clearInteraction);
  const cancelInteraction = useGizmoStore((s) => s.cancelInteraction);

  const isInteracting = activeGizmo?.itemId === item.id;

  // Get animated transform using centralized hook
  const { transform: animatedTransform } = useAnimatedTransform(item, coordParams.projectSize);

  // Get current transform (use preview during interaction, or properties panel preview)
  const currentTransform = useMemo((): Transform => {
    // If gizmo is being dragged, use its preview
    if (isInteracting && previewTransform) {
      return previewTransform;
    }

    const baseTransform: Transform = {
      x: animatedTransform.x,
      y: animatedTransform.y,
      width: animatedTransform.width,
      height: animatedTransform.height,
      rotation: animatedTransform.rotation,
      opacity: animatedTransform.opacity,
      cornerRadius: animatedTransform.cornerRadius,
    };

    // If properties panel is previewing this item, merge its values
    const itemPropertiesPreview = propertiesPreview?.[item.id];
    if (itemPropertiesPreview) {
      return { ...baseTransform, ...itemPropertiesPreview };
    }

    return baseTransform;
  }, [animatedTransform, isInteracting, previewTransform, propertiesPreview, item.id]);

  // Convert to screen bounds, expanding for stroke width on shapes
  const screenBounds = useMemo(() => {
    const bounds = transformToScreenBounds(currentTransform, coordParams);

    // Expand bounds for stroke width on shape items
    if (item.type === 'shape') {
      // Get stroke width from item properties preview or item
      const previewStroke = itemPropertiesPreview?.[item.id]?.strokeWidth;
      const strokeWidth = previewStroke ?? item.strokeWidth ?? 0;

      if (strokeWidth > 0) {
        // Scale stroke width to screen space
        const scale = coordParams.playerSize.width / coordParams.projectSize.width;
        const screenStroke = strokeWidth * scale;

        // Expand bounds by half stroke on each side (stroke is centered on path)
        bounds.left -= screenStroke / 2;
        bounds.top -= screenStroke / 2;
        bounds.width += screenStroke;
        bounds.height += screenStroke;
      }
    }

    return bounds;
  }, [currentTransform, coordParams, item, itemPropertiesPreview]);

  // Helper to convert screen position to canvas position
  const toCanvasPoint = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      return screenToCanvas(e.clientX, e.clientY, coordParams);
    },
    [coordParams]
  );

  // Handle position for each scale handle
  const getHandleStyle = useCallback(
    (handle: GizmoHandle): React.CSSProperties => {
      const half = HANDLE_SIZE / 2;
      const { width, height } = screenBounds;

      const positions: Record<string, React.CSSProperties> = {
        nw: { left: -half, top: -half },
        n: { left: width / 2 - half, top: -half },
        ne: { left: width - half, top: -half },
        e: { left: width - half, top: height / 2 - half },
        se: { left: width - half, top: height - half },
        s: { left: width / 2 - half, top: height - half },
        sw: { left: -half, top: height - half },
        w: { left: -half, top: height / 2 - half },
      };

      return {
        position: 'absolute',
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        ...positions[handle],
        cursor: getScaleCursor(handle, currentTransform.rotation),
      };
    },
    [screenBounds, currentTransform.rotation]
  );

  // Check if transform actually changed (within tolerance)
  const transformChanged = useCallback((a: Transform, b: Transform): boolean => {
    const tolerance = 0.01;
    return (
      Math.abs(a.x - b.x) > tolerance ||
      Math.abs(a.y - b.y) > tolerance ||
      Math.abs(a.width - b.width) > tolerance ||
      Math.abs(a.height - b.height) > tolerance ||
      Math.abs(a.rotation - b.rotation) > tolerance
    );
  }, []);

  // Get stroke width for shapes (used in snapping)
  const strokeWidth = item.type === 'shape' ? item.strokeWidth ?? 0 : 0;

  // Mouse event handlers
  const handleTranslateStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const point = toCanvasPoint(e);
      const startTransformSnapshot = { ...currentTransform };
      startTranslate(item.id, point, currentTransform, strokeWidth);
      onTransformStart();
      document.body.style.cursor = 'move';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const movePoint = toCanvasPoint(moveEvent);
        updateInteraction(movePoint, moveEvent.shiftKey, moveEvent.ctrlKey);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';

        const finalTransform = endInteraction();
        // Only update timeline if transform actually changed
        if (finalTransform && transformChanged(startTransformSnapshot, finalTransform)) {
          onTransformEnd(finalTransform);
        }
        requestAnimationFrame(() => {
          clearInteraction();
        });
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [item.id, currentTransform, toCanvasPoint, startTranslate, updateInteraction, endInteraction, clearInteraction, onTransformStart, onTransformEnd, transformChanged, strokeWidth]
  );

  const handleScaleStart = useCallback(
    (handle: GizmoHandle, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const point = toCanvasPoint(e);
      const startTransformSnapshot = { ...currentTransform };
      startScale(item.id, handle, point, currentTransform, item.type, item.transform?.aspectRatioLocked, strokeWidth);
      onTransformStart();
      document.body.style.cursor = getScaleCursor(handle, currentTransform.rotation);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const movePoint = toCanvasPoint(moveEvent);
        updateInteraction(movePoint, moveEvent.shiftKey, moveEvent.ctrlKey);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';

        const finalTransform = endInteraction();
        if (finalTransform && transformChanged(startTransformSnapshot, finalTransform)) {
          onTransformEnd(finalTransform);
        }
        requestAnimationFrame(() => {
          clearInteraction();
        });
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [item.id, currentTransform, toCanvasPoint, startScale, updateInteraction, endInteraction, clearInteraction, onTransformStart, onTransformEnd, transformChanged, strokeWidth]
  );

  const handleRotateStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const point = toCanvasPoint(e);
      const startTransformSnapshot = { ...currentTransform };
      startRotate(item.id, point, currentTransform, strokeWidth);
      onTransformStart();
      document.body.style.cursor = 'crosshair';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const movePoint = toCanvasPoint(moveEvent);
        updateInteraction(movePoint, moveEvent.shiftKey, moveEvent.ctrlKey);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';

        const finalTransform = endInteraction();
        if (finalTransform && transformChanged(startTransformSnapshot, finalTransform)) {
          onTransformEnd(finalTransform);
        }
        requestAnimationFrame(() => {
          clearInteraction();
        });
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [item.id, currentTransform, toCanvasPoint, startRotate, updateInteraction, endInteraction, clearInteraction, onTransformStart, onTransformEnd, transformChanged, strokeWidth]
  );

  // Handle escape key to cancel interaction
  useEffect(() => {
    if (!isInteracting) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelInteraction();
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInteracting, cancelInteraction]);

  return (
    <div
      className="absolute transition-opacity duration-150"
      style={{
        left: screenBounds.left,
        top: screenBounds.top,
        width: screenBounds.width,
        height: screenBounds.height,
        transform: `rotate(${currentTransform.rotation}deg)`,
        transformOrigin: 'center center',
        opacity: isPlaying ? 0 : 1,
        // High z-index to ensure gizmo is always above SelectableItems
        zIndex: 100,
        // Container captures events to block SelectableItems below
        pointerEvents: 'auto',
      }}
      // Prevent events from propagating to elements below
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Selection border - high z-index to ensure it's above all SelectableItems */}
      {/* Mask shapes use cyan color, regular shapes use orange */}
      <div
        className="absolute cursor-move"
        style={{
          inset: -2,
          border: `2px dashed ${
            item.type === 'shape' && item.isMask
              ? (isInteracting ? '#0891b2' : '#06b6d4') // Cyan for masks
              : (isInteracting ? '#ea580c' : '#f97316') // Orange for regular
          }`,
          boxSizing: 'border-box',
          zIndex: 101,
        }}
        data-gizmo="border"
        onMouseDown={handleTranslateStart}
        onDoubleClick={(e) => e.stopPropagation()}
      />

      {/* Scale handles - high z-index to ensure they're above all SelectableItems */}
      {SCALE_HANDLES.map((handle) => (
        <div
          key={handle}
          className="bg-white border border-orange-500"
          style={{ ...getHandleStyle(handle), zIndex: 102 }}
          data-gizmo={`scale-${handle}`}
          onMouseDown={(e) => handleScaleStart(handle, e)}
        />
      ))}

      {/* Rotation handle - high z-index to ensure it's above all SelectableItems */}
      <div
        className="absolute bg-white border border-orange-500 rounded-full cursor-crosshair"
        style={{
          width: 10,
          height: 10,
          left: '50%',
          top: -ROTATION_HANDLE_OFFSET,
          marginLeft: -5,
          zIndex: 102,
        }}
        data-gizmo="rotate"
        onMouseDown={handleRotateStart}
      />

      {/* Rotation guide line */}
      <div
        className="absolute border-l border-dashed border-orange-500 pointer-events-none"
        style={{
          left: '50%',
          top: -ROTATION_HANDLE_OFFSET + 10,
          height: ROTATION_HANDLE_OFFSET - 10,
        }}
      />
    </div>
  );
}
