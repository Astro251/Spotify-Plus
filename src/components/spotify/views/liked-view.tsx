'use client';

import { Heart } from 'lucide-react';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { TrackRow } from '@/components/spotify/ui-bits/track-row';
import { playLiked } from '@/components/spotify/ui-bits/play-helpers';
import {
  HeroGradient,
  HeroSkeleton,
  RowSkeleton,
  ShuffleButton,
  TrackListHeader,
} from '@/components/spotify/views/view-bits';
import { Button } from '@/components/ui/button';
import { useLikedTracks } from '@/hooks/queries';
import { formatTotalDuration, plural } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';

export function LikedView() {
  const { data: tracks, isLoading, isError } = useLikedTracks();
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  const shuffle = usePlayer((s) => s.shuffle);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const playTracks = usePlayer((s) => s.playTracks);
  const setTab = useNav((s) => s.setTab);

  const isCtx = context?.id === 'liked';
  const list = tracks ?? [];
  const total = list.reduce((sum, t) => sum + t.duration, 0);

  if (isLoading) {
    return (
      <div className="relative pt-2">
        <HeroGradient from="#5038a0" />
        <div className="relative z-10">
          <HeroSkeleton />
        </div>
        <div className="relative z-10 mt-6">
          {Array.from({ length: 5 }, (_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold text-white">Couldn&apos;t load Liked Songs</h1>
        <p className="mt-2 text-sm text-subdued">Something went wrong. Try again in a moment.</p>
      </div>
    );
  }

  return (
    <div className="relative pt-2">
      <HeroGradient from="#5038a0" />

      {/* hero */}
      <div className="relative z-10 flex flex-col items-center gap-4 pt-6 text-center md:flex-row md:items-end md:gap-6 md:pt-12 md:text-left">
        <div className="flex aspect-square w-40 items-center justify-center rounded-md bg-gradient-to-br from-[#5038a0] to-[#8d67df] shadow-2xl md:w-52 lg:w-56">
          <Heart className="h-16 w-16 fill-white text-white" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Playlist</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">Liked Songs</h1>
          {list.length > 0 && (
            <p className="mt-3 text-sm text-white/80">
              You • {plural(list.length, 'song')}, {formatTotalDuration(total)}
            </p>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="relative z-10 flex flex-col items-center gap-4 py-16 text-center">
          <Heart className="h-12 w-12 text-subdued" aria-hidden />
          <h2 className="text-2xl font-bold tracking-tight text-white">Songs you like will appear here</h2>
          <p className="max-w-xs text-sm text-subdued">Save songs by tapping the heart button</p>
          <Button
            onClick={() => setTab('search')}
            className="h-auto rounded-full bg-white px-6 py-3 text-base font-bold text-black transition hover:scale-105 hover:bg-white"
          >
            Find songs
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
                else void playLiked();
              }}
              label={isCtx && isPlaying ? 'Pause Liked Songs' : 'Play Liked Songs'}
            />
            <ShuffleButton
              shuffle={shuffle}
              isContext={isCtx}
              onToggle={toggleShuffle}
              onPlay={() => void playLiked()}
            />
          </div>

          {/* track list */}
          <TrackListHeader variant="playlist" />
          <div className="relative z-10">
            {list.map((t, i) => (
              <TrackRow
                key={t.id}
                track={t}
                index={i + 1}
                variant="playlist"
                isActive={cur?.id === t.id && isCtx}
                isPlaying={isPlaying}
                onPlay={() => {
                  if (isCtx && cur?.id === t.id) togglePlay();
                  else playTracks(list, i, { id: 'liked', label: 'Liked Songs' });
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
