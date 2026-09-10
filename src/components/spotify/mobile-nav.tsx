'use client';

import { Heart, Home, Library, Search } from 'lucide-react';
import { useNav } from '@/lib/store/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'library', label: 'Your Library', icon: Library },
] as const;

/** Mobile bottom tab bar (hidden on desktop). */
export function MobileNav() {
  const tab = useNav((s) => s.tab);
  const setTab = useNav((s) => s.setTab);

  return (
    <nav
      aria-label="Main navigation"
      className="z-30 flex shrink-0 items-stretch border-t border-white/5 bg-[#0a0a0a] pb-safe md:hidden"
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={active ? 'page' : undefined}
            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1"
          >
            <Icon className={cn('h-6 w-6 transition-colors', active ? 'text-white' : 'text-subdued')} strokeWidth={active ? 2.4 : 2} />
            <span className={cn('text-[11px] font-medium transition-colors', active ? 'text-white' : 'text-subdued')}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
