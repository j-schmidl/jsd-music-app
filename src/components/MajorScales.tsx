import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KEYS,
  buildMajorScale,
  enharmonicEqual,
  noteSemi,
  pickHiddenIndices,
  type Key,
} from '../lib/scales';
import './MajorScales.css';

type Mode = 'build' | 'fill' | 'piano';
type Difficulty = 'easy' | 'medium' | 'hard';

const HIDDEN_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 3,
  medium: 5,
  hard: 6,
};

const NOTE_OPTIONS = (() => {
  const out: string[] = [];
  for (const L of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
    out.push(L, `${L}#`, `${L}b`);
  }
  return out;
})();

function pickRandomKey(): Key {
  return KEYS[Math.floor(Math.random() * KEYS.length)];
}

export function MajorScales() {
  const [mode, setMode] = useState<Mode>('build');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [keyChoice, setKeyChoice] = useState<'random' | Key>('random');

  const [activeKey, setActiveKey] = useState<Key>(() => pickRandomKey());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [filled, setFilled] = useState<(string | null)[]>(Array(7).fill(null));
  const [activeSlot, setActiveSlot] = useState(0);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(
    null,
  );
  const [score, setScore] = useState({ correct: 0, attempts: 0 });
  const [wrongKey, setWrongKey] = useState<string | null>(null);

  const scale = useMemo(() => buildMajorScale(activeKey), [activeKey]);

  const newRound = useCallback(
    (overrideMode?: Mode) => {
      const m = overrideMode ?? mode;
      const k = keyChoice === 'random' ? pickRandomKey() : keyChoice;
      setActiveKey(k);
      setFilled(Array(7).fill(null));
      setDone(false);
      setFeedback(null);
      setWrongKey(null);

      if (m === 'fill') {
        const hideCount = HIDDEN_BY_DIFFICULTY[difficulty];
        const hiddenIdx = new Set(pickHiddenIndices(hideCount));
        const next: (string | null)[] = Array(7).fill(null);
        const built = buildMajorScale(k);
        for (let i = 0; i < 7; i++) {
          if (!hiddenIdx.has(i)) next[i] = built[i];
        }
        setHidden(hiddenIdx);
        setFilled(next);
        const first = [0, 1, 2, 3, 4, 5, 6].find((i) => hiddenIdx.has(i)) ?? 0;
        setActiveSlot(first);
      } else {
        setHidden(new Set());
        setActiveSlot(0);
      }
    },
    [mode, keyChoice, difficulty],
  );

  // Reset round whenever mode, difficulty, or key choice changes.
  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, difficulty, keyChoice]);

  const handleModeChange = (next: Mode) => setMode(next);

  // ---- Build / Fill: pick a note via the chip picker ----
  const placeNote = (note: string) => {
    if (done) return;
    let i = activeSlot;
    if (hidden.size > 0 && !hidden.has(i)) {
      // shouldn't normally happen, but find next editable slot
      const next = [...Array(7).keys()].find((k) => hidden.has(k) && filled[k] === null);
      if (next !== undefined) i = next;
    }
    if (filled[i] !== null && hidden.size === 0) {
      // overwrite is allowed in build mode
    }
    const updated = [...filled];
    updated[i] = note;
    setFilled(updated);

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
    let allCorrect = true;
    for (let i = 0; i < 7; i++) {
      if (hidden.size > 0 && !hidden.has(i)) continue;
      if (filled[i] !== scale[i]) {
        allCorrect = false;
        break;
      }
    }
    setDone(true);
    setScore((s) => ({ correct: s.correct + (allCorrect ? 1 : 0), attempts: s.attempts + 1 }));
    setFeedback(
      allCorrect
        ? { kind: 'good', text: `Richtig! ${activeKey} dur = ${scale.join(' ')}` }
        : { kind: 'bad', text: `Nicht ganz. Richtige Tonleiter: ${scale.join(' ')}` },
    );
  };

  const reveal = () => {
    setFilled(scale.slice());
    setDone(true);
    setScore((s) => ({ ...s, attempts: s.attempts + 1 }));
    setFeedback({ kind: 'info', text: `Auflösung: ${scale.join(' ')}` });
  };

  // ---- Piano mode: instant feedback per click ----
  const handlePianoClick = (clickedNote: string) => {
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
      if (idx === 6) {
        setDone(true);
        setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 }));
        setFeedback({ kind: 'good', text: `Richtig! ${activeKey} dur = ${scale.join(' ')}` });
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

      <div className="major-scales__modes" role="tablist" aria-label="Übungsmodus">
        {(
          [
            { id: 'build', label: '1. Aufbauen' },
            { id: 'fill', label: '2. Lücken' },
            { id: 'piano', label: '3. Klavier' },
          ] as { id: Mode; label: string }[]
        ).map((m) => (
          <button
            key={m.id}
            role="tab"
            type="button"
            aria-selected={mode === m.id}
            data-testid={`mode-${m.id}`}
            className={`major-scales__mode${mode === m.id ? ' major-scales__mode--active' : ''}`}
            onClick={() => handleModeChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="major-scales__controls">
        <label className="major-scales__field">
          <span>Tonart</span>
          <select
            data-testid="key-select"
            value={keyChoice}
            onChange={(e) => setKeyChoice(e.target.value as 'random' | Key)}
          >
            <option value="random">Zufall</option>
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k} dur
              </option>
            ))}
          </select>
        </label>

        {(mode === 'fill' || mode === 'piano') && (
          <label className="major-scales__field">
            <span>{mode === 'fill' ? 'Schwierigkeit' : 'Hilfe'}</span>
            <select
              data-testid="difficulty-select"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">Leicht{mode === 'fill' ? ' (3)' : ''}</option>
              <option value="medium">Mittel{mode === 'fill' ? ' (5)' : ''}</option>
              <option value="hard">Schwer{mode === 'fill' ? ' (6)' : ''}</option>
            </select>
          </label>
        )}

        <button
          type="button"
          data-testid="new-round"
          className="major-scales__primary"
          onClick={() => newRound()}
        >
          Neue Runde
        </button>
      </div>

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
        {Array.from({ length: 7 }, (_, i) => {
          const st = slotState(i);
          const value = filled[i] ?? '';
          const showAsCorrect =
            done && filled[i] !== null && filled[i] === scale[i] ? 'correct' : '';
          const showAsWrong =
            done && filled[i] !== null && filled[i] !== scale[i] ? 'wrong' : '';
          return (
            <button
              key={i}
              type="button"
              data-testid={`slot-${i}`}
              data-state={st}
              className={`major-scales__slot major-scales__slot--${st} ${showAsCorrect} ${showAsWrong}`}
              onClick={() => {
                if (mode === 'piano' || done) return;
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

// ---- Piano keyboard --------------------------------------------------------
// Two octaves (C..B C..B). White keys are flex children; black keys are
// absolutely positioned overlays so they sit between the right pair of whites.

type PianoProps = {
  difficulty: Difficulty;
  wrongKey: string | null;
  onClick: (note: string) => void;
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
              onClick={() => onClick(name)}
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
              onClick={() => onClick(sharp)}
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
