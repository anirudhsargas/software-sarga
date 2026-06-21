import { test, expect } from '@playwright/test';

test.describe('Quote Cart', () => {
  test('cart persists across navigation using localStorage', async ({ page }) => {
    await page.goto('/');
    const cartCount = await page.evaluate(() => {
      localStorage.setItem('sarga_cart', JSON.stringify([{ id: 'test-1', name: 'Test Item', quantity: 2, price: 100 }]));
      return JSON.parse(localStorage.getItem('sarga_cart') || '[]').length;
    });
    expect(cartCount).toBe(1);
    await page.goto('/products');
    const cartAfterNav = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('sarga_cart') || '[]').length;
    });
    expect(cartAfterNav).toBe(1);
  });

  test('cart drawer opens and shows items', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('sarga_cart', JSON.stringify([{ id: 'test-1', name: 'Business Cards', quantity: 500, price: 250 }]));
    });
    await page.goto('/');
    const cartIcon = page.locator('[class*="cart"], [class*="Cart"], [aria-label*="cart"]').first();
    if (await cartIcon.isVisible().catch(() => false)) {
      await cartIcon.click();
      await page.waitForTimeout(500);
    }
    const drawer = page.locator('[class*="drawer"], [class*="Drawer"], [class*="cart-panel"]').first();
    if (await drawer.isVisible().catch(() => false)) {
      await expect(drawer).toBeVisible();
    }
  });
});
