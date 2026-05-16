import { noteSemi } from '../lib/scales';
import './Piano.css';

// Two-octave piano keyboard (C..B C..B). White keys are flex children; black
// keys are absolutely-positioned overlays sitting between the right whites.
// Shared by the scale games and the chord game.

const WHITES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];
// Whether a black key sits to the right of white index i (between i and i+1).
const BLACK_AFTER = [true, true, false, true, true, true, false, true, true, false, true, true, true, false];

type PianoProps = {
  // 'white' = labels on white keys only, 'all' = also black keys, 'none'.
  labels: 'all' | 'white' | 'none';
  // Highlight a key as wrong (matched by pitch class).
  wrongKey?: string | null;
  // Highlight keys as selected/active (matched by pitch class).
  activeNotes?: readonly string[];
  onClick: (note: string, octave: 0 | 1) => void;
  disabled?: boolean;
};

export function Piano({ labels, wrongKey = null, activeNotes = [], onClick, disabled = false }: PianoProps) {
  const showWhiteLabel = labels !== 'none';
  const showBlackLabel = labels === 'all';
  const isActive = (note: string) => activeNotes.some((n) => noteSemi(n) === noteSemi(note));
  return (
    <div className="piano-wrap" data-testid="piano">
      <div className="piano">
        {WHITES.map((name, i) => {
          const isWrong = wrongKey === name;
          return (
            <button
              key={`w${i}`}
              type="button"
              data-testid={`piano-key-${name}-${i}`}
              data-note={name}
              data-octave={i < 7 ? 0 : 1}
              className={`piano__key piano__key--white${isWrong ? ' piano__key--wrong' : ''}${
                isActive(name) ? ' piano__key--active' : ''
              }`}
              onClick={() => onClick(name, i < 7 ? 0 : 1)}
              disabled={disabled}
              aria-label={name}
            >
              {showWhiteLabel && <span className="piano__key-label">{name}</span>}
            </button>
          );
        })}
        {WHITES.map((white, i) => {
          if (!BLACK_AFTER[i]) return null;
          const sharp = `${white}#`;
          const isWrong =
            wrongKey !== null && (wrongKey === sharp || noteSemi(wrongKey) === noteSemi(sharp));
          const leftPct = ((i + 1) / WHITES.length) * 100;
          return (
            <button
              key={`b${i}`}
              type="button"
              data-testid={`piano-key-${sharp}-${i}`}
              data-note={sharp}
              data-octave={i < 7 ? 0 : 1}
              className={`piano__key piano__key--black${isWrong ? ' piano__key--wrong' : ''}${
                isActive(sharp) ? ' piano__key--active' : ''
              }`}
              style={{ left: `calc(${leftPct}% - 3.4%)` }}
              onClick={() => onClick(sharp, i < 7 ? 0 : 1)}
              disabled={disabled}
              aria-label={sharp}
            >
              {showBlackLabel && <span className="piano__key-label">{sharp}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
