# CLAUDE.md — jsd-music-app

Durable context for future Claude sessions. Keep this **short and stable** — edit
only when project-level intent changes, not per-task. Detailed reference lives in
[`docs/`](docs/); link to it rather than growing this file.

`jsd-music-app` is a **mobile-first, backend-free music-learning web app** (Vite +
React + TypeScript; all audio runs in the browser, nothing is sent to a server).
v1's landing page is a **guitar tuner**. Bottom nav: **Stimmen** (tuner) /
**Metronom** / **Lernen** — all implemented; **Stimmen stays first and is the
landing page**. The owner is the primary developer and uses the app themselves.

## Docs

- [docs/architecture.md](docs/architecture.md) — structure & data flow (the
  `lib/` / `hooks/` / `components/` layering, audio capture/scheduling, state
  ownership, the metronome/BPM internals). **Whenever you change the architecture**
  — add a feature/tab/game, move logic between layers, change how audio is
  captured or how top-level state is owned — **update it in the same change.**
- [docs/development.md](docs/development.md) — stack, tooling & CI, tests, npm
  scripts ("How to run"), and code conventions.
- [docs/brand.md](docs/brand.md) — jsd Markensystem, color tokens, wave assets.

## Guardrails (do not break)

- **Dark mode is the default.** A light-mode toggle (sun/moon) sits top-left; the
  preference persists in `localStorage` under `jsd-theme` and is applied to
  `document.documentElement.dataset.theme` by an inline script in `index.html`
  before React mounts (avoids a flash). Do not remove or invert the dark default.
- **Both tuner modes stay.** The top-right "AUTOM." switch flips between **Auto**
  (default/ON: mic → pitch → `nearestString(freq)` picks the target string) and
  **Manual** (OFF: user pins one of the six string buttons; the needle shows cents
  vs. that string, and its ring pulses when the pinned string is also detected).
  Do not merge or drop either.
- **Mobile-first.** Designed phone-first (iPhone portrait, ≤430px); desktop is a
  progressive enhancement via `@media (min-width: 768px)`. All hit targets
  ≥44×44px; iOS safe areas respected via `env(safe-area-inset-*)`. Do not refactor
  toward desktop-first layouts.
- **Brand tokens, not hex.** Use the CSS custom properties in `src/App.css`; don't
  hardcode hex in components. See [docs/brand.md](docs/brand.md).

## Repo policy

- Public on GitHub under `j-schmidl/jsd-music-app`.
- External contributors go through **fork + pull request**; only the owner and
  invited collaborators can push. (GitHub's default for public repos — no extra
  config needed.)
