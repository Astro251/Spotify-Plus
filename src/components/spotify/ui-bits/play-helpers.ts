'use client';

import { usePlayer } from '@/lib/store/player';
import type { AlbumDetailDTO, ArtistDetailDTO, PlaylistDetailDTO, TrackDTO } from '@/lib/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json() as Promise<T>;
}

/** Fetch a playlist and start playing it. */
export async function playPlaylist(slug: string, startIndex = 0) {
  const p = await fetchJson<PlaylistDetailDTO>(`/api/playlists/${slug}`);
  usePlayer.getState().playTracks(p.tracks, startIndex, { id: `playlist:${p.slug}`, label: p.name });
}

/** Fetch an album and start playing it. */
export async function playAlbum(slug: string, startIndex = 0) {
  const a = await fetchJson<AlbumDetailDTO>(`/api/albums/${slug}`);
  usePlayer.getState().playTracks(a.tracks, startIndex, { id: `album:${a.slug}`, label: a.title });
}

/** Fetch an artist's top tracks and start playing them. */
export async function playArtist(slug: string, startIndex = 0) {
  const a = await fetchJson<ArtistDetailDTO>(`/api/artists/${slug}`);
  usePlayer.getState().playTracks(a.topTracks, startIndex, { id: `artist:${a.slug}`, label: a.name });
}

/** Fetch liked songs and start playing them. */
export async function playLiked(startIndex = 0) {
  const tracks = await fetchJson<TrackDTO[]>('/api/liked');
  usePlayer.getState().playTracks(tracks, startIndex, { id: 'liked', label: 'Liked Songs' });
}

/** Start an endless song radio seeded by a track (seed song plays first). */
export async function startRadio(track: TrackDTO) {
  const videoId = track.id.startsWith('yt:') ? track.id.slice(3) : null;
  if (!videoId) throw new Error('Cannot start a radio for this track');
  const res = await fetch(`/api/yt/radio?videoId=${encodeURIComponent(videoId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to start radio');
  const data = (await res.json()) as { tracks: TrackDTO[] };
  const tracks = data.tracks.length > 0 ? data.tracks : [track];
  usePlayer.getState().playTracks(tracks, 0, {
    id: `radio:${videoId}`,
    label: `${track.title} radio`,
  });
}
