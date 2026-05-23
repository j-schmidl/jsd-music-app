// Offline pitch-detection diagnostic. Decodes a mono 16-bit WAV and runs the
// same pitchy detector the live tuner uses, sweeping window sizes so we can see
// how the outlier rate on a low note (E2 ~82.41 Hz) depends on window length.
//
//   node scripts/pitch-diag.mjs ~/Downloads/e2-48000hz.wav [expectedHz]
//
// Replicates the live loop's gating (clarity > 0.9, MIN_FREQ..MAX_FREQ) so the
// numbers reflect what the tuner would actually display.
import { readFileSync } from 'node:fs';
import { PitchDetector } from 'pitchy';

const CLARITY_THRESHOLD = 0.9;
const MIN_FREQ = 16;
const MAX_FREQ = 1200;
const WINDOWS = [2048, 4096, 8192, 16384];

const path = process.argv[2];
const expected = Number(process.argv[3] ?? 82.41); // E2
if (!path) {
  console.error('usage: node scripts/pitch-diag.mjs <file.wav> [expectedHz]');
  process.exit(1);
}

function readWavMono(file) {
  const buf = readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} is not a RIFF/WAVE file`);
  }
  let sampleRate = 0;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') sampleRate = buf.readUInt32LE(body + 4);
    else if (id === 'data') {
      const count = Math.floor(size / 2);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = buf.readInt16LE(body + i * 2) / 32768;
      return { samples, sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new Error(`${file} has no data chunk`);
}

const cents = (f, ref) => 1200 * Math.log2(f / ref);
const noteName = (f) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
};

const { samples, sampleRate } = readWavMono(path);
console.log(`\nfile: ${path}`);
console.log(`sampleRate: ${sampleRate} Hz · ${(samples.length / sampleRate).toFixed(2)}s · expected ${expected} Hz (${noteName(expected)})\n`);

for (const win of WINDOWS) {
  if (win > samples.length) continue;
  const detector = PitchDetector.forFloat32Array(win);
  const buf = new Float32Array(win);
  const hop = Math.floor(win / 4); // 75% overlap, ~the live frame cadence
  const accepted = [];
  const noteHist = new Map();
  let frames = 0;
  for (let start = 0; start + win <= samples.length; start += hop) {
    frames++;
    buf.set(samples.subarray(start, start + win));
    const [freq, clar] = detector.findPitch(buf, sampleRate);
    if (clar > CLARITY_THRESHOLD && freq >= MIN_FREQ && freq <= MAX_FREQ) {
      accepted.push(freq);
      const n = noteName(freq);
      noteHist.set(n, (noteHist.get(n) ?? 0) + 1);
    }
  }
  accepted.sort((a, b) => a - b);
  const median = accepted.length ? accepted[Math.floor(accepted.length / 2)] : NaN;
  const onPitch = accepted.filter((f) => Math.abs(cents(f, expected)) <= 50).length;
  const winMs = ((win / sampleRate) * 1000).toFixed(0);
  const periods = (win / (sampleRate / expected)).toFixed(1);
  const hist = [...noteHist.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `${n}:${c}`)
    .join('  ');
  console.log(`window ${String(win).padStart(5)} (${winMs}ms, ${periods} periods of E2)`);
  console.log(`  accepted ${accepted.length}/${frames} frames · median ${median.toFixed(1)} Hz (${noteName(median)})`);
  console.log(`  on-pitch (±50¢ of E2): ${((100 * onPitch) / accepted.length).toFixed(1)}%  → outliers ${((100 * (accepted.length - onPitch)) / accepted.length).toFixed(1)}%`);
  console.log(`  notes: ${hist}\n`);
}
