'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { BarChart3, ChevronLeft, ChevronRight, Command, LogOut, Settings, User } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { greeting } from '@/lib/format';
import { useNav } from '@/lib/store/navigation';
import { cn } from '@/lib/utils';

const TITLES: Record<string, string> = {
  home: '',
  search: 'Search',
  library: 'Your Library',
  liked: 'Liked Songs',
  history: 'Recently played',
};

/** Sticky top bar: translucent on scroll, back/forward on desktop, avatar menu. */
export function TopBar() {
  const barRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const stack = useNav((s) => s.stack);
  const view = stack[stack.length - 1];
  const tab = useNav((s) => s.tab);
  const canBack = stack.length > 1;
  const future = useNav((s) => s.future);
  const back = useNav((s) => s.back);
  const forward = useNav((s) => s.forward);

  useEffect(() => {
    const el = barRef.current?.parentElement;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 16);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const detailTitle = view.type === 'playlist' || view.type === 'album' || view.type === 'artist' ? view.title ?? '' : TITLES[view.type] ?? '';

  return (
    <header
      ref={barRef}
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center gap-2 px-4 transition-colors duration-200 md:px-6',
        scrolled ? 'bg-black/70 shadow-[0_4px_12px_rgba(0,0,0,0.4)] backdrop-blur-md' : 'bg-gradient-to-b from-black/60 to-transparent'
      )}
    >
      {/* mobile detail back button */}
      {canBack ? (
        <button
          type="button"
          aria-label="Go back"
          onClick={back}
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/60 text-white transition hover:scale-105 md:hidden"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      ) : null}

      {/* desktop nav arrows */}
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <button
          type="button"
          aria-label="Go back"
          disabled={!canBack}
          onClick={back}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:scale-105 disabled:cursor-default disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Go forward"
          disabled={future.length === 0}
          onClick={forward}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white transition hover:scale-105 disabled:cursor-default disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        {/* mobile: home greeting / detail title */}
        <p className="truncate text-base font-bold text-white md:hidden">
          {view.type === 'home' ? greeting() : detailTitle}
        </p>
        {/* desktop: contextual title once scrolled */}
        {scrolled && detailTitle && (
          <p className="hidden truncate text-xl font-bold text-white md:block">{detailTitle}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={() => toast('Explore Premium is coming soon', { description: 'This is a demo build' })}
          className="hidden rounded-full border border-white/40 px-4 py-1.5 text-sm font-bold tracking-tight text-white transition hover:scale-105 hover:border-white lg:block"
        >
          Explore Premium
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              suppressHydrationWarning
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#535353] to-[#181818] text-white shadow-md ring-1 ring-white/10 transition hover:scale-105"
            >
              <User className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 border-white/10 bg-[#282828] text-white">
            <DropdownMenuItem className="gap-3 py-2.5" onClick={() => toast('Account is demo-only')}>
              <User className="h-4 w-4" /> Account
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-3 py-2.5"
              onClick={() => useNav.getState().push({ type: 'stats', title: 'Top played' })}
            >
              <BarChart3 className="h-4 w-4" /> Your listening stats
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 py-2.5" onClick={() => window.dispatchEvent(new CustomEvent('app:shortcuts'))}>
              <Command className="h-4 w-4" /> Keyboard shortcuts
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 py-2.5" onClick={() => toast('Settings are demo-only')}>
              <Settings className="h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 py-2.5" onClick={() => toast('You are logged in as demo user')}>
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
