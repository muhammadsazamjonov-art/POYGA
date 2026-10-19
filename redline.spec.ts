import { test, expect } from '@playwright/test';

test('race hub, circuit selection, and bounded opponent configuration', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'CHASE THE REDLINE.' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Number of AI opponents' })).toHaveValue('7');
  await page.getByRole('slider').fill('30');
  await expect(page.locator('.opponent-slider strong')).toContainText('30');
  await page.getByRole('combobox', { name: 'AI difficulty' }).selectOption('elite');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.circuit-control').click();
  await page.getByRole('button', { name: /Neon Harbor/ }).click();
  await expect(page.locator('.circuit-control')).toContainText('Neon Harbor');
  await expect(page.locator('.race-start-button')).toContainText('10,800');
});

test('216-car shop is searchable, class-filterable, and cannot spend unearned credits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'EXPLORE GARAGE' }).click();
  await expect(page.locator('.catalog-caption')).toContainText('216 MACHINES');
  await expect(page.locator('.car-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Class S', exact: true }).click();
  await expect(page.locator('.catalog-caption')).toContainText('54 MACHINES');
  await page.getByRole('textbox', { name: 'Search cars' }).fill('Obsidian');
  await expect(page.locator('.car-card')).toHaveCount(3);
  await page.locator('.car-card').first().click();
  await expect(page.getByRole('button', { name: /CR MORE NEEDED/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Owned (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.car-card')).toHaveCount(1);
  await expect(page.locator('.car-card')).toContainText('Vortex GT');
});

test('preferences and driver name survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Driver name' }).fill('NIGHT DRIVER');
  await page.getByRole('heading', { name: 'YOUR DRIVING STYLE.' }).click();
  await page.getByRole('switch', { name: 'Auto-accelerate', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Auto-accelerate', exact: true })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Driver name' })).toHaveValue('NIGHT DRIVER');
  await expect(page.getByRole('switch', { name: 'Auto-accelerate', exact: true })).toHaveAttribute('aria-checked', 'false');
});

test('local economy only credits wins and deduplicates recorded results', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // Exercise the real progression reducer without a forged production UI control.
    const { recordResult, defaultProfile } = await import('/src/game/storage.ts');
    const { CARS } = await import('/src/game/catalog.ts');
    const run = { id: 'test-loss', date: new Date().toISOString(), carId: 0, track: 'tokyo', position: 2, racers: 8, score: 2000, time: 60, won: false, wrecked: false, reward: 5000, laps: 2 };
    const loss = recordResult(structuredClone(defaultProfile), run);
    const win = { ...run, id: 'test-win', position: 1, won: true };
    const first = recordResult(loss, win);
    const duplicate = recordResult(first, win);
    return { lossCredits: loss.credits, winCredits: first.credits, duplicateCredits: duplicate.credits, races: duplicate.races, count: CARS.length, ids: new Set(CARS.map((car: { id: number }) => car.id)).size };
  });
  expect(result).toEqual({ lossCredits: 0, winCredits: 5000, duplicateCredits: 5000, races: 2, count: 216, ids: 216 });
});

test('live WebGL race starts, accelerates, pauses, and instantly restarts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('redline-profile-v1')!);
    profile.settings.quality = 'low';
    localStorage.setItem('redline-profile-v1', JSON.stringify(profile));
  });
  await page.reload();
  await page.getByRole('button', { name: 'QUICK RACE', exact: true }).click();
  await expect(page.locator('.game-canvas canvas')).toBeVisible();
  await expect(page.locator('.race-screen')).toHaveAttribute('data-phase', 'racing', { timeout: 30_000 });
  await expect.poll(async () => Number(await page.locator('.race-screen').getAttribute('data-speed')), { timeout: 20_000 }).toBeGreaterThan(35);
  await page.keyboard.down('Shift');
  await expect(page.locator('.race-screen')).toHaveClass(/is-boosting/);
  await page.keyboard.up('Shift');
  await page.getByRole('button', { name: 'Pause race', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'TAKE A BREATHER.' })).toBeVisible();
  const time = await page.locator('.race-time strong').innerText();
  await page.waitForTimeout(400);
  expect(await page.locator('.race-time strong').innerText()).toBe(time);
  await page.getByRole('button', { name: 'BACK TO THE STREETS' }).click();
  await expect(page.getByRole('heading', { name: 'TAKE A BREATHER.' })).toBeHidden();
  await page.keyboard.press('r');
  await expect(page.locator('.race-screen')).toHaveAttribute('data-phase', 'countdown');
  await expect(page.locator('.game-canvas canvas')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('mobile hub has no overflow and touch pedals control the race', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'QUICK RACE', exact: true }).click();
  await expect(page.locator('.race-screen')).toHaveAttribute('data-phase', 'racing', { timeout: 30_000 });
  const boost = page.getByRole('button', { name: 'Nitro boost', exact: true });
  await expect(boost).toBeVisible();
  const box = await boost.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect(page.locator('.race-screen')).toHaveClass(/is-boosting/);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Steer left' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Brake', exact: true })).toBeVisible();
});

test('a real win banks credits, buys a car, and persists the leaderboard', async ({ page }) => {
  test.setTimeout(110_000);
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto('/');
  await page.evaluate(() => {
    const profile = JSON.parse(localStorage.getItem('redline-profile-v1')!);
    profile.settings.quality = 'low';
    profile.settings.sound = false;
    localStorage.setItem('redline-profile-v1', JSON.stringify(profile));
  });
  await page.reload();
  await page.getByRole('slider', { name: 'Number of AI opponents' }).fill('1');
  await page.getByRole('combobox', { name: 'AI difficulty' }).selectOption('rookie');
  await page.getByRole('button', { name: 'QUICK RACE', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Race results' })).toBeVisible({ timeout: 85_000 });
  await expect(page.locator('.race-result')).toHaveClass(/victory/);
  await expect(page.locator('.result-reward')).toContainText('+1,728 CR');
  await page.getByRole('button', { name: 'BACK TO HUB' }).click();
  await expect(page.locator('.header-credits')).toContainText('1,728');
  await page.getByRole('button', { name: 'EXPLORE GARAGE' }).click();
  await page.locator('.car-card').nth(1).click();
  await page.getByRole('button', { name: 'BUY & EQUIP' }).click();
  await expect(page.locator('.header-credits')).toContainText('128');
  await expect(page.locator('.garage-current h3')).toHaveText('Vortex S');
  await page.reload();
  await page.getByRole('button', { name: 'LEADERBOARD', exact: true }).click();
  await expect(page.locator('.score-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.score-table')).toContainText('1ST PLACE');
  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('redline-profile-v1')!));
  expect(profile.credits).toBe(128);
  expect(profile.owned).toEqual([0, 1]);
  expect(profile.wins).toBe(1);
});

test('a real wall crash saves a zero-credit DNF and can instantly restart', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto('/');
  await page.getByRole('button', { name: 'QUICK RACE', exact: true }).click();
  await expect.poll(async () => Number(await page.locator('.race-screen').getAttribute('data-speed')), { timeout: 30_000 }).toBeGreaterThan(100);
  await page.keyboard.down('a');
  await expect(page.getByRole('heading', { name: 'WRECKED.', exact: true })).toBeVisible({ timeout: 20_000 });
  await page.keyboard.up('a');
  await expect(page.locator('.result-reward')).toContainText('0 CR');
  const profile = await page.evaluate(() => JSON.parse(localStorage.getItem('redline-profile-v1')!));
  expect(profile.credits).toBe(0);
  expect(profile.scores[0].wrecked).toBe(true);
  await page.getByRole('button', { name: /RACE AGAIN/ }).click();
  await expect(page.locator('.race-screen')).toHaveAttribute('data-phase', 'countdown');
});