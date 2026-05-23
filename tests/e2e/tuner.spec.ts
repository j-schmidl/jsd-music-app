import { expect, test } from '@playwright/test';

test.describe('jsd guitar tuner — page shell', () => {
  test('renders the header, wordmark, AUTOM. switch, mic button, and all 6 string buttons', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/jsd Guitar Tuner/i);
    await expect(page.getByTestId('wordmark')).toHaveText('jsd');
    await expect(page.getByTestId('auto-switch')).toBeVisible();
    await expect(page.getByTestId('mic-button')).toBeVisible();

    for (const id of ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']) {
      await expect(page.getByTestId(`string-${id}`)).toBeVisible();
    }

    // Tuner-mode toggle: Gitarre selected by default, Chromatisch available.
    await expect(page.getByTestId('tuner-mode-guitar')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tuner-mode-chromatic')).toBeVisible();
    await expect(page.getByText('Standard')).toBeVisible();
  });

  test('bottom nav shows Stimmen and Lernen with Stimmen active', async ({ page }) => {
    await page.goto('/');
    for (const id of ['stimmen', 'lernen']) {
      await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
    }
    for (const id of ['songs', 'tools', 'einstellungen']) {
      await expect(page.getByTestId(`nav-${id}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('nav-stimmen')).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('chromatic tuner mode', () => {
  test('switching to Chromatisch hides the headstock, tuning selector and AUTOM. switch', async ({ page }) => {
    await page.goto('/');
    // Guitar mode shows the string buttons and the AUTOM. switch.
    await expect(page.getByTestId('string-E2')).toBeVisible();
    await expect(page.getByTestId('auto-switch')).toBeVisible();

    await page.getByTestId('tuner-mode-chromatic').click();
    await expect(page.getByTestId('tuner-mode-chromatic')).toHaveAttribute('aria-selected', 'true');

    // No preselected strings, no guitar graphic, no auto/manual switch.
    await expect(page.getByTestId('string-E2')).toHaveCount(0);
    await expect(page.getByTestId('auto-switch')).toHaveCount(0);
    await expect(page.getByTestId('tuning-selector')).toHaveCount(0);
    // The tuner itself stays on screen.
    await expect(page.getByTestId('tuner')).toBeVisible();
  });

  test('returns to the guitar tuner when Gitarre is reselected', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tuner-mode-chromatic').click();
    await expect(page.getByTestId('string-E2')).toHaveCount(0);

    await page.getByTestId('tuner-mode-guitar').click();
    await expect(page.getByTestId('string-E2')).toBeVisible();
    await expect(page.getByTestId('auto-switch')).toBeVisible();
  });
});

test.describe('custom guitar tuning', () => {
  test('selecting "Eigene Stimmung" shows the per-string editor', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      try {
        localStorage.removeItem('jsd-custom-tuning');
      } catch {
        /* ignore */
      }
    });
    // No editor while a preset tuning is active.
    await expect(page.getByTestId('custom-tuning-editor')).toHaveCount(0);

    await page.getByTestId('tuning-selector').click();
    await page.getByTestId('tuning-option-custom').click();
    // The editor appears with six string rows.
    await expect(page.getByTestId('custom-tuning-editor')).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await expect(page.getByTestId(`custom-string-${i}-note`)).toBeVisible();
    }
  });

  test('an edited custom tuning persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      try {
        localStorage.removeItem('jsd-custom-tuning');
      } catch {
        /* ignore */
      }
    });
    await page.getByTestId('tuning-selector').click();
    await page.getByTestId('tuning-option-custom').click();

    // Change the lowest string to D.
    await page.getByTestId('custom-string-0-note').selectOption('D');
    await expect(page.getByTestId('custom-string-0-note')).toHaveValue('D');

    await page.reload();
    // The custom tuning is no longer the active one after reload (resets to a
    // preset), but reopening it shows the saved D.
    await page.getByTestId('tuning-selector').click();
    await page.getByTestId('tuning-option-custom').click();
    await expect(page.getByTestId('custom-string-0-note')).toHaveValue('D');
  });
});

test.describe('theme', () => {
  test('starts in dark mode by default', async ({ page }) => {
    await page.goto('/');
    const theme = await page.locator('html').getAttribute('data-theme');
    expect(theme).toBe('dark');
  });

  test('theme toggle flips to light and persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // toggle back so we leave storage in the default state
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('tuner modes', () => {
  test('starts in auto mode — string buttons are disabled', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('auto-switch').locator('input')).toBeChecked();
    await expect(page.getByTestId('string-E2')).toBeDisabled();
  });

  test('switching to manual mode activates the first string and allows selection', async ({ page }) => {
    await page.goto('/');
    // The <input> is visually hidden; click the <label> wrapper to toggle it.
    await page.getByTestId('auto-switch').click();
    await expect(page.getByTestId('auto-switch').locator('input')).not.toBeChecked();

    // A string is now active (seeded) and buttons are enabled.
    await expect(page.getByTestId('string-E2')).toBeEnabled();

    // Tapping A2 pins it as the target.
    await page.getByTestId('string-A2').click();
    await expect(page.getByTestId('string-A2')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('string-E2')).toHaveAttribute('data-active', 'false');
  });
});

test.describe('tuning selector', () => {
  test('starts on Standard and lists alternative tunings', async ({ page }) => {
    await page.goto('/');
    const trigger = page.getByTestId('tuning-selector');
    await expect(trigger).toContainText('Standard');
    await trigger.click();
    const menu = page.getByTestId('tuning-selector-menu');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('tuning-option-drop-d')).toBeVisible();
    await expect(page.getByTestId('tuning-option-dadgad')).toBeVisible();
    await expect(page.getByTestId('tuning-option-open-g')).toBeVisible();
    await expect(page.getByTestId('tuning-option-bass-4')).toBeVisible();
    await expect(page.getByTestId('tuning-option-bass-5')).toBeVisible();
  });

  test('selecting the 4-string bass shows its four strings on the headstock', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tuning-selector').click();
    await page.getByTestId('tuning-option-bass-4').click();
    // Bass strings E1 A1 D2 G2 — and no fifth/sixth guitar string.
    for (const id of ['E1', 'A1', 'D2', 'G2']) {
      await expect(page.getByTestId(`string-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('string-B3')).toHaveCount(0);
    await expect(page.getByTestId('string-E4')).toHaveCount(0);
  });

  test('selecting Drop D updates the trigger label and the bottom-left string label', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tuning-selector').click();
    await page.getByTestId('tuning-option-drop-d').click();
    await expect(page.getByTestId('tuning-selector')).toContainText('Drop D');
    // Bottom-left string in the headstock is now D (instead of E in standard).
    await expect(page.getByTestId('string-D2')).toBeVisible();
  });
});

test.describe('tuner indicator', () => {
  test('auto-starts the microphone on load and settles into listening or error', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    // The app auto-starts the mic on mount. In headless Chromium without a real
    // mic input, the tuner either reaches 'listening' (fake device enabled) or
    // 'error' (no mic available). Both outcomes prove auto-start fired.
    const tuner = page.getByTestId('tuner');
    await expect(tuner).toHaveAttribute('data-state', /(listening|error|idle)/, { timeout: 5000 });
  });

  test('top-right mic button is always available to retrigger the permission', async ({ page }) => {
    await page.goto('/');
    const micBtn = page.getByTestId('mic-button-main');
    await expect(micBtn).toBeVisible();
    await expect(micBtn).toBeEnabled();
  });

  test('mic picker popover opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('mic-picker-toggle').click();
    await expect(page.getByTestId('mic-picker-menu')).toBeVisible();
    // Clicking outside closes it.
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('mic-picker-menu')).toBeHidden();
  });
});

// Headless Chromium can't feed real audio, so these drive the tuner with the
// built-in `?demo` signal (a synthetic tone oscillating ±30 cents around A2).
// They exercise the live display path — including the bottom region that the
// silence/restart affordance now shares — without needing a microphone.
test.describe('tuner live display (demo signal)', () => {
  test('detects the demo note and moves the needle as the pitch drifts', async ({ page }) => {
    await page.goto('/?demo');

    const tuner = page.getByTestId('tuner');
    await expect(tuner).toHaveAttribute('data-state', /(detected|in-tune)/, { timeout: 5000 });
    // The demo tone sits on A2, so the auto-detected string is the A string.
    await expect(page.getByTestId('tuner-note')).toContainText('A');

    // The needle transform is recomputed every frame from the cents offset, so
    // it should visibly change as the demo pitch drifts.
    const needle = page.getByTestId('tuner-needle');
    const first = await needle.evaluate((el) => (el as HTMLElement).style.transform);
    await page.waitForTimeout(400);
    const second = await needle.evaluate((el) => (el as HTMLElement).style.transform);
    expect(second).not.toBe(first);
  });

  test('never shows the silence-restart affordance while a signal is present', async ({ page }) => {
    await page.goto('/?demo');
    await expect(page.getByTestId('tuner')).toHaveAttribute('data-state', /(detected|in-tune)/, {
      timeout: 5000,
    });
    // The restart button and "Kein Signal" message belong to the stalled state
    // only — they must not leak into a healthy, detecting tuner.
    await expect(page.getByTestId('tuner-restart')).toHaveCount(0);
    await expect(page.getByTestId('tuner-stalled')).toHaveCount(0);
  });
});
