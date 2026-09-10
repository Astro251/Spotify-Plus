'use client';

import { Heart } from 'lucide-react';
import { usePlayer } from '@/lib/store/player';
import { useToggleLike } from '@/hooks/queries';
import type { TrackDTO } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LikeButtonProps {
  track: TrackDTO;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Heart toggle — optimistic, green when liked, subtle when not. */
export function LikeButton({ track, size = 'sm', className }: LikeButtonProps) {
  const like = useToggleLike();
  const playing = usePlayer((s) => s.queue[s.order[s.pos]]?.id === track.id);
  const sizes = {
    sm: 'h-6 w-6 [&_svg]:h-[18px] [&_svg]:w-[18px]',
    md: 'h-8 w-8 [&_svg]:h-5 [&_svg]:w-5',
    lg: 'h-10 w-10 [&_svg]:h-6 [&_svg]:w-6',
  } as const;

  return (
    <button
      type="button"
      aria-label={track.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      aria-pressed={track.liked}
      onClick={(e) => {
        e.stopPropagation();
        like.mutate(track);
      }}
      className={cn(
        'relative flex items-center justify-center transition hover:scale-110 active:scale-95',
        sizes[size],
        className
      )}
    >
      <Heart
        className={cn(
          'transition-colors',
          track.liked ? 'fill-spotify text-spotify' : playing ? 'text-white hover:text-white' : 'text-subdued hover:text-white'
        )}
        strokeWidth={2.2}
      />
    </button>
  );
}
