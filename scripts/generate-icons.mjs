// Renders the jsd wordmark to PNG icons via Playwright.
// Usage: node scripts/generate-icons.mjs
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

// Renders js<d> with d in --musik on --fund-02 background.
// Maskable icons need a "safe zone" — content kept inside a centered 80% disc.
function html({ size, maskable }) {
  const padding = maskable ? size * 0.18 : size * 0.12;
  const inner = size - padding * 2;
  const fontSize = Math.round(inner * 0.62);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@700&display=swap" rel="stylesheet" />
  <style>
    html, body { margin: 0; padding: 0; }
    body {
      width: ${size}px;
      height: ${size}px;
      background: #1E0032;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Space Mono', monospace;
      font-weight: 700;
      color: #EBF0EB;
      letter-spacing: -${Math.round(fontSize * 0.04)}px;
      line-height: 1;
    }
    .mark {
      font-size: ${fontSize}px;
      transform: translateY(-${Math.round(fontSize * 0.04)}px);
    }
    .accent { color: #92A0F8; }
  </style>
</head>
<body>
  <span class="mark">js<span class="accent">d</span></span>
</body>
</html>`;
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
];

const browser = await chromium.launch();
try {
  for (const target of targets) {
    const ctx = await browser.newContext({
      viewport: { width: target.size, height: target.size },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.setContent(html(target), { waitUntil: 'networkidle' });
    // Give web fonts a tick to render once loaded.
    await page.evaluate(() => document.fonts.ready);
    const path = resolve(OUT_DIR, target.name);
    await page.screenshot({ path, type: 'png', omitBackground: false });
    await ctx.close();
    console.log(`wrote ${target.name} (${target.size}x${target.size}${target.maskable ? ' maskable' : ''})`);
  }
} finally {
  await browser.close();
}
