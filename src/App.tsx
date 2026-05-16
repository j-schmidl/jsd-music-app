import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { AutoSwitch } from './components/AutoSwitch';
import { BottomNav } from './components/BottomNav';
import { ChordGame } from './components/ChordGame';
import { CustomTuningEditor } from './components/CustomTuningEditor';
import { Headstock } from './components/Headstock';
import { MajorScales } from './components/MajorScales';
import { MicButton } from './components/MicButton';
import { MinorScales } from './components/MinorScales';
import { ThemeToggle } from './components/ThemeToggle';
import { Tuner } from './components/Tuner';
import { TuningSelector } from './components/TuningSelector';
import { UpdatePrompt } from './components/UpdatePrompt';
import { WaveBackground } from './components/WaveBackground';
import { Wordmark } from './components/Wordmark';
import { usePitchDetection } from './hooks/usePitchDetection';
import { useTheme } from './hooks/useTheme';
import {
  CUSTOM_TUNING_ID,
  TUNINGS,
  loadCustomTuning,
  nearestNote,
  nearestString,
  saveCustomTuning,
  type GuitarString,
  type Tuning,
} from './lib/tuning';

export default function App() {
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  // 'guitar' = string-based tuner with a headstock; 'chromatic' = free
  // 12-tone detection with no preselected string and no guitar graphic.
  const [tunerMode, setTunerMode] = useState<'guitar' | 'chromatic'>('guitar');
  const [tuning, setTuning] = useState<Tuning>(TUNINGS[0]);
  // The user's own tuning, restored from localStorage. Kept separate from
  // `tuning` so it survives even while a preset is selected.
  const [customTuning, setCustomTuning] = useState<Tuning>(() => loadCustomTuning());
  const [pinned, setPinned] = useState<GuitarString | null>(null);
  const [activeTab, setActiveTab] = useState('stimmen');
  const [lernenScreen, setLernenScreen] = useState<LernenScreen>('menu');
  const pitch = usePitchDetection();
  const demoFrequency = useDemoFrequency();

  const effectiveFrequency = demoFrequency ?? pitch.frequency;
  const isChromatic = tunerMode === 'chromatic';

  const detected = useMemo<GuitarString | null>(() => {
    if (effectiveFrequency === null) return null;
    return isChromatic
      ? nearestNote(effectiveFrequency)
      : nearestString(effectiveFrequency, tuning.strings);
  }, [effectiveFrequency, tuning, isChromatic]);

  // Chromatic mode always tracks whatever is detected — there is no manual
  // string to pin.
  const target = isChromatic ? detected : mode === 'auto' ? detected : pinned;

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

  // Persist an edited custom tuning and keep it active so the tuner updates
  // immediately as the user changes a string.
  const handleCustomTuningChange = (next: Tuning) => {
    setCustomTuning(next);
    saveCustomTuning(next);
    setTuning(next);
    setPinned(null); // the pinned string may no longer exist in the new tuning
  };

  const isCustomTuning = tuning.id === CUSTOM_TUNING_ID;

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
              {/* Auto/manual only applies to the guitar tuner — chromatic
                  mode always auto-detects. */}
              {!isChromatic && <AutoSwitch mode={mode} onChange={setMode} />}
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
          <div className="app__tuner-mode" role="tablist" aria-label="Tuner-Modus">
            <button
              type="button"
              role="tab"
              aria-selected={!isChromatic}
              data-testid="tuner-mode-guitar"
              className={`app__tuner-mode-btn${!isChromatic ? ' app__tuner-mode-btn--active' : ''}`}
              onClick={() => setTunerMode('guitar')}
            >
              Gitarre
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isChromatic}
              data-testid="tuner-mode-chromatic"
              className={`app__tuner-mode-btn${isChromatic ? ' app__tuner-mode-btn--active' : ''}`}
              onClick={() => setTunerMode('chromatic')}
            >
              Chromatisch
            </button>
          </div>
          {!isChromatic && (
            <TuningSelector active={tuning} onChange={setTuning} custom={customTuning} />
          )}
        </div>
      )}

      {isTuner && !isChromatic && isCustomTuning && (
        <CustomTuningEditor tuning={customTuning} onChange={handleCustomTuningChange} />
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
              prompt={
                isChromatic
                  ? 'Spiele einen Ton — er wird erkannt'
                  : 'Spiele eine Saite — sie wird automatisch erkannt'
              }
            />
            {!isChromatic && (
              <Headstock
                tuning={tuning}
                mode={mode}
                target={target}
                detected={detected}
                onSelect={handleSelectString}
              />
            )}
          </>
        )}
        {isLernen && lernenScreen === 'menu' && (
          <LernenMenu onOpen={setLernenScreen} />
        )}
        {isLernen && lernenScreen !== 'menu' && (
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
            {lernenScreen === 'major-scales' && <MajorScales />}
            {lernenScreen === 'minor-scales' && <MinorScales />}
            {lernenScreen === 'chord-game' && <ChordGame />}
          </>
        )}
      </main>

      <BottomNav active={activeTab} onChange={handleTabChange} />
      <UpdatePrompt />
    </div>
  );
}

// Every learning game reachable from the Lernen menu. Add a tile here and a
// render branch in <main> to wire up a new game — no other plumbing needed.
type LernenScreen = 'menu' | 'major-scales' | 'minor-scales' | 'chord-game';

const LERNEN_GAMES: { id: Exclude<LernenScreen, 'menu'>; title: string; sub: string }[] = [
  { id: 'major-scales', title: 'Dur-Tonleitern', sub: 'Major Scales üben' },
  { id: 'minor-scales', title: 'Moll-Tonleitern', sub: 'Minor Scales üben' },
  { id: 'chord-game', title: 'Akkorde erkennen', sub: 'Akkorde benennen & bauen' },
];

function LernenMenu({ onOpen }: { onOpen: (screen: LernenScreen) => void }) {
  return (
    <section className="lernen-menu" data-testid="lernen-menu">
      <h2 className="lernen-menu__title">Lernen</h2>
      <p className="lernen-menu__sub">Wähle ein Spiel.</p>
      <ul className="lernen-menu__list">
        {LERNEN_GAMES.map((game) => (
          <li key={game.id}>
            <button
              type="button"
              className="lernen-menu__tile"
              data-testid={`lernen-tile-${game.id}`}
              onClick={() => onOpen(game.id)}
            >
              <span className="lernen-menu__tile-title">{game.title}</span>
              <span className="lernen-menu__tile-sub">{game.sub}</span>
            </button>
          </li>
        ))}
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
