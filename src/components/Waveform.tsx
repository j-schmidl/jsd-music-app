import { useEffect, useRef } from 'react';
import { computePeaks } from '../lib/waveform';
import './Waveform.css';

type Props = {
  buffer: Float32Array;
  sampleRate: number;
  /** Overhang margin (seconds) at each end, drawn dimmed. */
  overhangSec?: number;
};

// Static waveform of one loop recording. The overhang margins (audio captured
// just before/after the loop boundary) are drawn dimmed so it's clear which part
// shifting can pull into view.
export function Waveform({ buffer, sampleRate, overhangSec = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssWidth = canvas.clientWidth || 280;
    const cssHeight = canvas.clientHeight || 48;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const buckets = Math.max(1, Math.floor(cssWidth));
    const peaks = computePeaks(buffer, buckets);
    const mid = cssHeight / 2;
    const overhangFrac = buffer.length > 0 ? (overhangSec * sampleRate) / buffer.length : 0;

    const accent = getComputedStyle(canvas).getPropertyValue('--wave-color').trim() || '#92a0f8';

    for (let x = 0; x < buckets; x++) {
      const frac = x / buckets;
      const inMargin = frac < overhangFrac || frac > 1 - overhangFrac;
      const h = Math.max(1, peaks[x] * (cssHeight - 4));
      ctx.fillStyle = accent;
      ctx.globalAlpha = inMargin ? 0.3 : 1;
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
    ctx.globalAlpha = 1;
  }, [buffer, sampleRate, overhangSec]);

  return <canvas ref={canvasRef} className="waveform" aria-hidden="true" />;
}
