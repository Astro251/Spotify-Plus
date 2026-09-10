'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Mic2, Music4 } from 'lucide-react';
import { useLyrics } from '@/hooks/queries';
import { usePlayer } from '@/lib/store/player';
import type { TrackDTO } from '@/lib/types';
import { cn } from '@/lib/utils';

const FOLLOW_PAUSE_MS = 3500;

/**
 * Spotify-style karaoke lyrics: synced lines highlighted in time with
 * playback, auto-follow scrolling, and tap-a-line-to-seek.
 */
export function LyricsPanel({ track }: { track: TrackDTO }) {
  const { data, isLoading, isError } = useLyrics(track);
  const progress = usePlayer((s) => s.progress);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const seek = usePlayer((s) => s.seek);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const followUntil = useRef(0);
  const lastAutoScroll = useRef(0);
  const [tick, setTick] = useState(0); // re-render driver while playing

  const lines = useMemo(() => data?.lines ?? [], [data]);
  const synced = !!data?.synced;

  // active line: last line whose timestamp has passed (with a tiny lead)
  const activeIndex = useMemo(() => {
    if (!synced || !lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= progress + 0.15) idx = i;
      else break;
    }
    return idx;
  }, [lines, progress, synced]);

  // keep evaluating progress while playing (progress store updates at rAF rate,
  // but this component is cheap — a tick keeps the active line crisp)
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  // auto-follow: center the active line (unless the user scrolled recently)
  useEffect(() => {
    if (activeIndex < 0 || !synced) return;
    if (Date.now() < followUntil.current) return;
    const box = scrollRef.current;
    const el = lineRefs.current[activeIndex];
    if (!box || !el) return;
    const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    const near = Math.abs(box.scrollTop - target) < 24;
    if (!near) {
      lastAutoScroll.current = Date.now();
      box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }, [activeIndex, synced, tick]);

  // reset scroll when the track changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    followUntil.current = 0;
    lineRefs.current = [];
  }, [track.id]);

  const onUserScroll = () => {
    // programmatic smooth-scroll fires scroll events too — only treat
    // scrolls starting well after our last auto-scroll as user scrolls
    if (Date.now() - lastAutoScroll.current < 300) return;
    followUntil.current = Date.now() + FOLLOW_PAUSE_MS;
  };

  const lineClick = (time: number) => {
    if (time >= 0) seek(time);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col" aria-label={`Lyrics for ${track.title}`}>
      {/* The scroller is sized exactly by flex (min-h-0) — the vertical
          centering padding lives on the INNER list so the scroller itself can
          never outgrow its container (py-[28vh] on the scroller made it taller
          than its flex allocation on short viewports, painting lines over the
          title row). Edge fades mask the clip so lines dissolve gracefully. */}
      <div
        ref={scrollRef}
        onScroll={onUserScroll}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 lyrics-fade"
      >
        {isLoading ? (
          <div className="space-y-7 py-[12vh]" aria-label="Loading lyrics">
            {[70, 55, 80, 45, 65, 60, 75, 50, 68].map((w, i) => (
              <div key={i} className="animate-pulse rounded-lg bg-white/10" style={{ height: 34, width: `${w}%` }} />
            ))}
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <Mic2 className="h-7 w-7 text-white/60" aria-hidden />
            </div>
            <p className="text-lg font-bold text-white/90">No lyrics found</p>
            <p className="max-w-[260px] text-sm text-white/50">
              We couldn&rsquo;t find lyrics for this track yet.
            </p>
          </div>
        ) : data.instrumental ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <Music4 className="h-7 w-7 text-white/60" aria-hidden />
            </div>
            <p className="text-lg font-bold text-white/90">Instrumental</p>
            <p className="max-w-[260px] text-sm text-white/50">This track has no vocals — enjoy the music.</p>
          </div>
        ) : (
          <div role="list" aria-label={synced ? 'Synced lyrics' : 'Lyrics'} className="space-y-4 py-[28vh]">
            {lines.map((line, i) => {
              const active = i === activeIndex;
              const passed = synced && i < activeIndex;
              return (
                <button
                  key={`${i}-${line.time}`}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  type="button"
                  role="listitem"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => lineClick(line.time)}
                  disabled={!synced || line.time < 0}
                  className={cn(
                    'block w-full text-left text-[1.65rem] font-extrabold leading-[1.28] tracking-tight transition-all duration-500 md:text-5xl',
                    !synced && 'cursor-default text-white/70 hover:text-white',
                    synced && 'cursor-pointer',
                    active
                      ? 'scale-[1.02] text-white [text-shadow:0_2px_24px_rgba(255,255,255,0.25)]'
                      : passed
                        ? 'text-white/45 hover:text-white/80'
                        : 'text-white/35 hover:text-white/70'
                  )}
                >
                  {line.text || '♪'}
                </button>
              );
            })}
            {/* trailing space so the last line can center */}
            <div className="h-[20vh]" aria-hidden />
          </div>
        )}
      </div>

      {/* status chip: loading / unsynced notice */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-4 py-1.5 text-xs font-bold text-white/90 backdrop-blur"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Finding lyrics…
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
