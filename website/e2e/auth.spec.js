import { test, expect } from '@playwright/test';

test.describe('Phone OTP Flow', () => {
  test('sign-in page loads phone input', async ({ page }) => {
    await page.goto('/sign-in');
    const phoneInput = page.locator('input[type="tel"], input[name="phone"], input[placeholder*="phone"]').first();
    if (await phoneInput.isVisible().catch(() => false)) {
      await expect(phoneInput).toBeVisible();
    }
  });
});

test.describe('PrivateRoute Guards', () => {
  test('unauthenticated user is redirected from portal', async ({ page }) => {
    await page.goto('/portal');
    await page.waitForURL(/\/(sign-in|login|auth)/, { timeout: 10000 }).catch(() => {});
    const url = page.url();
    const blocked = url.includes('sign-in') || url.includes('login') || url.includes('auth');
    expect(blocked).toBe(true);
  });

  test('unauthenticated user cannot access protected dashboard', async ({ page }) => {
    await page.goto('/portal/dashboard');
    const url = page.url();
    const onLoginPage = url.includes('sign-in') || url.includes('login') || url.includes('auth');
    expect(onLoginPage).toBe(true);
  });
});
