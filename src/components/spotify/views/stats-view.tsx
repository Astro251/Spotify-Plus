'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  CalendarDays,
  Disc3,
  ListMusic,
  Play,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { EqualizerBars } from '@/components/spotify/ui-bits/equalizer-bars';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { HeroGradient, HeroSkeleton, RowSkeleton } from '@/components/spotify/views/view-bits';
import { Button } from '@/components/ui/button';
import { useStats } from '@/hooks/queries';
import { formatCount, formatTotalDuration, plural } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import { cn } from '@/lib/utils';
import type { StatsRange } from '@/lib/types';

const RANGES: { key: StatsRange; label: string; long: string }[] = [
  { key: 'week', label: 'This week', long: 'the last 7 days' },
  { key: 'month', label: 'This month', long: 'the last 30 days' },
  { key: 'all', label: 'All time', long: 'all time' },
];

/** Wrapped-style listening stats: top tracks, artists and albums for a range. */
export function StatsView() {
  const [range, setRange] = useState<StatsRange>('week');
  const { data, isLoading, isError, refetch, isFetching } = useStats(range);
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playTracks = usePlayer((s) => s.playTracks);
  const setTab = useNav((s) => s.setTab);

  const rangeMeta = RANGES.find((r) => r.key === range) ?? RANGES[0];
  const isCtx = context?.id === 'stats';
  const topTracks = data?.topTracks ?? [];
  const maxPlays = topTracks[0]?.plays ?? 1;

  if (isLoading) {
    return (
      <div className="relative pt-2">
        <HeroGradient from="#7a1f3d" />
        <div className="relative z-10">
          <HeroSkeleton />
        </div>
        <div className="relative z-10 mt-6">
          <div className="mb-4 flex gap-2">
            {RANGES.map((r) => (
              <div key={r.key} className="h-8 w-24 animate-pulse rounded-full bg-white/10" />
            ))}
          </div>
          <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold text-white">Couldn&apos;t load your stats</h1>
        <p className="mt-2 text-sm text-subdued">Something went wrong. Try again in a moment.</p>
        <Button
          onClick={() => void refetch()}
          className="mt-6 h-10 rounded-full bg-white px-6 text-sm font-bold text-black hover:bg-white/85"
        >
          Try again
        </Button>
      </div>
    );
  }

  const summary = data?.summary;
  const empty = !!summary && summary.plays === 0;

  return (
    <div className="relative pt-2">
      <HeroGradient from="#7a1f3d" />

      {/* hero */}
      <div className="relative z-10 flex flex-col items-center gap-4 pt-6 text-center md:flex-row md:items-end md:gap-6 md:pt-12 md:text-left">
        <div className="flex aspect-square w-40 items-center justify-center rounded-md bg-gradient-to-br from-[#a4133c] to-[#ff4d6d] shadow-2xl md:w-52 lg:w-56">
          <Trophy className="h-16 w-16 text-white" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Your stats</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">Top played</h1>
          {summary && !empty && (
            <p className="mt-3 text-sm text-white/80">
              You • {formatCount(summary.plays)} plays • {formatTotalDuration(summary.seconds)} of music
            </p>
          )}
        </div>
      </div>

      {/* range segmented control */}
      <div
        role="tablist"
        aria-label="Stats time range"
        className="sticky top-16 z-20 -mx-2 mt-4 flex gap-2 bg-base/85 px-2 py-3 backdrop-blur-sm md:-mx-4 md:px-4"
      >
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={range === r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              'h-8 flex-1 whitespace-nowrap rounded-full px-3 text-[13px] font-bold transition md:flex-none md:px-4 md:text-sm',
              range === r.key
                ? 'bg-white text-black'
                : 'border border-white/25 text-white/70 hover:border-white/60 hover:text-white'
            )}
          >
            {r.label}
          </button>
        ))}
        {isFetching && (
          <RefreshCw className="h-4 w-4 animate-spin self-center text-white/60" aria-hidden />
        )}
      </div>

      {empty ? (
        <div className="relative z-10 flex flex-col items-center gap-4 py-16 text-center">
          <BarChart3 className="h-12 w-12 text-subdued" aria-hidden />
          <h2 className="text-2xl font-bold tracking-tight text-white">No plays {rangeMeta.long === 'all time' ? 'yet' : rangeMeta.long}</h2>
          <p className="max-w-xs text-sm text-subdued">Songs you play show up here with your top artists and albums</p>
          <Button
            onClick={() => setTab('search')}
            className="h-auto rounded-full bg-white px-6 py-3 text-base font-bold text-black transition hover:scale-105 hover:bg-white"
          >
            Find something to play
          </Button>
        </div>
      ) : (
        summary && (
          <>
            {/* summary stat tiles */}
            <section aria-label="Listening summary" className="relative z-10 grid grid-cols-2 gap-2 pb-2 pt-1 md:grid-cols-4 md:gap-3">
              <StatTile icon={<Play className="h-4 w-4" />} value={formatCount(summary.plays)} label="plays" accent="#1ed760" />
              <StatTile icon={<CalendarDays className="h-4 w-4" />} value={formatTotalDuration(summary.seconds)} label="listening time" accent="#ff4d6d" />
              <StatTile icon={<ListMusic className="h-4 w-4" />} value={formatCount(summary.trackCount)} label="unique tracks" accent="#ffd166" />
              <StatTile icon={<Disc3 className="h-4 w-4" />} value={formatCount(summary.artistCount)} label="artists played" accent="#4cc9b0" />
            </section>

            {/* top tracks */}
            {topTracks.length > 0 && (
              <section aria-label="Top tracks" className="relative z-10 mt-8">
                <div className="mb-2 flex items-center gap-5">
                  <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">Top tracks</h2>
                  <span className="text-xs text-subdued">from {rangeMeta.long}</span>
                </div>
                <div className="flex items-center gap-4 py-2">
                  <PlayButton
                    size="md"
                    playing={isPlaying && isCtx}
                    onClick={() => {
                      if (isCtx) togglePlay();
                      else if (topTracks.length > 0)
                        playTracks(
                          topTracks.map((t) => t.track),
                          0,
                          { id: 'stats', label: 'Your Top Played' }
                        );
                    }}
                    label={isCtx && isPlaying ? 'Pause Top played' : 'Play Top played'}
                  />
                  <p className="text-sm text-subdued">
                    Plays are counted per full listen {summary.activeDays > 0 && <>• active {plural(summary.activeDays, 'day')}</>}
                  </p>
                </div>
                <ol className="mt-2">
                  {topTracks.map((t, i) => {
                    const active = cur?.id === t.track.id && isCtx;
                    const barPct = Math.max(4, Math.round((t.plays / maxPlays) * 100));
                    return (
                      <motion.li
                        key={t.track.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (isCtx && cur?.id === t.track.id) togglePlay();
                            else
                              playTracks(
                                topTracks.map((x) => x.track),
                                i,
                                { id: 'stats', label: 'Your Top Played' }
                              );
                          }}
                          className="group relative flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition focus-visible:bg-white/10 focus-visible:outline-none md:gap-4"
                          aria-label={`Play ${t.track.title} (${plural(t.plays, 'play')})`}
                        >
                          {/* relative-plays bar */}
                          <span
                            aria-hidden
                            className="absolute inset-y-1 left-0 rounded-md bg-gradient-to-r from-white/25 to-white/5 transition-colors duration-500 group-hover:from-spotify/40 group-hover:to-spotify/10"
                            style={{ width: `${barPct}%` }}
                          />
                          <span
                            className={cn(
                              'relative z-10 w-7 shrink-0 text-right text-lg font-black tabular-nums',
                              active ? 'text-spotify' : 'text-white/40 group-hover:text-white/70'
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="relative z-10 h-12 w-12 shrink-0">
                            <Cover
                              src={t.track.album.cover}
                              from={t.track.album.accent}
                              to="#111"
                              alt={`${t.track.album.title} cover`}
                              className="h-12 w-12 rounded"
                            />
                          </span>
                          <span className="relative z-10 min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              {active && <EqualizerBars playing={isPlaying} className="h-3 w-3.5 shrink-0" />}
                              <span
                                className={cn('truncate text-[0.95rem] font-semibold', active ? 'text-spotify' : 'text-white')}
                              >
                                {t.track.title}
                              </span>
                            </span>
                            <span className="block truncate text-sm text-subdued">{t.track.artist.name}</span>
                          </span>
                          <span className="relative z-10 mr-1 shrink-0 rounded-full bg-black/40 px-2.5 py-1 text-xs font-bold tabular-nums text-white/80">
                            {formatCount(t.plays)}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ol>
              </section>
            )}

            {/* top artists */}
            {(data?.topArtists.length ?? 0) > 0 && (
              <section aria-label="Top artists" className="relative z-10 mt-10">
                <div className="mb-1 flex items-center gap-5">
                  <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">Top artists</h2>
                  <span className="text-xs text-subdued">most played {rangeMeta.long}</span>
                </div>
                <div className="scrollbar-hide -mx-2 flex gap-4 overflow-x-auto px-2 pb-2 pt-3 md:mx-0 md:px-0">
                  {data?.topArtists.map((a, i) => (
                    <motion.button
                      key={a.artist.id}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.05, 0.35), duration: 0.25 }}
                      onClick={() => {
                        const push = useNav.getState().push;
                        push({ type: 'artist', id: a.artist.slug, title: a.artist.name });
                      }}
                      className="group w-[104px] shrink-0 rounded-lg p-2 text-left transition hover:bg-white/5 focus-visible:bg-white/5 focus-visible:outline-none md:w-[132px]"
                      aria-label={`Go to ${a.artist.name}, ${plural(a.plays, 'play')}`}
                    >
                      <span className="relative block">
                        <Cover
                          src={a.artist.image}
                          from="#333"
                          to="#111"
                          alt={`${a.artist.name} photo`}
                          className="aspect-square w-full rounded-full ring-1 ring-white/10"
                          iconClassName="h-10 w-10"
                        />
                        <span
                          aria-hidden
                          className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-base text-xs font-black text-white shadow-md ring-1 ring-white/15"
                        >
                          {i + 1}
                        </span>
                      </span>
                      <span className="mt-2 flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-white group-hover:text-spotify">{a.artist.name}</span>
                      </span>
                      <span className="block truncate text-xs text-subdued">
                        {formatCount(a.plays)} plays • {a.trackCount} tracks
                      </span>
                    </motion.button>
                  ))}
                </div>
              </section>
            )}

            {/* top albums */}
            {(data?.topAlbums.length ?? 0) > 0 && (
              <section aria-label="Top albums" className="relative z-10 mt-10">
                <div className="mb-1 flex items-center gap-5">
                  <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">Top albums</h2>
                  <span className="text-xs text-subdued">you replayed {rangeMeta.long}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {data?.topAlbums.map((al, i) => (
                    <motion.button
                      key={al.album.id}
                      type="button"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.25 }}
                      onClick={() => {
                        const push = useNav.getState().push;
                        push({ type: 'album', id: al.album.slug, title: al.album.title });
                      }}
                      className="group rounded-lg bg-[#181818] p-3 text-left transition hover:bg-[#242424] focus-visible:bg-[#242424] focus-visible:outline-none"
                      aria-label={`Go to ${al.album.title}, ${plural(al.plays, 'play')}`}
                    >
                      <span className="relative block">
                        <Cover
                          src={al.album.cover}
                          from={al.album.accent}
                          to="#111"
                          alt={`${al.album.title} cover`}
                          className="aspect-square w-full rounded-md shadow-lg"
                        />
                        <span
                          aria-hidden
                          className="absolute bottom-1 right-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm"
                        >
                          {formatCount(al.plays)}×
                        </span>
                      </span>
                      <span className="mt-2 block truncate text-sm font-bold text-white group-hover:text-spotify">{al.album.title}</span>
                      <span className="block truncate text-xs text-subdued">
                        {al.album.year} • {al.album.artist.name}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}

function StatTile({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl bg-white/5 p-3.5 ring-1 ring-white/5 backdrop-blur-sm md:p-4">
      <span
        className="mb-2 flex h-7 w-7 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent}26`, color: accent }}
        aria-hidden
      >
        {icon}
      </span>
      <p className="truncate text-lg font-black tracking-tight text-white md:text-xl">{value}</p>
      <p className="truncate text-xs text-subdued">{label}</p>
    </div>
  );
}
