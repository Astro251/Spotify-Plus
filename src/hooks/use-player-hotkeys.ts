'use client';

import { useEffect } from 'react';
import { usePlayer } from '@/lib/store/player';
import { useNav } from '@/lib/store/navigation';
import { openShortcutsDialog } from '@/components/spotify/ui-bits/shortcuts-dialog';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    t.isContentEditable ||
    t.closest('[role=slider], [role=menu], [role=listbox], [role=dialog], [contenteditable=true]') !== null
  );
}

/**
 * Spotify-style global keyboard shortcuts:
 *  Space / K  — play / pause
 *  ← / →      — seek −5s / +5s
 *  ↑ / ↓      — volume up / down
 *  J / L      — previous / next track
 *  M          — mute toggle
 *  S          — shuffle toggle
 *  /          — go to Search
 *  ?          — keyboard shortcuts cheatsheet
 */
export function usePlayerHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      // app-level bindings (no track required)
      if (e.key === '?') {
        e.preventDefault();
        openShortcutsDialog();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        useNav.getState().setTab('search');
        // the view may not be mounted yet — leave a pending flag it consumes
        (window as unknown as { __searchFocusPending?: boolean }).__searchFocusPending = true;
        window.dispatchEvent(new CustomEvent('app:focus-search'));
        return;
      }

      const player = usePlayer.getState();
      const hasTrack = !!player.queue[player.order[player.pos]];
      if (!hasTrack) return;

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          player.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.seek(player.progress + 5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.seek(Math.max(0, player.progress - 5));
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(Math.min(1, player.volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(Math.max(0, player.volume - 0.1));
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          player.next();
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          player.prev();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          player.toggleMute();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          player.toggleShuffle();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
