import type { GuitarString } from '../lib/tuning';
import { centsOff, getTuningHint, isInTune } from '../lib/tuning';
import { TunerRoll } from './TunerRoll';
import './Tuner.css';

type Props = {
  frequency: number | null;
  target: GuitarString | null;
  listening: boolean;
  error: string | null;
  onStart: () => void;
  prompt: string;
  // True when the mic pipeline has gone silent/dead; shows a manual restart
  // affordance (the hook also auto-restarts shortly after).
  stalled?: boolean;
  onRestart?: () => void;
};

const MAX_DISPLAY_CENTS = 50;

export function Tuner({
  frequency,
  target,
  listening,
  error,
  onStart,
  prompt,
  stalled = false,
  onRestart,
}: Props) {
  const hasSignal = frequency !== null && target !== null;
  const cents = hasSignal ? centsOff(frequency!, target!.freq) : 0;
  const clamped = Math.max(-MAX_DISPLAY_CENTS, Math.min(MAX_DISPLAY_CENTS, cents));
  const needleOffset = (clamped / MAX_DISPLAY_CENTS) * 110;
  const inTune = hasSignal && isInTune(cents, 5);
  const hint = hasSignal ? getTuningHint(cents) : 'ok';

  let state: 'idle' | 'listening' | 'detected' | 'in-tune' | 'error' = 'idle';
  if (error) state = 'error';
  else if (listening) {
    if (!hasSignal) state = 'listening';
    else if (inTune) state = 'in-tune';
    else state = 'detected';
  }

  const rollValue = hasSignal ? clamped / MAX_DISPLAY_CENTS : null;

  return (
    <div className={`tuner tuner--${state}`} data-testid="tuner" data-state={state}>
      <div className="tuner__scale" aria-hidden="true">
        <span className="tuner__flat">♭</span>
        <div className="tuner__track">
          {/* Full-length 0-cents baseline — runs the entire track height
              behind every other layer. The dot opaquely covers it where they
              overlap, but the line clearly extends above and below the dot. */}
          <div className="tuner__baseline" />
          {/* The seismograph fills the area above the needle dot. Its bottom
              edge meets the dot's highest point so the trail visually starts
              at the top of the indicator. */}
          <div className="tuner__roll">
            <TunerRoll value={rollValue} inTune={inTune} deflection={110} />
          </div>
          <div className="tuner__ticks">
            {[-50, -25, 0, 25, 50].map((v) => (
              <span key={v} className={v === 0 ? 'tuner__tick tuner__tick--center' : 'tuner__tick'} />
            ))}
          </div>
          <div
            className="tuner__needle"
            style={{ transform: `translate(-50%, 0) translateX(${needleOffset}px)` }}
            data-testid="tuner-needle"
          >
            {/* The pen: vertical line above the dot that "draws" the
                seismograph trace. Visually, this is the stylus currently
                writing onto the rolling drum below. */}
            <div className="tuner__needle-line" />
            <div className="tuner__needle-dot">
              {state === 'in-tune' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12l4 4L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : state === 'detected' ? (
                <span className="tuner__cents">{cents > 0 ? '+' : ''}{Math.round(cents)}</span>
              ) : null}
            </div>
          </div>
        </div>
        <span className="tuner__sharp">♯</span>
      </div>

      {/* Fixed-height region so swapping between idle / listening / detected
          / in-tune / error never reflows the page. The hint slot always
          occupies its line; only its visibility changes. */}
      <div className="tuner__bottom">
        {stalled && listening ? (
          <div className="tuner__stalled" data-testid="tuner-stalled">
            <span className="tuner__stalled-msg">Kein Signal</span>
            <button
              type="button"
              className="tuner__restart"
              onClick={onRestart}
              data-testid="tuner-restart"
            >
              <span className="tuner__restart-icon" aria-hidden="true">⟳</span>
              Neu starten
            </button>
          </div>
        ) : (
          <>
            {state === 'idle' && (
              <button
                type="button"
                className="tuner__start"
                onClick={onStart}
                data-testid="tuner-start"
              >
                Mikrofon aktivieren
              </button>
            )}

            {state === 'listening' && (
              <p className="tuner__prompt" data-testid="tuner-prompt">
                {prompt}
              </p>
            )}

            {(state === 'detected' || state === 'in-tune') && target && (
              <div className={`tuner__status${state === 'in-tune' ? ' tuner__status--ok' : ''}`}>
                <span
                  className="tuner__hint"
                  data-testid="tuner-hint"
                  // Reserve the line even when in tune so the note below it does
                  // not jump as the hint appears and disappears.
                  style={{ visibility: state === 'detected' ? 'visible' : 'hidden' }}
                >
                  {hint === 'tiefer' ? 'Tiefer stimmen' : 'Höher stimmen'}
                </span>
                <span className="tuner__note" data-testid="tuner-note">
                  {target.name}
                  <sup>{target.octave}</sup>
                </span>
              </div>
            )}

            {state === 'error' && (
              <p className="tuner__error" data-testid="tuner-error">
                {error ?? 'Mikrofon nicht verfügbar'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
