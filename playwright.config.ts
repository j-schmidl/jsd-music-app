import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// A continuous 440 Hz sine fed to Chromium's fake mic, so recording captures real
// signal and the live "Ausschlag" oscilloscope reliably deflects (the built-in
// fake device only beeps intermittently and makes the assertion flaky).
const FAKE_MIC_WAV = fileURLToPath(new URL('./tests/fixtures/fake-mic-sine.wav', import.meta.url));

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // Chromium with a mobile viewport — matches the mobile-first design, and only requires
      // the Chromium browser (WebKit/Safari would need `npx playwright install webkit`).
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        // Auto-grant the mic and feed a synthetic input stream so the recorder
        // (and tuner) can be exercised end-to-end headless. The fake device emits
        // a periodic tone, so the live "Ausschlag" oscilloscope actually deflects.
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}`,
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
