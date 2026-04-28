import { describe, expect, it } from 'vitest';
import {
  KEYS,
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
