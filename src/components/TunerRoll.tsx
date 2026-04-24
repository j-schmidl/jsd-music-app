import { useEffect, useRef } from 'react';
import './TunerRoll.css';

type Props = {
  /** Normalized needle position in [-1, 1], or null when there is no signal. */
  value: number | null;
  /** True when the detected note is within tuning tolerance. */
  inTune: boolean;
};

/**
 * A rotating-drum background behind the tuner needle. Each tick the existing
 * pixels scroll down (as if a roll of paper were turning) and a fresh mark is
 * stamped at the top at the horizontal position of the needle. Over time this
 * draws a line that records the recent tuning history in the CI colors.
 */
export function TunerRoll({ value, inTune }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const valueRef = useRef(value);
  const inTuneRef = useRef(inTune);
  const rafRef = useRef<number | null>(null);

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
      ctx.clearRect(0, 0, clientWidth, clientHeight);
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const styles = getComputedStyle(document.documentElement);
    const musik = styles.getPropertyValue('--musik').trim() || '#92A0F8';
    const tech = styles.getPropertyValue('--tech').trim() || '#8CEBCD';

    // Slow the scroll: only advance every other animation frame (~30Hz) so the
    // trace is readable. A pure 60Hz 1px scroll flies by too fast on desktop.
    let frame = 0;

    const render = () => {
      frame++;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (frame % 2 === 0) {
        // Turn the drum — shift everything down by 1px. drawImage on the source
        // canvas itself is well-defined and respects the transform matrix.
        ctx.save();
        ctx.globalCompositeOperation = 'copy';
        ctx.drawImage(canvas, 0, 0, w, h, 0, 1, w, h);
        ctx.restore();

        // Clear the new top row ready for the fresh stamp.
        ctx.clearRect(0, 0, w, 1.5);
      }

      // Stamp a fresh mark at the top. When a signal is present, draw at the
      // needle's x in the state-matched CI color. When idle, mark a subtle
      // centre tick so the drum visibly turns even without mic input.
      const v = valueRef.current;
      if (v !== null && Number.isFinite(v)) {
        const clamped = Math.max(-1, Math.min(1, v));
        const x = w / 2 + (clamped * w) / 2;
        const color = inTuneRef.current ? tech : musik;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, 1.2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (frame % 2 === 0) {
        // Subtle idle tick on the centre line.
        ctx.fillStyle = `${musik}55`;
        ctx.fillRect(w / 2 - 0.5, 0.8, 1, 1);
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
