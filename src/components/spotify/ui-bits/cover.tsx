'use client';

import Image from 'next/image';
import { PlaylistIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface CoverProps {
  src?: string | null;
  from?: string | null;
  to?: string | null;
  icon?: string | null;
  /** 2×2 track-cover mosaic (user playlists without their own artwork). */
  mosaic?: string[] | null;
  alt: string;
  /** parent must set aspect ratio + rounding via className */
  className?: string;
  iconClassName?: string;
  priority?: boolean;
}

/**
 * Album/playlist cover: image, mosaic of track covers, or gradient+icon
 * fallback. Parent sets size/aspect/rounding.
 */
export function Cover({ src, from, to, icon, mosaic, alt, className, iconClassName, priority }: CoverProps) {
  const tiles = mosaic && mosaic.length > 0 && !src ? mosaic.slice(0, 4) : null;

  return (
    <div className={cn('relative shrink-0 overflow-hidden bg-highlight', className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 768px) 45vw, (max-width: 1280px) 20vw, 240px"
          className="object-cover"
        />
      ) : tiles ? (
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2" role="img" aria-label={alt}>
          {[0, 1, 2, 3].map((i) =>
            tiles[i] ? (
              <Image
                key={`${i}-${tiles[i]}`}
                src={tiles[i]}
                alt=""
                fill
                priority={priority}
                sizes="(max-width: 768px) 23vw, (max-width: 1280px) 10vw, 120px"
                className="object-cover"
              />
            ) : (
              <div key={i} className="bg-[#242424]" aria-hidden />
            )
          )}
        </div>
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${from ?? '#333'} 0%, ${to ?? '#111'} 100%)` }}
        >
          <PlaylistIcon name={icon} className={cn('h-8 w-8 text-white/95', iconClassName)} />
        </div>
      )}
    </div>
  );
}
