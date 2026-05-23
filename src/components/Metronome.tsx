import { useCallback, useMemo, useState } from 'react';
import './Metronome.css';
import { MAX_BPM, MIN_BPM, bpmFromTaps } from '../lib/bpm';
import { useBpmDetector } from '../hooks/useBpmDetector';
import { useMetronome } from '../hooks/useMetronome';

const BEATS_OPTIONS = [2, 3, 4, 6];

// Italian tempo markings, for a little musical context under the number.
function tempoTerm(bpm: number): string {
  if (bpm < 60) return 'Largo';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 156) return 'Allegro';
  if (bpm < 176) return 'Vivace';
  return 'Presto';
}

type FinderMode = 'tap' | 'mic';

export function Metronome() {
  const metro = useMetronome(120);
  const detector = useBpmDetector();
  const [finder, setFinder] = useState<FinderMode>('tap');

  // Tap-tempo timestamps for the current run.
  const [taps, setTaps] = useState<number[]>([]);
  const tapBpm = useMemo(() => bpmFromTaps(taps), [taps]);

  const { setBpm } = metro; // stable (memoised) — safe as an effect/callback dep

  const handleTap = useCallback(() => {
    const now = performance.now();
    setTaps((prev) => {
      // Drop the old run if the user paused for a couple of seconds.
      const base = prev.length && now - prev[prev.length - 1] > 2000 ? [] : prev;
      const next = [...base, now].slice(-12);
      const bpm = bpmFromTaps(next);
      if (bpm) setBpm(bpm); // apply live as they tap
      return next;
    });
  }, [setBpm]);

  const resetTaps = useCallback(() => setTaps([]), []);

  const switchFinder = useCallback(
    (mode: FinderMode) => {
      if (mode !== 'mic') detector.stop();
      if (mode !== 'tap') setTaps([]);
      setFinder(mode);
    },
    [detector],
  );

  const beats = Array.from({ length: metro.beatsPerMeasure }, (_, i) => i);

  return (
    <section className="metronome" data-testid="metronome">
      {/* ── Tempo readout ─────────────────────────────────────────── */}
      <div className="metronome__readout">
        <div className="metronome__bpm" data-testid="metronome-bpm">
          {metro.bpm}
        </div>
        <div className="metronome__unit">BPM · {tempoTerm(metro.bpm)}</div>
      </div>

      {/* ── Beat indicator ────────────────────────────────────────── */}
      <div className="metronome__beats" aria-hidden="true">
        {beats.map((i) => (
          <span
            key={i}
            className={
              'metronome__beat' +
              (i === 0 ? ' metronome__beat--accent' : '') +
              (metro.isPlaying && i === metro.currentBeat ? ' metronome__beat--on' : '')
            }
          />
        ))}
      </div>

      {/* ── Tempo controls ────────────────────────────────────────── */}
      <div className="metronome__controls">
        <button
          type="button"
          className="metronome__step"
          data-testid="metronome-minus"
          aria-label="Langsamer"
          onClick={() => metro.adjustBpm(-1)}
        >
          −
        </button>
        <input
          type="range"
          className="metronome__slider"
          data-testid="metronome-slider"
          min={MIN_BPM}
          max={MAX_BPM}
          value={metro.bpm}
          aria-label="Tempo"
          onChange={(e) => metro.setBpm(Number(e.target.value))}
        />
        <button
          type="button"
          className="metronome__step"
          data-testid="metronome-plus"
          aria-label="Schneller"
          onClick={() => metro.adjustBpm(1)}
        >
          +
        </button>
      </div>

      <button
        type="button"
        className={'metronome__play' + (metro.isPlaying ? ' metronome__play--on' : '')}
        data-testid="metronome-play"
        aria-pressed={metro.isPlaying}
        onClick={metro.toggle}
      >
        {metro.isPlaying ? 'Stopp' : 'Start'}
      </button>

      {/* ── Time signature ────────────────────────────────────────── */}
      <div className="metronome__meter" role="group" aria-label="Taktart">
        {BEATS_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            className={
              'metronome__meter-btn' +
              (metro.beatsPerMeasure === n ? ' metronome__meter-btn--active' : '')
            }
            data-testid={`metronome-meter-${n}`}
            aria-pressed={metro.beatsPerMeasure === n}
            onClick={() => metro.setBeatsPerMeasure(n)}
          >
            {n}/4
          </button>
        ))}
      </div>

      {/* ── BPM finder ────────────────────────────────────────────── */}
      <div className="metronome__finder">
        <h3 className="metronome__finder-title">BPM finden</h3>
        <div className="metronome__finder-tabs" role="tablist" aria-label="BPM-Finder-Modus">
          <button
            type="button"
            role="tab"
            aria-selected={finder === 'tap'}
            data-testid="finder-tap"
            className={
              'metronome__finder-tab' + (finder === 'tap' ? ' metronome__finder-tab--active' : '')
            }
            onClick={() => switchFinder('tap')}
          >
            Tippen
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={finder === 'mic'}
            data-testid="finder-mic"
            className={
              'metronome__finder-tab' + (finder === 'mic' ? ' metronome__finder-tab--active' : '')
            }
            onClick={() => switchFinder('mic')}
          >
            Mikrofon
          </button>
        </div>

        {finder === 'tap' ? (
          <div className="metronome__tap-panel">
            <button
              type="button"
              className="metronome__tap"
              data-testid="finder-tap-button"
              onClick={handleTap}
            >
              <span className="metronome__tap-value">{tapBpm ? Math.round(tapBpm) : '– –'}</span>
              <span className="metronome__tap-hint">
                {taps.length < 2 ? 'Tippe im Takt' : `${taps.length} Schläge`}
              </span>
            </button>
            <button
              type="button"
              className="metronome__finder-reset"
              data-testid="finder-tap-reset"
              onClick={resetTaps}
            >
              Zurücksetzen
            </button>
          </div>
        ) : (
          <div className="metronome__mic-panel">
            <button
              type="button"
              className={
                'metronome__mic' +
                (detector.status === 'listening' ? ' metronome__mic--on' : '')
              }
              data-testid="finder-mic-button"
              onClick={() => (detector.status === 'listening' ? detector.stop() : void detector.start())}
            >
              {detector.status === 'listening' ? 'Stoppen' : 'Zuhören'}
            </button>

            <div className="metronome__mic-result" data-testid="finder-mic-result">
              {detector.status === 'error' && (
                <span className="metronome__mic-error">Kein Mikrofon: {detector.error}</span>
              )}
              {detector.status === 'listening' && detector.bpm === null && (
                <span className="metronome__mic-hint">Höre zu … spiele Musik vor</span>
              )}
              {detector.bpm !== null && (
                <>
                  <span className="metronome__mic-bpm">{detector.bpm} BPM</span>
                  <span className="metronome__mic-conf" aria-hidden="true">
                    <span
                      className="metronome__mic-conf-bar"
                      style={{ width: `${Math.round(detector.confidence * 100)}%` }}
                    />
                  </span>
                </>
              )}
            </div>

            {detector.bpm !== null && (
              <button
                type="button"
                className="metronome__finder-apply"
                data-testid="finder-mic-apply"
                onClick={() => metro.setBpm(detector.bpm!)}
              >
                Übernehmen
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
