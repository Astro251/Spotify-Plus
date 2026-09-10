'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AlbumDetailDTO,
  ArtistDetailDTO,
  HistoryDTO,
  HomeFeedDTO,
  LibraryDTO,
  LyricsDTO,
  PlaylistDTO,
  PlaylistDetailDTO,
  SearchDTO,
  StatsDTO,
  StatsRange,
  TrackDTO,
} from '@/lib/types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export function useHomeFeed() {
  return useQuery({
    queryKey: ['home'],
    queryFn: () => getJson<HomeFeedDTO>('/api/home'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useLibrary() {
  return useQuery({
    queryKey: ['library'],
    queryFn: () => getJson<LibraryDTO>('/api/library'),
  });
}

export function usePlaylists() {
  return useQuery({
    queryKey: ['playlists'],
    queryFn: () => getJson<PlaylistDTO[]>('/api/playlists'),
  });
}

export function usePlaylist(id: string | undefined) {
  return useQuery({
    queryKey: ['playlist', id],
    queryFn: () => getJson<PlaylistDetailDTO>(`/api/playlists/${id}`),
    enabled: !!id,
  });
}

export function useAlbum(id: string | undefined) {
  return useQuery({
    queryKey: ['album', id],
    queryFn: () => getJson<AlbumDetailDTO>(`/api/albums/${id}`),
    enabled: !!id,
  });
}

export function useArtist(id: string | undefined) {
  return useQuery({
    queryKey: ['artist', id],
    queryFn: () => getJson<ArtistDetailDTO>(`/api/artists/${id}`),
    enabled: !!id,
  });
}

export function useLikedTracks() {
  return useQuery({
    queryKey: ['liked'],
    queryFn: () => getJson<TrackDTO[]>('/api/liked'),
  });
}

/** Full listening history, newest first. */
export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: () => getJson<HistoryDTO>('/api/history'),
    staleTime: 30_000,
    retry: 1,
  });
}

/** Listening stats (top tracks/artists/albums + summary) for a time range. */
export function useStats(range: StatsRange) {
  return useQuery({
    queryKey: ['stats', range],
    queryFn: () => getJson<StatsDTO>(`/api/stats?range=${range}`),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['search', q],
    queryFn: () => getJson<SearchDTO>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
    placeholderData: (prev) => prev,
    retry: 1,
  });
}

/** Synced/plain lyrics for the current track (LRCLIB via our cache). */
export function useLyrics(track: TrackDTO | null) {
  const enabled = !!track && !!track.title && !!track.artist.name;
  return useQuery({
    queryKey: ['lyrics', track?.id],
    queryFn: () =>
      getJson<LyricsDTO>(
        `/api/lyrics?id=${encodeURIComponent(track!.id)}&title=${encodeURIComponent(track!.title)}&artist=${encodeURIComponent(
          track!.artist.name
        )}&duration=${Math.round(track!.duration)}&album=${encodeURIComponent(track!.album.title)}`
      ),
    enabled,
    staleTime: Infinity,
    retry: 0,
    gcTime: 30 * 60_000,
  });
}

/* ------------------------------ mutations ------------------------------ */

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useToggleLike() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (track: TrackDTO) =>
      postJson<{ liked: boolean }>(`/api/tracks/${encodeURIComponent(track.id)}/like`, { track }),
    // note: full invalidate keeps every view consistent (catalog is small)
    onSuccess: (data, track) => {
      invalidate();
      if (data.liked) toast.success('Added to Liked Songs');
      else toast('Removed from Liked Songs', { description: track.title });
    },
    onError: () => toast.error('Something went wrong'),
  });
}

export function useAddToPlaylist() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ playlistId, playlistName, track }: { playlistId: string; playlistName: string; track: TrackDTO }) =>
      postJson<{ added: boolean }>(`/api/playlists/${playlistId}/tracks`, { trackId: track.id, track }),
    onSuccess: (data, vars) => {
      invalidate();
      toast.success(data.added ? `Added to ${vars.playlistName}` : `Already in ${vars.playlistName}`);
    },
    onError: () => toast.error('Failed to add track'),
  });
}

export function useCreatePlaylist() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ name, description }: { name: string; description?: string }) =>
      postJson<PlaylistDTO>('/api/playlists', { name, description }),
    onSuccess: (playlist) => {
      invalidate();
      toast.success(`Created playlist "${playlist.name}"`);
    },
    onError: () => toast.error('Failed to create playlist'),
  });
}

export function useRenamePlaylist() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ id, name, description }: { id: string; name?: string; description?: string }) =>
      fetch(`/api/playlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      }).then(async (res) => {
        if (!res.ok) throw new Error('rename failed');
        return res.json() as Promise<PlaylistDetailDTO>;
      }),
    onSuccess: (p) => {
      invalidate();
      toast.success('Playlist updated');
      return p;
    },
    onError: () => toast.error('Only your own playlists can be edited'),
  });
}

/** Set a custom playlist cover: artwork path/URL, gradient hexes, icon, or null to reset. */
export function useSetPlaylistCover() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({
      id,
      cover,
      coverFrom,
      coverTo,
      icon,
    }: {
      id: string;
      cover?: string | null;
      coverFrom?: string;
      coverTo?: string;
      icon?: string | null;
    }) =>
      fetch(`/api/playlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover, coverFrom, coverTo, icon }),
      }).then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'cover update failed');
        return res.json() as Promise<PlaylistDetailDTO>;
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Cover updated');
    },
    onError: (e: Error) => toast.error('Could not update the cover', { description: e.message }),
  });
}

/** Reorder a track within an editable playlist (drag or move up/down). */
export function useReorderPlaylistTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ playlistId, trackId, to }: { playlistId: string; trackId: string; to: number }) =>
      fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, to }),
      }).then(async (res) => {
        if (!res.ok) throw new Error('reorder failed');
        return res.json() as Promise<{ playlist: PlaylistDetailDTO | null; moved: boolean }>;
      }),
    onSuccess: (data, vars) => {
      if (data.playlist) {
        void qc.setQueryData(['playlist', vars.playlistId], data.playlist);
      }
      void qc.invalidateQueries({ queryKey: ['playlists'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (_e, vars) => {
      // roll the local optimistic order back to the server's view
      void qc.invalidateQueries({ queryKey: ['playlist', vars.playlistId] });
      toast.error('Could not reorder the track');
    },
  });
}

export function useRemoveFromPlaylist() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: ({ playlistId, track }: { playlistId: string; track: TrackDTO }) =>
      fetch(`/api/playlists/${playlistId}/tracks?trackId=${track.id}`, { method: 'DELETE' }).then(async (res) => {
        if (!res.ok) throw new Error('remove failed');
        return res.json() as Promise<{ playlist: PlaylistDetailDTO | null }>;
      }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast('Removed from playlist', { description: vars.track.title });
    },
    onError: () => toast.error('Failed to remove track'),
  });
}

export function useDeletePlaylist() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (playlistId: string) =>
      fetch(`/api/playlists/${playlistId}`, { method: 'DELETE' }).then(async (res) => {
        if (!res.ok) throw new Error('delete failed');
        return res.json();
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Playlist deleted');
    },
    onError: () => toast.error('Only your own playlists can be deleted'),
  });
}

/** Remove a single track from the listening history. */
export function useRemoveHistoryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) =>
      fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId }),
      }).then(async (res) => {
        if (!res.ok) throw new Error('remove failed');
        return res.json() as Promise<{ removed: boolean }>;
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['history'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
    onError: () => toast.error('Failed to remove from history'),
  });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetch('/api/history', { method: 'DELETE' }).then(async (res) => {
        if (!res.ok) throw new Error('clear failed');
        return res.json() as Promise<{ cleared: number }>;
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['history'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
      toast.success('Cleared listening history', {
        description: data.cleared > 0 ? `${data.cleared} songs removed` : undefined,
      });
    },
    onError: () => toast.error('Failed to clear history'),
  });
}
