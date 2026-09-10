import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { albumDTO, artistDTO, trackDTO } from '@/lib/serialize';
import { ytArtist } from '@/lib/ytmusic';
import { mergeLikedStates } from '@/lib/yt-shadow';
import type { ArtistDetailDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    /* Live YouTube Music artist (slug form `yt-UC…` or by-name `yt-ar-…`) */
    if (id.startsWith('yt-') || id.startsWith('yt:')) {
      try {
        const dto = await ytArtist(id);
        if (!dto) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
        // Duration backfill: the live shelf items carry no durations, but any
        // track we have played before has a shadow row with the learned value.
        const topIds = dto.topTracks.map((t) => t.id);
        if (topIds.length) {
          const learned = await db.track.findMany({
            where: { id: { in: topIds } },
            select: { id: true, duration: true },
          });
          const durMap = new Map(learned.filter((r) => r.duration > 0).map((r) => [r.id, r.duration]));
          if (durMap.size) {
            dto.topTracks = dto.topTracks.map((t) => {
              const dur = durMap.get(t.id);
              return dur ? { ...t, duration: dur } : t;
            });
          }
        }
        dto.topTracks = await mergeLikedStates(dto.topTracks);
        return NextResponse.json(dto);
      } catch (e) {
        console.error('GET /api/artists/[id] (yt) failed', e);
        return NextResponse.json({ error: 'YouTube Music artist unavailable' }, { status: 502 });
      }
    }

    const artist = await db.artist.findFirst({ where: { OR: [{ id }, { slug: id }] } });
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const [topTrackRows, albumRows] = await Promise.all([
      db.track.findMany({
        where: { artistId: artist.id },
        include: { album: true, artist: true },
        orderBy: { plays: 'desc' },
        take: 5,
      }),
      db.album.findMany({
        where: { artistId: artist.id },
        include: { artist: true, tracks: { select: { duration: true, plays: true } } },
        orderBy: { year: 'desc' },
      }),
    ]);

    const dto: ArtistDetailDTO = {
      ...artistDTO(artist),
      topTracks: topTrackRows.map(trackDTO),
      albums: albumRows.map(albumDTO),
    };
    return NextResponse.json(dto);
  } catch (e) {
    console.error('GET /api/artists/[id] failed', e);
    return NextResponse.json({ error: 'Failed to load artist' }, { status: 500 });
  }
}
