import { describe, expect, it } from 'vitest';
import {
  MAX_BPM,
  MIN_BPM,
  bpmFromTaps,
  estimateBpmFromEnvelope,
  foldTempo,
} from './bpm';

describe('foldTempo', () => {
  it('leaves an in-range tempo unchanged', () => {
    expect(foldTempo(120)).toBe(120);
  });

  it('doubles tempos below the floor', () => {
    expect(foldTempo(30)).toBe(60); // 30 -> 60 (>= MIN_BPM 40)
    expect(foldTempo(35, 70, 180)).toBe(70); // 35 -> 70 with a tighter band
  });

  it('halves tempos above the ceiling', () => {
    expect(foldTempo(480)).toBe(240); // 480 -> 240 (== MAX_BPM)
    expect(foldTempo(300, 70, 180)).toBe(150); // 300 -> 150 with a tighter band
  });

  it('keeps the result within [MIN_BPM, MAX_BPM]', () => {
    for (const bpm of [10, 55, 199, 300, 1000]) {
      const v = foldTempo(bpm);
      expect(v).toBeGreaterThanOrEqual(MIN_BPM);
      expect(v).toBeLessThanOrEqual(MAX_BPM);
    }
  });

  it('returns 0 for nonsensical input', () => {
    expect(foldTempo(0)).toBe(0);
    expect(foldTempo(-5)).toBe(0);
    expect(foldTempo(NaN)).toBe(0);
  });
});

describe('bpmFromTaps', () => {
  // Helper: timestamps for `count` taps at a steady tempo, starting at t0.
  function steadyTaps(bpm: number, count: number, t0 = 1000): number[] {
    const step = 60000 / bpm;
    return Array.from({ length: count }, (_, i) => t0 + i * step);
  }

  it('needs at least two taps', () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps([1000])).toBeNull();
  });

  it('recovers a steady tempo from evenly spaced taps', () => {
    expect(bpmFromTaps(steadyTaps(120, 5))).toBeCloseTo(120, 5);
    expect(bpmFromTaps(steadyTaps(90, 8))).toBeCloseTo(90, 5);
  });

  it('averages out small human jitter', () => {
    // 100 BPM = 600ms; nudge each interval by a few ms either way.
    const taps = [0, 590, 1215, 1800, 2410];
    const bpm = bpmFromTaps(taps);
    expect(bpm).not.toBeNull();
    expect(bpm!).toBeGreaterThan(96);
    expect(bpm!).toBeLessThan(104);
  });

  it('resets on a long gap and uses only the trailing run', () => {
    // An old, slow pair of taps, a >2s gap, then a clean 120 BPM run.
    const taps = [0, 1500, /* gap */ 6000, 6500, 7000, 7500];
    expect(bpmFromTaps(taps)).toBeCloseTo(120, 5);
  });
});

describe('estimateBpmFromEnvelope', () => {
  // Deterministic [0,1) pseudo-noise so the test is reproducible.
  function pseudo(i: number): number {
    const x = Math.sin(i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  // A realistic onset envelope: a sharp attack that decays over a few frames,
  // repeating every `periodFrames`, with optional broadband noise. Real onset
  // detectors never produce single-sample impulses, and decaying pulses are
  // what makes the fundamental win over its multiples.
  function beatEnvelope(
    periodFrames: number,
    lengthFrames: number,
    { noise = 0, jitter = 0 }: { noise?: number; jitter?: number } = {},
  ): number[] {
    const env = new Array<number>(lengthFrames).fill(0);
    for (let beat = 0; beat * periodFrames < lengthFrames; beat++) {
      const onset = Math.round(beat * periodFrames + (jitter ? (pseudo(beat) - 0.5) * jitter : 0));
      for (let d = 0; d < 6 && onset + d < lengthFrames; d++) {
        if (onset + d >= 0) env[onset + d] += Math.exp(-d / 1.5);
      }
    }
    if (noise) for (let i = 0; i < lengthFrames; i++) env[i] += noise * pseudo(i * 7 + 3);
    return env;
  }

  const FRAME_RATE = 100; // 100 envelope frames per second

  it('returns null on too-short or silent input', () => {
    expect(estimateBpmFromEnvelope([1, 2, 3], FRAME_RATE)).toBeNull();
    expect(estimateBpmFromEnvelope(new Array(200).fill(0), FRAME_RATE)).toBeNull();
  });

  it('recovers 120 BPM from clean beats', () => {
    // 120 BPM => 0.5s/beat => 50 frames at 100 Hz.
    const est = estimateBpmFromEnvelope(beatEnvelope(50, 800), FRAME_RATE);
    expect(est).not.toBeNull();
    expect(est!.bpm).toBeCloseTo(120, 0);
    expect(est!.confidence).toBeGreaterThan(0.3);
  });

  it('recovers a range of mid tempos within ~3 BPM', () => {
    for (const bpm of [90, 110, 125, 147, 150]) {
      const periodFrames = (FRAME_RATE * 60) / bpm;
      const est = estimateBpmFromEnvelope(beatEnvelope(periodFrames, 1200), FRAME_RATE);
      expect(est, `bpm ${bpm}`).not.toBeNull();
      expect(Math.abs(est!.bpm - bpm), `bpm ${bpm} got ${est!.bpm}`).toBeLessThanOrEqual(3);
    }
  });

  it('still finds the beat under noise and timing jitter', () => {
    const est = estimateBpmFromEnvelope(
      beatEnvelope(50, 1200, { noise: 0.5, jitter: 2 }),
      FRAME_RATE,
    );
    expect(est).not.toBeNull();
    expect(Math.abs(est!.bpm - 120)).toBeLessThanOrEqual(3);
  });

  it('reports the quarter-note pulse, not the eighth-note subdivision', () => {
    // 120 BPM quarters (50 frames) with quieter eighth-notes in between. The
    // dominant pulse should read ~120, not 240.
    const quarters = beatEnvelope(50, 1200);
    const eighths = beatEnvelope(25, 1200).map((v) => v * 0.5);
    const mixed = quarters.map((v, i) => v + eighths[i]);
    const est = estimateBpmFromEnvelope(mixed, FRAME_RATE);
    expect(est).not.toBeNull();
    expect(Math.abs(est!.bpm - 120)).toBeLessThanOrEqual(3);
  });
});
