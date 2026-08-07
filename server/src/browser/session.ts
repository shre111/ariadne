import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { takSnapshot, formatSnapshotForModel, type SnapshotResult } from './snapshot.js';

export class BrowserSession {
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    readonly page: Page,
  ) {}

  static async create(): Promise<BrowserSession> {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();
    // Dismiss common dialogs automatically
    page.on('dialog', (dialog) => { dialog.dismiss().catch(() => {}); });
    return new BrowserSession(browser, context, page);
  }

  // ─── Navigation ─────────────────────────────────────────────────────────

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.page.waitForTimeout(800); // brief settle
  }

  async goBack(): Promise<void> {
    await this.page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 });
    await this.page.waitForTimeout(500);
  }

  // ─── Element actions ─────────────────────────────────────────────────────

  async click(ref: number): Promise<void> {
    const el = this.page.locator(`[data-ariadne-ref="${ref}"]`);
    await el.scrollIntoViewIfNeeded({ timeout: 5_000 });
    await el.click({ timeout: 8_000 });
    await this.page.waitForTimeout(600);
  }

  async type(ref: number, text: string, clear = true): Promise<void> {
    const el = this.page.locator(`[data-ariadne-ref="${ref}"]`);
    await el.scrollIntoViewIfNeeded({ timeout: 5_000 });
    if (clear) await el.fill(text, { timeout: 8_000 });
    else await el.type(text, { delay: 40 });
  }

  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
    await this.page.waitForTimeout(300);
  }

  async select(ref: number, value: string): Promise<void> {
    const el = this.page.locator(`[data-ariadne-ref="${ref}"]`);
    await el.selectOption(value, { timeout: 8_000 });
  }

  async scroll(direction: 'up' | 'down', amount: number): Promise<void> {
    const delta = direction === 'down' ? amount : -amount;
    await this.page.mouse.wheel(0, delta);
    await this.page.waitForTimeout(400);
  }

  async hover(ref: number): Promise<void> {
    const el = this.page.locator(`[data-ariadne-ref="${ref}"]`);
    await el.hover({ timeout: 5_000 });
    await this.page.waitForTimeout(300);
  }

  // ─── Observation ─────────────────────────────────────────────────────────

  async snapshot(): Promise<SnapshotResult> {
    return takSnapshot(this.page);
  }

  async snapshotText(): Promise<string> {
    const snap = await this.snapshot();
    return formatSnapshotForModel(snap);
  }

  async screenshot(): Promise<{ data: string; width: number; height: number }> {
    const buf = await this.page.screenshot({ type: 'jpeg', quality: 75, fullPage: false });
    const vp = this.page.viewportSize() ?? { width: 1280, height: 800 };
    return {
      data: buf.toString('base64'),
      width: vp.width,
      height: vp.height,
    };
  }

  // ─── Wait ────────────────────────────────────────────────────────────────

  async waitForNavigation(timeoutMs = 10_000): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: timeoutMs });
    } catch {
      // Timeout is fine; the page may already be loaded
    }
  }

  async waitForSelector(selector: string, timeoutMs = 10_000): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible', timeout: timeoutMs });
  }

  // ─── Element info ─────────────────────────────────────────────────────────

  async refLabel(ref: number): Promise<string> {
    try {
      const el = this.page.locator(`[data-ariadne-ref="${ref}"]`);
      const text = await el.textContent({ timeout: 2_000 });
      const ariaLabel = await el.getAttribute('aria-label', { timeout: 2_000 });
      return (ariaLabel ?? text ?? `ref ${ref}`).trim().slice(0, 80);
    } catch {
      return `ref ${ref}`;
    }
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  // Viewport-relative bounding box of a ref'd element, in the same CSS-pixel
  // space as the screenshot — powers the X-ray overlay drawn over the stage.
  async refBox(ref: number): Promise<{ x: number; y: number; w: number; h: number } | null> {
    try {
      const box = await this.page
        .locator(`[data-ariadne-ref="${ref}"]`)
        .boundingBox({ timeout: 1500 });
      if (!box) return null;
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    } catch {
      return null;
    }
  }

  viewport(): { width: number; height: number } {
    return this.page.viewportSize() ?? { width: 1280, height: 800 };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.browser.close().catch(() => {});
  }
}
