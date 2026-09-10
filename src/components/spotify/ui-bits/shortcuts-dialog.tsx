'use client';

import { useEffect, useState } from 'react';
import { Command } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** window event that opens the shortcuts dialog (hotkey "?" / account menu) */
export const SHORTCUTS_EVENT = 'app:shortcuts';
export function openShortcutsDialog() {
  window.dispatchEvent(new CustomEvent(SHORTCUTS_EVENT));
}

const GROUPS: { title: string; items: [keys: string[], label: string][] }[] = [
  {
    title: 'Playback',
    items: [
      [['Space', 'K'], 'Play / pause'],
      [['J'], 'Previous track'],
      [['L'], 'Next track'],
      [['S'], 'Shuffle on / off'],
      [['M'], 'Mute / unmute'],
    ],
  },
  {
    title: 'Navigate',
    items: [
      [['←'], 'Seek back 5 seconds'],
      [['→'], 'Seek forward 5 seconds'],
      [['↑'], 'Volume up'],
      [['↓'], 'Volume down'],
      [['/'], 'Go to Search'],
      [['?'], 'Show this list'],
    ],
  },
];

/** Spotify-style keyboard shortcuts cheatsheet ("?" or account menu). */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(SHORTCUTS_EVENT, onOpen);
    return () => window.removeEventListener(SHORTCUTS_EVENT, onOpen);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-white/10 bg-[#282828] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-spotify/15 text-spotify">
              <Command className="h-5 w-5" />
            </span>
            Keyboard shortcuts
          </DialogTitle>
          <DialogDescription className="text-subdued">
            Keys work anywhere outside of text fields.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-subdued">{g.title}</h3>
              <ul className="space-y-2">
                {g.items.map(([keys, label]) => (
                  <li key={label} className="flex items-center justify-between gap-3 text-sm text-white/90">
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {keys.map((k) => (
                        <kbd
                          key={k}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-white/15 bg-highlight px-1.5 font-mono text-[11px] font-semibold text-white shadow-[0_1.5px_0_rgba(255,255,255,0.12)]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
