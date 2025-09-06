import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

interface SearchOptions {
  query: string;
  limit?: number;
  includeCode?: boolean;
  fuzzy?: boolean;
}

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  relevance: number;
  codeExamples?: string[];
}

export class KnowledgeSearchTool extends BaseTool {
  name = 'knowledge_search';
  description = 'Search through crawled documentation and knowledge base';
  parameters = {
    query: { type: 'string', description: 'Search query', required: true },
    limit: { type: 'number', description: 'Maximum results to show', optional: true },
    includeCode: { type: 'boolean', description: 'Include code examples', optional: true },
    fuzzy: { type: 'boolean', description: 'Enable fuzzy matching', optional: true }
  };

  private knowledgeDir: string = '.canvas-knowledge';

  constructor() {
    super();
  }

  async execute(options: SearchOptions): Promise<any> {
    const config = {
      limit: options.limit || 10,
      includeCode: options.includeCode !== false,
      fuzzy: options.fuzzy !== false,
      ...options
    };

    console.log(chalk.cyan(`🔍 Searching knowledge base for: "${config.query}"`));

    // Check if knowledge directory exists
    if (!await fs.pathExists(this.knowledgeDir)) {
      console.log(chalk.yellow('⚠️  No knowledge base found. Run "canvas crawl <url>" first.'));
      return { results: [], message: 'No knowledge base found' };
    }

    // Load index
    const indexPath = path.join(this.knowledgeDir, 'index.json');
    if (!await fs.pathExists(indexPath)) {
      return { results: [], message: 'Knowledge base index not found' };
    }

    const index = await fs.readJSON(indexPath);
    const results: SearchResult[] = [];

    // Search through all pages
    for (const pageInfo of index.pages) {
      const pageHash = this.hashUrl(pageInfo.url);
      const pagePath = path.join(this.knowledgeDir, `${pageHash}.json`);

      if (await fs.pathExists(pagePath)) {
        const page = await fs.readJSON(pagePath);
        
        // Calculate relevance
        const relevance = this.calculateRelevance(
          config.query,
          page.title + ' ' + page.content,
          config.fuzzy
        );

        if (relevance > 0) {
          const result: SearchResult = {
            url: page.url,
            title: page.title,
            snippet: this.extractSnippet(page.content, config.query),
            relevance
          };

          // Include code examples if requested
          if (config.includeCode && page.codeSnippets?.length > 0) {
            result.codeExamples = this.findRelevantCode(
              page.codeSnippets,
              config.query
            );
          }

          results.push(result);
        }
      }
    }

    // Sort by relevance and limit
    results.sort((a, b) => b.relevance - a.relevance);
    const topResults = results.slice(0, config.limit);

    // Display results
    this.displayResults(topResults);

    return {
      query: config.query,
      totalResults: results.length,
      results: topResults
    };
  }

  private calculateRelevance(query: string, content: string, fuzzy: boolean): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();
    let relevance = 0;

    for (const term of queryTerms) {
      if (fuzzy) {
        // Fuzzy matching - partial word matches
        const regex = new RegExp(term.split('').join('.*'), 'gi');
        const matches = contentLower.match(regex);
        relevance += matches ? matches.length * 0.5 : 0;
      } else {
        // Exact word matching
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        const matches = contentLower.match(regex);
        relevance += matches ? matches.length : 0;
      }
    }

    return relevance;
  }

  private extractSnippet(content: string, query: string, contextLength: number = 150): string {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const contentLower = content.toLowerCase();

    // Find first occurrence of any query term
    let bestIndex = -1;
    for (const term of queryTerms) {
      const index = contentLower.indexOf(term);
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index;
      }
    }

    if (bestIndex === -1) {
      // No match found, return beginning of content
      return content.substring(0, contextLength) + '...';
    }

    // Extract snippet around the match
    const start = Math.max(0, bestIndex - contextLength / 2);
    const end = Math.min(content.length, bestIndex + contextLength / 2);
    
    let snippet = content.substring(start, end);
    
    // Add ellipsis if needed
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    // Highlight query terms
    for (const term of queryTerms) {
      const regex = new RegExp(`(${term})`, 'gi');
      snippet = snippet.replace(regex, chalk.yellow('$1'));
    }

    return snippet;
  }

  private findRelevantCode(codeSnippets: string[], query: string): string[] {
    const relevant: string[] = [];
    const queryLower = query.toLowerCase();

    for (const snippet of codeSnippets) {
      const snippetLower = snippet.toLowerCase();
      
      // Check if code contains query terms
      if (queryLower.split(/\s+/).some(term => snippetLower.includes(term))) {
        relevant.push(snippet);
        if (relevant.length >= 3) break; // Limit to 3 code examples
      }
    }

    return relevant;
  }

  private displayResults(results: SearchResult[]): void {
    if (results.length === 0) {
      console.log(chalk.yellow('No results found.'));
      return;
    }

    console.log(chalk.green(`\n📚 Found ${results.length} results:\n`));

    for (const [index, result] of results.entries()) {
      console.log(chalk.cyan(`${index + 1}. ${result.title}`));
      console.log(chalk.dim(`   ${result.url}`));
      console.log(`   ${result.snippet}`);
      
      if (result.codeExamples && result.codeExamples.length > 0) {
        console.log(chalk.dim('   📝 Code examples available'));
      }
      
      console.log('');
    }
  }

  private hashUrl(url: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }
}