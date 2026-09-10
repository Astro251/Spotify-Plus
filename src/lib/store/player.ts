'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TrackDTO } from '@/lib/types';

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlayContext {
  /** e.g. "playlist:daily-mix-1", "album:neon-skyline", "liked", "search", "radio:{videoId}" */
  id: string;
  /** Human label shown in the now-playing header ("Daily Mix 1") */
  label?: string;
}

export interface SleepTimer {
  mode: 'minutes' | 'eot';
  /** Epoch ms deadline (minutes mode). */
  endsAt: number;
  /** Track id that, once it finishes, pauses playback (eot mode). */
  trackId?: string;
}

interface PlayerState {
  queue: TrackDTO[];
  /** Play order: indices into queue (shuffle-aware) */
  order: number[];
  /** Position within order */
  pos: number;
  context: PlayContext | null;

  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Seek intent consumed by the playback engines (nonce changes per request) */
  seekRequest: { t: number; nonce: number } | null;

  /** Spotify-style endless autoplay: when the queue runs dry, append a radio mix. */
  autoplay: boolean;
  /** Set when the queue ended with autoplay on — the engine resolves a radio mix, extends and advances. */
  radioPending: { seedId: string; nonce: number } | null;
  /** Sleep timer: pause playback when it elapses. */
  sleepTimer: SleepTimer | null;

  playTracks: (tracks: TrackDTO[], startIndex?: number, context?: PlayContext | null) => void;
  playQueueIndex: (queueIndex: number) => void;
  togglePlay: () => void;
  pause: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: TrackDTO) => void;
  removeFromQueue: (queueIndex: number) => void;
  /** Move a queued track to play right after the current one. */
  playNextInQueue: (queueIndex: number) => void;
  /** Reorder the up-next portion of the play order (values = queue indices, new sequence). */
  reorderUpNext: (newTail: number[]) => void;
  clearUpNext: () => void;
  toggleAutoplay: () => void;
  extendQueue: (tracks: TrackDTO[]) => void;
  setSleepTimer: (minutes: number | 'end' | null) => void;
}

/**
 * The store is intentionally engine-agnostic: it holds queue + playback
 * intent (isPlaying / seekRequest), while PlayerEngine.tsx drives the
 * concrete engines — the <audio> element for local files and the YouTube
 * IFrame engine for YouTube Music tracks (real streamed audio).
 */

function shuffledOrder(n: number, first: number): number[] {
  const rest: number[] = [];
  for (let i = 0; i < n; i++) if (i !== first) rest.push(i);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [first, ...rest];
}

function linearOrder(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

let seekNonce = 0;
let radioNonce = 0;

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      order: [],
      pos: 0,
      context: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      volume: 0.8,
      muted: false,
      shuffle: false,
      repeat: 'off',
      seekRequest: null,
      autoplay: true,
      radioPending: null,
      sleepTimer: null,

      playTracks: (tracks, startIndex = 0, context = null) => {
        if (tracks.length === 0) return;
        const safeIndex = Math.max(0, Math.min(startIndex, tracks.length - 1));
        const shuffle = get().shuffle;
        const order = shuffle ? shuffledOrder(tracks.length, safeIndex) : linearOrder(tracks.length);
        const track = tracks[order[shuffle ? 0 : safeIndex]];
        set({
          queue: tracks,
          order,
          pos: shuffle ? 0 : safeIndex,
          context,
          isPlaying: true,
          progress: 0,
          duration: track?.duration ?? 0,
        });
      },

      playQueueIndex: (queueIndex) => {
        const { order, queue } = get();
        const pos = order.indexOf(queueIndex);
        if (pos === -1) return;
        const track = queue[order[pos]];
        set({ pos, isPlaying: true, progress: 0, duration: track?.duration ?? 0 });
      },

      togglePlay: () => {
        const { queue, order, pos, isPlaying } = get();
        if (!queue[order[pos]]) return;
        set({ isPlaying: !isPlaying });
      },

      pause: () => set({ isPlaying: false }),

      next: (auto = false) => {
        const { order, pos, repeat } = get();
        if (order.length === 0) return;
        let np = pos + 1;
        if (np >= order.length) {
          if (repeat === 'all') np = 0;
          else if (auto) {
            const { queue, autoplay } = get();
            const seed = queue[order[pos]];
            if (autoplay && seed?.source === 'youtube') {
              // endless autoplay: hand the seed to the engine, which resolves
              // a radio mix, appends it to the queue and advances
              set({ isPlaying: true, radioPending: { seedId: seed.id, nonce: ++radioNonce } });
              return;
            }
            // reached the end of the queue — stop
            set({ isPlaying: false, progress: 0 });
            return;
          } else np = 0; // manual next wraps around
        }
        const { queue } = get();
        const track = queue[order[np]];
        set({ pos: np, progress: 0, duration: track?.duration ?? 0 });
      },

      prev: () => {
        const { order, pos, progress } = get();
        if (order.length === 0) return;
        if (progress > 3) {
          get().seek(0);
          return;
        }
        const np = pos > 0 ? pos - 1 : order.length - 1;
        const { queue } = get();
        const track = queue[order[np]];
        set({ pos: np, progress: 0, duration: track?.duration ?? 0 });
      },

      seek: (seconds) => {
        const { duration } = get();
        const s = Math.max(0, Math.min(seconds, duration || seconds));
        set({ progress: s, seekRequest: { t: s, nonce: ++seekNonce } });
      },

      setVolume: (v) => {
        const vol = Math.max(0, Math.min(1, v));
        set({ volume: vol, muted: vol === 0 });
      },

      toggleMute: () => set({ muted: !get().muted }),

      toggleShuffle: () => {
        const { shuffle, queue, order, pos } = get();
        const nextShuffle = !shuffle;
        if (queue.length === 0) {
          set({ shuffle: nextShuffle });
          return;
        }
        const cur = order[pos] ?? 0;
        const newOrder = nextShuffle ? shuffledOrder(queue.length, cur) : linearOrder(queue.length);
        set({ shuffle: nextShuffle, order: newOrder, pos: Math.max(0, newOrder.indexOf(cur)) });
      },

      cycleRepeat: () => {
        const modes: RepeatMode[] = ['off', 'all', 'one'];
        const { repeat } = get();
        set({ repeat: modes[(modes.indexOf(repeat) + 1) % modes.length] });
      },

      addToQueue: (track) => {
        const { queue, order, pos } = get();
        const newQueue = [...queue, track];
        const newOrder = [...order];
        newOrder.splice(pos + 1, 0, newQueue.length - 1);
        set({ queue: newQueue, order: newOrder });
      },

      removeFromQueue: (queueIndex) => {
        const { queue, order, pos } = get();
        const cur = order[pos];
        if (queueIndex === cur) return; // never remove the playing track
        const newQueue = queue.filter((_, i) => i !== queueIndex);
        const newOrder = order
          .filter((i) => i !== queueIndex)
          .map((i) => (i > queueIndex ? i - 1 : i));
        const newCur = cur > queueIndex ? cur - 1 : cur;
        set({ queue: newQueue, order: newOrder, pos: Math.max(0, newOrder.indexOf(newCur)) });
      },

      playNextInQueue: (queueIndex) => {
        const { order, pos } = get();
        const cur = order[pos];
        if (queueIndex === cur) return;
        const rest = order.filter((i) => i !== queueIndex);
        const insertAt = rest.indexOf(cur) + 1;
        rest.splice(insertAt, 0, queueIndex);
        set({ order: rest, pos: rest.indexOf(cur) });
      },

      reorderUpNext: (newTail) => {
        const { order, pos, queue } = get();
        if (!queue.length) return;
        // keep everything up to and including the current track, replace the tail
        const head = order.slice(0, pos + 1);
        const tailSet = new Set(newTail);
        // preserve any tail entries missing from newTail (safety) at the end
        const missing = order.slice(pos + 1).filter((i) => !tailSet.has(i));
        set({ order: [...head, ...newTail, ...missing] });
      },

      clearUpNext: () => {
        const { queue, order, pos } = get();
        const cur = queue[order[pos]];
        if (!cur) return;
        set({ queue: [cur], order: [0], pos: 0 });
      },

      toggleAutoplay: () => set({ autoplay: !get().autoplay }),

      extendQueue: (tracks) => {
        const { queue, order } = get();
        if (tracks.length === 0) return;
        const base = queue.length;
        set({
          queue: [...queue, ...tracks],
          order: [...order, ...tracks.map((_, i) => base + i)],
        });
      },

      setSleepTimer: (kind) => {
        if (kind === null) {
          set({ sleepTimer: null });
          return;
        }
        if (kind === 'end') {
          const { queue, order, pos } = get();
          set({ sleepTimer: { mode: 'eot', endsAt: 0, trackId: queue[order[pos]]?.id } });
          return;
        }
        set({ sleepTimer: { mode: 'minutes', endsAt: Date.now() + kind * 60_000 } });
      },
    }),
    {
      name: 'spotify-player-prefs',
      partialize: (s) => ({
        volume: s.volume,
        muted: s.muted,
        shuffle: s.shuffle,
        repeat: s.repeat,
        autoplay: s.autoplay,
      }),
    }
  )
);

/** Selector helper: the currently playing track (or null). */
export function selectCurrentTrack(s: PlayerState): TrackDTO | null {
  return s.queue[s.order[s.pos]] ?? null;
}
