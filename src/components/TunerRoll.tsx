import { useEffect, useRef } from 'react';
import './TunerRoll.css';

type Props = {
  /** Normalized needle position in [-1, 1], or null when there is no signal. */
  value: number | null;
  /** True when the detected note is within tuning tolerance. */
  inTune: boolean;
};

/**
 * A seismograph-style tuning history behind the needle. Samples the current
 * needle position on every frame into a ring buffer and draws it as a polyline
 * flowing from right (newest) to left (oldest). The stroke uses the Musik
 * accent for off-tune samples and Tech green for in-tune samples, matching
 * the brand CI and the needle color itself.
 */
export function TunerRoll({ value, inTune }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const valueRef = useRef(value);
  const inTuneRef = useRef(inTune);
  const rafRef = useRef<number | null>(null);

  // History: a fixed-length ring buffer of { v, inTune } samples. We render
  // it every frame as a continuous polyline across the canvas.
  const HISTORY_LENGTH = 240;
  const historyRef = useRef<{ v: number | null; inTune: boolean }[]>(
    Array.from({ length: HISTORY_LENGTH }, () => ({ v: null, inTune: false })),
  );
  const writeIndexRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
    inTuneRef.current = inTune;
  }, [value, inTune]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const styles = getComputedStyle(document.documentElement);
    const musik = styles.getPropertyValue('--musik').trim() || '#92A0F8';
    const tech = styles.getPropertyValue('--tech').trim() || '#8CEBCD';
    const musikDim = `${musik}33`;

    // Throttle history writes so one sample ≈ one pixel of horizontal travel,
    // instead of one sample per animation frame.
    const WRITE_INTERVAL_MS = 30;
    let lastWrite = 0;

    const render = (now: number) => {
      if (now - lastWrite >= WRITE_INTERVAL_MS) {
        lastWrite = now;
        const v = valueRef.current;
        historyRef.current[writeIndexRef.current] = {
          v: v !== null && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : null,
          inTune: inTuneRef.current,
        };
        writeIndexRef.current = (writeIndexRef.current + 1) % HISTORY_LENGTH;
      }

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // Center baseline
      ctx.strokeStyle = musikDim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      // Draw history as a polyline, newest sample at the right edge.
      const amplitude = (h / 2) * 0.85;
      const step = w / (HISTORY_LENGTH - 1);
      // Read oldest → newest in chronological order.
      const start = writeIndexRef.current; // oldest slot
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      let lastColor: string | null = null;
      let pathOpen = false;

      for (let i = 0; i < HISTORY_LENGTH; i++) {
        const sample = historyRef.current[(start + i) % HISTORY_LENGTH];
        const x = i * step;
        if (sample.v === null) {
          // Break the line on gaps (no signal).
          if (pathOpen) {
            ctx.stroke();
            pathOpen = false;
          }
          continue;
        }
        const y = h / 2 - sample.v * amplitude;
        const color = sample.inTune ? tech : musik;
        if (!pathOpen || color !== lastColor) {
          if (pathOpen) ctx.stroke();
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.moveTo(x, y);
          pathOpen = true;
          lastColor = color;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (pathOpen) ctx.stroke();

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="tuner-roll" aria-hidden="true" />;
}
