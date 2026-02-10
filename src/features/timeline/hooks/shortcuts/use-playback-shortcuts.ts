/**
 * Playback & Navigation shortcuts: Space, Arrow Left/Right, Home/End, Up/Down snap points.
 */

import { useHotkeys } from 'react-hotkeys-hook';
import { usePlaybackStore } from '@/features/preview/stores/playback-store';
import { useTimelineStore } from '../../stores/timeline-store';
import { HOTKEYS, HOTKEY_OPTIONS } from '@/config/hotkeys';
import type { TimelineShortcutCallbacks } from '../use-timeline-shortcuts';

export function usePlaybackShortcuts(
  callbacks: TimelineShortcutCallbacks,
  snapPoints: number[]
) {
  const togglePlayPause = usePlaybackStore((s) => s.togglePlayPause);
  const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const items = useTimelineStore((s) => s.items);

  // Playback: Space - Play/Pause
  useHotkeys(
    HOTKEYS.PLAY_PAUSE,
    (event) => {
      event.preventDefault();
      togglePlayPause();
      if (isPlaying && callbacks.onPause) {
        callbacks.onPause();
      } else if (!isPlaying && callbacks.onPlay) {
        callbacks.onPlay();
      }
    },
    HOTKEY_OPTIONS,
    [togglePlayPause, isPlaying, callbacks]
  );

  // Navigation: Arrow Left - Previous frame
  useHotkeys(
    HOTKEYS.PREVIOUS_FRAME,
    (event) => {
      event.preventDefault();
      const currentFrame = usePlaybackStore.getState().currentFrame;
      setCurrentFrame(Math.max(0, currentFrame - 1));
    },
    HOTKEY_OPTIONS,
    [setCurrentFrame]
  );

  // Navigation: Arrow Right - Next frame
  useHotkeys(
    HOTKEYS.NEXT_FRAME,
    (event) => {
      event.preventDefault();
      const currentFrame = usePlaybackStore.getState().currentFrame;
      setCurrentFrame(currentFrame + 1);
    },
    HOTKEY_OPTIONS,
    [setCurrentFrame]
  );

  // Navigation: Home - Go to start
  useHotkeys(
    HOTKEYS.GO_TO_START,
    (event) => {
      event.preventDefault();
      setCurrentFrame(0);
    },
    HOTKEY_OPTIONS,
    [setCurrentFrame]
  );

  // Navigation: End - Go to end of timeline (last frame of last item)
  useHotkeys(
    HOTKEYS.GO_TO_END,
    (event) => {
      event.preventDefault();
      const lastFrame = items.reduce((max, item) => {
        const itemEnd = item.from + item.durationInFrames;
        return Math.max(max, itemEnd);
      }, 0);
      setCurrentFrame(lastFrame);
    },
    HOTKEY_OPTIONS,
    [setCurrentFrame, items]
  );

  // Navigation: Down - Jump to next snap point (clip edge or marker)
  useHotkeys(
    HOTKEYS.NEXT_SNAP_POINT,
    (event) => {
      event.preventDefault();
      const currentFrame = usePlaybackStore.getState().currentFrame;
      const nextEdge = snapPoints.find((edge) => edge > currentFrame);
      if (nextEdge !== undefined) {
        setCurrentFrame(nextEdge);
      }
    },
    HOTKEY_OPTIONS,
    [setCurrentFrame, snapPoints]
  );

  // Navigation: Up - Jump to previous snap point (clip edge or marker)
  useHotkeys(
    HOTKEYS.PREVIOUS_SNAP_POINT,
    (event) => {
      event.preventDefault();
      const currentFrame = usePlaybackStore.getState().currentFrame;
      let previousEdge: number | undefined;
      for (let i = snapPoints.length - 1; i >= 0; i--) {
        if (snapPoints[i] < currentFrame) {
          previousEdge = snapPoints[i];
          break;
        }
      }
      if (previousEdge !== undefined) {
        setCurrentFrame(previousEdge);
      }
    },
    HOTKEY_OPTIONS,
    [setCurrentFrame, snapPoints]
  );
}
