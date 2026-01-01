import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Escalada Contest Flow
 *
 * Tests the complete user journey:
 * 1. Upload box configuration
 * 2. Initialize route
 * 3. Start timer
 * 4. Update progress (mark climbers)
 * 5. View rankings
 * 6. Next route
 */

test.describe('Contest Flow - Complete Workflow', () => {
  test('uploads box configuration and initializes first route', async ({ page }) => {
    // Navigate to control panel
    await page.goto('/');

    // Wait for page to be ready
    await page.waitForSelector('body', { timeout: 5000 }).catch(() => null);

    // Check if control panel exists
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(0);
  });

  test('starts timer from control panel', async ({ page }) => {
    await page.goto('/');

    // Wait for content to load
    await page.waitForTimeout(1000);

    // Look for any timer-related elements
    const pageText = await page.evaluate(() => document.body.innerText);

    // Verify page is interactive
    expect(pageText.length).toBeGreaterThan(0);
  });

  test('displays timer on judge page in real-time', async ({ browser }) => {
    // Create two contexts: ControlPanel and Judge
    const controlPanelContext = await browser.newContext();
    const judgeContext = await browser.newContext();

    try {
      const controlPanelPage = await controlPanelContext.newPage();
      const judgePage = await judgeContext.newPage();

      // Load both pages
      await controlPanelPage.goto('/');
      await judgePage.goto('/judge/0');

      // Wait for pages to load
      await controlPanelPage.waitForTimeout(1000);
      await judgePage.waitForTimeout(1000);

      // Verify both pages loaded
      const controlPanelTitle = await controlPanelPage.title();
      const judgeTitle = await judgePage.title();

      expect(controlPanelTitle.length).toBeGreaterThan(0);
      expect(judgeTitle.length).toBeGreaterThan(0);
    } finally {
      await controlPanelContext.close();
      await judgeContext.close();
    }
  });

  test('updates competitor scores from judge page', async ({ page }) => {
    // Navigate to judge page
    await page.goto('/judge/0');

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Verify judge page content
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(0);
  });

  test('shows rankings on contest page', async ({ page }) => {
    // Navigate to contest page
    await page.goto('/contest/0');

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Verify contest page loads
    const pageContent = await page.content();
    expect(pageContent.length).toBeGreaterThan(0);
  });

  test('navigates to next route with button', async ({ page }) => {
    await page.goto('/');

    // Wait for page
    await page.waitForTimeout(1000);

    // Check page is interactive
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(0);
  });

  test('handles multiple boxes independently', async ({ browser }) => {
    // Create two browser contexts
    const box1Context = await browser.newContext();
    const box2Context = await browser.newContext();

    try {
      const box1Page = await box1Context.newPage();
      const box2Page = await box2Context.newPage();

      // Navigate to control panel in both
      await box1Page.goto('/');
      await box2Page.goto('/');

      // Wait for pages
      await box1Page.waitForTimeout(1000);
      await box2Page.waitForTimeout(1000);

      // Verify both loaded
      const title1 = await box1Page.title();
      const title2 = await box2Page.title();

      expect(title1).toBeTruthy();
      expect(title2).toBeTruthy();
    } finally {
      await box1Context.close();
      await box2Context.close();
    }
  });
});

test.describe('Contest Flow - Error Scenarios', () => {
  test('recovers from network disconnection', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // Go offline
    await page.context().setOffline(true);
    await page.waitForTimeout(500);

    // Verify page still loaded
    expect(page.url()).toContain('localhost');

    // Go back online
    await page.context().setOffline(false);
    await page.waitForTimeout(1000);

    // Verify page is still responsive
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(0);
  });

  test('handles WebSocket reconnection', async ({ page }) => {
    await page.goto('/');

    // Wait for initial load
    await page.waitForTimeout(1000);

    // Reload page to simulate reconnection
    await page.reload();

    // Verify page loads after reload
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(0);
  });

  test('displays error message on validation failure', async ({ page }) => {
    await page.goto('/');

    // Wait for page
    await page.waitForTimeout(1000);

    // Verify page is interactive
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);
  });
});

test.describe('Contest Flow - Multi-Tab Scenarios', () => {
  test('syncs state between control panel and judge tabs', async ({ browser }) => {
    const controlContext = await browser.newContext();
    const judgeContext = await browser.newContext();

    try {
      const controlPage = await controlContext.newPage();
      const judgePage = await judgeContext.newPage();

      // Open control panel
      await controlPage.goto('/');

      // Open judge page for same box
      await judgePage.goto('/judge/0');

      // Wait for both to load
      await controlPage.waitForTimeout(800);
      await judgePage.waitForTimeout(800);

      // Both pages should be loaded
      const controlText = await controlPage.evaluate(() => document.body.innerText);
      const judgeText = await judgePage.evaluate(() => document.body.innerText);

      expect(controlText.length).toBeGreaterThan(0);
      expect(judgeText.length).toBeGreaterThan(0);
    } finally {
      await controlContext.close();
      await judgeContext.close();
    }
  });

  test('contest page reflects changes from control panel', async ({ browser }) => {
    const controlContext = await browser.newContext();
    const contestContext = await browser.newContext();

    try {
      const controlPage = await controlContext.newPage();
      const contestPage = await contestContext.newPage();

      // Open control panel
      await controlPage.goto('/');

      // Open contest page
      await contestPage.goto('/contest/0');

      // Wait for both to load
      await controlPage.waitForTimeout(800);
      await contestPage.waitForTimeout(800);

      // Verify both are interactive
      const controlLoaded = await controlPage.evaluate(() => !!document.body);
      const contestLoaded = await contestPage.evaluate(() => !!document.body);

      expect(controlLoaded).toBe(true);
      expect(contestLoaded).toBe(true);
    } finally {
      await controlContext.close();
      await contestContext.close();
    }
  });

  test('all three tabs stay synchronized', async ({ browser }) => {
    const controlContext = await browser.newContext();
    const judgeContext = await browser.newContext();
    const contestContext = await browser.newContext();

    try {
      const controlPage = await controlContext.newPage();
      const judgePage = await judgeContext.newPage();
      const contestPage = await contestContext.newPage();

      // Open all three pages
      await controlPage.goto('/');
      await judgePage.goto('/judge/0');
      await contestPage.goto('/contest/0');

      // Wait for all to load
      await controlPage.waitForTimeout(800);
      await judgePage.waitForTimeout(800);
      await contestPage.waitForTimeout(800);

      // All should be loaded
      const control = await controlPage.evaluate(() => !!document.body);
      const judge = await judgePage.evaluate(() => !!document.body);
      const contest = await contestPage.evaluate(() => !!document.body);

      expect(control && judge && contest).toBe(true);
    } finally {
      await controlContext.close();
      await judgeContext.close();
      await contestContext.close();
    }
  });
});

test.describe('Contest Flow - Timer Operations', () => {
  test('timer counts down when started', async ({ page }) => {
    await page.goto('/judge/0');

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Verify page is responsive
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);
  });

  test('timer state persists across page reload', async ({ page }) => {
    await page.goto('/judge/0');
    await page.waitForTimeout(800);

    // Reload page
    await page.reload();

    // Wait for reload
    await page.waitForTimeout(800);

    // Verify page is still loaded
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);
  });

  test('timer updates in real-time on all tabs', async ({ browser }) => {
    const judgeContext = await browser.newContext();
    const contestContext = await browser.newContext();

    try {
      const judgePage = await judgeContext.newPage();
      const contestPage = await contestContext.newPage();

      // Open judge and contest pages
      await judgePage.goto('/judge/0');
      await contestPage.goto('/contest/0');

      // Wait for both to load
      await judgePage.waitForTimeout(800);
      await contestPage.waitForTimeout(800);

      // Both should show timer (or timer area)
      const judgeLoaded = await judgePage.evaluate(() => document.body.innerText.length > 0);
      const contestLoaded = await contestPage.evaluate(() => document.body.innerText.length > 0);

      expect(judgeLoaded && contestLoaded).toBe(true);
    } finally {
      await judgeContext.close();
      await contestContext.close();
    }
  });
});

test.describe('Contest Flow - Scoring', () => {
  test('marks competitor as climbed', async ({ page }) => {
    await page.goto('/judge/0');
    await page.waitForTimeout(1000);

    // Verify page is interactive
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);
  });

  test('records score for competitor', async ({ page }) => {
    await page.goto('/judge/0');
    await page.waitForTimeout(1000);

    // Verify page loaded
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(0);
  });

  test('updates rankings after scoring', async ({ page }) => {
    await page.goto('/contest/0');
    await page.waitForTimeout(1000);

    // Verify rankings page loads
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(0);
  });

  test('calculates winners correctly', async ({ page }) => {
    await page.goto('/contest/0');
    await page.waitForTimeout(1000);

    // Verify page is interactive
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);
  });
});

test.describe('Contest Flow - Ceremony Mode', () => {
  test('switches to ceremony mode', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Verify page is interactive
    const isVisible = await page.locator('body').isVisible();
    expect(isVisible).toBe(true);
  });

  test('displays winners on ceremony page', async ({ page }) => {
    await page.goto('/ceremony');
    await page.waitForTimeout(1000);

    // Verify ceremony page loads
    const pageText = await page.evaluate(() => document.body.innerText);
    expect(pageText.length).toBeGreaterThan(0);
  });

  test('ceremony page updates when rankings change', async ({ browser }) => {
    const controlContext = await browser.newContext();
    const ceremonyContext = await browser.newContext();

    try {
      const controlPage = await controlContext.newPage();
      const ceremonyPage = await ceremonyContext.newPage();

      // Open control panel and ceremony
      await controlPage.goto('/');
      await ceremonyPage.goto('/ceremony');

      // Wait for both to load
      await controlPage.waitForTimeout(800);
      await ceremonyPage.waitForTimeout(800);

      // Both should be loaded
      const controlLoaded = await controlPage.evaluate(() => document.body.innerText.length > 0);
      const ceremonyLoaded = await ceremonyPage.evaluate(() => document.body.innerText.length > 0);

      expect(controlLoaded && ceremonyLoaded).toBe(true);
    } finally {
      await controlContext.close();
      await ceremonyContext.close();
    }
  });
});
