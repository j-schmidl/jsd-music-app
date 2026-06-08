import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fitTotalLength,
  loopDurationSec,
  mixDown,
  secondsToSamples,
  type LoopRecording,
  type Track,
} from '../lib/recording';
import { encodeWav } from '../lib/wav';
import { useMicDevices } from './useMicDevices';

// The multi-track loop recorder engine. It owns the AudioContext, the mic
// stream, transport playback and recording, and the whole project state.
//
// Playback model: each track is pre-rendered into one mono buffer covering the
// whole timeline (its recordings summed by `mixDown`), wrapped in a looping
// AudioBufferSourceNode behind a per-track GainNode. All track sources — plus a
// baked click track — share one start time and one loop region, so they stay
// sample-locked; mute/solo is then just flipping gains, live, even mid-record.
//
// Recording model: the mic feeds a ScriptProcessor (routed through a silent gain
// so it fires). While armed+recording we accumulate its frames; on stop we anchor
// the take on the timeline (loop start minus an overhang margin) and append it to
// the armed track — stacking on whatever is already there ("übereinander").

type MicStatus = 'idle' | 'starting' | 'listening' | 'error';

const DEFAULT_BPM = 100;
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_LOOP_BARS = 16;
const DEFAULT_TARGET_SEC = 150; // 2:30, before snapping to whole loops

const START_LEAD_S = 0.08; // small schedule-ahead so every source starts cleanly
const CLICK_LEN_S = 0.04;
const ACCENT_FREQ = 1500;
const BEAT_FREQ = 1000;
const PROCESSOR_BUFFER = 2048;

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

export type RecorderProject = {
  bpm: number;
  beatsPerBar: number;
  loopBars: number;
  totalSec: number;
  loops: number;
  cycle: { enabled: boolean; startBar: number; endBar: number };
  metronome: boolean;
};

export type RecorderState = {
  project: RecorderProject;
  tracks: Track[];
  armedTrackId: string | null;
  soloTrackId: string | null;
  isPlaying: boolean;
  isRecording: boolean;
  playheadSec: number;
  /** The engine's actual AudioContext sample rate (44100 until it is created). */
  sampleRate: number;
  // Mic / device picker (shared shape with the tuner's <MicButton>).
  micStatus: MicStatus;
  micError: string | null;
  devices: ReturnType<typeof useMicDevices>['devices'];
  activeDeviceId: string | null;
  startMic: (deviceId?: string) => Promise<void>;
  /** Latest mic time-domain frame + its peak for the live oscilloscope. */
  readInputWave: () => { wave: Float32Array; peak: number } | null;
  // Transport
  play: () => void;
  stop: () => void;
  /** Move the playhead (seconds, clamped) — play/record start from here. */
  setPlayhead: (sec: number) => void;
  /** Toggle recording. Pass a trackId to arm + record that Spur in one click. */
  record: (trackId?: string) => Promise<void>;
  // Tracks
  addTrack: (name?: string) => void;
  removeTrack: (id: string) => void;
  renameTrack: (id: string, name: string) => void;
  arm: (id: string | null) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  // Recordings
  setRecordingShift: (trackId: string, recId: string, shiftMs: number) => void;
  toggleRecordingMute: (trackId: string, recId: string) => void;
  removeRecording: (trackId: string, recId: string) => void;
  // Project settings
  setBpm: (bpm: number) => void;
  setBeatsPerBar: (n: number) => void;
  setLoopBars: (n: number) => void;
  setTargetSec: (sec: number) => void;
  setCycle: (cycle: Partial<RecorderProject['cycle']>) => void;
  setMetronome: (on: boolean) => void;
  // Export
  exportMix: () => void;
  exportTrack: (id: string) => void;
  exportRecording: (trackId: string, recId: string) => void;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useMultitrackRecorder(): RecorderState {
  const [bpm, setBpmState] = useState(DEFAULT_BPM);
  const [beatsPerBar, setBeatsPerBarState] = useState(DEFAULT_BEATS_PER_BAR);
  const [loopBars, setLoopBarsState] = useState(DEFAULT_LOOP_BARS);
  const [targetSec, setTargetSecState] = useState(DEFAULT_TARGET_SEC);
  const [cycle, setCycleState] = useState({
    enabled: true,
    startBar: 0,
    endBar: DEFAULT_LOOP_BARS,
  });
  const [metronome, setMetronome] = useState(true);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [armedTrackId, setArmedTrackId] = useState<string | null>(null);
  const [soloTrackId, setSoloTrackId] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [sampleRate, setSampleRate] = useState(44100);

  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const { devices, activeDeviceId, setActiveDeviceId, refreshDevices } = useMicDevices();

  // Derived loop/total timing.
  const loopSec = useMemo(
    () => loopDurationSec(loopBars, bpm, beatsPerBar),
    [loopBars, bpm, beatsPerBar],
  );
  const { totalSec, loops } = useMemo(
    () => fitTotalLength(targetSec, loopSec),
    [targetSec, loopSec],
  );

  // ── Web Audio refs (engine state that must not trigger re-render) ──────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const trackNodesRef = useRef<Map<string, { src: AudioBufferSourceNode; gain: GainNode }>>(
    new Map(),
  );
  const clickNodesRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const rafRef = useRef<number | null>(null);
  const startCtxTimeRef = useRef(0);
  const startSampleRef = useRef(0);
  // Live playhead position (seconds), mirrored from state so play()/record() can
  // start "from where the cursor is" without being re-created every rAF frame.
  const playheadRef = useRef(0);

  // Mic capture refs.
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Reusable scratch buffer for the live input oscilloscope (inferred element
  // type keeps it Float32Array<ArrayBuffer>, which getFloatTimeDomainData wants).
  const waveBufRef = useRef(new Float32Array(1024));
  const recordingRef = useRef(false);
  const captureRef = useRef<Float32Array[]>([]);
  const recordStartSampleRef = useRef(0);
  const recordStopTimerRef = useRef<number | null>(null);
  // The track the in-flight take is being written to. Held in a ref (not read
  // from armedTrackId state) so "record onto this Spur" can arm + record in one
  // click without waiting for the state update to flush.
  const recordTargetRef = useRef<string | null>(null);

  // Mirror frequently-read project values into refs for the audio callbacks
  // (timers, rAF, onaudioprocess) which run after commit and must see the latest
  // values without being torn down each render. Updated in an effect so we never
  // touch the ref during render.
  const liveRef = useRef({
    tracks,
    soloTrackId,
    cycle,
    totalSec,
    loopSec,
    bpm,
    beatsPerBar,
    metronome,
  });
  useEffect(() => {
    liveRef.current = {
      tracks,
      soloTrackId,
      cycle,
      totalSec,
      loopSec,
      bpm,
      beatsPerBar,
      metronome,
    };
  });

  const ensureContext = useCallback((): AudioContext => {
    let ctx = ctxRef.current;
    if (!ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.connect(ctx.destination);
      masterRef.current = master;
      setSampleRate(ctx.sampleRate);
    }
    void ctx.resume();
    return ctx;
  }, []);

  // ── Buffer rendering ───────────────────────────────────────────────────────
  const renderTrackBuffer = useCallback((ctx: AudioContext, track: Track, totalSamples: number) => {
    // Ignore the track-level mute here — that is handled live by the gain node;
    // per-recording mute is honoured by mixDown.
    const data = mixDown([{ ...track, muted: false }], totalSamples);
    const buffer = ctx.createBuffer(1, Math.max(1, totalSamples), ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    return buffer;
  }, []);

  const renderClickBuffer = useCallback(
    (ctx: AudioContext, totalSamples: number) => {
      const { bpm, beatsPerBar } = liveRef.current;
      const sr = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.max(1, totalSamples), sr);
      const data = buffer.getChannelData(0);
      const secPerBeat = 60 / bpm;
      const clickSamples = Math.floor(CLICK_LEN_S * sr);
      let beat = 0;
      for (let t = 0; t * secPerBeat < totalSec; t++) {
        const at = Math.floor(t * secPerBeat * sr);
        const accent = beat % beatsPerBar === 0;
        const freq = accent ? ACCENT_FREQ : BEAT_FREQ;
        const amp = accent ? 0.9 : 0.55;
        for (let i = 0; i < clickSamples && at + i < totalSamples; i++) {
          const env = Math.exp(-(i / sr) * 60); // fast decay
          data[at + i] += Math.sin((2 * Math.PI * freq * i) / sr) * amp * env;
        }
        beat = (beat + 1) % beatsPerBar;
      }
      return buffer;
    },
    [totalSec],
  );

  const isAudible = useCallback((track: Track, soloId: string | null) => {
    return soloId ? track.id === soloId : !track.muted;
  }, []);

  // ── Transport ──────────────────────────────────────────────────────────────
  const stopSources = useCallback(() => {
    trackNodesRef.current.forEach(({ src }) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    });
    trackNodesRef.current.clear();
    if (clickNodesRef.current) {
      try {
        clickNodesRef.current.src.stop();
      } catch {
        // already stopped
      }
      clickNodesRef.current = null;
    }
  }, []);

  const cycleRegionSec = useCallback(() => {
    const { cycle, totalSec, bpm, beatsPerBar } = liveRef.current;
    if (!cycle.enabled) return { start: 0, end: totalSec };
    const barSec = (60 / bpm) * beatsPerBar;
    return { start: cycle.startBar * barSec, end: cycle.endBar * barSec };
  }, []);

  const stop = useCallback(() => {
    if (recordStopTimerRef.current !== null) {
      clearTimeout(recordStopTimerRef.current);
      recordStopTimerRef.current = null;
    }
    recordingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopSources();
    setIsPlaying(false);
    setIsRecording(false);
  }, [stopSources]);

  const startPlayback = useCallback(
    (fromSec: number, loop: boolean) => {
      const ctx = ensureContext();
      const sr = ctx.sampleRate;
      const totalSec = liveRef.current.totalSec;
      const totalSamples = secondsToSamples(totalSec, sr);
      const region = cycleRegionSec();
      const when = ctx.currentTime + START_LEAD_S;
      const offset = Math.max(0, Math.min(fromSec, totalSec - 0.001));

      stopSources();

      // Loop only for plain "loop playback"; recording and through-play run
      // forward from the playhead to the end of the timeline.
      const configure = (src: AudioBufferSourceNode) => {
        if (loop) {
          src.loop = true;
          src.loopStart = region.start;
          src.loopEnd = region.end;
        }
      };

      for (const track of liveRef.current.tracks) {
        const buffer = renderTrackBuffer(ctx, track, totalSamples);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        configure(src);
        const gain = ctx.createGain();
        gain.gain.value = isAudible(track, liveRef.current.soloTrackId) ? 1 : 0;
        src.connect(gain).connect(masterRef.current!);
        src.start(when, offset);
        trackNodesRef.current.set(track.id, { src, gain });
      }

      // Baked click track, started in lockstep.
      const clickBuffer = renderClickBuffer(ctx, totalSamples);
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = clickBuffer;
      configure(clickSrc);
      const clickGain = ctx.createGain();
      clickGain.gain.value = liveRef.current.metronome ? 1 : 0;
      clickSrc.connect(clickGain).connect(masterRef.current!);
      clickSrc.start(when, offset);
      clickNodesRef.current = { src: clickSrc, gain: clickGain };

      startCtxTimeRef.current = when;
      startSampleRef.current = secondsToSamples(offset, sr);

      const tick = () => {
        const c = ctxRef.current;
        if (!c) return;
        const elapsed = Math.max(0, c.currentTime - startCtxTimeRef.current);
        let pos = offset + elapsed;
        if (loop) {
          const len = region.end - region.start;
          if (len > 0 && pos > region.end) pos = region.start + ((pos - region.start) % len);
        } else if (pos >= totalSec) {
          // Reached the end of a forward pass — stop and pin the playhead.
          playheadRef.current = totalSec;
          setPlayheadSec(totalSec);
          stop();
          return;
        }
        playheadRef.current = pos;
        setPlayheadSec(pos);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setIsPlaying(true);
    },
    [
      ensureContext,
      cycleRegionSec,
      stop,
      stopSources,
      renderTrackBuffer,
      renderClickBuffer,
      isAudible,
    ],
  );

  const setPlayhead = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(sec, liveRef.current.totalSec));
    playheadRef.current = clamped;
    setPlayheadSec(clamped);
  }, []);

  const play = useCallback(() => {
    if (isPlaying) {
      stop();
      return;
    }
    // Loop only when the optional loop-playback toggle is on; otherwise play
    // forward from the playhead to the end.
    startPlayback(playheadRef.current, liveRef.current.cycle.enabled);
  }, [isPlaying, stop, startPlayback]);

  // ── Mic ──────────────────────────────────────────────────────────────────
  const startMic = useCallback(
    async (deviceId?: string) => {
      const ctx = ensureContext();
      setMicStatus('starting');
      setMicError(null);
      try {
        // Tear down any previous stream (device switch / restart).
        processorRef.current?.disconnect();
        analyserRef.current?.disconnect();
        sourceRef.current?.disconnect();
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
        });
        streamRef.current = stream;
        await refreshDevices();
        const resolved = stream.getAudioTracks()[0]?.getSettings()?.deviceId ?? deviceId ?? null;
        setActiveDeviceId(resolved);

        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;
        const processor = ctx.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          if (!recordingRef.current) return;
          captureRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        // A ScriptProcessor only fires while connected to the destination; route
        // it through a silent gain so we capture without monitoring the dry mic.
        const mute = ctx.createGain();
        mute.gain.value = 0;
        source.connect(processor);
        processor.connect(mute).connect(ctx.destination);

        // Analyser tap for the live input oscilloscope ("Ausschlag"). It needs no
        // path to the destination to produce data.
        const analyser = ctx.createAnalyser();
        analyser.fftSize = waveBufRef.current.length;
        source.connect(analyser);
        analyserRef.current = analyser;

        setMicStatus('listening');
      } catch (err) {
        setMicStatus('error');
        setMicError(err instanceof Error ? err.message : 'Mikrofon nicht verfügbar');
      }
    },
    [ensureContext, refreshDevices, setActiveDeviceId],
  );

  const finalizeRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    if (recordStopTimerRef.current !== null) {
      clearTimeout(recordStopTimerRef.current);
      recordStopTimerRef.current = null;
    }
    const chunks = captureRef.current;
    captureRef.current = [];
    const length = chunks.reduce((n, c) => n + c.length, 0);
    const take = new Float32Array(length);
    let o = 0;
    for (const c of chunks) {
      take.set(c, o);
      o += c.length;
    }
    const armed = recordTargetRef.current;
    recordTargetRef.current = null;
    setIsRecording(false);
    if (!armed || length === 0) {
      stop();
      return;
    }
    const rec: LoopRecording = {
      id: nextId('rec'),
      buffer: take,
      startSample: recordStartSampleRef.current,
      shiftSamples: 0,
      muted: false,
    };
    setTracks((prev) =>
      prev.map((t) => (t.id === armed ? { ...t, recordings: [...t.recordings, rec] } : t)),
    );
    stop();
  }, [stop]);

  const record = useCallback(
    async (trackId?: string) => {
      if (isRecording) {
        finalizeRecording();
        return;
      }
      const target = trackId ?? armedTrackId;
      if (!target) return;
      // Arm the target so the UI reflects it, and pin it for finalize without
      // waiting on the state flush.
      recordTargetRef.current = target;
      setArmedTrackId(target);
      if (micStatus !== 'listening') {
        await startMic(activeDeviceId ?? undefined);
      }
      const ctx = ensureContext();
      const sr = ctx.sampleRate;
      // Logic-style: the take starts exactly at the playhead and runs until the
      // user stops (no loop snap, no auto-stop).
      const recordStartSec = playheadRef.current;
      recordStartSampleRef.current = secondsToSamples(recordStartSec, sr);
      captureRef.current = [];
      recordingRef.current = true;
      setIsRecording(true);

      // Hear click + existing tracks while overdubbing; play forward from here.
      startPlayback(recordStartSec, false);
    },
    [
      armedTrackId,
      isRecording,
      micStatus,
      activeDeviceId,
      startMic,
      ensureContext,
      startPlayback,
      finalizeRecording,
    ],
  );

  // ── Track / recording mutations ────────────────────────────────────────────
  const addTrack = useCallback((name?: string) => {
    // The id is generated here (once per call) — never inside the setTracks
    // updater, which React re-runs (twice under StrictMode) and would otherwise
    // mint a different id each time, leaving armedTrackId pointing at a ghost
    // track so finished recordings never attach.
    const id = nextId('track');
    setTracks((prev) => [
      ...prev,
      { id, name: name ?? `Spur ${prev.length + 1}`, recordings: [], muted: false },
    ]);
    setArmedTrackId((cur) => cur ?? id);
  }, []);

  const removeTrack = useCallback((id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    setArmedTrackId((cur) => (cur === id ? null : cur));
    setSoloTrackId((cur) => (cur === id ? null : cur));
  }, []);

  const renameTrack = useCallback((id: string, name: string) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
  }, []);

  const arm = useCallback((id: string | null) => setArmedTrackId(id), []);

  // Fill the shared scratch buffer with the latest mic time-domain frame for the
  // live oscilloscope, and return its peak amplitude (0 when no mic is active).
  const readInputWave = useCallback((): { wave: Float32Array; peak: number } | null => {
    const analyser = analyserRef.current;
    if (!analyser) return null;
    const wave = waveBufRef.current;
    analyser.getFloatTimeDomainData(wave);
    let peak = 0;
    for (let i = 0; i < wave.length; i++) {
      const a = Math.abs(wave[i]);
      if (a > peak) peak = a;
    }
    return { wave, peak };
  }, []);

  // Live gain updates so mute/solo take effect during playback and recording.
  const applyGains = useCallback(() => {
    const { soloTrackId } = liveRef.current;
    trackNodesRef.current.forEach(({ gain }, trackId) => {
      const track = liveRef.current.tracks.find((t) => t.id === trackId);
      const audible = track ? (soloTrackId ? track.id === soloTrackId : !track.muted) : false;
      gain.gain.value = audible ? 1 : 0;
    });
  }, []);

  const toggleMute = useCallback(
    (id: string) => {
      setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t)));
      // liveRef updates on next render; apply after the state flush.
      requestAnimationFrame(applyGains);
    },
    [applyGains],
  );

  const toggleSolo = useCallback(
    (id: string) => {
      setSoloTrackId((cur) => (cur === id ? null : id));
      requestAnimationFrame(applyGains);
    },
    [applyGains],
  );

  const setRecordingShift = useCallback((trackId: string, recId: string, shiftMs: number) => {
    const sr = ctxRef.current?.sampleRate ?? 44100;
    const shiftSamples = Math.round((shiftMs / 1000) * sr);
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? {
              ...t,
              recordings: t.recordings.map((r) => (r.id === recId ? { ...r, shiftSamples } : r)),
            }
          : t,
      ),
    );
  }, []);

  const toggleRecordingMute = useCallback((trackId: string, recId: string) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? {
              ...t,
              recordings: t.recordings.map((r) => (r.id === recId ? { ...r, muted: !r.muted } : r)),
            }
          : t,
      ),
    );
  }, []);

  const removeRecording = useCallback((trackId: string, recId: string) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId ? { ...t, recordings: t.recordings.filter((r) => r.id !== recId) } : t,
      ),
    );
  }, []);

  // ── Project settings ───────────────────────────────────────────────────────
  const setBpm = useCallback(
    (v: number) => setBpmState(Math.max(40, Math.min(240, Math.round(v)))),
    [],
  );
  const setBeatsPerBar = useCallback(
    (n: number) => setBeatsPerBarState(Math.max(1, Math.round(n))),
    [],
  );
  const setLoopBars = useCallback((n: number) => {
    const bars = Math.max(1, Math.round(n));
    setLoopBarsState(bars);
    setCycleState((c) => ({ ...c, startBar: 0, endBar: bars }));
  }, []);
  const setTargetSec = useCallback((sec: number) => setTargetSecState(Math.max(1, sec)), []);
  const setCycle = useCallback(
    (next: Partial<RecorderProject['cycle']>) => setCycleState((c) => ({ ...c, ...next })),
    [],
  );

  // Keep the click gain in sync with the metronome toggle while playing.
  useEffect(() => {
    if (clickNodesRef.current) clickNodesRef.current.gain.gain.value = metronome ? 1 : 0;
  }, [metronome]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const totalSamplesNow = useCallback(() => {
    const sr = ctxRef.current?.sampleRate ?? 44100;
    return secondsToSamples(totalSec, sr);
  }, [totalSec]);

  const sampleRateNow = useCallback(() => ctxRef.current?.sampleRate ?? 44100, []);

  const exportMix = useCallback(() => {
    const mix = mixDown(tracks, totalSamplesNow(), { soloId: null });
    downloadBlob(encodeWav(mix, sampleRateNow()), 'mix.wav');
  }, [tracks, totalSamplesNow, sampleRateNow]);

  const exportTrack = useCallback(
    (id: string) => {
      const track = tracks.find((t) => t.id === id);
      if (!track) return;
      const buf = mixDown([{ ...track, muted: false }], totalSamplesNow());
      downloadBlob(encodeWav(buf, sampleRateNow()), `${track.name}.wav`);
    },
    [tracks, totalSamplesNow, sampleRateNow],
  );

  const exportRecording = useCallback(
    (trackId: string, recId: string) => {
      const track = tracks.find((t) => t.id === trackId);
      const rec = track?.recordings.find((r) => r.id === recId);
      if (!track || !rec) return;
      const idx = track.recordings.indexOf(rec) + 1;
      downloadBlob(encodeWav(rec.buffer, sampleRateNow()), `${track.name}-loop${idx}.wav`);
    },
    [tracks, sampleRateNow],
  );

  // Tear down everything on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (recordStopTimerRef.current !== null) clearTimeout(recordStopTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, []);

  return {
    project: { bpm, beatsPerBar, loopBars, totalSec, loops, cycle, metronome },
    tracks,
    armedTrackId,
    soloTrackId,
    isPlaying,
    isRecording,
    playheadSec,
    sampleRate,
    micStatus,
    micError,
    devices,
    activeDeviceId,
    startMic,
    readInputWave,
    play,
    stop,
    setPlayhead,
    record,
    addTrack,
    removeTrack,
    renameTrack,
    arm,
    toggleMute,
    toggleSolo,
    setRecordingShift,
    toggleRecordingMute,
    removeRecording,
    setBpm,
    setBeatsPerBar,
    setLoopBars,
    setTargetSec,
    setCycle,
    setMetronome,
    exportMix,
    exportTrack,
    exportRecording,
  };
}
