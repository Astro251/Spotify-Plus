import type { Album, Artist, Playlist, Track } from '@prisma/client';
import type { AlbumDTO, ArtistDTO, PlaylistDTO, TrackDTO } from '@/lib/types';

type TrackFull = Track & { album: Album; artist: Artist };
type AlbumFull = Album & { artist: Artist; tracks: Pick<Track, 'duration' | 'plays'>[] };
/** Structural type: accepts full includes AND minimal `select` shapes. */
type PlaylistFull = Playlist & {
  tracks: ReadonlyArray<{ track?: (Pick<Track, 'duration'> & { album?: Pick<Album, 'cover'> }) | null }>;
};

export function trackDTO(t: TrackFull): TrackDTO {
  return {
    id: t.id,
    slug: t.slug,
    title: t.title,
    file: t.file,
    duration: t.duration,
    number: t.number,
    plays: t.plays,
    liked: t.liked,
    album: {
      id: t.album.id,
      slug: t.album.slug,
      title: t.album.title,
      cover: t.album.cover,
      accent: t.album.accent,
      accentSoft: t.album.accentSoft,
      year: t.album.year,
    },
    artist: { id: t.artist.id, slug: t.artist.slug, name: t.artist.name },
    source: t.id.startsWith('yt:') ? 'youtube' : 'local',
  };
}

export function albumDTO(a: AlbumFull): AlbumDTO {
  const trackCount = a.tracks.length;
  const totalDuration = a.tracks.reduce((sum, t) => sum + t.duration, 0);
  const plays = a.tracks.reduce((sum, t) => sum + t.plays, 0);
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    cover: a.cover,
    accent: a.accent,
    accentSoft: a.accentSoft,
    year: a.year,
    type: a.type,
    genre: a.genre,
    description: a.description,
    artist: { id: a.artist.id, slug: a.artist.slug, name: a.artist.name },
    trackCount,
    totalDuration,
    plays,
    source: a.id.startsWith('yt:') ? 'youtube' : 'local',
  };
}

/** Distinct album covers (in order) for the auto mosaic — max 4. */
function mosaicCovers(p: PlaylistFull): string[] {
  const covers: string[] = [];
  const seen = new Set<string>();
  for (const pt of p.tracks) {
    const url = pt.track?.album?.cover;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    covers.push(url);
    if (covers.length === 4) break;
  }
  return covers;
}

export function playlistDTO(p: PlaylistFull): PlaylistDTO {
  const trackCount = p.tracks.length;
  const totalDuration = p.tracks.reduce((sum, pt) => sum + (pt.track?.duration ?? 0), 0);
  // user playlists without custom artwork get a Spotify-style 2×2 track
  // mosaic (the creation-time gradient stays as the empty-playlist fallback)
  const mosaic = !p.cover ? mosaicCovers(p) : [];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    cover: p.cover,
    coverFrom: p.coverFrom,
    coverTo: p.coverTo,
    icon: p.icon,
    mosaic: mosaic.length > 0 ? mosaic : null,
    owner: p.owner,
    editable: p.editable,
    trackCount,
    totalDuration,
    source: p.id.startsWith('yt:') ? 'youtube' : 'local',
  };
}

export function artistDTO(a: Artist): ArtistDTO {
  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    image: a.image,
    bio: a.bio,
    monthlyListeners: a.monthlyListeners,
    source: a.id.startsWith('yt:') ? 'youtube' : 'local',
  };
}
