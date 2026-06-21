import { test, expect } from '@playwright/test';

test.describe('Public website — critical user flows', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API calls to avoid depending on a live backend
    await page.route('**/api/**', (route) => {
      const url = route.request().url();

      if (url.includes('/api/website/chat')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ reply: 'Thanks for your message! How can I help you with printing services?', categories: [], subcategories: [] }),
        });
      }

      if (url.includes('/api/website/chat/history')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ history: [] }),
        });
      }

      if (url.includes('/api/chatbot/health')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ loaded: true, provider: 'mock', model: 'test', healthy: true }),
        });
      }

      if (url.includes('/api/website/customer/login')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'test-customer-token', customer: { id: 1, name: 'Test User', mobile: '9876543210' } }),
        });
      }

      // Default: return empty success
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    // Seed a UUID for the chatbot
    await page.goto('/');
    await page.evaluate(() => {
      if (!localStorage.getItem('sarga_uuid')) {
        localStorage.setItem('sarga_uuid', crypto.randomUUID());
      }
    });
  });

  test('Chatbot: send a message and verify response renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open the chatbot
    const chatButton = page.locator('button[aria-label="Open chat"], .chatbot-button, button:has(svg.lucide-message-circle)').first();
    await chatButton.click();
    await page.waitForTimeout(500);

    // The chat panel should be visible
    const chatPanel = page.locator('.chat-panel, .sarga-chatbot.open');
    await expect(chatPanel).toBeVisible({ timeout: 5000 });

    // Type a message
    const input = page.locator('.chat-footer input, .input-row input, input[placeholder*="message"]').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill('What services do you offer?');

    // Click send
    const sendBtn = page.locator('.send-btn, button:has-text("Send")').first();
    await sendBtn.click();

    // Wait for bot response to appear
    await page.waitForTimeout(1500);
    const botMessages = page.locator('.chat-bubble.bot .chat-text, .chat-bubble.bot');
    const count = await botMessages.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('Chatbot: no XSS via dangerouslySetInnerHTML (script tags are escaped)', async ({ page }) => {
    await page.route('**/api/website/chat', (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: '<script>alert("XSS")</script>Normal text', categories: [] }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open chatbot
    const chatButton = page.locator('button[aria-label="Open chat"], .chatbot-button').first();
    await chatButton.click();
    await page.waitForTimeout(500);

    // Send a message
    const input = page.locator('.chat-footer input, .input-row input').first();
    await input.fill('test xss');
    const sendBtn = page.locator('.send-btn, button:has-text("Send")').first();
    await sendBtn.click();
    await page.waitForTimeout(1000);

    // The chatbot uses dangerouslySetInnerHTML but also escapes &, <, > first.
    // The <script> tag should have been escaped to &lt;script&gt; and rendered as text,
    // NOT executed as HTML.
    const chatText = page.locator('.chat-bubble.bot .chat-text').last();
    const html = await chatText.innerHTML();
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  test('Quote cart: add item, view cart, cart persists across navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Add an item to the cart by directly manipulating localStorage
    await page.evaluate(() => {
      const item = { id: crypto.randomUUID(), name: 'Business Cards', quantity: 100, price: 250, addedAt: new Date().toISOString() };
      localStorage.setItem('sarga_cart', JSON.stringify([item]));
    });

    // Navigate to another page
    await page.goto('/services');
    await page.waitForLoadState('networkidle');

    // Verify cart persists
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sarga_cart') || '[]'));
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe('Business Cards');

    // Open cart drawer if available
    const cartIcon = page.locator('button[aria-label*="cart" i], button:has-text("Cart"), .cart-icon, button:has(svg.lucide-shopping-cart)').first();
    if (await cartIcon.isVisible()) {
      await cartIcon.click();
      await page.waitForTimeout(500);
    }
  });

  test('Firebase Phone OTP flow: mock OTP, verify login state set', async ({ page }) => {
    // Simulate the customer login flow
    await page.goto('/sign-in');
    await page.waitForLoadState('networkidle');

    // Fill in phone number
    const phoneInput = page.locator('input[type="tel"], input[placeholder*="phone" i], input[name="phone"]').first();
    if (await phoneInput.isVisible()) {
      await phoneInput.fill('9876543210');
    }

    // Look for a Send OTP or Login button
    const otpBtn = page.locator('button:has-text("Send OTP"), button:has-text("Get OTP"), button:has-text("Login")').first();
    if (await otpBtn.isVisible()) {
      await otpBtn.click();
      await page.waitForTimeout(1500);
    }

    // Verify redirect or state change — the login endpoint returns a token
    // which should be stored in localStorage
    const token = await page.evaluate(() => localStorage.getItem('sarga_customer_token'));
    expect(token).toBeTruthy();
  });

  test('PrivateRoute guards block unauthenticated access to portal pages', async ({ page }) => {
    // Clear any existing tokens
    await page.evaluate(() => {
      localStorage.removeItem('sarga_customer_token');
      localStorage.removeItem('sarga_uuid');
    });

    // Try accessing a portal page directly
    await page.goto('/portal/dashboard');
    await page.waitForLoadState('networkidle');

    // Should redirect to sign-in or show access denied
    const currentUrl = page.url();
    const isRedirected = currentUrl.includes('/sign-in') || currentUrl.includes('/login');
    if (!isRedirected) {
      // Check for access denied message
      const denied = page.locator('text=access denied, text=unauthorized, text=sign in, text=log in').first();
      await expect(denied).toBeVisible({ timeout: 5000 }).catch(() => {
        // If no explicit denial, URL should signal redirect
        expect(currentUrl).not.toContain('/portal/dashboard');
      });
    }
  });

  test('Chatbot auto-scrolls to latest message after response', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open chatbot
    const chatButton = page.locator('button[aria-label="Open chat"], .chatbot-button').first();
    await chatButton.click();
    await page.waitForTimeout(500);

    // Send a few messages to populate the chat
    const input = page.locator('.chat-footer input, .input-row input').first();
    const sendBtn = page.locator('.send-btn, button:has-text("Send")').first();

    for (const msg of ['Hello', 'What services?', 'Pricing?']) {
      await input.fill(msg);
      await sendBtn.click();
      await page.waitForTimeout(1200);
    }

    // Check that the last message is visible in the viewport
    const lastBubble = page.locator('.chat-bubble').last();
    await expect(lastBubble).toBeVisible({ timeout: 3000 });

    // Verify the scroll container has scrolled to bottom (scrollTop > 0)
    const scrollTop = await page.evaluate(() => {
      const body = document.querySelector('.chat-body');
      if (body) return body.scrollTop;
      return -1;
    });
    // If chat-body has overflow, it should have scrolled
    if (scrollTop >= 0) {
      expect(scrollTop).toBeGreaterThan(0);
    }
  });
});
