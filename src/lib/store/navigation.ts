'use client';

import { create } from 'zustand';

export type ViewType = 'home' | 'search' | 'library' | 'liked' | 'playlist' | 'album' | 'artist' | 'history' | 'stats';
export type TabType = 'home' | 'search' | 'library';

export interface View {
  type: ViewType;
  /** entity id or slug (playlist/album/artist) */
  id?: string;
  /** display title for top bar */
  title?: string;
}

interface NavState {
  stack: View[];
  future: View[];
  tab: TabType;
  push: (v: View) => void;
  /** Reset stack to a root tab view */
  setTab: (t: TabType) => void;
  /** Reset stack to arbitrary view (rarely used) */
  reset: (v: View, tab?: TabType) => void;
  back: () => void;
  forward: () => void;
}

export const useNav = create<NavState>()((set, get) => ({
  stack: [{ type: 'home' }],
  future: [],
  tab: 'home',

  push: (v) => set((s) => ({ stack: [...s.stack, v], future: [] })),

  setTab: (t) => set((s) => {
    const top = s.stack[s.stack.length - 1];
    if (top.type === t && s.stack.length === 1) return s;
    return { stack: [{ type: t }], future: [] , tab: t };
  }),

  reset: (v, tab) => set((s) => ({ stack: [v], future: [], tab: tab ?? s.tab })),

  back: () => set((s) => {
    if (s.stack.length <= 1) return s;
    const top = s.stack[s.stack.length - 1];
    return { stack: s.stack.slice(0, -1), future: [top, ...s.future] };
  }),

  forward: () => set((s) => {
    if (s.future.length === 0) return s;
    const [next, ...rest] = s.future;
    return { stack: [...s.stack, next], future: rest };
  }),
}));

/** Current view (top of stack). */
export function useView(): View {
  return useNav((s) => s.stack[s.stack.length - 1]);
}
