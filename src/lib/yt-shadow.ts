/**
 * Persistence for YouTube Music tracks ("shadow rows").
 *
 * When a YouTube Music track is liked or added to a local playlist, we persist
 * a Track/Album/Artist row in the local database so ALL existing machinery
 * (liked songs, playlists, queue, play counts, library) works unchanged.
 * The rows keep their `yt:` ids and serialized DTOs come back tagged
 * `source: 'youtube'` (see serialize.ts).
 */

import { db } from '@/lib/db';
import type { TrackDTO } from './types';
import { slugify } from './ytmusic';

function slugOrFallback(slug: string, fallbackSeed: string): string {
  const s = slug || `yt-${slugify(fallbackSeed)}`;
  return s.replace(/[^a-zA-Z0-9-_]/g, '-');
}

/** Create (once) local Artist/Album/Track rows for a YouTube Music track DTO. */
export async function ensureShadowTrack(t: TrackDTO): Promise<boolean> {
  if (!t.id.startsWith('yt:')) return false;
  try {
    const artistId = t.artist.id || `yt:ar:${slugify(t.artist.name)}`;
    const artistSlug = slugOrFallback(t.artist.slug || `yt-${slugify(t.artist.name)}`, t.artist.name);

    const artist =
      (await db.artist.findUnique({ where: { id: artistId } })) ??
      (await db.artist.findUnique({ where: { slug: artistSlug } })) ??
      (await db.artist.create({
        data: {
          id: artistId,
          slug: artistSlug,
          name: t.artist.name || 'Unknown artist',
          image: t.album.cover || '',
          bio: 'Artist',
          monthlyListeners: 0,
        },
      }).catch(async () =>
        db.artist.create({
          data: {
            id: artistId,
            slug: `${artistSlug}-${artistId.slice(-6)}`,
            name: t.artist.name || 'Unknown artist',
            image: t.album.cover || '',
            bio: 'Artist',
            monthlyListeners: 0,
          },
        })
      ));

    const albumId = t.album.id || `yt:al:single:${t.id.slice(3)}`;
    const albumSlug = slugOrFallback(t.album.slug || `yt-single-${t.id.slice(3)}`, t.album.title);

    const album =
      (await db.album.findUnique({ where: { id: albumId } })) ??
      (await db.album.findUnique({ where: { slug: albumSlug } })) ??
      (await db.album.create({
        data: {
          id: albumId,
          slug: albumSlug,
          title: t.album.title || t.title,
          cover: t.album.cover || '',
          accent: t.album.accent || '#535353',
          accentSoft: t.album.accentSoft || '#1c1c1c',
          year: t.album.year || new Date().getFullYear(),
          type: 'single',
          genre: '',
          description: 'Single',
          artistId: artist.id,
        },
      }).catch(async () =>
        db.album.create({
          data: {
            id: albumId,
            slug: `${albumSlug}-${albumId.slice(-6)}`,
            title: t.album.title || t.title,
            cover: t.album.cover || '',
            accent: t.album.accent || '#535353',
            accentSoft: t.album.accentSoft || '#1c1c1c',
            year: t.album.year || new Date().getFullYear(),
            type: 'single',
            genre: '',
            description: 'Single',
            artistId: artist.id,
          },
        })
      ));

    await db.track.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        slug: slugOrFallback(t.slug, t.title),
        title: t.title,
        file: t.file,
        duration: t.duration,
        number: t.number ?? 1,
        plays: t.plays ?? 0,
        liked: false,
        albumId: album.id,
        artistId: artist.id,
      },
      // only overwrite the duration when the DTO actually carries one
      update: { title: t.title, file: t.file, ...(t.duration > 0 ? { duration: t.duration } : {}) },
    });
    return true;
  } catch (e) {
    console.error('ensureShadowTrack failed', e);
    return false;
  }
}

/**
 * Overlay persisted liked state onto freshly-mapped YouTube Music track DTOs
 * (search results etc. show the correct heart state).
 */
export async function mergeLikedStates(tracks: TrackDTO[]): Promise<TrackDTO[]> {
  const ytIds = tracks.filter((t) => t.id.startsWith('yt:')).map((t) => t.id);
  if (!ytIds.length) return tracks;
  try {
    const rows = await db.track.findMany({ where: { id: { in: ytIds } }, select: { id: true, liked: true, plays: true } });
    const map = new Map(rows.map((r) => [r.id, r]));
    return tracks.map((t) => {
      const row = map.get(t.id);
      return row ? { ...t, liked: row.liked, plays: Math.max(t.plays, row.plays) } : t;
    });
  } catch {
    return tracks;
  }
}
