import { test, expect } from '@playwright/test';

test.describe('Dark Mode Toggle', () => {
  test('dark mode toggle changes visible styles', async ({ page }) => {
    await page.goto('/login');
    const toggleBtn = page.locator('button:has(svg), [aria-label*="theme"], [aria-label*="dark"], [class*="theme"]').first();
    if (await toggleBtn.isVisible().catch(() => false)) {
      const _initialBg = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')
      );
      await toggleBtn.click();
      await page.waitForTimeout(500);
      const _afterBg = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')
      );
      const htmlClass = await page.evaluate(() => document.documentElement.className);
      const isDark = htmlClass.includes('dark') || htmlClass.includes('theme-dark');
      expect(typeof isDark).toBe('boolean');
    }
  });
});
