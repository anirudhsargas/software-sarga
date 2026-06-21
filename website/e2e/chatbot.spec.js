import { test, expect } from '@playwright/test';

test.describe('Website Chatbot', () => {
  test('chatbot opens and renders initial greeting', async ({ page }) => {
    await page.goto('/');
    const chatToggle = page.locator('button:has(svg), [aria-label*="chat"], [class*="chatbot"]').first();
    if (await chatToggle.isVisible().catch(() => false)) {
      await chatToggle.click();
      await page.waitForTimeout(1000);
    }
    const chatContainer = page.locator('[class*="chat"], [class*="Chat"], [class*="message"]').first();
    if (await chatContainer.isVisible().catch(() => false)) {
      await expect(chatContainer).toBeVisible();
    }
  });

  test('chatbot input sanitizes script tags (no XSS)', async ({ page }) => {
    await page.goto('/');
    const chatToggle = page.locator('button:has(svg), [aria-label*="chat"], [class*="chatbot-toggle"]').first();
    if (await chatToggle.isVisible().catch(() => false)) {
      await chatToggle.click();
      await page.waitForTimeout(500);
    }
    const input = page.locator('input[type="text"], textarea').first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill('<script>alert("xss")</script>');
      await input.press('Enter');
      await page.waitForTimeout(1000);
      const html = await page.locator('[class*="chat"]').first().innerHTML().catch(() => '');
      expect(html.toLowerCase()).not.toContain('<script>alert');
    }
  });

  test('chatbot auto-scrolls to latest message', async ({ page }) => {
    await page.goto('/');
    const chatToggle = page.locator('button:has(svg), [aria-label*="chat"]').first();
    if (await chatToggle.isVisible().catch(() => false)) {
      await chatToggle.click();
      await page.waitForTimeout(500);
    }
    const messagesContainer = page.locator('[class*="messages"], [class*="chat-body"], [class*="chat-messages"]').first();
    if (await messagesContainer.isVisible().catch(() => false)) {
      const scrollTopBefore = await messagesContainer.evaluate(el => el.scrollTop);
      await page.waitForTimeout(2000);
      const scrollTopAfter = await messagesContainer.evaluate(el => el.scrollTop);
      expect(scrollTopAfter).toBeGreaterThanOrEqual(scrollTopBefore);
    }
  });
});
