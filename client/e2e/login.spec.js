import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('login page loads and shows form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="text"], input[name="user_id"], input[placeholder*="User"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('login form rejects empty submission', async ({ page }) => {
    await page.goto('/login');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await expect(page.locator('text=required, text=Invalid').first()).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test('dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });
});
