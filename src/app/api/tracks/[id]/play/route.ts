import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureShadowTrack } from '@/lib/yt-shadow';
import type { TrackDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Play counter. When the client sends the full track DTO (body `{ track }`),
 * a shadow row is (re)created so the play lands in the listening history
 * (Recently played on Home) and liked-state overlays keep working.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let dto: TrackDTO | null = null;
    try {
      const body = (await req.json()) as { track?: TrackDTO } | null;
      if (body?.track && body.track.id === id) dto = body.track;
    } catch {
      /* no body (legacy id-only call) */
    }

    if (dto) {
      await ensureShadowTrack(dto);
      const updated = await db.track.update({
        where: { id },
        data: { plays: { increment: 1 }, lastPlayedAt: new Date() },
      });
      await db.playLog.create({ data: { trackId: updated.id } }).catch(() => undefined);
      return NextResponse.json({ id: updated.id, plays: updated.plays });
    }

    /* Id-only path: the row must already exist. */
    const track = await db.track.findFirst({ where: { OR: [{ id }, { slug: id }] } });
    if (!track) return NextResponse.json({ ok: true, plays: 0 });

    const updated = await db.track.update({
      where: { id: track.id },
      data: { plays: { increment: 1 }, lastPlayedAt: new Date() },
    });
    await db.playLog.create({ data: { trackId: updated.id } }).catch(() => undefined);
    return NextResponse.json({ id: updated.id, plays: updated.plays });
  } catch (e) {
    console.error('POST /api/tracks/[id]/play failed', e);
    return NextResponse.json({ error: 'Failed to count play' }, { status: 500 });
  }
}
