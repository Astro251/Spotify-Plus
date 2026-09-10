import { NextRequest, NextResponse } from 'next/server';
import { ytImage } from '@/lib/ytmusic';

export const dynamic = 'force-dynamic';

/**
 * Proxy for YouTube thumbnail/cover images.
 * The browser never talks to ytimg.com directly — everything flows through
 * this cached server route (works regardless of client network).
 */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u');
  if (!u) return NextResponse.json({ error: 'Missing u param' }, { status: 400 });
  try {
    const img = await ytImage(u);
    if (!img) return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(img.buf), {
      headers: {
        'Content-Type': img.type,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (e) {
    console.error('GET /api/yt/img failed', e);
    return NextResponse.json({ error: 'Image proxy failed' }, { status: 502 });
  }
}
