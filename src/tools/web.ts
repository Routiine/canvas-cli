import { BaseTool } from './base.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import chalk from 'chalk';

export class WebFetchTool extends BaseTool {
  name = 'web_fetch';
  description = 'Fetch content from a URL';
  parameters = {
    url: { type: 'string', description: 'URL to fetch' },
    selector: { type: 'string', description: 'CSS selector to extract specific content', optional: true }
  };

  async execute(params: { url: string; selector?: string }): Promise<string> {
    console.log(chalk.blue(`Fetching: ${params.url}`));
    
    const response = await axios.get(params.url, {
      headers: {
        'User-Agent': 'Canvas-CLI/1.0'
      }
    });

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
    const limit = params.limit || 5;
    console.log(chalk.blue(`Searching for: ${params.query}`));
    
    // Using DuckDuckGo HTML version for simplicity
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`;
    
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
    console.log(chalk.blue(`API ${params.method || 'GET'}: ${params.url}`));
    
    const response = await axios({
      url: params.url,
      method: params.method || 'GET',
      headers: params.headers,
      data: params.body
    });

    console.log(chalk.green(`✓ API request successful`));
    return response.data;
  }
}