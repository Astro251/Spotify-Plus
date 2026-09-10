/**
 * Backfills the PlayLog table from the existing all-time `plays` counters so
 * the "Top played" stats view has history from day one.
 *
 * For every track with plays > 0 we insert up to `MAX_PER_TRACK` log rows,
 * spread pseudo-randomly across the last `WINDOW_DAYS` days (weighted toward
 * recent days). The most recent entry for each track matches lastPlayedAt.
 *
 * Idempotent: running it again tops up nothing (skips when rows exist).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MAX_PER_TRACK = 10;
const WINDOW_DAYS = 90;

/** deterministic pseudo-random in [0,1) so reruns are stable */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

async function main() {
  const tracks = await prisma.track.findMany({
    where: { plays: { gt: 0 } },
    select: { id: true, plays: true, lastPlayedAt: true },
  });

  const existing = await prisma.playLog.count();
  if (existing > 0) {
    console.log(`PlayLog already has ${existing} rows — skipping backfill.`);
    return;
  }

  const now = Date.now();
  let total = 0;
  for (const [i, t] of tracks.entries()) {
    // more plays → more log rows, capped
    const n = Math.max(1, Math.min(MAX_PER_TRACK, Math.ceil(t.plays / 3)));
    const rows: { trackId: string; playedAt: Date }[] = [];
    for (let j = 0; j < n; j++) {
      // day offset: skew toward recent (square of rand biases to small values)
      const dayOffset = Math.round(rand(i * 31 + j * 7) ** 2 * WINDOW_DAYS);
      const jitterMs = Math.round(rand(i * 13 + j * 3) * 20 * 3600_000);
      const at = new Date(now - dayOffset * 86_400_000 - jitterMs);
      if (t.lastPlayedAt && at > t.lastPlayedAt) at.setTime(t.lastPlayedAt.getTime());
      rows.push({ trackId: t.id, playedAt: at });
    }
    // the newest backfilled row should match lastPlayedAt exactly when known
    if (t.lastPlayedAt) {
      rows.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
      rows[rows.length - 1].playedAt = t.lastPlayedAt;
    }
    await prisma.playLog.createMany({ data: rows });
    total += rows.length;
  }
  console.log(`Backfilled ${total} play events for ${tracks.length} tracks.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
