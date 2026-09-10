'use client';

import { create } from 'zustand';

interface UIState {
  nowPlayingOpen: boolean;
  queueOpen: boolean;
  /** Karaoke lyrics panel inside the now-playing fullscreen. */
  lyricsOpen: boolean;
  searchQuery: string;
  setNowPlayingOpen: (open: boolean) => void;
  toggleNowPlaying: () => void;
  setQueueOpen: (open: boolean) => void;
  toggleQueue: () => void;
  setLyricsOpen: (open: boolean) => void;
  toggleLyrics: () => void;
  setSearchQuery: (q: string) => void;
}

export const useUI = create<UIState>()((set) => ({
  nowPlayingOpen: false,
  queueOpen: false,
  lyricsOpen: false,
  searchQuery: '',
  setNowPlayingOpen: (open) => set({ nowPlayingOpen: open }),
  toggleNowPlaying: () => set((s) => ({ nowPlayingOpen: !s.nowPlayingOpen })),
  setQueueOpen: (open) => set({ queueOpen: open }),
  toggleQueue: () => set((s) => ({ queueOpen: !s.queueOpen })),
  setLyricsOpen: (open) => set({ lyricsOpen: open }),
  toggleLyrics: () => set((s) => ({ lyricsOpen: !s.lyricsOpen })),
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
