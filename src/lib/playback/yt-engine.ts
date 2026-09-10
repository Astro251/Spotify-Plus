'use client';

/**
 * YouTube IFrame Player engine.
 *
 * Real YouTube Music audio is streamed through YouTube's official embedded
 * player (loaded in a hidden iframe and driven via the IFrame JS API).
 * The engine is deliberately UI-free: PlayerEngine.tsx binds it to the
 * zustand player store.
 */

export type YtEngineState =
  | 'unstarted'
  | 'ended'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'cued'
  | 'idle';

export type YtEngineEvent =
  | { type: 'ready' }
  | { type: 'state'; state: YtEngineState }
  | { type: 'duration'; seconds: number }
  | { type: 'error'; code: number };

/** 101/150 = embed not allowed for this video, 100 = not found, 2 = invalid, 5 = player error */
export const EMBED_BLOCKED_CODES = new Set([101, 150]);

interface YTPlayerLike {
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayerLike;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number; UNSTARTED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YouTube IFrame API load timeout')), 20000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YT namespace missing'));
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load YouTube IFrame API'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

const STATE_NAMES: Record<number, YtEngineState> = {
  [-1]: 'idle',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
};

class YtEngine {
  private player: YTPlayerLike | null = null;
  private videoId: string | null = null;
  /** queued command issued before the player finished initializing */
  private pending: { videoId: string; play: boolean } | null = null;
  private listeners = new Set<(e: YtEngineEvent) => void>();
  private host: HTMLElement | null = null;
  state: YtEngineState = 'unstarted';
  ready = false;

  /** Loads (and optionally plays) a video. Safe to call before init. */
  load(videoId: string, play: boolean): void {
    this.videoId = videoId;
    if (!this.player) {
      this.pending = { videoId, play };
      void this.init();
      return;
    }
    if (play) this.player.loadVideoById(videoId);
    else this.player.cueVideoById(videoId);
  }

  play(): void {
    this.player?.playVideo();
  }

  pause(): void {
    this.player?.pauseVideo();
  }

  seek(seconds: number): void {
    this.player?.seekTo(seconds, true);
  }

  setVolume(v01: number): void {
    this.player?.setVolume(Math.round(Math.max(0, Math.min(1, v01)) * 100));
  }

  setMuted(muted: boolean): void {
    if (!this.player) return;
    if (muted) this.player.mute();
    else this.player.unMute();
  }

  stop(): void {
    if (this.player) this.player.pauseVideo();
  }

  /** True when the engine currently holds `videoId`. */
  currentVideo(): string | null {
    return this.videoId;
  }

  currentTime(): number {
    try {
      return this.player?.getCurrentTime() ?? 0;
    } catch {
      return 0;
    }
  }

  duration(): number {
    try {
      return this.player?.getDuration() ?? 0;
    } catch {
      return 0;
    }
  }

  isPlaying(): boolean {
    return this.state === 'playing' || this.state === 'buffering';
  }

  subscribe(fn: (e: YtEngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: YtEngineEvent) {
    this.listeners.forEach((fn) => fn(e));
    if (typeof window !== 'undefined') {
      (window as unknown as { __ytLog?: unknown[] }).__ytLog = [
        ...(((window as unknown as { __ytLog?: unknown[] }).__ytLog ?? []) as unknown[]),
        { ...e, at: Date.now(), vid: this.videoId },
      ].slice(-40);
    }
  }

  private async init(): Promise<void> {
    if (this.player) return;
    try {
      const YT = await loadIframeApi();
      // Hidden host container — audio only. YouTube's player stays mounted
      // for the whole session so the embed session (and autoplay grant) persists.
      this.host = document.createElement('div');
      this.host.setAttribute('aria-hidden', 'true');
      this.host.style.cssText =
        'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;bottom:0;';
      document.body.appendChild(this.host);

      const inner = document.createElement('div');
      this.host.appendChild(inner);

      this.player = new YT.Player(inner, {
        width: '1',
        height: '1',
        videoId: this.pending?.videoId ?? '',
        playerVars: {
          playsinline: 1,
          controls: 0,
          disablekb: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true;
            const queued = this.pending;
            this.pending = null;
            this.emit({ type: 'ready' });
            if (queued) {
              if (queued.play) this.player?.loadVideoById(queued.videoId);
              else this.player?.cueVideoById(queued.videoId);
            }
          },
          onStateChange: (e: { data: number }) => {
            this.state = STATE_NAMES[e.data] ?? 'idle';
            this.emit({ type: 'state', state: this.state });
            const dur = this.duration();
            if (dur > 0) this.emit({ type: 'duration', seconds: dur });
          },
          onError: (e: { data: number }) => {
            console.warn('[yt-engine] player error', e.data);
            this.emit({ type: 'error', code: e.data });
          },
        },
      });
    } catch (err) {
      this.pending = null;
      // Surface as a player error so the UI can react and skip.
      this.emit({ type: 'error', code: -1 });
      console.warn('[yt-engine] init failed', err);
    }
  }
}

export const ytEngine = new YtEngine();
