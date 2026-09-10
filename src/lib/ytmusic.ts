/**
 * Server-only YouTube Music client (music.youtube.com internal "Innertube" API).
 *
 * Fetches LIVE data from YouTube Music: search (songs/videos/artists/albums/
 * playlists), the home feed (new releases, trending), artist pages (top songs,
 * discography, about), albums, playlists, and track metadata for a bare videoId.
 *
 * Playback note: audio for YouTube Music tracks is streamed live through the
 * YouTube IFrame player in the browser (see lib/playback/yt-engine.ts). This
 * module resolves metadata only. For videos that forbid embedding, the app
 * falls back to /api/yt/stream/[videoId], which resolves a direct audio URL
 * via open-source tooling (yt-dlp + bgutil POT provider / Invidious) and
 * proxies it server-side. Every external entity is tagged `source: 'youtube'`.
 *
 * This module must only be imported from server code (API routes).
 */

import sharp from 'sharp';
import type {
  AlbumDTO,
  AlbumDetailDTO,
  ArtistDTO,
  ArtistDetailDTO,
  PlaylistDTO,
  PlaylistDetailDTO,
  SearchDTO,
  ShelfDTO,
  ShelfItem,
  TrackDTO,
} from './types';

/* ------------------------------ constants ------------------------------- */

const INNERTUBE_BASE = 'https://music.youtube.com/youtubei/v1';
const INNERTUBE_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
const CONTEXT = {
  context: {
    client: { clientName: 'WEB_REMIX', clientVersion: '1.20240401.01.00', hl: 'en', gl: 'US' },
  },
};
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const DEFAULT_ACCENT = { accent: '#535353', accentSoft: '#1c1c1c' };

/* ------------------------------ JSON utils ------------------------------ */

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === 'object' && v !== null && !Array.isArray(v);

function* walkDicts(o: unknown): Generator<Dict> {
  if (isDict(o)) {
    yield o;
    for (const v of Object.values(o)) yield* walkDicts(v);
  } else if (Array.isArray(o)) {
    for (const v of o) yield* walkDicts(v);
  }
}

/** Collect every value stored under `key` anywhere in the tree (e.g. all renderers of one kind). */
function collect<T = Dict>(o: unknown, key: string): T[] {
  const out: T[] = [];
  for (const d of walkDicts(o)) {
    const v = d[key];
    if (v !== undefined) out.push(v as T);
  }
  return out;
}

function findFirst(o: unknown, pred: (d: Dict) => string | undefined): string | undefined {
  for (const d of walkDicts(o)) {
    const r = pred(d);
    if (r) return r;
  }
  return undefined;
}

function findVideoId(o: unknown): string | undefined {
  return findFirst(o, (d) => {
    const we = d.watchEndpoint as Dict | undefined;
    return typeof we?.videoId === 'string' ? we.videoId : undefined;
  });
}

function findBrowseId(o: unknown): string | undefined {
  return findFirst(o, (d) => {
    const be = d.browseEndpoint as Dict | undefined;
    return typeof be?.browseId === 'string' ? be.browseId : undefined;
  });
}

function runsText(runs: unknown): string {
  if (!Array.isArray(runs)) return '';
  return runs.map((r) => (isDict(r) && typeof r.text === 'string' ? r.text : '')).join('');
}

function pickThumb(o: unknown): string | undefined {
  let best: { url: string; area: number } | undefined;
  for (const d of walkDicts(o)) {
    const th = d.thumbnails;
    if (Array.isArray(th)) {
      for (const t of th) {
        if (isDict(t) && typeof t.url === 'string' && typeof t.width === 'number' && typeof t.height === 'number') {
          const area = t.width * t.height;
          if (!best || area > best.area) best = { url: t.url, area };
        }
      }
    }
  }
  return best?.url;
}

/* ------------------------------- parsing -------------------------------- */

/** "1.8B plays" / "9.1B views" / "31.1M subscribers" → number */
export function parseCount(text: unknown): number {
  if (typeof text !== 'string') return 0;
  const m = /([\d.]+)\s*([KMB])?/i.exec(text.replace(/,/g, ''));
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return 0;
  const mult = m[2] ? { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()] ?? 1 : 1;
  return Math.round(n * mult);
}

/** "3:41" → 221 (seconds) */
export function parseDurationSec(text: unknown): number {
  if (typeof text !== 'string') return 0;
  const parts = text.trim().split(':').map((p) => parseInt(p, 10));
  if (!parts.length || parts.some((p) => Number.isNaN(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

const TIME_RUN_RE = /^\d{1,2}:[0-5]\d(?::[0-5]\d)?$/;

/**
 * Search/artist rows carry the track duration inside the subtitle runs
 * (e.g. "Daft Punk • One More Time • 5:21"). Extracts the last m:ss run.
 */
function durationFromRuns(runs: unknown[]): number {
  let last: string | undefined;
  for (const r of runs) {
    if (isDict(r) && typeof r.text === 'string' && TIME_RUN_RE.test(r.text.trim())) last = r.text.trim();
  }
  return last ? parseDurationSec(last) : 0;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'yt'
  );
}

/* ------------------------------- caches --------------------------------- */

const jsonCache = new Map<string, { exp: number; data: unknown }>();
const imageCache = new Map<string, { buf: Uint8Array; type: string }>();
const accentCache = new Map<string, { accent: string; accentSoft: string }>();
/** Metadata for videoIds we have already seen (warmed by every parse). */
const videoStash = new Map<string, RawItem>();

/* ------------------------------ innertube ------------------------------- */

async function innertube<T = Dict>(endpoint: string, body: Dict, ttlMs = 5 * 60_000): Promise<T> {
  const cacheKey = `${endpoint}:${JSON.stringify(body)}`;
  const hit = jsonCache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.data as T;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${INNERTUBE_BASE}/${endpoint}?key=${INNERTUBE_KEY}&prettyPrint=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ ...CONTEXT, ...body }),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`innertube ${endpoint} → HTTP ${res.status}`);
    const data = (await res.json()) as T;
    if (jsonCache.size > 200) jsonCache.clear();
    jsonCache.set(cacheKey, { exp: Date.now() + ttlMs, data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------- images --------------------------------- */

const IMG_HOST_ALLOW = [
  /\.ytimg\.com$/i,
  /\.googleusercontent\.com$/i,
  /\.ggpht\.com$/i,
  /\.youtube\.com$/i,
  /\.gstatic\.com$/i, // YTM artist_avatar placeholders (e.g. www.gstatic.com/youtube/media/ytm/images/...)
  /\.googlevideo\.com$/i,
];

export function proxiedImage(url: string | undefined): string {
  if (!url) return '';
  return `/api/yt/img?u=${encodeURIComponent(url)}`;
}

export async function ytImage(url: string): Promise<{ buf: Uint8Array; type: string } | null> {
  const hit = imageCache.get(url);
  if (hit) return hit;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !IMG_HOST_ALLOW.some((re) => re.test(parsed.hostname))) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 3_000_000) return null;
    if (imageCache.size > 150) imageCache.clear();
    const entry = { buf, type };
    imageCache.set(url, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Vibrant accent pair from a YouTube thumbnail (Spotify-style hero gradient). */
export async function ytAccent(url: string | undefined): Promise<{ accent: string; accentSoft: string }> {
  if (!url) return DEFAULT_ACCENT;
  const hit = accentCache.get(url);
  if (hit) return hit;
  const img = await ytImage(url);
  let result = DEFAULT_ACCENT;
  if (img) {
    try {
      // Downscale to a 10×10 grid and pick the "vibrant" quadrant:
      // mean of the brightest 25% of pixels (avoids black bars / dark edges).
      const { data, info } = await sharp(Buffer.from(img.buf))
        .removeAlpha()
        .resize(10, 10, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      const px: number[][] = [];
      for (let i = 0; i + 2 < data.length; i += info.channels) {
        px.push([data[i], data[i + 1], data[i + 2]]);
      }
      if (px.length) {
        const lum = (p: number[]) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
        const sorted = [...px].sort((a, b) => lum(a) - lum(b));
        const vibrant = sorted.slice(Math.floor(sorted.length * 0.75));
        const mean = (arr: number[][]) => arr.reduce<number[]>((acc, p) => acc.map((v, i) => v + p[i]), [0, 0, 0]).map((v) => v / arr.length);
        let [r, g, b] = mean(vibrant);
        // keep the accent lively but not neon
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (l < 60) {
          r = Math.min(255, r * 2.4);
          g = Math.min(255, g * 2.4);
          b = Math.min(255, b * 2.4);
        } else if (l > 180) {
          r *= 0.72;
          g *= 0.72;
          b *= 0.72;
        }
        const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
        const soft = (n: number) => Math.round(Math.max(36, Math.min(255, n * 0.4)));
        result = {
          accent: `#${hex(r)}${hex(g)}${hex(b)}`,
          accentSoft: `#${hex(soft(r))}${hex(soft(g))}${hex(soft(b))}`,
        };
      }
    } catch {
      result = DEFAULT_ACCENT;
    }
  }
  if (accentCache.size > 400) accentCache.clear();
  accentCache.set(url, result);
  return result;
}

/* ----------------------------- raw entities ----------------------------- */

export type RawKind = 'song' | 'video' | 'artist' | 'album' | 'playlist' | 'unknown';

export interface RawItem {
  kind: RawKind;
  videoId?: string;
  browseId?: string;
  title: string;
  subtitleRuns: unknown[];
  playsText?: string;
  durationText?: string;
  thumb?: string;
}

function classify(browseId?: string, videoId?: string): RawKind {
  if (browseId?.startsWith('UC')) return 'artist';
  if (browseId?.startsWith('MPREb') || browseId?.startsWith('MPSP')) return 'album';
  if (browseId?.startsWith('VL') || browseId?.startsWith('PL') || browseId?.startsWith('RD')) return 'playlist';
  if (browseId) return 'unknown';
  if (videoId) return 'song';
  return 'unknown';
}

/** First subtitle run often carries the entity kind: "Song"/"Album"/"Video"/… */
const KIND_WORDS: Record<string, RawKind> = {
  Song: 'song',
  Video: 'video',
  Album: 'album',
  Single: 'album',
  EP: 'album',
  Artist: 'artist',
  Playlist: 'playlist',
};

/**
 * Robust list-item classification. Songs can carry a *channel* browseId from
 * their artist subtitle link, so explicit signals come first:
 * playlistItemData / watch nav → song; browse nav → by prefix; then deep walks.
 */
function classifyListItem(r: Dict, kindWord?: string): RawKind {
  if (kindWord && KIND_WORDS[kindWord]) return KIND_WORDS[kindWord];
  const pid = (r.playlistItemData as Dict | undefined)?.videoId;
  if (typeof pid === 'string') return 'song';
  const nav = r.navigationEndpoint as Dict | undefined;
  const navWe = (nav?.watchEndpoint as Dict | undefined)?.videoId;
  if (typeof navWe === 'string') return 'song';
  const navBe = (nav?.browseEndpoint as Dict | undefined)?.browseId;
  if (typeof navBe === 'string') return classify(navBe, undefined);
  const vid = findVideoId(r);
  if (vid) return 'song';
  const be = findBrowseId(r);
  return classify(be, undefined);
}

function stashVideo(item: RawItem) {
  if (item.videoId && item.title) videoStash.set(item.videoId, item);
}

/** Unwrap + parse a shelf's `contents` (each item is `{musicResponsiveListItemRenderer:{…}}`). */
function shelfListItems(shelf: Dict): RawItem[] {
  const contents = Array.isArray(shelf.contents) ? (shelf.contents as unknown[]) : [];
  const out: RawItem[] = [];
  for (const c of contents) {
    if (!isDict(c)) continue;
    const lr = (c.musicResponsiveListItemRenderer as Dict | undefined) ?? c;
    const it = fromListItem(lr);
    if (it) out.push(it);
  }
  return out;
}

/** Collect a page's track items: playlist shelf first, then bare album-style list items. */
function collectTrackItems(d: Dict): RawItem[] {
  for (const shelf of collect<Dict>(d, 'musicPlaylistShelfRenderer')) {
    const items = shelfListItems(shelf).filter((i) => !!i.videoId);
    if (items.length) return items;
  }
  const out: RawItem[] = [];
  for (const lr of collect<Dict>(d, 'musicResponsiveListItemRenderer')) {
    const pid = (lr.playlistItemData as Dict | undefined)?.videoId;
    if (typeof pid !== 'string') continue;
    const it = fromListItem(lr);
    if (it?.videoId) out.push(it);
  }
  return out;
}

interface ParsedHeader {
  title: string;
  subtitleRuns: unknown[];
  /** e.g. the artist line on album/playlist pages (with UC navigation). */
  strapRuns: unknown[];
  secondSubtitle: string;
  description: string;
  listeners?: number;
  thumb?: string;
}

/** Unified page header parser (immersive + responsive header flavors). */
function parseHeader(d: Dict): ParsedHeader {
  const h =
    collect<Dict>(d, 'musicResponsiveHeaderRenderer')[0] ??
    collect<Dict>(d, 'musicImmersiveHeaderRenderer')[0] ??
    collect<Dict>(d, 'musicHeaderRenderer')[0] ??
    collect<Dict>(d, 'playlistHeaderRenderer')[0] ??
    {};
  const subtitleRuns = Array.isArray((h.subtitle as Dict | undefined)?.runs)
    ? ((h.subtitle as Dict).runs as unknown[])
    : [];
  const strapRuns = Array.isArray((h.straplineTextOne as Dict | undefined)?.runs)
    ? ((h.straplineTextOne as Dict).runs as unknown[])
    : [];
  let description = runsText((h.description as Dict | undefined)?.runs);
  if (!description) {
    const nested = (h.description as Dict | undefined)?.musicDescriptionShelfRenderer as Dict | undefined;
    if (isDict(nested)) description = runsText((nested.description as Dict | undefined)?.runs);
  }
  const mlc = h.monthlyListenerCount as Dict | undefined;
  const listeners = mlc ? parseCount(runsText(mlc.runs)) : undefined;
  return {
    title: runsText((h.title as Dict | undefined)?.runs),
    subtitleRuns,
    strapRuns,
    secondSubtitle: runsText((h.secondSubtitle as Dict | undefined)?.runs),
    description,
    listeners,
    thumb: pickThumb(h) ?? pickThumb(d),
  };
}

/** musicResponsiveListItemRenderer (search shelves, album/playlist track lists, top songs) */
function fromListItem(r: Dict): RawItem | null {
  const flex = Array.isArray(r.flexColumns) ? (r.flexColumns as unknown[]) : [];
  const colRuns = (i: number): unknown[] => {
    const c = flex[i] as Dict | undefined;
    const fc = c?.musicResponsiveListItemFlexColumnRenderer as Dict | undefined;
    const text = fc?.text as Dict | undefined;
    return Array.isArray(text?.runs) ? (text.runs as unknown[]) : [];
  };
  const title = runsText(colRuns(0));
  if (!title) return null;

  const fixed = Array.isArray(r.fixedColumns) ? (r.fixedColumns[0] as Dict | undefined) : undefined;
  const durRuns = ((fixed?.musicResponsiveListItemFixedColumnRenderer as Dict | undefined)?.text as Dict | undefined)?.runs;
  const durationText = runsText(durRuns) || undefined;

  const pid = (r.playlistItemData as Dict | undefined)?.videoId;
  const videoId = typeof pid === 'string' ? pid : findVideoId(r);
  const navBrowse = ((r.navigationEndpoint as Dict | undefined)?.browseEndpoint as Dict | undefined)?.browseId;
  const browseId = typeof navBrowse === 'string' ? navBrowse : findBrowseId(r);

  const playsText = runsText(colRuns(2)) || undefined;
  const subRuns1 = colRuns(1);
  const firstSubRun = subRuns1.length ? subRuns1[0] : undefined;
  const subKind =
    isDict(firstSubRun) && typeof firstSubRun.text === 'string' ? firstSubRun.text : undefined;
  return {
    kind: classifyListItem(r, subKind),
    videoId,
    browseId,
    title,
    subtitleRuns: colRuns(1),
    playsText: /play|view/i.test(playsText ?? '') ? playsText : undefined,
    durationText,
    thumb: pickThumb(r),
  };
}

/** musicTwoRowItemRenderer (home shelves, artist discography, moods) */
function fromTwoRow(t: Dict): RawItem | null {
  const title = runsText((t.title as Dict | undefined)?.runs);
  if (!title) return null;
  const nav = (t.navigationEndpoint ?? t.onTap) as Dict | undefined;
  const be = (nav?.browseEndpoint as Dict | undefined)?.browseId;
  const we = nav?.watchEndpoint as Dict | undefined;
  const wpe = nav?.watchPlaylistEndpoint as Dict | undefined;
  const browseId =
    typeof be === 'string' ? be : typeof wpe?.playlistId === 'string' ? (wpe.playlistId as string) : findBrowseId(t.title);
  const videoId = typeof we?.videoId === 'string' ? (we.videoId as string) : undefined;
  const subRuns = (t.subtitle as Dict | undefined)?.runs;
  return {
    kind: classify(browseId, videoId),
    videoId,
    browseId,
    title,
    subtitleRuns: Array.isArray(subRuns) ? (subRuns as unknown[]) : [],
    playsText: undefined,
    durationText: undefined,
    thumb: pickThumb(t),
  };
}

/** musicCardShelfRenderer (search top result) */
function fromCard(c: Dict): RawItem | null {
  const title = runsText((c.title as Dict | undefined)?.runs);
  if (!title) return null;
  const nav = (c.onTap ?? c.navigationEndpoint) as Dict | undefined;
  const be = (nav?.browseEndpoint as Dict | undefined)?.browseId;
  const we = nav?.watchEndpoint as Dict | undefined;
  const browseId = typeof be === 'string' ? be : findBrowseId(c);
  const videoId = typeof we?.videoId === 'string' ? (we.videoId as string) : findVideoId(c);
  const subRuns = (c.subtitle as Dict | undefined)?.runs;
  // "Song • Artist" / "Video • Artist" cards are tracks even when the card
  // also carries an artist browse id (e.g. auto-generated meme "artists").
  const subText = runsText(subRuns);
  const kindWord = (subText.split('•')[0] ?? '').trim().toLowerCase();
  const kind: RawKind =
    (kindWord === 'song' || kindWord === 'video') && videoId ? 'song' : classify(browseId, videoId);
  return {
    kind,
    videoId,
    browseId,
    title,
    subtitleRuns: Array.isArray(subRuns) ? (subRuns as unknown[]) : [],
    playsText: undefined,
    durationText: undefined,
    thumb: pickThumb(c),
  };
}

/* ------------------------------ DTO mappers ----------------------------- */

/**
 * Display-safe owner/creator name. The upstream catalog is never leaked into
 * the UI — editorial playlists map to our own brand, everything else keeps its
 * real creator name.
 */
function displayOwner(raw: string): string {
  const cleaned = raw.replace(/•/g, '').trim();
  if (!cleaned || /youtube|google/i.test(cleaned)) return 'Spotify';
  return cleaned;
}

/** Last segment of a "Kind • Creator" subtitle line, display-safe. */
function subtitleOwner(runs: unknown[]): string {
  const parts = runsText(runs).split('•');
  return displayOwner(parts[parts.length - 1] ?? '');
}

function artistRefFrom(runs: unknown[]): { id: string; slug: string; name: string } {
  for (const r of runs) {
    if (isDict(r)) {
      const be = ((r.navigationEndpoint as Dict | undefined)?.browseEndpoint as Dict | undefined)?.browseId;
      if (typeof be === 'string' && be.startsWith('UC')) {
        return { id: `yt:${be}`, slug: `yt-${be}`, name: typeof r.text === 'string' ? r.text : 'Unknown artist' };
      }
    }
  }
  const joined = runsText(runs);
  const name = joined.split('•')[0]?.trim() || 'Unknown artist';
  const s = slugify(name);
  return { id: `yt:ar:${s}`, slug: `yt-ar-${s}`, name };
}

/** Artist link from a page strapline (e.g. album header's artist line). */
function headerStrapArtist(strapRuns: unknown[]): { id: string; slug: string; name: string } | null {
  for (const r of strapRuns) {
    if (isDict(r)) {
      const be = ((r.navigationEndpoint as Dict | undefined)?.browseEndpoint as Dict | undefined)?.browseId;
      if (typeof be === 'string' && be.startsWith('UC')) {
        return { id: `yt:${be}`, slug: `yt-${be}`, name: typeof r.text === 'string' ? r.text : 'Artist' };
      }
    }
  }
  return null;
}

interface AlbumRefInput {
  id: string;
  slug: string;
  title: string;
  cover: string;
  accent: string;
  accentSoft: string;
  year: number;
}

export async function ytTrackDTO(
  item: RawItem,
  opts: { album?: AlbumRefInput; number?: number; durationOverride?: number } = {}
): Promise<TrackDTO | null> {
  const videoId = item.videoId;
  if (!videoId) return null;
  stashVideo(item);
  const accent = await ytAccent(item.thumb);
  const album: AlbumRefInput =
    opts.album ?? {
      id: `yt:al:single:${videoId}`,
      slug: `yt-single-${videoId}`,
      title: item.title,
      cover: proxiedImage(item.thumb),
      year: new Date().getFullYear(),
      ...accent,
    };
  return {
    id: `yt:${videoId}`,
    slug: `yt-${videoId}`,
    title: item.title,
    // Tier-2 relay (only used when the video forbids embedding)
    file: `/api/yt/stream/${videoId}`,
    duration:
      parseDurationSec(item.durationText) || durationFromRuns(item.subtitleRuns) || opts.durationOverride || 0,
    number: opts.number ?? 1,
    plays: parseCount(item.playsText),
    liked: false,
    album: {
      id: album.id,
      slug: album.slug,
      title: album.title,
      cover: album.cover || proxiedImage(item.thumb),
      accent: album.accent,
      accentSoft: album.accentSoft,
      year: album.year,
    },
    artist: artistRefFrom(item.subtitleRuns),
    source: 'youtube',
  };
}

export async function ytAlbumDTO(item: RawItem): Promise<AlbumDTO | null> {
  if (!item.browseId) return null;
  const accent = await ytAccent(item.thumb);
  const sub = runsText(item.subtitleRuns);
  const yearMatch = /(19|20)\d{2}/.exec(sub);
  const type = /single/i.test(sub) ? 'single' : /\bEP\b/i.test(sub) ? 'ep' : 'album';
  return {
    id: `yt:${item.browseId}`,
    slug: `yt-${item.browseId}`,
    title: item.title,
    cover: proxiedImage(item.thumb),
    accent: accent.accent,
    accentSoft: accent.accentSoft,
    year: yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear(),
    type,
    genre: '',
    description: '',
    artist: artistRefFrom(item.subtitleRuns),
    trackCount: 0,
    totalDuration: 0,
    plays: parseCount(item.playsText),
    source: 'youtube',
  };
}

export function ytArtistDTO(item: RawItem): ArtistDTO | null {
  if (!item.browseId?.startsWith('UC')) return null;
  const sub = runsText(item.subtitleRuns);
  return {
    id: `yt:${item.browseId}`,
    slug: `yt-${item.browseId}`,
    name: item.title,
    image: proxiedImage(item.thumb),
    bio: '',
    monthlyListeners: parseCount(sub),
    source: 'youtube',
  };
}

export function ytPlaylistDTO(item: RawItem): PlaylistDTO | null {
  if (!item.browseId) return null;
  stashVideo(item);
  return {
    id: `yt:${item.browseId}`,
    slug: `yt-${item.browseId}`,
    name: item.title,
    description: null,
    cover: proxiedImage(item.thumb) || null,
    coverFrom: null,
    coverTo: null,
    icon: null,
    owner: subtitleOwner(item.subtitleRuns),
    editable: false,
    trackCount: 0,
    totalDuration: 0,
    source: 'youtube',
  };
}

/** Pseudo-playlist for a bare song/video card (single track). */
export function ytSinglePlaylistDTO(item: RawItem): PlaylistDTO | null {
  if (!item.videoId) return null;
  stashVideo(item);
  return {
    id: `yt:single:${item.videoId}`,
    slug: `yt-single-${item.videoId}`,
    name: item.title,
    description: null,
    cover: proxiedImage(item.thumb) || null,
    coverFrom: null,
    coverTo: null,
    icon: null,
    owner: subtitleOwner(item.subtitleRuns),
    editable: false,
    trackCount: 1,
    totalDuration: 0,
    source: 'youtube',
  };
}

async function mapShelfItem(item: RawItem): Promise<ShelfItem | null> {
  switch (item.kind) {
    case 'album':
      return ytAlbumDTO(item);
    case 'artist':
      return ytArtistDTO(item);
    case 'playlist':
      return ytPlaylistDTO(item);
    case 'song':
    case 'video':
      return ytSinglePlaylistDTO(item);
    default:
      return null;
  }
}

/* ------------------------------- fetchers ------------------------------- */

/** Resolve metadata for a bare videoId via the `next` endpoint (used for pseudo entities). */
export async function nextVideoMeta(videoId: string): Promise<RawItem | null> {
  try {
    const d = await innertube('next', { videoId, isAudioOnly: true });
    const panel = collect<Dict>(d, 'playlistPanelVideoRenderer')[0];
    if (isDict(panel)) {
      const title = runsText((panel.title as Dict | undefined)?.runs);
      const byline =
        (panel.longBylineText as Dict | undefined)?.runs ?? (panel.shortBylineText as Dict | undefined)?.runs ?? [];
      const playsText = Array.isArray(byline)
        ? byline.map((r) => (isDict(r) ? String(r.text ?? '') : '')).find((t) => /views?|plays/i.test(t))
        : undefined;
      const lengthText = runsText((panel.lengthText as Dict | undefined)?.runs);
      return {
        kind: 'song',
        videoId,
        title: title || 'Track',
        subtitleRuns: Array.isArray(byline) ? (byline as unknown[]) : [],
        playsText,
        durationText: lengthText || undefined,
        thumb: pickThumb(panel),
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Song radio (endless related-tracks mix) seeded by a videoId — the same
 * autoplay mix YouTube Music builds for a song, mapped to TrackDTOs.
 * The first panel entry is the seed song itself.
 */
export async function ytRadio(videoId: string, opts: { exclude?: string[]; limit?: number } = {}): Promise<TrackDTO[]> {
  const d = await innertube('next', {
    videoId,
    playlistId: `RDAMVM${videoId}`,
    isAudioOnly: true,
    params: 'wAEB',
  });
  const exclude = new Set(opts.exclude ?? []);
  const seen = new Set<string>();
  const out: TrackDTO[] = [];
  for (const p of collect<Dict>(d, 'playlistPanelVideoRenderer')) {
    if (out.length >= (opts.limit ?? 50)) break;
    const we = (p.navigationEndpoint as Dict | undefined)?.watchEndpoint as Dict | undefined;
    const pid = (p.playlistItemData as Dict | undefined)?.videoId;
    const vid =
      typeof we?.videoId === 'string'
        ? (we.videoId as string)
        : typeof pid === 'string'
          ? pid
          : undefined;
    if (!vid || seen.has(vid) || exclude.has(vid)) continue;
    const title = runsText((p.title as Dict | undefined)?.runs);
    if (!title) continue;
    seen.add(vid);
    const byline = (p.shortBylineText as Dict | undefined)?.runs ?? (p.longBylineText as Dict | undefined)?.runs ?? [];
    const lengthRuns = (p.lengthText as Dict | undefined)?.runs;
    const lengthText = runsText(lengthRuns) || (p.lengthText as Dict | undefined)?.simpleText;
    const playsText = Array.isArray(byline)
      ? byline.map((r) => (isDict(r) ? String(r.text ?? '') : '')).find((t) => /views?|plays/i.test(t))
      : undefined;
    const item: RawItem = {
      kind: 'song',
      videoId: vid,
      browseId: undefined,
      title,
      subtitleRuns: Array.isArray(byline) ? (byline as unknown[]) : [],
      playsText,
      durationText: typeof lengthText === 'string' ? lengthText : undefined,
      thumb: pickThumb(p),
    };
    stashVideo(item);
    const dto = await ytTrackDTO(item);
    if (dto) out.push(dto);
  }
  return out;
}

async function mapTopResult(item: RawItem): Promise<SearchDTO['topResult']> {
  switch (item.kind) {
    case 'song':
    case 'video': {
      const t = await ytTrackDTO(item);
      return t ? { ...t, type: 'track' } : null;
    }
    case 'artist': {
      const a = ytArtistDTO(item);
      return a ? { ...a, type: 'artist' } : null;
    }
    case 'album': {
      const a = await ytAlbumDTO(item);
      return a ? { ...a, type: 'album' } : null;
    }
    case 'playlist': {
      const p = ytPlaylistDTO(item);
      return p ? { ...p, type: 'playlist' } : null;
    }
    default:
      return null;
  }
}

const SEARCH_SONGS_FILTER = 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D';

/** Podcast/episode uploads that surface as "videos" — not music. */
function isEpisodeItem(item: RawItem): boolean {
  const first = (runsText(item.subtitleRuns).split('•')[0] ?? '').trim().toLowerCase();
  if (first === 'episode' || first === 'podcast') return true;
  return /\bep(isode)?\s*\d+\b/i.test(item.title);
}

/** Live YouTube Music search, mapped into our SearchDTO shape. */
export async function ytSearch(query: string): Promise<SearchDTO> {
  // Songs-filtered search in parallel: song rows there carry real durations
  // ("Daft Punk • One More Time • 5:21") which the mixed search omits.
  const songsFilterPromise = innertube('search', { query, params: SEARCH_SONGS_FILTER })
    .then((d) => d as Dict | null)
    .catch(() => null);
  const d = await innertube('search', { query });

  let topResult: SearchDTO['topResult'] = null;
  const card = collect<Dict>(d, 'musicCardShelfRenderer')[0];
  if (isDict(card)) {
    const item = fromCard(card);
    if (item) topResult = await mapTopResult(item);
  }

  /* Collect items from BOTH layouts:
     - shelf layout (filtered searches): musicShelfRenderer with titled buckets
     - flat layout (mixed search): one itemSectionRenderer per result        */
  const raw: { item: RawItem; shelfTitle: string }[] = [];
  for (const shelf of collect<Dict>(d, 'musicShelfRenderer')) {
    const shelfTitle = runsText((shelf.title as Dict | undefined)?.runs).toLowerCase();
    for (const it of shelfListItems(shelf)) raw.push({ item: it, shelfTitle });
  }
  for (const isr of collect<Dict>(d, 'itemSectionRenderer')) {
    const contents = Array.isArray(isr.contents) ? (isr.contents as unknown[]) : [];
    for (const c of contents) {
      const lr = isDict(c) ? (c.musicResponsiveListItemRenderer as Dict | undefined) : undefined;
      if (isDict(lr)) {
        const it = fromListItem(lr);
        if (it) raw.push({ item: it, shelfTitle: '' });
      }
    }
  }

  const songs: RawItem[] = [];
  const videos: RawItem[] = [];
  const artists: RawItem[] = [];
  const albums: RawItem[] = [];
  const playlists: RawItem[] = [];
  for (const { item, shelfTitle } of raw) {
    const asVideo = shelfTitle.includes('video') && (item.kind === 'song' || item.kind === 'video');
    switch (item.kind) {
      case 'song':
        if (asVideo) videos.push(item);
        else songs.push(item);
        break;
      case 'video':
        videos.push(item);
        break;
      case 'artist':
        artists.push(item);
        break;
      case 'album':
        albums.push(item);
        break;
      case 'playlist':
        /* Channel-backed "playlists" (UC ids) have no browsable track list. */
        if (/^(VL|PL|RD)/.test(item.browseId ?? '')) playlists.push(item);
        break;
      default:
        break;
    }
  }

  // Songs first (canonical topic uploads), then video uploads — user/VEVO
  // uploads of the same tracks often behave differently for embedding, so
  // keeping both improves playback odds and alternate resolution. Podcast
  // episodes are dropped.
  const musicVideos = videos.filter((v) => !isEpisodeItem(v));
  const trackItems = [...songs.slice(0, 9), ...musicVideos.slice(0, 6)];
  const durationMap = new Map<string, number>();
  const songsFilter = await songsFilterPromise;
  if (songsFilter) {
    for (const shelf of collect<Dict>(songsFilter, 'musicShelfRenderer')) {
      for (const it of shelfListItems(shelf)) {
        if (!it.videoId) continue;
        const dur = parseDurationSec(it.durationText) || durationFromRuns(it.subtitleRuns);
        if (dur > 0) durationMap.set(it.videoId, dur);
      }
    }
  }
  const tracks = (
    await Promise.all(
      trackItems.map((i) => ytTrackDTO(i, { durationOverride: i.videoId ? durationMap.get(i.videoId) : undefined }))
    )
  ).filter((t): t is TrackDTO => t !== null);
  const albumDtos = (await Promise.all(albums.slice(0, 8).map(ytAlbumDTO))).filter((a): a is AlbumDTO => a !== null);
  const artistDtos = artists
    .slice(0, 8)
    .map(ytArtistDTO)
    .filter((a): a is ArtistDTO => a !== null);
  const playlistDtos = playlists
    .slice(0, 8)
    .map(ytPlaylistDTO)
    .filter((p): p is PlaylistDTO => p !== null);

  if (!topResult && tracks.length) topResult = { ...tracks[0], type: 'track' };
  if (!topResult && artistDtos.length) topResult = { ...artistDtos[0], type: 'artist' };
  if (!topResult && playlistDtos.length) topResult = { ...playlistDtos[0], type: 'playlist' };
  if (!topResult && albumDtos.length) topResult = { ...albumDtos[0], type: 'album' };

  return { query, topResult, tracks, albums: albumDtos, artists: artistDtos, playlists: playlistDtos };
}

/** Live YouTube Music home shelves (new releases, trending…). */
export async function ytHome(): Promise<ShelfDTO[]> {
  const d = await innertube('browse', { browseId: 'FEmusic_home' }, 15 * 60_000);
  const shelves: ShelfDTO[] = [];
  const shelfSlugs = new Set<string>();
  for (const c of collect<Dict>(d, 'musicCarouselShelfRenderer')) {
    const title = runsText(
      (((c.header as Dict | undefined)?.musicCarouselShelfBasicHeaderRenderer as Dict | undefined)?.title as Dict | undefined)?.runs
    );
    if (!title) continue;
    const contents = Array.isArray(c.contents) ? (c.contents as unknown[]) : [];
    const rawItems: RawItem[] = [];
    for (const content of contents) {
      if (!isDict(content)) continue;
      const twoRow = content.musicTwoRowItemRenderer as Dict | undefined;
      if (isDict(twoRow)) {
        const it = fromTwoRow(twoRow);
        if (it) rawItems.push(it);
        continue;
      }
      const listItem = content.musicResponsiveListItemRenderer as Dict | undefined;
      if (isDict(listItem)) {
        const it = fromListItem(listItem);
        if (it) rawItems.push(it);
      }
    }
    if (!rawItems.length) continue;
    const items = (
      await Promise.all(rawItems.slice(0, 12).map(mapShelfItem))
    ).filter((i): i is ShelfItem => i !== null);
    // YouTube home shelves occasionally repeat the same entity — dedupe by id
    const seen = new Set<string>();
    const unique = items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
    // …and the same shelf TITLE twice (e.g. "Take it easy" in two slots)
    const slug = slugify(title);
    if (!unique.length || shelfSlugs.has(slug)) continue;
    shelfSlugs.add(slug);
    shelves.push({ id: `yt-home-${slug}`, title, items: unique });
  }
  return shelves;
}

/** Live artist page: top songs, discography, about. */
export async function ytArtist(slug: string): Promise<ArtistDetailDTO | null> {
  const browseId = slug.replace(/^yt[-:]/, '');
  if (!browseId.startsWith('UC')) {
    const name = decodeURIComponent(slug.replace(/^yt-ar-/, '').replace(/^yt[-:]/, ''));
    return ytArtistByName(name);
  }
  const d = await innertube('browse', { browseId }, 15 * 60_000);
  const header = parseHeader(d);
  const name = header.title || 'Artist';
  const strapline = runsText(header.subtitleRuns);

  // About / bio (header description or About shelf)
  let bio = header.description;
  if (!bio) {
    const descShelf = collect<Dict>(d, 'musicDescriptionShelfRenderer')[0];
    bio = runsText((descShelf?.description as Dict | undefined)?.runs);
  }
  if (bio.length > 900) bio = `${bio.slice(0, 900)}…`;

  // Top songs: first shelf whose items carry videoIds
  const topTracks: TrackDTO[] = [];
  for (const shelf of collect<Dict>(d, 'musicShelfRenderer')) {
    const items = shelfListItems(shelf).filter((i) => !!i.videoId);
    if (items.length >= 3) {
      const mapped = (
        await Promise.all(items.slice(0, 10).map((i, idx) => ytTrackDTO(i, { number: idx + 1 })))
      ).filter((t): t is TrackDTO => t !== null);
      topTracks.push(...mapped);
      break;
    }
  }

  // Discography: carousel shelves with album entities
  const albumItems: RawItem[] = [];
  for (const c of collect<Dict>(d, 'musicCarouselShelfRenderer')) {
    const contents = Array.isArray(c.contents) ? (c.contents as unknown[]) : [];
    for (const content of contents) {
      const twoRow = isDict(content) ? (content.musicTwoRowItemRenderer as Dict | undefined) : undefined;
      if (isDict(twoRow)) {
        const it = fromTwoRow(twoRow);
        if (it && it.kind === 'album') albumItems.push(it);
      }
    }
  }
  const albums = (
    await Promise.all(albumItems.slice(0, 12).map(ytAlbumDTO))
  ).filter((a): a is AlbumDTO => a !== null);

  return {
    id: `yt:${browseId}`,
    slug: `yt-${browseId}`,
    name,
    image: proxiedImage(header.thumb),
    bio: bio || 'Artist',
    monthlyListeners: header.listeners ?? parseCount(strapline),
    topTracks,
    albums,
    source: 'youtube',
  };
}

async function ytArtistByName(name: string): Promise<ArtistDetailDTO | null> {
  try {
    const d = await innertube('search', { query: name, params: 'EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D' });
    for (const shelf of collect<Dict>(d, 'musicShelfRenderer')) {
      const contents = Array.isArray(shelf.contents) ? (shelf.contents as unknown[]) : [];
      for (const c of contents) {
        if (!isDict(c)) continue;
        const it = fromListItem(c as Dict);
        if (it?.browseId?.startsWith('UC')) return ytArtist(`yt-${it.browseId}`);
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Live album page with its real track list. */
export async function ytAlbum(slug: string): Promise<AlbumDetailDTO | null> {
  const browseId = slug.replace(/^yt[-:]/, '');
  if (browseId.startsWith('single-')) return ytSingleAlbum(browseId.replace('single-', ''));
  if (!browseId.startsWith('MPREb') && !browseId.startsWith('MPSP')) return null;
  const d = await innertube('browse', { browseId }, 15 * 60_000);
  const header = parseHeader(d);
  const title = header.title || 'Album';
  const sub = runsText(header.subtitleRuns);
  const yearMatch = /(19|20)\d{2}/.exec(sub);
  const type = /single/i.test(sub) ? 'single' : /\bEP\b/i.test(sub) ? 'ep' : 'album';
  const accent = await ytAccent(header.thumb);

  const albumRef: AlbumRefInput = {
    id: `yt:${browseId}`,
    slug: `yt-${browseId}`,
    title,
    cover: proxiedImage(header.thumb),
    accent: accent.accent,
    accentSoft: accent.accentSoft,
    year: yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear(),
  };

  const items = collectTrackItems(d);
  const tracks = (
    await Promise.all(items.map((i, idx) => ytTrackDTO(i, { album: albumRef, number: idx + 1 })))
  ).filter((t): t is TrackDTO => t !== null);

  // Artist: strapline link first, then first track's artist, then subtitle text
  const artist =
    headerStrapArtist(header.strapRuns) ?? tracks[0]?.artist ?? artistRefFrom(header.subtitleRuns);
  return {
    id: albumRef.id,
    slug: albumRef.slug,
    title,
    cover: albumRef.cover,
    accent: albumRef.accent,
    accentSoft: albumRef.accentSoft,
    year: albumRef.year,
    type,
    genre: '',
    description: header.description,
    artist,
    trackCount: tracks.length,
    totalDuration: tracks.reduce((s, t) => s + t.duration, 0),
    plays: tracks.reduce((s, t) => s + t.plays, 0),
    tracks,
    source: 'youtube',
  };
}

/** Single-track "album" for synth singles (go-to-album on a YT song). */
export async function ytSingleAlbum(videoId: string): Promise<AlbumDetailDTO | null> {
  const item = videoStash.get(videoId) ?? (await nextVideoMeta(videoId));
  if (!item) return null;
  const track = await ytTrackDTO(item);
  if (!track) return null;
  return {
    id: track.album.id,
    slug: track.album.slug,
    title: track.title,
    cover: track.album.cover,
    accent: track.album.accent,
    accentSoft: track.album.accentSoft,
    year: track.album.year,
    type: 'single',
    genre: '',
    description: 'Single',
    artist: track.artist,
    trackCount: 1,
    totalDuration: track.duration,
    plays: track.plays,
    tracks: [track],
    source: 'youtube',
  };
}

/** Live playlist page (VL/PL/RD ids). */
export async function ytPlaylist(slug: string): Promise<PlaylistDetailDTO | null> {
  const browseId = slug.replace(/^yt[-:]/, '');
  if (browseId.startsWith('single-')) return ytSingle(browseId.replace('single-', ''));
  const d = await innertube('browse', { browseId }, 15 * 60_000);
  const header = parseHeader(d);
  const name = header.title || 'Playlist';
  const accent = await ytAccent(header.thumb);

  const items = collectTrackItems(d).slice(0, 50);
  const tracks = (
    await Promise.all(items.map((i, idx) => ytTrackDTO(i, { number: idx + 1 })))
  ).filter((t): t is TrackDTO => t !== null);

  const owner = displayOwner(runsText(header.strapRuns));
  return {
    id: `yt:${browseId}`,
    slug: `yt-${browseId}`,
    name,
    description: header.description || null,
    cover: proxiedImage(header.thumb) || tracks[0]?.album.cover || null,
    coverFrom: accent.accentSoft,
    coverTo: null,
    icon: null,
    owner,
    editable: false,
    trackCount: tracks.length,
    totalDuration: tracks.reduce((s, t) => s + t.duration, 0),
    tracks,
    source: 'youtube',
  };
}

/** Pseudo-playlist containing a single song (home "song" cards). */
export async function ytSingle(videoId: string): Promise<PlaylistDetailDTO | null> {
  const item = videoStash.get(videoId) ?? (await nextVideoMeta(videoId));
  if (!item) return null;
  const track = await ytTrackDTO(item);
  if (!track) return null;
  return {
    id: `yt:single:${videoId}`,
    slug: `yt-single-${videoId}`,
    name: item.title,
    description: null,
    cover: track.album.cover,
    coverFrom: track.album.accentSoft,
    coverTo: null,
    icon: null,
    owner: track.artist.name || 'Spotify',
    editable: false,
    trackCount: 1,
    totalDuration: track.duration,
    tracks: [track],
    source: 'youtube',
  };
}

/** Current cache stats (diagnostics). */
export function ytStats() {
  return {
    json: jsonCache.size,
    images: imageCache.size,
    accents: accentCache.size,
    stash: videoStash.size,
  };
}
