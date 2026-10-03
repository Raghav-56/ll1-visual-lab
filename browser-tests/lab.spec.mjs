import { test, expect } from '@playwright/test';

const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const pageErrors = [];
  errors.set(page, pageErrors);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('./');
  await expect(page.locator('#grammar-verdict')).toContainText('This grammar is LL(1)');
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('the same FOLLOW conflict appears in all four views and stops the parser', async ({ page }) => {
  await page.getByRole('button', { name: 'FOLLOW clash', exact: true }).click();
  await expect(page.locator('#grammar-verdict')).toContainText('not LL(1)');
  await expect(page.locator('.rule-row.fail strong')).toHaveText('3. Empty must not compete with what follows');
  await expect(page.locator('#sets-content')).toContainText('FIRST(α) ∩ FOLLOW(A) = { a }');
  await expect(page.locator('#cell-detail')).toContainText('M[A, a] · 2 entries');
  await expect(page.locator('#decision-content')).toContainText('2 choices. Stop at the conflict.');
  await page.locator('#trace-next').click();
  await page.locator('#trace-next').click();
  await expect(page.locator('#trace-status')).toHaveText('Conflict');
  await expect(page.locator('#stack-display')).toHaveText('Aa$');
  await expect(page.locator('#input-display .consumed')).toHaveCount(0);
  await expect(page.locator('#trace-next')).toBeDisabled();
});

test('two nullable alternatives fail rule 2 and compete on the end marker', async ({ page }) => {
  await page.getByRole('button', { name: 'Empty clash', exact: true }).click();
  await expect(page.locator('.rule-row.fail strong')).toHaveText('2. At most one empty route');
  await expect(page.locator('#sets-content')).toContainText('FIRST(α) ∩ FIRST(β) = { ε }');
  await expect(page.locator('#cell-detail')).toContainText('M[S, $] · 2 entries');
  await page.locator('#trace-next').click();
  await expect(page.locator('#trace-status')).toHaveText('Conflict');
});

test('a table cell changes the shared decision and keeps keyboard focus', async ({ page }) => {
  const cell = page.getByRole('button', { name: 'Cell A, $: 1 production', exact: true });
  await cell.click();
  await expect(page.locator('#nonterminal-select')).toHaveValue('A');
  await expect(page.locator('#lookahead-tokens button[aria-pressed=true]')).toHaveText('$');
  await expect(page.locator('#cell-detail')).toContainText('A → ε');
  await expect(cell).toBeFocused();
  await page.getByRole('button', { name: 'Cell A, a: 0 productions', exact: true }).click();
  await expect(page.locator('#decision-content')).toContainText('Zero choices. Report an input error.');
  await expect(page.locator('#grammar-verdict')).toContainText('This grammar is LL(1)');
});

test('the parser plays a valid exam input to acceptance and resets', async ({ page }) => {
  await page.locator('#example-select').selectOption('exam');
  await page.locator('#trace-speed').selectOption('350');
  await page.locator('#trace-play').click();
  await expect(page.locator('#trace-status')).toHaveText('Accepted', { timeout: 12000 });
  await expect(page.locator('#input-display .consumed')).toHaveText(['1', '0', '1', '0']);
  await expect(page.locator('#trace-play')).toHaveText('Play');
  await page.locator('#trace-reset').click();
  await expect(page.locator('#trace-progress')).toHaveText('Step 0 / 10');
  await expect(page.locator('#stack-display')).toHaveText('S$');
});

test('custom grammar analysis updates atomically and rejects invalid input', async ({ page }) => {
  await page.getByText('Edit the grammar', { exact: true }).click();
  await page.locator('#grammar-input').fill('S -> a X\nX -> b | c');
  await page.locator('#analyze-button').click();
  await expect(page.locator('#grammar-verdict')).toContainText('This grammar is LL(1)');
  await expect(page.locator('#grammar-display')).toContainText('X→b|c');
  await page.locator('#grammar-input').fill('S -> S');
  await page.locator('#analyze-button').click();
  await expect(page.locator('#editor-error')).toContainText('cannot derive a finite terminal string');
  await expect(page.locator('#grammar-display')).toContainText('X→b|c');
  await page.locator('#input-tokens').fill('a nope');
  await page.locator('#trace-button').click();
  await expect(page.locator('#input-error')).toContainText('Unknown input token nope');
});

test('a repair is animated, inspected, and independently rechecked', async ({ page }) => {
  await page.locator('#repair-play').click();
  await expect(page.locator('#repair-position')).toHaveText('3 / 3', { timeout: 6500 });
  await expect(page.locator('#repair-caption')).toContainText('Make the remaining choice at X');
  await expect(page.locator('#repair-verdicts')).toContainText('AfterLL(1)');
  await page.getByRole('button', { name: 'Inspect after', exact: true }).click();
  await expect(page.locator('#grammar-display')).toContainText('X→b|c');
  await expect(page.locator('#grammar-verdict')).toContainText('This grammar is LL(1)');
  await page.getByRole('button', { name: 'Why those are not enough', exact: true }).click();
  await page.locator('#repair-scrubber').fill('2');
  await expect(page.locator('#repair-caption')).toContainText('The original grammar fails LL(1)');
});

test('practice gives an explanation and both themes fit the viewport', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'It is unambiguous, but not LL(1).', exact: true }).click();
  await expect(page.locator('#feedback-0')).toContainText('Correct.');
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const overflow = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(overflow.content).toBeLessThanOrEqual(overflow.width);
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `artifacts/${testInfo.project.name}-overview.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'FOLLOW clash', exact: true }).click();
  await page.locator('#explore').screenshot({ path: `artifacts/${testInfo.project.name}-four-views.png`, animations: 'disabled' });
});

test('reduced motion retains manual controls and readable SVG content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'FIRST clash', exact: true }).click();
  await expect(page.locator('#decision-content animateMotion')).toHaveCount(0);
  await page.locator('#walk-button').click();
  await expect(page.locator('#rules-view')).toHaveClass(/walk-active/);
  await page.locator('#walk-button').click();
  await expect(page.locator('#sets-view')).toHaveClass(/walk-active/);
  await expect(page.locator('#ambiguity-trees svg')).toHaveCount(2);
});
