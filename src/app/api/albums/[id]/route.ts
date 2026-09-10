import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { albumDTO, trackDTO } from '@/lib/serialize';
import { ytAlbum } from '@/lib/ytmusic';
import { mergeLikedStates } from '@/lib/yt-shadow';
import type { AlbumDetailDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    /* Live YouTube Music album (slug form `yt-MPREb…` or single `yt-single-…`) */
    if (id.startsWith('yt-') || id.startsWith('yt:')) {
      try {
        const dto = await ytAlbum(id);
        if (!dto) return NextResponse.json({ error: 'Album not found' }, { status: 404 });
        dto.tracks = await mergeLikedStates(dto.tracks);
        return NextResponse.json(dto);
      } catch (e) {
        console.error('GET /api/albums/[id] (yt) failed', e);
        return NextResponse.json({ error: 'YouTube Music album unavailable' }, { status: 502 });
      }
    }

    const album = await db.album.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        artist: true,
        tracks: { orderBy: { number: 'asc' } },
      },
    });
    if (!album) return NextResponse.json({ error: 'Album not found' }, { status: 404 });

    const tracksWithRefs = await Promise.all(
      album.tracks.map(async (t) => {
        const artist = t.artistId === album.artistId ? album.artist : await db.artist.findUniqueOrThrow({ where: { id: t.artistId } });
        return trackDTO({ ...t, album, artist });
      })
    );

    const dto: AlbumDetailDTO = {
      ...albumDTO(album),
      tracks: tracksWithRefs,
    };
    return NextResponse.json(dto);
  } catch (e) {
    console.error('GET /api/albums/[id] failed', e);
    return NextResponse.json({ error: 'Failed to load album' }, { status: 500 });
  }
}
