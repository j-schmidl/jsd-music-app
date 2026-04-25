import { useEffect, useRef } from 'react';
import './TunerRoll.css';

type Props = {
  /** Normalized needle position in [-1, 1], or null when there is no signal. */
  value: number | null;
  /** True when the detected note is within tuning tolerance. */
  inTune: boolean;
  /**
   * Half-width (in CSS pixels) of the needle's lateral travel range. Each
   * sample is plotted at `centerX + value * deflection` so the trail's bottom
   * edge always lines up with the needle dot's center.
   */
  deflection?: number;
};

/**
 * A vertical seismograph that lives directly above the needle dot. The newest
 * sample is drawn at the very top of the strip; samples flow down each frame
 * and meet the dot at the bottom. The horizontal coordinate maps 1:1 to the
 * needle's deflection so the trail and the needle share the same x-axis —
 * the line literally arrives at the top of the dot.
 *
 * History is kept in a JS ring buffer (rather than scrolling the bitmap) so
 * we can re-render the full trail every frame without any composite-mode
 * shenanigans. This is more reliable than getImageData/putImageData scrolling
 * and works the same across browsers and DPRs.
 */
export function TunerRoll({ value, inTune, deflection = 110 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const valueRef = useRef(value);
  const inTuneRef = useRef(inTune);
  const deflectionRef = useRef(deflection);
  const rafRef = useRef<number | null>(null);

  // Ring buffer of recent samples. One sample is captured per visible row of
  // history (1px). At 60fps with WRITE_INTERVAL_MS=16 that means the trail
  // moves 1px down per frame which reads as a smooth flow.
  const HISTORY = useRef<{ x: number | null; inTune: boolean }[]>([]);
  const HEAD = useRef(0);

  useEffect(() => {
    valueRef.current = value;
    inTuneRef.current = inTune;
    deflectionRef.current = deflection;
  }, [value, inTune, deflection]);

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
      // (Re)allocate the history buffer to match the new pixel height.
      const len = Math.max(1, Math.floor(clientHeight));
      HISTORY.current = Array.from({ length: len }, () => ({ x: null, inTune: false }));
      HEAD.current = 0;
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const styles = getComputedStyle(document.documentElement);
    const musik = styles.getPropertyValue('--musik').trim() || '#92A0F8';
    const tech = styles.getPropertyValue('--tech').trim() || '#8CEBCD';

    // Capture and render once per ~16ms so the trail flows ~60px/sec.
    const FRAME_INTERVAL_MS = 16;
    let lastFrame = 0;

    const render = (now: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (now - lastFrame >= FRAME_INTERVAL_MS) {
        lastFrame = now;

        // Capture a new sample at the head of the ring buffer.
        const v = valueRef.current;
        const x =
          v !== null && Number.isFinite(v)
            ? w / 2 + Math.max(-1, Math.min(1, v)) * deflectionRef.current
            : null;
        HISTORY.current[HEAD.current] = { x, inTune: inTuneRef.current };
        HEAD.current = (HEAD.current + 1) % HISTORY.current.length;

        // Repaint the whole strip from the buffer. y=0 is the freshest sample
        // (the top of the strip) and y=h-1 is the oldest.
        ctx.clearRect(0, 0, w, h);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;

        let prev: { x: number | null; inTune: boolean } | null = null;
        let pathOpen = false;
        let lastColor: string | null = null;

        for (let row = 0; row < h && row < HISTORY.current.length; row++) {
          // Walk the buffer backwards from HEAD so row 0 is the newest sample.
          const idx = (HEAD.current - 1 - row + HISTORY.current.length) % HISTORY.current.length;
          const sample = HISTORY.current[idx];
          if (sample.x === null) {
            if (pathOpen) {
              ctx.stroke();
              pathOpen = false;
            }
            prev = null;
            continue;
          }
          const color = sample.inTune ? tech : musik;
          if (!pathOpen || color !== lastColor || prev?.x === null) {
            if (pathOpen) ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.moveTo(sample.x, row + 0.5);
            pathOpen = true;
            lastColor = color;
          } else {
            ctx.lineTo(sample.x, row + 0.5);
          }
          prev = sample;
        }
        if (pathOpen) ctx.stroke();
      }

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
