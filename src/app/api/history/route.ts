import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { trackDTO } from '@/lib/serialize';
import type { HistoryDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HISTORY_TAKE = 100;

/** GET /api/history — listening history, newest first. */
export async function GET() {
  try {
    const rows = await db.track
      .findMany({
        where: { lastPlayedAt: { not: null } },
        orderBy: { lastPlayedAt: 'desc' },
        take: HISTORY_TAKE,
        include: { album: true, artist: true },
      })
      .catch(() => []);

    const dto: HistoryDTO = {
      entries: rows.map((t) => ({
        track: trackDTO(t),
        playedAt: (t.lastPlayedAt ?? new Date()).toISOString(),
      })),
    };
    return NextResponse.json(dto);
  } catch (e) {
    console.error('GET /api/history failed', e);
    return NextResponse.json({ error: 'Failed to load history' }, { status: 502 });
  }
}

/** PATCH /api/history — remove a single track from the history (body: { trackId }). */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { trackId?: string } | null;
    const trackId = body?.trackId?.trim();
    if (!trackId) {
      return NextResponse.json({ error: 'trackId is required' }, { status: 400 });
    }
    const result = await db.track.updateMany({
      where: { id: trackId, lastPlayedAt: { not: null } },
      data: { lastPlayedAt: null },
    });
    return NextResponse.json({ removed: result.count > 0 });
  } catch (e) {
    console.error('PATCH /api/history failed', e);
    return NextResponse.json({ error: 'Failed to remove entry' }, { status: 502 });
  }
}

/** DELETE /api/history — clear the listening history. */
export async function DELETE() {
  try {
    const result = await db.track.updateMany({
      where: { lastPlayedAt: { not: null } },
      data: { lastPlayedAt: null },
    });
    return NextResponse.json({ cleared: result.count });
  } catch (e) {
    console.error('DELETE /api/history failed', e);
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 502 });
  }
}
