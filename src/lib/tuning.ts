export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export type GuitarString = {
  readonly id: string;
  readonly name: NoteName;
  readonly octave: number;
  readonly freq: number;
};

export type Tuning = {
  readonly id: string;
  readonly label: string;
  readonly strings: readonly GuitarString[];
};

// Frequencies follow the equal-tempered scale with A4 = 440 Hz.
function noteFreq(name: NoteName, octave: number): number {
  const SEMITONES: Record<NoteName, number> = {
    C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4,
    'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2,
  };
  const n = SEMITONES[name] + (octave - 4) * 12;
  return Math.round(440 * Math.pow(2, n / 12) * 100) / 100;
}

function s(name: NoteName, octave: number): GuitarString {
  return { id: `${name}${octave}`, name, octave, freq: noteFreq(name, octave) };
}

export const TUNINGS: readonly Tuning[] = [
  {
    id: 'standard',
    label: 'Standard',
    strings: [s('E', 2), s('A', 2), s('D', 3), s('G', 3), s('B', 3), s('E', 4)],
  },
  {
    id: 'drop-d',
    label: 'Drop D',
    strings: [s('D', 2), s('A', 2), s('D', 3), s('G', 3), s('B', 3), s('E', 4)],
  },
  {
    id: 'half-step-down',
    label: 'Halbton tiefer',
    strings: [s('D#', 2), s('G#', 2), s('C#', 3), s('F#', 3), s('A#', 3), s('D#', 4)],
  },
  {
    id: 'whole-step-down',
    label: 'Ganzton tiefer',
    strings: [s('D', 2), s('G', 2), s('C', 3), s('F', 3), s('A', 3), s('D', 4)],
  },
  {
    id: 'dadgad',
    label: 'DADGAD',
    strings: [s('D', 2), s('A', 2), s('D', 3), s('G', 3), s('A', 3), s('D', 4)],
  },
  {
    id: 'open-d',
    label: 'Open D',
    strings: [s('D', 2), s('A', 2), s('D', 3), s('F#', 3), s('A', 3), s('D', 4)],
  },
  {
    id: 'open-g',
    label: 'Open G',
    strings: [s('D', 2), s('G', 2), s('D', 3), s('G', 3), s('B', 3), s('D', 4)],
  },
] as const;

/** The classic 6-string standard tuning. Kept as a named export for callers
 *  that don't (yet) need to switch tunings. */
export const STRINGS: readonly GuitarString[] = TUNINGS[0].strings;

export function nearestString(
  freq: number,
  strings: readonly GuitarString[] = STRINGS,
): GuitarString {
  let best = strings[0];
  let bestDiff = Math.abs(centsOff(freq, best.freq));
  for (let i = 1; i < strings.length; i++) {
    const diff = Math.abs(centsOff(freq, strings[i].freq));
    if (diff < bestDiff) {
      best = strings[i];
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
