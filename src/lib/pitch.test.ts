import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PitchDetector } from 'pitchy';
import { describe, expect, it } from 'vitest';
import {
  CHROMATIC_MIN_FREQ,
  FLOOR_MARGIN_SEMITONES,
  SMOOTHING,
  SNAP_CENTS,
  lowFreqFloor,
  rms,
  smoothPitch,
} from './pitch';
import { centsOff } from './tuning';

describe('rms', () => {
  it('is 0 for digital silence', () => {
    expect(rms(new Float32Array(2048))).toBe(0);
  });

  it('equals the amplitude of a constant (DC) frame', () => {
    const buffer = new Float32Array(64).fill(0.5);
    expect(rms(buffer)).toBeCloseTo(0.5, 10);
  });

  it('is amplitude / sqrt(2) for a full-scale sine wave', () => {
    const n = 1024;
    const buffer = new Float32Array(n);
    for (let i = 0; i < n; i++) buffer[i] = Math.sin((2 * Math.PI * i) / n);
    expect(rms(buffer)).toBeCloseTo(1 / Math.SQRT2, 3);
  });
});

describe('smoothPitch', () => {
  it('returns the raw reading as-is when there is no previous pitch', () => {
    expect(smoothPitch(null, 440)).toBe(440);
  });

  it('eases toward the raw reading for small (in-note) changes', () => {
    // 442 is ~8 cents above 440 — well under SNAP_CENTS, so it should glide.
    const next = smoothPitch(440, 442);
    expect(next).toBeCloseTo(440 + (442 - 440) * SMOOTHING, 10);
    expect(next).toBeGreaterThan(440);
    expect(next).toBeLessThan(442);
  });

  it('snaps straight to the raw reading on a jump larger than SNAP_CENTS', () => {
    // An octave up is 1200 cents — far past the snap threshold.
    expect(smoothPitch(110, 220)).toBe(220);
  });

  it('treats a jump just past the threshold as a new note', () => {
    const prev = 440;
    const sharp = prev * Math.pow(2, (SNAP_CENTS + 1) / 1200);
    expect(smoothPitch(prev, sharp)).toBe(sharp);
  });

  it('converges toward a stable reading when applied repeatedly', () => {
    let smoothed: number | null = null;
    for (let i = 0; i < 50; i++) smoothed = smoothPitch(smoothed, 330);
    expect(smoothed).toBeCloseTo(330, 5);
  });
});

describe('lowFreqFloor', () => {
  it('sits FLOOR_MARGIN_SEMITONES below the lowest string', () => {
    const floor = lowFreqFloor(82.41); // E2
    expect(floor).toBeCloseTo(82.41 * Math.pow(2, -FLOOR_MARGIN_SEMITONES / 12), 4);
    // ~3 semitones under E2 lands around C#2 (~69 Hz).
    expect(floor).toBeGreaterThan(68);
    expect(floor).toBeLessThan(70);
  });

  it('stays below a 5-string bass low B so it is still detectable', () => {
    expect(lowFreqFloor(30.87)).toBeLessThan(30.87);
  });

  it('chromatic floor is below the lowest supported instrument note', () => {
    expect(CHROMATIC_MIN_FREQ).toBeLessThan(30.87); // 5-string bass low B
  });
});

// Real audio of a known note, mirroring the metronome's fixture tests. This E2
// clip is an open low-E pluck recorded on the owner's guitar (~5s, with ~0.6s
// of pre-pluck near-silence and a long decay tail). In those quiet zones the
// detector reported phantom sub-bass (~23-32 Hz) at clarity up to 1.0; flooring
// detection a few semitones below the string eliminates them.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/audio');
const E2 = 82.41;
const BUFFER_SIZE = 2048; // matches usePitchDetection
const CLARITY_THRESHOLD = 0.9;

function readWavMono(file: string): { samples: Float32Array; sampleRate: number } {
  const buf = readFileSync(file);
  let sampleRate = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') sampleRate = buf.readUInt32LE(body + 4);
    else if (id === 'data') {
      const count = Math.floor(size / 2);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = buf.readInt16LE(body + i * 2) / 32768;
      return { samples, sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error(`${file} has no data chunk`);
}

// Runs the same detect-and-gate the live loop runs, returning every accepted
// pitch for the given low-frequency floor.
function detectedPitches(samples: Float32Array, sampleRate: number, minFreq: number): number[] {
  const detector = PitchDetector.forFloat32Array(BUFFER_SIZE);
  const buf = new Float32Array(BUFFER_SIZE);
  const hop = Math.floor(BUFFER_SIZE / 4);
  const out: number[] = [];
  for (let start = 0; start + BUFFER_SIZE <= samples.length; start += hop) {
    buf.set(samples.subarray(start, start + BUFFER_SIZE));
    const [freq, clarity] = detector.findPitch(buf, sampleRate);
    if (clarity > CLARITY_THRESHOLD && freq >= minFreq && freq <= 1200) out.push(freq);
  }
  return out;
}

describe('pitch detection on the real E2 fixture', () => {
  const { samples, sampleRate } = readWavMono(join(FIXTURES, 'e2-guitar.wav'));

  it('reports no outliers once the tuning-aware floor is applied', () => {
    const accepted = detectedPitches(samples, sampleRate, lowFreqFloor(E2));
    const outliers = accepted.filter((f) => Math.abs(centsOff(f, E2)) > 50);
    expect(accepted.length).toBeGreaterThan(50); // the note is clearly detected
    expect(outliers).toHaveLength(0);
    accepted.sort((a, b) => a - b);
    expect(Math.abs(centsOff(accepted[Math.floor(accepted.length / 2)], E2))).toBeLessThan(50);
  });

  it('regression: the old 16 Hz floor let phantom sub-bass through', () => {
    const outliers = detectedPitches(samples, sampleRate, 16).filter(
      (f) => Math.abs(centsOff(f, E2)) > 50,
    );
    expect(outliers.length).toBeGreaterThan(0);
    // …and every one of them is below the tuning-aware floor we now apply.
    for (const f of outliers) expect(f).toBeLessThan(lowFreqFloor(E2));
  });
});
