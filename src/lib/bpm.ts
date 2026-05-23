// Pure tempo logic shared by the metronome's two "find BPM" modes:
//
//  - Tap mode:  the user taps a button on the beat; `bpmFromTaps` turns the
//    timestamps into a tempo.
//  - Mic mode:  `useBpmDetector` builds an onset-strength envelope from the
//    microphone (one value per analysis frame) and `estimateBpmFromEnvelope`
//    autocorrelates that envelope to find the dominant beat period.
//
// Everything here is deliberately framework-free and side-effect-free so it can
// be unit-tested against synthetic signals (see bpm.test.ts).

// The musically useful range for a metronome. Tempos outside this are folded
// in by doubling/halving so e.g. a 50 BPM ballad reads as 100 and a 200 BPM
// punk song reads as 100 — both still tap on a sensible pulse.
export const MIN_BPM = 40;
export const MAX_BPM = 240;

// Autocorrelation searches this narrower band: most popular music sits here,
// and restricting the lag range is what disambiguates the true pulse from its
// half/double-time harmonics.
export const SEARCH_MIN_BPM = 70;
export const SEARCH_MAX_BPM = 180;

/**
 * Fold a tempo into [min, max] by repeatedly doubling or halving. A beat period
 * is musically ambiguous up to a factor of two (a "120 BPM" feel can be counted
 * as 60 or 240), so this collapses those equivalents onto one representative.
 */
export function foldTempo(bpm: number, min = MIN_BPM, max = MAX_BPM): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  let v = bpm;
  while (v < min) v *= 2;
  while (v > max) v /= 2;
  return v;
}

/**
 * Estimate BPM from a sequence of tap timestamps (milliseconds, monotonically
 * increasing — `performance.now()` values).
 *
 * Taps separated by more than `resetGapMs` are treated as a new attempt, so the
 * estimate only uses the most recent uninterrupted run of taps. Needs at least
 * two taps in that run; returns null otherwise.
 */
export function bpmFromTaps(taps: number[], resetGapMs = 2000): number | null {
  if (taps.length < 2) return null;

  // Keep only the trailing run with no gap longer than resetGapMs.
  let runStart = 0;
  for (let i = 1; i < taps.length; i++) {
    if (taps[i] - taps[i - 1] > resetGapMs) runStart = i;
  }
  const run = taps.slice(runStart);
  if (run.length < 2) return null;

  // Average inter-tap interval. Averaging (rather than using only the last gap)
  // smooths out the unevenness of human tapping.
  const totalSpan = run[run.length - 1] - run[0];
  const interval = totalSpan / (run.length - 1);
  if (interval <= 0) return null;

  return foldTempo(60000 / interval);
}

export type TempoEstimate = {
  /** Detected tempo in BPM, folded into [MIN_BPM, MAX_BPM]. */
  bpm: number;
  /**
   * 0..1 — peak autocorrelation strength relative to the zero-lag energy.
   * Low values mean a weak/ambiguous pulse (noise, silence, rubato).
   */
  confidence: number;
};

// Tempo the perceptual weight is centred on, and its spread in octaves. Music
// clusters around a "comfortable" tactus; weighting the autocorrelation by this
// curve nudges ambiguous results toward typical tempos and away from the slow
// half / fast double of the true pulse.
const PREFERRED_BPM = 120;
const PREFERENCE_OCTAVES = 0.9;

/**
 * Estimate tempo from an onset-strength envelope by autocorrelation.
 *
 * `envelope[i]` is the onset strength of frame `i`; `frameRateHz` is how many
 * frames make up one second. The function correlates the (DC-removed) envelope
 * with delayed copies of itself for every lag in the period band between
 * `maxBpm` and `minBpm`, and reports the lag with the strongest weighted
 * correlation as the beat period.
 *
 * Two deliberate biases resolve the octave ambiguity (a period P correlates
 * just as well at 2P, 3P, …):
 *   1. Correlation is *not* normalised by overlap length, so shorter lags —
 *      which have more overlapping beat-pairs — score higher. This favours the
 *      fundamental over its slower multiples.
 *   2. A log-normal perceptual weight centred on PREFERRED_BPM gently prefers
 *      musically common tempos.
 *
 * Returns null when there isn't enough signal to judge.
 */
export function estimateBpmFromEnvelope(
  envelope: readonly number[],
  frameRateHz: number,
  opts: { minBpm?: number; maxBpm?: number } = {},
): TempoEstimate | null {
  const minBpm = opts.minBpm ?? SEARCH_MIN_BPM;
  const maxBpm = opts.maxBpm ?? SEARCH_MAX_BPM;
  const n = envelope.length;
  if (n < 8 || frameRateHz <= 0) return null;

  // A faster tempo => shorter beat period => smaller lag in frames. Round
  // inward so the bpm at the band edges never spills past [minBpm, maxBpm].
  const minLag = Math.max(1, Math.ceil((frameRateHz * 60) / maxBpm));
  const maxLag = Math.min(n - 1, Math.floor((frameRateHz * 60) / minBpm));
  if (maxLag <= minLag) return null;

  // Remove the DC component so the autocorrelation reflects *fluctuation*
  // (onsets) rather than the overall loudness offset.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += envelope[i];
  mean /= n;

  const centered = new Array<number>(n);
  let energy = 0; // zero-lag autocorrelation, used to normalise confidence
  for (let i = 0; i < n; i++) {
    const v = envelope[i] - mean;
    centered[i] = v;
    energy += v * v;
  }
  if (energy <= 0) return null;

  // Keep every lag's raw correlation so we can interpolate around the winner.
  const corr = new Float32Array(maxLag + 1);
  let bestLag = -1;
  let bestScore = -Infinity;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i + lag < n; i++) {
      c += centered[i] * centered[i + lag];
    }
    corr[lag] = c;
    const bpm = (frameRateHz * 60) / lag;
    const octaves = Math.log2(bpm / PREFERRED_BPM) / PREFERENCE_OCTAVES;
    const weight = Math.exp(-0.5 * octaves * octaves);
    const score = c * weight;
    if (score > bestScore) {
      bestScore = score;
      bestCorr = c;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return null;

  // Parabolic interpolation of the correlation peak gives sub-frame lag
  // precision — without it the BPM can only land on the discrete values the
  // frame rate allows, which is several BPM apart at faster tempos.
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = corr[bestLag - 1];
    const b = corr[bestLag];
    const c = corr[bestLag + 1];
    const denom = a - 2 * b + c;
    if (denom !== 0) {
      const delta = (0.5 * (a - c)) / denom;
      if (delta > -1 && delta < 1) refinedLag = bestLag + delta;
    }
  }

  const bpm = foldTempo((frameRateHz * 60) / refinedLag);
  // Confidence: peak correlation relative to the envelope's total energy.
  const confidence = Math.max(0, Math.min(1, bestCorr / energy));
  return { bpm, confidence };
}
