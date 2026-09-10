'use client';

import { useState } from 'react';
import { Clock3, Heart, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { MediaCard } from '@/components/spotify/ui-bits/media-card';
import { playAlbum, playArtist, playPlaylist } from '@/components/spotify/ui-bits/play-helpers';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import { cn } from '@/lib/utils';
import type { AlbumDTO, ArtistDTO, PlaylistDTO, ShelfItem } from '@/lib/types';

/* --------------------------------- covers -------------------------------- */

/** The signature purple gradient + white heart cover (Liked Songs). */
export function LikedCover({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#5038a0] to-[#8d67df]',
        className
      )}
    >
      <Heart className={cn('h-8 w-8 fill-white text-white', iconClassName)} aria-hidden />
    </div>
  );
}

/* ------------------------- hero gradient overlay ------------------------- */

/**
 * Full-bleed ambient gradient behind a detail hero.
 * Bleeds horizontally past the shell's px-4/px-6 and up under the TopBar.
 */
export function HeroGradient({ from }: { from: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -inset-x-4 -top-[68px] z-0 h-[420px] md:-inset-x-6"
      style={{ background: `linear-gradient(180deg, ${from} 0%, rgba(18,18,18,0.6) 60%, transparent 100%)` }}
    />
  );
}

/* ---------------------------- entity cards ------------------------------- */

/** Human label for an album type — YouTube Music albums are often singles. */
export function albumTypeLabel(type: string): string {
  return type === 'ep' ? 'EP' : type === 'single' ? 'Single' : 'Album';
}

/** Album shelf card (used on home, search, discography, more-by). */
export function AlbumCard({ album, subtitle }: { album: AlbumDTO; subtitle?: string }) {
  const push = useNav((s) => s.push);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  return (
    <MediaCard
      cover={album.cover}
      title={album.title}
      subtitle={subtitle ?? `${album.artist.name} • ${albumTypeLabel(album.type)}`}
      playing={isPlaying && context?.id === `album:${album.slug}`}
      onClick={() => push({ type: 'album', id: album.slug, title: album.title })}
      onPlay={() => void playAlbum(album.slug)}
    />
  );
}

/** Playlist shelf card (gradient covers via from/to/icon). */
export function PlaylistCard({ playlist }: { playlist: PlaylistDTO }) {
  const push = useNav((s) => s.push);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  return (
    <MediaCard
      cover={playlist.cover}
      from={playlist.coverFrom}
      to={playlist.coverTo}
      icon={playlist.icon}
      mosaic={playlist.mosaic}
      title={playlist.name}
      subtitle={playlist.description ?? `By ${playlist.owner}`}
      playing={isPlaying && context?.id === `playlist:${playlist.slug}`}
      onClick={() => push({ type: 'playlist', id: playlist.slug, title: playlist.name })}
      onPlay={() => void playPlaylist(playlist.slug)}
    />
  );
}

/** Artist shelf card (circle portrait). */
export function ArtistCard({ artist }: { artist: ArtistDTO }) {
  const push = useNav((s) => s.push);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  return (
    <MediaCard
      circle
      cover={artist.image}
      title={artist.name}
      subtitle="Artist"
      playing={isPlaying && context?.id === `artist:${artist.slug}`}
      onClick={() => push({ type: 'artist', id: artist.slug, title: artist.name })}
      onPlay={() => void playArtist(artist.slug)}
    />
  );
}

/**
 * Discriminated shelf card for home feed items:
 * artist (has `image`), playlist (has `coverFrom`/`icon`), else album.
 */
export function ShelfItemCard({ item }: { item: ShelfItem }) {
  if ('image' in item) return <ArtistCard artist={item} />;
  if ('coverFrom' in item) return <PlaylistCard playlist={item} />;
  return <AlbumCard album={item} />;
}

/* ------------------------------ action bits ------------------------------ */

/** Shuffle toggle for detail action rows — starts playback when context is inactive. */
export function ShuffleButton({
  shuffle,
  isContext,
  onToggle,
  onPlay,
}: {
  shuffle: boolean;
  isContext: boolean;
  onToggle: () => void;
  onPlay: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
      aria-pressed={shuffle}
      onClick={() => {
        if (isContext) {
          onToggle();
        } else {
          if (!shuffle) onToggle();
          onPlay();
        }
      }}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center transition hover:scale-105 active:scale-95"
    >
      <Shuffle className={cn('h-7 w-7 transition-colors', shuffle ? 'text-spotify' : 'text-subdued hover:text-white')} />
      <span
        className={cn(
          'absolute -bottom-0.5 h-1 w-1 rounded-full bg-spotify transition-opacity',
          shuffle ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden
      />
    </button>
  );
}

/** Library heart-save toggle (local visual state + toast, no persistence). */
export function SaveButton({ name }: { name: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      type="button"
      aria-label={saved ? `Remove ${name} from Your Library` : `Save ${name} to Your Library`}
      aria-pressed={saved}
      onClick={() => {
        setSaved((s) => !s);
        toast(saved ? 'Removed from Your Library' : 'Saved to Your Library');
      }}
      className="flex h-10 w-10 shrink-0 items-center justify-center transition hover:scale-105 active:scale-95"
    >
      <Heart className={cn('h-7 w-7 transition-colors', saved ? 'fill-white text-white' : 'text-subdued hover:text-white')} />
    </button>
  );
}

/* ----------------------------- track list head --------------------------- */

/** Desktop-only column header above track lists (Spotify style). */
export function TrackListHeader({ variant }: { variant: 'playlist' | 'album' }) {
  return (
    <div
      className="relative z-10 mt-2 hidden grid-cols-[16px_4fr_2fr_minmax(80px,1fr)] gap-4 border-b border-white/5 px-4 pb-2 text-xs uppercase tracking-wider text-subdued md:grid"
      aria-hidden
    >
      <span className="tabular-nums">{variant === 'album' ? '#' : ''}</span>
      <span>Title</span>
      <span className="truncate">{variant === 'playlist' ? 'Album' : ''}</span>
      <Clock3 className="h-4 w-4 justify-self-end" />
    </div>
  );
}

/* -------------------------------- skeletons ------------------------------- */

export function QuickTileSkeleton() {
  return <div className="h-14 animate-pulse rounded-md bg-highlight/70 md:h-[72px]" aria-hidden />;
}

export function CardSkeleton() {
  return (
    <div className="w-[46vw] max-w-[220px] shrink-0 p-3 sm:w-auto sm:min-w-[168px] sm:max-w-none" aria-hidden>
      <div className="aspect-square w-full animate-pulse rounded-md bg-highlight/70" />
      <div className="mt-3 h-3.5 w-4/5 animate-pulse rounded bg-highlight/70" />
      <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-highlight/70" />
    </div>
  );
}

export function ShelfSkeleton() {
  return (
    <section className="space-y-2" aria-hidden>
      <div className="h-6 w-40 animate-pulse rounded bg-highlight/70" />
      <div className="flex overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2 md:px-4" aria-hidden>
      <div className="h-10 w-10 shrink-0 animate-pulse rounded bg-highlight/70" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-highlight/70" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-highlight/70" />
      </div>
      <div className="h-3 w-10 animate-pulse rounded bg-highlight/70" />
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div
      className="flex flex-col items-center gap-4 pt-6 text-center md:flex-row md:items-end md:gap-6 md:pt-12 md:text-left"
      aria-hidden
    >
      <div className="aspect-square w-40 animate-pulse rounded-md bg-highlight/70 shadow-2xl md:w-52 lg:w-56" />
      <div className="w-full max-w-xl space-y-3">
        <div className="mx-auto h-3 w-16 animate-pulse rounded bg-highlight/70 md:mx-0" />
        <div className="mx-auto h-8 w-3/4 animate-pulse rounded bg-highlight/70 md:mx-0 md:h-10" />
        <div className="mx-auto h-4 w-1/2 animate-pulse rounded bg-highlight/70 md:mx-0" />
      </div>
    </div>
  );
}

export function ArtistHeroSkeleton() {
  return <div className="-mx-4 -mt-[68px] h-[340px] animate-pulse bg-highlight/60 md:-mx-6 md:h-[400px]" aria-hidden />;
}
