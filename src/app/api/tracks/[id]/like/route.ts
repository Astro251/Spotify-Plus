import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureShadowTrack } from '@/lib/yt-shadow';
import type { TrackDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    /* YouTube Music track: persist a shadow row first (client sends the DTO). */
    if (id.startsWith('yt:') || id.startsWith('yt-')) {
      const body = (await req.json().catch(() => ({}))) as { track?: TrackDTO };
      if (!body.track?.id?.startsWith('yt:')) {
        return NextResponse.json({ error: 'Track payload required for YouTube Music tracks' }, { status: 400 });
      }
      const ok = await ensureShadowTrack(body.track);
      if (!ok) return NextResponse.json({ error: 'Failed to save YouTube Music track' }, { status: 500 });
      const saved = await db.track.findUnique({ where: { id: body.track.id } });
      if (!saved) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
      const liked = !saved.liked;
      const updated = await db.track.update({
        where: { id: saved.id },
        data: { liked, likedAt: liked ? new Date() : null },
      });
      return NextResponse.json({ id: updated.id, liked: updated.liked });
    }

    const track = await db.track.findFirst({ where: { OR: [{ id }, { slug: id }] } });
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

    const liked = !track.liked;
    const updated = await db.track.update({
      where: { id: track.id },
      data: { liked, likedAt: liked ? new Date() : null },
    });
    return NextResponse.json({ id: updated.id, liked: updated.liked });
  } catch (e) {
    console.error('POST /api/tracks/[id]/like failed', e);
    return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
  }
}
