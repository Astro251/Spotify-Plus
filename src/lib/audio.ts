'use client';

let audio: HTMLAudioElement | null = null;

/** Lazily creates the singleton <audio> element (client only). */
export function getAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
  }
  return audio;
}
