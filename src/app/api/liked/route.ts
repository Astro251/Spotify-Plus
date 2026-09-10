import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { trackDTO } from '@/lib/serialize';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tracks = await db.track.findMany({
      where: { liked: true },
      include: { album: true, artist: true },
      orderBy: [{ likedAt: 'desc' }, { slug: 'asc' }],
    });
    return NextResponse.json(tracks.map(trackDTO));
  } catch (e) {
    console.error('GET /api/liked failed', e);
    return NextResponse.json({ error: 'Failed to load liked songs' }, { status: 500 });
  }
}
