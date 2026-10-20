import { test, expect, type Page } from '@playwright/test';

/** Boot the app with pre-cheap rendering and no external audio so CI stays quick. */
async function boot(page: Page, overrides: Record<string, unknown> = {}) {
  await page.addInitScript((prefs) => {
    // Seed once per test, never on reloads, so saved preferences can be asserted.
    if (!window.localStorage.getItem('redline-prefs-v1')) {
      window.localStorage.setItem('redline-prefs-v1', JSON.stringify(prefs));
    }
  }, { driver: 'NIGHT DRIVER', quality: 'low', shake: true, ...overrides });
  await page.goto('/');
}

async function startRace(page: Page) {
  await page.getByRole('button', { name: /START RACE/ }).first().click();
  await expect(page.locator('canvas[data-racer]')).toBeVisible();
}

const phase = (page: Page) => page.locator('.race-screen').getAttribute('data-phase');
const speed = async (page: Page) => Number(await page.locator('.race-screen').getAttribute('data-speed'));

test('hub shows the 3D race setup and stores driver preferences', async ({ page }) => {
  await boot(page);
  await expect(page.getByRole('heading', { name: /CHASE THE REDLINE/ })).toBeVisible();
  await expect(page.locator('.hero-live-badge')).toContainText('LIVE 3D ENGINE');
  await expect(page.locator('.track-card')).toContainText('TOKYO AFTERDARK');
  await expect(page.locator('.start-card')).toContainText('START RACE');

  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'YOUR DRIVING STYLE.' });
  await expect(dialog).toBeVisible();
  await page.getByRole('textbox', { name: 'Driver name' }).fill('MIDNIGHT RUNNER');
  await page.getByRole('button', { name: 'LOW', exact: true }).click();
  await page.getByRole('switch', { name: 'Camera shake' }).click();
  await page.getByRole('button', { name: 'DONE' }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('textbox', { name: 'Driver name' })).toHaveValue('MIDNIGHT RUNNER');
  await expect(page.getByRole('button', { name: 'LOW', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('switch', { name: 'Camera shake' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: 'HIGH', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('a live 3D run accelerates, boosts, pauses and restarts cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await boot(page);
  await startRace(page);
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('racing');

  await page.keyboard.down('w');
  await expect.poll(() => speed(page), { timeout: 60_000 }).toBeGreaterThan(60);
  const scoreAtSpeed = Number(await page.locator('[data-hud="score"]').innerText().then(text => text.replace(/,/g, '')));
  expect(scoreAtSpeed).toBeGreaterThan(0);
  await expect(page.locator('[data-hud="time"]')).not.toHaveText('00:00');
  expect(await page.locator('canvas[data-racer]').count()).toBe(1);

  await page.keyboard.down('Shift');
  await expect(page.locator('.race-screen')).toHaveClass(/is-boosting/);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');

  await page.keyboard.press('p');
  const pauseDialog = page.getByRole('dialog', { name: 'Race paused' });
  await expect(pauseDialog).toBeVisible();
  const timeWhilePaused = await page.locator('[data-hud="time"]').innerText();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-hud="time"]')).toHaveText(timeWhilePaused);
  await page.getByRole('button', { name: /RESUME RUN/ }).click();
  await expect(pauseDialog).toBeHidden();

  await page.keyboard.press('r');
  await expect(page.locator('.race-screen')).toHaveAttribute('data-phase', 'countdown');
  await expect(page.locator('[data-hud="score"]')).toHaveText('0');
  expect(await page.locator('canvas[data-racer]').count()).toBe(1);
  expect(errors).toEqual([]);
});

test('hitting the barrier ends the run, banks a personal best, and restarts', async ({ page }) => {
  await boot(page);
  await startRace(page);
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('racing');

  await page.keyboard.down('w');
  await expect.poll(() => speed(page), { timeout: 60_000 }).toBeGreaterThan(125);
  await page.keyboard.down('a');
  await expect.poll(() => phase(page), { timeout: 30_000 }).toBe('over');
  await page.keyboard.up('a');
  await page.keyboard.up('w');

  const result = page.getByRole('dialog', { name: 'Race over' });
  await expect(result).toBeVisible();
  await expect(result.locator('h2')).toHaveText('WRECKED.');
  await expect(result).toContainText('RUN SCORE');
  await expect(result.locator('.race-record')).toContainText('NEW PERSONAL BEST');

  const stored = await page.evaluate(() => ({
    best: Number(window.localStorage.getItem('redline-best-v1')),
    stats: JSON.parse(window.localStorage.getItem('redline-stats-v1') ?? '{}'),
  }));
  expect(stored.best).toBeGreaterThan(0);
  expect(stored.stats.runs).toBe(1);
  expect(stored.stats.crashes).toBe(1);
  expect(stored.stats.topSpeed).toBeGreaterThan(100);

  await page.getByRole('button', { name: /RACE AGAIN/ }).click();
  await expect(page.locator('.race-screen')).toHaveAttribute('data-phase', 'countdown');
});

test('records page reports the last run, the best score and lifetime stats', async ({ page }) => {
  await boot(page);
  await startRace(page);
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('racing');
  await page.keyboard.down('w');
  await expect.poll(() => speed(page), { timeout: 60_000 }).toBeGreaterThan(125);
  await page.keyboard.down('a');
  await expect.poll(() => phase(page), { timeout: 30_000 }).toBe('over');
  await page.keyboard.up('a');
  await page.keyboard.up('w');

  await page.getByRole('button', { name: /BACK TO STREETS/ }).click();
  await expect(page.getByRole('heading', { name: /CHASE THE REDLINE/ })).toBeVisible();
  await expect(page.locator('.header-right')).toContainText('BEST');

  await page.getByRole('button', { name: 'RECORDS' }).click();
  await expect(page.getByRole('heading', { name: /STREET LEGENDS/ })).toBeVisible();
  await expect(page.locator('.records-stats')).toContainText('RUNS');
  await expect(page.locator('.recent-runs li')).toHaveCount(1);
  await expect(page.locator('.recent-runs li').first()).toContainText('PTS');
  const best = Number(await page.evaluate(() => window.localStorage.getItem('redline-best-v1')));
  expect(best).toBeGreaterThan(0);
  await expect(page.locator('.record-card')).toContainText(best.toLocaleString('en-US'));
});

test('garage presents the machine spec and launches a run', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'GARAGE' }).click();
  await expect(page.getByRole('heading', { name: /BUILT FOR THE NIGHT/ })).toBeVisible();
  await expect(page.locator('.garage-car')).toContainText('VORTEX GT');
  await expect(page.locator('.car-facts')).toContainText('TWIN-TURBO');
  await page.getByRole('button', { name: /TAKE IT TO THE STREETS/ }).click();
  await expect(page.locator('.race-screen')).toBeVisible();
  await expect(page.locator('canvas[data-racer]')).toBeVisible({ timeout: 30_000 });
});

test('mobile hub does not overflow and the on-screen pedals drive the car', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await startRace(page);
  await expect.poll(() => phase(page), { timeout: 60_000 }).toBe('racing');
  const gas = page.getByRole('button', { name: 'Accelerate' });
  await expect(gas).toBeVisible();
  const box = await gas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect.poll(() => speed(page), { timeout: 45_000 }).toBeGreaterThan(25);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Steer left' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Brake' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nitro boost' })).toBeVisible();
});
