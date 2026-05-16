import { NOTE_NAMES, makeCustomTuning, type NoteName, type Tuning } from '../lib/tuning';
import { playFrequency } from '../lib/tone';
import './CustomTuningEditor.css';

// Octaves a guitar string realistically sits in.
const OCTAVES = [1, 2, 3, 4, 5];

type Props = {
  tuning: Tuning;
  // Called with the rebuilt tuning whenever the user changes a string.
  onChange: (tuning: Tuning) => void;
};

// Per-string editor for the user's own tuning. Strings are listed low → high,
// matching the tuning's string order. Each change rebuilds and saves the
// tuning (persistence handled by the caller).
export function CustomTuningEditor({ tuning, onChange }: Props) {
  const setString = (index: number, name: NoteName, octave: number) => {
    const next = tuning.strings.map((str, i) =>
      i === index ? { name, octave } : { name: str.name, octave: str.octave },
    );
    const rebuilt = makeCustomTuning(next);
    onChange(rebuilt);
    playFrequency(rebuilt.strings[index].freq);
  };

  return (
    <div className="custom-tuning" data-testid="custom-tuning-editor">
      <p className="custom-tuning__hint">Lege jede Saite selbst fest (tief → hoch).</p>
      <ol className="custom-tuning__list">
        {tuning.strings.map((str, i) => (
          <li key={i} className="custom-tuning__row">
            <span className="custom-tuning__index">{i + 1}</span>
            <select
              data-testid={`custom-string-${i}-note`}
              className="custom-tuning__select"
              value={str.name}
              onChange={(e) => setString(i, e.target.value as NoteName, str.octave)}
              aria-label={`Saite ${i + 1} Note`}
            >
              {NOTE_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              data-testid={`custom-string-${i}-octave`}
              className="custom-tuning__select"
              value={str.octave}
              onChange={(e) => setString(i, str.name, Number(e.target.value))}
              aria-label={`Saite ${i + 1} Oktave`}
            >
              {OCTAVES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="custom-tuning__play"
              data-testid={`custom-string-${i}-play`}
              onClick={() => playFrequency(str.freq)}
              aria-label={`Saite ${i + 1} anhören`}
            >
              ▶
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
