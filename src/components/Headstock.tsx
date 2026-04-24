import { STRINGS, type GuitarString } from '../lib/tuning';
import './Headstock.css';

type Props = {
  mode: 'auto' | 'manual';
  target: GuitarString | null;
  detected: GuitarString | null;
  onSelect: (s: GuitarString) => void;
};

// D / A / E on the left column (indices 2, 1, 0), G / B / E on the right (indices 3, 4, 5).
const LEFT_ORDER = ['D3', 'A2', 'E2'] as const;
const RIGHT_ORDER = ['G3', 'B3', 'E4'] as const;

export function Headstock({ mode, target, detected, onSelect }: Props) {
  const left = LEFT_ORDER.map((id) => STRINGS.find((s) => s.id === id)!);
  const right = RIGHT_ORDER.map((id) => STRINGS.find((s) => s.id === id)!);

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
        {/* Tuning pegs — 3 on each side */}
        {[80, 170, 260].map((y) => (
          <g key={`peg-left-${y}`}>
            <line x1="30" y1={y} x2="90" y2={y} stroke="var(--fund-light)" strokeWidth="1.5" />
            <circle cx="95" cy={y} r="8" fill="var(--fund-light)" stroke="var(--fund-01)" strokeWidth="1" />
          </g>
        ))}
        {[80, 170, 260].map((y) => (
          <g key={`peg-right-${y}`}>
            <line x1="150" y1={y} x2="210" y2={y} stroke="var(--fund-light)" strokeWidth="1.5" />
            <circle cx="145" cy={y} r="8" fill="var(--fund-light)" stroke="var(--fund-01)" strokeWidth="1" />
          </g>
        ))}
        {/* Strings descending to nut */}
        {[95, 108, 120, 132, 145].map((x, i) => (
          <line key={`string-${i}`} x1={x} y1="90" x2={x + (110 - x) * 0.1 + 110} y2="400" stroke="var(--fg)" strokeWidth="1" opacity="0.5" />
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
