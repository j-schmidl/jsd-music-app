import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ascendingOctave, enharmonicEqual, pickHiddenIndices } from '../lib/scales';
import { playNote } from '../lib/tone';
import { Piano } from './Piano';
import './ScaleGame.css';

type Mode = 'build' | 'fill' | 'piano';
type Difficulty = 'easy' | 'medium' | 'hard';
type KeyChoice = 'random' | string;

const MODES: Mode[] = ['build', 'fill', 'piano'];

function pickRandomMode(): Mode {
  return MODES[Math.floor(Math.random() * MODES.length)];
}

// A round's scale: the 7 spelled notes plus the human-readable quality label
// shown in prompts and feedback (e.g. "dur", "harmonisches Moll").
export type RoundScale = { notes: string[]; quality: string };

// Per-game configuration. MajorScales and MinorScales are thin wrappers that
// pass one of these into ScaleGame.
// An entry in the collapsible "Was ist das?" explanation panel.
export type InfoEntry = { term: string; text: string };

export type ScaleGameConfig = {
  // data-testid root and CSS-friendly id, e.g. "major-scales".
  id: string;
  title: string;
  // Short formula line shown under the title.
  formula: string;
  // localStorage key for this game's settings.
  storageKey: string;
  // All selectable tonics for this game.
  keys: readonly string[];
  // Builds a round for the given tonic. May pick a random scale variant.
  buildRound: (tonic: string) => RoundScale;
  // Optional explanatory entries shown in a collapsible info panel. Only
  // available in the hard difficulty. The minor game uses it for the
  // natural / harmonic / melodic variants; the major game for the build rule.
  info?: readonly InfoEntry[];
  // Label on the info panel's toggle button.
  infoTitle?: string;
};

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

type Settings = { keyChoice: KeyChoice; difficulty: Difficulty };

function loadSettings(storageKey: string, keys: readonly string[]): Settings {
  const fallback: Settings = { keyChoice: 'random', difficulty: 'hard' };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const keyChoice: KeyChoice =
      parsed.keyChoice === 'random' ||
      (typeof parsed.keyChoice === 'string' && keys.includes(parsed.keyChoice))
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

function saveSettings(storageKey: string, s: Settings) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(s));
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

export function ScaleGame({ config }: { config: ScaleGameConfig }) {
  const { id, keys, buildRound } = config;
  const pickRandomKey = useCallback(
    () => keys[Math.floor(Math.random() * keys.length)],
    [keys],
  );

  const [mode, setMode] = useState<Mode>(() => pickRandomMode());
  const initialSettings = useMemo(
    () => loadSettings(config.storageKey, keys),
    [config.storageKey, keys],
  );
  const [difficulty, setDifficulty] = useState<Difficulty>(initialSettings.difficulty);
  const [keyChoice, setKeyChoice] = useState<KeyChoice>(initialSettings.keyChoice);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Persist preferences whenever they change.
  useEffect(() => {
    saveSettings(config.storageKey, { keyChoice, difficulty });
  }, [config.storageKey, keyChoice, difficulty]);

  const [activeKey, setActiveKey] = useState<string>(() => pickRandomKey());
  // The current round's scale (7 notes + quality label). Rebuilt each round.
  const [round, setRound] = useState<RoundScale>(() => buildRound(activeKey));
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [filled, setFilled] = useState<(string | null)[]>(Array(8).fill(null));
  const [activeSlot, setActiveSlot] = useState(0);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: 'good' | 'bad' | 'warn' | 'info';
    text: string;
  } | null>(null);
  const [score, setScore] = useState({ correct: 0, attempts: 0 });
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  // Build/Fill: indices flagged as wrong (wrong pitch) by the most recent
  // Prüfen attempt that the user can still correct without losing the round.
  const [wrongMarkings, setWrongMarkings] = useState<Set<number>>(new Set());
  // Build/Fill: indices that hit the right pitch but the wrong spelling
  // (e.g. F instead of E#). Shown yellow — accepted, but worth learning.
  const [warnMarkings, setWarnMarkings] = useState<Set<number>>(new Set());
  // Countdown remaining (seconds) when piano-mode round ends correctly.
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  // The 7 scale degrees followed by the tonic an octave up so the line ends
  // resolved (e.g. C major reads C D E F G A B C).
  const scale = useMemo(() => [...round.notes, round.notes[0]], [round]);

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
    const r = buildRound(k);
    setRound(r);
    setDone(false);
    setFeedback(null);
    setWrongKey(null);
    setWrongMarkings(new Set());
    setWarnMarkings(new Set());

    const closingTonic = r.notes[0];

    if (m === 'fill') {
      const hideCount = HIDDEN_BY_DIFFICULTY[difficulty];
      const hiddenIdx = new Set(pickHiddenIndices(hideCount));
      const next: (string | null)[] = Array(8).fill(null);
      for (let i = 0; i < 7; i++) {
        if (!hiddenIdx.has(i)) next[i] = r.notes[i];
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
  }, [keyChoice, difficulty, buildRound, pickRandomKey]);

  // Reset round whenever difficulty or key choice changes; mode is rerolled
  // each round and not user-controlled.
  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, keyChoice]);

  // ---- Build / Fill: pick a note via the chip picker ----
  const placeNote = (note: string) => {
    if (done) {
      playNote(note, 0);
      return;
    }
    let i = activeSlot;
    if (i < 0 || i > 6) {
      // No slot is selected (every slot is filled). A chip must not silently
      // overwrite a slot — the user picks the slot they want to correct
      // first. Just give audio feedback at the base octave.
      playNote(note, 0);
      return;
    }
    if (hidden.size > 0 && !hidden.has(i)) {
      const next = [...Array(7).keys()].find((k) => hidden.has(k) && filled[k] === null);
      if (next !== undefined) i = next;
    }
    // Play the note at the octave that fits this slot in the ascending scale.
    playNote(note, ascendingOctave(i, activeKey));
    const updated = [...filled];
    updated[i] = note;
    setFilled(updated);
    // The slot just got a new value; drop any leftover flag on it from the
    // previous Prüfen attempt.
    if (wrongMarkings.has(i)) {
      const next = new Set(wrongMarkings);
      next.delete(i);
      setWrongMarkings(next);
    }
    if (warnMarkings.has(i)) {
      const next = new Set(warnMarkings);
      next.delete(i);
      setWarnMarkings(next);
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
    // -1 once every editable slot is filled: no slot stays "armed", so a
    // stray chip tap can't overwrite (and mis-octave) an unrelated slot. To
    // correct a note the user re-selects its slot first.
    setActiveSlot(next);
  };

  // ---- Build / Fill: check whole answer ----
  const checkAnswer = () => {
    if (done) return;
    // Three outcomes per slot:
    //  - exact: right letter and accidental
    //  - warn:  right pitch, wrong spelling (e.g. F for E#) — accepted, but
    //           a scale uses each letter A..G once, so the spelling matters
    //  - wrong: wrong pitch entirely
    const wrongs = new Set<number>();
    const warns = new Set<number>();
    for (let i = 0; i < 7; i++) {
      if (hidden.size > 0 && !hidden.has(i)) continue;
      const value = filled[i];
      if (value === null) {
        wrongs.add(i);
      } else if (value === scale[i]) {
        /* exact — nothing to flag */
      } else if (enharmonicEqual(value, scale[i])) {
        warns.add(i);
      } else {
        wrongs.add(i);
      }
    }

    if (wrongs.size > 0) {
      // A real mistake — keep the round open so the user can correct it.
      setWrongMarkings(wrongs);
      setWarnMarkings(warns);
      setFeedback({
        kind: 'bad',
        text:
          wrongs.size === 1
            ? '1 Fehler – versuch es nochmal.'
            : `${wrongs.size} Fehler – versuch es nochmal.`,
      });
      return;
    }

    // No wrong pitches → the round is solved. Finalize it either way.
    setDone(true);
    setScore((s) => ({ correct: s.correct + 1, attempts: s.attempts + 1 }));
    setWrongMarkings(new Set());
    setWarnMarkings(warns);
    playNote(scale[7], 1);

    if (warns.size === 0) {
      setFeedback({
        kind: 'good',
        text: `Richtig! ${activeKey} ${round.quality} = ${scale.join(' ')}`,
      });
    } else {
      // Right pitches, but some notes are spelled enharmonically. Show what
      // the user wrote next to the correct spelling so they can learn it.
      const corrections = [...warns]
        .sort((a, b) => a - b)
        .map((i) => `${filled[i]} → ${scale[i]}`)
        .join(', ');
      setFeedback({
        kind: 'warn',
        text: `Fast richtig! Richtig klingt es, aber die Schreibweise stimmt nicht: ${corrections}. Korrekt: ${activeKey} ${round.quality} = ${scale.join(' ')}`,
      });
    }
  };

  const reveal = () => {
    setFilled(scale.slice());
    setDone(true);
    setScore((s) => ({ ...s, attempts: s.attempts + 1 }));
    setFeedback({ kind: 'info', text: `Auflösung: ${scale.join(' ')}` });
    setWrongMarkings(new Set());
    setWarnMarkings(new Set());
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
          window.setTimeout(() => newRound(), 0);
          return null;
        }
        return c - 1;
      });
    }, 1000);
  }, [clearCountdown, newRound]);

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
        setFeedback({
          kind: 'good',
          text: `Richtig! ${activeKey} ${round.quality} = ${scale.join(' ')}`,
        });
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

  const slotState = (i: number): 'given' | 'filled' | 'empty' | 'active' => {
    if ((mode === 'build' || mode === 'fill') && i === 7) return 'given';
    if (mode === 'fill' && !hidden.has(i)) return 'given';
    if (filled[i] !== null) return 'filled';
    if (i === activeSlot && !done) return 'active';
    return 'empty';
  };

  return (
    <section className="scale-game" data-testid={id}>
      <h2 className="scale-game__title">{config.title}</h2>
      <p className="scale-game__sub">
        Formel: <span className="scale-game__formula">{config.formula}</span> · Buchstaben A–G ohne
        Wiederholung.
      </p>

      {/* Theory help — available in every difficulty. */}
      {config.info && config.info.length > 0 && (
        <>
          <button
            type="button"
            data-testid="info-toggle"
            className="scale-game__info-toggle"
            aria-expanded={infoOpen}
            aria-controls={`${id}-info`}
            onClick={() => setInfoOpen((o) => !o)}
          >
            <span className="scale-game__info-chevron" aria-hidden="true">
              {infoOpen ? '▾' : '▸'}
            </span>
            {config.infoTitle ?? 'Mehr erfahren'}
          </button>
          {infoOpen && (
            <dl id={`${id}-info`} className="scale-game__info" data-testid="info-panel">
              {config.info.map((entry) => (
                <div key={entry.term} className="scale-game__info-row">
                  <dt className="scale-game__info-term">{entry.term}</dt>
                  <dd className="scale-game__info-text">{entry.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      <div className="scale-game__controls">
        <button
          type="button"
          data-testid="settings-toggle"
          className="scale-game__settings-toggle"
          aria-expanded={settingsOpen}
          aria-controls={`${id}-settings`}
          onClick={() => setSettingsOpen((s) => !s)}
        >
          <span className="scale-game__settings-label">Einstellungen</span>
          <span className="scale-game__settings-summary" data-testid="settings-summary">
            Tonart: {keyChoice === 'random' ? 'Zufall' : keyChoice} · Schwierigkeit:{' '}
            {DIFFICULTY_LABELS[difficulty]}
          </span>
          <span className="scale-game__settings-chevron" aria-hidden="true">
            {settingsOpen ? '▾' : '▸'}
          </span>
        </button>
        <button
          type="button"
          data-testid="new-round"
          className="scale-game__primary scale-game__new-round"
          onClick={() => newRound()}
        >
          Neue Runde
        </button>
      </div>

      {settingsOpen && (
        <div id={`${id}-settings`} className="scale-game__settings" data-testid="settings-panel">
          <label className="scale-game__field">
            <span>Tonart</span>
            <select
              data-testid="key-select"
              value={keyChoice}
              onChange={(e) => setKeyChoice(e.target.value as KeyChoice)}
            >
              <option value="random">Zufall</option>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>

          <label className="scale-game__field">
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

      <p className="scale-game__prompt" data-testid="prompt">
        {mode === 'build' && (
          <>
            Baue die{' '}
            <b>
              {activeKey} {round.quality}
            </b>{' '}
            Tonleiter (alle 7 Töne).
          </>
        )}
        {mode === 'fill' && (
          <>
            Fülle die fehlenden Töne der{' '}
            <b>
              {activeKey} {round.quality}
            </b>{' '}
            Tonleiter.
          </>
        )}
        {mode === 'piano' && (
          <>
            Spiele die{' '}
            <b>
              {activeKey} {round.quality}
            </b>{' '}
            Tonleiter auf dem Klavier.
          </>
        )}
      </p>

      <div className="scale-game__slots" data-testid="slots">
        {Array.from({ length: 8 }, (_, i) => {
          const st = slotState(i);
          const value = filled[i] ?? '';
          const v = filled[i];
          const exact = v !== null && v === scale[i];
          const enharmonic = v !== null && !exact && enharmonicEqual(v, scale[i]);
          const showAsCorrect = done && exact ? 'correct' : '';
          // Yellow: right pitch, wrong spelling. Flagged after a Prüfen
          // attempt (warnMarkings) or once the round is finalized.
          const showAsWarn = warnMarkings.has(i) || (done && enharmonic) ? 'warn' : '';
          // Red: wrong pitch. Only true mistakes — never enharmonic ones.
          const showAsWrong =
            wrongMarkings.has(i) || (done && v !== null && !exact && !enharmonic)
              ? 'wrong'
              : '';
          const isOctave = i === 7;
          return (
            <button
              key={i}
              type="button"
              data-testid={`slot-${i}`}
              data-state={st}
              className={`scale-game__slot scale-game__slot--${st} ${showAsCorrect} ${showAsWarn} ${showAsWrong}${
                isOctave ? ' scale-game__slot--octave' : ''
              }`}
              onClick={() => {
                if (mode === 'piano') return;
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
          <div className="scale-game__picker" data-testid="picker">
            {NOTE_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`pick-${n}`}
                className="scale-game__pick"
                onClick={() => placeNote(n)}
                disabled={done}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="scale-game__actions">
            <button
              type="button"
              data-testid="check"
              className="scale-game__primary"
              onClick={checkAnswer}
              disabled={done}
            >
              Prüfen
            </button>
            <button
              type="button"
              data-testid="reveal"
              className="scale-game__secondary"
              onClick={reveal}
              disabled={done}
            >
              Auflösen
            </button>
          </div>
        </>
      )}

      {mode === 'piano' && (
        <div className="scale-game__piano-wrap">
          <Piano
            labels={difficulty === 'easy' ? 'all' : difficulty === 'medium' ? 'white' : 'none'}
            wrongKey={wrongKey}
            onClick={handlePianoClick}
            disabled={done}
          />
          <p className="scale-game__piano-hint">
            {difficulty === 'easy' && 'Alle Tasten beschriftet.'}
            {difficulty === 'medium' && 'Nur weiße Tasten beschriftet.'}
            {difficulty === 'hard' && 'Keine Beschriftung.'}
          </p>
        </div>
      )}

      {countdown !== null && (
        <NextScaleButton remaining={countdown} total={AUTO_ADVANCE_SECONDS} onClick={() => newRound()} />
      )}

      <div
        className={`scale-game__feedback scale-game__feedback--${feedback?.kind ?? 'none'}`}
        data-testid="feedback"
        aria-live="polite"
      >
        {feedback?.text ?? ''}
      </div>

      <div className="scale-game__score" data-testid="score">
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
    <button type="button" data-testid="next-scale" className="scale-game__next" onClick={onClick}>
      <span className="scale-game__next-ring" aria-hidden="true">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <rect
            className="scale-game__next-ring-track"
            x="2"
            y="2"
            width="96"
            height="36"
            rx="8"
            ry="8"
          />
          <rect
            className="scale-game__next-ring-progress"
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
      <span className="scale-game__next-label">
        Nächste Tonleiter! <span data-testid="next-countdown">({remaining})</span>
      </span>
    </button>
  );
}

