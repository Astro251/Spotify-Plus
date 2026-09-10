'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePlayer } from '@/lib/store/player';
import type { TrackDTO } from '@/lib/types';

/**
 * Share deep-link handler: `/?play=<trackId>` resolves the track and starts
 * playback (queue = just that song, so autoplay radio continues afterwards).
 * The URL param is stripped immediately so refreshing / sharing again never
 * replays unexpectedly.
 */
export function SharedLinkHandler() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const sp = new URLSearchParams(window.location.search);
    const playId = sp.get('play');
    if (!playId) return;

    // clean the URL right away (replaceState keeps the back button sane)
    sp.delete('play');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `/?${qs}` : '/');

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tracks/${encodeURIComponent(playId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const track = (await res.json()) as TrackDTO;
        if (cancelled || !track?.id) return;
        usePlayer.getState().playTracks([track], 0, { id: 'shared', label: 'Shared with you' });
        toast.success(`Playing “${track.title}”`, { description: track.artist.name });
      } catch {
        if (!cancelled) toast.error('Shared song unavailable', { description: 'The link may be broken.' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
