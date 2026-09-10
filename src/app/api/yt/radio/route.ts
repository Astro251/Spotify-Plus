import { NextRequest, NextResponse } from 'next/server';
import { ytRadio } from '@/lib/ytmusic';
import { mergeLikedStates } from '@/lib/yt-shadow';

export const dynamic = 'force-dynamic';

/**
 * Song radio: the endless related-tracks mix for a seed videoId
 * (YouTube Music's autoplay mix, built from the seed's watch playlist).
 * Returns a queue-ready track list; the seed song is entry #1.
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!videoId) return NextResponse.json({ error: 'missing videoId' }, { status: 400 });
  const exclude = (req.nextUrl.searchParams.get('exclude') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const tracks = await ytRadio(videoId, { exclude });
    return NextResponse.json({ tracks: await mergeLikedStates(tracks) });
  } catch (e) {
    console.error('GET /api/yt/radio failed', e);
    return NextResponse.json({ error: 'radio failed' }, { status: 502 });
  }
}
