'use client';

import { useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronDown,
  Heart,
  ListMusic,
  Moon,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  MonitorSmartphone,
  Timer,
  Album as AlbumIcon,
  User as UserIcon,
} from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { Slider } from '@/components/spotify/ui-bits/slider';
import { Marquee } from '@/components/spotify/ui-bits/marquee';
import { startRadio } from '@/components/spotify/ui-bits/play-helpers';
import { LyricsPanel } from '@/components/spotify/lyrics-panel';
import { useAddToPlaylist, usePlaylists } from '@/hooks/queries';
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
import { usePlayer } from '@/lib/store/player';
import { useUI } from '@/lib/store/ui';
import { useNav } from '@/lib/store/navigation';
import { useToggleLike } from '@/hooks/queries';
import { formatDuration } from '@/lib/format';
import { shareTrack } from '@/lib/share';
import { cn } from '@/lib/utils';

function IconControl({
  children,
  onClick,
  active,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'relative flex h-11 w-11 items-center justify-center text-white/70 transition hover:scale-110 hover:text-white active:scale-95',
        active && 'text-spotify hover:text-spotify',
        className
      )}
    >
      {children}
      {active && <span aria-hidden className="absolute -bottom-1 h-1 w-1 rounded-full bg-spotify" />}
    </button>
  );
}

/** Full-screen "now playing" view (opens from the mini player). */
export function NowPlaying() {
  const controls = useDragControls();
  const track = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const progress = usePlayer((s) => s.progress);
  const duration = usePlayer((s) => s.duration);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const context = usePlayer((s) => s.context);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seek = usePlayer((s) => s.seek);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);

  const setNowPlayingOpen = useUI((s) => s.setNowPlayingOpen);
  const setQueueOpen = useUI((s) => s.setQueueOpen);
  const lyricsOpen = useUI((s) => s.lyricsOpen);
  const setLyricsOpen = useUI((s) => s.setLyricsOpen);
  const addToPlaylist = useAddToPlaylist();
  const { data: playlists } = usePlaylists();
  const playablePlaylists = (playlists ?? []).filter((p) => p.editable || p.owner === 'You');
  const push = useNav((s) => s.push);
  const like = useToggleLike();
  const sleepTimer = usePlayer((s) => s.sleepTimer);
  const setSleepTimer = usePlayer((s) => s.setSleepTimer);

  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const displayProgress = scrubValue ?? progress;

  if (!track) return null;

  const close = () => {
    setNowPlayingOpen(false);
    setLyricsOpen(false);
  };
  const goArtist = () => {
    close();
    push({ type: 'artist', id: track.artist.slug, title: track.artist.name });
  };
  const goAlbum = () => {
    close();
    push({ type: 'album', id: track.album.slug, title: track.album.title });
  };
  const copyLink = () => {
    void shareTrack(track);
  };
  const sleepMinutesLeft =
    sleepTimer?.mode === 'minutes' ? Math.max(0, Math.ceil((sleepTimer.endsAt - Date.now()) / 60_000)) : null;
  const radioStarting = () => {
    void startRadio(track).then(
      () => toast.success('Radio started', { description: 'Playing similar tracks next.' }),
      () => toast.error('Could not start the radio', { description: 'Try again in a moment.' })
    );
  };

  const contextLabel = context?.id.startsWith('album:')
    ? 'FROM ALBUM'
    : context?.id.startsWith('playlist:')
      ? 'FROM PLAYLIST'
      : context?.id === 'liked'
        ? 'FROM LIKED SONGS'
        : context?.id.startsWith('radio:')
          ? 'FROM RADIO'
          : 'NOW PLAYING';

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.55 }}
      onDragEnd={(_e, info) => {
        if (info.offset.y > 110 || info.velocity.y > 500) close();
      }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${track.album.accentSoft} 0%, #121212 46%, #0b0b0b 100%)`,
      }}
      role="dialog"
      aria-label="Now playing"
    >
      {/* dark overlay to ensure readability */}
      <div className="pointer-events-none absolute inset-0 bg-black/35" />

      {/* top handle area (drag to dismiss) */}
      <div
        className="relative z-10 flex touch-pan-y items-center gap-2 px-2 pb-2 pt-4 md:pt-6"
        onPointerDown={(e) => controls.start(e)}
      >
        <button
          type="button"
          aria-label="Close now playing"
          onClick={close}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:scale-110"
        >
          <ChevronDown className="h-7 w-7" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">{contextLabel}</p>
          <p className="truncate text-sm font-semibold text-white">{context?.label ?? track.album.title}</p>
        </div>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More options"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition hover:scale-110"
            >
              <MoreHorizontal className="h-6 w-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[230px] border-white/10 bg-[#282828] text-white">
            {track.source !== 'local' && (
              <DropdownMenuItem onClick={radioStarting} className="gap-3 py-2.5">
                <Radio className="h-4 w-4" /> Start radio
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={goArtist} className="gap-3 py-2.5">
              <UserIcon className="h-4 w-4" /> Go to artist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={goAlbum} className="gap-3 py-2.5">
              <AlbumIcon className="h-4 w-4" /> Go to album
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
            <DropdownMenuItem onClick={copyLink} className="gap-3 py-2.5">
              <Share2 className="h-4 w-4" /> Share song
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-3 py-2.5">
                <Timer className="h-4 w-4" />
                {sleepTimer
                  ? sleepTimer.mode === 'eot'
                    ? 'Sleep timer · end of track'
                    : `Sleep timer · ${sleepMinutesLeft} min left`
                  : 'Sleep timer'}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[210px] border-white/10 bg-[#282828] text-white">
                {sleepTimer && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        setSleepTimer(null);
                        toast('Sleep timer off');
                      }}
                      className="gap-3 py-2.5"
                    >
                      <Moon className="h-4 w-4" /> Off
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-white/10" />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => {
                    setSleepTimer('end');
                    toast('Sleeping at the end of this track');
                  }}
                  className="py-2.5"
                >
                  End of track
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                {[5, 10, 15, 30, 45, 60].map((m) => (
                  <DropdownMenuItem
                    key={m}
                    onClick={() => {
                      setSleepTimer(m);
                      toast(`Sleeping in ${m} minutes`);
                    }}
                    className="py-2.5"
                  >
                    {m} minutes
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* artwork — or karaoke lyrics when the lyrics panel is open */}
      {lyricsOpen ? (
        <div className="relative z-10 min-h-0 flex-1">
          <LyricsPanel track={track} />
        </div>
      ) : (
        <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-2 md:px-16">
          {/* ambient backdrop: blurred cover bleeding behind the artwork */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-40 blur-[64px] saturate-150"
            style={{
              background: `radial-gradient(60% 50% at 50% 30%, ${track.album.accentSoft} 0%, transparent 70%)`,
            }}
          />
          <motion.div
            animate={{ scale: isPlaying ? 1 : 0.9 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative w-full max-w-[min(75vw,60vh)]"
          >
            <Cover
              src={track.album.cover}
              from={track.album.accent}
              to="#111"
              alt={`${track.album.title} cover`}
              priority
              className="aspect-square w-full rounded-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.85)]"
              iconClassName="h-24 w-24"
            />
          </motion.div>
        </div>
      )}

      {/* title + actions */}
      <div className="relative z-10 flex items-start justify-between gap-3 px-6 md:px-16">
        <div className="min-w-0 flex-1">
          <Marquee
            text={track.title}
            className="text-2xl font-extrabold tracking-tight text-white"
          />
          <button
            type="button"
            onClick={goArtist}
            className="mt-0.5 block max-w-full truncate text-left text-lg text-white/70 transition hover:text-white hover:underline"
          >
            {track.artist.name}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-1">
          <button
            type="button"
            aria-label="Share"
            onClick={copyLink}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition hover:text-white"
          >
            <Share2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={track.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
            onClick={() => like.mutate(track)}
            className="flex h-11 w-11 items-center justify-center rounded-full transition hover:scale-110"
          >
            <Heart className={cn('h-6 w-6', track.liked ? 'fill-spotify text-spotify' : 'text-white/80')} />
          </button>
        </div>
      </div>

      {/* seek */}
      <div className="relative z-10 mt-4 px-6 md:px-16">
        <Slider
          ariaLabel="Seek"
          value={displayProgress}
          max={duration || 1}
          onChange={(v) => setScrubValue(v)}
          onCommit={(v) => {
            setScrubValue(null);
            seek(v);
          }}
        />
        <div className="flex justify-between text-[11px] tabular-nums text-white/60">
          <span>{formatDuration(displayProgress)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      {/* controls */}
      <div className="relative z-10 mt-3 flex items-center justify-between px-6 pb-4 md:px-16 md:pb-6">
        <IconControl label="Shuffle" onClick={toggleShuffle} active={shuffle}>
          <Shuffle className="h-6 w-6" />
        </IconControl>
        <IconControl label="Previous" onClick={() => prev()}>
          <SkipBack className="h-9 w-9 fill-current" />
        </IconControl>
        <button
          type="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlay}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white text-black shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition hover:scale-105 active:scale-95"
        >
          {isPlaying ? <Pause className="h-8 w-8 fill-current" /> : <Play className="h-8 w-8 translate-x-[2px] fill-current" />}
        </button>
        <IconControl label="Next" onClick={() => next()}>
          <SkipForward className="h-9 w-9 fill-current" />
        </IconControl>
        <IconControl label={`Repeat: ${repeat}`} onClick={cycleRepeat} active={repeat !== 'off'}>
          {repeat === 'one' ? <Repeat1 className="h-6 w-6" /> : <Repeat className="h-6 w-6" />}
        </IconControl>
      </div>

      {/* bottom actions */}
      <div className="relative z-10 flex items-center justify-between px-6 pb-safe md:px-16 md:pb-6">
        <button
          type="button"
          aria-label="Connect to a device"
          onClick={() => toast('No devices found nearby', { description: 'This is a demo build' })}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 transition hover:text-white"
        >
          <MonitorSmartphone className="h-5 w-5" />
        </button>
        {sleepTimer ? (
          <button
            type="button"
            onClick={() => {
              setSleepTimer(null);
              toast('Sleep timer off');
            }}
            className="flex items-center gap-2 rounded-full border border-white/20 px-4 py-1.5 text-xs font-bold text-white/80 transition hover:border-white hover:text-white"
            aria-label={
              sleepTimer.mode === 'eot'
                ? 'Sleep timer: end of track. Tap to turn off.'
                : `Sleep timer: ${sleepMinutesLeft} minutes left. Tap to turn off.`
            }
          >
            <Moon className="h-4 w-4" />
            {sleepTimer.mode === 'eot' ? 'End of track' : `${sleepMinutesLeft} min`}
          </button>
        ) : (
          <button
            type="button"
            aria-pressed={lyricsOpen}
            onClick={() => setLyricsOpen(!lyricsOpen)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold transition',
              lyricsOpen
                ? 'border-white bg-white text-black hover:bg-white/85'
                : 'border-white/20 text-white/80 hover:border-white hover:text-white'
            )}
          >
            <Sparkles className="h-4 w-4" /> Lyrics
          </button>
        )}
        <button
          type="button"
          aria-label="Open queue"
          onClick={() => setQueueOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/60 transition hover:text-white"
        >
          <ListMusic className="h-5 w-5" />
        </button>
      </div>
    </motion.div>
  );
}
