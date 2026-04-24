import { PitchDetector } from 'pitchy';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'starting' | 'listening' | 'error';

export type PitchState = {
  status: Status;
  frequency: number | null;
  clarity: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
};

const BUFFER_SIZE = 2048;
const CLARITY_THRESHOLD = 0.9;
const MIN_FREQ = 60;
const MAX_FREQ = 1200;

export function usePitchDetection(): PitchState {
  const [status, setStatus] = useState<Status>('idle');
  const [frequency, setFrequency] = useState<number | null>(null);
  const [clarity, setClarity] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setStatus('idle');
    setFrequency(null);
    setClarity(0);
  }, []);

  const start = useCallback(async () => {
    if (audioCtxRef.current) return;
    setStatus('starting');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = BUFFER_SIZE;
      source.connect(analyser);

      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const buffer = new Float32Array(detector.inputLength);

      setStatus('listening');

      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);
        const [freq, clar] = detector.findPitch(buffer, ctx.sampleRate);
        if (clar > CLARITY_THRESHOLD && freq >= MIN_FREQ && freq <= MAX_FREQ) {
          setFrequency(freq);
          setClarity(clar);
        } else {
          setClarity(clar);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'microphone unavailable');
    }
  }, []);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { status, frequency, clarity, error, start, stop };
}
