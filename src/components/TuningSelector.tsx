import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TUNINGS, type Tuning } from '../lib/tuning';
import './TuningSelector.css';

type Props = {
  active: Tuning;
  onChange: (tuning: Tuning) => void;
};

export function TuningSelector({ active, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  // Outside click closes the menu.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Position the portaled menu under the trigger.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const r = triggerRef.current!.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, left: r.left, minWidth: Math.max(180, r.width) });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  const handleSelect = (t: Tuning) => {
    setOpen(false);
    onChange(t);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="tuning-selector"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        data-testid="tuning-selector"
      >
        <span className="tuning-selector__label">{active.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && menuPos &&
        createPortal(
          <ul
            ref={menuRef}
            className="tuning-selector__menu"
            role="listbox"
            data-testid="tuning-selector-menu"
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
          >
            {TUNINGS.map((t) => {
              const isActive = t.id === active.id;
              return (
                <li key={t.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`tuning-selector__item${isActive ? ' tuning-selector__item--active' : ''}`}
                    onClick={() => handleSelect(t)}
                    data-testid={`tuning-option-${t.id}`}
                  >
                    {isActive && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l4 4L19 7" />
                      </svg>
                    )}
                    <span className="tuning-selector__item-label">{t.label}</span>
                    <span className="tuning-selector__item-strings">
                      {t.strings.map((s) => s.name).join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
