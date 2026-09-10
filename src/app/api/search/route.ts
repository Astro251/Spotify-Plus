import { NextRequest, NextResponse } from 'next/server';
import { ytSearch } from '@/lib/ytmusic';
import { mergeLikedStates } from '@/lib/yt-shadow';
import type { SearchDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) {
    const empty: SearchDTO = { query: '', topResult: null, tracks: [], albums: [], artists: [], playlists: [] };
    return NextResponse.json(empty);
  }

  try {
    const dto = await ytSearch(q);
    dto.tracks = await mergeLikedStates(dto.tracks);
    return NextResponse.json(dto);
  } catch (e) {
    console.error('GET /api/search failed', e);
    return NextResponse.json({ error: 'Search failed' }, { status: 502 });
  }
}
