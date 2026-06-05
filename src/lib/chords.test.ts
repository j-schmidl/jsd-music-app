import { describe, expect, it } from 'vitest';
import {
  CHORD_ROOTS,
  CHORD_TYPES,
  DIFFICULTIES,
  buildChord,
  chordName,
  chordTypeById,
  chordTypesFor,
  sameChordPitches,
} from './chords';
import { noteSemi } from './scales';

function chord(root: string, typeId: string): string[] {
  return buildChord(root, chordTypeById(typeId)!);
}

describe('buildChord — triads', () => {
  it('C major = C E G', () => {
    expect(chord('C', 'major')).toEqual(['C', 'E', 'G']);
  });

  it('A minor = A C E', () => {
    expect(chord('A', 'minor')).toEqual(['A', 'C', 'E']);
  });

  it('B diminished = B D F', () => {
    expect(chord('B', 'dim')).toEqual(['B', 'D', 'F']);
  });

  it('C augmented = C E G# (sharp 5, not flat 6)', () => {
    expect(chord('C', 'aug')).toEqual(['C', 'E', 'G#']);
  });

  it('C sus2 = C D G (second instead of third)', () => {
    expect(chord('C', 'sus2')).toEqual(['C', 'D', 'G']);
  });

  it('C sus4 = C F G (fourth instead of third)', () => {
    expect(chord('C', 'sus4')).toEqual(['C', 'F', 'G']);
  });
});

describe('buildChord — sevenths', () => {
  it('C major 7 = C E G B', () => {
    expect(chord('C', 'maj7')).toEqual(['C', 'E', 'G', 'B']);
  });

  it('C dominant 7 = C E G Bb', () => {
    expect(chord('C', 'dom7')).toEqual(['C', 'E', 'G', 'Bb']);
  });

  it('A minor 7 = A C E G', () => {
    expect(chord('A', 'min7')).toEqual(['A', 'C', 'E', 'G']);
  });

  it('C diminished 7 = C Eb Gb Bbb', () => {
    expect(chord('C', 'dim7')).toEqual(['C', 'Eb', 'Gb', 'Bbb']);
  });
});

describe('buildChord — every root and type', () => {
  it('produces tones at the right pitch classes for all combinations', () => {
    for (const root of CHORD_ROOTS) {
      for (const type of CHORD_TYPES) {
        const notes = buildChord(root, type);
        expect(notes).toHaveLength(type.tones.length);
        // Each tone's pitch class must match root + interval.
        const rootSemi = noteSemi(root);
        type.tones.forEach((tone, i) => {
          expect(noteSemi(notes[i])).toBe((rootSemi + tone.semitones) % 12);
        });
      }
    }
  });
});

describe('chordName', () => {
  it('names a major chord by the bare root', () => {
    expect(chordName('C', chordTypeById('major')!)).toBe('C');
  });

  it('appends the suffix for other qualities', () => {
    expect(chordName('A', chordTypeById('minor')!)).toBe('Am');
    expect(chordName('G', chordTypeById('dom7')!)).toBe('G7');
    expect(chordName('D#', chordTypeById('dim')!)).toBe('D#dim');
  });
});

describe('chordTypesFor — difficulty tiers', () => {
  const ids = (d: Parameters<typeof chordTypesFor>[0]) => chordTypesFor(d).map((t) => t.id);

  it('leicht offers only Dur & Moll', () => {
    expect(ids('leicht')).toEqual(['major', 'minor']);
  });

  it('mittel adds sus + sevenths but excludes verm./übermäßig', () => {
    const m = ids('mittel');
    expect(m).toContain('sus2');
    expect(m).toContain('dom7');
    expect(m).not.toContain('dim');
    expect(m).not.toContain('aug');
    expect(m).not.toContain('dim7');
  });

  it('schwer offers the full set', () => {
    expect(ids('schwer')).toEqual(CHORD_TYPES.map((t) => t.id));
  });

  it('each tier is a non-empty subset returned in CHORD_TYPES order', () => {
    for (const d of DIFFICULTIES) {
      const types = chordTypesFor(d.id);
      expect(types.length).toBeGreaterThan(0);
      const order = types.map((t) => CHORD_TYPES.indexOf(t));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
});

describe('sameChordPitches', () => {
  it('matches the same chord regardless of note order', () => {
    expect(sameChordPitches(['C', 'E', 'G'], ['G', 'C', 'E'])).toBe(true);
  });

  it('matches enharmonic spellings', () => {
    expect(sameChordPitches(['C#', 'F', 'G#'], ['Db', 'F', 'Ab'])).toBe(true);
  });

  it('rejects a different chord', () => {
    expect(sameChordPitches(['C', 'E', 'G'], ['C', 'Eb', 'G'])).toBe(false);
  });

  it('rejects lists of different length', () => {
    expect(sameChordPitches(['C', 'E', 'G'], ['C', 'E', 'G', 'B'])).toBe(false);
  });
});
