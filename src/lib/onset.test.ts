import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { estimateBpm, fft } from './onset';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../tests/fixtures/audio');

/**
 * Minimal decoder for the mono 16-bit PCM WAV fixtures. Walks the RIFF chunks
 * to find `fmt ` (sample rate) and `data` (samples), and returns the samples as
 * floats in [-1, 1]. Only handles what `ffmpeg -ac 1 -sample_fmt s16` produces.
 */
function readWavMono(file: string): { samples: Float32Array; sampleRate: number } {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a RIFF/WAVE file`);
  }
  let sampleRate = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      sampleRate = buf.readUInt32LE(body + 4);
    } else if (id === 'data') {
      const count = Math.floor(size / 2);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = buf.readInt16LE(body + i * 2) / 32768;
      return { samples, sampleRate };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  throw new Error(`${file} has no data chunk`);
}

describe('fft', () => {
  it('matches a hand-computed DFT of a simple signal', () => {
    // A pure cosine at bin 1 should put all energy in bins 1 and N-1.
    const n = 8;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * i) / n);
    fft(re, im);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]));
    expect(mag[1]).toBeCloseTo(n / 2, 4);
    expect(mag[n - 1]).toBeCloseTo(n / 2, 4);
    for (const b of [0, 2, 3, 4, 5, 6]) expect(mag[b]).toBeLessThan(1e-3);
  });
});

// Real audio of known tempo. These fixtures are short mono excerpts of the
// owner's own tracks/loops (see tests/fixtures/audio). They are the ground
// truth that keeps the detector honest: if a change breaks beat detection on
// real music, one of these will fail even when the synthetic tests still pass.
describe('estimateBpm on real audio fixtures', () => {
  // Two tempos across four timbres — kick, full drums, and (the hardest, most
  // legato case) bass at 147; a melodic bass loop at 125.
  const cases: { file: string; expected: number }[] = [
    { file: '147bpm-kick.wav', expected: 147 },
    { file: '147bpm-drums.wav', expected: 147 },
    { file: '147bpm-bass.wav', expected: 147 },
    { file: '125bpm-bass.wav', expected: 125 },
  ];

  for (const { file, expected } of cases) {
    it(`detects ~${expected} BPM in ${file}`, () => {
      const { samples, sampleRate } = readWavMono(join(FIXTURES, file));
      const est = estimateBpm(samples, sampleRate);
      expect(est, 'no tempo detected').not.toBeNull();
      // ±3 BPM tolerance: enough to absorb interpolation error and the fact
      // that real performances drift, while still pinning the right pulse.
      expect(Math.abs(est!.bpm - expected), `got ${est!.bpm?.toFixed(1)}`).toBeLessThanOrEqual(3);
    });
  }
});
