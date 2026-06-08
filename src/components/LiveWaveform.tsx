import { useEffect, useRef } from 'react';
import './LiveWaveform.css';

type Props = {
  active: boolean;
  read: () => { wave: Float32Array; peak: number } | null;
};

// Live input oscilloscope ("Ausschlag") shown while the mic is open / recording.
// It drives its own requestAnimationFrame loop and draws straight to a canvas, so
// the parent <Recorder> never re-renders at frame rate. The current peak is also
// mirrored onto a `data-level` attribute so it can be asserted in E2E tests.
export function LiveWaveform({ active, read }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) {
      rootRef.current?.setAttribute('data-level', '0');
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;

    const draw = () => {
      const cssW = canvas.clientWidth || 280;
      const cssH = canvas.clientHeight || 56;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      const frame = read();
      const peak = frame?.peak ?? 0;
      rootRef.current?.setAttribute('data-level', peak.toFixed(3));

      const color = getComputedStyle(canvas).getPropertyValue('--wave-color').trim() || '#92a0f8';
      const mid = cssH / 2;

      // Baseline.
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cssW, mid);
      ctx.stroke();

      if (frame && frame.wave.length > 1) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const step = frame.wave.length / cssW;
        for (let x = 0; x < cssW; x++) {
          const v = frame.wave[Math.floor(x * step)];
          const y = mid - v * (cssH / 2 - 2);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, read]);

  if (!active) return null;

  return (
    <div ref={rootRef} className="live-waveform" data-testid="recorder-monitor" data-level="0">
      <canvas ref={canvasRef} className="live-waveform__canvas" aria-hidden="true" />
    </div>
  );
}
