import { describe, expect, it } from 'vitest';
import { noteFrequency } from './tone';

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
