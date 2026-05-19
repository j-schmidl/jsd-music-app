import { playFrequency } from '../lib/tone';
import type { GuitarString, Tuning } from '../lib/tuning';
import './Headstock.css';

type Props = {
  tuning: Tuning;
  mode: 'auto' | 'manual';
  target: GuitarString | null;
  detected: GuitarString | null;
  onSelect: (s: GuitarString) => void;
};

export function Headstock({ tuning, mode, target, detected, onSelect }: Props) {
  // Tuning strings are ordered low → high (E2, A2, D3, G3, B3, E4 for a
  // standard guitar; basses have 4 or 5 strings). The two headstock columns
  // mirror that: the left column holds the lower half (highest pitch on top,
  // descending), the right column the upper half (ascending).
  const s = tuning.strings;
  // Basses get an in-line headstock graphic (all tuners on one side, the
  // classic P-/J-bass look) instead of the symmetric guitar headstock — so
  // all bass string buttons sit in the left column to match the pegs. A
  // guitar splits its strings across both columns.
  const isBass = tuning.id.startsWith('bass-');
  const mid = isBass ? s.length : Math.ceil(s.length / 2);
  const left = s.slice(0, mid).reverse();
  const right = s.slice(mid);

  return (
    <div className={`headstock${isBass ? ' headstock--bass' : ''}`}>
      <div className="headstock__column headstock__column--left">
        {left.map((s) => (
          <StringButton
            key={s.id}
            string={s}
            active={target?.id === s.id}
            pulse={mode === 'manual' && target?.id === s.id && detected?.id === s.id}
            disabled={mode === 'auto'}
            onSelect={onSelect}
          />
        ))}
      </div>

      {isBass ? (
        <BassHeadstockSvg stringCount={s.length} />
      ) : (
        <GuitarHeadstockSvg />
      )}

      {right.length > 0 && (
        <div className="headstock__column headstock__column--right">
          {right.map((s) => (
            <StringButton
              key={s.id}
              string={s}
              active={target?.id === s.id}
              pulse={mode === 'manual' && target?.id === s.id && detected?.id === s.id}
              disabled={mode === 'auto'}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// The symmetric guitar headstock: three tuning pegs on each side.
function GuitarHeadstockSvg() {
  return (
    <svg className="headstock__svg" viewBox="0 0 240 400" aria-hidden="true">
      <defs>
        <linearGradient id="headstock-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--surface-2)" />
          <stop offset="50%" stopColor="var(--surface)" />
          <stop offset="100%" stopColor="var(--surface-2)" />
        </linearGradient>
      </defs>
      <path
        d="M 60 20 Q 30 30 30 90 L 30 300 Q 30 360 60 380 L 180 380 Q 210 360 210 300 L 210 90 Q 210 30 180 20 Z"
        fill="url(#headstock-wood)"
        stroke="var(--fund-01)"
        strokeWidth="2"
      />
      {[
        { x: 60, pegY: 80 },
        { x: 90, pegY: 170 },
        { x: 120, pegY: 260 },
        { x: 150, pegY: 260 },
        { x: 180, pegY: 170 },
        { x: 210, pegY: 80 },
      ].map((s, i) => (
        <line
          key={`string-${i}`}
          x1={s.x}
          y1={s.pegY}
          x2={s.x}
          y2="400"
          stroke="var(--fg)"
          strokeWidth="1.2"
          opacity="0.55"
        />
      ))}
      {[80, 170, 260].map((y) => (
        <g key={`peg-left-${y}`}>
          <line x1="30" y1={y} x2="60" y2={y} stroke="var(--fund-light)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <circle cx="60" cy={y} r="9" fill="var(--fund-light)" stroke="var(--fund-01)" strokeWidth="1" />
          <circle cx="60" cy={y} r="3" fill="var(--fund-01)" opacity="0.35" />
        </g>
      ))}
      {[80, 170, 260].map((y) => (
        <g key={`peg-right-${y}`}>
          <line x1="180" y1={y} x2="210" y2={y} stroke="var(--fund-light)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <circle cx="180" cy={y} r="9" fill="var(--fund-light)" stroke="var(--fund-01)" strokeWidth="1" />
          <circle cx="180" cy={y} r="3" fill="var(--fund-01)" opacity="0.35" />
        </g>
      ))}
      <rect x="40" y="380" width="160" height="6" fill="var(--fund-light)" />
    </svg>
  );
}

// The bass headstock: a longer, narrower head with all tuners in-line on one
// side — the classic P-/J-bass shape. Strings fan from each peg to the nut.
function BassHeadstockSvg({ stringCount }: { stringCount: number }) {
  // Evenly spaced peg rows down the long head.
  const top = 70;
  const bottom = 330;
  const pegYs = Array.from({ length: stringCount }, (_, i) =>
    stringCount === 1 ? (top + bottom) / 2 : top + (i * (bottom - top)) / (stringCount - 1),
  );
  // Strings fan out at the nut so they line up with the headstock columns.
  const nutTop = 120;
  const nutBottom = 280;
  const nutY = (i: number) =>
    stringCount === 1 ? (nutTop + nutBottom) / 2 : nutTop + (i * (nutBottom - nutTop)) / (stringCount - 1);
  return (
    <svg className="headstock__svg" viewBox="0 0 240 400" aria-hidden="true">
      <defs>
        <linearGradient id="bass-headstock-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--surface-2)" />
          <stop offset="50%" stopColor="var(--surface)" />
          <stop offset="100%" stopColor="var(--surface-2)" />
        </linearGradient>
      </defs>
      {/* Narrow, elongated head */}
      <path
        d="M 95 16 Q 70 22 70 70 L 70 320 Q 70 372 110 384 L 150 384 Q 170 378 170 340 L 170 70 Q 170 22 145 16 Z"
        fill="url(#bass-headstock-wood)"
        stroke="var(--fund-01)"
        strokeWidth="2"
      />
      {/* Strings fanning from each peg down to the nut, then to the body */}
      {pegYs.map((pegY, i) => (
        <g key={`bass-string-${i}`}>
          <line
            x1="95"
            y1={pegY}
            x2="120"
            y2={nutY(i)}
            stroke="var(--fg)"
            strokeWidth="1.4"
            opacity="0.55"
          />
          <line
            x1="120"
            y1={nutY(i)}
            x2="120"
            y2="400"
            stroke="var(--fg)"
            strokeWidth="1.4"
            opacity="0.55"
          />
        </g>
      ))}
      {/* All tuning pegs in-line on the left side */}
      {pegYs.map((y, i) => (
        <g key={`bass-peg-${i}`}>
          <line x1="42" y1={y} x2="95" y2={y} stroke="var(--fund-light)" strokeWidth="2.4" strokeLinecap="round" opacity="0.75" />
          <circle cx="42" cy={y} r="11" fill="var(--fund-light)" stroke="var(--fund-01)" strokeWidth="1" />
          <circle cx="42" cy={y} r="4" fill="var(--fund-01)" opacity="0.35" />
        </g>
      ))}
      {/* Nut */}
      <rect x="104" y="384" width="34" height="6" fill="var(--fund-light)" />
    </svg>
  );
}

type ButtonProps = {
  string: GuitarString;
  active: boolean;
  pulse: boolean;
  disabled: boolean;
  onSelect: (s: GuitarString) => void;
};

function StringButton({ string, active, pulse, disabled, onSelect }: ButtonProps) {
  return (
    <button
      type="button"
      className={`string-btn${active ? ' string-btn--active' : ''}${pulse ? ' string-btn--pulse' : ''}`}
      data-testid={`string-${string.id}`}
      data-active={active}
      aria-label={`${string.name}${string.octave} auswählen`}
      aria-pressed={active}
      disabled={disabled && !active}
      onClick={() => {
        playFrequency(string.freq);
        onSelect(string);
      }}
    >
      {string.name}
    </button>
  );
}
