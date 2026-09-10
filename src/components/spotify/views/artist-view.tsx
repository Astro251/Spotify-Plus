'use client';

import { useState } from 'react';
import { Link2, MoreHorizontal, Radio, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { Shelf } from '@/components/spotify/ui-bits/shelf';
import { TrackRow } from '@/components/spotify/ui-bits/track-row';
import { playArtist, startRadio } from '@/components/spotify/ui-bits/play-helpers';
import { ArtistHeroSkeleton, RowSkeleton, ShuffleButton, AlbumCard, albumTypeLabel } from '@/components/spotify/views/view-bits';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useArtist } from '@/hooks/queries';
import { formatCount } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import { cn } from '@/lib/utils';

export function ArtistView({ id }: { id?: string }) {
  const { data: artist, isLoading, isError } = useArtist(id);
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  const shuffle = usePlayer((s) => s.shuffle);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const playTracks = usePlayer((s) => s.playTracks);
  const back = useNav((s) => s.back);

  const [followed, setFollowed] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  if (isLoading) {
    return (
      <div>
        <ArtistHeroSkeleton />
        <div className="mt-4" aria-hidden>
          <div className="flex items-center gap-5 py-4 md:py-6">
            <div className="h-14 w-14 animate-pulse rounded-full bg-highlight/70" />
            <div className="h-9 w-28 animate-pulse rounded-full bg-highlight/70" />
            <div className="h-9 w-24 animate-pulse rounded-full bg-highlight/70" />
          </div>
          <div className="h-7 w-28 animate-pulse rounded bg-highlight/70" />
          <div className="mt-2">
            {Array.from({ length: 5 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !artist) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold text-white">Artist not found</h1>
        <p className="mt-2 text-sm text-subdued">They may have been removed or are unavailable.</p>
        <Button
          variant="outline"
          onClick={back}
          className="mt-6 rounded-full border-white/30 text-white hover:bg-white/10 hover:text-white"
        >
          Go back
        </Button>
      </div>
    );
  }

  const ctxId = `artist:${artist.slug}`;
  const isCtx = context?.id === ctxId;

  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(`${window.location.origin}/artist/${artist.slug}`)
      .catch(() => undefined);
    toast.success('Link copied to clipboard');
  };

  return (
    <div>
      {/* full-bleed hero behind the top bar */}
      <div className="relative -mx-4 -mt-[68px] h-[340px] md:-mx-6 md:h-[400px]">
        <Cover src={artist.image} alt={artist.name} priority className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-base via-black/40 to-black/20" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-8">
          <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-lg md:text-6xl lg:text-7xl">
            {artist.name}
          </h1>
          <p className="mt-2 text-sm text-white/80">{formatCount(artist.monthlyListeners)} monthly listeners</p>
        </div>
      </div>

      {/* action row */}
      <div className="flex items-center gap-5 py-4 md:py-6">
        <PlayButton
          size="lg"
          playing={isPlaying && isCtx}
          onClick={() => {
            if (isCtx) togglePlay();
            else void playArtist(artist.slug);
          }}
          label={isCtx && isPlaying ? `Pause ${artist.name}` : `Play ${artist.name}`}
        />
        <ShuffleButton
          shuffle={shuffle}
          isContext={isCtx}
          onToggle={toggleShuffle}
          onPlay={() => void playArtist(artist.slug)}
        />
        <button
          type="button"
          aria-pressed={followed}
          onClick={() => {
            const next = !followed;
            setFollowed(next);
            if (next) toast.success(`Following ${artist.name}`);
            else toast(`Unfollowed ${artist.name}`);
          }}
          className={cn(
            'rounded-full border px-6 py-2 text-sm font-bold tracking-wide transition hover:scale-105',
            followed ? 'border-white bg-white text-black' : 'border-white/30 text-white hover:border-white'
          )}
        >
          {followed ? 'Following' : 'Follow'}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More options for ${artist.name}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center text-subdued transition hover:text-white"
            >
              <MoreHorizontal className="h-7 w-7" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px] border-white/10 bg-[#282828] text-white">
            {artist.topTracks[0] && (
              <DropdownMenuItem
                onClick={() =>
                  void startRadio(artist.topTracks[0]).then(
                    () => toast.success(`${artist.name} radio started`),
                    () => toast.error('Could not start the radio', { description: 'Try again in a moment.' })
                  )
                }
                className="gap-3 py-2.5"
              >
                <Radio className="h-4 w-4" /> Start radio
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={copyLink} className="gap-3 py-2.5">
              <Link2 className="h-4 w-4" /> Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-10 md:space-y-12">
        {/* popular tracks */}
        <section aria-label="Popular tracks">
          <h2 className="text-xl font-bold tracking-tight text-white md:text-2xl">Popular</h2>
          <div className="mt-2">
            {artist.topTracks.map((t, i) => (
              <TrackRow
                key={`${t.id}-${i}`}
                track={t}
                index={i + 1}
                variant="playlist"
                isActive={cur?.id === t.id && isCtx}
                isPlaying={isPlaying}
                onPlay={() => {
                  if (isCtx && cur?.id === t.id) togglePlay();
                  else playTracks(artist.topTracks, i, { id: ctxId, label: artist.name });
                }}
              />
            ))}
          </div>
        </section>

        {/* discography */}
        {artist.albums.length > 0 && (
          <Shelf title="Discography">
            {artist.albums.map((a) => (
              <AlbumCard key={a.id} album={a} subtitle={`${a.year} • ${albumTypeLabel(a.type)}`} />
            ))}
          </Shelf>
        )}

        {/* about */}
        {artist.bio && (
          <section aria-label={`About ${artist.name}`}>
            <div className="overflow-hidden rounded-xl bg-[#181818] shadow-lg ring-1 ring-white/5">
              <div className="relative h-36 w-full md:h-48">
                <Cover src={artist.image} alt={artist.name} className="absolute inset-0 h-full w-full [&>img]:object-[50%_20%]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/30 to-transparent" aria-hidden />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 md:p-6">
                  <h3 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">About</h3>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                    <Users className="h-3.5 w-3.5 text-spotify" aria-hidden />
                    {formatCount(artist.monthlyListeners)} monthly listeners
                  </span>
                </div>
              </div>
              <div className="p-4 md:p-6">
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-subdued">
                  Artist bio
                </p>
                <p className={cn('text-sm leading-relaxed text-white/85', !bioExpanded && 'line-clamp-4')}>
                  {artist.bio}
                </p>
                <button
                  type="button"
                  onClick={() => setBioExpanded((e) => !e)}
                  aria-expanded={bioExpanded}
                  className="mt-3 text-sm font-bold text-white/80 transition hover:text-white"
                >
                  {bioExpanded ? 'Show less' : 'Read more'}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
