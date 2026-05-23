import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_BPM, MIN_BPM } from '../lib/bpm';

// A sample-accurate metronome. setInterval/requestAnimationFrame jitter is far
// too coarse for audible click timing, so we use the standard Web Audio
// "lookahead scheduler" (Chris Wilson's pattern): a coarse timer wakes
// periodically and schedules every click that falls inside a short lookahead
// window directly on the AudioContext clock, which is rock-steady.

const LOOKAHEAD_MS = 25; // how often the scheduler timer wakes
const SCHEDULE_AHEAD_S = 0.12; // how far ahead clicks are queued

const ACCENT_FREQ = 1500; // first beat of the bar
const BEAT_FREQ = 1000; // the other beats
const CLICK_LENGTH_S = 0.04;

export type MetronomeState = {
  bpm: number;
  isPlaying: boolean;
  beatsPerMeasure: number;
  /** Index of the beat currently sounding (0-based), or -1 when stopped. */
  currentBeat: number;
  setBpm: (bpm: number) => void;
  /** Nudge the tempo by whole BPM, clamped to the metronome's range. */
  adjustBpm: (delta: number) => void;
  setBeatsPerMeasure: (n: number) => void;
  start: () => void;
  stop: () => void;
  toggle: () => void;
};

function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

export function useMetronome(initialBpm = 120): MetronomeState {
  const [bpm, setBpmState] = useState(clampBpm(initialBpm));
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);

  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  // Scheduler bookkeeping, kept in refs so the running timer always sees the
  // latest values without being torn down and recreated each tick.
  const nextNoteTimeRef = useRef(0);
  const beatInBarRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerMeasure);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    beatsRef.current = beatsPerMeasure;
  }, [beatsPerMeasure]);

  const playClick = useCallback((ctx: AudioContext, time: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? ACCENT_FREQ : BEAT_FREQ;
    gain.gain.setValueAtTime(accent ? 1 : 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_LENGTH_S);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + CLICK_LENGTH_S);
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsPlaying(false);
    setCurrentBeat(-1);
  }, []);

  const start = useCallback(() => {
    if (timerRef.current !== null) return; // already running

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx = ctxRef.current;
    if (!ctx) {
      ctx = new Ctor();
      ctxRef.current = ctx;
    }
    void ctx.resume();

    beatInBarRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    setIsPlaying(true);

    timerRef.current = window.setInterval(() => {
      const audio = ctxRef.current;
      if (!audio) return;
      // Schedule every beat that comes due within the lookahead window.
      while (nextNoteTimeRef.current < audio.currentTime + SCHEDULE_AHEAD_S) {
        const beat = beatInBarRef.current;
        const time = nextNoteTimeRef.current;
        playClick(audio, time, beat === 0);

        // Flip the visual beat indicator as close to the audible click as we
        // can from a timer (sub-frame accuracy isn't needed for the UI).
        const delayMs = Math.max(0, (time - audio.currentTime) * 1000);
        window.setTimeout(() => setCurrentBeat(beat), delayMs);

        const secondsPerBeat = 60 / bpmRef.current;
        nextNoteTimeRef.current += secondsPerBeat;
        beatInBarRef.current = (beat + 1) % beatsRef.current;
      }
    }, LOOKAHEAD_MS);
  }, [playClick]);

  const toggle = useCallback(() => {
    if (timerRef.current !== null) stop();
    else start();
  }, [start, stop]);

  const setBpm = useCallback((next: number) => setBpmState(clampBpm(next)), []);
  const adjustBpm = useCallback((delta: number) => setBpmState((b) => clampBpm(b + delta)), []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, []);

  return {
    bpm,
    isPlaying,
    beatsPerMeasure,
    currentBeat,
    setBpm,
    adjustBpm,
    setBeatsPerMeasure,
    start,
    stop,
    toggle,
  };
}
