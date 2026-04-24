export type GuitarString = {
  readonly id: string;
  readonly name: 'E' | 'A' | 'D' | 'G' | 'B';
  readonly octave: number;
  readonly freq: number;
};

export const STRINGS: readonly GuitarString[] = [
  { id: 'E2', name: 'E', octave: 2, freq: 82.41 },
  { id: 'A2', name: 'A', octave: 2, freq: 110.0 },
  { id: 'D3', name: 'D', octave: 3, freq: 146.83 },
  { id: 'G3', name: 'G', octave: 3, freq: 196.0 },
  { id: 'B3', name: 'B', octave: 3, freq: 246.94 },
  { id: 'E4', name: 'E', octave: 4, freq: 329.63 },
] as const;

export function nearestString(freq: number): GuitarString {
  let best = STRINGS[0];
  let bestDiff = Math.abs(centsOff(freq, best.freq));
  for (let i = 1; i < STRINGS.length; i++) {
    const diff = Math.abs(centsOff(freq, STRINGS[i].freq));
    if (diff < bestDiff) {
      best = STRINGS[i];
      bestDiff = diff;
    }
  }
  return best;
}

export function centsOff(freq: number, target: number): number {
  return 1200 * Math.log2(freq / target);
}

export function isInTune(cents: number, tolerance = 5): boolean {
  return Math.abs(cents) <= tolerance;
}

export function getTuningHint(cents: number): 'tiefer' | 'hoeher' | 'ok' {
  if (Math.abs(cents) <= 5) return 'ok';
  return cents > 0 ? 'tiefer' : 'hoeher';
}
