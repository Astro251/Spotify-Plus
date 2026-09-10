'use client';

import { useMemo, useState } from 'react';
import { Clock3, MoreHorizontal, Trash2 } from 'lucide-react';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { TrackRow } from '@/components/spotify/ui-bits/track-row';
import { HeroGradient, HeroSkeleton, RowSkeleton } from '@/components/spotify/views/view-bits';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useClearHistory, useHistory, useRemoveHistoryEntry } from '@/hooks/queries';
import { formatRelativeTime, historyBucket, plural } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import type { HistoryEntryDTO } from '@/lib/types';

/** Newest-first listening history with Spotify-style time buckets. */
export function HistoryView() {
  const { data, isLoading, isError, refetch } = useHistory();
  const clear = useClearHistory();
  const removeEntry = useRemoveHistoryEntry();
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playTracks = usePlayer((s) => s.playTracks);
  const setTab = useNav((s) => s.setTab);

  const [clearOpen, setClearOpen] = useState(false);

  const entries = data?.entries ?? [];

  // group by time bucket — buckets keep first-appearance order (newest first)
  const groups = useMemo(() => {
    const out: { bucket: string; items: HistoryEntryDTO[] }[] = [];
    for (const entry of entries) {
      const bucket = historyBucket(entry.playedAt);
      const last = out[out.length - 1];
      if (last && last.bucket === bucket) last.items.push(entry);
      else out.push({ bucket, items: [entry] });
    }
    return out;
  }, [entries]);

  const isCtx = context?.id === 'history';
  const allTracks = entries.map((e) => e.track);

  if (isLoading) {
    return (
      <div className="relative pt-2">
        <HeroGradient from="#1f5f4f" />
        <div className="relative z-10">
          <HeroSkeleton />
        </div>
        <div className="relative z-10 mt-6">
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
        <h1 className="text-2xl font-bold text-white">Couldn&apos;t load your history</h1>
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

  return (
    <div className="relative pt-2">
      <HeroGradient from="#1f5f4f" />

      {/* hero */}
      <div className="relative z-10 flex flex-col items-center gap-4 pt-6 text-center md:flex-row md:items-end md:gap-6 md:pt-12 md:text-left">
        <div className="flex aspect-square w-40 items-center justify-center rounded-md bg-gradient-to-br from-[#1f5f4f] to-[#38b98c] shadow-2xl md:w-52 lg:w-56">
          <Clock3 className="h-16 w-16 text-white" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">History</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">Recently played</h1>
          {entries.length > 0 && (
            <p className="mt-3 text-sm text-white/80">You • {plural(entries.length, 'song')} played</p>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="relative z-10 flex flex-col items-center gap-4 py-16 text-center">
          <Clock3 className="h-12 w-12 text-subdued" aria-hidden />
          <h2 className="text-2xl font-bold tracking-tight text-white">Songs you play will show up here</h2>
          <p className="max-w-xs text-sm text-subdued">The last 100 tracks you listened to, newest first</p>
          <Button
            onClick={() => setTab('search')}
            className="h-auto rounded-full bg-white px-6 py-3 text-base font-bold text-black transition hover:scale-105 hover:bg-white"
          >
            Find something to play
          </Button>
        </div>
      ) : (
        <>
          {/* action row */}
          <div className="relative z-10 flex items-center gap-5 py-4 md:py-6">
            <PlayButton
              size="lg"
              playing={isPlaying && isCtx}
              onClick={() => {
                if (isCtx) togglePlay();
                else if (allTracks.length > 0) playTracks(allTracks, 0, { id: 'history', label: 'Recently played' });
              }}
              label={isCtx && isPlaying ? 'Pause Recently played' : 'Play Recently played'}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More options for Recently played"
                  className="flex h-10 w-10 shrink-0 items-center justify-center text-subdued transition hover:text-white"
                >
                  <MoreHorizontal className="h-7 w-7" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px] border-white/10 bg-[#282828] text-white">
                <DropdownMenuItem onSelect={() => setClearOpen(true)} className="gap-3 py-2.5 text-red-400 focus:text-red-400">
                  <Trash2 className="h-4 w-4" /> Clear history
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* time-bucketed rows */}
          <div className="relative z-10">
            {groups.map((group) => (
              <section key={group.bucket} aria-label={group.bucket} className="mb-4">
                <h2 className="sticky top-16 z-20 -mx-2 mb-1 bg-base/85 px-2 py-2 text-xs font-bold uppercase tracking-[0.14em] text-subdued backdrop-blur-sm md:-mx-4 md:px-4">
                  {group.bucket}
                </h2>
                {group.items.map((entry) => (
                  <TrackRow
                    key={entry.track.id}
                    track={entry.track}
                    index={0}
                    variant="playlist"
                    isActive={cur?.id === entry.track.id && isCtx}
                    isPlaying={isPlaying}
                    rightLabel={formatRelativeTime(entry.playedAt, true)}
                    onRemove={() => removeEntry.mutate(entry.track.id)}
                    removeLabel="Remove from history"
                    onPlay={() => {
                      if (isCtx && cur?.id === entry.track.id) togglePlay();
                      else playTracks(allTracks, allTracks.indexOf(entry.track), { id: 'history', label: 'Recently played' });
                    }}
                  />
                ))}
              </section>
            ))}
            {entries.length >= 100 && (
              <p className="px-2 py-6 text-center text-xs text-subdued md:px-4">
                Only the last 100 songs are kept
              </p>
            )}
          </div>
        </>
      )}

      {/* clear confirmation */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="border-white/10 bg-[#282828] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Clear listening history?</AlertDialogTitle>
            <AlertDialogDescription className="text-subdued">
              This removes all songs from your recently played history. Your playlists and Liked Songs stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clear.mutate()}
              className="rounded-full bg-white font-bold text-black hover:bg-white/90"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
