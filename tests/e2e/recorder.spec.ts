import { expect, test, type Page } from '@playwright/test';

// The multi-track loop recorder lives behind the "Aufnahme" bottom-nav tab.
// Chromium runs with a fake mic fed a looping sine (see playwright.config.ts), so
// the full add-track → record → clip → drag path can be driven headless.
async function openRecorder(page: Page) {
  await page.goto('/');
  await page.getByTestId('nav-aufnahme').click();
  await expect(page.getByTestId('recorder')).toBeVisible();
}

test.describe('recorder — navigation', () => {
  test('Aufnahme is reachable from the nav and mounts the recorder', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('recorder')).toHaveCount(0);
    await page.getByTestId('nav-aufnahme').click();
    await expect(page.getByTestId('recorder')).toBeVisible();
    await expect(page.getByTestId('nav-aufnahme')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('tuner')).toHaveCount(0);
  });

  test('the nav lists all four tabs', async ({ page }) => {
    await page.goto('/');
    for (const id of ['stimmen', 'metronom', 'aufnahme', 'lernen']) {
      await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
    }
  });
});

test.describe('recorder — defaults & tempo', () => {
  test('defaults to 100 BPM and a 4 × 16 bar layout', async ({ page }) => {
    await openRecorder(page);
    await expect(page.getByTestId('recorder-bpm')).toContainText('100');
    await expect(page.getByTestId('recorder-loops')).toContainText('16 Takte');
    await expect(page.getByTestId('recorder-loops')).toContainText('4');
  });

  test('the +/- buttons nudge the tempo', async ({ page }) => {
    await openRecorder(page);
    await page.getByRole('button', { name: 'Schneller' }).click();
    await expect(page.getByTestId('recorder-bpm')).toContainText('101');
    await page.getByRole('button', { name: 'Langsamer' }).click();
    await page.getByRole('button', { name: 'Langsamer' }).click();
    await expect(page.getByTestId('recorder-bpm')).toContainText('99');
  });
});

test.describe('recorder — tracks', () => {
  test('adding a track shows it in the timeline with a record button', async ({ page }) => {
    await openRecorder(page);
    await expect(page.getByTestId('recorder-timeline')).toHaveCount(0);
    await page.getByTestId('recorder-add-track').click();
    await expect(page.getByTestId('recorder-timeline')).toBeVisible();
    await expect(page.locator('[data-testid^="track-rec-"]').first()).toBeVisible();
  });

  test('mix download is disabled with no tracks', async ({ page }) => {
    await openRecorder(page);
    await expect(page.getByTestId('recorder-export-mix')).toBeDisabled();
    await page.getByTestId('recorder-add-track').click();
    await expect(page.getByTestId('recorder-export-mix')).toBeEnabled();
  });
});

test.describe('recorder — recording flow (fake mic)', () => {
  test('one click on a Spur records: the live waveform deflects', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await openRecorder(page);
    await page.getByTestId('recorder-add-track').click();

    // One click on the track's R button starts recording onto that Spur.
    const rec = page.locator('[data-testid^="track-rec-"]').first();
    await rec.click();
    await expect(rec).toHaveAttribute('aria-pressed', 'true');

    const monitor = page.getByTestId('recorder-monitor');
    await expect(monitor).toBeVisible();
    await expect
      .poll(async () => Number((await monitor.getAttribute('data-level')) ?? '0'), {
        timeout: 8000,
      })
      .toBeGreaterThan(0);

    expect(pageErrors).toEqual([]);
  });

  test('stopping leaves a clip with a waveform that can be dragged later in time', async ({
    page,
  }) => {
    await openRecorder(page);
    await page.getByTestId('recorder-add-track').click();

    const rec = page.locator('[data-testid^="track-rec-"]').first();
    await rec.click();
    await expect(rec).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1300);
    await rec.click(); // stop
    await expect(rec).toHaveAttribute('aria-pressed', 'false');

    const clip = page.locator('[data-testid^="clip-"]').first();
    await expect(clip).toBeVisible();
    await expect(clip.locator('canvas.waveform')).toBeVisible();

    // Drag the clip to the right — its timeline position (data-left) increases.
    const before = Number((await clip.getAttribute('data-left')) ?? '0');
    const box = (await clip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => Number((await clip.getAttribute('data-left')) ?? '0'))
      .toBeGreaterThan(before);
  });
});

test.describe('recorder — settings (Einstellungen)', () => {
  test('changing the loop length re-fits the whole-loop layout', async ({ page }) => {
    await openRecorder(page);
    await page.getByTestId('recorder-settings').getByText('Einstellungen').click();
    await page.getByTestId('recorder-loopbars').fill('8');
    await expect(page.getByTestId('recorder-loops')).toContainText('8 Takte');
  });

  test('the loop region and metronome can be toggled', async ({ page }) => {
    await openRecorder(page);
    await page.getByTestId('recorder-settings').getByText('Einstellungen').click();

    const cycle = page.getByTestId('recorder-cycle');
    await expect(cycle).toBeChecked();
    await cycle.uncheck();
    await expect(cycle).not.toBeChecked();

    const metro = page.getByTestId('recorder-metronome');
    await expect(metro).toBeChecked();
    await metro.uncheck();
    await expect(metro).not.toBeChecked();
  });
});
