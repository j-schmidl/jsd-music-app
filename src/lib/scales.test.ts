import { describe, expect, it } from 'vitest';
import {
  KEYS,
  ascendingOctave,
  buildMajorScale,
  enharmonicEqual,
  noteSemi,
  pickHiddenIndices,
} from './scales';

describe('buildMajorScale', () => {
  it('builds C major with no accidentals', () => {
    expect(buildMajorScale('C')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  });

  it('builds the sharp keys correctly', () => {
    expect(buildMajorScale('G')).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
    expect(buildMajorScale('D')).toEqual(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']);
    expect(buildMajorScale('A')).toEqual(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']);
    expect(buildMajorScale('E')).toEqual(['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#']);
    expect(buildMajorScale('B')).toEqual(['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#']);
    expect(buildMajorScale('F#')).toEqual(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
    expect(buildMajorScale('C#')).toEqual(['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#']);
  });

  it('builds the flat keys correctly', () => {
    expect(buildMajorScale('F')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
    expect(buildMajorScale('Bb')).toEqual(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']);
    expect(buildMajorScale('Eb')).toEqual(['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);
    expect(buildMajorScale('Ab')).toEqual(['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G']);
    expect(buildMajorScale('Db')).toEqual(['Db', 'Eb', 'F', 'Gb', 'Ab', 'Bb', 'C']);
    expect(buildMajorScale('Gb')).toEqual(['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
  });

  it('produces 7 notes with no repeated letters for every key', () => {
    for (const k of KEYS) {
      const notes = buildMajorScale(k);
      expect(notes).toHaveLength(7);
      const letters = notes.map((n) => n[0]);
      expect(new Set(letters).size).toBe(7);
    }
  });
});

describe('noteSemi', () => {
  it('returns the right pitch class for naturals', () => {
    expect(noteSemi('C')).toBe(0);
    expect(noteSemi('A')).toBe(9);
  });

  it('handles sharps and flats', () => {
    expect(noteSemi('C#')).toBe(1);
    expect(noteSemi('Db')).toBe(1);
    expect(noteSemi('Bb')).toBe(10);
  });

  it('wraps for B# and Cb', () => {
    expect(noteSemi('B#')).toBe(0);
    expect(noteSemi('Cb')).toBe(11);
  });
});

describe('enharmonicEqual', () => {
  it('considers C# and Db equal', () => {
    expect(enharmonicEqual('C#', 'Db')).toBe(true);
  });
  it('considers C and D not equal', () => {
    expect(enharmonicEqual('C', 'D')).toBe(false);
  });
  it('considers B# and C equal', () => {
    expect(enharmonicEqual('B#', 'C')).toBe(true);
  });
});

describe('ascendingOctave', () => {
  it('keeps C major in the same octave for slots 0..6 and bumps the bookend', () => {
    // C major: C D E F G A B → no wrap, all octave 0; closing C at i=7 → 1.
    for (let i = 0; i < 7; i++) {
      expect(ascendingOctave(i, 'C')).toBe(0);
    }
    expect(ascendingOctave(7, 'C')).toBe(1);
  });

  it('bumps the octave once the scale wraps past the alphabet (G major)', () => {
    // G major: G A B (octave 0) C D E F# (octave 1) + closing G (octave 1)
    expect(ascendingOctave(0, 'G')).toBe(0); // G
    expect(ascendingOctave(1, 'G')).toBe(0); // A
    expect(ascendingOctave(2, 'G')).toBe(0); // B
    expect(ascendingOctave(3, 'G')).toBe(1); // C — wraps
    expect(ascendingOctave(4, 'G')).toBe(1); // D
    expect(ascendingOctave(5, 'G')).toBe(1); // E
    expect(ascendingOctave(6, 'G')).toBe(1); // F#
    expect(ascendingOctave(7, 'G')).toBe(1); // closing G
  });

  it('bumps right after the tonic for B major (only B is below C)', () => {
    // B major: B (octave 0) C# D# E F# G# A# (octave 1) + closing B (1)
    expect(ascendingOctave(0, 'B')).toBe(0);
    for (let i = 1; i <= 7; i++) {
      expect(ascendingOctave(i, 'B')).toBe(1);
    }
  });
});

describe('pickHiddenIndices', () => {
  it('returns the requested number of distinct indices in 0..6', () => {
    for (const n of [3, 5, 6]) {
      const out = pickHiddenIndices(n);
      expect(out).toHaveLength(n);
      expect(new Set(out).size).toBe(n);
      for (const i of out) expect(i).toBeGreaterThanOrEqual(0);
      for (const i of out) expect(i).toBeLessThanOrEqual(6);
    }
  });

  it('is deterministic when a seeded rand is supplied', () => {
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    let i = 0;
    const rand = () => seq[i++ % seq.length];
    i = 0;
    const a = pickHiddenIndices(5, rand);
    i = 0;
    const b = pickHiddenIndices(5, rand);
    expect(a).toEqual(b);
  });
});
