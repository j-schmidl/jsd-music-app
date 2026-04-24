# CLAUDE.md — jsd-music-app

Durable context for future Claude sessions. Keep this short and stable; edit only when project-level intent changes, not per-task.

## Project

`jsd-music-app` is a **music learning web app**. v1 is a **guitar tuner** as the landing page and first goodie — it's what a visitor sees when they open the site. The bottom navigation (Songs / Tools / Stimmen / Lernen / Einstellungen) is a placeholder for future learning features the user will build out. Only the **Stimmen** (tuner) tab is implemented for now. The owner uses this app themselves and is also the primary developer.

## Stack

- **Vite + React + TypeScript** (template: `react-ts`).
- **Pitch detection**: `pitchy` (McLeod Pitch Method) running in the browser via `AudioContext` + `getUserMedia`. No backend.
- **Styling**: plain CSS files with CSS custom properties for theme tokens. No Tailwind, no styled-components.
- **Fonts**: Google Fonts — `Space Mono` (titles) and `IBM Plex Sans` (body), loaded via `<link>` in `index.html`.
- **Tests**:
  - **Vitest** for unit tests, co-located as `src/**/*.test.ts`. The current suite covers the pure tuning logic in `src/lib/tuning.ts` — `nearestString`, `centsOff`, `isInTune`, `getTuningHint`, and the `STRINGS` table.
  - **Playwright** for E2E, living under `tests/e2e/`. Runs in Chromium with a `Pixel 7` mobile viewport (the project is mobile-first — tests run at mobile dimensions, not desktop). The suite covers: page shell rendering, bottom nav, theme default + toggle + persistence, auto/manual mode switching, and tuner start-button wiring. Mic input can't be exercised meaningfully in headless Chromium, so the E2E tests assert behavior up to the start of `getUserMedia` and leave actual pitch verification to manual testing.
  - Playwright uses the `mobile-chromium` project only. WebKit and Firefox browsers are intentionally not installed — if you add a cross-browser project, install with `npx playwright install webkit firefox` first.
  - The Vite dev server is started automatically by Playwright via `webServer` in `playwright.config.ts`; a reused existing server is preferred when one is already running.

## Brand

Follows the **jsd Markensystem** style guide (PDF lives in `~/Downloads/260413_jannis_styleguide_final.pdf`). This app is in the **Musik** cluster (Welle zustand): deep purple Fundament 02 dark background, purple-blue Musik accent `#92A0F8` as the primary UI color. Brand tokens live in `src/App.css` as CSS custom properties — do not hardcode hex values in components.

Key tokens (reference only — edit `src/App.css`, not here):
- `--fund-01 #505078`, `--fund-02 #1E0032`, `--fund-light #EBF0EB`
- `--tech #8CEBCD` (in-tune feedback), `--musik #92A0F8` (primary accent), `--kultur #DCFF3A`

The wordmark is `jsd` — the last character `d` renders in `--musik` (echoing the `tuna` green in the GuitarTuna screenshots the design is modeled on).

## Theme

**The app starts in dark mode by default.** A light mode toggle (sun/moon icon) sits in the top-left corner. The user preference is persisted in `localStorage` under key `jsd-theme` and applied to `document.documentElement.dataset.theme` before React mounts (via a tiny inline script in `index.html`) to avoid a flash of wrong theme. Do not remove or invert the dark default.

## Mobile-first

The app is designed **phone-first** (iPhone-sized portrait, ≤430px). Desktop is a progressive enhancement via `@media (min-width: 768px)` — the phone-narrow column stays centered on larger screens. All hit targets are ≥44×44px. iOS safe areas are respected via `env(safe-area-inset-*)`. Do not refactor toward desktop-first layouts.

## Tuner modes

The "AUTOM." switch in the top-right flips between:

- **Auto (default, ON)**: mic input → pitch detection → `nearestString(freq)` picks the target string. The matched string's button lights up; the needle shows cents offset from that target.
- **Manual (OFF)**: user taps one of the six string buttons (D/A/E/G/B/E) to pin the target. The needle shows cents offset from the pinned string only. When the pinned string is also detected in the mic input, its ring pulses to indicate both "selected" and "detected".

Both modes must stay. Do not merge them or drop one.

## Repo policy

- Public on GitHub under `j-schmidl/jsd-music-app`.
- External contributors go through **fork + pull request**; only the owner and invited collaborators can push to the repo.
- No direct pushes from non-collaborators — this is GitHub's default behavior for public repos and does not require extra config.

## Wave assets

The SVGs in `public/waves/` come from the Markensystem delivery (original location: `~/Downloads/wetransfer_key-visual-elemente_2026-04-16_1232/`). Their stroke is hardcoded to `#1e0032`; override it via CSS when inlining (`WaveBackground.tsx`). Keep them as-is — don't rewrite or optimize unless instructed.

## How to run

```bash
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm test           # Vitest unit tests (watch mode)
npm run test:run   # Vitest single run
npm run test:e2e   # Playwright E2E tests (requires dev server already running, or uses webServer config)
```

Mic access on iOS Safari requires HTTPS. For phone testing over the local network, use `npm run dev -- --host` and access via the laptop's local IP (you'll need to accept a self-signed cert).

## Conventions

- One component per file under `src/components/<Name>.tsx` with co-located `<Name>.css`.
- Custom hooks under `src/hooks/use<Name>.ts`. Pure logic under `src/lib/`.
- Component files stay focused — if a component exceeds ~200 lines, consider splitting.
- Prefer CSS custom properties over passing colors through props.
- No inline styles unless absolutely necessary for dynamic values (e.g., needle rotation angle).
