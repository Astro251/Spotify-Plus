'use client';

import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlayButtonProps {
  playing?: boolean;
  onClick: (e: React.MouseEvent) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

/** The signature green circular play/pause FAB. */
export function PlayButton({ playing, onClick, size = 'md', className, label }: PlayButtonProps) {
  const sizes = {
    sm: 'h-10 w-10 [&_svg]:h-4 [&_svg]:w-4',
    md: 'h-12 w-12 [&_svg]:h-5 [&_svg]:w-5',
    lg: 'h-14 w-14 [&_svg]:h-6 [&_svg]:w-6',
  } as const;
  return (
    <button
      type="button"
      aria-label={label ?? (playing ? 'Pause' : 'Play')}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={cn(
        'flex items-center justify-center rounded-full bg-spotify text-black shadow-[0_8px_16px_rgba(0,0,0,0.5)] transition hover:scale-[1.06] hover:bg-[#1fdf64] active:scale-95',
        sizes[size],
        className
      )}
    >
      {playing ? (
        <Pause fill="currentColor" strokeWidth={0} />
      ) : (
        <Play fill="currentColor" strokeWidth={0} className="translate-x-[1px]" />
      )}
    </button>
  );
}
