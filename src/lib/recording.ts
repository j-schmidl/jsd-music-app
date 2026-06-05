// Pure timing, layout and mixing logic for the multi-track loop recorder.
//
// The recorder is structured as a hierarchy:
//
//   Project  ->  Tracks (Spuren)  ->  LoopRecordings (takes, "übereinander")
//
// A project has one continuous timeline. Each LoopRecording is a mono buffer
// anchored at a sample position on that timeline, plus an independent shift
// (the per-clip "Versatz" that compensates Bluetooth latency and lets a take be
// nudged into the pocket). Because every recording keeps an overhang margin of
// audio it captured just before/after the loop boundary, shifting reveals real
// played sound from the neighbouring loops rather than silence.
//
// Everything here is framework-free and side-effect-free so it can be unit
// tested against synthetic buffers (see recording.test.ts).

/** How much audio (seconds) to keep on each side of a loop when recording, so a
 *  shifted take can reach into the end of the previous loop / start of the next. */
export const OVERHANG_SEC = 1.0;

export type LoopRecording = {
  id: string;
  /** Mono samples, including the pre/post overhang margins. */
  buffer: Float32Array;
  /** Timeline anchor in samples (the loop-slot start minus the pre-margin). */
  startSample: number;
  /** Independent per-take shift in samples (+ = later). The "crazy" feature. */
  shiftSamples: number;
  muted: boolean;
};

export type Track = {
  id: string;
  name: string;
  recordings: LoopRecording[];
  muted: boolean;
};

/** Seconds in one bar at the given tempo and meter. */
export function barDurationSec(bpm: number, beatsPerBar: number): number {
  return (60 / bpm) * beatsPerBar;
}

/** Seconds in one loop of `loopBars` bars. */
export function loopDurationSec(loopBars: number, bpm: number, beatsPerBar: number): number {
  return barDurationSec(bpm, beatsPerBar) * loopBars;
}

/**
 * Snap a target total length to a whole number of loops — the "fill up" rule.
 * If a 16-bar loop doesn't divide the requested 2:30 evenly, the total grows or
 * shrinks to the nearest whole number of loops (always at least one).
 */
export function fitTotalLength(
  targetSec: number,
  loopSec: number,
): { totalSec: number; loops: number } {
  if (loopSec <= 0) return { totalSec: 0, loops: 0 };
  const loops = Math.max(1, Math.round(targetSec / loopSec));
  return { totalSec: loops * loopSec, loops };
}

export function secondsToSamples(sec: number, sampleRate: number): number {
  return Math.round(sec * sampleRate);
}

export function samplesToSeconds(samples: number, sampleRate: number): number {
  return samples / sampleRate;
}

/** Sample index at the start of bar `bar` (0-based). */
export function barToSample(
  bar: number,
  bpm: number,
  beatsPerBar: number,
  sampleRate: number,
): number {
  return secondsToSamples(barDurationSec(bpm, beatsPerBar) * bar, sampleRate);
}

/**
 * Which tracks are audible given the current solo selection. Solo wins: when a
 * track is soloed only it plays; otherwise every non-muted track plays.
 */
export function audibleTracks(tracks: Track[], soloId: string | null | undefined): Track[] {
  if (soloId) return tracks.filter((t) => t.id === soloId);
  return tracks.filter((t) => !t.muted);
}

/**
 * Sum every audible track's every non-muted recording into a single mono buffer
 * of `totalSamples`. Each recording is placed at `startSample + shiftSamples`;
 * any overhang that falls outside the timeline is clipped. Pure — the caller
 * owns sample-rate and length decisions.
 */
export function mixDown(
  tracks: Track[],
  totalSamples: number,
  opts: { soloId?: string | null } = {},
): Float32Array {
  const out = new Float32Array(Math.max(0, totalSamples));
  for (const track of audibleTracks(tracks, opts.soloId)) {
    for (const rec of track.recordings) {
      if (rec.muted) continue;
      const start = rec.startSample + rec.shiftSamples;
      const from = Math.max(0, -start);
      const to = Math.min(rec.buffer.length, totalSamples - start);
      for (let i = from; i < to; i++) {
        out[start + i] += rec.buffer[i];
      }
    }
  }
  return out;
}
