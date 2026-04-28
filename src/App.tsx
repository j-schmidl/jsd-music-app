import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { AutoSwitch } from './components/AutoSwitch';
import { BottomNav } from './components/BottomNav';
import { Headstock } from './components/Headstock';
import { MajorScales } from './components/MajorScales';
import { MicButton } from './components/MicButton';
import { ThemeToggle } from './components/ThemeToggle';
import { Tuner } from './components/Tuner';
import { TuningSelector } from './components/TuningSelector';
import { UpdatePrompt } from './components/UpdatePrompt';
import { WaveBackground } from './components/WaveBackground';
import { Wordmark } from './components/Wordmark';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useTheme } from './hooks/useTheme';
import { TUNINGS, nearestString, type GuitarString, type Tuning } from './lib/tuning';

export default function App() {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [tuning, setTuning] = useState<Tuning>(TUNINGS[0]);
  const [pinned, setPinned] = useState<GuitarString | null>(null);
  const [activeTab, setActiveTab] = useState('stimmen');
  const [lernenScreen, setLernenScreen] = useState<'menu' | 'major-scales'>('menu');
  const pitch = usePitchDetection();
  const demoFrequency = useDemoFrequency();

  const effectiveFrequency = demoFrequency ?? pitch.frequency;

  const detected = useMemo<GuitarString | null>(
    () => (effectiveFrequency !== null ? nearestString(effectiveFrequency, tuning.strings) : null),
    [effectiveFrequency, tuning],
  );

  const target = mode === 'auto' ? detected : pinned;

  useEffect(() => {
    // When flipping auto → manual, seed pinned from the last detection so the UI stays anchored.
    if (mode === 'manual' && !pinned) {
      setPinned(detected ?? tuning.strings[0]);
    }
    if (mode === 'auto' && pinned) {
      setPinned(null);
    }
  }, [mode, pinned, detected, tuning]);

  // Switching tunings invalidates any pinned string from the previous preset.
  useEffect(() => {
    if (pinned && !tuning.strings.some((s) => s.id === pinned.id)) {
      setPinned(null);
    }
  }, [tuning, pinned]);

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

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    if (id === 'lernen') setLernenScreen('menu');
  };

  const isTuner = activeTab === 'stimmen';
  const isLernen = activeTab === 'lernen';

  return (
    <div className="app" data-theme-current={theme}>
      <WaveBackground />

      <header className="app__header">
        <ThemeToggle theme={theme} onToggle={toggle} />
        <div className="app__wordmark-slot">
          <Wordmark />
        </div>
        <div className="app__header-actions">
          {isTuner && (
            <>
              <AutoSwitch mode={mode} onChange={setMode} />
              <MicButton
                status={pitch.status}
                devices={pitch.devices}
                activeDeviceId={pitch.activeDeviceId}
                onRetrigger={() => void pitch.start(pitch.activeDeviceId ?? undefined)}
                onSelect={(id) => void pitch.start(id)}
              />
            </>
          )}
        </div>
      </header>

      {isTuner && (
        <div className="app__subtitle">
          <span className="app__subtitle-main">Gitarre 6-saitig</span>
          <TuningSelector active={tuning} onChange={setTuning} />
        </div>
      )}

      <main className="app__main">
        {isTuner && (
          <>
            <Tuner
              frequency={effectiveFrequency}
              target={target}
              listening={pitch.status === 'listening' || demoFrequency !== null}
              error={pitch.error}
              onStart={() => void pitch.start()}
            />
            <Headstock
              tuning={tuning}
              mode={mode}
              target={target}
              detected={detected}
              onSelect={handleSelectString}
            />
          </>
        )}
        {isLernen && lernenScreen === 'menu' && (
          <LernenMenu onOpenMajorScales={() => setLernenScreen('major-scales')} />
        )}
        {isLernen && lernenScreen === 'major-scales' && (
          <>
            <button
              type="button"
              className="app__back"
              data-testid="lernen-back"
              onClick={() => setLernenScreen('menu')}
              aria-label="Zurück zum Menü"
            >
              ‹ Lernen
            </button>
            <MajorScales />
          </>
        )}
      </main>

      <BottomNav active={activeTab} onChange={handleTabChange} />
      <UpdatePrompt />
    </div>
  );
}

type LernenMenuProps = { onOpenMajorScales: () => void };
function LernenMenu({ onOpenMajorScales }: LernenMenuProps) {
  return (
    <section className="lernen-menu" data-testid="lernen-menu">
      <h2 className="lernen-menu__title">Lernen</h2>
      <p className="lernen-menu__sub">Wähle ein Spiel.</p>
      <ul className="lernen-menu__list">
        <li>
          <button
            type="button"
            className="lernen-menu__tile"
            data-testid="lernen-tile-major-scales"
            onClick={onOpenMajorScales}
          >
            <span className="lernen-menu__tile-title">Dur-Tonleitern</span>
            <span className="lernen-menu__tile-sub">Major Scales üben — 3 Modi</span>
          </button>
        </li>
      </ul>
    </section>
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
