import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KEYS,
  ascendingOctave,
  buildMajorScale,
  enharmonicEqual,
  noteSemi,
  pickHiddenIndices,
  type Key,
} from '../lib/scales';
import { playNote } from '../lib/tone';
import './MajorScales.css';

type Mode = 'build' | 'fill' | 'piano';
type Difficulty = 'easy' | 'medium' | 'hard';
type KeyChoice = 'random' | Key;

const MODES: Mode[] = ['build', 'fill', 'piano'];

function pickRandomMode(): Mode {
  return MODES[Math.floor(Math.random() * MODES.length)];
}

// Settings persistence — stored in localStorage so the app remembers the
// user's preferences across reloads. Cookies aren't needed for client-only
// preferences and we already use this pattern for the theme toggle.
const STORAGE_KEY = 'jsd-majorscales-settings';
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

type Settings = { keyChoice: KeyChoice; difficulty: Difficulty };

function loadSettings(): Settings {
  const fallback: Settings = { keyChoice: 'random', difficulty: 'hard' };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const keyChoice: KeyChoice =
      parsed.keyChoice === 'random' ||
      (typeof parsed.keyChoice === 'string' && (KEYS as readonly string[]).includes(parsed.keyChoice))
        ? (parsed.keyChoice as KeyChoice)
        : 'random';
    const difficulty: Difficulty = DIFFICULTIES.includes(parsed.difficulty as Difficulty)
      ? (parsed.difficulty as Difficulty)
      : 'hard';
    return { keyChoice, difficulty };
  } catch {
    return fallback;
  }
}

function saveSettings(s: Settings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable — ignore */
  }
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Leicht',
  medium: 'Mittel',
  hard: 'Schwer',
};

const AUTO_ADVANCE_SECONDS = 5;

const HIDDEN_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 3,
  medium: 5,
  hard: 6,
};

const NOTE_OPTIONS = (() => {
  const out: string[] = [];
  // Order each letter group as flat → natural → sharp so the picker reads
  // ascending in pitch within each letter (e.g. Cb, C, C#).
  for (const L of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
    out.push(`${L}b`, L, `${L}#`);
  }
  return out;
})();

function pickRandomKey(): Key {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}

export function MajorScales() {
  const [mode, setMode] = useState<Mode>(() => pickRandomMode());
  const initialSettings = useMemo(() => loadSettings(), []);
  const [difficulty, setDifficulty] = useState<Difficulty>(initialSettings.difficulty);
  const [keyChoice, setKeyChoice] = useState<KeyChoice>(initialSettings.keyChoice);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Persist preferences whenever they change.
  useEffect(() => {
    saveSettings({ keyChoice, difficulty });
  }, [keyChoice, difficulty]);

  const [activeKey, setActiveKey] = useState<Key>(() => pickRandomKey());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [filled, setFilled] = useState<(string | null)[]>(Array(8).fill(null));
  const [activeSlot, setActiveSlot] = useState(0);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(
    null,
  );
  const [score, setScore] = useState({ correct: 0, attempts: 0 });
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  // Build/Fill: indices flagged as wrong by the most recent Prüfen attempt
  // that the user can still correct without losing the round.
  const [wrongMarkings, setWrongMarkings] = useState<Set<number>>(new Set());
  // Countdown remaining (seconds) when piano-mode round ends correctly.
  // null = no countdown active.
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  // The 7 scale degrees followed by the tonic an octave up so the line ends
  // resolved (e.g. C major reads C D E F G A B C).
  const scale = useMemo(() => {
    const built = buildMajorScale(activeKey);
    return [...built, built[0]];
  }, [activeKey]);

  const newRound = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    const m = pickRandomMode();
    setMode(m);
    const k = keyChoice === 'random' ? pickRandomKey() : keyChoice;
    setActiveKey(k);
    setDone(false);
    setFeedback(null);
    setWrongKey(null);
    setWrongMarkings(new Set());

    const built = buildMajorScale(k);
    const closingTonic = built[0];

    if (m === 'fill') {
      const hideCount = HIDDEN_BY_DIFFICULTY[difficulty];
      const hiddenIdx = new Set(pickHiddenIndices(hideCount));
      const next: (string | null)[] = Array(8).fill(null);
      for (let i = 0; i < 7; i++) {
        if (!hiddenIdx.has(i)) next[i] = built[i];
      }
      next[7] = closingTonic; // closing octave is always shown
      setHidden(hiddenIdx);
      setFilled(next);
      const first = [0, 1, 2, 3, 4, 5, 6].find((i) => hiddenIdx.has(i)) ?? 0;
      setActiveSlot(first);
    } else if (m === 'build') {
      // Closing tonic is also always shown in build mode — it's the visual
      // anchor that the picker entries climb up to.
      const next: (string | null)[] = Array(8).fill(null);
      next[7] = closingTonic;
      setHidden(new Set());
      setFilled(next);
      setActiveSlot(0);
    } else {
      // Piano: user plays all 8 keys themselves, including the closing tonic.
      setHidden(new Set());
      setFilled(Array(8).fill(null));
      setActiveSlot(0);
    }
  }, [keyChoice, difficulty]);

  // Reset round whenever difficulty or key choice changes; mode is rerolled
  // each round and not user-controlled.
  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, keyChoice]);

  // ---- Build / Fill: pick a note via the chip picker ----
  const placeNote = (note: string) => {
    if (done) {
      // Round is finalized; just give audible feedback and bail.
      playNote(note, 0);
      return;
    }
    let i = activeSlot;
    if (hidden.size > 0 && !hidden.has(i)) {
      // shouldn't normally happen, but find next editable slot
      const next = [...Array(7).keys()].find((k) => hidden.has(k) && filled[k] === null);
      if (next !== undefined) i = next;
    }
    // Play the note at the octave that fits this slot in the ascending
    // scale, so a C placed into slot 3 of G major sounds as C5, not C4.
    playNote(note, ascendingOctave(i, activeKey));
    if (filled[i] !== null && hidden.size === 0) {
      // overwrite is allowed in build mode
    }
    const updated = [...filled];
    updated[i] = note;
    setFilled(updated);
    // The slot just got a new value; drop any leftover red flag on it from
    // the previous Prüfen attempt.
    if (wrongMarkings.has(i)) {
      const next = new Set(wrongMarkings);
      next.delete(i);
      setWrongMarkings(next);
    }

    // advance to next empty editable slot
    const editable = (k: number) => (hidden.size === 0 ? true : hidden.has(k));
    let next = -1;
    for (let k = i + 1; k < 7; k++) {
      if (editable(k) && updated[k] === null) {
        next = k;
        break;
      }
    }
    if (next === -1) {
      for (let k = 0; k < 7; k++) {
        if (editable(k) && updated[k] === null) {
          next = k;
          break;
        }
      }
    }
    setActiveSlot(next === -1 ? i : next);
  };

  // ---- Build / Fill: check whole answer ----
  const checkAnswer = () => {
    if (done) return;
    const wrongs = new Set<number>();
    for (let i = 0; i < 7; i++) {
      if (hidden.size > 0 && !hidden.has(i)) continue;
      // Spelling matters: a major scale uses each letter A..G exactly once,
      // so e.g. C# major requires E# (not F) and F# (not Gb). We compare on
      // exact spelling, not pitch class.
      if (filled[i] === null || filled[i] !== scale[i]) {
        wrongs.add(i);
      }
    }
    if (wrongs.size === 0) {
      setDone(true);
      setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 }));
      setFeedback({ kind: 'good', text: `Richtig! ${activeKey} dur = ${scale.join(' ')}` });
      setWrongMarkings(new Set());
      // Play the closing tonic an octave up so the build/fill round resolves
      // audibly — same idea as the bookend slot, just without requiring a tap.
      playNote(scale[7], 1);
    } else {
      // Don't lock the round: flag the wrong slots in red and let the user
      // correct them. Score only changes on a final answer (right or via
      // Auflösen).
      setWrongMarkings(wrongs);
      setFeedback({
        kind: 'bad',
        text:
          wrongs.size === 1
            ? '1 Fehler – versuch es nochmal.'
            : `${wrongs.size} Fehler – versuch es nochmal.`,
      });
    }
  };

  const reveal = () => {
    setFilled(scale.slice());
    setDone(true);
    setScore((s) => ({ ...s, attempts: s.attempts + 1 }));
    setFeedback({ kind: 'info', text: `Auflösung: ${scale.join(' ')}` });
    setWrongMarkings(new Set());
    playNote(scale[7], 1);
  };

  // ---- Auto-advance countdown after piano-mode success ----
  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdown();
    setCountdown(AUTO_ADVANCE_SECONDS);
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c === null) return c;
        if (c <= 1) {
          if (countdownTimerRef.current !== null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          // Defer the round change to the next tick so React can flush the
          // 0-state render before we reset state.
          window.setTimeout(() => newRound(), 0);
          return null;
        }
        return c - 1;
      });
    }, 1000);
  }, [clearCountdown, newRound]);

  // Cancel countdown on unmount.
  useEffect(() => () => clearCountdown(), [clearCountdown]);

  // ---- Piano mode: instant feedback per click ----
  const handlePianoClick = (clickedNote: string, octave: 0 | 1) => {
    playNote(clickedNote, octave);
    if (done) return;
    const idx = filled.findIndex((x) => x === null);
    if (idx === -1) return;
    const expected = scale[idx];
    const isRight = clickedNote === expected || enharmonicEqual(clickedNote, expected);
    if (isRight) {
      const updated = [...filled];
      updated[idx] = expected; // store canonical spelling
      setFilled(updated);
      setWrongKey(null);
      if (idx === 7) {
        setDone(true);
        setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 }));
        setFeedback({ kind: 'good', text: `Richtig! ${activeKey} dur = ${scale.join(' ')}` });
        startCountdown();
      } else {
        setActiveSlot(idx + 1);
      }
    } else {
      setWrongKey(clickedNote);
      setFeedback({
        kind: 'bad',
        text: difficulty === 'hard' ? '✗' : `✗ Nochmal versuchen`,
      });
      window.setTimeout(() => setWrongKey((w) => (w === clickedNote ? null : w)), 320);
    }
  };

  // Helpers for rendering
  const slotState = (i: number): 'given' | 'filled' | 'empty' | 'active' => {
    // The closing-tonic slot in build/fill is shown as given so the user sees
    // the resolution but cannot edit it.
    if ((mode === 'build' || mode === 'fill') && i === 7) return 'given';
    if (mode === 'fill' && !hidden.has(i)) return 'given';
    if (filled[i] !== null) return 'filled';
    if (i === activeSlot && !done) return 'active';
    return 'empty';
  };

  return (
    <section className="major-scales" data-testid="major-scales">
      <h2 className="major-scales__title">Dur-Tonleitern</h2>
      <p className="major-scales__sub">
        Formel: <span className="major-scales__formula">G–G–h–G–G–G–h</span> · Buchstaben A–G ohne
        Wiederholung.
      </p>

      <div className="major-scales__controls">
        <button
          type="button"
          data-testid="settings-toggle"
          className="major-scales__settings-toggle"
          aria-expanded={settingsOpen}
          aria-controls="major-scales-settings"
          onClick={() => setSettingsOpen((s) => !s)}
        >
          <span className="major-scales__settings-label">Einstellungen</span>
          <span className="major-scales__settings-summary" data-testid="settings-summary">
            Tonart: {keyChoice === 'random' ? 'Zufall' : `${keyChoice} dur`} · Schwierigkeit:{' '}
            {DIFFICULTY_LABELS[difficulty]}
          </span>
          <span className="major-scales__settings-chevron" aria-hidden="true">
            {settingsOpen ? '▾' : '▸'}
          </span>
        </button>
        <button
          type="button"
          data-testid="new-round"
          className="major-scales__primary major-scales__new-round"
          onClick={() => newRound()}
        >
          Neue Runde
        </button>
      </div>

      {settingsOpen && (
        <div
          id="major-scales-settings"
          className="major-scales__settings"
          data-testid="settings-panel"
        >
          <label className="major-scales__field">
            <span>Tonart</span>
            <select
              data-testid="key-select"
              value={keyChoice}
              onChange={(e) => setKeyChoice(e.target.value as KeyChoice)}
            >
              <option value="random">Zufall</option>
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {k} dur
                </option>
              ))}
            </select>
          </label>

          <label className="major-scales__field">
            <span>Schwierigkeit</span>
            <select
              data-testid="difficulty-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">Leicht</option>
              <option value="medium">Mittel</option>
              <option value="hard">Schwer</option>
            </select>
          </label>
        </div>
      )}

      <p className="major-scales__prompt" data-testid="prompt">
        {mode === 'build' && (
          <>
            Baue die <b>{activeKey} dur</b> Tonleiter (alle 7 Töne).
          </>
        )}
        {mode === 'fill' && (
          <>
            Fülle die fehlenden Töne der <b>{activeKey} dur</b> Tonleiter.
          </>
        )}
        {mode === 'piano' && (
          <>
            Spiele die <b>{activeKey} dur</b> Tonleiter auf dem Klavier.
          </>
        )}
      </p>

      <div className="major-scales__slots" data-testid="slots">
        {Array.from({ length: 8 }, (_, i) => {
          const st = slotState(i);
          const value = filled[i] ?? '';
          const showAsCorrect =
            done && filled[i] !== null && filled[i] === scale[i] ? 'correct' : '';
          // Red highlight after a failed Prüfen (still editable) or after a
          // finalized round if the answer was wrong.
          const showAsWrong =
            wrongMarkings.has(i) ||
            (done && filled[i] !== null && filled[i] !== scale[i])
              ? 'wrong'
              : '';
          // Slot 7 is the closing-octave bookend, not a scale degree itself.
          const isOctave = i === 7;
          return (
            <button
              key={i}
              type="button"
              data-testid={`slot-${i}`}
              data-state={st}
              className={`major-scales__slot major-scales__slot--${st} ${showAsCorrect} ${showAsWrong}${
                isOctave ? ' major-scales__slot--octave' : ''
              }`}
              onClick={() => {
                if (mode === 'piano') return;
                // Play whatever note the slot currently shows (if any) so the
                // user can review by tapping. Each slot uses the octave that
                // keeps the scale ascending continuously (e.g. G major: G3
                // A3 B3 C4 D4 E4 F#4 G4).
                if (filled[i]) {
                  playNote(filled[i] as string, ascendingOctave(i, activeKey));
                }
                if (done) return;
                if ((mode === 'build' || mode === 'fill') && isOctave) return;
                if (mode === 'fill' && !hidden.has(i)) return;
                setActiveSlot(i);
              }}
            >
              {value || '·'}
            </button>
          );
        })}
      </div>

      {(mode === 'build' || mode === 'fill') && (
        <>
          <div className="major-scales__picker" data-testid="picker">
            {NOTE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`pick-${n}`}
                className="major-scales__pick"
                onClick={() => placeNote(n)}
                disabled={done}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="major-scales__actions">
            <button
              type="button"
              data-testid="check"
              className="major-scales__primary"
              onClick={checkAnswer}
              disabled={done}
            >
              Prüfen
            </button>
            <button
              type="button"
              data-testid="reveal"
              className="major-scales__secondary"
              onClick={reveal}
              disabled={done}
            >
              Auflösen
            </button>
          </div>
        </>
      )}

      {mode === 'piano' && (
        <Piano
          difficulty={difficulty}
          wrongKey={wrongKey}
          onClick={handlePianoClick}
          disabled={done}
        />
      )}

      {countdown !== null && (
        <NextScaleButton
          remaining={countdown}
          total={AUTO_ADVANCE_SECONDS}
          onClick={() => newRound()}
        />
      )}

      <div
        className={`major-scales__feedback major-scales__feedback--${feedback?.kind ?? 'none'}`}
        data-testid="feedback"
        aria-live="polite"
      >
        {feedback?.text ?? ''}
      </div>

      <div className="major-scales__score" data-testid="score">
        Punkte: {score.correct} / {score.attempts}
      </div>
    </section>
  );
}

// ---- Next-scale countdown button ------------------------------------------

type NextScaleButtonProps = {
  remaining: number;
  total: number;
  onClick: () => void;
};

function NextScaleButton({ remaining, total, onClick }: NextScaleButtonProps) {
  return (
    <button
      type="button"
      data-testid="next-scale"
      className="major-scales__next"
      onClick={onClick}
    >
      {/* The CSS-driven SVG ring drains around the button as the countdown
          ticks down. Restarting the animation each tick keeps the visual
          synced even if React batches updates. */}
      <span className="major-scales__next-ring" aria-hidden="true">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <rect
            className="major-scales__next-ring-track"
            x="2"
            y="2"
            width="96"
            height="36"
            rx="8"
            ry="8"
          />
          <rect
            className="major-scales__next-ring-progress"
            x="2"
            y="2"
            width="96"
            height="36"
            rx="8"
            ry="8"
            pathLength={100}
            style={{ animationDuration: `${total}s` }}
          />
        </svg>
      </span>
      <span className="major-scales__next-label">
        Nächste Tonleiter! <span data-testid="next-countdown">({remaining})</span>
      </span>
    </button>
  );
}

// ---- Piano keyboard --------------------------------------------------------
// Two octaves (C..B C..B). White keys are flex children; black keys are
// absolutely positioned overlays so they sit between the right pair of whites.

type PianoProps = {
  difficulty: Difficulty;
  wrongKey: string | null;
  onClick: (note: string, octave: 0 | 1) => void;
  disabled: boolean;
};

const WHITES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Whether a black key sits to the right of white index i (between i and i+1)
const BLACK_AFTER = [true, true, false, true, true, true, false, true, true, false, true, true, true, false];

function Piano({ difficulty, wrongKey, onClick, disabled }: PianoProps) {
  const showWhiteLabel = difficulty !== 'hard';
  const showBlackLabel = difficulty === 'easy';
  return (
    <div className="major-scales__piano-wrap" data-testid="piano">
      <div className="major-scales__piano">
        {WHITES.map((name, i) => {
          const isWrong = wrongKey === name; // matches by letter for naturals
          return (
            <button
              key={`w${i}`}
              type="button"
              data-testid={`piano-key-${name}-${i}`}
              data-note={name}
              data-octave={i < 7 ? 0 : 1}
              className={`major-scales__key major-scales__key--white${
                isWrong ? ' major-scales__key--wrong' : ''
              }`}
              onClick={() => onClick(name, i < 7 ? 0 : 1)}
              disabled={disabled}
              aria-label={name}
            >
              {showWhiteLabel && <span className="major-scales__key-label">{name}</span>}
            </button>
          );
        })}
        {WHITES.map((white, i) => {
          if (!BLACK_AFTER[i]) return null;
          const sharp = `${white}#`;
          // Track wrongness by pitch class (C# clicked but Db expected → still flash)
          const isWrong =
            wrongKey !== null &&
            (wrongKey === sharp || noteSemi(wrongKey) === noteSemi(sharp));
          // Position: each white is 1/14 of the piano width; place black centered on the seam
          const leftPct = ((i + 1) / WHITES.length) * 100;
          return (
            <button
              key={`b${i}`}
              type="button"
              data-testid={`piano-key-${sharp}-${i}`}
              data-note={sharp}
              data-octave={i < 7 ? 0 : 1}
              className={`major-scales__key major-scales__key--black${
                isWrong ? ' major-scales__key--wrong' : ''
              }`}
              style={{ left: `calc(${leftPct}% - 3.4%)` }}
              onClick={() => onClick(sharp, i < 7 ? 0 : 1)}
              disabled={disabled}
              aria-label={sharp}
            >
              {showBlackLabel && <span className="major-scales__key-label">{sharp}</span>}
            </button>
          );
        })}
      </div>
      <p className="major-scales__piano-hint">
        {difficulty === 'easy' && 'Alle Tasten beschriftet.'}
        {difficulty === 'medium' && 'Nur weiße Tasten beschriftet.'}
        {difficulty === 'hard' && 'Keine Beschriftung.'}
      </p>
    </div>
  );
}
