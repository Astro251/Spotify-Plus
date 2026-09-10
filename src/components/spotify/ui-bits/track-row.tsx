'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Heart,
  ListPlus,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  ArrowUp,
  ArrowDown,
  Album as AlbumIcon,
  User as UserIcon,
  Link2,
  Trash2,
} from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { EqualizerBars } from '@/components/spotify/ui-bits/equalizer-bars';
import { CreatePlaylistDialog } from '@/components/spotify/ui-bits/create-playlist-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAddToPlaylist, usePlaylists, useToggleLike } from '@/hooks/queries';
import { usePlayer } from '@/lib/store/player';
import { useNav } from '@/lib/store/navigation';
import { startRadio } from '@/components/spotify/ui-bits/play-helpers';
import { formatCount, formatDuration } from '@/lib/format';
import { shareTrack } from '@/lib/share';
import type { TrackDTO } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TrackRowProps {
  track: TrackDTO;
  index: number;
  /** which list layout to use */
  variant?: 'playlist' | 'album';
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  /** set inside editable playlists — shows "Remove from this playlist" */
  onRemove?: () => void;
  /** label for the onRemove menu item (defaults to "Remove from this playlist") */
  removeLabel?: string;
  /** overrides the right-side duration cell (e.g. "2 hours ago" in history) */
  rightLabel?: string;
  /** set inside editable playlists — adds "Move up"/"Move down" menu items */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  className?: string;
}

export function TrackRow({
  track,
  index,
  variant = 'playlist',
  isActive,
  isPlaying,
  onPlay,
  onRemove,
  removeLabel = 'Remove from this playlist',
  rightLabel,
  onMoveUp,
  onMoveDown,
  className,
}: TrackRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const push = useNav((s) => s.push);
  const like = useToggleLike();
  const addToPlaylist = useAddToPlaylist();
  const { data: playlists } = usePlaylists();

  const showCover = variant === 'playlist';
  const playablePlaylists = (playlists ?? []).filter((p) => p.editable || p.owner === 'You');

  const goAlbum = () => push({ type: 'album', id: track.album.slug, title: track.album.title });
  const goArtist = () => push({ type: 'artist', id: track.artist.slug, title: track.artist.name });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPlay}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPlay();
        }
      }}
      className={cn(
        'group grid h-14 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 md:px-4',
        isActive && 'bg-white/5',
        className
      )}
    >
      {/* left slot: number (album) or cover (playlist) */}
      {showCover ? (
        <div className="relative h-10 w-10 shrink-0">
          <Cover
            src={track.album.cover}
            from={track.album.accent}
            to="#111"
            alt={`${track.album.title} cover`}
            className="h-10 w-10 rounded"
          />
          <div
            className={cn(
              'absolute inset-0 hidden items-center justify-center rounded bg-black/60 text-white group-hover:flex',
              isActive && 'flex'
            )}
          >
            {isActive && isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </div>
        </div>
      ) : (
        <div className="relative hidden w-8 shrink-0 items-center justify-center sm:flex">
          {isActive ? (
            <EqualizerBars playing={isPlaying} className="h-4 w-4" />
          ) : (
            <>
              <span className="text-sm tabular-nums text-subdued group-hover:hidden">{index}</span>
              <Play className="hidden h-4 w-4 fill-current text-white group-hover:block" />
            </>
          )}
        </div>
      )}

      {/* title / artist */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('min-w-0 truncate text-[0.95rem] font-medium', isActive ? 'text-spotify' : 'text-white')}>
          {track.title}
        </span>
        <div className="flex min-w-0 items-center gap-1 text-sm text-subdued">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goArtist();
            }}
            className="truncate text-left transition hover:text-white hover:underline"
          >
            {track.artist.name}
          </button>
          {variant === 'playlist' && (
            <>
              <span aria-hidden className="hidden sm:inline">•</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goAlbum();
                }}
                className="hidden truncate text-left transition hover:text-white hover:underline sm:inline"
              >
                {track.album.title}
              </button>
            </>
          )}
        </div>
        {/* mobile number for album variant */}
        {!showCover && (
          <span className="text-xs tabular-nums text-subdued sm:hidden">
            {isActive ? <EqualizerBars playing={isPlaying} className="h-3 w-4" /> : <span>{index}</span>}
          </span>
        )}
      </div>

      {/* right: heart / duration / kebab */}
      <div className="flex shrink-0 items-center gap-1 md:gap-2">
        <button
          type="button"
          aria-label={track.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
          onClick={(e) => {
            e.stopPropagation();
            like.mutate(track);
          }}
          className={cn(
            'hidden h-8 w-8 items-center justify-center sm:flex',
            track.liked ? 'sm:opacity-100' : 'sm:opacity-0 sm:group-hover:opacity-100'
          )}
        >
          <Heart className={cn('h-4 w-4 transition', track.liked ? 'fill-spotify text-spotify' : 'text-subdued hover:text-white')} />
        </button>
        {/* Spotify artist pages show play counts when no duration is known;
            history rows show "when" instead (rightLabel) */}
        <span
          className={cn(
            'text-right tabular-nums text-subdued',
            rightLabel ? 'w-[84px] text-xs md:w-[96px]' : 'w-10 text-sm md:w-14'
          )}
          aria-label={rightLabel ?? (track.duration > 0 ? undefined : track.plays > 0 ? `${formatCount(track.plays)} plays` : undefined)}
        >
          {rightLabel
            ?? (track.duration > 0 ? formatDuration(track.duration) : track.plays > 0 ? formatCount(track.plays) : '–:–')}
        </span>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More options for ${track.title}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-subdued transition hover:text-white',
                !menuOpen && 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[230px] border-white/10 bg-[#282828] text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem onClick={() => { addToQueue(track); toast.success('Added to queue'); }} className="gap-3 py-2.5">
              <ListPlus className="h-4 w-4" /> Add to queue
            </DropdownMenuItem>
            {track.source !== 'local' && (
              <DropdownMenuItem onClick={() => { void startRadio(track); }} className="gap-3 py-2.5">
                <Radio className="h-4 w-4" /> Start radio
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={goArtist} className="gap-3 py-2.5">
              <UserIcon className="h-4 w-4" /> Go to artist
            </DropdownMenuItem>
            {variant === 'playlist' && (
              <DropdownMenuItem onClick={goAlbum} className="gap-3 py-2.5">
                <AlbumIcon className="h-4 w-4" /> Go to album
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => like.mutate(track)}
              className={cn('gap-3 py-2.5', track.liked && 'text-spotify focus:text-spotify')}
            >
              <Heart className={cn('h-4 w-4', track.liked && 'fill-spotify')} />
              {track.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-3 py-2.5">
                <Plus className="h-4 w-4" /> Add to playlist
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto border-white/10 bg-[#282828] text-white">
                <CreatePlaylistDialog
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-3 py-2.5">
                      <Music2 className="h-4 w-4" /> New playlist
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuSeparator className="bg-white/10" />
                {playablePlaylists.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    className="gap-3 py-2.5"
                    onSelect={(e) => {
                      e.preventDefault();
                      addToPlaylist.mutate({ playlistId: p.id, playlistName: p.name, track });
                    }}
                  >
                    <span className="truncate">{p.name}</span>
                  </DropdownMenuItem>
                ))}
                {playablePlaylists.length === 0 && (
                  <p className="px-2 py-2 text-xs text-subdued">No editable playlists yet</p>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onClick={() => {
                void shareTrack(track);
              }}
              className="gap-3 py-2.5"
            >
              <Link2 className="h-4 w-4" /> Share song
            </DropdownMenuItem>
            {(onMoveUp || onMoveDown) && (
              <>
                <DropdownMenuSeparator className="bg-white/10" />
                {onMoveUp && (
                  <DropdownMenuItem onClick={onMoveUp} className="gap-3 py-2.5">
                    <ArrowUp className="h-4 w-4" /> Move up
                  </DropdownMenuItem>
                )}
                {onMoveDown && (
                  <DropdownMenuItem onClick={onMoveDown} className="gap-3 py-2.5">
                    <ArrowDown className="h-4 w-4" /> Move down
                  </DropdownMenuItem>
                )}
              </>
            )}
            {onRemove && (
              <>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={onRemove} className="gap-3 py-2.5 text-red-400 focus:text-red-400">
                  <Trash2 className="h-4 w-4" /> {removeLabel}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
