'use client';

import { cn } from '@/lib/utils';

/** Animated green equalizer bars shown next to the playing track. */
export function EqualizerBars({
  className,
  playing = true,
}: {
  className?: string;
  playing?: boolean;
}) {
  return (
    <span className={cn('flex h-3.5 w-4 items-end justify-between gap-[2px]', className)} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('eq-bar h-full w-[2px] origin-bottom rounded-[1px] bg-spotify', !playing && 'eq-paused')}
          style={{
            animationDelay: `${i * 0.15}s`,
            animationDuration: `${0.8 + (i % 2) * 0.35}s`,
          }}
        />
      ))}
    </span>
  );
}
