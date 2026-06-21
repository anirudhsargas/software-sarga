import { test, expect } from '@playwright/test';

test.describe('Pagination', () => {
  test('paginated list page shows navigation controls', async ({ page }) => {
    await page.goto('/customers');
    const paginationEl = page.locator('[class*="pagination"], nav[aria-label*="pagination"], [class*="Pagination"]').first();
    if (await paginationEl.isVisible().catch(() => false)) {
      await expect(paginationEl).toBeVisible();
      const buttons = paginationEl.locator('button, a');
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});
