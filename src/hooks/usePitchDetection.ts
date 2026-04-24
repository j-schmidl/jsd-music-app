import { PitchDetector } from 'pitchy';
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'starting' | 'listening' | 'error';

export type MicDevice = {
  deviceId: string;
  label: string;
};

export type PitchState = {
  status: Status;
  frequency: number | null;
  clarity: number;
  error: string | null;
  devices: MicDevice[];
  activeDeviceId: string | null;
  start: (deviceId?: string) => Promise<void>;
  stop: () => void;
  refreshDevices: () => Promise<void>;
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
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const mics = list
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          // Labels are empty until permission is granted — fall back to a stable
          // numbered placeholder so the picker always has something to show.
          label: d.label || `Mikrofon ${i + 1}`,
        }));
      setDevices(mics);
    } catch {
      // Ignore — the picker will just stay empty until permission unlocks labels.
    }
  }, []);

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

  const start = useCallback(
    async (deviceId?: string) => {
      // Tear down the previous stream before switching devices or restarting.
      if (streamRef.current || audioCtxRef.current) {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        await audioCtxRef.current?.close().catch(() => undefined);
        audioCtxRef.current = null;
      }

      setStatus('starting');
      setError(null);
      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        // Labels only populate after the first permission grant.
        await refreshDevices();
        const track = stream.getAudioTracks()[0];
        const settings = track?.getSettings();
        setActiveDeviceId(settings?.deviceId ?? deviceId ?? null);

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
    },
    [refreshDevices],
  );

  // Keep the device list in sync with OS-level changes (plug/unplug).
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const handler = () => {
      void refreshDevices();
    };
    md.addEventListener('devicechange', handler);
    return () => md.removeEventListener('devicechange', handler);
  }, [refreshDevices]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { status, frequency, clarity, error, devices, activeDeviceId, start, stop, refreshDevices };
}
