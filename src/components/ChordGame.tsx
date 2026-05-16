import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CHORD_ROOTS,
  CHORD_TYPES,
  buildChord,
  chordName,
  sameChordPitches,
  type ChordType,
} from '../lib/chords';
import { enharmonicEqual, noteSemi } from '../lib/scales';
import { playNote } from '../lib/tone';
import { Piano } from './Piano';
import './ChordGame.css';

// Which way round the puzzle runs this round. Picked randomly each round so
// the game type stays hidden, like the scale games.
type Direction = 'name' | 'notes';

const DIRECTIONS: Direction[] = ['name', 'notes'];

function pickRandom<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

// Note picker chips — flat, natural, sharp per letter (ascending in pitch).
const NOTE_OPTIONS = (() => {
  const out: string[] = [];
  for (const L of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
    out.push(`${L}b`, L, `${L}#`);
  }
  return out;
})();

// Theory help shown in the collapsible info panel.
const CHORD_INFO: readonly { term: string; text: string }[] = [
  {
    term: 'Dur & Moll',
    text: 'Ein Dur-Dreiklang stapelt eine große und eine kleine Terz: Grundton, +4 und +7 Halbtöne (C E G). Moll dreht das um — kleine, dann große Terz: +3 und +7 (C E♭ G).',
  },
  {
    term: 'Vermindert (dim)',
    text: 'Zwei kleine Terzen übereinander: +3 und +6 Halbtöne. Die Quinte ist also erniedrigt (C E♭ G♭). Klingt gespannt und unaufgelöst.',
  },
  {
    term: 'Übermäßig (aug)',
    text: 'Zwei große Terzen: +4 und +8 Halbtöne. Die Quinte ist erhöht (C E G♯). Klingt schwebend, ohne klares Zentrum.',
  },
  {
    term: 'Sus2 & Sus4',
    text: '„Sus" steht für suspended — die Terz wird ausgesetzt. Sus2 ersetzt sie durch die große Sekunde (C D G), Sus4 durch die Quarte (C F G). Dadurch klingt der Akkord weder Dur noch Moll.',
  },
  {
    term: 'Septakkorde',
    text: 'Ein Vierklang mit zusätzlicher Septime. Dur7 (maj7) fügt die große Septime hinzu (+11), Dominant7 die kleine (+10), Moll7 sitzt auf einem Moll-Dreiklang (+10) und vermindert7 stapelt drei kleine Terzen (+3 +6 +9).',
  },
];

const STORAGE_KEY = 'jsd-chordgame-settings';
const AUTO_ADVANCE_SECONDS = 5;

type Settings = { rootChoice: 'random' | string };

function loadSettings(): Settings {
  const fallback: Settings = { rootChoice: 'random' };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const rootChoice =
      parsed.rootChoice === 'random' ||
      (typeof parsed.rootChoice === 'string' &&
        (CHORD_ROOTS as readonly string[]).includes(parsed.rootChoice))
        ? (parsed.rootChoice as 'random' | string)
        : 'random';
    return { rootChoice };
  } catch {
    return fallback;
  }
}

function saveSettings(s: Settings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

type Round = { root: string; type: ChordType; notes: string[] };

function buildRound(rootChoice: 'random' | string): Round {
  const root = rootChoice === 'random' ? pickRandom(CHORD_ROOTS) : rootChoice;
  const type = pickRandom(CHORD_TYPES);
  return { root, type, notes: buildChord(root, type) };
}

export function ChordGame() {
  const initialSettings = useMemo(() => loadSettings(), []);
  const [rootChoice, setRootChoice] = useState<'random' | string>(initialSettings.rootChoice);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    saveSettings({ rootChoice });
  }, [rootChoice]);

  const [direction, setDirection] = useState<Direction>(() => pickRandom(DIRECTIONS));
  const [round, setRound] = useState<Round>(() => buildRound(initialSettings.rootChoice));
  const [done, setDone] = useState(false);
  const [score, setScore] = useState({ correct: 0, attempts: 0 });
  const [feedback, setFeedback] = useState<{
    kind: 'good' | 'bad' | 'warn' | 'info';
    text: string;
  } | null>(null);

  // --- name direction: user's root + quality guess ---
  const [guessRoot, setGuessRoot] = useState<string>('');
  const [guessType, setGuessType] = useState<string>('');

  // --- notes direction: notes the user has placed so far ---
  const [placed, setPlaced] = useState<string[]>([]);

  const [countdown, setCountdown] = useState<number | null>(null);

  const newRound = useCallback(() => {
    setCountdown(null);
    setDirection(pickRandom(DIRECTIONS));
    setRound(buildRound(rootChoice));
    setDone(false);
    setFeedback(null);
    setGuessRoot('');
    setGuessType('');
    setPlaced([]);
  }, [rootChoice]);

  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootChoice]);

  // Auto-advance after a correct round.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      newRound();
      return;
    }
    const t = window.setTimeout(() => setCountdown((c) => (c === null ? c : c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [countdown, newRound]);

  const correctName = chordName(round.root, round.type);

  // Plays the chord's notes as a quick arpeggio.
  const playChord = useCallback((notes: readonly string[]) => {
    notes.forEach((n, i) => {
      window.setTimeout(() => playNote(n, 0), i * 140);
    });
  }, []);

  // ---- "name" direction: check the picked root + quality ----
  const checkName = () => {
    if (done) return;
    if (!guessRoot || !guessType) {
      setFeedback({ kind: 'bad', text: 'Bitte Grundton und Akkord-Art wählen.' });
      return;
    }
    const rootRight = enharmonicEqual(guessRoot, round.root);
    const typeRight = guessType === round.type.id;
    setDone(true);
    if (rootRight && typeRight) {
      setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 }));
      setFeedback({
        kind: 'good',
        text: `Richtig! ${correctName} = ${round.notes.join(' ')}`,
      });
      playChord(round.notes);
      setCountdown(AUTO_ADVANCE_SECONDS);
    } else {
      setScore((s) => ({ ...s, attempts: s.attempts + 1 }));
      setFeedback({
        kind: 'bad',
        text: `Leider falsch. Richtig: ${correctName} (${round.type.label}) = ${round.notes.join(' ')}`,
      });
    }
  };

  // ---- "notes" direction: place / remove notes ----
  const togglePlaced = (note: string) => {
    if (done) return;
    playNote(note, 0);
    setPlaced((prev) => {
      // Same pitch already placed → remove it (lets the user correct).
      const existing = prev.find((p) => noteSemi(p) === noteSemi(note));
      if (existing) return prev.filter((p) => p !== existing);
      if (prev.length >= round.notes.length) return prev; // chord is full
      return [...prev, note];
    });
  };

  const checkNotes = () => {
    if (done) return;
    if (placed.length !== round.notes.length) {
      setFeedback({
        kind: 'bad',
        text: `Der Akkord hat ${round.notes.length} Töne — du hast ${placed.length} gewählt.`,
      });
      return;
    }
    const exact =
      placed.length === round.notes.length &&
      [...placed].sort().join() === [...round.notes].sort().join();
    const pitchesRight = sameChordPitches(placed, round.notes);
    setDone(true);
    if (exact) {
      setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 }));
      setFeedback({ kind: 'good', text: `Richtig! ${correctName} = ${round.notes.join(' ')}` });
      playChord(round.notes);
      setCountdown(AUTO_ADVANCE_SECONDS);
    } else if (pitchesRight) {
      // Right pitches, enharmonic spelling — accepted with a yellow note.
      setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 }));
      setFeedback({
        kind: 'warn',
        text: `Fast! Richtige Töne, andere Schreibweise. Korrekt: ${correctName} = ${round.notes.join(' ')}`,
      });
      playChord(round.notes);
      setCountdown(AUTO_ADVANCE_SECONDS);
    } else {
      setScore((s) => ({ ...s, attempts: s.attempts + 1 }));
      setFeedback({
        kind: 'bad',
        text: `Leider falsch. Richtig: ${correctName} = ${round.notes.join(' ')}`,
      });
    }
  };

  const reveal = () => {
    setDone(true);
    setScore((s) => ({ ...s, attempts: s.attempts + 1 }));
    setFeedback({
      kind: 'info',
      text: `Auflösung: ${correctName} (${round.type.label}) = ${round.notes.join(' ')}`,
    });
    playChord(round.notes);
  };

  return (
    <section className="chord-game" data-testid="chord-game">
      <h2 className="chord-game__title">Akkorde erkennen</h2>
      <p className="chord-game__sub">Dur, Moll, vermindert, übermäßig, sus und Septakkorde.</p>

      <button
        type="button"
        data-testid="info-toggle"
        className="chord-game__info-toggle"
        aria-expanded={infoOpen}
        onClick={() => setInfoOpen((o) => !o)}
      >
        <span aria-hidden="true">{infoOpen ? '▾' : '▸'}</span>
        Wie sind Akkorde aufgebaut?
      </button>
      {infoOpen && (
        <dl className="chord-game__info" data-testid="info-panel">
          {CHORD_INFO.map((entry) => (
            <div key={entry.term} className="chord-game__info-row">
              <dt className="chord-game__info-term">{entry.term}</dt>
              <dd className="chord-game__info-text">{entry.text}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="chord-game__controls">
        <button
          type="button"
          data-testid="settings-toggle"
          className="chord-game__settings-toggle"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((s) => !s)}
        >
          <span className="chord-game__settings-label">Einstellungen</span>
          <span className="chord-game__settings-summary" data-testid="settings-summary">
            Grundton: {rootChoice === 'random' ? 'Zufall' : rootChoice}
          </span>
          <span aria-hidden="true">{settingsOpen ? '▾' : '▸'}</span>
        </button>
        <button
          type="button"
          data-testid="new-round"
          className="chord-game__primary chord-game__new-round"
          onClick={newRound}
        >
          Neue Runde
        </button>
      </div>

      {settingsOpen && (
        <div className="chord-game__settings" data-testid="settings-panel">
          <label className="chord-game__field">
            <span>Grundton</span>
            <select
              data-testid="root-select"
              value={rootChoice}
              onChange={(e) => setRootChoice(e.target.value)}
            >
              <option value="random">Zufall</option>
              {CHORD_ROOTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {direction === 'name' ? (
        <NameDirection
          notes={round.notes}
          guessRoot={guessRoot}
          guessType={guessType}
          done={done}
          onPickRoot={setGuessRoot}
          onPickType={setGuessType}
          onPlay={() => playChord(round.notes)}
        />
      ) : (
        <NotesDirection
          chordLabel={`${correctName} (${round.type.label})`}
          targetCount={round.notes.length}
          placed={placed}
          done={done}
          noteOptions={NOTE_OPTIONS}
          onToggle={togglePlaced}
        />
      )}

      <div className="chord-game__actions">
        <button
          type="button"
          data-testid="check"
          className="chord-game__primary"
          onClick={direction === 'name' ? checkName : checkNotes}
          disabled={done}
        >
          Prüfen
        </button>
        <button
          type="button"
          data-testid="reveal"
          className="chord-game__secondary"
          onClick={reveal}
          disabled={done}
        >
          Auflösen
        </button>
      </div>

      {countdown !== null && (
        <button
          type="button"
          data-testid="next-chord"
          className="chord-game__next"
          onClick={newRound}
        >
          Nächster Akkord! <span data-testid="next-countdown">({countdown})</span>
        </button>
      )}

      <div
        className={`chord-game__feedback chord-game__feedback--${feedback?.kind ?? 'none'}`}
        data-testid="feedback"
        aria-live="polite"
      >
        {feedback?.text ?? ''}
      </div>

      <div className="chord-game__score" data-testid="score">
        Punkte: {score.correct} / {score.attempts}
      </div>
    </section>
  );
}

// ---- "name" direction: notes shown, pick root + quality -------------------

type NameDirectionProps = {
  notes: string[];
  guessRoot: string;
  guessType: string;
  done: boolean;
  onPickRoot: (r: string) => void;
  onPickType: (t: string) => void;
  onPlay: () => void;
};

function NameDirection({
  notes,
  guessRoot,
  guessType,
  done,
  onPickRoot,
  onPickType,
  onPlay,
}: NameDirectionProps) {
  return (
    <>
      <p className="chord-game__prompt" data-testid="prompt">
        Welcher Akkord ist das?
      </p>
      <div className="chord-game__notes" data-testid="chord-notes">
        {notes.map((n, i) => (
          <span key={i} className="chord-game__note-chip">
            {n}
          </span>
        ))}
        <button
          type="button"
          className="chord-game__play"
          data-testid="play-chord"
          onClick={onPlay}
          aria-label="Akkord anhören"
        >
          ▶
        </button>
      </div>

      <div className="chord-game__guess">
        <label className="chord-game__field">
          <span>Grundton</span>
          <select
            data-testid="guess-root"
            value={guessRoot}
            onChange={(e) => onPickRoot(e.target.value)}
            disabled={done}
          >
            <option value="">– wählen –</option>
            {CHORD_ROOTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <div className="chord-game__qualities" role="group" aria-label="Akkord-Art">
          {CHORD_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              data-testid={`quality-${type.id}`}
              aria-pressed={guessType === type.id}
              className={`chord-game__quality${
                guessType === type.id ? ' chord-game__quality--active' : ''
              }`}
              onClick={() => onPickType(type.id)}
              disabled={done}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---- "notes" direction: name shown, place the notes -----------------------

type NotesDirectionProps = {
  chordLabel: string;
  targetCount: number;
  placed: string[];
  done: boolean;
  noteOptions: string[];
  onToggle: (note: string) => void;
};

function NotesDirection({
  chordLabel,
  targetCount,
  placed,
  done,
  noteOptions,
  onToggle,
}: NotesDirectionProps) {
  return (
    <>
      <p className="chord-game__prompt" data-testid="prompt">
        Aus welchen Tönen besteht <b>{chordLabel}</b>? ({targetCount} Töne)
      </p>
      <div className="chord-game__placed" data-testid="placed-notes">
        {placed.length === 0 ? (
          <span className="chord-game__placed-empty">Noch keine Töne gewählt</span>
        ) : (
          placed.map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`placed-${n}`}
              className="chord-game__note-chip chord-game__note-chip--removable"
              onClick={() => onToggle(n)}
              disabled={done}
            >
              {n} ✕
            </button>
          ))
        )}
      </div>
      <div className="chord-game__picker" data-testid="picker">
        {noteOptions.map((n) => {
          const isPlaced = placed.some((p) => noteSemi(p) === noteSemi(n));
          return (
            <button
              key={n}
              type="button"
              data-testid={`pick-${n}`}
              className={`chord-game__pick${isPlaced ? ' chord-game__pick--placed' : ''}`}
              onClick={() => onToggle(n)}
              disabled={done}
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="chord-game__or">oder am Klavier:</p>
      {/* The piano emits only sharp spellings; the chip picker above also
          offers flats. Either input works — chords match by pitch. */}
      <Piano labels="white" activeNotes={placed} onClick={(note) => onToggle(note)} disabled={done} />
    </>
  );
}
