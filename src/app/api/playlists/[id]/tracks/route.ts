import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playlistDTO, trackDTO } from '@/lib/serialize';
import { ensureShadowTrack } from '@/lib/yt-shadow';
import type { PlaylistDetailDTO, TrackDTO } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function findPlaylist(idOrSlug: string) {
  return db.playlist.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      tracks: {
        orderBy: { position: 'asc' },
        include: { track: { include: { album: true, artist: true } } },
      },
    },
  });
}

function detailDTO(playlist: NonNullable<Awaited<ReturnType<typeof findPlaylist>>>): PlaylistDetailDTO {
  return {
    ...playlistDTO(playlist),
    tracks: playlist.tracks.map((pt) => trackDTO(pt.track)),
  };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { trackId?: string; track?: TrackDTO; position?: 'end' | 'next' };
    const trackId = body.trackId;
    if (!trackId) return NextResponse.json({ error: 'trackId is required' }, { status: 400 });

    const playlist = await findPlaylist(id);
    if (!playlist) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });

    /* YouTube Music track: persist a shadow row first (client sends the DTO). */
    if (trackId.startsWith('yt:')) {
      if (!body.track?.id?.startsWith('yt:')) {
        return NextResponse.json({ error: 'Track payload required for YouTube Music tracks' }, { status: 400 });
      }
      const ok = await ensureShadowTrack(body.track);
      if (!ok) return NextResponse.json({ error: 'Failed to save YouTube Music track' }, { status: 500 });
    }

    const track = await db.track.findUnique({ where: { id: trackId }, include: { album: true, artist: true } });
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

    const existing = playlist.tracks.find((pt) => pt.trackId === trackId);
    if (existing) {
      return NextResponse.json({ playlist: detailDTO(playlist), added: false });
    }

    let position = playlist.tracks.length;
    if (body.position === 'next') {
      // not applicable for persistence; append
      position = playlist.tracks.length;
    }

    await db.playlistTrack.create({
      data: { playlistId: playlist.id, trackId, position },
    });

    const updated = await findPlaylist(id);
    return NextResponse.json({ playlist: updated ? detailDTO(updated) : null, added: true }, { status: 201 });
  } catch (e) {
    console.error('POST /api/playlists/[id]/tracks failed', e);
    return NextResponse.json({ error: 'Failed to add track' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { trackId?: string; to?: number };
    const trackId = body.trackId;
    if (!trackId || typeof body.to !== 'number' || !Number.isInteger(body.to) || body.to < 0) {
      return NextResponse.json({ error: 'trackId and integer to are required' }, { status: 400 });
    }

    const playlist = await findPlaylist(id);
    if (!playlist) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    if (!playlist.editable) return NextResponse.json({ error: 'This playlist cannot be edited' }, { status: 403 });

    const sorted = [...playlist.tracks].sort((a, b) => a.position - b.position);
    const from = sorted.findIndex((pt) => pt.trackId === trackId);
    if (from === -1) return NextResponse.json({ error: 'Track not in playlist' }, { status: 404 });

    const to = Math.min(body.to, sorted.length - 1);
    if (from === to) {
      return NextResponse.json({ playlist: detailDTO(playlist), moved: false });
    }

    // splice to the new order, then persist the re-flowed positions
    const [entry] = sorted.splice(from, 1);
    sorted.splice(to, 0, entry);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].position !== i) {
        await db.playlistTrack.update({ where: { id: sorted[i].id }, data: { position: i } });
      }
    }

    const updated = await findPlaylist(id);
    return NextResponse.json({ playlist: updated ? detailDTO(updated) : null, moved: true });
  } catch (e) {
    console.error('PATCH /api/playlists/[id]/tracks failed', e);
    return NextResponse.json({ error: 'Failed to reorder track' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const trackId = req.nextUrl.searchParams.get('trackId');
    if (!trackId) return NextResponse.json({ error: 'trackId is required' }, { status: 400 });

    const playlist = await findPlaylist(id);
    if (!playlist) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    if (!playlist.editable) return NextResponse.json({ error: 'This playlist cannot be edited' }, { status: 403 });

    const entry = playlist.tracks.find((pt) => pt.trackId === trackId);
    if (!entry) return NextResponse.json({ error: 'Track not in playlist' }, { status: 404 });

    await db.playlistTrack.delete({ where: { id: entry.id } });

    // re-flow positions
    const remaining = playlist.tracks.filter((pt) => pt.id !== entry.id).sort((a, b) => a.position - b.position);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await db.playlistTrack.update({ where: { id: remaining[i].id }, data: { position: i } });
      }
    }

    const updated = await findPlaylist(id);
    return NextResponse.json({ playlist: updated ? detailDTO(updated) : null });
  } catch (e) {
    console.error('DELETE /api/playlists/[id]/tracks failed', e);
    return NextResponse.json({ error: 'Failed to remove track' }, { status: 500 });
  }
}
