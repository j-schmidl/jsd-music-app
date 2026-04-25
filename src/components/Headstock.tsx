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
  // Tuning strings are ordered low → high (E2, A2, D3, G3, B3, E4 for standard).
  // Headstock columns mirror that visually: left column (top→bottom) shows
  // 4th, 5th, 6th strings (D, A, low E) and right column shows 3rd, 2nd, 1st
  // (G, B, high E). Index 0 is the lowest pitch, index 5 the highest.
  const s = tuning.strings;
  const left = [s[2], s[1], s[0]];
  const right = [s[3], s[4], s[5]];

  return (
    <div className="headstock">
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

      <svg className="headstock__svg" viewBox="0 0 240 400" aria-hidden="true">
        <defs>
          <linearGradient id="headstock-wood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--surface-2)" />
            <stop offset="50%" stopColor="var(--surface)" />
            <stop offset="100%" stopColor="var(--surface-2)" />
          </linearGradient>
        </defs>
        {/* Headstock body */}
        <path
          d="M 60 20 Q 30 30 30 90 L 30 300 Q 30 360 60 380 L 180 380 Q 210 360 210 300 L 210 90 Q 210 30 180 20 Z"
          fill="url(#headstock-wood)"
          stroke="var(--fund-01)"
          strokeWidth="2"
        />
        {/* Strings running vertically from the pegs down to the nut */}
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
        {/* Tuning pegs — 3 on each side, with short peg stubs sticking out sideways */}
        {[80, 170, 260].map((y, i) => (
          <g key={`peg-left-${y}`}>
            <line x1="30" y1={y} x2="60" y2={y} stroke="var(--fund-light)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
            <circle cx="60" cy={y} r="9" fill="var(--fund-light)" stroke="var(--fund-01)" strokeWidth="1" />
            <circle cx="60" cy={y} r="3" fill="var(--fund-01)" opacity="0.35" />
            {/* Invisible anchor so React keeps index stable */}
            <g style={{ display: 'none' }}>{i}</g>
          </g>
        ))}
        {[80, 170, 260].map((y, i) => (
          <g key={`peg-right-${y}`}>
            <line x1="180" y1={y} x2="210" y2={y} stroke="var(--fund-light)" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
            <circle cx="180" cy={y} r="9" fill="var(--fund-light)" stroke="var(--fund-01)" strokeWidth="1" />
            <circle cx="180" cy={y} r="3" fill="var(--fund-01)" opacity="0.35" />
            <g style={{ display: 'none' }}>{i}</g>
          </g>
        ))}
        {/* Nut */}
        <rect x="40" y="380" width="160" height="6" fill="var(--fund-light)" />
      </svg>

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
    </div>
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
      onClick={() => onSelect(string)}
    >
      {string.name}
    </button>
  );
}
