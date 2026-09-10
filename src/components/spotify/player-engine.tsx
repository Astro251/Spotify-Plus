'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePlayer } from '@/lib/store/player';
import { getAudio } from '@/lib/audio';
import { EMBED_BLOCKED_CODES, ytEngine } from '@/lib/playback/yt-engine';
import type { TrackDTO } from '@/lib/types';

/**
 * Dual playback engine:
 *  - local library tracks → the singleton <audio> element (bundled files)
 *  - YouTube Music tracks → the YouTube IFrame player. Audio streams live
 *    from YouTube. Resolution order when a video can't play:
 *      1. embed the primary videoId
 *      2. on embed-block (error 101/150): play an ALTERNATE upload of the
 *         same song (resolved via /api/yt/alternate from YouTube Music
 *         search results — many uploads allow embedding)
 *      3. fall back to our server relay /api/yt/stream/[id] (yt-dlp +
 *         bgutil POT provider / Invidious instances, when reachable)
 *      4. give up: toast + auto-skip
 */
function updateMediaSession(track: TrackDTO) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist.name,
      album: track.album.title,
      artwork: [{ src: track.album.cover, sizes: '512x512' }],
    });
  } catch {
    /* MediaMetadata not available */
  }
}

function ytVideoId(track: TrackDTO): string | null {
  if (track.source !== 'youtube') return null;
  const m = /^yt:([^:]+)$/.exec(track.id) ?? /^yt-(.+)$/.exec(track.slug);
  return m?.[1] ?? null;
}

/* ---------------- embed-block memory (persisted across sessions) ---------------- */

const BLOCKED_KEY = 'yt-embed-blocked';

function loadBlocked(): Set<string> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(BLOCKED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveBlocked(set: Set<string>) {
  try {
    window.localStorage.setItem(BLOCKED_KEY, JSON.stringify([...set].slice(-600)));
  } catch {
    /* quota — ignore */
  }
}

interface AlternateTrack {
  videoId: string;
  title: string;
  duration: number;
  artist: string;
}

export function PlayerEngine() {
  const qc = useQueryClient();
  const loadedTrackRef = useRef<string | null>(null);
  const activeEngineRef = useRef<'yt' | 'audio' | null>(null);
  const lastSeekNonce = useRef(0);
  const failStreakRef = useRef(0);
  const autoplayHintShown = useRef(false);
  /** set when a play intent was blocked by the browser's autoplay policy —
   *  the next user gesture anywhere on the page resumes playback */
  const autoplayDebtRef = useRef(false);
  const lastPositionSync = useRef(0);
  const resolvingRef = useRef(false);
  const blockedRef = useRef<Set<string> | null>(null);
  const radioInFlightRef = useRef(false);

  useEffect(() => {
    const audio = getAudio();
    if (!audio) return;
    if (!blockedRef.current) blockedRef.current = loadBlocked();
    const blocked = blockedRef.current;

    /* ------------------------- helpers ------------------------- */

    const currentTrack = (): TrackDTO | null => {
      const st = usePlayer.getState();
      return st.queue[st.order[st.pos]] ?? null;
    };

    /** Endless autoplay: resolve a radio mix for the seed and keep playing. */
    const handleRadioPending = async (seedId: string) => {
      if (radioInFlightRef.current) return;
      radioInFlightRef.current = true;
      try {
        const st = usePlayer.getState();
        const seed = st.queue[st.order[st.pos]];
        if (!seed || seed.id !== seedId) return;
        const vid = ytVideoId(seed);
        if (!vid) {
          usePlayer.setState({ isPlaying: false, progress: 0, radioPending: null });
          return;
        }
        const exclude = st.queue
          .map((t) => t.id.replace(/^yt:/, ''))
          .join(',');
        const res = await fetch(`/api/yt/radio?videoId=${encodeURIComponent(vid)}&exclude=${encodeURIComponent(exclude)}`);
        if (!res.ok) throw new Error(`radio HTTP ${res.status}`);
        const data = (await res.json()) as { tracks?: TrackDTO[] };
        const tracks = data.tracks ?? [];
        if (usePlayer.getState().radioPending?.seedId !== seedId) return; // superseded
        if (tracks.length === 0) {
          usePlayer.setState({ isPlaying: false, progress: 0, radioPending: null });
          return;
        }
        usePlayer.getState().extendQueue(tracks);
        usePlayer.setState({ radioPending: null });
        usePlayer.getState().next(true);
      } catch {
        if (usePlayer.getState().radioPending?.seedId === seedId) {
          usePlayer.setState({ isPlaying: false, progress: 0, radioPending: null });
        }
      } finally {
        radioInFlightRef.current = false;
      }
    };

    /** Blocked autoplay recovery: the browser refused programmatic playback
     *  (cold-load deep links, autoplay policy). The next tap/keypress anywhere
     *  restarts the intent — no need to hunt for the play button. */
    const removeGestureListeners = () => {
      window.removeEventListener('pointerdown', onGestureResume);
      window.removeEventListener('keydown', onGestureResume);
    };
    const onGestureResume = () => {
      if (!autoplayDebtRef.current) return;
      autoplayDebtRef.current = false;
      removeGestureListeners();
      const st = usePlayer.getState();
      const cur = st.queue[st.order[st.pos]];
      if (!cur || st.isPlaying) return;
      // re-issue the play intent — this runs inside a user gesture, so the
      // engine accepts it
      if (activeEngineRef.current === 'yt') {
        ytEngine.play();
        usePlayer.setState({ isPlaying: true });
        armAutoplayWatchdog(cur);
      } else if (activeEngineRef.current === 'audio') {
        void audio.play().then(
          () => usePlayer.setState({ isPlaying: true }),
          () => usePlayer.setState({ isPlaying: false })
        );
      }
    };
    window.addEventListener('pointerdown', onGestureResume);
    window.addEventListener('keydown', onGestureResume);

    const stopYt = () => ytEngine.stop();
    const stopAudio = () => {
      if (!audio.paused) audio.pause();
    };

    const markBlocked = (vid: string) => {
      if (!blocked.has(vid)) {
        blocked.add(vid);
        saveBlocked(blocked);
      }
    };

    const failTrack = (track: TrackDTO, reason?: string) => {
      // if playback is already stopped (e.g. sleep timer / guard), a racing
      // failure must not resume the churn — drop it silently
      if (!usePlayer.getState().isPlaying) return;
      failStreakRef.current += 1;
      (window as unknown as { __ytLog?: unknown[] }).__ytLog = [
        ...(((window as unknown as { __ytLog?: unknown[] }).__ytLog ?? []) as unknown[]),
        { type: 'failTrack', streak: failStreakRef.current, title: track.title, at: Date.now() },
      ].slice(-40);
      if (failStreakRef.current >= 4) {
        usePlayer.setState({ isPlaying: false });
        toast.error('Playback stopped', {
          description: 'Several tracks in a row could not be streamed.',
        });
        failStreakRef.current = 0;
        return;
      }
      toast.error(`Can't play “${track.title}”`, {
        description: reason ?? 'Skipping to the next track.',
      });
      usePlayer.getState().next(true);
    };

    /** Load a video into the embed and resolve once it plays or errors. */
    const tryEmbed = (videoId: string, timeoutMs = 9000) =>
      new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          off();
          clearTimeout(timer);
          resolve(ok);
        };
        const off = ytEngine.subscribe((e) => {
          if (done) return;
          if (e.type === 'state' && e.state === 'playing') {
            finish(true);
          } else if (e.type === 'state' && e.state === 'cued') {
            // The embed ACCEPTED this video (blocked videos error out before
            // cued). Autoplay was just held back — nudge it; 'playing' or the
            // timeout settles the outcome.
            ytEngine.play();
          } else if (e.type === 'error') {
            finish(false);
          }
        });
        const timer = setTimeout(() => finish(false), timeoutMs);
        ytEngine.load(videoId, true);
      });

    /** Tier-3: route an unplayable YT track through our server relay. */
    const tryServerRelay = (track: TrackDTO) =>
      new Promise<boolean>((resolve) => {
        const vid = ytVideoId(track);
        if (!vid) return resolve(false);
        stopYt();
        activeEngineRef.current = 'audio';
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          audio.removeEventListener('playing', onPlaying);
          audio.removeEventListener('error', onError);
          resolve(ok);
        };
        const onPlaying = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), 14000);
        audio.addEventListener('playing', onPlaying);
        audio.addEventListener('error', onError);
        audio.src = `/api/yt/stream/${vid}`;
        audio.load();
        audio.play().catch(() => finish(false));
      });

    /** Full resolution chain for embed-blocked videos. */
    const handleEmbedBlocked = async (track: TrackDTO, vid: string, retry = 0) => {
      if (resolvingRef.current) {
        // another resolution is in flight (e.g. the previous track's skip
        // synchronously drove this track); retry shortly
        if (retry < 10) {
          setTimeout(() => {
            const cur = currentTrack();
            if (cur?.id === track.id && !ytEngine.isPlaying()) void handleEmbedBlocked(track, vid, retry + 1);
          }, 400);
        }
        return;
      }
      resolvingRef.current = true;
      try {
        markBlocked(vid);
        // 1) alternate uploads of the same song
        const exclude = [vid, ...[...blocked].slice(-40)];
        let alts: AlternateTrack[] = [];
        try {
          const res = await fetch(
            `/api/yt/alternate?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(
              track.artist.name
            )}&exclude=${encodeURIComponent(exclude.join(','))}`
          );
          if (res.ok) {
            const data = (await res.json()) as { alternates?: AlternateTrack[] };
            alts = data.alternates ?? [];
          }
        } catch {
          /* offline / route error */
        }
        for (const alt of alts.slice(0, 4)) {
          if (currentTrack()?.id !== track.id) return; // user moved on
          const ok = await tryEmbed(alt.videoId);
          if (currentTrack()?.id !== track.id) return;
          if (ok) {
            activeEngineRef.current = 'yt';
            failStreakRef.current = 0;
            // the alternate may sit cued if autoplay was held back — make
            // sure the play intent reaches it and the watchdog is armed
            ytEngine.play();
            armAutoplayWatchdog(track);
            toast('Alternate upload streaming', {
              description: `The original upload blocks embedding — playing “${alt.title}”.`,
            });
            return;
          }
          markBlocked(alt.videoId);
        }
        // 2) server relay (unofficial open-source resolvers)
        if (currentTrack()?.id === track.id) {
          const relayed = await tryServerRelay(track);
          if (relayed) {
            failStreakRef.current = 0;
            toast.success('Streaming via server relay', {
              description: 'Direct audio resolved through open-source tooling.',
            });
            return;
          }
        }
        if (currentTrack()?.id === track.id) {
          failTrack(track, 'No embeddable upload of this track was found.');
        }
      } finally {
        resolvingRef.current = false;
      }
    };

    /* -------------------- engine event wiring -------------------- */

    // <audio> events
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        usePlayer.setState({ duration: audio.duration });
      }
    };
    // NOTE: 'playing' (actual playback), not 'play' — Chrome fires 'play'
    // optimistically when play() is called, even for a relay request that
    // later 503s. Resetting the fail streak / isPlaying on that would make
    // the consecutive-failure guard meaningless.
    const onAudioPlaying = () => {
      if (activeEngineRef.current === 'audio') {
        usePlayer.setState({ isPlaying: true });
        failStreakRef.current = 0;
      }
    };
    const onEnded = () => {
      const { repeat, next } = usePlayer.getState();
      if (activeEngineRef.current !== 'audio') return;
      if (repeat === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
      } else {
        next(true);
      }
    };
    const onAudioError = () => {
      const cur = currentTrack();
      if (!cur || activeEngineRef.current !== 'audio') return;
      failTrack(cur, cur.source === 'youtube' ? 'Relay stream unavailable right now.' : 'Audio file failed to load.');
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('playing', onAudioPlaying);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onAudioError);

    // YouTube engine events
    const unsubscribeYt = ytEngine.subscribe((e) => {
      const cur = currentTrack();
      if (e.type === 'duration' && e.seconds > 0 && cur?.source === 'youtube' && activeEngineRef.current === 'yt') {
        const st = usePlayer.getState();
        if (Math.abs(st.duration - e.seconds) > 0.5) usePlayer.setState({ duration: e.seconds });
      } else if (e.type === 'state') {
        if (activeEngineRef.current !== 'yt') return;
        if (e.state === 'playing') {
          usePlayer.setState({ isPlaying: true });
          failStreakRef.current = 0;
        } else if (e.state === 'ended') {
          const { repeat, next } = usePlayer.getState();
          if (repeat === 'one') {
            ytEngine.seek(0);
            ytEngine.play();
          } else {
            next(true);
          }
        }
      } else if (e.type === 'error') {
        if (!cur || activeEngineRef.current !== 'yt') return;
        const vid = ytEngine.currentVideo();
        // Only the track's PRIMARY upload triggers the resolution chain.
        // Errors from ALTERNATE uploads (loaded mid-chain by tryEmbed) are
        // consumed by the chain itself — routing them here would re-enter
        // the resolver and cascade without ever advancing the queue.
        const primaryVid = ytVideoId(cur);
        if (EMBED_BLOCKED_CODES.has(e.code) && vid && vid === primaryVid) {
          void handleEmbedBlocked(cur, vid);
        } else if (EMBED_BLOCKED_CODES.has(e.code)) {
          /* alternate/mid-chain embed block — the active chain handles it */
        } else if (e.code === -1) {
          failTrack(cur, 'The player failed to load.');
        } else {
          failTrack(cur, 'This track is unavailable.');
        }
      }
    });

    /* ------------- drive engines from store changes ------------- */

    const drive = (cur: TrackDTO | null, isPlaying: boolean) => {
      if (!cur) {
        stopAudio();
        stopYt();
        loadedTrackRef.current = null;
        activeEngineRef.current = null;
        return;
      }
      const trackChanged = loadedTrackRef.current !== cur.id;

      if (trackChanged) {
        const vid = ytVideoId(cur);
        if (vid) {
          stopAudio();
          activeEngineRef.current = 'yt';
          loadedTrackRef.current = cur.id;
          usePlayer.setState({ duration: cur.duration > 0 ? cur.duration : 0, progress: 0 });
          // Known-blocked primaries resolve straight to alternates/relay.
          if (blocked.has(vid)) {
            void handleEmbedBlocked(cur, vid);
          } else {
            ytEngine.load(vid, isPlaying);
            if (isPlaying) armAutoplayWatchdog(cur);
          }
        } else {
          stopYt();
          activeEngineRef.current = 'audio';
          loadedTrackRef.current = cur.id;
          usePlayer.setState({ progress: 0 });
          audio.src = cur.file;
          audio.load();
          if (isPlaying) {
            audio.play().catch(() => {
              // autoplay policy — flip to paused + arm gesture recovery
              autoplayDebtRef.current = true;
              usePlayer.setState({ isPlaying: false });
              toast('Tap anywhere to start the music', {
                description: 'The browser blocked autoplay for this page — one tap and it plays.',
              });
            });
          }
        }
        return;
      }

      // same track — sync play/pause intent
      if (activeEngineRef.current === 'yt') {
        if (isPlaying && !ytEngine.isPlaying() && !resolvingRef.current) {
          ytEngine.play();
          armAutoplayWatchdog(cur);
        } else if (!isPlaying && ytEngine.isPlaying()) {
          ytEngine.pause();
        }
      } else if (activeEngineRef.current === 'audio') {
        if (isPlaying && audio.paused) {
          audio.play().catch(() => usePlayer.setState({ isPlaying: false }));
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      }
    };

    /** If the embed never starts (autoplay policy / network), nudge once,
     *  then reconcile the UI: flip to paused + arm gesture recovery. */
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    function armAutoplayWatchdog(track: TrackDTO) {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (
          activeEngineRef.current === 'yt' &&
          usePlayer.getState().isPlaying &&
          !ytEngine.isPlaying() &&
          !resolvingRef.current &&
          loadedTrackRef.current === track.id
        ) {
          ytEngine.play();
          if (!autoplayHintShown.current) {
            autoplayHintShown.current = true;
            setTimeout(() => {
              if (activeEngineRef.current === 'yt' && !ytEngine.isPlaying() && loadedTrackRef.current === track.id) {
                // autoplay was truly blocked — make the UI truthful (paused)
                // and let the next tap anywhere resume playback
                autoplayDebtRef.current = true;
                usePlayer.setState({ isPlaying: false });
                toast('Tap anywhere to start the music', {
                  description: 'The browser blocked autoplay for this page — one tap and it plays.',
                });
              }
            }, 4000);
          }
        }
      }, 6000);
    }

    // seek intents
    const onSeek = (nonce: number, t: number) => {
      if (nonce === lastSeekNonce.current) return;
      lastSeekNonce.current = nonce;
      if (activeEngineRef.current === 'yt') ytEngine.seek(t);
      else audio.currentTime = t;
    };

    // volume / mute apply to both engines
    const applyVolume = (volume: number, muted: boolean) => {
      audio.volume = volume;
      audio.muted = muted;
      if (ytEngine.ready) {
        if (muted) ytEngine.setMuted(true);
        else {
          ytEngine.setMuted(false);
          ytEngine.setVolume(volume);
        }
      }
    };

    // media session + play counting + progress loop
    let raf: number | null = null;

    // sleep timer (minutes mode) — checked every second, always armed
    const sleepPoll = setInterval(() => {
      const st = usePlayer.getState();
      const t = st.sleepTimer;
      if (t?.mode === 'minutes' && Date.now() >= t.endsAt) {
        usePlayer.setState({ isPlaying: false, sleepTimer: null });
        toast('Sleep timer ended', { description: 'Playback paused.' });
      }
    }, 1000);

    const tick = () => {
      const st = usePlayer.getState();
      if (st.isPlaying) {
        const t = activeEngineRef.current === 'yt' ? ytEngine.currentTime() : audio.currentTime;
        if (Number.isFinite(t) && t > 0) {
          usePlayer.setState({ progress: t });
          if (t - lastPositionSync.current > 1) {
            lastPositionSync.current = t;
            if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
              try {
                navigator.mediaSession.setPositionState({
                  duration: st.duration || t,
                  position: Math.min(t, st.duration || t),
                  playbackRate: 1,
                });
              } catch {
                /* position state rejected */
              }
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const unsubscribe = usePlayer.subscribe((s, prev) => {
      const cur = s.queue[s.order[s.pos]];
      const prevCur = prev.queue[prev.order[prev.pos]];

      if (cur !== prevCur) {
        if (cur) {
          updateMediaSession(cur);
          void fetch(`/api/tracks/${cur.id}/play`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // full DTO → the route persists a shadow row (play history, likes overlay)
            body: JSON.stringify({ track: { ...cur, duration: s.duration || cur.duration } }),
          })
            .then((res) => {
              if (res.ok) {
                // play landed in history → refresh history & home "Jump back in"
                void qc.invalidateQueries({ queryKey: ['history'] });
                void qc.invalidateQueries({ queryKey: ['home'] });
                // each play feeds the Top played stats too
                void qc.invalidateQueries({ queryKey: ['stats'] });
              }
            })
            .catch(() => undefined);
        }
        // sleep timer (end of track): the tracked track just finished → pause
        const stNow = usePlayer.getState();
        if (stNow.sleepTimer?.mode === 'eot' && stNow.sleepTimer.trackId && stNow.sleepTimer.trackId === prevCur?.id) {
          usePlayer.setState({ sleepTimer: null, isPlaying: false });
          toast('Sleep timer ended', { description: 'Playback paused.' });
          drive(cur, false);
        } else {
          drive(cur, s.isPlaying);
        }
      } else if (s.isPlaying !== prev.isPlaying) {
        drive(cur, s.isPlaying);
      }

      if (s.radioPending && s.radioPending.nonce !== prev.radioPending?.nonce) {
        void handleRadioPending(s.radioPending.seedId);
      }

      if (s.seekRequest && s.seekRequest.nonce !== lastSeekNonce.current) {
        onSeek(s.seekRequest.nonce, s.seekRequest.t);
      }

      if (s.volume !== prev.volume || s.muted !== prev.muted) {
        applyVolume(s.volume, s.muted);
      }

      if (s.isPlaying !== prev.isPlaying) {
        if (s.isPlaying && raf === null) raf = requestAnimationFrame(tick);
        else if (!s.isPlaying && raf !== null) {
          cancelAnimationFrame(raf);
          raf = null;
        }
      }
    });

    // initial state application
    applyVolume(usePlayer.getState().volume, usePlayer.getState().muted);
    const st0 = usePlayer.getState();
    drive(st0.queue[st0.order[st0.pos]], st0.isPlaying);
    if (st0.seekRequest) onSeek(st0.seekRequest.nonce, st0.seekRequest.t);
    if (st0.isPlaying && raf === null) raf = requestAnimationFrame(tick);

    /* -------------------- media session controls -------------------- */
    let mediaSessionCleanup: (() => void) | null = null;
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => usePlayer.getState().togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => usePlayer.getState().togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => usePlayer.getState().prev());
        navigator.mediaSession.setActionHandler('nexttrack', () => usePlayer.getState().next());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime != null) usePlayer.getState().seek(details.seekTime);
        });
        mediaSessionCleanup = () => {
          ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'].forEach((a) => {
            try {
              navigator.mediaSession.setActionHandler(a as MediaSessionAction, null);
            } catch {
              /* ignore */
            }
          });
        };
      } catch {
        /* setActionHandler unsupported */
      }
    }

    return () => {
      removeGestureListeners();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('playing', onAudioPlaying);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onAudioError);
      unsubscribeYt();
      unsubscribe();
      clearInterval(sleepPoll);
      if (raf !== null) cancelAnimationFrame(raf);
      if (watchdog) clearTimeout(watchdog);
      mediaSessionCleanup?.();
    };
  }, []);

  return null;
}
