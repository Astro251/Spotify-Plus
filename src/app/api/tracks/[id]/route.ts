import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { trackDTO } from '@/lib/serialize';
import { nextVideoMeta, ytTrackDTO } from '@/lib/ytmusic';
import { ensureShadowTrack, mergeLikedStates } from '@/lib/yt-shadow';
import type { TrackDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tracks/[id] — resolve any track id to a full TrackDTO.
 *
 * Used by share deep-links (`/?play=<id>`): a YouTube Music video we have
 * never seen resolves live via the InnerTube `next` endpoint (which returns
 * the seed track itself); anything already persisted (shadow rows from
 * likes / playlists / play history) comes straight from the DB. Rows with a
 * missing duration get backfilled from the live metadata.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    /* 1. persisted row (local tracks + yt shadow rows) */
    const row = await db.track.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: { album: true, artist: true },
    });
    if (row && !(id.startsWith('yt:') && row.duration === 0)) {
      return NextResponse.json(trackDTO(row));
    }

    /* 2. live YouTube Music metadata (unseen videos + duration backfill) */
    if (id.startsWith('yt:')) {
      const videoId = id.slice(3);
      const item = await nextVideoMeta(videoId);
      const dto = item ? await ytTrackDTO(item) : null;
      if (dto) {
        // persist (or refresh) the shadow row so likes / history / future
        // loads are fast — keep the row's existing liked state
        await ensureShadowTrack(dto).catch(() => undefined);
        const [withLiked] = await mergeLikedStates([dto]);
        return NextResponse.json(withLiked);
      }
      if (row) return NextResponse.json(trackDTO(row)); // stale row beats 404
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  } catch (e) {
    console.error('GET /api/tracks/[id] failed', e);
    return NextResponse.json({ error: 'Failed to load track' }, { status: 500 });
  }
}
