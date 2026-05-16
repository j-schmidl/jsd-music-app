// Plays short pitched "plinks" via Web Audio so the user hears each note they
// click in the Major Scales game. Uses a single AudioContext (lazy-created on
// first play, since iOS Safari only allows it inside a user gesture) and a
// triangle oscillator with a quick envelope.

let ctx: AudioContext | null = null;

const LETTER_SEMI: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

// Un-modded semitone offset within the letter's octave: B# returns 12, Cb
// returns -1. Differs from `noteSemi` (which collapses to a pitch class)
// because we need the actual pitch, not just its class.
function semitoneOffset(note: string): number {
  const letter = note[0];
  let acc = 0;
  for (const c of note.slice(1)) {
    if (c === '#') acc += 1;
    else if (c === 'b') acc -= 1;
  }
  return LETTER_SEMI[letter] + acc;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

// Octave is 0 for the lower keyboard half (C4..B4) and 1 for the upper
// (C5..B5). For picker chips with no piano context, callers pass 0 and the
// note plays in the C4 octave.
//
// Spelling matters: B# in octave 0 is one semitone *above* B4 = C5, not C4.
// We use the un-modded letter+accidental offset so the played pitch matches
// where the note sits in standard staff notation.
export function noteFrequency(note: string, octave: 0 | 1): number {
  const offset = semitoneOffset(note);
  // A4 = 440 Hz, MIDI 69. C4 = MIDI 60, C5 = MIDI 72.
  const midi = 60 + octave * 12 + offset;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function emit(audio: AudioContext, freq: number, durationMs: number): void {
  const seconds = durationMs / 1000;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  // Short, soft envelope so successive clicks don't overlap unpleasantly.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds * 0.9);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + seconds);
}

export function playFrequency(freq: number, durationMs = 550): void {
  const audio = getCtx();
  if (!audio) return;
  // The context starts suspended (autoplay policy). resume() is async — if we
  // scheduled the oscillator off the pre-resume currentTime the first note
  // would land in the past and stay silent. So wait for resume to settle.
  if (audio.state === 'suspended') {
    void audio.resume().then(() => emit(audio, freq, durationMs));
    return;
  }
  emit(audio, freq, durationMs);
}

export function playNote(note: string, octave: 0 | 1 = 0): void {
  playFrequency(noteFrequency(note, octave));
}
