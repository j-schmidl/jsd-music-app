import { useCallback, useEffect, useRef, useState } from 'react';
import { estimateBpm } from '../lib/onset';

// Microphone-based tempo finder. It records a rolling window of audio and, a
// few times per second, runs the same `estimateBpm` pipeline that the offline
// tests validate against real songs. The component plays a track (or the user
// plays an instrument) near the mic and the detector converges on the tempo.

type Status = 'idle' | 'starting' | 'listening' | 'error';

const WINDOW_SECONDS = 8; // how much recent audio each estimate considers
const MIN_SECONDS = 4; // don't guess until we've heard at least this much
const ESTIMATE_EVERY_MS = 400;
const PROCESSOR_BUFFER = 2048;
// Below this autocorrelation confidence we treat the estimate as "still
// listening" rather than showing a jumpy number.
const CONFIDENCE_FLOOR = 0.15;

export type BpmDetectorState = {
  status: Status;
  /** Latest stable estimate, or null while still converging. */
  bpm: number | null;
  confidence: number;
  /** 0..1 — how full the analysis window is, for a "listening" progress hint. */
  fill: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
};

export function useBpmDetector(): BpmDetectorState {
  const [status, setStatus] = useState<Status>('idle');
  const [bpm, setBpm] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [fill, setFill] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Ring buffer of the most recent WINDOW_SECONDS of mono samples.
  const ringRef = useRef<Float32Array | null>(null);
  const writeRef = useRef(0); // next write index
  const filledRef = useRef(0); // total samples written (caps at ring length)
  const sampleRateRef = useRef(44100);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    ringRef.current = null;
    writeRef.current = 0;
    filledRef.current = 0;
    setStatus('idle');
    setFill(0);
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setStatus('starting');
    setError(null);
    setBpm(null);
    setConfidence(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;

      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;

      const ring = new Float32Array(Math.ceil(WINDOW_SECONDS * ctx.sampleRate));
      ringRef.current = ring;
      writeRef.current = 0;
      filledRef.current = 0;

      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);
      nodeRef.current = processor;
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const r = ringRef.current;
        if (!r) return;
        let w = writeRef.current;
        for (let i = 0; i < input.length; i++) {
          r[w] = input[i];
          w = (w + 1) % r.length;
        }
        writeRef.current = w;
        filledRef.current = Math.min(r.length, filledRef.current + input.length);
      };
      // A ScriptProcessor only fires when it reaches a destination; route it
      // through a silent gain so we capture audio without echoing it back.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(processor);
      processor.connect(mute).connect(ctx.destination);

      setStatus('listening');

      intervalRef.current = window.setInterval(() => {
        const r = ringRef.current;
        const sr = sampleRateRef.current;
        if (!r) return;
        const have = filledRef.current;
        setFill(Math.min(1, have / r.length));
        if (have < MIN_SECONDS * sr) return;

        // Linearise the ring buffer oldest-first before analysing.
        const linear = new Float32Array(have);
        const startIdx = have < r.length ? 0 : writeRef.current;
        for (let i = 0; i < have; i++) linear[i] = r[(startIdx + i) % r.length];

        const est = estimateBpm(linear, sr);
        if (est && est.confidence >= CONFIDENCE_FLOOR) {
          setBpm(Math.round(est.bpm));
          setConfidence(est.confidence);
        } else if (est) {
          setConfidence(est.confidence);
        }
      }, ESTIMATE_EVERY_MS);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'microphone unavailable');
    }
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { status, bpm, confidence, fill, error, start, stop };
}
