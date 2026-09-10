'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShelfProps {
  title: string;
  onShowAll?: () => void;
  children: React.ReactNode;
  className?: string;
}

/** A titled horizontal-scroll shelf with desktop hover arrows (Spotify home rows). */
export function Shelf({ title, onShowAll, children, className }: ShelfProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: 'smooth' });
  };

  return (
    <section className={cn('group/shelf', className)} aria-label={title}>
      <div className="mb-1 flex items-end justify-between px-1">
        <h2 className="text-xl font-bold tracking-tight text-white hover:underline md:text-2xl">{title}</h2>
        {onShowAll && (
          <button
            type="button"
            onClick={onShowAll}
            aria-label={`Show all ${title}`}
            className="group/showall flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider text-subdued transition hover:text-white md:text-sm"
          >
            Show all
            <ChevronRight className="h-4 w-4 transition-transform group-hover/showall:translate-x-0.5" aria-hidden />
          </button>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => scrollBy(-1)}
          className="absolute left-0 top-1/2 z-10 hidden h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 shadow-lg backdrop-blur transition hover:scale-110 hover:bg-black/90 group-hover/shelf:opacity-100 md:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => scrollBy(1)}
          className="absolute right-0 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-black/70 text-white opacity-0 shadow-lg backdrop-blur transition hover:scale-110 hover:bg-black/90 group-hover/shelf:opacity-100 md:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <div
          ref={ref}
          className="scrollbar-hide -mx-3 flex snap-x gap-0 overflow-x-auto scroll-smooth px-3 md:mx-0 md:px-0"
        >
          {children}
        </div>
      </div>
    </section>
  );
}
