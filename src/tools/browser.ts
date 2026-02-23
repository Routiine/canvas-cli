/**
 * Browser Automation Tools - Puppeteer-based browser control
 * Similar to Kilo Code's browser automation capabilities
 */

import { Tool } from '../types.js';
import { spawn } from 'child_process';

// Dynamic import for puppeteer (optional dependency)
let puppeteer: any = null;
let browser: any = null;
let currentPage: any = null;

async function ensurePuppeteer(): Promise<boolean> {
  if (puppeteer) return true;

  try {
    // Dynamic import - puppeteer is an optional dependency
    // @ts-ignore - puppeteer may not be installed
    puppeteer = await import('puppeteer');
    return true;
  } catch {
    console.log('Puppeteer not installed. Run: npm install puppeteer');
    return false;
  }
}

async function ensureBrowser(): Promise<any> {
  if (!await ensurePuppeteer()) return null;

  if (!browser) {
    browser = await puppeteer.default.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

async function getPage(): Promise<any> {
  const b = await ensureBrowser();
  if (!b) return null;

  if (!currentPage) {
    currentPage = await b.newPage();
    await currentPage.setViewport({ width: 1280, height: 800 });
  }
  return currentPage;
}

/**
 * Browser Launch Tool
 */
export class BrowserLaunchTool implements Tool {
  name = 'browser_launch';
  description = 'Launch a browser instance for automation. Options: headless (default true), width, height';
  parameters = {
    headless: {
      type: 'boolean',
      description: 'Run in headless mode (default: true)',
      optional: true
    },
    width: {
      type: 'number',
      description: 'Viewport width (default: 1280)',
      optional: true
    },
    height: {
      type: 'number',
      description: 'Viewport height (default: 800)',
      optional: true
    }
  };

  async execute(params: { headless?: boolean; width?: number; height?: number }): Promise<string> {
    if (!await ensurePuppeteer()) {
      return 'Error: Puppeteer not installed. Run: npm install puppeteer';
    }

    try {
      // Close existing browser if any
      if (browser) {
        await browser.close();
        browser = null;
        currentPage = null;
      }

      browser = await puppeteer.default.launch({
        headless: params.headless !== false ? 'new' : false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      currentPage = await browser.newPage();
      await currentPage.setViewport({
        width: params.width || 1280,
        height: params.height || 800
      });

      return `Browser launched (headless: ${params.headless !== false})`;
    } catch (error: any) {
      return `Error launching browser: ${error.message}`;
    }
  }
}

/**
 * Browser Navigate Tool
 */
export class BrowserNavigateTool implements Tool {
  name = 'browser_navigate';
  description = 'Navigate to a URL in the browser';
  parameters = {
    url: {
      type: 'string',
      description: 'URL to navigate to',
      optional: false
    },
    waitFor: {
      type: 'string',
      description: 'Wait for: load, domcontentloaded, networkidle0, networkidle2',
      optional: true
    }
  };

  async execute(params: { url: string; waitFor?: string }): Promise<string> {
    if (!params.url || typeof params.url !== 'string') {
      return 'Error: URL is required';
    }

    // Validate URL
    try {
      new URL(params.url);
    } catch {
      return `Error: Invalid URL: ${params.url}`;
    }

    const page = await getPage();
    if (!page) return 'Error: Browser not launched. Use browser_launch first.';

    try {
      const validWaitOptions = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'];
      const waitUntil = validWaitOptions.includes(params.waitFor || '') ? params.waitFor : 'domcontentloaded';
      await page.goto(params.url, { waitUntil, timeout: 30000 });
      const title = await page.title();
      return `Navigated to: ${params.url}\nTitle: ${title}`;
    } catch (error: any) {
      return `Error navigating: ${error.message}`;
    }
  }
}

/**
 * Browser Click Tool
 */
export class BrowserClickTool implements Tool {
  name = 'browser_click';
  description = 'Click an element on the page by selector';
  parameters = {
    selector: {
      type: 'string',
      description: 'CSS selector or XPath for the element to click',
      optional: false
    },
    wait: {
      type: 'boolean',
      description: 'Wait for element to be visible (default: true)',
      optional: true
    }
  };

  async execute(params: { selector: string; wait?: boolean }): Promise<string> {
    if (!params.selector || typeof params.selector !== 'string' || !params.selector.trim()) {
      return 'Error: CSS selector is required';
    }

    const page = await getPage();
    if (!page) return 'Error: Browser not launched.';

    try {
      if (params.wait !== false) {
        await page.waitForSelector(params.selector, { visible: true, timeout: 10000 });
      }
      await page.click(params.selector);
      return `Clicked: ${params.selector}`;
    } catch (error: any) {
      return `Error clicking: ${error.message}`;
    }
  }
}

/**
 * Browser Type Tool
 */
export class BrowserTypeTool implements Tool {
  name = 'browser_type';
  description = 'Type text into an input element';
  parameters = {
    selector: {
      type: 'string',
      description: 'CSS selector for the input element',
      optional: false
    },
    text: {
      type: 'string',
      description: 'Text to type',
      optional: false
    },
    clear: {
      type: 'boolean',
      description: 'Clear existing text first (default: true)',
      optional: true
    },
    delay: {
      type: 'number',
      description: 'Delay between keystrokes in ms (default: 0)',
      optional: true
    }
  };

  async execute(params: { selector: string; text: string; clear?: boolean; delay?: number }): Promise<string> {
    if (!params.selector || typeof params.selector !== 'string' || !params.selector.trim()) {
      return 'Error: CSS selector is required';
    }
    if (params.text === undefined || params.text === null) {
      return 'Error: Text to type is required';
    }

    const page = await getPage();
    if (!page) return 'Error: Browser not launched.';

    try {
      await page.waitForSelector(params.selector, { visible: true, timeout: 10000 });

      if (params.clear !== false) {
        await page.click(params.selector, { clickCount: 3 });
      }

      const textToType = String(params.text);
      await page.type(params.selector, textToType, { delay: params.delay || 0 });
      return `Typed "${params.text}" into ${params.selector}`;
    } catch (error: any) {
      return `Error typing: ${error.message}`;
    }
  }
}

/**
 * Browser Screenshot Tool
 */
export class BrowserScreenshotTool implements Tool {
  name = 'browser_screenshot';
  description = 'Take a screenshot of the current page';
  parameters = {
    path: {
      type: 'string',
      description: 'File path to save screenshot (default: screenshot.png)',
      optional: true
    },
    fullPage: {
      type: 'boolean',
      description: 'Capture full page (default: false)',
      optional: true
    },
    selector: {
      type: 'string',
      description: 'Capture specific element only',
      optional: true
    }
  };

  async execute(params: { path?: string; fullPage?: boolean; selector?: string }): Promise<string> {
    const page = await getPage();
    if (!page) return 'Error: Browser not launched.';

    try {
      const filePath = params.path || `screenshot-${Date.now()}.png`;

      if (params.selector) {
        const element = await page.$(params.selector);
        if (element) {
          await element.screenshot({ path: filePath });
        } else {
          return `Element not found: ${params.selector}`;
        }
      } else {
        await page.screenshot({ path: filePath, fullPage: params.fullPage || false });
      }

      return `Screenshot saved: ${filePath}`;
    } catch (error: any) {
      return `Error taking screenshot: ${error.message}`;
    }
  }
}

/**
 * Browser Get Content Tool
 */
export class BrowserGetContentTool implements Tool {
  name = 'browser_content';
  description = 'Get text content or HTML from the page';
  parameters = {
    selector: {
      type: 'string',
      description: 'CSS selector (default: body)',
      optional: true
    },
    type: {
      type: 'string',
      description: 'Content type: text, html, value (default: text)',
      optional: true
    }
  };

  async execute(params: { selector?: string; type?: string }): Promise<string> {
    const page = await getPage();
    if (!page) return 'Error: Browser not launched.';

    try {
      const selector = params.selector || 'body';
      const contentType = params.type || 'text';

      let content: string;
      if (contentType === 'html') {
        content = await page.$eval(selector, (el: Element) => el.innerHTML);
      } else if (contentType === 'value') {
        content = await page.$eval(selector, (el: HTMLInputElement) => el.value);
      } else {
        content = await page.$eval(selector, (el: Element) => el.textContent || '');
      }

      // Truncate if too long
      if (content.length > 5000) {
        content = content.substring(0, 5000) + '\n... (truncated)';
      }

      return content.trim();
    } catch (error: any) {
      return `Error getting content: ${error.message}`;
    }
  }
}

/**
 * Browser Evaluate Tool
 */
export class BrowserEvaluateTool implements Tool {
  name = 'browser_eval';
  description = 'Execute JavaScript in the browser context';
  parameters = {
    script: {
      type: 'string',
      description: 'JavaScript code to execute',
      optional: false
    }
  };

  async execute(params: { script: string }): Promise<string> {
    const page = await getPage();
    if (!page) return 'Error: Browser not launched.';

    try {
      const result = await page.evaluate(params.script);
      return typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
    } catch (error: any) {
      return `Error evaluating script: ${error.message}`;
    }
  }
}

/**
 * Browser Wait Tool
 */
export class BrowserWaitTool implements Tool {
  name = 'browser_wait';
  description = 'Wait for an element, navigation, or time';
  parameters = {
    selector: {
      type: 'string',
      description: 'CSS selector to wait for',
      optional: true
    },
    timeout: {
      type: 'number',
      description: 'Timeout in milliseconds (default: 30000)',
      optional: true
    },
    state: {
      type: 'string',
      description: 'Wait state: visible, hidden, attached, detached',
      optional: true
    }
  };

  async execute(params: { selector?: string; timeout?: number; state?: string }): Promise<string> {
    const page = await getPage();
    if (!page) return 'Error: Browser not launched.';

    try {
      const timeout = params.timeout || 30000;

      if (params.selector) {
        const options: any = { timeout };
        if (params.state === 'hidden') {
          options.hidden = true;
        } else {
          options.visible = true;
        }
        await page.waitForSelector(params.selector, options);
        return `Element found: ${params.selector}`;
      } else {
        await new Promise(resolve => setTimeout(resolve, timeout));
        return `Waited ${timeout}ms`;
      }
    } catch (error: any) {
      return `Wait failed: ${error.message}`;
    }
  }
}

/**
 * Browser Scroll Tool
 */
export class BrowserScrollTool implements Tool {
  name = 'browser_scroll';
  description = 'Scroll the page or to an element';
  parameters = {
    selector: {
      type: 'string',
      description: 'CSS selector to scroll to',
      optional: true
    },
    direction: {
      type: 'string',
      description: 'Scroll direction: up, down, top, bottom',
      optional: true
    },
    amount: {
      type: 'number',
      description: 'Pixels to scroll (default: 500)',
      optional: true
    }
  };

  async execute(params: { selector?: string; direction?: string; amount?: number }): Promise<string> {
    const page = await getPage();
    if (!page) return 'Error: Browser not launched.';

    try {
      if (params.selector) {
        await page.$eval(params.selector, (el: Element) => el.scrollIntoView({ behavior: 'smooth' }));
        return `Scrolled to: ${params.selector}`;
      }

      const amount = params.amount || 500;
      const direction = params.direction || 'down';

      switch (direction) {
        case 'up':
          await page.evaluate((px: number) => window.scrollBy(0, -px), amount);
          break;
        case 'down':
          await page.evaluate((px: number) => window.scrollBy(0, px), amount);
          break;
        case 'top':
          await page.evaluate(() => window.scrollTo(0, 0));
          break;
        case 'bottom':
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          break;
      }

      return `Scrolled ${direction}`;
    } catch (error: any) {
      return `Error scrolling: ${error.message}`;
    }
  }
}

/**
 * Browser Close Tool
 */
export class BrowserCloseTool implements Tool {
  name = 'browser_close';
  description = 'Close the browser instance';
  parameters = {};

  async execute(): Promise<string> {
    try {
      if (browser) {
        await browser.close();
        browser = null;
        currentPage = null;
        return 'Browser closed';
      }
      return 'No browser to close';
    } catch (error: any) {
      return `Error closing browser: ${error.message}`;
    }
  }
}
