import { describe, expect, it } from 'vitest';
import { STRINGS, TUNINGS, centsOff, getTuningHint, isInTune, nearestString } from './tuning';

describe('STRINGS', () => {
  it('contains the six standard guitar strings in pitch order', () => {
    expect(STRINGS.map((s) => s.id)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });

  it('has monotonically increasing frequencies', () => {
    for (let i = 1; i < STRINGS.length; i++) {
      expect(STRINGS[i].freq).toBeGreaterThan(STRINGS[i - 1].freq);
    }
  });
});

describe('centsOff', () => {
  it('returns 0 when freq matches target exactly', () => {
    expect(centsOff(440, 440)).toBe(0);
  });

  it('returns +100 for one semitone sharp', () => {
    expect(centsOff(440 * Math.pow(2, 1 / 12), 440)).toBeCloseTo(100, 5);
  });

  it('returns -100 for one semitone flat', () => {
    expect(centsOff(440 / Math.pow(2, 1 / 12), 440)).toBeCloseTo(-100, 5);
  });
});

describe('nearestString', () => {
  it('picks E2 for 82.41 Hz', () => {
    expect(nearestString(82.41).id).toBe('E2');
  });

  it('picks A2 for 110 Hz', () => {
    expect(nearestString(110).id).toBe('A2');
  });

  it('picks E4 for 329 Hz', () => {
    expect(nearestString(329).id).toBe('E4');
  });

  it('picks G3 for a slightly flat G (195 Hz)', () => {
    expect(nearestString(195).id).toBe('G3');
  });

  it('picks B3 rather than A2 for 230 Hz (midway but closer to B3 in cents)', () => {
    // B3 = 246.94, A2 = 110. 230 is way closer to B3.
    expect(nearestString(230).id).toBe('B3');
  });
});

describe('isInTune', () => {
  it('accepts small deviations within default tolerance', () => {
    expect(isInTune(3)).toBe(true);
    expect(isInTune(-5)).toBe(true);
  });

  it('rejects deviations outside tolerance', () => {
    expect(isInTune(10)).toBe(false);
    expect(isInTune(-12)).toBe(false);
  });
});

describe('getTuningHint', () => {
  it('returns ok for small cents values', () => {
    expect(getTuningHint(2)).toBe('ok');
    expect(getTuningHint(-4)).toBe('ok');
  });

  it('returns tiefer for sharp notes (need to tune down)', () => {
    expect(getTuningHint(15)).toBe('tiefer');
  });

  it('returns hoeher for flat notes (need to tune up)', () => {
    expect(getTuningHint(-15)).toBe('hoeher');
  });
});

describe('TUNINGS', () => {
  it('starts with the standard tuning that matches STRINGS', () => {
    expect(TUNINGS[0].id).toBe('standard');
    expect(TUNINGS[0].strings).toEqual(STRINGS);
  });

  it('every preset has six strings ordered by ascending frequency', () => {
    for (const t of TUNINGS) {
      expect(t.strings).toHaveLength(6);
      for (let i = 1; i < t.strings.length; i++) {
        expect(t.strings[i].freq).toBeGreaterThan(t.strings[i - 1].freq);
      }
    }
  });

  it('Drop D drops the low E to D2', () => {
    const dropD = TUNINGS.find((t) => t.id === 'drop-d')!;
    expect(dropD.strings[0].id).toBe('D2');
    expect(dropD.strings.slice(1).map((s) => s.id)).toEqual(['A2', 'D3', 'G3', 'B3', 'E4']);
  });

  it('DADGAD strings are D2 A2 D3 G3 A3 D4', () => {
    const dadgad = TUNINGS.find((t) => t.id === 'dadgad')!;
    expect(dadgad.strings.map((s) => s.id)).toEqual(['D2', 'A2', 'D3', 'G3', 'A3', 'D4']);
  });
});

describe('nearestString with custom tunings', () => {
  it('uses the supplied string list when provided', () => {
    const dropD = TUNINGS.find((t) => t.id === 'drop-d')!;
    // ~73 Hz is closer to D2 (~73.42) than to E2 (~82.41)
    expect(nearestString(73, dropD.strings).id).toBe('D2');
  });

  it('falls back to standard tuning when no strings argument is given', () => {
    expect(nearestString(82).id).toBe('E2');
  });
});
