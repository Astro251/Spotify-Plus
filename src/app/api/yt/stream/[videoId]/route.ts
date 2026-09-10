import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Tier-2 audio relay for YouTube Music tracks that forbid iframe embedding
 * (player error 101/150). The browser's <audio> element points at
 * `/api/yt/stream/{videoId}` and this route:
 *   1. resolves a direct audio stream URL using open-source tooling:
 *      - yt-dlp (https://github.com/yt-dlp/yt-dlp) driven with the
 *        bgutil-ytdlp-pot-provider (https://github.com/Brainicism/
 *        bgutil-ytdlp-pot-provider, running on 127.0.0.1:4416) to mint
 *        proof-of-origin tokens,
 *      - falling back to public Invidious instances (open-source YouTube
 *        front-ends) when their /api/v1/videos endpoint is reachable.
 *   2. proxies the upstream googlevideo stream back to the client with
 *      HTTP Range support so seeking works.
 *
 * When both resolvers are unavailable (datacenter IP bot-blocks, dead
 * instances) this returns 503 quickly — the client then skips the track.
 */

interface ResolvedStream {
  url: string;
  mime: string;
  exp: number;
}

const streamCache = new Map<string, ResolvedStream>();
const YTDLP_CANDIDATES = [
  process.env.YTDLP_PATH,
  '/home/z/.local/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
  '/usr/bin/yt-dlp',
].filter((p): p is string => Boolean(p));
const STREAM_TTL = 30 * 60_000; // resolved URLs live ~6h; refresh every 30min
const DEAD_COOLDOWN = 10 * 60_000;
let deadUntil = 0;
let inflight: Promise<ResolvedStream | null> | null = null;
let invidiousCandidates: string[] | null = null;
let invidiousListFetched = 0;

function ytdlpBinary(): string | null {
  for (const c of YTDLP_CANDIDATES) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function runYtDlp(videoId: string, timeoutMs: number): Promise<string | null> {
  const bin = ytdlpBinary();
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve) => {
    const args = [
      '--js-runtimes', 'node',
      '--extractor-args', 'youtube:player_client=web;player_skip=webpage,configs',
      '-f', 'bestaudio[ext=m4a]/bestaudio',
      '--get-url', '--no-warnings', '--no-progress', '--quiet',
      `https://music.youtube.com/watch?v=${videoId}`,
    ];
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const finish = (url: string | null) => {
      child.kill('SIGKILL');
      resolve(url);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const url = out.trim().split('\n').filter((l) => l.startsWith('http'))[0];
      finish(url && code === 0 ? url : null);
    });
  });
}

interface InvidiousVideo {
  adaptiveFormats?: Array<{ itag?: string; url?: string; type?: string }>;
  error?: string;
}

async function fetchInvidiousList(): Promise<string[]> {
  const now = Date.now();
  if (invidiousCandidates) return invidiousCandidates;
  if (now - invidiousListFetched < 30 * 60_000) return [];
  invidiousListFetched = now;
  try {
    const res = await fetch('https://api.invidious.io/instances.json?sort_by=health', {
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<[string, { type?: string }]>;
    invidiousCandidates = data
      .filter(([, info]) => info.type === 'https')
      .map(([name]) => `https://${name}`)
      .slice(0, 4);
  } catch {
    invidiousCandidates = [];
  }
  return invidiousCandidates ?? [];
}

async function invidiousResolve(videoId: string): Promise<ResolvedStream | null> {
  const instances = await fetchInvidiousList();
  for (const inst of instances) {
    try {
      const res = await fetch(`${inst}/api/v1/videos/${videoId}`, {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as InvidiousVideo;
      const audio = (data.adaptiveFormats ?? []).find(
        (f) => f.url && (f.itag === '140' || (f.type ?? '').includes('audio/mp4'))
      );
      if (audio?.url) return { url: audio.url, mime: 'audio/mp4', exp: Date.now() + STREAM_TTL };
    } catch {
      /* try next instance */
    }
  }
  return null;
}

async function resolveStream(videoId: string): Promise<ResolvedStream | null> {
  const hit = streamCache.get(videoId);
  if (hit && hit.exp > Date.now()) return hit;

  if (Date.now() < deadUntil) return null; // all resolvers recently failed
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // 1) yt-dlp + bgutil POT provider (needs the mini-service on :4416)
      const url = await runYtDlp(videoId, 12_000);
      if (url) {
        const resolved: ResolvedStream = { url, mime: 'audio/mp4', exp: Date.now() + STREAM_TTL };
        streamCache.set(videoId, resolved);
        if (streamCache.size > 200) {
          const oldest = streamCache.keys().next().value;
          if (typeof oldest === 'string') streamCache.delete(oldest);
        }
        return resolved;
      }
      // 2) public Invidious instances
      const viaInv = await invidiousResolve(videoId);
      if (viaInv) {
        streamCache.set(videoId, viaInv);
        return viaInv;
      }
      deadUntil = Date.now() + DEAD_COOLDOWN;
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function videoIdFromParam(raw: string): string | null {
  const id = decodeURIComponent(raw);
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

async function proxy(req: NextRequest, videoId: string, head: boolean): Promise<Response> {
  const stream = await resolveStream(videoId);
  if (!stream) {
    return NextResponse.json(
      { error: 'stream_unavailable', detail: 'No working resolver right now (YouTube bot-blocks the server IP).' },
      { status: 503 }
    );
  }
  try {
    const range = req.headers.get('range');
    const upstream = await fetch(stream.url, {
      headers: range ? { Range: range } : {},
      redirect: 'follow',
      cache: 'no-store',
    });
    const headers = new Headers();
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Type', stream.mime);
    const len = upstream.headers.get('content-length');
    const cr = upstream.headers.get('content-range');
    if (len) headers.set('Content-Length', len);
    if (cr) headers.set('Content-Range', cr);
    headers.set('Cache-Control', 'no-store');
    return new Response(head ? null : upstream.body, { status: upstream.status, headers });
  } catch (e) {
    console.error('stream proxy failed', e);
    return NextResponse.json({ error: 'proxy_failed' }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ videoId: string }> }) {
  const { videoId: raw } = await ctx.params;
  const videoId = videoIdFromParam(raw);
  if (!videoId) return NextResponse.json({ error: 'bad videoId' }, { status: 400 });
  return proxy(req, videoId, false);
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ videoId: string }> }) {
  const { videoId: raw } = await ctx.params;
  const videoId = videoIdFromParam(raw);
  if (!videoId) return NextResponse.json({ error: 'bad videoId' }, { status: 400 });
  return proxy(req, videoId, true);
}
