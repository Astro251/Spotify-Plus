/** Shared DTO types used by API routes and client components. */

/** Where an entity's data comes from: the local library or live YouTube Music. */
export type SourceKind = 'local' | 'youtube';

export interface ArtistRef {
  id: string;
  slug: string;
  name: string;
}

export interface AlbumRef {
  id: string;
  slug: string;
  title: string;
  cover: string;
  accent: string;
  accentSoft: string;
  year: number;
}

export interface TrackDTO {
  id: string;
  slug: string;
  title: string;
  file: string;
  duration: number;
  number: number;
  plays: number;
  liked: boolean;
  album: AlbumRef;
  artist: ArtistRef;
  source?: SourceKind;
}

export interface AlbumDTO {
  id: string;
  slug: string;
  title: string;
  cover: string;
  accent: string;
  accentSoft: string;
  year: number;
  type: string;
  genre: string;
  description: string;
  artist: ArtistRef;
  trackCount: number;
  totalDuration: number;
  plays: number;
  source?: SourceKind;
}

export interface PlaylistDTO {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover: string | null;
  coverFrom: string | null;
  coverTo: string | null;
  icon: string | null;
  /** Auto-built 2×2 mosaic of the first 4 track covers (user playlists without their own cover). */
  mosaic?: string[] | null;
  owner: string;
  editable: boolean;
  trackCount: number;
  totalDuration: number;
  source?: SourceKind;
}

export interface ArtistDTO {
  id: string;
  slug: string;
  name: string;
  image: string;
  bio: string;
  monthlyListeners: number;
  source?: SourceKind;
}

export type ShelfItem = AlbumDTO | PlaylistDTO | ArtistDTO;

export interface ShelfDTO {
  id: string;
  title: string;
  items: ShelfItem[];
}

export interface HomeFeedDTO {
  quickPicks: ShelfItem[];
  /** Recently played tracks ("Jump back in"), newest first. */
  recentTracks: TrackDTO[];
  shelves: ShelfDTO[];
  likedCount: number;
}

/** One entry in the listening history (a played track + when it was last played). */
export interface HistoryEntryDTO {
  track: TrackDTO;
  playedAt: string;
}

export interface HistoryDTO {
  entries: HistoryEntryDTO[];
}

export interface PlaylistDetailDTO extends PlaylistDTO {
  tracks: TrackDTO[];
}

export interface AlbumDetailDTO extends AlbumDTO {
  tracks: TrackDTO[];
}

export interface ArtistDetailDTO extends ArtistDTO {
  topTracks: TrackDTO[];
  albums: AlbumDTO[];
}

export interface LibraryDTO {
  playlists: PlaylistDTO[];
  liked: { count: number; totalDuration: number };
}

/** One synced karaoke line (time = seconds into the track). */
export interface LyricLine {
  time: number;
  text: string;
}

export interface LyricsDTO {
  trackId: string;
  synced: boolean;
  instrumental: boolean;
  lines: LyricLine[];
}

export type TopResult =
  | (TrackDTO & { type: 'track' })
  | (ArtistDTO & { type: 'artist' })
  | (PlaylistDTO & { type: 'playlist' })
  | (AlbumDTO & { type: 'album' });

export interface SearchDTO {
  query: string;
  topResult: TopResult | null;
  tracks: TrackDTO[];
  albums: AlbumDTO[];
  artists: ArtistDTO[];
  playlists: PlaylistDTO[];
}

/** Time window for the listening-stats view. */
export type StatsRange = 'week' | 'month' | 'all';

export interface StatsTopTrack {
  track: TrackDTO;
  /** plays inside the selected range */
  plays: number;
  /** summed listening time in seconds */
  seconds: number;
}

export interface StatsTopArtist {
  artist: ArtistDTO;
  plays: number;
  /** distinct tracks played */
  trackCount: number;
  seconds: number;
}

export interface StatsTopAlbum {
  album: AlbumDTO;
  plays: number;
}

export interface StatsDTO {
  range: StatsRange;
  summary: {
    plays: number;
    seconds: number;
    trackCount: number;
    artistCount: number;
    /** distinct calendar days with at least one play */
    activeDays: number;
  };
  topTracks: StatsTopTrack[];
  topArtists: StatsTopArtist[];
  topAlbums: StatsTopAlbum[];
}
