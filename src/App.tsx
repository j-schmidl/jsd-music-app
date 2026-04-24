import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { AutoSwitch } from './components/AutoSwitch';
import { BottomNav } from './components/BottomNav';
import { Headstock } from './components/Headstock';
import { MicButton } from './components/MicButton';
import { ThemeToggle } from './components/ThemeToggle';
import { Tuner } from './components/Tuner';
import { TunerRoll } from './components/TunerRoll';
import { WaveBackground } from './components/WaveBackground';
import { Wordmark } from './components/Wordmark';
import { centsOff, isInTune } from './lib/tuning';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useTheme } from './hooks/useTheme';
import { STRINGS, nearestString, type GuitarString } from './lib/tuning';

const MAX_DISPLAY_CENTS = 50;

export default function App() {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [pinned, setPinned] = useState<GuitarString | null>(null);
  const [activeTab, setActiveTab] = useState('stimmen');
  const pitch = usePitchDetection();
  const demoFrequency = useDemoFrequency();

  const effectiveFrequency = demoFrequency ?? pitch.frequency;

  const detected = useMemo<GuitarString | null>(
    () => (effectiveFrequency !== null ? nearestString(effectiveFrequency) : null),
    [effectiveFrequency],
  );

  const target = mode === 'auto' ? detected : pinned;

  // Compute the normalized seismograph value from the current frequency vs
  // the active target, so the full-page roll shares the same state as the
  // needle. Value is in [-1, 1]; null when there is no signal yet.
  const rollValue =
    effectiveFrequency !== null && target !== null
      ? Math.max(-1, Math.min(1, centsOff(effectiveFrequency, target.freq) / MAX_DISPLAY_CENTS))
      : null;
  const rollInTune =
    effectiveFrequency !== null && target !== null && isInTune(centsOff(effectiveFrequency, target.freq));

  useEffect(() => {
    // When flipping auto → manual, seed pinned from the last detection so the UI stays anchored.
    if (mode === 'manual' && !pinned) {
      setPinned(detected ?? STRINGS[0]);
    }
    if (mode === 'auto' && pinned) {
      setPinned(null);
    }
  }, [mode, pinned, detected]);

  // Auto-start the microphone once on mount so the user does not have to tap
  // a "start" button first. If the browser blocks (permission denied, no mic),
  // the MicButton in the header stays available for the user to retry.
  const autoStartRef = useRef(false);
  useEffect(() => {
    if (autoStartRef.current) return;
    autoStartRef.current = true;
    void pitch.start();
    // We also refresh the device list so the picker is populated even if the
    // user never grants permission (labels will be empty placeholders).
    void pitch.refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectString = (s: GuitarString) => {
    if (mode === 'manual') setPinned(s);
  };

  return (
    <div className="app" data-theme-current={theme}>
      <WaveBackground />
      <div className="app__seismograph" aria-hidden="true">
        <TunerRoll value={rollValue} inTune={rollInTune} />
      </div>

      <header className="app__header">
        <ThemeToggle theme={theme} onToggle={toggle} />
        <div className="app__wordmark-slot">
          <Wordmark />
        </div>
        <div className="app__header-actions">
          <AutoSwitch mode={mode} onChange={setMode} />
          <MicButton
            status={pitch.status}
            devices={pitch.devices}
            activeDeviceId={pitch.activeDeviceId}
            onRetrigger={() => void pitch.start(pitch.activeDeviceId ?? undefined)}
            onSelect={(id) => void pitch.start(id)}
          />
        </div>
      </header>

      <div className="app__subtitle">
        <span className="app__subtitle-main">
          Gitarre 6-saitig <span className="app__subtitle-chevron">›</span>
        </span>
        <span className="app__subtitle-secondary">Standard</span>
      </div>

      <main className="app__main">
        <Tuner
          frequency={effectiveFrequency}
          target={target}
          listening={pitch.status === 'listening' || demoFrequency !== null}
          error={pitch.error}
          onStart={() => void pitch.start()}
        />
        <Headstock mode={mode} target={target} detected={detected} onSelect={handleSelectString} />
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

/**
 * Returns a sine-wave frequency when the URL contains `?demo` — used for
 * visual QA of the tuning display without needing microphone input. Returns
 * null otherwise. The base note is A2 (110 Hz) and the sine ramps ±30 cents.
 */
function useDemoFrequency(): number | null {
  const [freq, setFreq] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('demo')) return;

    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const cents = Math.sin(t * 1.6) * 30;
      setFreq(110 * Math.pow(2, cents / 1200));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return freq;
}
