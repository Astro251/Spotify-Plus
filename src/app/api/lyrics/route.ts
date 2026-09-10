import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { LyricsDTO, LyricLine } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UA = 'SpotifyCloneWebPlayer/1.0 (https://example.com)';
const TIMEOUT_MS = 6000;

interface LrcLibHit {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

/** Parse an LRC string ("[mm:ss.xx] line") into sorted LyricLine[]. */
function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    // collect every [mm:ss.xx] prefix on the line (multi-timestamp lines)
    const stamps: number[] = [];
    let rest = raw.trim();
    const re = /^\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
    while (true) {
      const m = rest.match(re);
      if (!m) break;
      const whole = Number(m[1]);
      const sec = Number(m[2]);
      const fracRaw = m[3] ?? '0';
      const frac = Number(fracRaw) / Math.pow(10, fracRaw.length);
      stamps.push(whole * 60 + sec + frac);
      rest = rest.slice(m[0].length).trim();
    }
    if (!stamps.length) continue;
    for (const time of stamps) out.push({ time, text: rest });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Plain lyrics (no timestamps) → pseudo-lines for scrollable display. */
function parsePlain(plain: string): LyricLine[] {
  return plain
    .split(/\r?\n/)
    .map((text) => text.trim())
    .filter((t) => t.length > 0)
    .map((text) => ({ time: -1, text }));
}

function hitToLines(hit: LrcLibHit): { lines: LyricLine[]; synced: boolean } {
  if (hit.instrumental) return { lines: [], synced: false };
  if (hit.syncedLyrics) {
    const lines = parseLrc(hit.syncedLyrics).filter((l) => l.text.length > 0);
    if (lines.length) return { lines, synced: true };
  }
  if (hit.plainLyrics) {
    const lines = parsePlain(hit.plainLyrics);
    if (lines.length) return { lines, synced: false };
  }
  return { lines: [], synced: false };
}

async function lrclib(path: string): Promise<unknown> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://lrclib.net${path}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ac.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * GET /api/lyrics?id=&title=&artist=&duration=&album=
 * Serves cached lyrics from the DB, else resolves from LRCLIB
 * (exact match first, then search) and caches the result.
 * 404 when no lyrics exist for the track.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const trackId = sp.get('id');
  const title = sp.get('title');
  const artist = sp.get('artist');
  const duration = Number(sp.get('duration') ?? 0);
  const album = sp.get('album') ?? undefined;
  void album;

  if (!trackId || !title || !artist) {
    return NextResponse.json({ error: 'id, title and artist are required' }, { status: 400 });
  }

  // 1. cache (positive hits serve forever; negative hits for 24h)
  try {
    const cached = await db.lyrics.findUnique({ where: { trackId } });
    if (cached) {
      const lines = JSON.parse(cached.lines) as LyricLine[];
      const negative = !lines.length && !cached.instrumental;
      const fresh = Date.now() - cached.fetchedAt.getTime() < 24 * 60 * 60_000;
      if (lines.length || cached.instrumental || (negative && fresh)) {
        const dto: LyricsDTO = {
          trackId,
          synced: cached.synced,
          instrumental: cached.instrumental,
          lines,
        };
        return NextResponse.json(dto);
      }
    }
  } catch {
    /* fall through to live fetch */
  }

  // 2. exact match (with duration for correctness)
  let hit: LrcLibHit | null = null;
  const exact = (await lrclib(
    `/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}${
      duration > 0 ? `&duration=${Math.round(duration)}` : ''
    }`
  )) as LrcLibHit | null;
  if (exact && (exact.syncedLyrics || exact.plainLyrics || exact.instrumental)) hit = exact;

  // 3. search fallback — prefer synced hits, then closest duration
  if (!hit) {
    const results = (await lrclib(
      `/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`
    )) as LrcLibHit[] | null;
    if (Array.isArray(results) && results.length) {
      const usable = results.filter((r) => r.syncedLyrics || r.plainLyrics);
      usable.sort((a, b) => {
        const sa = a.syncedLyrics ? 1 : 0;
        const sb = b.syncedLyrics ? 1 : 0;
        if (sa !== sb) return sb - sa;
        if (duration > 0 && a.duration && b.duration) {
          return Math.abs(a.duration - duration) - Math.abs(b.duration - duration);
        }
        return 0;
      });
      hit = usable[0] ?? null;
    }
  }

  if (!hit) {
    // negative-cache short absence so we don't hammer LRCLIB per open
    try {
      await db.lyrics.upsert({
        where: { trackId },
        create: { trackId, synced: false, instrumental: false, lines: '[]' },
        update: { fetchedAt: new Date() },
      });
    } catch {
      /* cache write best-effort */
    }
    return NextResponse.json({ error: 'No lyrics found' }, { status: 404 });
  }

  const { lines, synced } = hitToLines(hit);
  if (!lines.length && !hit.instrumental) {
    return NextResponse.json({ error: 'No lyrics found' }, { status: 404 });
  }

  // 4. cache and return
  const instrumental = !!hit.instrumental;
  try {
    await db.lyrics.upsert({
      where: { trackId },
      create: { trackId, synced, instrumental, lines: JSON.stringify(lines) },
      update: { synced, instrumental, lines: JSON.stringify(lines), fetchedAt: new Date() },
    });
  } catch {
    /* cache write best-effort */
  }

  const dto: LyricsDTO = { trackId, synced, instrumental, lines };
  return NextResponse.json(dto);
}
