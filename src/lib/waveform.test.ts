import { describe, expect, it } from 'vitest';
import { computePeaks } from './waveform';

describe('computePeaks', () => {
  it('returns the max absolute amplitude per bucket', () => {
    const buf = Float32Array.of(0.1, -0.9, 0.2, 0.3, -0.4, 0.8);
    const peaks = computePeaks(buf, 2);
    expect(peaks[0]).toBeCloseTo(0.9, 5);
    expect(peaks[1]).toBeCloseTo(0.8, 5);
  });

  it('produces exactly `buckets` values', () => {
    expect(computePeaks(new Float32Array(1000), 64).length).toBe(64);
  });

  it('handles a buffer shorter than the bucket count', () => {
    // Two samples spread across four buckets land in buckets 1 and 3; the
    // others stay empty (0).
    const peaks = computePeaks(Float32Array.of(0.5, 0.5), 4);
    expect(Array.from(peaks)).toEqual([0, 0.5, 0, 0.5]);
  });

  it('returns zeros for an empty buffer', () => {
    expect(Array.from(computePeaks(new Float32Array(0), 3))).toEqual([0, 0, 0]);
  });
});
