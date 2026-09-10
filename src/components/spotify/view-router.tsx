'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNav } from '@/lib/store/navigation';
import { HomeView } from '@/components/spotify/views/home-view';
import { SearchView } from '@/components/spotify/views/search-view';
import { LibraryView } from '@/components/spotify/views/library-view';
import { LikedView } from '@/components/spotify/views/liked-view';
import { PlaylistView } from '@/components/spotify/views/playlist-view';
import { AlbumView } from '@/components/spotify/views/album-view';
import { ArtistView } from '@/components/spotify/views/artist-view';
import { HistoryView } from '@/components/spotify/views/history-view';
import { StatsView } from '@/components/spotify/views/stats-view';

function viewKey(type: string, id?: string) {
  return id ? `${type}:${id}` : type;
}

/** Renders the current view from the navigation stack. */
export function ViewRouter() {
  const stack = useNav((s) => s.stack);
  const view = stack[stack.length - 1];

  // reset scroll on navigation
  useEffect(() => {
    document.getElementById('app-main')?.scrollTo({ top: 0 });
  }, [view.type, view.id]);

  let content: React.ReactNode = null;
  switch (view.type) {
    case 'home':
      content = <HomeView />;
      break;
    case 'search':
      content = <SearchView />;
      break;
    case 'library':
      content = <LibraryView />;
      break;
    case 'liked':
      content = <LikedView />;
      break;
    case 'playlist':
      content = <PlaylistView id={view.id} />;
      break;
    case 'album':
      content = <AlbumView id={view.id} />;
      break;
    case 'artist':
      content = <ArtistView id={view.id} />;
      break;
    case 'history':
      content = <HistoryView />;
      break;
    case 'stats':
      content = <StatsView />;
      break;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey(view.type, view.id)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="pb-10 md:pb-6"
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
