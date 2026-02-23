import { BaseTool } from './base.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import chalk from 'chalk';
import { errorHandler } from '../utils/error-handler.js';
import { promises as dnsPromises } from 'dns';

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

async function validateUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }
  
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`URL scheme '${parsed.protocol}' is not allowed. Only http and https are permitted.`);
  }
  
  const hostname = parsed.hostname;
  
  // Resolve the hostname and check against private ranges
  try {
    const { address } = await dnsPromises.lookup(hostname);
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(address)) {
        throw new Error(`URL resolves to private/internal address '${address}' which is not allowed`);
      }
    }
  } catch (err: any) {
    if (err.message.includes('not allowed')) throw err;
    // DNS resolution failed - allow to proceed (remote URLs)
  }
  
  // Direct IP checks
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      throw new Error(`URL hostname '${hostname}' is a private/internal address which is not allowed`);
    }
  }
}

// Simple rate limiter
class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.timestamps[0]);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.timestamps.push(Date.now());
  }
}

// Shared rate limiter for web requests (10 requests per second)
const webRateLimiter = new RateLimiter(10, 1000);

export class WebFetchTool extends BaseTool {
  name = 'web_fetch';
  description = 'Fetch content from a URL';
  parameters = {
    url: { type: 'string', description: 'URL to fetch' },
    selector: { type: 'string', description: 'CSS selector to extract specific content', optional: true }
  };

  async execute(params: { url: string; selector?: string }): Promise<string> {
    if (!params.url || typeof params.url !== 'string') {
      throw new Error('Valid URL is required');
    }

    // SSRF protection - validates URL and resolves hostname
    await validateUrl(params.url);

    console.log(chalk.blue(`Fetching: ${params.url}`));

    // Apply rate limiting
    await webRateLimiter.acquire();

    // Use retry logic for network requests
    const response = await errorHandler.withRetry(
      async () => axios.get(params.url, {
        headers: {
          'User-Agent': 'Canvas-CLI/1.0'
        },
        timeout: 30000
      }),
      'web_fetch',
      {
        maxRetries: 3,
        onRetry: (attempt) => {
          console.log(chalk.yellow(`  Retrying (${attempt}/3)...`));
        }
      }
    );

    if (params.selector) {
      const $ = cheerio.load(response.data);
      const content = $(params.selector).text();
      console.log(chalk.green(`✓ Fetched content from ${params.url}`));
      return content;
    } else {
      console.log(chalk.green(`✓ Fetched ${params.url}`));
      return response.data;
    }
  }
}

export class WebSearchTool extends BaseTool {
  name = 'web_search';
  description = 'Search the web using DuckDuckGo';
  parameters = {
    query: { type: 'string', description: 'Search query' },
    limit: { type: 'number', description: 'Number of results', default: 5 }
  };

  async execute(params: { query: string; limit?: number }): Promise<any[]> {
    if (!params.query || typeof params.query !== 'string' || !params.query.trim()) {
      throw new Error('Search query is required');
    }

    const limit = Math.min(Math.max(params.limit || 5, 1), 20); // Clamp between 1-20
    console.log(chalk.blue(`Searching for: ${params.query}`));

    // Using DuckDuckGo HTML version for simplicity
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query.trim())}`;
    
    try {
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Canvas-CLI/1.0'
        }
      });

      const $ = cheerio.load(response.data);
      const results: any[] = [];

      $('.result').each((index: number, element: any) => {
        if (index >= limit) return false;
        
        const $result = $(element);
        const title = $result.find('.result__title').text().trim();
        const url = $result.find('.result__url').text().trim();
        const snippet = $result.find('.result__snippet').text().trim();
        
        if (title && url) {
          results.push({
            title,
            url: url.startsWith('http') ? url : `https://${url}`,
            snippet
          });
        }
      });

      console.log(chalk.green(`✓ Found ${results.length} search results`));
      return results;
    } catch (error) {
      console.error(chalk.red('Search failed:'), error);
      throw error;
    }
  }
}

export class APIRequestTool extends BaseTool {
  name = 'api_request';
  description = 'Make an API request';
  parameters = {
    url: { type: 'string', description: 'API endpoint URL' },
    method: { type: 'string', description: 'HTTP method', default: 'GET' },
    headers: { type: 'object', description: 'Request headers', optional: true },
    body: { type: 'any', description: 'Request body', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<any> {
    if (!params.url || typeof params.url !== 'string') {
      throw new Error('Valid URL is required');
    }

    // SSRF protection - validates URL and resolves hostname
    await validateUrl(params.url);

    // Validate HTTP method
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    const method = (params.method || 'GET').toUpperCase();
    if (!validMethods.includes(method)) {
      throw new Error(`Invalid HTTP method: ${params.method}`);
    }

    console.log(chalk.blue(`API ${method}: ${params.url}`));

    const response = await axios({
      url: params.url,
      method: method,
      headers: params.headers,
      data: params.body,
      timeout: 60000 // 60 second timeout for API calls
    });

    console.log(chalk.green(`✓ API request successful`));
    return response.data;
  }
}