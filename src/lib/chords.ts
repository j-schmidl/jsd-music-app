// Pure music-theory utilities for chords.
// A chord is a root plus a set of intervals. Each interval also carries the
// letter step it should be spelled with (a triad stacks thirds, so its tones
// land on every other letter), so the note names come out correct — e.g.
// C augmented is C E G#, not C E Ab.

import { LETTERS, noteSemi, type Letter } from './scales';

const LETTER_SEMI: Record<Letter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function accVal(acc: string): number {
  let v = 0;
  for (const c of acc) v += c === '#' ? 1 : c === 'b' ? -1 : 0;
  return v;
}

// A chord tone: how many letters above the root it sits, and how many
// semitones above the root it sounds.
type Tone = { letterStep: number; semitones: number };

export type ChordType = {
  // Stable id used in state / data-testid.
  id: string;
  // Suffix appended to the root for the chord's name, e.g. 'm', 'dim', '7'.
  suffix: string;
  // Human-readable German name of the quality, e.g. 'Moll', 'vermindert'.
  label: string;
  // The chord tones, root first.
  tones: readonly Tone[];
};

// All chord types the game covers. Triads stack thirds (letterStep 0,2,4);
// sus chords replace the third with a 2nd or 4th; sevenths add a 6th-letter.
export const CHORD_TYPES: readonly ChordType[] = [
  { id: 'major', suffix: '', label: 'Dur', tones: t([0, 0], [2, 4], [4, 7]) },
  { id: 'minor', suffix: 'm', label: 'Moll', tones: t([0, 0], [2, 3], [4, 7]) },
  { id: 'dim', suffix: 'dim', label: 'vermindert', tones: t([0, 0], [2, 3], [4, 6]) },
  { id: 'aug', suffix: 'aug', label: 'übermäßig', tones: t([0, 0], [2, 4], [4, 8]) },
  { id: 'sus2', suffix: 'sus2', label: 'Sus2', tones: t([0, 0], [1, 2], [4, 7]) },
  { id: 'sus4', suffix: 'sus4', label: 'Sus4', tones: t([0, 0], [3, 5], [4, 7]) },
  { id: 'maj7', suffix: 'maj7', label: 'Dur-Sept', tones: t([0, 0], [2, 4], [4, 7], [6, 11]) },
  { id: 'dom7', suffix: '7', label: 'Dominantsept', tones: t([0, 0], [2, 4], [4, 7], [6, 10]) },
  { id: 'min7', suffix: 'm7', label: 'Moll-Sept', tones: t([0, 0], [2, 3], [4, 7], [6, 10]) },
  { id: 'dim7', suffix: 'dim7', label: 'verm. Sept', tones: t([0, 0], [2, 3], [4, 6], [6, 9]) },
];

function t(...pairs: [number, number][]): Tone[] {
  return pairs.map(([letterStep, semitones]) => ({ letterStep, semitones }));
}

// Common chord roots — the 12 pitch classes with their conventional spelling.
export const CHORD_ROOTS = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'Bb',
  'B',
] as const;
export type ChordRoot = (typeof CHORD_ROOTS)[number];

export function chordTypeById(id: string): ChordType | undefined {
  return CHORD_TYPES.find((c) => c.id === id);
}

// Spells one chord tone: pick the letter `letterStep` above the root, then add
// the accidental needed to reach `semitones` above the root's pitch.
function spellTone(root: string, tone: Tone): string {
  const rootLetter = root[0] as Letter;
  const rootSemi = (LETTER_SEMI[rootLetter] + accVal(root.slice(1)) + 12) % 12;
  const rootIdx = LETTERS.indexOf(rootLetter);
  const letter = LETTERS[(rootIdx + tone.letterStep) % 7];
  const targetSemi = (rootSemi + tone.semitones) % 12;
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
  return letter + acc;
}

// Returns the correctly-spelled note names of a chord, root first.
export function buildChord(root: string, type: ChordType): string[] {
  return type.tones.map((tone) => spellTone(root, tone));
}

// The chord's display name, e.g. 'C', 'Am', 'G7', 'D#dim'.
export function chordName(root: string, type: ChordType): string {
  return root + type.suffix;
}

// True if two note lists describe the same chord by pitch (order-independent),
// so an enharmonic answer (C# vs Db) still counts as the right pitches.
export function sameChordPitches(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const pa = [...a.map(noteSemi)].sort((x, y) => x - y);
  const pb = [...b.map(noteSemi)].sort((x, y) => x - y);
  return pa.every((v, i) => v === pb[i]);
}
