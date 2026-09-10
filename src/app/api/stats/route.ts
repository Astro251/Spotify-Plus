import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { albumDTO, artistDTO, trackDTO } from '@/lib/serialize';
import type { StatsDTO, StatsRange, StatsTopAlbum, StatsTopArtist, StatsTopTrack } from '@/lib/types';

export const dynamic = 'force-dynamic';

const RANGE_DAYS: Record<StatsRange, number> = { week: 7, month: 30, all: 3650 };

const TOP_TRACKS = 10;
const TOP_ARTISTS = 8;
const TOP_ALBUMS = 6;

/**
 * GET /api/stats?range=week|month|all
 * Listening stats aggregated from the PlayLog table (one row per play event):
 * summary counters plus top tracks / artists / albums for the range.
 */
export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('range') ?? 'week';
    const range: StatsRange = raw === 'month' || raw === 'all' ? raw : 'week';
    const since = new Date(Date.now() - RANGE_DAYS[range] * 86_400_000);

    const logs = await db.playLog.findMany({
      where: { playedAt: { gte: since } },
      include: { track: { include: { album: true, artist: true } } },
    });

    // aggregate per track
    const byTrack = new Map<
      string,
      { plays: number; seconds: number; track: (typeof logs)[number]['track'] }
    >();
    const days = new Set<string>();
    for (const log of logs) {
      days.add(log.playedAt.toISOString().slice(0, 10));
      const hit = byTrack.get(log.track.id);
      if (hit) {
        hit.plays += 1;
        hit.seconds += log.track.duration;
      } else {
        byTrack.set(log.track.id, { plays: 1, seconds: log.track.duration, track: log.track });
      }
    }

    const topTracks: StatsTopTrack[] = [...byTrack.values()]
      .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
      .slice(0, TOP_TRACKS)
      .map((t) => ({ track: trackDTO(t.track), plays: t.plays, seconds: t.seconds }));

    // aggregate artists from the same set
    const byArtist = new Map<
      string,
      { plays: number; seconds: number; trackIds: Set<string>; artistId: string }
    >();
    for (const t of byTrack.values()) {
      const hit = byArtist.get(t.track.artistId);
      if (hit) {
        hit.plays += t.plays;
        hit.seconds += t.seconds;
        hit.trackIds.add(t.track.id);
      } else {
        byArtist.set(t.track.artistId, {
          plays: t.plays,
          seconds: t.seconds,
          trackIds: new Set([t.track.id]),
          artistId: t.track.artistId,
        });
      }
    }

    // load artist rows in one query (artists may include live YT shadow rows)
    const artistRows = await db.artist.findMany({ where: { id: { in: [...byArtist.keys()] } } });
    const artistMap = new Map(artistRows.map((a) => [a.id, a]));
    const topArtists: StatsTopArtist[] = [...byArtist.values()]
      .sort((a, b) => b.plays - a.plays || b.seconds - a.seconds)
      .slice(0, TOP_ARTISTS)
      .map((a) => {
        const row = artistMap.get(a.artistId);
        return {
          artist: row
            ? artistDTO(row)
            : {
                id: a.artistId,
                slug: a.artistId,
                name: 'Unknown artist',
                image: '',
                bio: '',
                monthlyListeners: 0,
              },
          plays: a.plays,
          trackCount: a.trackIds.size,
          seconds: a.seconds,
        };
      });

    // aggregate albums
    const byAlbum = new Map<string, number>();
    for (const t of byTrack.values()) {
      byAlbum.set(t.track.albumId, (byAlbum.get(t.track.albumId) ?? 0) + t.plays);
    }
    const albumRows = await db.album.findMany({
      where: { id: { in: [...byAlbum.keys()] } },
      include: { artist: true, tracks: { select: { duration: true, plays: true } } },
    });
    const albumMap = new Map(albumRows.map((a) => [a.id, a]));
    const topAlbums: StatsTopAlbum[] = [...byAlbum.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_ALBUMS)
      .map(([albumId, plays]): StatsTopAlbum | null => {
        const row = albumMap.get(albumId);
        return row ? { album: albumDTO(row), plays } : null;
      })
      .filter((a): a is StatsTopAlbum => a !== null);

    const dto: StatsDTO = {
      range,
      summary: {
        plays: logs.length,
        seconds: [...byTrack.values()].reduce((sum, t) => sum + t.seconds, 0),
        trackCount: byTrack.size,
        artistCount: byArtist.size,
        activeDays: days.size,
      },
      topTracks,
      topArtists,
      topAlbums,
    };
    return NextResponse.json(dto);
  } catch (e) {
    console.error('GET /api/stats failed', e);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 502 });
  }
}
