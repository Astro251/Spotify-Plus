'use client';

import { EqualizerBars } from '@/components/spotify/ui-bits/equalizer-bars';
import { Cover } from '@/components/spotify/ui-bits/cover';
import { PlayButton } from '@/components/spotify/ui-bits/play-button';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  cover?: string | null;
  from?: string | null;
  to?: string | null;
  icon?: string | null;
  mosaic?: string[] | null;
  title: string;
  subtitle?: string;
  circle?: boolean;
  playing?: boolean;
  onClick?: () => void;
  onPlay?: () => void;
  className?: string;
}

/** Card used on home/search shelves: square (album/playlist) or circle (artist). */
export function MediaCard({
  cover, from, to, icon, mosaic, title, subtitle, circle, playing, onClick, onPlay, className,
}: MediaCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'group relative w-[46vw] max-w-[220px] shrink-0 cursor-pointer rounded-lg p-3 transition-colors duration-200 hover:bg-white/10 focus-visible:bg-white/10 sm:w-auto sm:min-w-[168px] sm:max-w-none',
        className
      )}
    >
      <div className="relative">
        <Cover
          src={cover}
          from={from}
          to={to}
          icon={icon}
          mosaic={mosaic}
          alt={title}
          priority
          className={cn(
            'aspect-square w-full',
            circle ? 'rounded-full' : 'rounded-md shadow-[0_4px_24px_rgba(0,0,0,0.5)]'
          )}
          iconClassName={circle ? 'h-10 w-10' : 'h-12 w-12'}
        />
        {playing && (
          <div className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
            <EqualizerBars className="h-3 w-3.5" />
          </div>
        )}
        {onPlay && (
          <div className="absolute bottom-2 right-2 hidden translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 md:block">
            <PlayButton playing={playing} onClick={() => onPlay()} size="md" className="shadow-[0_8px_24px_rgba(0,0,0,0.6)]" />
          </div>
        )}
      </div>
      <div className="mt-3 min-w-0">
        <h3 className={cn('truncate text-[0.98rem] font-semibold tracking-tight text-white', circle && 'text-center')}>{title}</h3>
        {subtitle && (
          <p className={cn('mt-0.5 line-clamp-2 text-sm text-subdued', circle && 'text-center')}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
