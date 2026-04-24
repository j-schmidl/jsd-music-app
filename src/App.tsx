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

  const detected = useMemo<GuitarString | null>(
    () => (pitch.frequency !== null ? nearestString(pitch.frequency) : null),
    [pitch.frequency],
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
          frequency={pitch.frequency}
          target={target}
          listening={pitch.status === 'listening'}
          error={pitch.error}
          onStart={pitch.start}
        />
        <Headstock mode={mode} target={target} detected={detected} onSelect={handleSelectString} />
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
