'use client';

import { toast } from 'sonner';
import type { TrackDTO } from '@/lib/types';

/**
 * Share deep-links.
 *
 * A shared song is a real URL: `/?play=<trackId>`. On load, the app resolves
 * the id (GET /api/tracks/[id] — DB shadow row or live YouTube Music metadata)
 * and starts playback. The URL is then cleaned so refreshing does not replay.
 */

export function trackShareUrl(track: TrackDTO): string {
  const base = typeof window === 'undefined' ? '' : window.location.origin;
  return `${base}/?play=${encodeURIComponent(track.id)}`;
}

export function trackShareText(track: TrackDTO): string {
  return `Listen to “${track.title}” by ${track.artist.name}`;
}

/**
 * Share via the Web Share API when available (mobile share sheet with the
 * deep-link), otherwise copy the link to the clipboard.
 */
export async function shareTrack(track: TrackDTO): Promise<void> {
  const url = trackShareUrl(track);
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title: track.title, text: trackShareText(track), url });
      toast.success('Shared');
      return;
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'AbortError') return; // user dismissed the sheet
      /* fall through to clipboard */
    }
  }
  try {
    await navigator.clipboard?.writeText(url);
    toast.success('Link copied to clipboard', { description: 'Anyone who opens it hears the song.' });
  } catch {
    toast.error('Could not share the song');
  }
}
