'use client';

/**
 * Recent search queries persisted in localStorage (max 8), exposed as a
 * useSyncExternalStore-compatible store so components re-render on change.
 */

const KEY = 'spotify-recent-searches';
const MAX = 8;
const EMPTY: string[] = [];

let version = 0;
let cache: string[] | null = null;
let cachedVersion = -1;
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, MAX) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full / private mode — non-fatal */
  }
}

function bump() {
  version += 1;
  cache = null;
  listeners.forEach((l) => l());
}

/* ------------------------- external-store surface ------------------------ */

export function subscribeRecentSearches(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecentSearchesSnapshot(): string[] {
  if (cache === null || cachedVersion !== version) {
    cache = read();
    cachedVersion = version;
  }
  return cache;
}

export function getRecentSearchesServerSnapshot(): string[] {
  return EMPTY;
}

/* ------------------------------ mutations -------------------------------- */

export function addRecentSearch(q: string): void {
  const query = q.trim();
  if (query.length < 2) return;
  const current = read();
  if (current[0]?.toLowerCase() === query.toLowerCase()) return;
  write([query, ...current.filter((x) => x.toLowerCase() !== query.toLowerCase())].slice(0, MAX));
  bump();
}

export function removeRecentSearch(q: string): void {
  write(read().filter((x) => x.toLowerCase() !== q.toLowerCase()));
  bump();
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
  bump();
}
