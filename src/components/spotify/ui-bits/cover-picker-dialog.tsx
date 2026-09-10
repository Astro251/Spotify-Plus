'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, ImageIcon, LinkIcon, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSetPlaylistCover } from '@/hooks/queries';
import { PlaylistIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import type { PlaylistDTO } from '@/lib/types';

/** Bundled AI-generated artworks offered in the picker. */
const ARTWORKS = [
  '/covers/retro-sunset.png',
  '/covers/vinyl-green.png',
  '/covers/city-night.png',
  '/covers/flame-wave.png',
  '/covers/lofi-dusk.png',
  '/covers/misty-peak.png',
];

/** Spotify-style gradient presets (from → to). */
const GRADIENTS: [string, string][] = [
  ['#7c3aed', '#3b0764'],
  ['#0e7490', '#083344'],
  ['#b91c1c', '#450a0a'],
  ['#ca8a04', '#422006'],
  ['#db2777', '#500724'],
  ['#15803d', '#052e16'],
  ['#475569', '#0f172a'],
  ['#e1683a', '#6b2d0f'],
];

const ICON_CHOICES = ['Music', 'AudioLines', 'Waves', 'Coffee', 'Leaf', 'Sun', 'Map', 'CarFront'];

type Selection =
  | { kind: 'artwork'; value: string }
  | { kind: 'gradient'; from: string; to: string; icon: string }
  | { kind: 'url'; value: string }
  | { kind: 'current' };

function artworkOf(p: { cover?: string | null; coverFrom?: string | null; coverTo?: string | null }): Selection {
  if (p.cover?.startsWith('/covers/')) return { kind: 'artwork', value: p.cover };
  if (p.cover?.startsWith('/api/img')) return { kind: 'url', value: p.cover };
  if (p.coverFrom) return { kind: 'gradient', from: p.coverFrom, to: p.coverTo ?? '#111', icon: 'Music' };
  return { kind: 'current' };
}

/**
 * "Change cover" dialog: bundled AI artwork, curated gradients with icon,
 * or any https image URL (proxied server-side). Pass the playlist + open state.
 */
export function CoverPickerDialog({
  playlist,
  open,
  onOpenChange,
}: {
  playlist: PlaylistDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setCover = useSetPlaylistCover();
  const [sel, setSel] = useState<Selection>({ kind: 'current' });
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('Music');

  // sync the picker whenever the dialog opens or the playlist's cover changes
  // while open (derive-during-render — resets exactly once per key)
  const syncKey = open ? `${playlist.id}|${playlist.cover ?? ''}|${playlist.coverFrom ?? ''}|${playlist.icon ?? ''}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (syncKey !== seenKey) {
    setSeenKey(syncKey);
    const cur = artworkOf(playlist);
    setSel(cur.kind === 'gradient' ? { ...cur, icon: playlist.icon ?? 'Music' } : cur);
    setIcon(playlist.icon ?? 'Music');
    setUrl(cur.kind === 'url' ? (playlist.cover ?? '').replace(/^\/api\/img\?u=/, '') : '');
  }

  const save = () => {
    if (sel.kind === 'artwork') {
      setCover.mutate({ id: playlist.id, cover: sel.value }, { onSuccess: () => onOpenChange(false) });
    } else if (sel.kind === 'gradient') {
      setCover.mutate(
        { id: playlist.id, cover: null, coverFrom: sel.from, coverTo: sel.to, icon },
        { onSuccess: () => onOpenChange(false) }
      );
    } else if (sel.kind === 'url') {
      const u = url.trim();
      if (!/^https?:\/\//i.test(u)) return;
      setCover.mutate({ id: playlist.id, cover: u }, { onSuccess: () => onOpenChange(false) });
    }
  };

  const urlValid = /^https?:\/\/\S+$/i.test(url.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#282828] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Change cover</DialogTitle>
          <DialogDescription className="text-subdued">
            Pick artwork, a color &amp; icon combo, or paste an image link.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="artwork" className="mt-1">
          <TabsList className="grid w-full grid-cols-3 bg-highlight/60">
            <TabsTrigger value="artwork" className="gap-1.5 data-[state=active]:bg-white/10">
              <ImageIcon className="h-3.5 w-3.5" /> Artwork
            </TabsTrigger>
            <TabsTrigger value="colors" className="gap-1.5 data-[state=active]:bg-white/10">
              <Palette className="h-3.5 w-3.5" /> Colors
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-1.5 data-[state=active]:bg-white/10">
              <LinkIcon className="h-3.5 w-3.5" /> Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="artwork" className="mt-3">
            <div className="grid grid-cols-3 gap-2">
              {ARTWORKS.map((a) => {
                const active = sel.kind === 'artwork' && sel.value === a;
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Artwork option ${a.replace('/covers/', '').replace('.png', '')}`}
                    onClick={() => setSel({ kind: 'artwork', value: a })}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-md ring-offset-2 ring-offset-[#282828] transition hover:scale-[1.03]',
                      active && 'ring-2 ring-spotify'
                    )}
                  >
                    <Image src={a} alt="" fill sizes="120px" className="object-cover" />
                    {active && (
                      <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-spotify text-black shadow-lg">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="colors" className="mt-3">
            <div className="grid grid-cols-4 gap-2">
              {GRADIENTS.map(([from, to]) => {
                const active = sel.kind === 'gradient' && sel.from === from;
                return (
                  <button
                    key={from}
                    type="button"
                    aria-pressed={active}
                    aria-label={`Gradient ${from} to ${to}`}
                    onClick={() => setSel({ kind: 'gradient', from, to, icon })}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-md ring-offset-2 ring-offset-[#282828] transition hover:scale-[1.03]',
                      active && 'ring-2 ring-spotify'
                    )}
                    style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-white/90">
                      <PlaylistIcon name={icon} className="h-7 w-7 drop-shadow" />
                    </span>
                    {active && (
                      <span className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-spotify text-black shadow-lg">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-white">Icon</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ICON_CHOICES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={icon === name}
                    aria-label={`Icon ${name}`}
                    onClick={() => {
                      setIcon(name);
                      if (sel.kind !== 'gradient') setSel({ kind: 'gradient', from: GRADIENTS[0][0], to: GRADIENTS[0][1], icon: name });
                    }}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-md bg-highlight/60 text-white/80 transition hover:bg-white/10 hover:text-white',
                      icon === name && 'bg-white text-black ring-2 ring-spotify'
                    )}
                  >
                    <PlaylistIcon name={name} className="h-5 w-5" />
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-3">
            <label htmlFor="cover-url" className="text-sm font-semibold text-white">
              Image URL
            </label>
            <Input
              id="cover-url"
              autoFocus
              placeholder="https://example.com/picture.jpg"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setSel({ kind: 'url', value: e.target.value });
              }}
              className="mt-2 h-11 border-white/20 bg-highlight text-white placeholder:text-subdued/70"
            />
            <p className="mt-2 text-xs text-subdued">
              Must start with https:// — the image loads through our server so it always renders.
            </p>
            {url.trim() && !urlValid && (
              <p className="mt-1 text-xs text-red-400">That does not look like a valid image link.</p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-full text-white hover:bg-white/10 hover:text-white"
          >
            Cancel
          </Button>
          {sel.kind !== 'current' && (
            <Button
              onClick={save}
              disabled={setCover.isPending || (sel.kind === 'url' && !urlValid)}
              className="h-10 rounded-full bg-spotify px-8 font-bold text-black hover:bg-[#1fdf64] hover:text-black"
            >
              {setCover.isPending ? 'Saving…' : 'Save cover'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
