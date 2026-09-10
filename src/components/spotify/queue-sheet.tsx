'use client';

import { useState } from 'react';
import { Infinity as InfinityIcon, ListStart, ListX, MoreHorizontal, Music2, Plus, Radio, X, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { EqualizerBars } from '@/components/spotify/ui-bits/equalizer-bars';
import { CreatePlaylistDialog } from '@/components/spotify/ui-bits/create-playlist-dialog';
import { startRadio } from '@/components/spotify/ui-bits/play-helpers';
import { useAddToPlaylist, usePlaylists } from '@/hooks/queries';
import { usePlayer } from '@/lib/store/player';
import { useUI } from '@/lib/store/ui';
import { useIsMobile } from '@/hooks/use-mobile';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TrackDTO } from '@/lib/types';
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

/** A draggable up-next row: drag handle reorders, tap plays, X removes. */
function UpNextRow({
  track,
  queueIndex,
  listIndex,
  listLength,
  onPlay,
  onRemove,
  onMove,
}: {
  track: TrackDTO;
  queueIndex: number;
  /** 0-based position within the visible "Next up" list */
  listIndex: number;
  listLength: number;
  onPlay: () => void;
  onRemove: () => void;
  /** move by -1 (up) or +1 (down) within Next up */
  onMove: (delta: -1 | 1) => void;
}) {
  const controls = useDragControls();
  const playNextInQueue = usePlayer((s) => s.playNextInQueue);
  const addToPlaylist = useAddToPlaylist();
  const { data: playlists } = usePlaylists();
  const playablePlaylists = (playlists ?? []).filter((p) => p.editable || p.owner === 'You');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Reorder.Item
      value={queueIndex}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.03, zIndex: 20, boxShadow: '0 12px 32px rgba(0,0,0,0.5)' }}
      className="group list-none"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onPlay}
        onKeyDown={(e) => e.key === 'Enter' && onPlay()}
        className="flex cursor-pointer items-center gap-1 rounded-md pr-2 transition-colors hover:bg-white/10"
      >
        <button
          type="button"
          aria-label={`Drag to reorder ${track.title}`}
          onPointerDown={(e) => {
            e.preventDefault();
            controls.start(e);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex h-10 w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-subdued opacity-40 transition hover:text-white hover:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Cover src={track.album.cover} from={track.album.accent} to="#111" alt={`${track.album.title} cover`} className="h-10 w-10 rounded" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{track.title}</p>
          <p className="truncate text-xs text-subdued">{track.artist.name}</p>
        </div>
        <span className="text-xs tabular-nums text-subdued">{formatDuration(track.duration)}</span>
        <button
          type="button"
          aria-label={`Remove ${track.title} from queue`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-full text-subdued transition hover:text-white md:opacity-0 md:group-hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`More options for ${track.title}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-subdued transition hover:text-white',
                !menuOpen && 'md:opacity-0 md:group-hover:opacity-100'
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
            className="min-w-[230px] border-white/10 bg-[#282828] text-white"
          >
            <DropdownMenuItem
              onClick={() => {
                playNextInQueue(queueIndex);
                toast('Playing next', { description: track.title });
              }}
              className="gap-3 py-2.5"
            >
              <ListStart className="h-4 w-4" /> Play next
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={listIndex === 0}
              onClick={() => onMove(-1)}
              className="gap-3 py-2.5"
            >
              <ArrowUp className="h-4 w-4" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={listIndex === listLength - 1}
              onClick={() => onMove(1)}
              className="gap-3 py-2.5"
            >
              <ArrowDown className="h-4 w-4" /> Move down
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
            {track.source !== 'local' && (
              <DropdownMenuItem onClick={() => void startRadio(track)} className="gap-3 py-2.5">
                <Radio className="h-4 w-4" /> Start radio
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem onClick={onRemove} className="gap-3 py-2.5 text-red-400 focus:text-red-400">
              <X className="h-4 w-4" /> Remove from queue
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Reorder.Item>
  );
}

/** Queue sheet: bottom sheet on mobile, right panel on desktop. */
export function QueueSheet() {
  const queueOpen = useUI((s) => s.queueOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const isMobile = useIsMobile();

  const queue = usePlayer((s) => s.queue);
  const order = usePlayer((s) => s.order);
  const pos = usePlayer((s) => s.pos);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playQueueIndex = usePlayer((s) => s.playQueueIndex);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const reorderUpNext = usePlayer((s) => s.reorderUpNext);
  const clearUpNext = usePlayer((s) => s.clearUpNext);
  const autoplay = usePlayer((s) => s.autoplay);
  const toggleAutoplay = usePlayer((s) => s.toggleAutoplay);

  const current = queue[order[pos]] ?? null;
  const upNext = order.slice(pos + 1).map((qi) => ({ track: queue[qi], queueIndex: qi })).filter((x) => x.track);

  return (
    <Sheet open={queueOpen} onOpenChange={setQueueOpen}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        aria-describedby={undefined}
        className="flex h-[85vh] flex-col gap-0 border-white/10 bg-[#181818] p-0 text-white md:h-full md:w-[380px]"
      >
        <SheetHeader className="border-b border-white/5 px-6 pb-4 pt-6">
          <SheetTitle className="text-left text-xl font-bold text-white">Queue</SheetTitle>
          {current && upNext.length > 0 && (
            <p className="text-left text-xs text-subdued">
              {upNext.length} {upNext.length === 1 ? 'song' : 'songs'} next
              {autoplay ? ' · autoplay continues after' : ''}
            </p>
          )}
        </SheetHeader>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {current ? (
            <>
              <p className="px-4 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-subdued">Now playing</p>
              <div className="flex items-center gap-3 rounded-md bg-white/5 px-4 py-2">
                <Cover src={current.album.cover} from={current.album.accent} to="#111" alt={`${current.album.title} cover`} className="h-10 w-10 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-spotify">{current.title}</p>
                  <p className="truncate text-xs text-subdued">{current.artist.name}</p>
                </div>
                <EqualizerBars playing={isPlaying} className="h-4 w-5" />
              </div>
            </>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-subdued">Queue is empty. Play something!</p>
          )}

          {upNext.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 pb-2 pt-5">
                <p className="text-xs font-bold uppercase tracking-wider text-subdued">
                  Next up {upNext.length > 0 && <span className="normal-case">({upNext.length})</span>}
                </p>
                <button
                  type="button"
                  onClick={clearUpNext}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-subdued transition hover:text-white"
                >
                  <ListX className="h-4 w-4" /> Clear
                </button>
              </div>
              <Reorder.Group
                axis="y"
                values={upNext.map((x) => x.queueIndex)}
                onReorder={(newValues) => reorderUpNext(newValues as number[])}
                className="space-y-0.5"
              >
                {upNext.map(({ track, queueIndex }, i) => (
                  <UpNextRow
                    key={queueIndex}
                    track={track}
                    queueIndex={queueIndex}
                    listIndex={i}
                    listLength={upNext.length}
                    onPlay={() => playQueueIndex(queueIndex)}
                    onRemove={() => removeFromQueue(queueIndex)}
                    onMove={(delta) => {
                      const j = i + delta;
                      if (j < 0 || j >= upNext.length) return;
                      const tail = upNext.map((x) => x.queueIndex);
                      [tail[i], tail[j]] = [tail[j], tail[i]];
                      reorderUpNext(tail);
                    }}
                  />
                ))}
              </Reorder.Group>
            </>
          )}
        </div>

        {/* endless autoplay toggle (Spotify-style) */}
        <div className="border-t border-white/5 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-white">
                <InfinityIcon className="h-4 w-4 text-spotify" aria-hidden /> Autoplay
              </p>
              <p className="mt-0.5 text-xs text-subdued">Keep playing similar tracks when the queue ends</p>
            </div>
            <Switch
              checked={autoplay}
              onCheckedChange={toggleAutoplay}
              aria-label="Toggle autoplay"
              className="data-[state=checked]:bg-spotify"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
