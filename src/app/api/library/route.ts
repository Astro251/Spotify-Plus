import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playlistDTO } from '@/lib/serialize';
import type { LibraryDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [playlists, likedTracks] = await Promise.all([
      db.playlist.findMany({
        include: { tracks: { select: { track: { select: { duration: true, album: { select: { cover: true } } } } } } },
        orderBy: { sort: 'asc' },
      }),
      db.track.findMany({ where: { liked: true }, select: { duration: true } }),
    ]);

    const library: LibraryDTO = {
      playlists: playlists.map(playlistDTO),
      liked: {
        count: likedTracks.length,
        totalDuration: likedTracks.reduce((sum, t) => sum + t.duration, 0),
      },
    };
    return NextResponse.json(library);
  } catch (e) {
    console.error('GET /api/library failed', e);
    return NextResponse.json({ error: 'Failed to load library' }, { status: 500 });
  }
}
