import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playlistDTO } from '@/lib/serialize';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

const GRADIENTS: Array<[string, string, string]> = [
  ['#4a2c17', '#1a120a', 'Music'],
  ['#17452c', '#0c1a11', 'Music'],
  ['#3d1440', '#14111f', 'Music'],
  ['#5c1440', '#1c0a14', 'Music'],
  ['#123f3a', '#0a1a17', 'Music'],
  ['#6b2d0f', '#241005', 'Music'],
];

export async function GET() {
  try {
    const playlists = await db.playlist.findMany({
      include: { tracks: { select: { track: { select: { duration: true, album: { select: { cover: true } } } } } } },
      orderBy: { sort: 'asc' },
    });
    return NextResponse.json(playlists.map(playlistDTO));
  } catch (e) {
    console.error('GET /api/playlists failed', e);
    return NextResponse.json({ error: 'Failed to load playlists' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; description?: string };
    const name = (body.name ?? '').trim() || `My Playlist #${Date.now() % 1000}`;
    const maxSort = await db.playlist.aggregate({ _max: { sort: true } });
    const [from, to, icon] = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
    const playlist = await db.playlist.create({
      data: {
        slug: `pl-${randomUUID().slice(0, 8)}`,
        name,
        description: body.description?.trim() || null,
        coverFrom: from,
        coverTo: to,
        icon,
        owner: 'You',
        editable: true,
        sort: (maxSort._max.sort ?? 0) + 1,
      },
      include: { tracks: { select: { track: { select: { duration: true, album: { select: { cover: true } } } } } } },
    });
    return NextResponse.json(playlistDTO(playlist), { status: 201 });
  } catch (e) {
    console.error('POST /api/playlists failed', e);
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 });
  }
}
