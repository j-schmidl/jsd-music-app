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
  // True when the capture chain has gone silent for STALL_MS while we believe
  // we are listening — i.e. the pipeline looks dead (suspended/interrupted
  // AudioContext) rather than the user simply pausing. Surfaces a manual
  // "restart" affordance; the hook also auto-restarts at AUTO_RESTART_MS.
  stalled: boolean;
  start: (deviceId?: string) => Promise<void>;
  stop: () => void;
  refreshDevices: () => Promise<void>;
};

const BUFFER_SIZE = 2048;
const CLARITY_THRESHOLD = 0.9;
// Reaches down to ~C0 (16 Hz) so the chromatic tuner and bass tunings cover
// the lowest strings (a 5-string bass low B is ~31 Hz).
const MIN_FREQ = 16;
const MAX_FREQ = 1200;
// Below this input RMS the buffer is effectively digital silence: a live mic
// always sits above its noise floor, so this only trips when the pipeline is
// dead (e.g. a suspended/interrupted AudioContext returning all-zero frames).
const SILENCE_RMS = 1e-4;
const STALL_MS = 5000; // show the restart button after this much silence
const AUTO_RESTART_MS = 10000; // auto-restart the capture chain after this much
// Light low-pass on the reported pitch: each frame eases this fraction of the
// way toward the raw reading (1 = no smoothing). ~0.25 takes the edge off the
// per-frame jitter without adding noticeable lag.
const SMOOTHING = 0.25;
// Jumps larger than this (in cents) are treated as a new note rather than
// jitter, so switching strings snaps instantly instead of gliding.
const SNAP_CENTS = 80;

export function usePitchDetection(): PitchState {
  const [status, setStatus] = useState<Status>('idle');
  const [frequency, setFrequency] = useState<number | null>(null);
  const [clarity, setClarity] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // Watchdog state for the silence detector. `silentSinceRef` is the timestamp
  // when the current run of silence began (null while there is signal).
  const silentSinceRef = useRef<number | null>(null);
  const stalledRef = useRef(false);
  // Last smoothed pitch, fed back into the EMA each frame (null between notes).
  const smoothedFreqRef = useRef<number | null>(null);
  // The current device, mirrored into a ref so the rAF loop can restart on the
  // same input without depending on (stale) closure state.
  const activeDeviceIdRef = useRef<string | null>(null);
  // Lets the loop trigger a full restart without referencing `start` before it
  // is declared. Pointed at the live `start` on every render.
  const startRef = useRef<((deviceId?: string) => Promise<void>) | undefined>(undefined);

  const clearStall = useCallback(() => {
    silentSinceRef.current = null;
    if (stalledRef.current) {
      stalledRef.current = false;
      setStalled(false);
    }
  }, []);

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
    clearStall();
    smoothedFreqRef.current = null;
    setStatus('idle');
    setFrequency(null);
    setClarity(0);
  }, [clearStall]);

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

      clearStall();
      smoothedFreqRef.current = null;
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
        const resolvedDeviceId = settings?.deviceId ?? deviceId ?? null;
        setActiveDeviceId(resolvedDeviceId);
        activeDeviceIdRef.current = resolvedDeviceId;

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
          // Most common "stuck" cause: the context got suspended (backgrounded
          // tab, screen lock, call, BT device). Try to silently resume it
          // before the silence watchdog ever escalates to a visible restart.
          if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);

          analyser.getFloatTimeDomainData(buffer);

          // Watchdog: a dead pipeline returns digital silence (RMS ~ 0) while a
          // live mic always sits above its noise floor. Track how long we have
          // been silent and escalate — but never while genuinely receiving sound.
          let sumSq = 0;
          for (let i = 0; i < buffer.length; i++) sumSq += buffer[i] * buffer[i];
          const rms = Math.sqrt(sumSq / buffer.length);
          const now = performance.now();
          if (rms > SILENCE_RMS) {
            clearStall();
          } else {
            if (silentSinceRef.current === null) silentSinceRef.current = now;
            const silentMs = now - silentSinceRef.current;
            if (silentMs >= AUTO_RESTART_MS) {
              // Resume could not revive it — rebuild the whole capture chain.
              void startRef.current?.(activeDeviceIdRef.current ?? undefined);
              return; // start() tears this loop down and launches a fresh one
            }
            if (silentMs >= STALL_MS && !stalledRef.current) {
              stalledRef.current = true;
              setStalled(true);
            }
          }

          const [freq, clar] = detector.findPitch(buffer, ctx.sampleRate);
          if (clar > CLARITY_THRESHOLD && freq >= MIN_FREQ && freq <= MAX_FREQ) {
            // Ease toward the raw reading to take the jitter off the needle, but
            // snap straight to it on a large jump so changing strings is instant.
            const prev = smoothedFreqRef.current;
            const isNewNote = prev === null || Math.abs(1200 * Math.log2(freq / prev)) > SNAP_CENTS;
            const next = isNewNote ? freq : prev + (freq - prev) * SMOOTHING;
            smoothedFreqRef.current = next;
            setFrequency(next);
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
    [refreshDevices, clearStall],
  );
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  // When the page comes back to the foreground, eagerly resume a suspended
  // context and give the freshly-revived pipeline a clean grace period before
  // the watchdog judges it again — otherwise time spent backgrounded would
  // count as silence and trip an immediate restart on return.
  useEffect(() => {
    const revive = () => {
      if (document.visibilityState !== 'visible') return;
      const ctx = audioCtxRef.current;
      if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
      clearStall();
    };
    document.addEventListener('visibilitychange', revive);
    window.addEventListener('focus', revive);
    return () => {
      document.removeEventListener('visibilitychange', revive);
      window.removeEventListener('focus', revive);
    };
  }, [clearStall]);

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

  return {
    status,
    frequency,
    clarity,
    error,
    devices,
    activeDeviceId,
    stalled,
    start,
    stop,
    refreshDevices,
  };
}
