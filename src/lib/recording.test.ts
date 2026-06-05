import { describe, expect, it } from 'vitest';
import {
  barDurationSec,
  barToSample,
  fitTotalLength,
  loopDurationSec,
  mixDown,
  samplesToSeconds,
  secondsToSamples,
  type Track,
} from './recording';

describe('bar / loop timing', () => {
  it('computes bar and loop durations at 100 BPM, 4/4', () => {
    expect(barDurationSec(100, 4)).toBeCloseTo(2.4, 6); // 4 beats * 0.6s
    expect(loopDurationSec(16, 100, 4)).toBeCloseTo(38.4, 6); // 16 * 2.4s
  });

  it('round-trips seconds and samples', () => {
    expect(secondsToSamples(1, 48000)).toBe(48000);
    expect(samplesToSeconds(48000, 48000)).toBe(1);
  });

  it('maps a bar index to a sample offset', () => {
    expect(barToSample(2, 100, 4, 48000)).toBe(secondsToSamples(4.8, 48000));
  });
});

describe('fitTotalLength (auto-fill to whole loops)', () => {
  it('snaps 2:30 to 4 whole 16-bar loops at 100/4', () => {
    const loopSec = loopDurationSec(16, 100, 4); // 38.4
    const { totalSec, loops } = fitTotalLength(150, loopSec);
    expect(loops).toBe(4); // 150 / 38.4 = 3.9 -> 4
    expect(totalSec).toBeCloseTo(153.6, 6);
  });

  it('always keeps at least one loop', () => {
    expect(fitTotalLength(1, 38.4).loops).toBe(1);
    expect(fitTotalLength(0, 38.4).totalSec).toBeCloseTo(38.4, 6);
  });

  it('returns zero for a non-positive loop length', () => {
    expect(fitTotalLength(150, 0)).toEqual({ totalSec: 0, loops: 0 });
  });
});

describe('mixDown', () => {
  // A track holding a single recording, with sensible defaults.
  function track(id: string, recs: Track['recordings'], muted = false): Track {
    return { id, name: id, recordings: recs, muted };
  }

  it('sums stacked recordings sample-by-sample', () => {
    const a = track('a', [
      {
        id: 'r1',
        buffer: Float32Array.of(0.5, 0.5, 0.5),
        startSample: 0,
        shiftSamples: 0,
        muted: false,
      },
      {
        id: 'r2',
        buffer: Float32Array.of(0.25, 0.25, 0.25),
        startSample: 0,
        shiftSamples: 0,
        muted: false,
      },
    ]);
    expect(Array.from(mixDown([a], 3))).toEqual([0.75, 0.75, 0.75]);
  });

  it('places recordings at their start + shift offset', () => {
    const a = track('a', [
      { id: 'r1', buffer: Float32Array.of(1, 1), startSample: 1, shiftSamples: 1, muted: false },
    ]);
    expect(Array.from(mixDown([a], 5))).toEqual([0, 0, 1, 1, 0]);
  });

  it('clips overhang that falls outside the timeline', () => {
    const a = track('a', [
      // Negative effective start: first sample is off the left edge.
      {
        id: 'r1',
        buffer: Float32Array.of(1, 2, 3),
        startSample: 0,
        shiftSamples: -1,
        muted: false,
      },
    ]);
    // sample at index -1 dropped; 2 and 3 land at 0 and 1; index 2 stays 0.
    expect(Array.from(mixDown([a], 3))).toEqual([2, 3, 0]);
  });

  it('skips muted recordings and muted tracks', () => {
    const a = track('a', [
      { id: 'r1', buffer: Float32Array.of(1), startSample: 0, shiftSamples: 0, muted: true },
    ]);
    const b = track(
      'b',
      [{ id: 'r2', buffer: Float32Array.of(1), startSample: 0, shiftSamples: 0, muted: false }],
      true,
    );
    expect(Array.from(mixDown([a, b], 1))).toEqual([0]);
  });

  it('plays only the soloed track', () => {
    const a = track('a', [
      { id: 'r1', buffer: Float32Array.of(1), startSample: 0, shiftSamples: 0, muted: false },
    ]);
    const b = track('b', [
      { id: 'r2', buffer: Float32Array.of(1), startSample: 0, shiftSamples: 0, muted: false },
    ]);
    expect(Array.from(mixDown([a, b], 1, { soloId: 'b' }))).toEqual([1]);
  });
});
