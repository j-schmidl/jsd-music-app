import { useEffect, useRef, useState } from 'react';
import type { MicDevice } from '../hooks/usePitchDetection';
import './MicButton.css';

type Props = {
  status: 'idle' | 'starting' | 'listening' | 'error';
  devices: MicDevice[];
  activeDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onRetrigger: () => void;
};

export function MicButton({ status, devices, activeDeviceId, onSelect, onRetrigger }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close the popover when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMainClick = () => {
    // Primary click restarts the mic so the browser re-prompts if the user
    // had blocked it before. This matches the "mic button re-triggers the
    // permission" behavior the user asked for.
    onRetrigger();
  };

  const handlePickerToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const handleSelect = (deviceId: string) => {
    setOpen(false);
    onSelect(deviceId);
  };

  const label =
    status === 'listening'
      ? 'Mikrofon neu starten'
      : status === 'starting'
        ? 'Mikrofon wird gestartet'
        : status === 'error'
          ? 'Mikrofon aktivieren'
          : 'Mikrofon aktivieren';

  return (
    <div ref={rootRef} className="mic-btn" data-testid="mic-button" data-status={status}>
      <button
        type="button"
        className="mic-btn__main"
        aria-label={label}
        onClick={handleMainClick}
        data-testid="mic-button-main"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
        {status === 'listening' && <span className="mic-btn__live" aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="mic-btn__picker"
        aria-label="Mikrofon auswählen"
        aria-expanded={open}
        onClick={handlePickerToggle}
        data-testid="mic-picker-toggle"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul className="mic-btn__menu" role="menu" data-testid="mic-picker-menu">
          {devices.length === 0 && (
            <li className="mic-btn__menu-empty">Keine Mikrofone gefunden</li>
          )}
          {devices.map((d) => {
            const isActive = d.deviceId === activeDeviceId;
            return (
              <li key={d.deviceId} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className={`mic-btn__menu-item${isActive ? ' mic-btn__menu-item--active' : ''}`}
                  onClick={() => handleSelect(d.deviceId)}
                  data-testid={`mic-option-${d.deviceId}`}
                >
                  {isActive && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l4 4L19 7" />
                    </svg>
                  )}
                  <span>{d.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
