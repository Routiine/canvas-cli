import { BaseTool } from './base.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import crypto from 'crypto';

interface CrawlOptions {
  url: string;
  maxDepth?: number;
  maxPages?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  extractCode?: boolean;
  extractLinks?: boolean;
  saveToFile?: boolean;
}

interface CrawledPage {
  url: string;
  title: string;
  content: string;
  codeSnippets: string[];
  links: string[];
  timestamp: Date;
  depth: number;
}

export class WebCrawlerTool extends BaseTool {
  name = 'web_crawler';
  description = 'Crawl websites and extract documentation, code examples, and content';
  parameters = {
    url: { type: 'string', description: 'URL to start crawling from', required: true },
    maxDepth: { type: 'number', description: 'Maximum crawl depth', optional: true },
    maxPages: { type: 'number', description: 'Maximum pages to crawl', optional: true },
    includePatterns: { type: 'array', description: 'Include URL patterns', optional: true },
    excludePatterns: { type: 'array', description: 'Exclude URL patterns', optional: true }
  };

  private visitedUrls: Set<string> = new Set();
  private crawledPages: CrawledPage[] = [];
  private pageCount: number = 0;
  private knowledgeDir: string = '.canvas-knowledge';

  constructor() {
    super();
  }

  async execute(options: CrawlOptions): Promise<any> {
    console.log(chalk.cyan('🕷️  Starting web crawler...'));
    
    // Reset for new crawl
    this.visitedUrls.clear();
    this.crawledPages = [];
    this.pageCount = 0;

    // Set defaults
    const config = {
      maxDepth: options.maxDepth || 3,
      maxPages: options.maxPages || 50,
      extractCode: options.extractCode !== false,
      extractLinks: options.extractLinks !== false,
      saveToFile: options.saveToFile !== false,
      ...options
    };

    // Ensure knowledge directory exists
    if (config.saveToFile) {
      await fs.ensureDir(this.knowledgeDir);
    }

    // Start crawling
    await this.crawlPage(config.url, config, 0);

    // Save crawled content
    if (config.saveToFile) {
      await this.saveKnowledge();
    }

    console.log(chalk.green(`✅ Crawled ${this.pageCount} pages successfully`));
    
    return {
      pagesCount: this.pageCount,
      pages: this.crawledPages,
      knowledgeDir: config.saveToFile ? this.knowledgeDir : null
    };
  }

  private async crawlPage(url: string, config: CrawlOptions, depth: number): Promise<void> {
    // Check limits
    if (depth > config.maxDepth! || this.pageCount >= config.maxPages!) {
      return;
    }

    // Skip if already visited
    const normalizedUrl = this.normalizeUrl(url);
    if (this.visitedUrls.has(normalizedUrl)) {
      return;
    }

    // Check include/exclude patterns
    if (!this.shouldCrawlUrl(url, config)) {
      return;
    }

    this.visitedUrls.add(normalizedUrl);
    this.pageCount++;

    console.log(chalk.dim(`  📄 Crawling (depth ${depth}): ${url}`));

    try {
      // Fetch page
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Canvas-CLI-Crawler/1.0'
        }
      });

      const html = response.data;
      const $ = cheerio.load(html);

      // Extract page content
      const page: CrawledPage = {
        url,
        title: $('title').text() || $('h1').first().text() || 'Untitled',
        content: this.extractTextContent($),
        codeSnippets: config.extractCode ? this.extractCodeSnippets($) : [],
        links: [],
        timestamp: new Date(),
        depth
      };

      // Extract links for further crawling
      if (config.extractLinks && depth < config.maxDepth!) {
        const links = this.extractLinks($, url);
        page.links = links;

        // Recursively crawl linked pages
        for (const link of links) {
          await this.crawlPage(link, config, depth + 1);
        }
      }

      this.crawledPages.push(page);

    } catch (error: any) {
      console.log(chalk.yellow(`  ⚠️  Failed to crawl ${url}: ${error.message}`));
    }
  }

  private extractTextContent($: cheerio.Root): string {
    // Remove script and style elements
    $('script, style, nav, header, footer').remove();

    // Extract main content areas
    const contentSelectors = [
      'main',
      'article', 
      '.content',
      '.documentation',
      '.markdown-body',
      '#content',
      '.post-content'
    ];

    let content = '';
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    // Fallback to body if no content area found
    if (!content) {
      content = $('body').text();
    }

    // Clean up whitespace
    return content
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000); // Limit content length
  }

  private extractCodeSnippets($: cheerio.Root): string[] {
    const snippets: string[] = [];

    // Extract from code blocks
    $('pre code, pre, code').each((_, element) => {
      const code = $(element).text().trim();
      if (code.length > 20 && code.length < 2000) {
        snippets.push(code);
      }
    });

    // Extract from highlighted code
    $('.highlight, .codehilite, .language-*').each((_, element) => {
      const code = $(element).text().trim();
      if (code.length > 20 && code.length < 2000 && !snippets.includes(code)) {
        snippets.push(code);
      }
    });

    return snippets;
  }

  private extractLinks($: cheerio.Root, baseUrl: string): string[] {
    const links: string[] = [];
    const baseUrlObj = new URL(baseUrl);

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href) return;

      try {
        // Resolve relative URLs
        const absoluteUrl = new URL(href, baseUrl).toString();
        
        // Only crawl same domain or subdomain
        const urlObj = new URL(absoluteUrl);
        if (urlObj.hostname === baseUrlObj.hostname || 
            urlObj.hostname.endsWith('.' + baseUrlObj.hostname)) {
          
          // Skip anchors, files, and non-HTML
          if (!absoluteUrl.includes('#') && 
              !absoluteUrl.match(/\.(pdf|zip|png|jpg|jpeg|gif|svg|mp4|mp3)$/i)) {
            links.push(absoluteUrl);
          }
        }
      } catch (error) {
        // Invalid URL, skip
      }
    });

    return [...new Set(links)]; // Remove duplicates
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove trailing slash and fragment
      return urlObj.origin + urlObj.pathname.replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  private shouldCrawlUrl(url: string, config: CrawlOptions): boolean {
    // Check include patterns
    if (config.includePatterns && config.includePatterns.length > 0) {
      const included = config.includePatterns.some(pattern => 
        url.includes(pattern) || new RegExp(pattern).test(url)
      );
      if (!included) return false;
    }

    // Check exclude patterns
    if (config.excludePatterns && config.excludePatterns.length > 0) {
      const excluded = config.excludePatterns.some(pattern => 
        url.includes(pattern) || new RegExp(pattern).test(url)
      );
      if (excluded) return false;
    }

    return true;
  }

  private async saveKnowledge(): Promise<void> {
    console.log(chalk.dim('  💾 Saving crawled knowledge...'));

    // Create index file
    const indexPath = path.join(this.knowledgeDir, 'index.json');
    const index = {
      crawledAt: new Date(),
      totalPages: this.pageCount,
      pages: this.crawledPages.map(p => ({
        url: p.url,
        title: p.title,
        hash: this.hashUrl(p.url)
      }))
    };

    await fs.writeJSON(indexPath, index, { spaces: 2 });

    // Save individual pages
    for (const page of this.crawledPages) {
      const pageHash = this.hashUrl(page.url);
      const pagePath = path.join(this.knowledgeDir, `${pageHash}.json`);
      
      await fs.writeJSON(pagePath, page, { spaces: 2 });

      // Save code snippets separately if present
      if (page.codeSnippets.length > 0) {
        const codePath = path.join(this.knowledgeDir, `${pageHash}-code.md`);
        const codeContent = page.codeSnippets.map((snippet, i) => 
          `## Code Snippet ${i + 1}\n\n\`\`\`\n${snippet}\n\`\`\`\n`
        ).join('\n');
        
        await fs.writeFile(codePath, codeContent);
      }
    }

    console.log(chalk.green(`  ✅ Knowledge saved to ${this.knowledgeDir}/`));
  }

  private hashUrl(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }
}