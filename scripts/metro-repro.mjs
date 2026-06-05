import { chromium, devices } from '@playwright/test';

const URL = process.env.URL || 'http://localhost:5173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['Pixel 7'],
  permissions: ['microphone'],
});
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL);
await page.getByRole('button', { name: /Metronom/i }).click();
await page.waitForSelector('[data-testid="metronome"]');

const beatsSnapshot = async (label) => {
  const beats = await page.$$eval('.metronome__beat', (els) =>
    els.map((e) => e.classList.contains('metronome__beat--on')),
  );
  const bpm = await page.locator('[data-testid="metronome-bpm"]').textContent();
  console.log(`${label}: bpm=${bpm} beats=${JSON.stringify(beats)}`);
};

await beatsSnapshot('before start');

await page.getByTestId('metronome-play').click();
const playLabel = await page.getByTestId('metronome-play').textContent();
console.log(`play button now reads: ${playLabel}`);

// Sample beat indicator over 3 seconds to see if it advances
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(500);
  await beatsSnapshot(`t+${(i + 1) * 0.5}s`);
}

// Try stop then start again
await page.getByTestId('metronome-play').click();
await beatsSnapshot('after stop');
await page.getByTestId('metronome-play').click();
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(500);
  await beatsSnapshot(`restart +${(i + 1) * 0.5}s`);
}

// === Test 2: tab-switch unmount/remount cycle ===
console.log('\n--- test 2: leave Metronom while playing, come back ---');
await page.getByTestId('metronome-play').click(); // ensure start
await page.waitForTimeout(400);
await page
  .getByRole('button', { name: /Lernen/i })
  .first()
  .click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Metronom/i }).click();
await page.waitForSelector('[data-testid="metronome"]');
const labelAfterRemount = await page.getByTestId('metronome-play').textContent();
console.log(`play button after remount reads: ${labelAfterRemount}`);
await page.getByTestId('metronome-play').click(); // try to start fresh
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(500);
  await beatsSnapshot(`remount-start +${(i + 1) * 0.5}s`);
}

console.log('\n--- console / page errors ---');
console.log(logs.length ? logs.join('\n') : '(none)');

await browser.close();
