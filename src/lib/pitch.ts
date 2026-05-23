// Pure DSP helpers for the live pitch detector. Kept free of any Web Audio /
// React state so they can be unit-tested in isolation, the same way the tuner
// (tuning.ts) and metronome (bpm.ts / onset.ts) logic is.

import { centsOff } from './tuning';

// Light low-pass on the reported pitch: each frame eases this fraction of the
// way toward the raw reading (1 = no smoothing). ~0.25 takes the edge off the
// per-frame jitter without adding noticeable lag.
export const SMOOTHING = 0.25;

// Jumps larger than this (in cents) are treated as a new note rather than
// jitter, so switching strings snaps instantly instead of gliding.
export const SNAP_CENTS = 80;

// pitchy reports a pitch whenever its *clarity* is high, but clarity ignores
// amplitude — so in near-silence (before a string is plucked, or in its dying
// tail) it locks onto phantom sub-bass in the noise floor with clarity up to
// 1.0. Those phantoms sit well below the instrument's range, so a floor a few
// semitones under the lowest string rejects them without dropping any real,
// possibly-flat reading. Validated offline against tests/fixtures/audio.
export const FLOOR_MARGIN_SEMITONES = 3;

export function lowFreqFloor(
  lowestStringFreq: number,
  marginSemitones = FLOOR_MARGIN_SEMITONES,
): number {
  return lowestStringFreq * Math.pow(2, -marginSemitones / 12);
}

// Chromatic mode has no fixed lowest string, so its floor sits just below the
// lowest note any of the app's tunings reach (a 5-string bass low B ≈ 30.9 Hz).
export const CHROMATIC_MIN_FREQ = 28;

// Root-mean-square level of a time-domain frame. A dead pipeline returns
// digital silence (RMS ~ 0) while a live mic always sits above its noise floor,
// so the silence watchdog keys off this.
export function rms(buffer: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
  return Math.sqrt(sumSq / buffer.length);
}

// Eases the smoothed pitch toward the raw reading, but snaps straight to it on
// a large jump (a new note) so changing strings is instant rather than gliding.
// `prev` is null between notes — the first reading is taken as-is.
export function smoothPitch(prev: number | null, raw: number): number {
  const isNewNote = prev === null || Math.abs(centsOff(raw, prev)) > SNAP_CENTS;
  return isNewNote ? raw : prev + (raw - prev) * SMOOTHING;
}
