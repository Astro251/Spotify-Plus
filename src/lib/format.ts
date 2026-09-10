/** Formatting helpers shared across the app. */

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '–:–';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTotalDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${Math.max(m, 1)} min`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good evening'; // night owls
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Spotify-style relative time: "Just now", "12 minutes ago", "Yesterday", "3 days ago", "Last week", then dates.
 *  `short` compacts to row-friendly labels ("5 min ago", "3 hr ago"). */
export function formatRelativeTime(input: string | Date, short = false): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Just now';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return short ? `${minutes} min ago` : plural(minutes, 'minute') + ' ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return short ? `${hours} hr ago` : plural(hours, 'hour') + ' ago';

  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return short ? `${days} days ago` : plural(days, 'day') + ' ago';
  if (days < 14) return 'Last week';
  if (days < 30) return short ? `${Math.floor(days / 7)} wks ago` : plural(Math.floor(days / 7), 'week') + ' ago';

  // date form — month + day (+ year when not the current year)
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return sameYear ? `${month} ${day}` : `${month} ${day}, ${date.getFullYear()}`;
}

/** Which time bucket a timestamp belongs to ("Today", "Yesterday", "This week", "Earlier"). */
export function historyBucket(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = date.getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - 86_400_000) return 'Yesterday';
  if (t >= startOfToday - 7 * 86_400_000) return 'This week';
  return 'Earlier';
}
