import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playlistDTO, trackDTO } from '@/lib/serialize';
import { ytHome } from '@/lib/ytmusic';
import type { HomeFeedDTO, ShelfDTO, ShelfItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

const QUICK_PICK_COUNT = 7; // + Liked Songs tile = 8 shortcut tiles, Spotify-style
const RECENT_TAKE = 20; // fetch, then dedupe by song and show up to 8

export async function GET() {
  try {
    const [shelves, playlists, likedCount, recentRows] = await Promise.all([
      ytHome(),
      db.playlist
        .findMany({
          include: { tracks: { select: { track: { select: { duration: true, album: { select: { cover: true } } } } } } },
          orderBy: { sort: 'asc' },
        })
        .catch(() => []),
      db.track.count({ where: { liked: true } }).catch(() => 0),
      db.track
        .findMany({
          where: { lastPlayedAt: { not: null } },
          orderBy: { lastPlayedAt: 'desc' },
          take: RECENT_TAKE,
          include: { album: true, artist: true },
        })
        .catch(() => []),
    ]);

    // Quick picks: first unique items across the live shelves
    // (new releases, trending albums, playlists, artists…)
    const seen = new Set<string>();
    const quickPicks: ShelfItem[] = [];
    for (const shelf of shelves) {
      for (const item of shelf.items) {
        if (quickPicks.length >= QUICK_PICK_COUNT) break;
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        quickPicks.push(item);
      }
      if (quickPicks.length >= QUICK_PICK_COUNT) break;
    }

    // "Made by you" — playlists the user created land on top of the feed
    const mine = playlists.map(playlistDTO);
    const allShelves: ShelfDTO[] = [
      ...(mine.length > 0 ? [{ id: 'made-by-you', title: 'Made by you', items: mine }] : []),
      ...shelves,
    ];

    // "Jump back in" — recently played, deduped by song (title + artist),
    // so alternate uploads of the same song collapse into one tile
    const recentSeen = new Set<string>();
    const recentTracks = recentRows
      .filter((t) => {
        const key = `${t.title.toLowerCase()}|${t.artist.name.toLowerCase()}`;
        if (recentSeen.has(key)) return false;
        recentSeen.add(key);
        return true;
      })
      .slice(0, 8)
      .map(trackDTO);

    const feed: HomeFeedDTO = { quickPicks, recentTracks, shelves: allShelves, likedCount };
    return NextResponse.json(feed);
  } catch (e) {
    console.error('GET /api/home failed', e);
    return NextResponse.json({ error: 'Failed to load home feed' }, { status: 502 });
  }
}
