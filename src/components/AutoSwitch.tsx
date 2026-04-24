import './AutoSwitch.css';

type Props = {
  mode: 'auto' | 'manual';
  onChange: (mode: 'auto' | 'manual') => void;
};

export function AutoSwitch({ mode, onChange }: Props) {
  const isAuto = mode === 'auto';
  return (
    <label className="auto-switch" data-testid="auto-switch">
      <span className="auto-switch__label">AUTOM.</span>
      <input
        type="checkbox"
        className="auto-switch__input"
        checked={isAuto}
        onChange={(e) => onChange(e.target.checked ? 'auto' : 'manual')}
        aria-label="Automatik-Modus"
      />
      <span className="auto-switch__track" aria-hidden="true">
        <span className="auto-switch__thumb" />
      </span>
    </label>
  );
}
