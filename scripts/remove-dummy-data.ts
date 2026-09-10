/**
 * remove-dummy-data.ts — one-time cleanup that drops the procedurally generated
 * demo catalog. Live catalog data now comes entirely from the streaming source;
 * the local database only keeps:
 *   - liked tracks (shadow rows)
 *   - tracks referenced by user playlists (shadow rows)
 *   - the albums/artists those tracks belong to
 *
 * Run: bun scripts/remove-dummy-data.ts
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // 1) playlists (all seeded demo playlists go; user playlists too — fresh start)
  const pt = await db.playlistTrack.deleteMany({});
  const pl = await db.playlist.deleteMany({});
  console.log(`deleted ${pl.count} playlists (${pt.count} playlist-track links)`);

  // 2) tracks: keep only shadow rows (yt: ids) that are liked
  const tk = await db.track.deleteMany({
    where: { OR: [{ id: { not: { startsWith: 'yt:' } } }, { id: { startsWith: 'yt:' }, liked: false }] },
  });
  console.log(`deleted ${tk.count} demo/orphan tracks`);

  // 3) albums / artists with nothing left referencing them
  const al = await db.album.deleteMany({ where: { tracks: { none: {} } } });
  console.log(`deleted ${al.count} empty albums`);
  const ar = await db.artist.deleteMany({ where: { albums: { none: {} } } });
  console.log(`deleted ${ar.count} empty artists`);

  const [tracks, playlists, albums, artists] = await Promise.all([
    db.track.count(),
    db.playlist.count(),
    db.album.count(),
    db.artist.count(),
  ]);
  console.log(`remaining: ${tracks} tracks (liked), ${playlists} playlists, ${albums} albums, ${artists} artists`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void db.$disconnect());
