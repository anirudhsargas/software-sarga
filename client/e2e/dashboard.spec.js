import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('dashboard loads without crashing when authenticated', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="text"], input[name="user_id"]', 'admin');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 15000 }).catch(() => {});
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('login');
  });
});
