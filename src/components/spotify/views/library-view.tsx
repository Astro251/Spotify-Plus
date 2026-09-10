'use client';

import { BarChart3, Clock3, Plus } from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { EqualizerBars } from '@/components/spotify/ui-bits/equalizer-bars';
import { CreatePlaylistDialog } from '@/components/spotify/ui-bits/create-playlist-dialog';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { playLiked, playPlaylist } from '@/components/spotify/ui-bits/play-helpers';
import { LikedCover, RowSkeleton } from '@/components/spotify/views/view-bits';
import { useHistory, useLibrary } from '@/hooks/queries';
import { plural } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import { cn } from '@/lib/utils';

interface LibEntry {
  key: string;
  cover?: { src: string | null; from?: string | null; to?: string | null; icon?: string | null; mosaic?: string[] | null };
  liked?: boolean;
  history?: boolean;
  stats?: boolean;
  title: string;
  subtitle: string;
  playing: boolean;
  onClick: () => void;
  onPlay: () => void;
}

export function LibraryView() {
  const { data, isLoading, isError } = useLibrary();
  const history = useHistory();
  const push = useNav((s) => s.push);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);

  const entries: LibEntry[] = [];
  if (data) {
    entries.push({
      key: 'liked-songs',
      liked: true,
      title: 'Liked Songs',
      subtitle: `Playlist • ${plural(data.liked.count, 'song')}`,
      playing: isPlaying && context?.id === 'liked',
      onClick: () => push({ type: 'liked', title: 'Liked Songs' }),
      onPlay: () => void playLiked(),
    });
    // listening history — always present, count known once loaded
    const historyCount = history.data?.entries.length ?? 0;
    entries.push({
      key: 'recently-played',
      history: true,
      title: 'Recently played',
      subtitle: historyCount > 0 ? `History • ${plural(historyCount, 'song')}` : 'History',
      playing: isPlaying && context?.id === 'history',
      onClick: () => push({ type: 'history', title: 'Recently played' }),
      onPlay: () => {
        const tracks = (history.data?.entries ?? []).map((e) => e.track);
        if (tracks.length > 0) {
          usePlayer.getState().playTracks(tracks, 0, { id: 'history', label: 'Recently played' });
        }
      },
    });
    // listening stats — top tracks / artists / albums
    entries.push({
      key: 'top-played',
      stats: true,
      title: 'Top played',
      subtitle: 'Your listening stats',
      playing: isPlaying && context?.id === 'stats',
      onClick: () => push({ type: 'stats', title: 'Top played' }),
      onPlay: () => {
        // starts the user's top tracks — data may not be cached yet; the
        // stats view itself plays from its own loaded data
        push({ type: 'stats', title: 'Top played' });
      },
    });
    for (const p of data.playlists) {
      entries.push({
        key: p.id,
        cover: { src: p.cover, from: p.coverFrom, to: p.coverTo, icon: p.icon, mosaic: p.mosaic },
        title: p.name,
        subtitle: `Playlist • ${p.owner}`,
        playing: isPlaying && context?.id === `playlist:${p.slug}`,
        onClick: () => push({ type: 'playlist', id: p.slug, title: p.name }),
        onPlay: () => void playPlaylist(p.slug),
      });
    }
  }

  return (
    <div className="pt-2">
      {/* mobile-only: create playlist (desktop has it in the sidebar) */}
      <div className="mb-3 flex justify-end md:hidden">
        <CreatePlaylistDialog
          trigger={
            <button
              type="button"
              aria-label="Create playlist"
              suppressHydrationWarning
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 text-white transition hover:border-white"
            >
              <Plus className="h-5 w-5" aria-hidden />
            </button>
          }
        />
      </div>

      <div>
        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 6 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <p className="py-12 text-center text-sm text-subdued">Couldn&apos;t load Your Library. Try again in a moment.</p>
        ) : data && data.playlists.length === 0 && data.liked.count === 0 ? (
          <div className="mx-auto max-w-md py-10">
            <div className="rounded-lg bg-highlight/60 p-6 text-center">
              <h2 className="text-xl font-bold tracking-tight text-white">Create your first playlist</h2>
              <p className="mt-1 text-sm text-subdued">It&rsquo;s easy — we&rsquo;ll help you along the way.</p>
              <div className="mt-5 flex justify-center">
                <CreatePlaylistDialog
                  trigger={
                    <button
                      type="button"
                      suppressHydrationWarning
                      className="h-10 rounded-full bg-white px-6 text-sm font-bold text-black transition hover:scale-[1.03] hover:bg-white/85"
                    >
                      Create playlist
                    </button>
                  }
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* mobile: compact list rows */}
            <ul className="flex flex-col md:hidden">
              {entries.map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    onClick={entry.onClick}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left transition hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
                  >
                    {entry.liked ? (
                      <LikedCover className="h-12 w-12 rounded" iconClassName="h-5 w-5" />
                    ) : entry.history ? (
                      <HistoryCover className="h-12 w-12 rounded" iconClassName="h-5 w-5" />
                    ) : entry.stats ? (
                      <StatsCover className="h-12 w-12 rounded" iconClassName="h-5 w-5" />
                    ) : (
                      <Cover
                        src={entry.cover?.src}
                        from={entry.cover?.from}
                        to={entry.cover?.to}
                        icon={entry.cover?.icon}
                        mosaic={entry.cover?.mosaic}
                        alt={entry.title}
                        className="h-12 w-12 rounded"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {entry.playing && <EqualizerBars playing={isPlaying} className="h-3 w-3.5 shrink-0" />}
                        <span className={cn('truncate text-[0.95rem] font-semibold', entry.playing ? 'text-spotify' : 'text-white')}>
                          {entry.title}
                        </span>
                      </span>
                      <span className="block truncate text-sm text-subdued">{entry.subtitle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* md+: tile grid with hover play FAB */}
            <div className="hidden gap-2 md:grid md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
              {entries.map((entry) => (
                <div
                  key={entry.key}
                  role="button"
                  tabIndex={0}
                  onClick={entry.onClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      entry.onClick();
                    }
                  }}
                  className="group relative flex cursor-pointer items-center gap-4 rounded-lg bg-[#1a1a1a] p-3 transition hover:bg-[#242424] focus-visible:bg-[#242424] focus-visible:outline-none"
                >
                  {entry.liked ? (
                    <LikedCover className="h-[64px] w-[64px] rounded" iconClassName="h-7 w-7" />
                  ) : entry.history ? (
                    <HistoryCover className="h-[64px] w-[64px] rounded" iconClassName="h-7 w-7" />
                  ) : entry.stats ? (
                    <StatsCover className="h-[64px] w-[64px] rounded" iconClassName="h-7 w-7" />
                  ) : (
                    <Cover
                      src={entry.cover?.src}
                      from={entry.cover?.from}
                      to={entry.cover?.to}
                      icon={entry.cover?.icon}
                      mosaic={entry.cover?.mosaic}
                      alt={entry.title}
                      className="h-[64px] w-[64px] rounded"
                    />
                  )}
                  <span className="min-w-0 flex-1 pr-10">
                    <span className="flex items-center gap-1.5">
                      {entry.playing && <EqualizerBars playing={isPlaying} className="h-3 w-3.5 shrink-0" />}
                      <span
                        className={cn(
                          'block truncate text-base font-semibold',
                          entry.playing ? 'text-spotify' : 'text-white'
                        )}
                      >
                        {entry.title}
                      </span>
                    </span>
                    <span className="block truncate text-sm text-subdued">{entry.subtitle}</span>
                  </span>
                  <span className="absolute bottom-3 right-3 translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <PlayButton size="sm" playing={entry.playing} onClick={() => entry.onPlay()} label={`Play ${entry.title}`} />
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Teal gradient cover with a clock glyph — the Recently played entry. */
function HistoryCover({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-[#1f5f4f] to-[#38b98c] shadow-md', className)}>
      <Clock3 className={cn('fill-none text-white', iconClassName)} aria-hidden />
    </div>
  );
}

/** Rose gradient cover with a chart glyph — the Top played stats entry. */
function StatsCover({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-[#a4133c] to-[#ff4d6d] shadow-md', className)}>
      <BarChart3 className={cn('fill-none text-white', iconClassName)} aria-hidden />
    </div>
  );
}
