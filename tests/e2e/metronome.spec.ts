import { expect, test } from '@playwright/test';

// The metronome lives behind the new "Metronom" bottom-nav tab. The tuner
// (Stimmen) is still the landing page, so each test navigates in first.
async function openMetronome(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('nav-metronom').click();
  await expect(page.getByTestId('metronome')).toBeVisible();
}

test.describe('metronome — navigation', () => {
  test('tuner is still the landing page; Metronom is reachable from the nav', async ({ page }) => {
    await page.goto('/');
    // Stimmen is active and the tuner is shown on load.
    await expect(page.getByTestId('nav-stimmen')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('tuner')).toBeVisible();
    await expect(page.getByTestId('metronome')).toHaveCount(0);

    await page.getByTestId('nav-metronom').click();
    await expect(page.getByTestId('metronome')).toBeVisible();
    await expect(page.getByTestId('nav-metronom')).toHaveAttribute('aria-current', 'page');
    // The tuner is no longer mounted.
    await expect(page.getByTestId('tuner')).toHaveCount(0);
  });

  test('the nav still lists Stimmen, Metronom and Lernen', async ({ page }) => {
    await page.goto('/');
    for (const id of ['stimmen', 'metronom', 'lernen']) {
      await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
    }
  });
});

test.describe('metronome — tempo controls', () => {
  test('starts at 120 BPM and the +/- buttons nudge by one', async ({ page }) => {
    await openMetronome(page);
    await expect(page.getByTestId('metronome-bpm')).toHaveText('120');

    await page.getByTestId('metronome-plus').click();
    await expect(page.getByTestId('metronome-bpm')).toHaveText('121');

    await page.getByTestId('metronome-minus').click();
    await page.getByTestId('metronome-minus').click();
    await expect(page.getByTestId('metronome-bpm')).toHaveText('119');
  });

  test('the slider sets the tempo', async ({ page }) => {
    await openMetronome(page);
    await page.getByTestId('metronome-slider').fill('150');
    await expect(page.getByTestId('metronome-bpm')).toHaveText('150');
  });

  test('start toggles to stop and back', async ({ page }) => {
    await openMetronome(page);
    const play = page.getByTestId('metronome-play');
    await expect(play).toHaveText('Start');
    await expect(play).toHaveAttribute('aria-pressed', 'false');

    await play.click();
    await expect(play).toHaveText('Stopp');
    await expect(play).toHaveAttribute('aria-pressed', 'true');

    await play.click();
    await expect(play).toHaveText('Start');
    await expect(play).toHaveAttribute('aria-pressed', 'false');
  });

  test('the time signature can be changed', async ({ page }) => {
    await openMetronome(page);
    await expect(page.getByTestId('metronome-meter-4')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('metronome-meter-3').click();
    await expect(page.getByTestId('metronome-meter-3')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('metronome-meter-4')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('metronome — BPM finder', () => {
  test('defaults to the tap mode and can switch to microphone', async ({ page }) => {
    await openMetronome(page);
    await expect(page.getByTestId('finder-tap')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('finder-tap-button')).toBeVisible();

    await page.getByTestId('finder-mic').click();
    await expect(page.getByTestId('finder-mic')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('finder-mic-button')).toBeVisible();
    // The tap button is gone in mic mode.
    await expect(page.getByTestId('finder-tap-button')).toHaveCount(0);
  });

  test('tapping the button derives a tempo and applies it', async ({ page }) => {
    await openMetronome(page);
    const tap = page.getByTestId('finder-tap-button');
    // Tap roughly four times at ~120 BPM (500ms apart).
    for (let i = 0; i < 4; i++) {
      await tap.click();
      if (i < 3) await page.waitForTimeout(500);
    }
    // A numeric tempo is shown and has been pushed to the main readout.
    await expect(page.getByTestId('finder-tap-button')).toContainText(/\d{2,3}/);
    const bpm = Number(await page.getByTestId('metronome-bpm').textContent());
    expect(bpm).toBeGreaterThan(90);
    expect(bpm).toBeLessThan(150);

    // Reset clears the tap count.
    await page.getByTestId('finder-tap-reset').click();
    await expect(page.getByTestId('finder-tap-button')).toContainText('Tippe im Takt');
  });
});
