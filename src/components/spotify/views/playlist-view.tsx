'use client';

import { useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2, GripVertical, ImageIcon } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { TrackRow } from '@/components/spotify/ui-bits/track-row';
import { playPlaylist } from '@/components/spotify/ui-bits/play-helpers';
import { CoverPickerDialog } from '@/components/spotify/ui-bits/cover-picker-dialog';
import {
  HeroGradient,
  HeroSkeleton,
  RowSkeleton,
  SaveButton,
  ShuffleButton,
  TrackListHeader,
} from '@/components/spotify/views/view-bits';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDeletePlaylist,
  usePlaylist,
  useReorderPlaylistTrack,
  useRemoveFromPlaylist,
  useRenamePlaylist,
} from '@/hooks/queries';
import { formatTotalDuration, plural } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { usePlayer } from '@/lib/store/player';
import type { TrackDTO } from '@/lib/types';

/** A playlist row wrapped for drag-reorder: grip handle + TrackRow. */
function ReorderableRow({
  track,
  index,
  isActive,
  isPlaying,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
}: {
  track: TrackDTO;
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (trackId: string) => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={track}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => onDragStart(track.id)}
      whileDrag={{ scale: 1.02, zIndex: 20, boxShadow: '0 12px 32px rgba(0,0,0,0.55)' }}
      className="group/row flex list-none items-center gap-1 rounded-md"
    >
      <button
        type="button"
        aria-label={`Drag to reorder ${track.title}`}
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
        className="flex h-12 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-subdued opacity-40 transition hover:text-white hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify active:cursor-grabbing md:w-7"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <TrackRow
        track={track}
        index={index}
        variant="playlist"
        isActive={isActive}
        isPlaying={isPlaying}
        onPlay={onPlay}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        className="min-w-0 flex-1"
      />
    </Reorder.Item>
  );
}

export function PlaylistView({ id }: { id?: string }) {
  const { data: playlist, isLoading, isError } = usePlaylist(id);
  const cur = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const context = usePlayer((s) => s.context);
  const shuffle = usePlayer((s) => s.shuffle);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const playTracks = usePlayer((s) => s.playTracks);
  const back = useNav((s) => s.back);
  const setTab = useNav((s) => s.setTab);

  const rename = useRenamePlaylist();
  const remove = useRemoveFromPlaylist();
  const deletePlaylist = useDeletePlaylist();
  const reorder = useReorderPlaylistTrack();

  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  /* local track order — optimistic drag/move updates, re-synced from server
     data during render (React's derive-from-props adjustment pattern) */
  const [orderState, setOrderState] = useState<{ server: TrackDTO[]; local: TrackDTO[] }>({
    server: [],
    local: [],
  });
  if (playlist && playlist.tracks !== orderState.server) {
    setOrderState({ server: playlist.tracks, local: playlist.tracks });
  }
  const order = orderState.local;
  const setOrder = (next: TrackDTO[]) => setOrderState({ server: orderState.server, local: next });
  const draggedRef = useRef<string | null>(null);

  const moveTrack = (trackId: string, to: number) => {
    const from = order.findIndex((t) => t.id === trackId);
    if (from === -1 || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [t] = next.splice(from, 1);
    next.splice(to, 0, t);
    setOrder(next);
    if (playlist) reorder.mutate({ playlistId: playlist.id, trackId, to });
  };

  const onDragReorder = (next: TrackDTO[]) => {
    setOrder(next);
    const tid = draggedRef.current;
    if (!tid || !playlist) return;
    const to = next.findIndex((t) => t.id === tid);
    if (to >= 0) reorder.mutate({ playlistId: playlist.id, trackId: tid, to });
  };

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

  if (isError || !playlist) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold text-white">Playlist not found</h1>
        <p className="mt-2 text-sm text-subdued">It may have been deleted or is unavailable.</p>
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

  const ctxId = `playlist:${playlist.slug}`;
  const isCtx = context?.id === ctxId;

  const saveRename = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === playlist.name && description.trim() === (playlist.description ?? '')) {
      setRenameOpen(false);
      return;
    }
    rename.mutate(
      { id: playlist.id, name: trimmed, description: description.trim() },
      { onSuccess: () => setRenameOpen(false) }
    );
  };

  const confirmDelete = () => {
    deletePlaylist.mutate(playlist.id);
    setDeleteOpen(false);
    back();
    setTab('library');
  };

  return (
    <div className="relative pt-2">
      <HeroGradient from={playlist.coverFrom ?? (playlist.mosaic ? '#3e3e3e' : '#333333')} />

      {/* hero */}
      <div className="relative z-10 flex flex-col items-center gap-4 pt-6 text-center md:flex-row md:items-end md:gap-6 md:pt-12 md:text-left">
        <div className="group/cover relative">
          <Cover
            src={playlist.cover}
            from={playlist.coverFrom}
            to={playlist.coverTo}
            icon={playlist.icon}
            mosaic={playlist.mosaic}
            alt={`${playlist.name} cover`}
            priority
            className="aspect-square w-40 rounded-md shadow-2xl md:w-52 lg:w-56"
            iconClassName="h-16 w-16"
          />
          {playlist.editable && (
            <button
              type="button"
              onClick={() => setCoverOpen(true)}
              aria-label={`Change cover for ${playlist.name}`}
              className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/60 opacity-0 backdrop-blur-[2px] transition group-hover/cover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify md:flex"
            >
              <span className="flex flex-col items-center gap-1.5 text-white">
                <ImageIcon className="h-6 w-6" />
                <span className="text-xs font-bold tracking-wide">Choose photo</span>
              </span>
            </button>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Playlist</p>
          <h1 className="mt-2 line-clamp-2 break-words text-3xl font-black tracking-tight text-white md:text-5xl lg:text-6xl">
            {playlist.name}
          </h1>
          {playlist.description && (
            <p className="mt-3 line-clamp-2 text-sm text-white/70 md:max-w-xl">{playlist.description}</p>
          )}
          <p className="mt-2 text-sm text-white/80">
            Playlist • {playlist.owner} • {plural(playlist.trackCount, 'song')}
            {playlist.totalDuration > 0 ? `, ${formatTotalDuration(playlist.totalDuration)}` : ''}
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
            else void playPlaylist(playlist.slug);
          }}
          label={isCtx && isPlaying ? `Pause ${playlist.name}` : `Play ${playlist.name}`}
        />
        <ShuffleButton
          shuffle={shuffle}
          isContext={isCtx}
          onToggle={toggleShuffle}
          onPlay={() => void playPlaylist(playlist.slug)}
        />

        {playlist.editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`More options for ${playlist.name}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-subdued transition hover:text-white"
              >
                <MoreHorizontal className="h-7 w-7" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px] border-white/10 bg-[#282828] text-white">
              <DropdownMenuItem
                onSelect={() => {
                  setName(playlist.name);
                  setDescription(playlist.description ?? '');
                  setRenameOpen(true);
                }}
                className="gap-3 py-2.5"
              >
                <Pencil className="h-4 w-4" /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCoverOpen(true)} className="gap-3 py-2.5">
                <ImageIcon className="h-4 w-4" /> Change cover
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="gap-3 py-2.5 text-red-400 focus:text-red-400">
                <Trash2 className="h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SaveButton name={playlist.name} />
        )}
      </div>

      {/* track list */}
      {playlist.tracks.length === 0 ? (
        <div className="relative z-10 flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white">Let&apos;s find something for your playlist</h2>
          {playlist.editable && (
            <Button
              onClick={() => setTab('search')}
              className="h-auto rounded-full bg-white px-6 py-3 text-base font-bold text-black transition hover:scale-105 hover:bg-white"
            >
              Search for songs
            </Button>
          )}
        </div>
      ) : playlist.editable ? (
        <>
          <TrackListHeader variant="playlist" />
          <p className="relative z-10 px-2 pb-1 text-xs text-subdued/80 md:px-4" aria-hidden>
            Drag <GripVertical className="inline h-3.5 w-3.5 -translate-y-px" /> rows or use the ⋯ menu to reorder songs
          </p>
          <Reorder.Group axis="y" values={order} onReorder={onDragReorder} className="relative z-10">
            {order.map((t, i) => (
              <ReorderableRow
                key={t.id}
                track={t}
                index={i + 1}
                isActive={cur?.id === t.id && isCtx}
                isPlaying={isPlaying}
                onPlay={() => {
                  if (isCtx && cur?.id === t.id) togglePlay();
                  else playTracks(order, i, { id: ctxId, label: playlist.name });
                }}
                onRemove={() => remove.mutate({ playlistId: playlist.id, track: t })}
                onMoveUp={() => moveTrack(t.id, i - 1)}
                onMoveDown={() => moveTrack(t.id, i + 1)}
                onDragStart={(tid) => (draggedRef.current = tid)}
              />
            ))}
          </Reorder.Group>
        </>
      ) : (
        <>
          <TrackListHeader variant="playlist" />
          <div className="relative z-10">
            {playlist.tracks.map((t, i) => (
              <TrackRow
                key={`${t.id}-${i}`}
                track={t}
                index={i + 1}
                variant="playlist"
                isActive={cur?.id === t.id && isCtx}
                isPlaying={isPlaying}
                onPlay={() => {
                  if (isCtx && cur?.id === t.id) togglePlay();
                  else playTracks(playlist.tracks, i, { id: ctxId, label: playlist.name });
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* edit details dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="border-white/10 bg-[#282828] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit details</DialogTitle>
            <DialogDescription className="text-subdued">Change the name or description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label htmlFor="rename-playlist-name" className="text-sm font-semibold text-white">
                Name
              </label>
              <Input
                id="rename-playlist-name"
                autoFocus
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                className="h-11 border-white/20 bg-highlight text-white placeholder:text-subdued/70"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rename-playlist-desc" className="text-sm font-semibold text-white">
                Description <span className="font-normal text-subdued">(optional)</span>
              </label>
              <Textarea
                id="rename-playlist-desc"
                value={description}
                maxLength={200}
                placeholder="Add an optional description"
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[72px] border-white/20 bg-highlight text-white placeholder:text-subdued/70"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRenameOpen(false)}
              className="rounded-full text-white hover:bg-white/10 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={saveRename}
              disabled={!name.trim() || rename.isPending}
              className="rounded-full bg-spotify px-8 font-bold text-black hover:bg-[#1fdf64] hover:text-black"
            >
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* change cover dialog */}
      <CoverPickerDialog playlist={playlist} open={coverOpen} onOpenChange={setCoverOpen} />

      {/* delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="border-white/10 bg-[#282828] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Delete playlist?</AlertDialogTitle>
            <AlertDialogDescription className="text-subdued">
              This will delete &ldquo;{playlist.name}&rdquo; from Your Library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-full bg-white font-bold text-black hover:bg-white/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
