// Pure music-theory utilities for major scales.
// Built from the rule in the source book: pick the next letter A..G each step,
// then add accidentals so the W-W-h-W-W-W-h pattern (in semitones: 2-2-1-2-2-2-1)
// resolves to the right pitch.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

const LETTER_SEMI: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

// Cumulative semitone offsets from the tonic for each scale degree.
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;
const HARMONIC_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 11] as const; // raised 7th
const MELODIC_MINOR_STEPS = [0, 2, 3, 5, 7, 9, 11] as const; // ascending form

export type MinorVariant = 'natural' | 'harmonic' | 'melodic';

const MINOR_STEPS: Record<MinorVariant, readonly number[]> = {
  natural: NATURAL_MINOR_STEPS,
  harmonic: HARMONIC_MINOR_STEPS,
  melodic: MELODIC_MINOR_STEPS,
};

// All conventional major-key tonics. Spellings chosen so the no-repeat-letter
// rule produces the canonical scale (e.g. F# major, not Gb major, by default).
export const KEYS = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
] as const;
export type Key = (typeof KEYS)[number];

// Conventional minor-key tonics — the relative minors of the major KEYS.
// Spellings chosen so the natural-minor no-repeat-letter rule resolves
// cleanly (e.g. D# minor, not Eb minor, as the relative of F# major).
export const MINOR_KEYS = [
  'A',
  'E',
  'B',
  'F#',
  'C#',
  'G#',
  'D#',
  'A#',
  'D',
  'G',
  'C',
  'F',
  'Bb',
  'Eb',
] as const;
export type MinorKey = (typeof MINOR_KEYS)[number];

function accVal(acc: string): number {
  let v = 0;
  for (const c of acc) v += c === '#' ? 1 : c === 'b' ? -1 : 0;
  return v;
}

export function noteSemi(note: string): number {
  const letter = note[0] as Letter;
  return (LETTER_SEMI[letter] + accVal(note.slice(1)) + 12) % 12;
}

// Builds a 7-note scale from a cumulative-semitone step pattern, walking the
// letters A..G once each and adding the accidental needed to hit each pitch.
function buildScale(tonic: string, steps: readonly number[]): string[] {
  const tonicLetter = tonic[0] as Letter;
  const tonicAcc = tonic.slice(1);
  const tonicSemi = (LETTER_SEMI[tonicLetter] + accVal(tonicAcc) + 12) % 12;

  const startIdx = LETTERS.indexOf(tonicLetter);
  const notes: string[] = [];
  for (let i = 0; i < 7; i++) {
    const letter = LETTERS[(startIdx + i) % 7];
    const targetSemi = (tonicSemi + steps[i]) % 12;
    const naturalSemi = LETTER_SEMI[letter];
    let diff = (targetSemi - naturalSemi + 12) % 12;
    if (diff > 6) diff -= 12; // -2..+2
    const acc =
      diff === 0
        ? ''
        : diff === 1
          ? '#'
          : diff === -1
            ? 'b'
            : diff === 2
              ? '##'
              : diff === -2
                ? 'bb'
                : '?';
    notes.push(letter + acc);
  }
  return notes;
}

export function buildMajorScale(tonic: string): string[] {
  return buildScale(tonic, MAJOR_STEPS);
}

export function buildMinorScale(tonic: string, variant: MinorVariant = 'natural'): string[] {
  return buildScale(tonic, MINOR_STEPS[variant]);
}

// Pick `count` distinct indices in 0..6 to hide. Deterministic when `rand` is
// supplied (used by tests); defaults to Math.random.
export function pickHiddenIndices(count: number, rand: () => number = Math.random): number[] {
  const idx = [0, 1, 2, 3, 4, 5, 6];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, count).sort((a, b) => a - b);
}

// True if two note spellings refer to the same pitch class (e.g. C# === Db).
export function enharmonicEqual(a: string, b: string): boolean {
  return noteSemi(a) === noteSemi(b);
}

// Octave offset (0 or 1) for the i-th degree of a major scale starting on
// `tonic`, so that the whole scale ascends continuously instead of wrapping
// back down when the letter sequence rolls over from B to C.
//
// E.g. G major: G A B (octave 0) C D E F# (octave 1, octave-up bookend at i=7).
export function ascendingOctave(i: number, tonic: string): 0 | 1 {
  if (i >= 7) return 1; // closing-tonic bookend always sits an octave up
  const tonicIdx = LETTERS.indexOf(tonic[0] as Letter);
  const letterIdx = LETTERS.indexOf(LETTERS[(tonicIdx + i) % 7]);
  return letterIdx < tonicIdx ? 1 : 0;
}
