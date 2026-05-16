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

// Public builder for a single string — used by the custom-tuning editor.
export function makeString(name: NoteName, octave: number): GuitarString {
  return s(name, octave);
}

export const NOTE_NAMES: readonly NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

// The id reserved for the user's own tuning.
export const CUSTOM_TUNING_ID = 'custom';

// Builds a Tuning from six (name, octave) pairs, low string first.
export function makeCustomTuning(strings: readonly { name: NoteName; octave: number }[]): Tuning {
  return {
    id: CUSTOM_TUNING_ID,
    label: 'Eigene Stimmung',
    strings: strings.map((p) => s(p.name, p.octave)),
  };
}

const CUSTOM_TUNING_KEY = 'jsd-custom-tuning';

// Loads the saved custom tuning, or a sensible default (standard tuning) if
// none is stored yet.
export function loadCustomTuning(): Tuning {
  const fallback = makeCustomTuning(
    TUNINGS[0].strings.map((str) => ({ name: str.name, octave: str.octave })),
  );
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(CUSTOM_TUNING_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { name: NoteName; octave: number }[];
    if (!Array.isArray(parsed) || parsed.length !== 6) return fallback;
    const valid = parsed.every(
      (p) => NOTE_NAMES.includes(p.name) && Number.isInteger(p.octave),
    );
    return valid ? makeCustomTuning(parsed) : fallback;
  } catch {
    return fallback;
  }
}

export function saveCustomTuning(tuning: Tuning): void {
  if (typeof window === 'undefined') return;
  try {
    const payload = tuning.strings.map((str) => ({ name: str.name, octave: str.octave }));
    window.localStorage.setItem(CUSTOM_TUNING_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable — ignore */
  }
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

// Chromatic note names indexed by semitone within an octave (C = 0).
const CHROMATIC: readonly NoteName[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

// Maps any frequency to the closest equal-tempered note (full 12-tone scale,
// any octave). Returns the same shape as a guitar string so the Tuner can
// render it without special-casing. Used by the tuner's chromatic mode.
export function nearestNote(freq: number): GuitarString {
  // MIDI number of the pitch, rounded to the nearest semitone.
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = CHROMATIC[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { id: `${name}${octave}`, name, octave, freq: noteFreq(name, octave) };
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
