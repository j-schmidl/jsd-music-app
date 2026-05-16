import { expect, test, type Page } from '@playwright/test';

// Pins Math.random so the random mode pick in ScaleGame is deterministic.
// 'build' = index 0, 'fill' = 1, 'piano' = 2 → pass 0, 0.4, or 0.8.
// Note: the minor game also calls Math.random for the variant pick, so a
// pinned value also fixes the variant ('natural' at 0).
async function pinRandom(page: Page, value: number) {
  await page.addInitScript((v) => {
    Math.random = () => v;
  }, value);
}

async function openMinorScales(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.removeItem('jsd-minorscales-settings');
    } catch {
      /* ignore */
    }
  });
  await page.getByTestId('nav-lernen').click();
  await expect(page.getByTestId('lernen-menu')).toBeVisible();
  await page.getByTestId('lernen-tile-minor-scales').click();
  await expect(page.getByTestId('minor-scales')).toBeVisible();
}

async function openSettings(page: Page) {
  if ((await page.getByTestId('settings-panel').count()) === 0) {
    await page.getByTestId('settings-toggle').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();
  }
}

async function selectKey(page: Page, key: string) {
  await openSettings(page);
  await page.getByTestId('key-select').selectOption(key);
}

test.describe('Lernen menu — Moll tile', () => {
  test('Lernen tab lists both scale games and opens Moll-Tonleitern', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-lernen').click();
    await expect(page.getByTestId('lernen-tile-major-scales')).toContainText('Dur-Tonleitern');
    await expect(page.getByTestId('lernen-tile-minor-scales')).toContainText('Moll-Tonleitern');

    await page.getByTestId('lernen-tile-minor-scales').click();
    await expect(page.getByTestId('minor-scales')).toBeVisible();
    await expect(page.getByTestId('minor-scales')).toContainText('Moll-Tonleitern');
  });

  test('back button returns from Moll-Tonleitern to the menu', async ({ page }) => {
    await openMinorScales(page);
    await page.getByTestId('lernen-back').click();
    await expect(page.getByTestId('lernen-menu')).toBeVisible();
  });
});

test.describe('Moll-Tonleitern — build mode', () => {
  test('builds A natural minor correctly using the picker', async ({ page }) => {
    // Math.random pinned to 0 → build mode AND natural-minor variant.
    await pinRandom(page, 0);
    await openMinorScales(page);
    await selectKey(page, 'A');

    // A natural minor = A B C D E F G.
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('Richtig');
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('the prompt names the minor variant for the round', async ({ page }) => {
    await pinRandom(page, 0); // natural variant
    await openMinorScales(page);
    await expect(page.getByTestId('prompt')).toContainText('natürliches Moll');
  });

  test('wrong notes are flagged and the round stays editable', async ({ page }) => {
    await pinRandom(page, 0);
    await openMinorScales(page);
    await selectKey(page, 'A');
    // Place C in slot 0 (should be A); rest correct.
    for (const n of ['C', 'B', 'C', 'D', 'E', 'F', 'G']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('Fehler');
    await expect(page.getByTestId('slot-0')).toHaveClass(/wrong/);
    await expect(page.getByTestId('score')).toContainText('0 / 0');
  });
});

test.describe('Moll-Tonleitern — scale-type explanation', () => {
  test('an info panel explains the natural, harmonic and melodic variants', async ({ page }) => {
    await openMinorScales(page);
    // Collapsed by default.
    await expect(page.getByTestId('info-panel')).toHaveCount(0);

    await page.getByTestId('info-toggle').click();
    const info = page.getByTestId('info-panel');
    await expect(info).toBeVisible();
    await expect(info).toContainText('Natürliches Moll');
    await expect(info).toContainText('Harmonisches Moll');
    await expect(info).toContainText('Melodisches Moll');
    // The harmonic explanation mentions the raised 7th degree.
    await expect(info).toContainText('7. Stufe');
  });

  test('the info panel is available in every difficulty', async ({ page }) => {
    await openMinorScales(page);
    await expect(page.getByTestId('info-toggle')).toBeVisible();

    // Still offered after switching to an easier difficulty.
    await openSettings(page);
    await page.getByTestId('difficulty-select').selectOption('medium');
    await expect(page.getByTestId('info-toggle')).toBeVisible();

    await page.getByTestId('difficulty-select').selectOption('easy');
    await expect(page.getByTestId('info-toggle')).toBeVisible();
  });
});

test.describe('Moll-Tonleitern — settings persist independently', () => {
  test('minor-game settings are stored separately from the major game', async ({ page }) => {
    await openMinorScales(page);
    await selectKey(page, 'E');

    await page.reload();
    await page.getByTestId('nav-lernen').click();
    await page.getByTestId('lernen-tile-minor-scales').click();
    await expect(page.getByTestId('settings-summary')).toContainText('Tonart: E');
  });
});
