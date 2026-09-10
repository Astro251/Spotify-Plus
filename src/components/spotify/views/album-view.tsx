'use client';

import { Link2, ListPlus, MoreHorizontal, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { Shelf } from '@/components/spotify/ui-bits/shelf';
import { TrackRow } from '@/components/spotify/ui-bits/track-row';
import { playAlbum } from '@/components/spotify/ui-bits/play-helpers';
import {
  AlbumCard,
  HeroGradient,
  HeroSkeleton,
  RowSkeleton,
  SaveButton,
  ShuffleButton,
  TrackListHeader,
  albumTypeLabel,
} from '@/components/spotify/views/view-bits';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAlbum, useArtist } from '@/hooks/queries';
import { formatTotalDuration, plural } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';

export function AlbumView({ id }: { id?: string }) {
  const { data: album, isLoading, isError } = useAlbum(id);
  // "More by" comes from the artist's live discography
  const { data: artist } = useArtist(album?.artist.slug);
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  const shuffle = usePlayer((s) => s.shuffle);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const playTracks = usePlayer((s) => s.playTracks);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const push = useNav((s) => s.push);
  const back = useNav((s) => s.back);

  if (isLoading) {
    return (
      <div className="relative pt-2">
        <HeroGradient from="#333333" />
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

  if (isError || !album) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold text-white">Album not found</h1>
        <p className="mt-2 text-sm text-subdued">It may have been removed or is unavailable.</p>
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

  const ctxId = `album:${album.slug}`;
  const isCtx = context?.id === ctxId;
  const moreBy = (artist?.albums ?? []).filter((a) => a.id !== album.id);

  const goArtist = () => push({ type: 'artist', id: album.artist.slug, title: album.artist.name });
  const copyLink = () => {
    void navigator.clipboard
      ?.writeText(`${window.location.origin}/album/${album.slug}`)
      .catch(() => undefined);
    toast.success('Link copied to clipboard');
  };

  return (
    <div className="relative pt-2">
      <HeroGradient from={album.accent} />

      {/* hero */}
      <div className="relative z-10 flex flex-col items-center gap-4 pt-6 text-center md:flex-row md:items-end md:gap-6 md:pt-12 md:text-left">
        <Cover
          src={album.cover}
          from={album.accent}
          alt={`${album.title} cover`}
          priority
          className="aspect-square w-40 rounded-md shadow-2xl md:w-52 lg:w-56"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{albumTypeLabel(album.type)}</p>
          <h1 className="mt-2 line-clamp-2 break-words text-3xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">
            {album.title}
          </h1>
          <p className="mt-3 text-sm text-white/80">
            <button
              type="button"
              onClick={goArtist}
              className="font-medium text-white transition hover:underline"
            >
              {album.artist.name}
            </button>
            <span className="text-white/70">
              {' '}• {album.year} • {plural(album.trackCount, 'song')}, {formatTotalDuration(album.totalDuration)}
            </span>
          </p>
        </div>
      </div>

      {/* action row */}
      <div className="relative z-10 flex items-center gap-5 py-4 md:py-6">
        <PlayButton
          size="lg"
          playing={isPlaying && isCtx}
          onClick={() => {
            if (isCtx) togglePlay();
            else void playAlbum(album.slug);
          }}
          label={isCtx && isPlaying ? `Pause ${album.title}` : `Play ${album.title}`}
        />
        <ShuffleButton
          shuffle={shuffle}
          isContext={isCtx}
          onToggle={toggleShuffle}
          onPlay={() => void playAlbum(album.slug)}
        />
        <SaveButton name={album.title} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More options for ${album.title}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center text-subdued transition hover:text-white"
            >
              <MoreHorizontal className="h-7 w-7" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px] border-white/10 bg-[#282828] text-white">
            <DropdownMenuItem
              onClick={() => {
                album.tracks.forEach((t) => addToQueue(t));
                toast.success('Album added to queue');
              }}
              className="gap-3 py-2.5"
            >
              <ListPlus className="h-4 w-4" /> Add to queue
            </DropdownMenuItem>
            <DropdownMenuItem onClick={goArtist} className="gap-3 py-2.5">
              <UserIcon className="h-4 w-4" /> Go to artist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={copyLink} className="gap-3 py-2.5">
              <Link2 className="h-4 w-4" /> Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* track list (numbers, album variant) */}
      <TrackListHeader variant="album" />
      <div className="relative z-10">
        {album.tracks.map((t, i) => (
          <TrackRow
            key={`${t.id}-${i}`}
            track={t}
            index={t.number ?? i + 1}
            variant="album"
            isActive={cur?.id === t.id && isCtx}
            isPlaying={isPlaying}
            onPlay={() => {
              if (isCtx && cur?.id === t.id) togglePlay();
              else playTracks(album.tracks, i, { id: ctxId, label: album.title });
            }}
          />
        ))}
      </div>

      {/* more by this artist */}
      {moreBy.length > 0 && (
        <div className="relative z-10 mt-10 md:mt-12">
          <Shelf title={`More by ${album.artist.name}`}>
            {moreBy.map((a) => (
              <AlbumCard key={a.id} album={a} subtitle={`${a.year} • ${albumTypeLabel(a.type)}`} />
            ))}
          </Shelf>
        </div>
      )}
    </div>
  );
}
