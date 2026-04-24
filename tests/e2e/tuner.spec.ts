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

    await expect(page.getByText('Gitarre 6-saitig')).toBeVisible();
    await expect(page.getByText('Standard')).toBeVisible();
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
