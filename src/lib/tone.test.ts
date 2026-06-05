import { describe, expect, it } from 'vitest';
import { noteFrequency, octaveAbove } from './tone';

describe('noteFrequency', () => {
  it('returns A4 = 440 Hz', () => {
    // A is 9 semitones above C → octave 0 reaches A4.
    expect(noteFrequency('A', 0)).toBeCloseTo(440, 5);
  });

  it('returns C4 ≈ 261.626 Hz', () => {
    expect(noteFrequency('C', 0)).toBeCloseTo(261.6256, 3);
  });

  it('treats C# and Db as the same pitch (enharmonic)', () => {
    expect(noteFrequency('C#', 0)).toBeCloseTo(noteFrequency('Db', 0), 5);
  });

  it('jumps an octave between octave 0 and octave 1', () => {
    expect(noteFrequency('C', 1) / noteFrequency('C', 0)).toBeCloseTo(2, 5);
  });

  // B# is enharmonic with C, but spelled with letter B and a sharp it sits
  // *one semitone above B* — i.e. the next C up — not at the bottom of the
  // same octave. Same idea for Cb (one below C, equal to the previous B).
  it('treats B# as one semitone above B at the same letter octave', () => {
    expect(noteFrequency('B#', 0)).toBeCloseTo(noteFrequency('C', 1), 5);
  });

  it('treats Cb as one semitone below C at the same letter octave', () => {
    // Cb in octave 0 should equal the B in the octave below (which we model
    // as octave -1, but the simpler check is C0 / 2^(1/12) → ≈246.94 Hz).
    expect(noteFrequency('Cb', 0)).toBeCloseTo(noteFrequency('C', 0) / Math.pow(2, 1 / 12), 4);
  });
});

describe('octaveAbove', () => {
  it('keeps the root and higher-lettered tones in octave 0', () => {
    // C major: C E G all sit at or above C's letter.
    expect(octaveAbove('C', 'C')).toBe(0);
    expect(octaveAbove('C', 'E')).toBe(0);
    expect(octaveAbove('C', 'G')).toBe(0);
  });

  it('lifts tones below the root into octave 1', () => {
    // A major (A C# E): C# and E are spelled below A, so they rise an octave
    // to sound above the root rather than below it.
    expect(octaveAbove('A', 'A')).toBe(0);
    expect(octaveAbove('A', 'C#')).toBe(1);
    expect(octaveAbove('A', 'E')).toBe(1);
  });

  it('arpeggiates a chord strictly upward from the root', () => {
    const notes = ['A', 'C#', 'E', 'G#']; // A maj7
    const freqs = notes.map((n) => noteFrequency(n, octaveAbove('A', n)));
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i]).toBeGreaterThan(freqs[i - 1]);
    }
  });
});
