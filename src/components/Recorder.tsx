import { useState } from 'react';
import { useMultitrackRecorder } from '../hooks/useMultitrackRecorder';
import { LiveWaveform } from './LiveWaveform';
import { MicButton } from './MicButton';
import { Timeline } from './Timeline';
import './Recorder.css';

const BEATS_OPTIONS = [2, 3, 4, 6];

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// The "Aufnahme" tab: a simple Logic-style multi-track loop recorder. Transport
// + mic picker on top, the horizontal timeline of Spuren below, and a collapsible
// Einstellungen panel for the secondary project settings.
export function Recorder() {
  const r = useMultitrackRecorder();
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const barSec = (60 / r.project.bpm) * r.project.beatsPerBar;

  return (
    <section className="recorder" data-testid="recorder">
      {/* ── Transport ───────────────────────────────────────────────── */}
      <div className="recorder__transport">
        <button
          type="button"
          className={`recorder__play${r.isPlaying ? ' recorder__play--on' : ''}`}
          data-testid="recorder-play"
          aria-pressed={r.isPlaying}
          onClick={r.play}
        >
          {r.isPlaying ? '◼' : '▶'}
        </button>
        <button
          type="button"
          className={`recorder__rec${r.isRecording ? ' recorder__rec--on' : ''}`}
          data-testid="recorder-record"
          aria-pressed={r.isRecording}
          disabled={!r.armedTrackId}
          onClick={() => void r.record()}
        >
          ●
        </button>
        <div className="recorder__time" data-testid="recorder-time">
          <span className="recorder__time-pos">{formatTime(r.playheadSec)}</span>
          <span className="recorder__time-total">/ {formatTime(r.project.totalSec)}</span>
        </div>
        <MicButton
          status={r.micStatus}
          devices={r.devices}
          activeDeviceId={r.activeDeviceId}
          onSelect={(id) => void r.startMic(id)}
          onRetrigger={() => void r.startMic(r.activeDeviceId ?? undefined)}
        />
      </div>

      {/* ── Live-Ausschlag (Eingangspegel) ──────────────────────────── */}
      <LiveWaveform active={r.isRecording || r.micStatus === 'listening'} read={r.readInputWave} />

      {/* ── Tempo ───────────────────────────────────────────────────── */}
      <div className="recorder__bpm-row">
        <button
          type="button"
          className="recorder__step"
          aria-label="Langsamer"
          onClick={() => r.setBpm(r.project.bpm - 1)}
        >
          −
        </button>
        <div className="recorder__bpm" data-testid="recorder-bpm">
          {r.project.bpm}
          <span className="recorder__bpm-unit">BPM</span>
        </div>
        <button
          type="button"
          className="recorder__step"
          aria-label="Schneller"
          onClick={() => r.setBpm(r.project.bpm + 1)}
        >
          +
        </button>
        <span className="recorder__loops" data-testid="recorder-loops">
          {r.project.loops} × {r.project.loopBars} Takte
        </span>
      </div>

      {/* ── Timeline (Logic-style horizontal arrangement) ───────────── */}
      {r.tracks.length === 0 ? (
        <p className="recorder__hint">Füge eine Spur hinzu, um aufzunehmen.</p>
      ) : (
        <Timeline
          tracks={r.tracks}
          project={r.project}
          sampleRate={r.sampleRate}
          playheadSec={r.playheadSec}
          armedTrackId={r.armedTrackId}
          soloTrackId={r.soloTrackId}
          isRecording={r.isRecording}
          selectedClipId={selectedClipId}
          onSelectClip={setSelectedClipId}
          onRecordTrack={(id) => void r.record(id)}
          onToggleMute={(id) => r.toggleMute(id)}
          onToggleSolo={(id) => r.toggleSolo(id)}
          onRename={(id, name) => r.renameTrack(id, name)}
          onRemoveTrack={(id) => r.removeTrack(id)}
          onSetPlayhead={(sec) => r.setPlayhead(sec)}
          onClipShift={(tid, rid, ms) => r.setRecordingShift(tid, rid, ms)}
          onClipMute={(tid, rid) => r.toggleRecordingMute(tid, rid)}
          onClipRemove={(tid, rid) => {
            r.removeRecording(tid, rid);
            setSelectedClipId((cur) => (cur === rid ? null : cur));
          }}
          onClipExport={(tid, rid) => r.exportRecording(tid, rid)}
        />
      )}

      <div className="recorder__actions">
        <button
          type="button"
          className="recorder__add"
          data-testid="recorder-add-track"
          onClick={() => r.addTrack()}
        >
          + Spur
        </button>
        <button
          type="button"
          className="recorder__download"
          data-testid="recorder-export-mix"
          disabled={r.tracks.length === 0}
          onClick={r.exportMix}
        >
          ↓ Mix
        </button>
      </div>

      {/* ── Einstellungen ───────────────────────────────────────────── */}
      <details className="recorder__settings" data-testid="recorder-settings">
        <summary className="recorder__settings-summary">Einstellungen</summary>

        <label className="recorder__field">
          <span>Taktart</span>
          <div className="recorder__meter" role="group" aria-label="Taktart">
            {BEATS_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`recorder__meter-btn${r.project.beatsPerBar === n ? ' recorder__meter-btn--active' : ''}`}
                aria-pressed={r.project.beatsPerBar === n}
                onClick={() => r.setBeatsPerBar(n)}
              >
                {n}/4
              </button>
            ))}
          </div>
        </label>

        <label className="recorder__field">
          <span>Loop-Länge: {r.project.loopBars} Takte</span>
          <input
            type="range"
            min={1}
            max={32}
            value={r.project.loopBars}
            data-testid="recorder-loopbars"
            onChange={(e) => r.setLoopBars(Number(e.target.value))}
          />
        </label>

        <label className="recorder__field">
          <span>Gesamtlänge: {formatTime(r.project.totalSec)}</span>
          <input
            type="range"
            min={30}
            max={600}
            step={5}
            value={r.project.totalSec}
            data-testid="recorder-total"
            onChange={(e) => r.setTargetSec(Number(e.target.value))}
          />
        </label>

        <label className="recorder__check">
          <input
            type="checkbox"
            checked={r.project.cycle.enabled}
            data-testid="recorder-cycle"
            onChange={(e) => r.setCycle({ enabled: e.target.checked })}
          />
          <span>Loop-Wiedergabe (Bereich wiederholen)</span>
        </label>

        {r.project.cycle.enabled && (
          <label className="recorder__field">
            <span>
              Loop ab Takt {r.project.cycle.startBar + 1} (Länge {r.project.loopBars})
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(0, Math.round(r.project.totalSec / barSec) - r.project.loopBars)}
              value={r.project.cycle.startBar}
              data-testid="recorder-cycle-start"
              onChange={(e) => {
                const startBar = Number(e.target.value);
                r.setCycle({ startBar, endBar: startBar + r.project.loopBars });
              }}
            />
          </label>
        )}

        <label className="recorder__check">
          <input
            type="checkbox"
            checked={r.project.metronome}
            data-testid="recorder-metronome"
            onChange={(e) => r.setMetronome(e.target.checked)}
          />
          <span>Metronom-Klick</span>
        </label>
      </details>
    </section>
  );
}
