/**
 * Tool shortcuts: V (Select), C (Razor), R (Rate Stretch).
 */

import { useHotkeys } from 'react-hotkeys-hook';
import { useSelectionStore } from '@/features/editor/stores/selection-store';
import { HOTKEYS, HOTKEY_OPTIONS } from '@/config/hotkeys';
import type { TimelineShortcutCallbacks } from '../use-timeline-shortcuts';

export function useToolShortcuts(callbacks: TimelineShortcutCallbacks) {
  const activeTool = useSelectionStore((s) => s.activeTool);
  const setActiveTool = useSelectionStore((s) => s.setActiveTool);

  // Tool: V - Selection Tool
  useHotkeys(
    HOTKEYS.SELECTION_TOOL,
    (event) => {
      event.preventDefault();
      setActiveTool('select');
    },
    HOTKEY_OPTIONS,
    [setActiveTool]
  );

  // Tool: C - Toggle Razor Tool
  useHotkeys(
    HOTKEYS.RAZOR_TOOL,
    (event) => {
      event.preventDefault();
      setActiveTool(activeTool === 'razor' ? 'select' : 'razor');
      if (callbacks.onSplit) {
        callbacks.onSplit();
      }
    },
    HOTKEY_OPTIONS,
    [activeTool, setActiveTool, callbacks]
  );

  // Tool: R - Toggle Rate Stretch Tool
  useHotkeys(
    HOTKEYS.RATE_STRETCH_TOOL,
    (event) => {
      event.preventDefault();
      setActiveTool(activeTool === 'rate-stretch' ? 'select' : 'rate-stretch');
    },
    HOTKEY_OPTIONS,
    [activeTool, setActiveTool]
  );
}
