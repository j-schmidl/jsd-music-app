import type { GuitarString } from '../lib/tuning';
import { centsOff, getTuningHint, isInTune } from '../lib/tuning';
import './Tuner.css';

type Props = {
  frequency: number | null;
  target: GuitarString | null;
  listening: boolean;
  error: string | null;
  onStart: () => void;
};

const MAX_DISPLAY_CENTS = 50;

export function Tuner({ frequency, target, listening, error, onStart }: Props) {
  const hasSignal = frequency !== null && target !== null;
  const cents = hasSignal ? centsOff(frequency!, target!.freq) : 0;
  const clamped = Math.max(-MAX_DISPLAY_CENTS, Math.min(MAX_DISPLAY_CENTS, cents));
  const needleOffset = (clamped / MAX_DISPLAY_CENTS) * 110;
  const inTune = hasSignal && isInTune(cents, 5);
  const hint = hasSignal ? getTuningHint(cents) : 'ok';

  let state: 'idle' | 'listening' | 'detected' | 'in-tune' | 'error' = 'idle';
  if (error) state = 'error';
  else if (!listening) state = 'idle';
  else if (!hasSignal) state = 'listening';
  else if (inTune) state = 'in-tune';
  else state = 'detected';

  return (
    <div className={`tuner tuner--${state}`} data-testid="tuner" data-state={state}>
      <div className="tuner__scale" aria-hidden="true">
        <span className="tuner__flat">♭</span>
        <div className="tuner__track">
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

      {state === 'idle' && (
        <button type="button" className="tuner__start" onClick={onStart} data-testid="tuner-start">
          Mikrofon aktivieren
        </button>
      )}

      {state === 'listening' && (
        <p className="tuner__prompt" data-testid="tuner-prompt">
          Spiele eine Saite — sie wird automatisch erkannt
        </p>
      )}

      {state === 'detected' && target && (
        <div className="tuner__status">
          <span className="tuner__hint" data-testid="tuner-hint">
            {hint === 'tiefer' ? 'Tiefer stimmen' : 'Höher stimmen'}
          </span>
          <span className="tuner__note" data-testid="tuner-note">
            {target.name}
            <sup>{target.octave}</sup>
          </span>
        </div>
      )}

      {state === 'in-tune' && target && (
        <div className="tuner__status tuner__status--ok">
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
    </div>
  );
}
