import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playlistDTO, trackDTO } from '@/lib/serialize';
import { ytPlaylist } from '@/lib/ytmusic';
import { mergeLikedStates } from '@/lib/yt-shadow';
import type { PlaylistDetailDTO } from '@/lib/types';

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    /* Live YouTube Music playlist (slug form `yt-VL…`, pseudo `yt-single-…`) */
    if (id.startsWith('yt-') || id.startsWith('yt:')) {
      try {
        const dto = await ytPlaylist(id);
        if (!dto) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
        dto.tracks = await mergeLikedStates(dto.tracks);
        return NextResponse.json(dto);
      } catch (e) {
        console.error('GET /api/playlists/[id] (yt) failed', e);
        return NextResponse.json({ error: 'YouTube Music playlist unavailable' }, { status: 502 });
      }
    }

    const playlist = await findPlaylist(id);
    if (!playlist) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    const dto: PlaylistDetailDTO = {
      ...playlistDTO(playlist),
      tracks: playlist.tracks.map((pt) => trackDTO(pt.track)),
    };
    return NextResponse.json(dto);
  } catch (e) {
    console.error('GET /api/playlists/[id] failed', e);
    return NextResponse.json({ error: 'Failed to load playlist' }, { status: 500 });
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const ICON_NAMES = new Set(['Music', 'AudioLines', 'Coffee', 'Leaf', 'Waves', 'Target', 'CarFront', 'CloudRain', 'Sun', 'Radar', 'Map']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      cover?: string | null;
      coverFrom?: string;
      coverTo?: string;
      icon?: string | null;
    };
    const playlist = await findPlaylist(id);
    if (!playlist) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    if (!playlist.editable) return NextResponse.json({ error: 'This playlist cannot be edited' }, { status: 403 });

    /* cover: https URL (proxied via /api/img so next/image accepts it), a
       bundled /covers/* asset, or null to clear back to gradient/mosaic. */
    let cover: string | null | undefined;
    if (body.cover !== undefined) {
      if (body.cover === null || body.cover === '') {
        cover = null;
      } else {
        try {
          const u = new URL(body.cover);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('bad protocol');
          cover = `/api/img?u=${encodeURIComponent(body.cover)}`;
        } catch {
          if (body.cover.startsWith('/covers/')) {
            cover = body.cover;
          } else {
            return NextResponse.json({ error: 'cover must be an http(s) URL or /covers/ path' }, { status: 400 });
          }
        }
      }
    }

    const validateHex = (v: string | undefined, field: string) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (!HEX_RE.test(v)) throw new Error(`${field} must be a #rrggbb hex`);
      return v;
    };
    let coverFrom: string | undefined;
    let coverTo: string | undefined;
    try {
      coverFrom = validateHex(body.coverFrom, 'coverFrom');
      coverTo = validateHex(body.coverTo, 'coverTo');
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const icon =
      body.icon === undefined ? undefined : body.icon !== null && ICON_NAMES.has(body.icon) ? body.icon : null;

    const updated = await db.playlist.update({
      where: { id: playlist.id },
      data: {
        name: body.name?.trim() || playlist.name,
        description: body.description !== undefined ? body.description.trim() || null : playlist.description,
        ...(cover !== undefined ? { cover } : {}),
        ...(coverFrom !== undefined ? { coverFrom } : {}),
        ...(coverTo !== undefined ? { coverTo } : {}),
        ...(icon !== undefined ? { icon } : {}),
      },
      include: { tracks: { orderBy: { position: 'asc' }, include: { track: { include: { album: true, artist: true } } } } },
    });
    const dto: PlaylistDetailDTO = {
      ...playlistDTO(updated),
      tracks: updated.tracks.map((pt) => trackDTO(pt.track)),
    };
    return NextResponse.json(dto);
  } catch (e) {
    console.error('PATCH /api/playlists/[id] failed', e);
    return NextResponse.json({ error: 'Failed to update playlist' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const playlist = await findPlaylist(id);
    if (!playlist) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    if (!playlist.editable) return NextResponse.json({ error: 'This playlist cannot be deleted' }, { status: 403 });
    await db.playlist.delete({ where: { id: playlist.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/playlists/[id] failed', e);
    return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 });
  }
}
