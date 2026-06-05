# Architecture — jsd-music-app

High-level map of how the app is put together. For project intent, brand, and
conventions see [CLAUDE.md](../CLAUDE.md); this document describes **structure and
data flow**. Keep it current — whenever you change the architecture (add a
feature/tab/game, move logic between layers, change how audio is captured or
how state is owned), update this file in the same change.

## What it is

A mobile-first, **backend-free** music-learning PWA built with **Vite + React +
TypeScript**. All audio analysis and synthesis runs in the browser via the Web
Audio API and `getUserMedia`; nothing is sent to a server. It ships as an
installable PWA and deploys as a static site to Netlify.

## Layered structure

The codebase is deliberately split into three layers so the hard parts (music
theory, DSP) stay pure and testable, separate from React and from the browser's
audio APIs.

```
src/lib/      Pure logic — no React, no DOM, no Web Audio nodes.
              Framework-free, side-effect-free, unit-tested in isolation.
                ↑ imported by
src/hooks/    Stateful glue — owns AudioContext / getUserMedia / timers,
              React state, and lifecycle. Calls into lib/ for the real work.
                ↑ consumed by
src/components/  Presentation — renders UI, forwards user events. One
              component per file with a co-located .css.

src/App.tsx   Top-level shell: owns tab + mode state, wires hooks to components.
src/main.tsx  Entry point — mounts <App> in StrictMode.
```

The dependency rule is one-directional: `components → hooks → lib`. `lib/`
imports nothing from the layers above it, which is what lets the DSP and theory
code be validated directly in unit tests.

## Application shell (`src/App.tsx`)

`App` is the single stateful root. It holds:

- **Which tab is active** (`stimmen` / `metronom` / `aufnahme` / `lernen`) —
  switched by `<BottomNav>`. `stimmen` (the tuner) is the landing tab.
- **Tuner state**: auto/manual mode, guitar/chromatic mode, the selected
  `Tuning`, the user's custom tuning, and the pinned string. It runs the
  `usePitchDetection` hook and derives the target string from the detected
  frequency.
- **Lernen sub-navigation**: a small in-component menu/screen state machine
  (`LernenScreen`) that swaps between the learning games.

Each tab renders a feature subtree. The Metronom, Aufnahme and Lernen features
are self-contained — `App` just mounts `<Metronome>` / `<Recorder>` or one of the
game components and lets them own their own hooks and state.

> Adding a Lernen game: add an entry to `LERNEN_GAMES` and a render branch in
> `<main>` — no other plumbing needed (see the comment in `App.tsx`).

## Features

### Stimmen — guitar tuner (landing page)

```
mic → usePitchDetection (pitchy / McLeod) → frequency
    → App derives target via lib/tuning (nearestString | nearestNote)
    → <Tuner> needle + <Headstock> string lights
```

- **`hooks/usePitchDetection.ts`** owns the mic: `getUserMedia`, the
  `AudioContext`/analyser, device enumeration and switching, and the `pitchy`
  `PitchDetector`. It also detects a **stalled** pipeline (a silent/suspended
  capture chain) and exposes a restart path — the focus of the current branch.
- **`lib/tuning.ts`** is pure: note frequencies (A4 = 440 equal temperament),
  the tuning presets + custom-tuning persistence, and `nearestString` /
  `nearestNote` / cents math.
- Two orthogonal mode switches, both must stay: **auto vs. manual** (auto-pick
  the target string vs. pin one) and **guitar vs. chromatic** (string-based
  with a headstock vs. free 12-tone detection). See [CLAUDE.md](../CLAUDE.md) → "Tuner modes".
- Components: `<Tuner>` (needle/readout, uses `<TunerRoll>`), `<Headstock>`
  (string buttons), `<TuningSelector>`, `<CustomTuningEditor>`, `<MicButton>`
  (status + device picker), `<AutoSwitch>`.
- A `?demo` URL flag (see `useDemoFrequency` in `App.tsx`) feeds a synthetic
  swept frequency so the display can be QA'd without a mic.

### Metronom — click track + BPM finder

```
Playback:  useMetronome → Web Audio lookahead scheduler → clicks
Tap BPM:   tap timestamps → lib/bpm.bpmFromTaps
Mic BPM:   mic → useBpmDetector → lib/onset (FFT spectral-flux envelope)
                              → lib/bpm autocorrelation → tempo
```

- **`hooks/useMetronome.ts`** — sample-accurate playback using the standard Web
  Audio lookahead-scheduler pattern (a coarse timer queues clicks on the audio
  clock).
- **`lib/onset.ts`** — half-wave-rectified spectral-flux onset envelope. This
  is the **single source of truth for "how we hear beats"**: both the live mic
  detector and the offline tests call it.
- **`lib/bpm.ts`** — pure tempo logic: tap averaging, autocorrelation of the
  onset envelope, octave folding into a musical BPM range.
- **`hooks/useBpmDetector.ts`** — records a rolling audio window and runs the
  exact `estimateBpm` pipeline the tests validate.
- Component: `<Metronome>`.

### Aufnahme — multi-track loop recorder

A deliberately simple, Logic-style overdub recorder (no editing/effects/MIDI —
mic, gain, mute and shift only). Session-only/in-memory for v1; the data model is
shaped so project save/open (behind login) can be added later as serialize-only.

```
Projekt → Spuren (Track[]) → Looprecordings (LoopRecording[], "übereinander")
Playback:  per-track buffer (mixDown) → looping AudioBufferSourceNode → per-track GainNode
           + a baked click track, all sharing one start time + loop region
Record:    mic → ScriptProcessor (silent-gain routed) → captured frames
           → anchored take (loop start − overhang) appended to the armed track
Export:    mixDown / encodeWav → mix.wav, <Spur>.wav, or <Spur>-loopN.wav
```

- **`lib/recording.ts`** (pure) — the `LoopRecording`/`Track` model, bar/loop
  timing, `fitTotalLength` (snap total length to whole loops), and `mixDown`
  (sum every audible track's non-muted recordings at `startSample + shiftSamples`,
  clipping overhang). **`lib/wav.ts`** — 16-bit PCM mono `encodeWav`.
  **`lib/waveform.ts`** — `computePeaks` for the canvas.
- **`hooks/useMultitrackRecorder.ts`** — owns the `AudioContext`, the mic stream,
  transport and the whole project state. It is the **first hook that both
  captures mic and produces sound**. Each track is pre-rendered into one looping
  buffer behind a `GainNode`, so mute/solo is a live gain flip even mid-record;
  the click is a second baked, looped buffer. Recordings keep a pre/post
  **overhang** margin so a per-take **shift** (`shiftSamples`) can reach into the
  neighbouring loops — the core "Versatz" feature (compensates Bluetooth latency,
  nudges takes into the pocket).
- UI is a **Logic-style horizontal timeline**. Recording is one-click per Spur and
  lands **at the playhead**, running until you stop (no loop-snap/auto-stop);
  `setPlayhead` moves the cursor (ruler click), `play`/`record` start from it.
- Components: `<Recorder>` (transport + tempo + Einstellungen + Mix download),
  `<Timeline>` (fixed left header column — name + **M/S/R** — beside a horizontally
  scrollable bar-ruler + per-track lanes + a playhead spanning them), `<Clip>` (one
  recording region: drag horizontally to move it in time — this replaced the old
  "Versatz" slider — tap to select → mute/download/delete; position/width from
  `(startSample+shiftSamples)`/length), `<Waveform>` (static canvas peaks), and
  `<LiveWaveform>` — the live input oscilloscope ("Ausschlag") shown while the mic
  is open/recording. It runs its own rAF off the hook's `readInputWave()` (an
  `AnalyserNode` tap) so the parent never re-renders at frame rate, and mirrors the
  current peak onto `data-level` for E2E assertions.

### Lernen — music-theory games

```
ScaleGame (shared engine) ← config ← MajorScales / MinorScales
ChordGame
        ↑ all built on pure theory in lib/scales + lib/chords
        ↑ note playback via lib/tone (Web Audio synth)
```

- **`lib/scales.ts`** / **`lib/chords.ts`** — pure music theory (correct note
  spelling, scale/chord construction, enharmonic comparison). `chords.ts` also
  owns the chord game's difficulty tiers (`leicht`/`mittel`/`schwer` →
  `chordTypesFor`), which limit the chord types a round can draw from.
- **`lib/tone.ts`** — a tiny Web Audio synth that plays a "plink" per note;
  lazy-creates one `AudioContext` (iOS requires creation inside a gesture).
- **`components/ScaleGame.tsx`** is a configurable game engine; `MajorScales`
  and `MinorScales` are thin wrappers passing a config. `ChordGame` is its own
  component. `<Piano>` is a shared input surface.

## Cross-cutting concerns

- **Theme** — `lib/theme.ts` (tokens + storage key), `hooks/useTheme.ts`,
  `<ThemeToggle>`. Dark by default; the initial theme is applied by an inline
  script in `index.html` before React mounts to avoid a flash. See
  [CLAUDE.md](../CLAUDE.md) → "Theme".
- **Branding/background** — `<Wordmark>`, `<WaveBackground>` (inlines the
  Markensystem SVGs from `public/waves/`). All colors come from CSS custom
  properties in `src/App.css`, never hardcoded in components.
- **PWA** — `vite-plugin-pwa` (config in `vite.config.ts`) generates the
  service worker + manifest; `<UpdatePrompt>` surfaces the "new version"
  prompt. Set `DISABLE_PWA=1` during local dev to avoid stale SW caches.

## Audio API ownership (the thing to get right)

All Web Audio / `getUserMedia` lifecycle lives in **hooks**, never in `lib/` or
components. Each audio entry point owns its own `AudioContext`:

| Hook / module           | Captures mic? | Produces sound? | Purpose             |
| ----------------------- | ------------- | --------------- | ------------------- |
| `usePitchDetection`     | yes           | no              | tuner pitch         |
| `useBpmDetector`        | yes           | no              | mic tempo detection |
| `useMetronome`          | no            | yes             | click playback      |
| `useMultitrackRecorder` | yes           | yes             | loop recorder       |
| `lib/tone`              | no            | yes             | game note playback  |

`hooks/useMicDevices.ts` is a small **shared** helper (not an audio entry point):
it owns `enumerateDevices` + the OS `devicechange` listener and feeds the
`<MicButton>` picker for both `usePitchDetection` and `useMultitrackRecorder`.

When touching audio, keep capture/scheduling logic in the hook and any pure
math (frequency, cents, onset, tempo, mixing) down in `lib/` so it stays testable.

## Testing

- **Vitest** (`src/**/*.test.ts`) — co-located unit tests for the pure `lib/`
  layer: `tuning`, `scales`, `chords`, `tone`, `bpm`, `onset`, `recording`,
  `wav`, `waveform`. The onset/bpm
  tests decode **real WAV excerpts** in `tests/fixtures/audio/`
  (`<bpm>bpm-<timbre>.wav`) and assert detected tempo to within ±3 BPM — so the
  exact algorithm that runs live is the one under test.
- **Playwright** (`tests/e2e/`) — `mobile-chromium` only, at a Pixel 7 viewport.
  Covers shell, nav, theme, tuner mode switching, metronome, and the scale/chord
  games. The tuner/metronome mic paths stop at `getUserMedia`, but the **recorder**
  is exercised end-to-end: Chromium is launched with a **fake mic** fed a looping
  sine (`tests/fixtures/fake-mic-sine.wav`, see `playwright.config.ts`), so
  add-track → record → live waveform deflection → captured take are all asserted
  headless.
- **Pre-commit hook** (`scripts/git-hooks/`, wired via `core.hooksPath` by the
  `prepare` npm script) runs Prettier, ESLint, and Stylelint on every commit
  (plus a gitleaks secret scan when installed), and runs the unit suite when a
  commit touches the metronome feature. Bypass with `--no-verify`.
- **CI** (`.github/workflows/ci.yml`) is the non-bypassable mirror of the hook:
  on every push/PR it runs format + lint + CSS-lint, the build/type-check, the
  unit suite, and Playwright E2E, plus **gitleaks** (secrets) and **Trivy**
  (deps/misconfig, report-only). The hook shortens the loop; CI is the gate.

## Build & deploy

- Vite build (`npm run build` → `tsc -b && vite build`) emits a static bundle to
  `dist/`.
- Deployed to **Netlify** (`netlify.toml`): static publish of `dist/` with an
  SPA `/* → /index.html` redirect.
- No backend, no database, no environment secrets.
