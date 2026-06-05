# Development — stack, tooling & conventions

Reference detail for building on `jsd-music-app`. Durable invariants and the
docs index live in [CLAUDE.md](../CLAUDE.md); structure/data-flow in
[architecture.md](architecture.md).

## Stack

- **Vite + React + TypeScript** (template: `react-ts`).
- **Pitch detection**: `pitchy` (McLeod Pitch Method) running in the browser via
  `AudioContext` + `getUserMedia`. No backend.
- **Styling**: plain CSS files with CSS custom properties for theme tokens. No
  Tailwind, no styled-components. Linted by **Stylelint** (`stylelint-config-standard`,
  config in `stylelint.config.js`; the selector rule allows BEM
  `block__element--modifier` naming).
- **Fonts**: Google Fonts — `Space Mono` (titles) and `IBM Plex Sans` (body),
  loaded via `<link>` in `index.html`.
- **TypeScript**: `strict` is on in all three project configs
  (`tsconfig.{app,node,test}.json`). The build (`tsc -b && vite build`)
  type-checks everything.

## Tooling & CI

ESLint (flat config) + Stylelint + Prettier for code/style. **GitHub Actions**
(`.github/workflows/ci.yml`) runs format/lint/CSS-lint, the build + type-check,
unit tests, and Playwright E2E on every push and PR, plus **gitleaks** (secret
scan) and **Trivy** (dependency/misconfig scan, currently report-only). CI is the
durable gate; the **pre-commit hook** (`scripts/git-hooks/pre-commit`, wired via
`core.hooksPath` by the `prepare` npm script) is its fast local mirror — it runs
Prettier, ESLint, and Stylelint on every commit (plus a gitleaks scan when
`gitleaks` is installed locally) and the unit suite whenever a commit touches the
metronome feature. Bypass with `git commit --no-verify`.

Node is pinned to 22 (`.nvmrc`, `engines`); `.npmrc` sets `legacy-peer-deps=true`
(vite 8 vs `vite-plugin-pwa`'s peer range) so `npm ci` works everywhere, including
Netlify. `.editorconfig` keeps editors aligned with Prettier.

## Tests

- **Vitest** for unit tests, co-located as `src/**/*.test.ts`, covering the pure
  `lib/` layer (`tuning`, `scales`, `chords`, `tone`, `bpm`, `onset`). The
  onset/bpm tests decode **real WAV excerpts** in `tests/fixtures/audio/`
  (`<bpm>bpm-<timbre>.wav`) and assert detected tempo to within ±3 BPM — the exact
  algorithm that runs live is the one under test.
- **Playwright** for E2E, under `tests/e2e/`, in Chromium at a `Pixel 7` mobile
  viewport (the project is mobile-first — tests run at mobile dimensions). Covers
  shell, nav, theme default + toggle + persistence, auto/manual mode switching,
  metronome, and the scale/chord games. Mic input can't be exercised meaningfully
  headless, so tests assert behavior up to the start of `getUserMedia` and leave
  actual pitch verification to manual testing.
- Playwright uses the `mobile-chromium` project only. WebKit and Firefox are
  intentionally not installed — if you add a cross-browser project, run
  `npx playwright install webkit firefox` first.
- The Vite dev server is started automatically by Playwright via `webServer` in
  `playwright.config.ts`; a reused existing server is preferred.

## How to run

```bash
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm test           # Vitest unit tests (watch mode)
npm run test:run   # Vitest single run
npm run test:e2e   # Playwright E2E tests (uses webServer config if no server is running)
npm run lint       # ESLint over the repo
npm run lint:css   # Stylelint over src/**/*.css
npm run lint:css:fix  # Stylelint — auto-fix what it can
npm run format     # Prettier — rewrite all files in place
npm run format:check  # Prettier — verify formatting without writing (used by the pre-commit hook)
```

Mic access on iOS Safari requires HTTPS. For phone testing over the local network,
use `npm run dev -- --host` and access via the laptop's local IP (you'll need to
accept a self-signed cert).

## Conventions

- One component per file under `src/components/<Name>.tsx` with co-located
  `<Name>.css`.
- Custom hooks under `src/hooks/use<Name>.ts`. Pure logic under `src/lib/`.
- Component files stay focused — if a component exceeds ~200 lines, consider
  splitting.
- Prefer CSS custom properties over passing colors through props.
- No inline styles unless absolutely necessary for dynamic values (e.g., needle
  rotation angle).
- Formatting is owned by **Prettier** (`.prettierrc.json`: 100 cols, single
  quotes, semicolons, trailing commas) — don't hand-format; run `npm run format`.
  ESLint stylistic rules that would fight Prettier are disabled via
  `eslint-config-prettier`.
- CSS is linted by **Stylelint** — run `npm run lint:css:fix` rather than
  hand-fixing. It enforces standard CSS hygiene and BEM-style class names but
  intentionally does **not** ban hardcoded hex (component CSS still has some); keep
  using brand tokens from `src/App.css` for anything themed.
