import { test, expect } from '@playwright/test';

async function openArcade(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'ARCADE', exact: true }).click();
  await expect(page.getByRole('heading', { name: /THREE IN A ROW/ })).toBeVisible();
}

const cell = (page: import('@playwright/test').Page, index: number) => page.getByRole('button', { name: new RegExp(`^Square ${index + 1}\\b`) });

test('arcade is reachable from the hub and starts with an empty board', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'ARCADE', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /PLAY 3 IN A ROW/ }).click();
  await expect(page.getByRole('heading', { name: /THREE IN A ROW/ })).toBeVisible();
  await expect(page.locator('.ttt-cell')).toHaveCount(9);
  await expect(page.locator('.ttt-cell[disabled]')).toHaveCount(0);
  await expect(page.locator('.ttt-status')).toContainText('YOUR MOVE');
  for (let index = 0; index < 9; index++) {
    await expect(cell(page, index)).toHaveAccessibleName(new RegExp(`Square ${index + 1}, empty`));
  }
  await expect(page.locator('.ttt-score-cells')).toContainText('WINS');
});

test('the CPU answers every human move and blocks a win', async ({ page }) => {
  await openArcade(page);
  await page.getByRole('button', { name: 'IMPOSSIBLE' }).click();

  await cell(page, 0).click();
  await expect(page.locator('.ttt-cell.is-x')).toHaveCount(1);
  await expect(page.locator('.ttt-cell.is-o')).toHaveCount(1, { timeout: 5_000 });

  // Build a trap: X at 0 already, so take 1 to threaten 2.
  await cell(page, 1).click();
  await expect(page.locator('.ttt-cell.is-o')).toHaveCount(2, { timeout: 5_000 });
  // A perfect opponent must occupy square 2 to survive.
  await expect(cell(page, 2)).toHaveAccessibleName(/Square 3, O/);
  await expect(page.locator('.ttt-status')).toContainText('YOUR MOVE');
});

test('a completed line is announced, scored locally and can be replayed', async ({ page }) => {
  await openArcade(page);
  await page.getByRole('button', { name: '2 PLAYERS' }).click();

  for (const index of [0, 3, 1, 4, 2]) await cell(page, index).click();

  await expect(page.locator('.ttt-status')).toContainText('TAKES THE ROUND');
  await expect(page.locator('.ttt-strike')).toBeVisible();
  await expect(page.locator('.ttt-cell.is-winning')).toHaveCount(3);
  await expect(page.locator('.ttt-cell[disabled]')).toHaveCount(9);

  await page.getByRole('button', { name: /PLAY AGAIN/ }).click();
  await expect(page.locator('.ttt-cell[disabled]')).toHaveCount(0);
  await expect(page.locator('.ttt-cell.is-x')).toHaveCount(0);
});

test('scores persist across a reload and R restarts the board', async ({ page }) => {
  await openArcade(page);
  await page.getByRole('button', { name: '2 PLAYERS' }).click();
  for (const index of [0, 3, 1, 4, 2]) await cell(page, index).click();
  await expect(page.locator('.ttt-strike')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'ARCADE', exact: true }).click();
  await expect(page.locator('.ttt-score-cells')).toContainText('WINS');
  await expect(page.locator('.ttt-score-foot')).toContainText('ROUND');

  await page.getByRole('button', { name: '2 PLAYERS' }).click();
  await cell(page, 4).click();
  await expect(page.locator('.ttt-cell.is-x')).toHaveCount(1);
  await page.keyboard.press('r');
  await expect(page.locator('.ttt-cell.is-x')).toHaveCount(0);
});

test('the arcade fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openArcade(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'CPU' })).toBeVisible();
  await cell(page, 4).click();
  await expect(page.locator('.ttt-cell.is-o')).toHaveCount(1, { timeout: 5_000 });
});
