'use client';

import { useSyncExternalStore } from 'react';
import { Heart } from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { MediaCard } from '@/components/spotify/ui-bits/media-card';
import { Shelf } from '@/components/spotify/ui-bits/shelf';
import { Button } from '@/components/ui/button';
import { QuickTileSkeleton, ShelfItemCard, ShelfSkeleton } from '@/components/spotify/views/view-bits';
import { useHomeFeed } from '@/hooks/queries';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import type { ShelfItem, TrackDTO } from '@/lib/types';

/** Client snapshot: hour-based Spotify greeting. */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const subscribeNoop = () => () => {};

export function HomeView() {
  const { data: feed, isLoading, isError, refetch } = useHomeFeed();
  const push = useNav((s) => s.push);
  const playTracks = usePlayer((s) => s.playTracks);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const currentId = usePlayer((s) => s.queue[s.order[s.pos]]?.id ?? null);

  // time-based greeting (client-only — timezones differ from the server);
  // useSyncExternalStore is the canonical client-only-value pattern
  const greeting = useSyncExternalStore(
    subscribeNoop,
    getGreeting,
    () => null
  );

  /** Tap a recent track: play it now — endless autoplay continues the mix. */
  const playRecent = (t: TrackDTO) => {
    playTracks([t], 0, { id: `recent:${t.id}`, label: 'Recently played' });
  };

  if (isError) {
    return (
      <div className="mx-auto max-w-md pt-16">
        <div className="rounded-lg bg-highlight/60 p-6 text-center">
          <h2 className="text-xl font-bold tracking-tight text-white">Something went wrong</h2>
          <p className="mt-1 text-sm text-subdued">
            Couldn&rsquo;t load your feed. Check your connection and try again.
          </p>
          <Button
            type="button"
            onClick={() => void refetch()}
            className="mt-5 h-10 rounded-full bg-white px-6 text-sm font-bold text-black hover:bg-white/85"
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 pt-2 md:space-y-12">
      {/* greeting — desktop only (the mobile top bar already greets);
          client-side via useSyncExternalStore to dodge TZ hydration mismatch */}
      {greeting && (
        <header className="hidden md:block">
          <h1 className="text-3xl font-extrabold tracking-tight text-white">{greeting}</h1>
        </header>
      )}

      {/* shortcut grid: Liked Songs first, then quick picks */}
      <section aria-label="Quick picks">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <button
            type="button"
            onClick={() => push({ type: 'liked', title: 'Liked Songs' })}
            className="flex h-14 items-center gap-3 overflow-hidden rounded-lg bg-gradient-to-br from-[#5038a0] to-[#8d67df] px-3 text-left transition duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:h-[72px]"
          >
            <Heart className="h-6 w-6 shrink-0 fill-white text-white" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-white md:text-base">Liked Songs</span>
          </button>

          {isLoading
            ? Array.from({ length: 7 }, (_, i) => <QuickTileSkeleton key={`qp-skeleton-${i}`} />)
            : feed?.quickPicks.map((item) => <QuickTile key={item.id} item={item} />)}
        </div>
      </section>

      {/* recently played — "Jump back in" */}
      {!isLoading && (feed?.recentTracks?.length ?? 0) > 0 && (
        <Shelf
          title="Jump back in"
          onShowAll={() => push({ type: 'history', title: 'Recently played' })}
        >
          {feed!.recentTracks.map((t) => (
            <MediaCard
              key={`recent-${t.id}`}
              cover={t.album.cover}
              from={t.album.accent}
              title={t.title}
              subtitle={t.artist.name}
              playing={isPlaying && currentId === t.id}
              onClick={() => playRecent(t)}
              onPlay={() => playRecent(t)}
            />
          ))}
        </Shelf>
      )}

      {/* shelves */}
      {isLoading ? (
        <>
          <ShelfSkeleton />
          <ShelfSkeleton />
        </>
      ) : (
        feed?.shelves.map((s) => (
          <Shelf key={s.id} title={s.title}>
            {s.items.map((item, i) => (
              <ShelfItemCard key={`${item.id}-${i}`} item={item} />
            ))}
          </Shelf>
        ))
      )}
    </div>
  );
}

/** Shortcut tile for any shelf item (playlist, album, artist, or song). */
function QuickTile({ item }: { item: ShelfItem }) {
  const push = useNav((s) => s.push);

  if ('image' in item) {
    // artist
    return (
      <button
        type="button"
        onClick={() => push({ type: 'artist', id: item.slug, title: item.name })}
        className="flex h-14 items-center overflow-hidden rounded-md bg-white/10 text-left transition duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:h-[72px]"
      >
        <Cover src={item.image} alt={`${item.name} photo`} className="aspect-square h-full rounded-full" />
        <span className="min-w-0 flex-1 truncate px-3 text-sm font-bold text-white md:text-base">{item.name}</span>
      </button>
    );
  }

  if ('coverFrom' in item) {
    // playlist (incl. single-song pseudo playlists)
    return (
      <button
        type="button"
        onClick={() => push({ type: 'playlist', id: item.slug, title: item.name })}
        className="flex h-14 items-center overflow-hidden rounded-md bg-white/10 text-left transition duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:h-[72px]"
      >
        <Cover
          src={item.cover}
          from={item.coverFrom}
          to={item.coverTo}
          icon={item.icon}
          mosaic={item.mosaic}
          alt={`${item.name} cover`}
          className="aspect-square h-full"
        />
        <span className="min-w-0 flex-1 truncate px-3 text-sm font-bold text-white md:text-base">{item.name}</span>
      </button>
    );
  }

  // album
  return (
    <button
      type="button"
      onClick={() => push({ type: 'album', id: item.slug, title: item.title })}
      className="flex h-14 items-center overflow-hidden rounded-md bg-white/10 text-left transition duration-200 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:h-[72px]"
    >
      <Cover src={item.cover} from={item.accent} alt={`${item.title} cover`} className="aspect-square h-full" />
      <span className="min-w-0 flex-1 truncate px-3 text-sm font-bold text-white md:text-base">{item.title}</span>
    </button>
  );
}
