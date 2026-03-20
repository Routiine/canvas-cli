/**
 * AI-Optimized Web Content Extraction
 *
 * Converts web pages to clean Markdown optimized for LLM consumption.
 * Uses @mozilla/readability for main content extraction + jsdom for parsing.
 *
 * Why: Cheerio returns raw HTML. LLMs work better with clean prose.
 * This reduces token usage by ~60-80% vs raw HTML while retaining semantics.
 */

import { Readability } from '@mozilla/readability';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — @types/jsdom not installed; jsdom is used at runtime only
import { JSDOM } from 'jsdom';
import { promises as dnsPromises } from 'dns';
import { BaseTool } from './base.js';

// SSRF protection — mirrors the check in web.ts (inlined to avoid circular dep)
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^0\./,
];

async function validateUrlSafe(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(
      `URL scheme '${parsed.protocol}' is not allowed. Only http and https are permitted.`
    );
  }

  const hostname = parsed.hostname;

  // Direct IP check before DNS resolution
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      throw new Error(
        `URL hostname '${hostname}' is a private/internal address which is not allowed`
      );
    }
  }

  // DNS resolution check
  try {
    const { address } = await dnsPromises.lookup(hostname);
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(address)) {
        throw new Error(
          `URL resolves to private/internal address '${address}' which is not allowed`
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not allowed')) throw err;
    // DNS resolution failed — allow to proceed for remote URLs
  }
}

export interface CrawledPage {
  url: string;
  title: string;
  content: string; // Clean prose, Markdown-formatted
  excerpt: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  wordCount: number;
  links: Array<{ href: string; text: string }>;
  images: Array<{ src: string; alt: string }>;
}

/**
 * Fetch a URL and return LLM-optimized content.
 * Strips nav, footer, ads, scripts — returns only the main content.
 */
export async function crawlForAI(
  url: string,
  opts: {
    includeLinks?: boolean;
    includeImages?: boolean;
    maxWords?: number;
  } = {}
): Promise<CrawledPage> {
  await validateUrlSafe(url);

  const { default: fetch } = await import('node-fetch');
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; Canvas-CLI/3.0; +https://canvas-cli.io)',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // Extract main content with Readability
  const reader = new Readability(doc as unknown as Document, {
    keepClasses: false,
    nbTopCandidates: 5,
  });
  const article = reader.parse();

  if (!article) {
    throw new Error(`Could not extract readable content from ${url}`);
  }

  // Convert HTML content to clean Markdown
  const content = htmlToMarkdown(article.content ?? '');

  // Apply word limit
  const words = content.split(/\s+/);
  const limitedContent =
    opts.maxWords && words.length > opts.maxWords
      ? words.slice(0, opts.maxWords).join(' ') + '\n\n[... content truncated ...]'
      : content;

  // Extract links and images from original DOM
  const links: CrawledPage['links'] = [];
  const images: CrawledPage['images'] = [];

  if (opts.includeLinks) {
    const anchors = Array.from(doc.querySelectorAll('a[href]')) as Element[];
    for (const a of anchors) {
      const anchor = a as HTMLAnchorElement;
      const href = anchor.href;
      const text = anchor.textContent?.trim() ?? '';
      if (href && text && !href.startsWith('javascript:')) {
        links.push({ href, text });
      }
    }
  }

  if (opts.includeImages) {
    const imgEls = Array.from(doc.querySelectorAll('img[src]')) as Element[];
    for (const img of imgEls) {
      const image = img as HTMLImageElement;
      const src = image.src;
      const alt = image.alt ?? '';
      if (src) images.push({ src, alt });
    }
  }

  return {
    url,
    title: article.title || doc.title || url,
    content: limitedContent,
    excerpt: (article.excerpt ?? '') || limitedContent.slice(0, 300),
    byline: article.byline || undefined,
    siteName: article.siteName || undefined,
    publishedTime: article.publishedTime || undefined,
    wordCount: words.length,
    links,
    images,
  };
}

/**
 * Batch crawl multiple URLs. Failures are skipped with a console warning.
 */
export async function crawlMultiple(
  urls: string[],
  opts: Parameters<typeof crawlForAI>[1] = {}
): Promise<CrawledPage[]> {
  const results = await Promise.allSettled(
    urls.map((url) => crawlForAI(url, opts))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<CrawledPage> => {
      if (r.status === 'rejected') {
        console.warn(`[web-ai] Skipping failed crawl: ${String(r.reason)}`);
      }
      return r.status === 'fulfilled';
    })
    .map((r) => r.value);
}

/**
 * Minimal HTML-to-Markdown converter for Readability output.
 * Handles the subset of tags Readability produces.
 */
function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h[4-6][^>]*>(.*?)<\/h[4-6]>/gi, '#### $1\n\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '_$1_')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '_$1_')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, '\n```\n$1\n```\n')
    .replace(/<a[^>]+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '') // strip remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export class WebAICrawlerTool extends BaseTool {
  name = 'web_crawl_ai';
  description =
    'Fetch a URL and return clean, LLM-optimized Markdown content. Strips navigation, ads, and boilerplate. Much cleaner than web_fetch for AI analysis.';
  parameters = {
    url: { type: 'string', description: 'URL to crawl' },
    include_links: {
      type: 'boolean',
      description: 'Include extracted links (default false)',
      optional: true,
    },
    include_images: {
      type: 'boolean',
      description: 'Include image list (default false)',
      optional: true,
    },
    max_words: {
      type: 'number',
      description: 'Maximum words to return (default: no limit)',
      optional: true,
    },
  };

  async execute(args: {
    url: string;
    include_links?: boolean;
    include_images?: boolean;
    max_words?: number;
  }): Promise<CrawledPage> {
    return crawlForAI(args.url, {
      includeLinks: args.include_links,
      includeImages: args.include_images,
      maxWords: args.max_words,
    });
  }
}
