import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { AutoSwitch } from './components/AutoSwitch';
import { BottomNav } from './components/BottomNav';
import { Headstock } from './components/Headstock';
import { ThemeToggle } from './components/ThemeToggle';
import { Tuner } from './components/Tuner';
import { WaveBackground } from './components/WaveBackground';
import { Wordmark } from './components/Wordmark';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useTheme } from './hooks/useTheme';
import { STRINGS, nearestString, type GuitarString } from './lib/tuning';

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

  useEffect(() => {
    // When flipping auto → manual, seed pinned from the last detection so the UI stays anchored.
    if (mode === 'manual' && !pinned) {
      setPinned(detected ?? STRINGS[0]);
    }
    if (mode === 'auto' && pinned) {
      setPinned(null);
    }
  }, [mode, pinned, detected]);

  const handleSelectString = (s: GuitarString) => {
    if (mode === 'manual') setPinned(s);
  };

  return (
    <div className="app" data-theme-current={theme}>
      <WaveBackground />

      <header className="app__header">
        <ThemeToggle theme={theme} onToggle={toggle} />
        <div className="app__wordmark-slot">
          <Wordmark />
        </div>
        <AutoSwitch mode={mode} onChange={setMode} />
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
          onStart={pitch.start}
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
