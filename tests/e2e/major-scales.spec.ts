import { expect, test, type Page } from '@playwright/test';

// Pins Math.random so the random-mode pick in MajorScales is deterministic.
// 'build' = index 0, 'fill' = 1, 'piano' = 2 → pass 0, 0.4, or 0.8.
async function pinRandom(page: Page, value: number) {
  await page.addInitScript((v) => {
    Math.random = () => v;
  }, value);
}

async function openMajorScales(page: Page) {
  await page.goto('/');
  // Clear persisted Major-Scales settings so each test starts from defaults
  // unless it explicitly sets them. Done after the first goto so the origin
  // is established for localStorage access.
  await page.evaluate(() => {
    try {
      localStorage.removeItem('jsd-majorscales-settings');
    } catch {
      /* ignore */
    }
  });
  await page.getByTestId('nav-lernen').click();
  await expect(page.getByTestId('lernen-menu')).toBeVisible();
  await page.getByTestId('lernen-tile-major-scales').click();
  await expect(page.getByTestId('major-scales')).toBeVisible();
}

// Settings (key + difficulty selectors) live inside a collapsible panel.
// Open it first, then select.
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

async function selectDifficulty(page: Page, difficulty: 'easy' | 'medium' | 'hard') {
  await openSettings(page);
  await page.getByTestId('difficulty-select').selectOption(difficulty);
}

// Returns which mode is currently rendered, inferred from the prompt copy.
async function currentMode(page: Page): Promise<'build' | 'fill' | 'piano'> {
  const text = await page.getByTestId('prompt').innerText();
  if (text.startsWith('Baue')) return 'build';
  if (text.startsWith('Fülle')) return 'fill';
  return 'piano';
}

// Click via .click() on the element directly to bypass Playwright's
// actionability checks. The black piano keys overlay the whites in the
// stacking context, which can confuse pointer-events resolution.
const dispatchClick = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => (el as HTMLElement).click());

test.describe('Lernen menu', () => {
  test('Lernen tab shows the game menu, then opens Major Scales', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-lernen').click();
    await expect(page.getByTestId('lernen-menu')).toBeVisible();
    await expect(page.getByTestId('lernen-tile-major-scales')).toContainText('Dur-Tonleitern');

    await page.getByTestId('lernen-tile-major-scales').click();
    await expect(page.getByTestId('major-scales')).toBeVisible();
    // Mode tabs are intentionally hidden from the user.
    await expect(page.getByTestId('mode-build')).toHaveCount(0);
    await expect(page.getByTestId('mode-fill')).toHaveCount(0);
    await expect(page.getByTestId('mode-piano')).toHaveCount(0);
  });

  test('back button returns from Major Scales to the menu', async ({ page }) => {
    await openMajorScales(page);
    await page.getByTestId('lernen-back').click();
    await expect(page.getByTestId('lernen-menu')).toBeVisible();
  });
});

test.describe('Major Scales — random mode on entry', () => {
  test('opens in build mode when Math.random pins to 0', async ({ page }) => {
    await pinRandom(page, 0);
    await openMajorScales(page);
    expect(await currentMode(page)).toBe('build');
    // Build mode shows the chip picker, not the piano.
    await expect(page.getByTestId('picker')).toBeVisible();
    await expect(page.getByTestId('piano')).toHaveCount(0);
  });

  test('opens in fill mode when Math.random pins to 0.4', async ({ page }) => {
    await pinRandom(page, 0.4);
    await openMajorScales(page);
    expect(await currentMode(page)).toBe('fill');
    // Fill mode reveals some given notes via [data-state="given"].
    const givenCount = await page.locator('[data-state="given"]').count();
    expect(givenCount).toBeGreaterThan(0);
  });

  test('opens in piano mode when Math.random pins to 0.8', async ({ page }) => {
    await pinRandom(page, 0.8);
    await openMajorScales(page);
    expect(await currentMode(page)).toBe('piano');
    await expect(page.getByTestId('piano')).toBeVisible();
    await expect(page.getByTestId('picker')).toHaveCount(0);
  });
});

test.describe('Major Scales — Build mode', () => {
  test.beforeEach(async ({ page }) => {
    await pinRandom(page, 0);
  });

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

  test('correcting a note re-places it in the same slot at the same octave', async ({ page }) => {
    await openMajorScales(page);
    // G major wraps (G A B | C D E F#), so slots 3..6 sit an octave higher
    // than slots 0..2 — a good case to catch octave drift on correction.
    await selectKey(page, 'G');

    // Record every frequency that gets played.
    await page.evaluate(() => {
      const proto = (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
        .prototype;
      const original = proto.createOscillator;
      (window as unknown as { __freqs: number[] }).__freqs = [];
      proto.createOscillator = function patched() {
        const osc = original.call(this);
        const setFreq = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(osc.frequency),
          'value',
        );
        Object.defineProperty(osc.frequency, 'value', {
          set(v: number) {
            (window as unknown as { __freqs: number[] }).__freqs.push(v);
            setFreq?.set?.call(this, v);
          },
          get() {
            return setFreq?.get?.call(this);
          },
        });
        return osc;
      };
    });

    // Fill the whole scale: G A B C D E F#.
    for (const n of ['G', 'A', 'B', 'C', 'D', 'E', 'F#']) {
      await page.getByTestId(`pick-${n}`).click();
    }

    // Frequency of slot 0 (G) when first placed.
    const placedFreqs = await page.evaluate(
      () => (window as unknown as { __freqs: number[] }).__freqs.slice(),
    );
    const firstG = placedFreqs[0];

    // Now correct slot 0: select it explicitly, then place G again.
    await page.evaluate(() => {
      (window as unknown as { __freqs: number[] }).__freqs = [];
    });
    await page.getByTestId('slot-0').click(); // re-selecting plays the old value
    await page.getByTestId('pick-G').click(); // re-placing plays the new value

    const correctionFreqs = await page.evaluate(
      () => (window as unknown as { __freqs: number[] }).__freqs.slice(),
    );
    // Every tone played during the correction must match slot 0's original
    // octave — no jump to the next octave.
    for (const f of correctionFreqs) {
      expect(Math.abs(f - firstG)).toBeLessThan(1);
    }

    // The correction must land in slot 0, not overwrite a later slot.
    await expect(page.getByTestId('slot-0')).toContainText('G');
    await expect(page.getByTestId('slot-6')).toContainText('F#');
  });

  test('a stray picker tap with no slot selected does not overwrite a filled slot', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'G');
    // Fill the whole scale — afterwards no slot is "armed".
    for (const n of ['G', 'A', 'B', 'C', 'D', 'E', 'F#']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    // Tapping a chip without first selecting a slot must not change anything.
    await page.getByTestId('pick-C').click();
    const slots: string[] = [];
    for (let i = 0; i < 7; i++) {
      slots.push((await page.getByTestId(`slot-${i}`).innerText()).trim());
    }
    expect(slots).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#']);
  });

  test('wrong build flags the wrong slots and lets the user retry', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'C');
    // Place D in slot 0 (should be C). The remaining 6 are correct.
    for (const n of ['D', 'D', 'E', 'F', 'G', 'A', 'B']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    await page.getByTestId('check').click();
    // Feedback names how many cells are wrong; doesn't reveal the answer.
    await expect(page.getByTestId('feedback')).toContainText('1 Fehler');
    // Round isn't locked yet — score still 0/0.
    await expect(page.getByTestId('score')).toContainText('0 / 0');
    // The wrong slot is flagged with the .wrong class.
    await expect(page.getByTestId('slot-0')).toHaveClass(/wrong/);

    // The picker is still active. Tap slot 0 to reactivate it, then place C.
    await page.getByTestId('slot-0').click();
    await page.getByTestId('pick-C').click();
    // Red flag clears once the user fixes the cell.
    await expect(page.getByTestId('slot-0')).not.toHaveClass(/wrong/);

    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('Richtig');
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('enharmonic-but-misspelled answers get a yellow warning, not a red error', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'C#');
    // C# major canonical = C# D# E# F# G# A# B#. Place enharmonic but
    // wrongly-spelled equivalents at slot 2 (F instead of E#) and slot 5
    // (Bb instead of A#) — same pitches, different spelling.
    for (const n of ['C#', 'D#', 'F', 'F#', 'G#', 'Bb', 'B#']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    await page.getByTestId('check').click();

    // Right pitches → the round still counts, but it's flagged amber.
    await expect(page.getByTestId('feedback')).toContainText('Fast richtig');
    await expect(page.getByTestId('feedback')).not.toContainText('Fehler');
    // The feedback names what the user wrote and the correct spelling.
    await expect(page.getByTestId('feedback')).toContainText('F → E#');
    await expect(page.getByTestId('feedback')).toContainText('Bb → A#');
    // The misspelled slots are yellow (warn), not red (wrong).
    await expect(page.getByTestId('slot-2')).toHaveClass(/warn/);
    await expect(page.getByTestId('slot-2')).not.toHaveClass(/wrong/);
    await expect(page.getByTestId('slot-5')).toHaveClass(/warn/);
    // The round is solved — score increments.
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('Auflösen finalizes a wrong round as a missed attempt', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'C');
    for (const n of ['D', 'D', 'E', 'F', 'G', 'A', 'B']) {
      await page.getByTestId(`pick-${n}`).click();
    }
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toContainText('Fehler');

    await page.getByTestId('reveal').click();
    await expect(page.getByTestId('feedback')).toContainText('Auflösung');
    await expect(page.getByTestId('score')).toContainText('0 / 1');
  });
});

test.describe('Major Scales — Fill mode', () => {
  test.beforeEach(async ({ page }) => {
    await pinRandom(page, 0.4);
  });

  test('renders some given notes and accepts the reveal button', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'G');

    const givenCount = await page.locator('[data-state="given"]').count();
    expect(givenCount).toBeGreaterThan(0);
    expect(givenCount).toBeLessThan(7);

    await page.getByTestId('reveal').click();
    await expect(page.getByTestId('feedback')).toContainText('Auflösung');
    const slotTexts: string[] = [];
    for (let i = 0; i < 8; i++) {
      slotTexts.push((await page.getByTestId(`slot-${i}`).innerText()).trim());
    }
    // 8 slots — closing tonic G is the bookend so the line resolves.
    expect(slotTexts).toEqual(['G', 'A', 'B', 'C', 'D', 'E', 'F#', 'G']);
  });

  test('Easy difficulty hides 3, Hard hides 6', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'C');

    // 7 scale degrees + closing tonic; closing tonic is always given on top
    // of whatever the difficulty hides.
    await selectDifficulty(page, 'easy');
    await expect(page.locator('[data-state="given"]')).toHaveCount(5);

    await selectDifficulty(page, 'hard');
    await expect(page.locator('[data-state="given"]')).toHaveCount(2);
  });
});

test.describe('Major Scales — Piano mode', () => {
  test.beforeEach(async ({ page }) => {
    await pinRandom(page, 0.8);
  });

  test('correct keys advance, wrong keys flash but do not advance', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'C');
    await expect(page.getByTestId('piano')).toBeVisible();

    await dispatchClick(page, '[data-testid="piano-key-D-1"]');
    await expect(page.getByTestId('feedback')).toContainText('✗');
    await expect(page.getByTestId('slot-0')).toHaveAttribute('data-state', 'active');

    await dispatchClick(page, '[data-testid="piano-key-C-0"]');
    await expect(page.getByTestId('slot-0')).toContainText('C');
    for (const [name, idx] of [
      ['D', 1],
      ['E', 2],
      ['F', 3],
      ['G', 4],
      ['A', 5],
      ['B', 6],
      // Closing C an octave up — finishes the scale on the tonic.
      ['C', 7],
    ] as [string, number][]) {
      await dispatchClick(page, `[data-testid="piano-key-${name}-${idx}"]`);
    }
    await expect(page.getByTestId('feedback')).toContainText('Richtig');
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });

  test('hard difficulty hides all key labels; easy shows them', async ({ page }) => {
    await openMajorScales(page);

    await selectDifficulty(page, 'easy');
    await expect(page.locator('.scale-game__key-label').first()).toBeVisible();

    await selectDifficulty(page, 'hard');
    await expect(page.locator('.scale-game__key-label')).toHaveCount(0);
  });
});

test.describe('Major Scales — settings panel', () => {
  test('settings panel is collapsed by default and shows the current selection in the summary', async ({ page }) => {
    await openMajorScales(page);
    await expect(page.getByTestId('settings-panel')).toHaveCount(0);
    // Default selection is Zufall + Schwer.
    await expect(page.getByTestId('settings-summary')).toContainText('Tonart: Zufall');
    await expect(page.getByTestId('settings-summary')).toContainText('Schwierigkeit: Schwer');
  });

  test('toggling Einstellungen reveals the panel and reflects updates in the summary', async ({ page }) => {
    await openMajorScales(page);
    await page.getByTestId('settings-toggle').click();
    await expect(page.getByTestId('settings-panel')).toBeVisible();

    await page.getByTestId('key-select').selectOption('D');
    await page.getByTestId('difficulty-select').selectOption('hard');

    await expect(page.getByTestId('settings-summary')).toContainText('Tonart: D');
    await expect(page.getByTestId('settings-summary')).toContainText('Schwierigkeit: Schwer');
  });

  test('settings persist across reload via localStorage', async ({ page }) => {
    await openMajorScales(page);
    await selectKey(page, 'A');
    await selectDifficulty(page, 'easy');

    // Reload — settings should be restored from localStorage.
    await page.reload();
    await page.getByTestId('nav-lernen').click();
    await page.getByTestId('lernen-tile-major-scales').click();

    await expect(page.getByTestId('settings-summary')).toContainText('Tonart: A');
    await expect(page.getByTestId('settings-summary')).toContainText('Schwierigkeit: Leicht');
  });
});

test.describe('Major Scales — theory info panel', () => {
  test('explains the major-scale build rule, collapsed by default', async ({ page }) => {
    await openMajorScales(page);
    // The toggle is offered, panel collapsed.
    await expect(page.getByTestId('info-toggle')).toBeVisible();
    await expect(page.getByTestId('info-panel')).toHaveCount(0);

    await page.getByTestId('info-toggle').click();
    const info = page.getByTestId('info-panel');
    await expect(info).toBeVisible();
    await expect(info).toContainText('Schrittfolge');
    await expect(info).toContainText('Quintenzirkel');
  });

  test('the info panel stays available in the easy difficulty', async ({ page }) => {
    await openMajorScales(page);
    await selectDifficulty(page, 'easy');
    await expect(page.getByTestId('info-toggle')).toBeVisible();
  });
});

test.describe('Major Scales — auto-advance after piano win', () => {
  test('shows the Nächste Tonleiter button with countdown and auto-fires a new round', async ({ page }) => {
    await pinRandom(page, 0.8); // piano mode
    await openMajorScales(page);
    await selectKey(page, 'C');

    // Play C major top to bottom on the piano.
    for (const [name, idx] of [
      ['C', 0],
      ['D', 1],
      ['E', 2],
      ['F', 3],
      ['G', 4],
      ['A', 5],
      ['B', 6],
      ['C', 7],
    ] as [string, number][]) {
      await dispatchClick(page, `[data-testid="piano-key-${name}-${idx}"]`);
    }

    // Countdown button appears.
    await expect(page.getByTestId('next-scale')).toBeVisible();
    await expect(page.getByTestId('next-countdown')).toContainText('(5)');

    // Tick down — assert it gets to (4) within ~2s.
    await expect(page.getByTestId('next-countdown')).toContainText('(4)', { timeout: 2000 });

    // Wait for auto-fire — round resets, countdown disappears.
    await expect(page.getByTestId('next-scale')).toHaveCount(0, { timeout: 8000 });
  });

  test('clicking the Nächste Tonleiter button starts a new round immediately', async ({ page }) => {
    await pinRandom(page, 0.8);
    await openMajorScales(page);
    await selectKey(page, 'C');

    for (const [name, idx] of [
      ['C', 0],
      ['D', 1],
      ['E', 2],
      ['F', 3],
      ['G', 4],
      ['A', 5],
      ['B', 6],
      ['C', 7],
    ] as [string, number][]) {
      await dispatchClick(page, `[data-testid="piano-key-${name}-${idx}"]`);
    }

    await expect(page.getByTestId('next-scale')).toBeVisible();
    await page.getByTestId('next-scale').click();
    await expect(page.getByTestId('next-scale')).toHaveCount(0);
    // Score still shows the win recorded.
    await expect(page.getByTestId('score')).toContainText('1 / 1');
  });
});

test.describe('Major Scales — audio on click', () => {
  // The Web Audio API can't actually play in headless Chromium without a
  // user gesture and even then it's silent in CI. We assert that an
  // OscillatorNode is constructed when the user clicks a note — that's the
  // observable signal that playback was initiated.
  test('clicking a picker chip starts an oscillator', async ({ page }) => {
    await pinRandom(page, 0); // build mode → picker visible
    await openMajorScales(page);

    // Wrap createOscillator on the AudioContext prototype to count calls.
    await page.evaluate(() => {
      const proto = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
        .prototype;
      const original = proto.createOscillator;
      (window as unknown as { __oscCount: number }).__oscCount = 0;
      proto.createOscillator = function patched() {
        (window as unknown as { __oscCount: number }).__oscCount += 1;
        return original.call(this);
      };
    });

    await page.getByTestId('pick-C').click();
    const count = await page.evaluate(
      () => (window as unknown as { __oscCount: number }).__oscCount,
    );
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a piano key starts an oscillator', async ({ page }) => {
    await pinRandom(page, 0.8); // piano mode
    await openMajorScales(page);
    await expect(page.getByTestId('piano')).toBeVisible();

    await page.evaluate(() => {
      const proto = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
        .prototype;
      const original = proto.createOscillator;
      (window as unknown as { __oscCount: number }).__oscCount = 0;
      proto.createOscillator = function patched() {
        (window as unknown as { __oscCount: number }).__oscCount += 1;
        return original.call(this);
      };
    });

    await dispatchClick(page, '[data-testid="piano-key-C-0"]');
    const count = await page.evaluate(
      () => (window as unknown as { __oscCount: number }).__oscCount,
    );
    expect(count).toBeGreaterThan(0);
  });
});
