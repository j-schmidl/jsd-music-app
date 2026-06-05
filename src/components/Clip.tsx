import { useRef } from 'react';
import type { LoopRecording } from '../lib/recording';
import { Waveform } from './Waveform';
import './Clip.css';

type Props = {
  rec: LoopRecording;
  index: number;
  sampleRate: number;
  totalSec: number;
  selected: boolean;
  onSelect: () => void;
  /** Set the take's absolute shift in ms (drag result). */
  onShift: (shiftMs: number) => void;
  onToggleMute: () => void;
  onRemove: () => void;
  onExport: () => void;
};

const DRAG_THRESHOLD_PX = 4;

// One recording region on the timeline, Logic-style. Drag it horizontally to
// move it in time (this replaces the old "Versatz" slider); tap to select and
// reveal mute / download / delete. Position + width come from the take's sample
// offset and length, as percentages of the total timeline.
export function Clip({
  rec,
  index,
  sampleRate,
  totalSec,
  selected,
  onSelect,
  onShift,
  onToggleMute,
  onRemove,
  onExport,
}: Props) {
  const startSec = (rec.startSample + rec.shiftSamples) / sampleRate;
  const durSec = rec.buffer.length / sampleRate;
  const left = totalSec > 0 ? (startSec / totalSec) * 100 : 0;
  const width = totalSec > 0 ? (durSec / totalSec) * 100 : 0;

  const drag = useRef<{ startX: number; baseMs: number; laneW: number; moved: boolean } | null>(
    null,
  );

  const onPointerDown = (e: React.PointerEvent) => {
    // Ignore drags that start on a toolbar button.
    if ((e.target as HTMLElement).closest('.clip__btn')) return;
    const laneW = (e.currentTarget.parentElement as HTMLElement)?.offsetWidth ?? 1;
    drag.current = {
      startX: e.clientX,
      baseMs: (rec.shiftSamples / sampleRate) * 1000,
      laneW,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
    if (!d.moved) return;
    const dSec = (dx / d.laneW) * totalSec;
    let nextMs = d.baseMs + dSec * 1000;
    // Keep the clip fully inside the timeline.
    const anchorSec = rec.startSample / sampleRate;
    const minMs = -anchorSec * 1000;
    const maxMs = (totalSec - durSec - anchorSec) * 1000;
    nextMs = Math.max(minMs, Math.min(maxMs, nextMs));
    onShift(Math.round(nextMs));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone
    }
    if (d && !d.moved) onSelect();
  };

  return (
    <div
      className={`clip${selected ? ' clip--selected' : ''}${rec.muted ? ' clip--muted' : ''}`}
      style={{ left: `${left}%`, width: `${width}%` }}
      data-testid={`clip-${rec.id}`}
      data-left={left.toFixed(2)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="clip__bar">
        <span className="clip__label">Loop {index + 1}</span>
        {selected && (
          <span className="clip__tools">
            <button
              type="button"
              className={`clip__btn${rec.muted ? ' clip__btn--on' : ''}`}
              aria-label="Aufnahme stumm"
              onClick={onToggleMute}
            >
              M
            </button>
            <button
              type="button"
              className="clip__btn"
              aria-label="Aufnahme exportieren"
              onClick={onExport}
            >
              ↓
            </button>
            <button
              type="button"
              className="clip__btn"
              aria-label="Aufnahme löschen"
              onClick={onRemove}
            >
              ✕
            </button>
          </span>
        )}
      </div>
      <Waveform buffer={rec.buffer} sampleRate={sampleRate} />
    </div>
  );
}
