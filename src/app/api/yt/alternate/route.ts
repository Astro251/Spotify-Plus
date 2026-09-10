import { NextRequest, NextResponse } from 'next/server';
import { ytSearch } from '@/lib/ytmusic';

export const dynamic = 'force-dynamic';

/**
 * Alternate-upload resolver.
 *
 * Most official music uploads (VEVO / label "Topic" channels and their
 * Content-ID matched re-uploads) disable iframe embedding (error 150).
 * When that happens, the client asks this endpoint for OTHER uploads of
 * the same song — YouTube Music search surfaces multiple videoIds
 * (remasters, live takes, lyric uploads, user uploads) and some of them
 * allow embedding. The client then plays the embeddable alternate.
 */

const NOISE =
  /\b(official|video|audio|lyrics?|hq|hd|mv|m\/v|remaster(?:ed)?|radio edit|full album|topic|visualizer|version|feat\.?|ft\.?)\b/gi;

function normTitle(t: string): string {
  return t
    .replace(NOISE, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

const NON_SONG = /(reaction|review|podcast|interview|hearing|reacting|explained|documentary|talking|story|episode)/i;

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title');
  const artist = req.nextUrl.searchParams.get('artist');
  const exclude = (req.nextUrl.searchParams.get('exclude') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!title) return NextResponse.json({ error: 'missing title' }, { status: 400 });

  try {
    const query = `${title} ${artist ?? ''}`.trim();
    const results = await ytSearch(query);
    const norm = normTitle(title);
    const pool = [...results.tracks];
    // the search top result (often the canonical official video) is the
    // best alternate candidate when it is a track
    if (results.topResult?.type === 'track') pool.unshift(results.topResult);
    const ranked = pool
      .filter((t) => t.source === 'youtube')
      .map((t) => {
        const videoId = t.id.replace(/^yt:/, '');
        return { videoId, title: t.title, duration: t.duration, artist: t.artist.name };
      })
      .filter((t) => !exclude.includes(t.videoId) && !NON_SONG.test(t.title))
      .map((t) => {
        const tn = normTitle(t.title);
        const score = tn === norm ? 0 : tn.includes(norm) || norm.includes(tn) ? 1 : 2;
        return { ...t, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 6);
    return NextResponse.json({ alternates: ranked });
  } catch (e) {
    console.error('GET /api/yt/alternate failed', e);
    return NextResponse.json({ alternates: [] }, { status: 200 });
  }
}
