// Turns raw audio samples into an onset-strength envelope — the input that
// `estimateBpmFromEnvelope` (in bpm.ts) autocorrelates to find the tempo.
//
// This is the single source of truth for "how do we hear beats": the live mic
// detector (useBpmDetector) and the offline tests (onset.test.ts, which decode
// real WAV files of known tempo) both call `onsetEnvelope` / `estimateBpm`, so
// the algorithm validated against real music is exactly the one that runs in
// the browser.
//
// Method: half-wave-rectified spectral flux. For each short, Hann-windowed
// frame we take the FFT magnitude spectrum and sum how much energy *rose* in
// each bin versus the previous frame. Energy rises sharply at note/drum onsets,
// so the resulting envelope spikes on every beat.

import { estimateBpmFromEnvelope, type TempoEstimate } from './bpm';

const DEFAULT_FRAME_SIZE = 1024;
const DEFAULT_HOP_SIZE = 256;

/**
 * In-place iterative radix-2 Cooley–Tukey FFT. `re`/`im` hold the real and
 * imaginary parts; length must be a power of two. Transforms in place.
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n <= 1) return;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterflies.
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k];
        const aIm = im[i + k];
        const bRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const bIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

export type OnsetResult = {
  /** Onset strength per frame. */
  envelope: number[];
  /** Frames per second — needed to convert lags back to BPM. */
  frameRateHz: number;
};

/**
 * Compute the spectral-flux onset envelope of mono audio `samples` recorded at
 * `sampleRate`. `frameSize` is the FFT window (power of two); `hopSize` is how
 * far the window advances each frame (frameRateHz = sampleRate / hopSize).
 */
export function onsetEnvelope(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts: { frameSize?: number; hopSize?: number } = {},
): OnsetResult {
  const frameSize = opts.frameSize ?? DEFAULT_FRAME_SIZE;
  const hopSize = opts.hopSize ?? DEFAULT_HOP_SIZE;
  const bins = frameSize / 2;

  // Precompute the Hann window once.
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
  }

  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);
  const prevMag = new Float32Array(bins);
  const envelope: number[] = [];

  const lastStart = samples.length - frameSize;
  for (let start = 0; start <= lastStart; start += hopSize) {
    for (let i = 0; i < frameSize; i++) {
      re[i] = (samples[start + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im);

    let flux = 0;
    for (let b = 0; b < bins; b++) {
      const mag = Math.hypot(re[b], im[b]);
      const diff = mag - prevMag[b];
      if (diff > 0) flux += diff; // half-wave rectify: only count rising energy
      prevMag[b] = mag;
    }
    envelope.push(flux);
  }

  return { envelope, frameRateHz: sampleRate / hopSize };
}

/**
 * One-shot tempo estimate straight from audio samples: build the onset
 * envelope, then autocorrelate it. Returns null if the audio is too short or
 * carries no detectable pulse.
 */
export function estimateBpm(
  samples: ArrayLike<number>,
  sampleRate: number,
  opts: { frameSize?: number; hopSize?: number; minBpm?: number; maxBpm?: number } = {},
): TempoEstimate | null {
  const { envelope, frameRateHz } = onsetEnvelope(samples, sampleRate, opts);
  return estimateBpmFromEnvelope(envelope, frameRateHz, opts);
}
