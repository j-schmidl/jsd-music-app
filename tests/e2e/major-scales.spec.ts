import { expect, test } from '@playwright/test';

// Navigates to the Lernen tab and opens the Major Scales game.
async function openMajorScales(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('nav-lernen').click();
  await expect(page.getByTestId('lernen-menu')).toBeVisible();
  await page.getByTestId('lernen-tile-major-scales').click();
  await expect(page.getByTestId('major-scales')).toBeVisible();
}

// Picks a deterministic key from the dropdown so tests can assert exact notes.
async function selectKey(page: import('@playwright/test').Page, key: string) {
  await page.getByTestId('key-select').selectOption(key);
}

test.describe('Lernen menu', () => {
  test('Lernen tab shows the game menu, then opens Major Scales', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-lernen').click();
    await expect(page.getByTestId('lernen-menu')).toBeVisible();
    await expect(page.getByTestId('lernen-tile-major-scales')).toContainText('Dur-Tonleitern');

    await page.getByTestId('lernen-tile-major-scales').click();
    await expect(page.getByTestId('major-scales')).toBeVisible();
    // Default mode is Build
    await expect(page.getByTestId('mode-build')).toHaveAttribute('aria-selected', 'true');
  });

  test('back button returns from Major Scales to the menu', async ({ page }) => {
    await openMajorScales(page);
    await page.getByTestId('lernen-back').click();
    await expect(page.getByTestId('lernen-menu')).toBeVisible();
  });
});

test.describe('Major Scales — Build mode', () => {
  test('builds C major correctly using the picker', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'C');

    for (const n of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('Richtig');
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('wrong build is flagged and score does not increment', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'C');
    // Place a wrong note in slot 0 (D instead of C), correct elsewhere
    for (const n of ['D', 'D', 'E', 'F', 'G', 'A', 'B']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('Nicht ganz');
    await expect(page.getByTestId('score')).toContainText('0 / 1');
  });
});

test.describe('Major Scales — Fill mode', () => {
  test('renders some given notes and accepts the reveal button', async ({ page }) => {
    await openMajorScales(page);
    await page.getByTestId('mode-fill').click();
    await selectKey(page, 'G');

    // At least one slot should be 'given' (visible from the chosen difficulty).
    const givenCount = await page.locator('[data-state="given"]').count();
    expect(givenCount).toBeGreaterThan(0);
    expect(givenCount).toBeLessThan(7);

    await page.getByTestId('reveal').click();
    await expect(page.getByTestId('feedback')).toContainText('Auflösung');
    // The 7 slots, in order, should now read G A B C D E F#
    const slotTexts: string[] = [];
    for (let i = 0; i < 7; i++) {
      slotTexts.push((await page.getByTestId(`slot-${i}`).innerText()).trim());
    }
    expect(slotTexts).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });

  test('Easy difficulty hides 3, Hard hides 6', async ({ page }) => {
    await openMajorScales(page);
    await page.getByTestId('mode-fill').click();
    await selectKey(page, 'C');

    await page.getByTestId('difficulty-select').selectOption('easy');
    // 3 hidden = 4 given
    await expect(page.locator('[data-state="given"]')).toHaveCount(4);

    await page.getByTestId('difficulty-select').selectOption('hard');
    // 6 hidden = 1 given
    await expect(page.locator('[data-state="given"]')).toHaveCount(1);
  });
});

test.describe('Major Scales — Piano mode', () => {
  test('correct keys advance, wrong keys flash but do not advance', async ({ page }) => {
    await openMajorScales(page);
    await page.getByTestId('mode-piano').click();
    await selectKey(page, 'C');
    await expect(page.getByTestId('piano')).toBeVisible();

    // Click a wrong key first (D before the expected C).
    // White-key indices are 0..13: C=0,D=1,E=2,F=3,G=4,A=5,B=6,C=7,D=8...
    // dispatchEvent('click') bypasses pointer-events ordering since black-key
    // overlays sit above whites in the stacking context.
    const clickKey = (selector: string) =>
      page.locator(selector).first().evaluate((el) => (el as HTMLElement).click());

    await clickKey('[data-testid="piano-key-D-1"]');
    await expect(page.getByTestId('feedback')).toContainText('✗');
    await expect(page.getByTestId('slot-0')).toHaveAttribute('data-state', 'active');

    await clickKey('[data-testid="piano-key-C-0"]');
    await expect(page.getByTestId('slot-0')).toContainText('C');
    for (const [name, idx] of [
      ['D', 1],
      ['E', 2],
      ['F', 3],
      ['G', 4],
      ['A', 5],
      ['B', 6],
    ] as [string, number][]) {
      await clickKey(`[data-testid="piano-key-${name}-${idx}"]`);
    }
    await expect(page.getByTestId('feedback')).toContainText('Richtig');
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('hard difficulty hides all key labels; easy shows them', async ({ page }) => {
    await openMajorScales(page);
    await page.getByTestId('mode-piano').click();

    await page.getByTestId('difficulty-select').selectOption('easy');
    await expect(page.locator('.major-scales__key-label').first()).toBeVisible();

    await page.getByTestId('difficulty-select').selectOption('hard');
    await expect(page.locator('.major-scales__key-label')).toHaveCount(0);
  });
});
