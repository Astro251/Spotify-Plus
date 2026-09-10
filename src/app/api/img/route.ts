import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BLOCKED_HOST_RE =
  /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.internal$)/i;

/**
 * Generic https image proxy for user-supplied cover URLs (the YT-specific
 * /api/yt/img keeps its own host allowlist). Guards: https-only, no
 * private/loopback hosts, image/* content type, 3 MB cap, 6 s timeout.
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return NextResponse.json({ error: 'Missing u param' }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'https:') return NextResponse.json({ error: 'Only https URLs are allowed' }, { status: 400 });
  if (BLOCKED_HOST_RE.test(parsed.hostname)) {
    return NextResponse.json({ error: 'Host not allowed' }, { status: 403 });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(parsed.toString(), {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SpotifyClone/1.0)' },
    });
    clearTimeout(timer);
    if (!res.ok) return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return NextResponse.json({ error: 'Not an image' }, { status: 415 });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 3_000_000) return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    return new NextResponse(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    console.error('GET /api/img failed', e);
    return NextResponse.json({ error: 'Image proxy failed' }, { status: 502 });
  }
}
