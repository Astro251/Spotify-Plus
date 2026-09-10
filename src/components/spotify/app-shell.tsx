'use client';

import { AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/spotify/sidebar';
import { MobileNav } from '@/components/spotify/mobile-nav';
import { TopBar } from '@/components/spotify/top-bar';
import { PlayerBar } from '@/components/spotify/player-bar';
import { NowPlaying } from '@/components/spotify/now-playing';
import { QueueSheet } from '@/components/spotify/queue-sheet';
import { ViewRouter } from '@/components/spotify/view-router';
import { SharedLinkHandler } from '@/components/spotify/shared-link-handler';
import { ShortcutsDialog } from '@/components/spotify/ui-bits/shortcuts-dialog';
import { usePlayerHotkeys } from '@/hooks/use-player-hotkeys';
import { useUI } from '@/lib/store/ui';

/**
 * Root layout: desktop sidebar + scrolling main + player bar + mobile nav.
 * The player/nav live in normal flow (flex column) so the footer is always
 * pinned to the bottom without covering content.
 */
export function AppShell() {
  const nowPlayingOpen = useUI((s) => s.nowPlayingOpen);
  usePlayerHotkeys();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black text-white">
      <SharedLinkHandler />
      <div className="flex min-h-0 flex-1 md:gap-2 md:p-2">
        <Sidebar />
        <main
          id="app-main"
          className="scrollbar-thin relative min-w-0 flex-1 overflow-y-auto overscroll-contain bg-base md:rounded-lg"
        >
          {/* per-view ambient gradient (replaced by views' own hero) */}
          <TopBar />
          <div className="px-4 pt-1 md:px-6">
            <ViewRouter />
          </div>
        </main>
      </div>
      <PlayerBar />
      <MobileNav />
      <AnimatePresence>{nowPlayingOpen && <NowPlaying />}</AnimatePresence>
      <QueueSheet />
      <ShortcutsDialog />
    </div>
  );
}
