import { expect, test, type Page } from '@playwright/test';

// Pins Math.random so the round's direction, root and chord type are
// deterministic. 0 → direction 'name', first root (C), first type (major).
async function pinRandom(page: Page, value: number) {
  await page.addInitScript((v) => {
    Math.random = () => v;
  }, value);
}

async function openChordGame(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.removeItem('jsd-chordgame-settings');
    } catch {
      /* ignore */
    }
  });
  await page.getByTestId('nav-lernen').click();
  await expect(page.getByTestId('lernen-menu')).toBeVisible();
  await page.getByTestId('lernen-tile-chord-game').click();
  await expect(page.getByTestId('chord-game')).toBeVisible();
}

test.describe('Lernen menu — chord game tile', () => {
  test('the Lernen menu lists the chord game and opens it', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-lernen').click();
    await expect(page.getByTestId('lernen-tile-chord-game')).toContainText('Akkorde');
    await page.getByTestId('lernen-tile-chord-game').click();
    await expect(page.getByTestId('chord-game')).toBeVisible();
  });
});

test.describe('Chord game — name direction (notes shown, pick the name)', () => {
  test.beforeEach(async ({ page }) => {
    // 0 → direction 'name', root C, type major.
    await pinRandom(page, 0);
  });

  test('shows the chord notes and accepts the right root + quality', async ({ page }) => {
    await openChordGame(page);
    // Direction "name": the prompt asks which chord it is.
    await expect(page.getByTestId('prompt')).toContainText('Welcher Akkord');
    // C major = C E G.
    await expect(page.getByTestId('chord-notes')).toContainText('C');
    await expect(page.getByTestId('chord-notes')).toContainText('E');
    await expect(page.getByTestId('chord-notes')).toContainText('G');

    await page.getByTestId('guess-root').selectOption('C');
    await page.getByTestId('quality-major').click();
    await page.getByTestId('check').click();

    await expect(page.getByTestId('feedback')).toContainText('Richtig');
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('a wrong quality is marked wrong and does not score', async ({ page }) => {
    await openChordGame(page);
    await page.getByTestId('guess-root').selectOption('C');
    await page.getByTestId('quality-minor').click(); // wrong — it's major
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('falsch');
    await expect(page.getByTestId('score')).toContainText('0 / 1');
  });
});

test.describe('Chord game — notes direction (name shown, place the notes)', () => {
  test('builds C major by picking notes from the menu', async ({ page }) => {
    // 0.5 → direction 'notes'. Root is random, so read it from the prompt.
    await pinRandom(page, 0.5);
    await openChordGame(page);
    await expect(page.getByTestId('prompt')).toContainText('Tönen besteht');

    // With Math.random pinned to 0.5: root index = floor(0.5*12)=6 → F#,
    // type index = floor(0.5*10)=5 → sus4. F#sus4 = F# B C#.
    await page.getByTestId('pick-F#').click();
    await page.getByTestId('pick-B').click();
    await page.getByTestId('pick-C#').click();
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('Richtig');
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('tapping a placed note again removes it', async ({ page }) => {
    await pinRandom(page, 0.5);
    await openChordGame(page);
    await page.getByTestId('pick-F#').click();
    await expect(page.getByTestId('placed-notes')).toContainText('F#');
    // Tapping the same pitch again removes it.
    await page.getByTestId('pick-F#').click();
    await expect(page.getByTestId('placed-notes')).not.toContainText('F#');
  });
});

test.describe('Chord game — theory info panel', () => {
  test('explains how chords are built', async ({ page }) => {
    await openChordGame(page);
    await expect(page.getByTestId('info-panel')).toHaveCount(0);
    await page.getByTestId('info-toggle').click();
    const info = page.getByTestId('info-panel');
    await expect(info).toBeVisible();
    await expect(info).toContainText('Vermindert');
    await expect(info).toContainText('Sus2');
    await expect(info).toContainText('Septakkorde');
  });
});
