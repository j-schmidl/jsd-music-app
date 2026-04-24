import { expect, test } from '@playwright/test';

test.describe('jsd guitar tuner — page shell', () => {
  test('renders the header, wordmark, AUTOM. switch and all 6 string buttons', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/jsd Guitar Tuner/i);
    await expect(page.getByTestId('wordmark')).toHaveText('jsd');
    await expect(page.getByTestId('auto-switch')).toBeVisible();

    for (const id of ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']) {
      await expect(page.getByTestId(`string-${id}`)).toBeVisible();
    }

    await expect(page.getByText('Gitarre 6-saitig')).toBeVisible();
    await expect(page.getByText('Standard')).toBeVisible();
    await expect(page.getByTestId('tuner-start')).toBeVisible();
  });

  test('bottom nav shows 5 tabs with Stimmen active', async ({ page }) => {
    await page.goto('/');
    for (const id of ['songs', 'tools', 'stimmen', 'lernen', 'einstellungen']) {
      await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('nav-stimmen')).toHaveAttribute('aria-current', 'page');
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

test.describe('tuner indicator', () => {
  test('shows the mic activation button before listening and the prompt after starting (or an error)', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await page.goto('/');

    const start = page.getByTestId('tuner-start');
    await expect(start).toBeVisible();

    await start.click();

    // Headless Chromium has no real mic, so either the listening prompt appears (fake device enabled)
    // or the tuner enters the error state. Either path proves the start handler fired.
    const state = page.getByTestId('tuner');
    await expect(state).toHaveAttribute('data-state', /(listening|error)/, { timeout: 5000 });
  });
});
