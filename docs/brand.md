# Brand & assets

Visual identity for `jsd-music-app`. Durable invariants live in
[CLAUDE.md](../CLAUDE.md); the dark-mode default and mobile-first rules that this
identity assumes are documented there.

## Brand system

Follows the **jsd Markensystem** style guide (PDF lives in
`~/Downloads/260413_jannis_styleguide_final.pdf`). This app is in the **Musik**
cluster (Welle zustand): deep purple Fundament 02 dark background, purple-blue
Musik accent `#92A0F8` as the primary UI color. Brand tokens live in `src/App.css`
as CSS custom properties — **do not hardcode hex values in components.**

Key tokens (reference only — edit `src/App.css`, not here):

- `--fund-01 #505078`, `--fund-02 #1E0032`, `--fund-light #EBF0EB`
- `--tech #8CEBCD` (in-tune feedback), `--musik #92A0F8` (primary accent),
  `--kultur #DCFF3A`

The wordmark is `jsd` — the last character `d` renders in `--musik` (echoing the
`tuna` green in the GuitarTuna screenshots the design is modeled on).

## Wave assets

The SVGs in `public/waves/` come from the Markensystem delivery (original
location: `~/Downloads/wetransfer_key-visual-elemente_2026-04-16_1232/`). Their
stroke is hardcoded to `#1e0032`; override it via CSS when inlining
(`WaveBackground.tsx`). Keep them as-is — don't rewrite or optimize unless
instructed.
