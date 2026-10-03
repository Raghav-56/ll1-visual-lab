import { test, expect } from '@playwright/test';

test.use({ video: 'on' });

test('table construction places both alternatives into the conflicting cell', async ({ page }, testInfo) => {
  await page.goto('./?example=first-follow');
  await page.getByText('Build the table step by step', { exact: true }).click();
  const cell = page.locator('#build-table [data-build-lhs="A"][data-build-token="a"]');
  await expect(cell).toHaveText('∅');
  await page.locator('#build-next').click();
  await expect(page.locator('#build-progress')).toHaveText('1 / 3 entries');
  await expect(page.locator('#build-table [data-build-lhs="S"][data-build-token="a"]')).toHaveText('p1');
  await page.locator('#build-next').click();
  await expect(cell).toHaveText('p2');
  await page.locator('#build-next').click();
  await expect(cell.locator('.placed-production')).toHaveText(['p2', 'p3']);
  await expect(page.locator('#build-message')).toHaveText('Placed p3 in M[A, a]. The cell now has 2 productions. This is a conflict.');
  await expect(page.locator('#build-progress')).toHaveText('3 / 3 entries');
  await page.locator('#build-prev').click();
  await expect(cell).toHaveText('p2');
  await page.locator('#build-reset').click();
  await expect(cell).toHaveText('∅');
  await expect(page.locator('#build-progress')).toHaveText('0 / 3 entries');
  await page.locator('#build-play').click();
  await expect(cell.locator('.placed-production')).toHaveText(['p2', 'p3']);
  await expect(page.locator('#build-play')).toHaveText('Play');
  await page.locator('#table-construction').screenshot({ path: `artifacts/${testInfo.project.name}-table-construction.png`, animations: 'disabled' });
  const video = page.video();
  await page.close();
  await video.saveAs(`artifacts/${testInfo.project.name}-table-motion.webm`);
});

test('matching consumes the moving input token and reset cancels a pending step', async ({ page }) => {
  await page.goto('./');
  await page.locator('#trace-next').click();
  await expect(page.locator('#trace-next')).toBeEnabled();
  await expect(page.locator('#stack-display')).toHaveText('aA$');
  await page.locator('#trace-next').click();
  await expect(page.locator('#input-display .consumed')).toHaveCount(0);
  await expect(page.locator('#input-display .consumed')).toHaveText(['a']);
  await expect(page.locator('#stack-display')).toHaveText('A$');
  await page.locator('#trace-reset').click();
  await expect(page.locator('#stack-display')).toHaveText('S$');
  await expect(page.locator('#input-display .consumed')).toHaveCount(0);
  await expect(page.locator('#trace-progress')).toHaveText('Step 0 / 5');
  await page.locator('#trace-next').click();
  await expect(page.locator('#trace-next')).toBeEnabled();
  await page.locator('#trace-next').click();
  await page.locator('#trace-reset').click();
  await page.waitForTimeout(650);
  await expect(page.locator('#stack-display')).toHaveText('S$');
  await expect(page.locator('#input-display .consumed')).toHaveCount(0);
  await expect(page.locator('#trace-progress')).toHaveText('Step 0 / 5');
});

test('changing grammar cancels construction and reduced motion keeps the controls usable', async ({ page }) => {
  await page.goto('./?example=first-follow');
  await page.getByText('Build the table step by step', { exact: true }).click();
  await page.locator('#build-play').click();
  await page.getByRole('button', { name: 'FIRST clash', exact: true }).click();
  await page.waitForTimeout(650);
  await expect(page.locator('#build-progress')).toHaveText('0 / 2 entries');
  await expect(page.locator('#build-table .placed-production')).toHaveCount(0);
  await expect(page.locator('#build-play')).toHaveText('Play');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#build-next').click();
  await expect(page.locator('#build-progress')).toHaveText('1 / 2 entries');
  await expect(page.locator('#build-table [data-build-lhs="S"][data-build-token="a"]')).toHaveText('p1');
  await expect(page.locator('.motion-flight')).toHaveCount(0);
  await page.locator('#repair-next').click();
  await page.locator('#repair-next').click();
  await expect(page.locator('.repair-code')).toHaveText('S → a X\nX → b | c');
});
