'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CloudOff, Music2, Search, SearchX, X } from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { Shelf } from '@/components/spotify/ui-bits/shelf';
import { TrackRow } from '@/components/spotify/ui-bits/track-row';
import { playAlbum, playArtist, playPlaylist } from '@/components/spotify/ui-bits/play-helpers';
import { AlbumCard, ArtistCard, PlaylistCard, RowSkeleton } from '@/components/spotify/views/view-bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearch } from '@/hooks/queries';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import { useUI } from '@/lib/store/ui';
import { useSyncExternalStore } from 'react';
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearchesServerSnapshot,
  getRecentSearchesSnapshot,
  removeRecentSearch,
  subscribeRecentSearches,
} from '@/lib/recent-searches';
import type { TopResult } from '@/lib/types';

const GENRES = [
  'Synthwave',
  'Lo-Fi',
  'Ambient',
  'Hip-Hop',
  'Indie Rock',
  'Folk',
  'R&B',
  'Piano',
  'Electronic',
  'Chill',
  'Acoustic',
  'Dream Pop',
];

const GENRE_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#e0115f', '#3d0b1e'],
  ['#1ed760', '#0c3a22'],
  ['#e8550d', '#471803'],
  ['#a04bd8', '#2a0f47'],
  ['#0e7a6d', '#05241f'],
  ['#d94f4f', '#3a0d0d'],
  ['#c9a017', '#332603'],
  ['#8a8a8a', '#262626'],
  ['#ff5e8a', '#3d0b21'],
  ['#b3ff2e', '#22380c'],
];

export function SearchView() {
  const [text, setText] = useState(() => useUI.getState().searchQuery);
  const setSearchQuery = useUI((s) => s.setSearchQuery);
  const query = useUI((s) => s.searchQuery);
  const { data, isLoading, isError, refetch } = useSearch(query);
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playTracks = usePlayer((s) => s.playTracks);
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" hotkey → jump here + focus the field (handles both cases: view
  // already open (event) or just mounted after navigation (pending flag))
  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener('app:focus-search', onFocus);
    if ((window as unknown as { __searchFocusPending?: boolean }).__searchFocusPending) {
      (window as unknown as { __searchFocusPending?: boolean }).__searchFocusPending = false;
      inputRef.current?.focus();
    }
    return () => window.removeEventListener('app:focus-search', onFocus);
  }, []);

  // debounce local input → global search query; commit to recent searches
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(text);
      if (text.trim().length >= 2) addRecentSearch(text.trim());
    }, 250);
    return () => window.clearTimeout(t);
  }, [text, setSearchQuery]);

  // recent searches (localStorage store — server snapshot empty, no hydration gap)
  const recents = useSyncExternalStore(
    subscribeRecentSearches,
    getRecentSearchesSnapshot,
    getRecentSearchesServerSnapshot
  );

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const isEmpty =
    !!data &&
    !data.topResult &&
    data.tracks.length === 0 &&
    data.albums.length === 0 &&
    data.artists.length === 0 &&
    data.playlists.length === 0;

  return (
    <div className="pt-2">
      {/* sticky search field + source toggle below the top bar */}
      <div className="sticky top-16 z-20 -mx-4 bg-base/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-subdued" aria-hidden />
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you want to listen to?"
            aria-label="Search for songs, artists, albums, and playlists"
            className="h-12 rounded-full border-none bg-highlight pl-12 pr-11 text-base text-white placeholder:text-subdued focus-visible:ring-white/60"
          />
          {text.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText('');
                setSearchQuery('');
              }}
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-subdued transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="pt-2">
        {!hasQuery ? (
          <div className="space-y-8">
            {recents.length > 0 && (
              <section aria-label="Recent searches">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">Recent searches</h2>
                  <button
                    type="button"
                    onClick={() => clearRecentSearches()}
                    className="text-xs font-bold uppercase tracking-wide text-subdued transition hover:text-white"
                  >
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recents.map((q) => (
                    <span
                      key={q}
                      className="group flex items-center gap-1 rounded-full bg-highlight py-1.5 pl-3 pr-1.5 text-sm font-medium text-white transition hover:bg-white/15"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setText(q);
                          setSearchQuery(q);
                        }}
                        className="max-w-[180px] truncate"
                      >
                        {q}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${q} from recent searches`}
                        onClick={() => removeRecentSearch(q)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-subdued transition hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section aria-label="Browse all">
              <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">Browse all</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {GENRES.map((genre, i) => {
                const [c1, c2] = GENRE_GRADIENTS[i % GENRE_GRADIENTS.length];
                return (
                  <button
                    key={genre}
                    type="button"
                    aria-label={`Search ${genre}`}
                    onClick={() => {
                      setText(genre);
                      setSearchQuery(genre);
                    }}
                    style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }}
                    className="group relative aspect-[4/3] overflow-hidden rounded-lg text-left transition duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    <span className="absolute bottom-3 left-4 right-4 text-lg font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] md:text-xl">
                      {genre}
                    </span>
                    <Music2
                      className="absolute -bottom-3 -right-3 h-20 w-20 rotate-12 text-white/20 transition-transform duration-300 group-hover:scale-110 md:h-24 md:w-24"
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </section>
          </div>
        ) : isError ? (
          <div className="mx-auto max-w-md py-10">
            <div className="rounded-lg bg-highlight/60 p-6 text-center">
              <CloudOff className="mx-auto h-10 w-10 text-subdued" aria-hidden />
              <h2 className="mt-3 text-xl font-bold tracking-tight text-white">Couldn&rsquo;t complete your search</h2>
              <p className="mt-1 text-sm text-subdued">Check your connection and try again.</p>
              <Button
                type="button"
                onClick={() => void refetch()}
                className="mt-5 h-10 rounded-full bg-white px-6 text-sm font-bold text-black hover:bg-white/85"
              >
                Try again
              </Button>
            </div>
          </div>
        ) : isLoading ? (
          <SearchSkeleton />
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <SearchX className="h-12 w-12 text-subdued" aria-hidden />
            <h2 className="text-2xl font-bold tracking-tight text-white">No results found for &ldquo;{trimmed}&rdquo;</h2>
            <p className="max-w-sm text-sm text-subdued">
              Please make sure your words are spelled correctly, or use fewer or different keywords.
            </p>
          </div>
        ) : (
          <div className="space-y-10 md:space-y-12">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {data?.topResult && (
                <section aria-label="Top result" className="min-w-0">
                  <h2 className="mb-3 text-xl font-bold tracking-tight text-white md:text-2xl">Top result</h2>
                  <TopResultCard result={data.topResult} query={trimmed} />
                </section>
              )}
              {data && data.tracks.length > 0 && (
                <section aria-label="Songs" className="min-w-0">
                  <h2 className="mb-3 text-xl font-bold tracking-tight text-white md:text-2xl">Songs</h2>
                  {data.tracks.slice(0, 6).map((t, i) => (
                    <TrackRow
                      key={t.id}
                      track={t}
                      index={i + 1}
                      variant="playlist"
                      isActive={cur?.id === t.id}
                      isPlaying={isPlaying}
                      onPlay={() => playTracks(data.tracks, i, { id: 'search', label: `Search: ${trimmed}` })}
                    />
                  ))}
                </section>
              )}
            </div>

            {data && data.artists.length > 0 && (
              <Shelf title="Artists">
                {data.artists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </Shelf>
            )}
            {data && data.albums.length > 0 && (
              <Shelf title="Albums">
                {data.albums.map((a) => (
                  <AlbumCard key={a.id} album={a} />
                ))}
              </Shelf>
            )}
            {data && data.playlists.length > 0 && (
              <Shelf title="Playlists">
                {data.playlists.map((p) => (
                  <PlaylistCard key={p.id} playlist={p} />
                ))}
              </Shelf>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ top result ------------------------------- */

function TopResultCard({ result, query }: { result: TopResult; query: string }) {
  const push = useNav((s) => s.push);
  const playTracks = usePlayer((s) => s.playTracks);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);

  let typeLabel = '';
  let title = '';
  let subtitle: string | null = null;
  let cover: ReactNode = null;
  let playing = false;
  let play: () => void = () => undefined;
  let go: () => void = () => undefined;

  switch (result.type) {
    case 'track': {
      typeLabel = 'Song';
      title = result.title;
      subtitle = result.artist.name;
      cover = (
        <Cover
          src={result.album.cover}
          from={result.album.accent}
          alt={result.title}
          priority
          className="h-16 w-16 rounded md:h-24 md:w-24"
        />
      );
      playing = isPlaying && cur?.id === result.id;
      play = () => {
        if (cur?.id === result.id) togglePlay();
        else playTracks([result], 0, { id: 'search', label: query });
      };
      go = () => push({ type: 'album', id: result.album.slug, title: result.album.title });
      break;
    }
    case 'artist': {
      typeLabel = 'Artist';
      title = result.name;
      cover = <Cover src={result.image} alt={result.name} priority className="h-16 w-16 rounded-full md:h-24 md:w-24" />;
      playing = isPlaying && context?.id === `artist:${result.slug}`;
      play = () => {
        if (context?.id === `artist:${result.slug}`) togglePlay();
        else void playArtist(result.slug);
      };
      go = () => push({ type: 'artist', id: result.slug, title: result.name });
      break;
    }
    case 'playlist': {
      typeLabel = 'Playlist';
      title = result.name;
      subtitle = `By ${result.owner}`;
      cover = (
        <Cover
          src={result.cover}
          from={result.coverFrom}
          to={result.coverTo}
          icon={result.icon}
          mosaic={result.mosaic}
          alt={result.name}
          priority
          className="h-16 w-16 rounded md:h-24 md:w-24"
        />
      );
      playing = isPlaying && context?.id === `playlist:${result.slug}`;
      play = () => {
        if (context?.id === `playlist:${result.slug}`) togglePlay();
        else void playPlaylist(result.slug);
      };
      go = () => push({ type: 'playlist', id: result.slug, title: result.name });
      break;
    }
    case 'album': {
      typeLabel = 'Album';
      title = result.title;
      subtitle = result.artist.name;
      cover = (
        <Cover
          src={result.cover}
          from={result.accent}
          alt={result.title}
          priority
          className="h-16 w-16 rounded md:h-24 md:w-24"
        />
      );
      playing = isPlaying && context?.id === `album:${result.slug}`;
      play = () => {
        if (context?.id === `album:${result.slug}`) togglePlay();
        else void playAlbum(result.slug);
      };
      go = () => push({ type: 'album', id: result.slug, title: result.title });
      break;
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
      className="group relative cursor-pointer rounded-lg bg-highlight/60 p-4 transition-colors duration-200 hover:bg-highlight focus-visible:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <div className="flex items-center gap-4">
        {cover}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-subdued">{typeLabel}</p>
          <h3 className="mt-1 truncate text-xl font-bold tracking-tight text-white md:text-2xl">{title}</h3>
          {subtitle && <p className="mt-1 truncate text-sm text-subdued">{subtitle}</p>}
        </div>
        <PlayButton
          playing={playing}
          onClick={() => play()}
          label={`${playing ? 'Pause' : 'Play'} ${title}`}
          className="h-10 w-10 shrink-0 md:absolute md:bottom-4 md:right-4 md:h-12 md:w-12 md:translate-y-2 md:opacity-0 md:transition-all md:duration-300 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100"
        />
      </div>
    </div>
  );
}

/* ------------------------------- skeletons -------------------------------- */

function SearchSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-4" aria-hidden>
        <div className="h-7 w-28 animate-pulse rounded bg-highlight/70" />
        <div className="h-24 animate-pulse rounded-lg bg-highlight/70 md:h-32" />
      </section>
      <section className="space-y-1" aria-hidden>
        <div className="h-7 w-20 animate-pulse rounded bg-highlight/70" />
        {Array.from({ length: 4 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </section>
    </div>
  );
}
