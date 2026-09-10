'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Heart,
  Infinity as InfinityIcon,
  ListMusic,
  MonitorSpeaker,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { Slider } from '@/components/spotify/ui-bits/slider';
import { Marquee } from '@/components/spotify/ui-bits/marquee';
import { usePlayer } from '@/lib/store/player';
import { useUI } from '@/lib/store/ui';
import { useNav } from '@/lib/store/navigation';
import { useToggleLike } from '@/hooks/queries';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

function ControlButton({
  children,
  onClick,
  active,
  label,
  className,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center text-subdued transition hover:scale-110 hover:text-white active:scale-95 disabled:cursor-default disabled:opacity-40',
        active && 'text-spotify hover:text-spotify',
        className
      )}
    >
      {children}
      {active && <span aria-hidden className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-spotify" />}
    </button>
  );
}

/** Responsive player: compact mini-player (mobile) + full bar (desktop). */
export function PlayerBar() {
  const track = usePlayer((s) => s.queue[s.order[s.pos]] ?? null);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const progress = usePlayer((s) => s.progress);
  const duration = usePlayer((s) => s.duration);
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const seek = usePlayer((s) => s.seek);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);

  const setNowPlayingOpen = useUI((s) => s.setNowPlayingOpen);
  const toggleQueue = useUI((s) => s.toggleQueue);
  const push = useNav((s) => s.push);
  const like = useToggleLike();
  const context = usePlayer((s) => s.context);

  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const [volScrub, setVolScrub] = useState<number | null>(null);

  const displayProgress = scrubValue ?? progress;
  const displayVolume = volScrub ?? volume;
  const pct = duration > 0 ? Math.min(100, (displayProgress / duration) * 100) : 0;
  const VolumeIcon = muted || displayVolume === 0 ? VolumeX : displayVolume < 0.5 ? Volume1 : Volume2;
  const isRadio = context?.id.startsWith('radio:');

  /* ------------------------- mobile mini player ------------------------- */
  return (
    <>
      <div className="relative z-20 shrink-0 px-2 pb-1 pt-0 md:hidden">
        {track ? (
          <div
            className="relative overflow-hidden rounded-lg bg-elevated shadow-[0_-4px_16px_rgba(0,0,0,0.4)] ring-1 ring-white/5"
            style={{ background: `linear-gradient(105deg, ${track.album.accentSoft} 0%, #181818 45%, #181818 100%)` }}
          >
            {/* progress hairline */}
            <div className="absolute left-0 top-0 h-[3px] w-full bg-white/10">
              <div className="h-full bg-white transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center gap-3 p-2 pr-1.5">
              <button
                type="button"
                onClick={() => setNowPlayingOpen(true)}
                aria-label="Open now playing"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Cover
                  src={track.album.cover}
                  from={track.album.accent}
                  to="#111"
                  alt={`${track.album.title} cover`}
                  className="h-11 w-11 rounded-md shadow-md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className={cn('truncate text-sm font-semibold', 'text-white')}>{track.title}</p>
                    {isRadio && (
                      <span
                        title="Autoplaying from radio"
                        className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/15 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-white/80"
                      >
                        <InfinityIcon className="h-2.5 w-2.5" aria-hidden /> Radio
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-subdued">{track.artist.name}</p>
                </div>
              </button>
              <button
                type="button"
                aria-label={track.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                onClick={() => like.mutate(track)}
                className="flex h-10 w-10 items-center justify-center"
              >
                <Heart className={cn('h-[22px] w-[22px] transition', track.liked ? 'fill-spotify text-spotify' : 'text-white/70')} />
              </button>
              <button
                type="button"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={togglePlay}
                className="flex h-10 w-10 items-center justify-center text-white"
              >
                {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}
              </button>
              <button
                type="button"
                aria-label="Next"
                onClick={() => next()}
                className="flex h-10 w-10 items-center justify-center text-white/90"
              >
                <SkipForward className="h-[22px] w-[22px] fill-current" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-14 items-center rounded-lg bg-elevated px-4 ring-1 ring-white/5">
            <p className="text-sm text-subdued">Pick a song to start listening</p>
          </div>
        )}
      </div>

      {/* ------------------------- desktop player bar ------------------------- */}
      <div className="hidden h-[88px] shrink-0 grid-cols-[minmax(180px,1fr)_minmax(0,600px)_minmax(180px,1fr)] items-center gap-4 border-t border-white/5 bg-black px-4 md:grid">
        {/* left: track info */}
        <div className="flex min-w-0 items-center gap-3">
          {track ? (
            <>
              <button type="button" onClick={() => setNowPlayingOpen(true)} aria-label="Open now playing" className="shrink-0">
                <Cover
                  src={track.album.cover}
                  from={track.album.accent}
                  to="#111"
                  alt={`${track.album.title} cover`}
                  className="h-14 w-14 rounded-md shadow-lg transition hover:scale-105"
                />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => push({ type: 'album', id: track.album.slug, title: track.album.title })}
                    className="min-w-0 max-w-full text-left text-sm font-medium text-white hover:underline"
                  >
                    <Marquee text={track.title} durationPerChar={0.26} />
                  </button>
                  {isRadio && (
                    <span
                      title="Autoplaying from radio"
                      className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/15 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-white/80"
                    >
                      <InfinityIcon className="h-2.5 w-2.5" aria-hidden /> Radio
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => push({ type: 'artist', id: track.artist.slug, title: track.artist.name })}
                  className="block max-w-full truncate text-left text-xs text-subdued hover:text-white hover:underline"
                >
                  {track.artist.name}
                </button>
              </div>
              <button
                type="button"
                aria-label={track.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                onClick={() => like.mutate(track)}
                className="ml-2 hidden shrink-0 items-center justify-center lg:flex"
              >
                <Heart className={cn('h-4 w-4 transition', track.liked ? 'fill-spotify text-spotify' : 'text-subdued hover:text-white')} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-md bg-highlight" />
              <p className="text-sm text-subdued">Nothing playing</p>
            </div>
          )}
        </div>

        {/* center: controls + seek */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <ControlButton label="Shuffle" onClick={toggleShuffle} active={shuffle} disabled={!track}>
              <Shuffle className="h-[18px] w-[18px]" />
            </ControlButton>
            <ControlButton label="Previous" onClick={() => prev()} disabled={!track}>
              <SkipBack className="h-[20px] w-[20px] fill-current" />
            </ControlButton>
            <button
              type="button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={togglePlay}
              disabled={!track}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 hover:bg-[#f0f0f0] active:scale-95 disabled:cursor-default disabled:opacity-40"
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
            </button>
            <ControlButton label="Next" onClick={() => next()} disabled={!track}>
              <SkipForward className="h-[20px] w-[20px] fill-current" />
            </ControlButton>
            <ControlButton label={`Repeat: ${repeat}`} onClick={cycleRepeat} active={repeat !== 'off'} disabled={!track}>
              {repeat === 'one' ? <Repeat1 className="h-[18px] w-[18px]" /> : <Repeat className="h-[18px] w-[18px]" />}
            </ControlButton>
          </div>
          <div className="flex w-full max-w-[540px] items-center gap-2">
            <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-subdued">
              {formatDuration(displayProgress)}
            </span>
            <Slider
              ariaLabel="Seek"
              value={displayProgress}
              max={duration || 1}
              onChange={(v) => setScrubValue(v)}
              onCommit={(v) => {
                setScrubValue(null);
                seek(v);
              }}
              disabled={!track}
              className="flex-1"
            />
            <span className="w-10 shrink-0 text-[11px] tabular-nums text-subdued">{formatDuration(duration)}</span>
          </div>
        </div>

        {/* right: queue / volume / devices */}
        <div className="flex items-center justify-end gap-1">
          <ControlButton label="Queue" onClick={toggleQueue}>
            <ListMusic className="h-[18px] w-[18px]" />
          </ControlButton>
          <ControlButton
            label="Connect to a device"
            onClick={() => toast('No devices found nearby', { description: 'This is a demo build' })}
          >
            <MonitorSpeaker className="h-[18px] w-[18px]" />
          </ControlButton>
          <div className="flex items-center gap-1">
            <ControlButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}>
              <VolumeIcon className="h-[18px] w-[18px]" />
            </ControlButton>
            <div className="w-24">
              <Slider
                ariaLabel="Volume"
                value={displayVolume}
                max={1}
                onChange={(v) => {
                  setVolScrub(v);
                  setVolume(v);
                }}
                onCommit={(v) => {
                  setVolScrub(null);
                  setVolume(v);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
