# Architecture — jsd-music-app

High-level map of how the app is put together. For project intent, brand, and
conventions see [CLAUDE.md](CLAUDE.md); this document describes **structure and
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

- **Which tab is active** (`stimmen` / `metronom` / `lernen`) — switched by
  `<BottomNav>`. `stimmen` (the tuner) is the landing tab.
- **Tuner state**: auto/manual mode, guitar/chromatic mode, the selected
  `Tuning`, the user's custom tuning, and the pinned string. It runs the
  `usePitchDetection` hook and derives the target string from the detected
  frequency.
- **Lernen sub-navigation**: a small in-component menu/screen state machine
  (`LernenScreen`) that swaps between the learning games.

Each tab renders a feature subtree. The Metronom and Lernen features are
self-contained — `App` just mounts `<Metronome>` or one of the game components
and lets them own their own hooks and state.

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
  with a headstock vs. free 12-tone detection). See CLAUDE.md → "Tuner modes".
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

### Lernen — music-theory games

```
ScaleGame (shared engine) ← config ← MajorScales / MinorScales
ChordGame
        ↑ all built on pure theory in lib/scales + lib/chords
        ↑ note playback via lib/tone (Web Audio synth)
```

- **`lib/scales.ts`** / **`lib/chords.ts`** — pure music theory (correct note
  spelling, scale/chord construction, enharmonic comparison).
- **`lib/tone.ts`** — a tiny Web Audio synth that plays a "plink" per note;
  lazy-creates one `AudioContext` (iOS requires creation inside a gesture).
- **`components/ScaleGame.tsx`** is a configurable game engine; `MajorScales`
  and `MinorScales` are thin wrappers passing a config. `ChordGame` is its own
  component. `<Piano>` is a shared input surface.

## Cross-cutting concerns

- **Theme** — `lib/theme.ts` (tokens + storage key), `hooks/useTheme.ts`,
  `<ThemeToggle>`. Dark by default; the initial theme is applied by an inline
  script in `index.html` before React mounts to avoid a flash. See CLAUDE.md →
  "Theme".
- **Branding/background** — `<Wordmark>`, `<WaveBackground>` (inlines the
  Markensystem SVGs from `public/waves/`). All colors come from CSS custom
  properties in `src/App.css`, never hardcoded in components.
- **PWA** — `vite-plugin-pwa` (config in `vite.config.ts`) generates the
  service worker + manifest; `<UpdatePrompt>` surfaces the "new version"
  prompt. Set `DISABLE_PWA=1` during local dev to avoid stale SW caches.

## Audio API ownership (the thing to get right)

All Web Audio / `getUserMedia` lifecycle lives in **hooks**, never in `lib/` or
components. There are three independent audio entry points, each owning its own
`AudioContext`:

| Hook / module        | Captures mic? | Produces sound? | Purpose                  |
| -------------------- | ------------- | --------------- | ------------------------ |
| `usePitchDetection`  | yes           | no              | tuner pitch              |
| `useBpmDetector`     | yes           | no              | mic tempo detection      |
| `useMetronome`       | no            | yes             | click playback           |
| `lib/tone`           | no            | yes             | game note playback       |

When touching audio, keep capture/scheduling logic in the hook and any pure
math (frequency, cents, onset, tempo) down in `lib/` so it stays testable.

## Testing

- **Vitest** (`src/**/*.test.ts`) — co-located unit tests for the pure `lib/`
  layer: `tuning`, `scales`, `chords`, `tone`, `bpm`, `onset`. The onset/bpm
  tests decode **real WAV excerpts** in `tests/fixtures/audio/`
  (`<bpm>bpm-<timbre>.wav`) and assert detected tempo to within ±3 BPM — so the
  exact algorithm that runs live is the one under test.
- **Playwright** (`tests/e2e/`) — `mobile-chromium` only, at a Pixel 7 viewport.
  Covers shell, nav, theme, tuner mode switching, metronome, and the scale/chord
  games up to the start of `getUserMedia` (mic can't be exercised headless).
- **Pre-commit hook** (`scripts/git-hooks/`, wired via `core.hooksPath` by the
  `prepare` npm script) type-checks and runs the unit suite when a commit
  touches the metronome feature. Bypass with `--no-verify`.

## Build & deploy

- Vite build (`npm run build` → `tsc -b && vite build`) emits a static bundle to
  `dist/`.
- Deployed to **Netlify** (`netlify.toml`): static publish of `dist/` with an
  SPA `/* → /index.html` redirect.
- No backend, no database, no environment secrets.
