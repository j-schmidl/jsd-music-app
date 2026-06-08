import type { RecorderProject } from '../hooks/useMultitrackRecorder';
import type { Track } from '../lib/recording';
import { Clip } from './Clip';
import './Timeline.css';

type Props = {
  tracks: Track[];
  project: RecorderProject;
  sampleRate: number;
  playheadSec: number;
  armedTrackId: string | null;
  soloTrackId: string | null;
  isRecording: boolean;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onRecordTrack: (id: string) => void;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRemoveTrack: (id: string) => void;
  onSetPlayhead: (sec: number) => void;
  onClipShift: (trackId: string, recId: string, shiftMs: number) => void;
  onClipMute: (trackId: string, recId: string) => void;
  onClipRemove: (trackId: string, recId: string) => void;
  onClipExport: (trackId: string, recId: string) => void;
};

const PX_PER_BAR = 16;

// The horizontal, Logic-style arrangement: a fixed left column of track headers
// (name + M/S/R) beside a horizontally-scrollable timeline with a bar ruler,
// per-track lanes of draggable clips, and a playhead spanning them all.
export function Timeline(props: Props) {
  const { tracks, project, playheadSec, sampleRate } = props;
  const barSec = (60 / project.bpm) * project.beatsPerBar;
  const totalBars = Math.max(1, Math.round(project.totalSec / barSec));
  const contentWidth = totalBars * PX_PER_BAR;
  const playheadPct = project.totalSec > 0 ? (playheadSec / project.totalSec) * 100 : 0;

  // One label per loop boundary along the ruler.
  const loopMarks = Array.from({ length: project.loops + 1 }, (_, k) => {
    const bar = k * project.loopBars;
    return { bar, leftPct: (bar / totalBars) * 100 };
  });

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    props.onSetPlayhead((x / rect.width) * project.totalSec);
  };

  return (
    <div className="timeline" data-testid="recorder-timeline">
      {/* Fixed left header column */}
      <div className="timeline__heads">
        <div className="timeline__heads-spacer" />
        {tracks.map((track) => {
          const armed = track.id === props.armedTrackId;
          const recording = props.isRecording && armed;
          const soloed = track.id === props.soloTrackId;
          return (
            <div className="timeline__head" key={track.id} data-testid={`track-${track.id}`}>
              <input
                className="timeline__name"
                value={track.name}
                aria-label="Spurname"
                onChange={(e) => props.onRename(track.id, e.target.value)}
              />
              <div className="timeline__head-btns">
                <button
                  type="button"
                  className={`timeline__rec${recording ? ' timeline__rec--on' : ''}${
                    armed ? ' timeline__rec--armed' : ''
                  }`}
                  aria-label="Auf dieser Spur aufnehmen"
                  aria-pressed={recording}
                  data-testid={`track-rec-${track.id}`}
                  onClick={() => props.onRecordTrack(track.id)}
                >
                  ●
                </button>
                <button
                  type="button"
                  className={`timeline__tg${track.muted ? ' timeline__tg--mute' : ''}`}
                  aria-label="Stumm"
                  aria-pressed={track.muted}
                  data-testid={`track-mute-${track.id}`}
                  onClick={() => props.onToggleMute(track.id)}
                >
                  M
                </button>
                <button
                  type="button"
                  className={`timeline__tg${soloed ? ' timeline__tg--solo' : ''}`}
                  aria-label="Solo"
                  aria-pressed={soloed}
                  data-testid={`track-solo-${track.id}`}
                  onClick={() => props.onToggleSolo(track.id)}
                >
                  S
                </button>
                <button
                  type="button"
                  className="timeline__tg timeline__tg--del"
                  aria-label="Spur löschen"
                  onClick={() => props.onRemoveTrack(track.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline */}
      <div className="timeline__scroll">
        <div className="timeline__content" style={{ width: `${contentWidth}px` }}>
          <div className="timeline__ruler" onClick={handleRulerClick} data-testid="timeline-ruler">
            {loopMarks.map((m) => (
              <span key={m.bar} className="timeline__bar-label" style={{ left: `${m.leftPct}%` }}>
                {m.bar + 1}
              </span>
            ))}
          </div>

          {tracks.map((track) => (
            <div className="timeline__lane" key={track.id} data-testid={`lane-${track.id}`}>
              {track.recordings.map((rec, i) => (
                <Clip
                  key={rec.id}
                  rec={rec}
                  index={i}
                  sampleRate={sampleRate}
                  totalSec={project.totalSec}
                  selected={rec.id === props.selectedClipId}
                  onSelect={() => props.onSelectClip(rec.id)}
                  onShift={(ms) => props.onClipShift(track.id, rec.id, ms)}
                  onToggleMute={() => props.onClipMute(track.id, rec.id)}
                  onRemove={() => props.onClipRemove(track.id, rec.id)}
                  onExport={() => props.onClipExport(track.id, rec.id)}
                />
              ))}
            </div>
          ))}

          <div className="timeline__playhead" style={{ left: `${playheadPct}%` }} />
        </div>
      </div>
    </div>
  );
}
