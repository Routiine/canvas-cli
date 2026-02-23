/**
 * Codebase Indexing - Semantic search and code understanding
 * Similar to Kilo Code's managed indexing capabilities
 */

import type { Tool } from '../types.js';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

interface CodeChunk {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  type: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'import' | 'export' | 'comment' | 'other';
  name?: string;
  signature?: string;
  hash: string;
}

interface CodebaseIndex {
  version: string;
  created: string;
  updated: string;
  root: string;
  files: number;
  chunks: CodeChunk[];
  symbols: Map<string, string[]>; // symbol name -> chunk IDs
}

// In-memory index cache
let currentIndex: CodebaseIndex | null = null;
const INDEX_FILE = '.canvas-index.json';
const INDEX_VERSION = '1.0.0';

// File patterns to index
const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.go',
  '.rs',
  '.java', '.kt', '.scala',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.vue', '.svelte',
  '.sql',
  '.graphql', '.gql'
];

const IGNORE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'venv', '.venv',
  'target', 'vendor', 'coverage', '.nyc_output'
];

/**
 * Parse code into chunks based on language
 */
function parseCodeChunks(content: string, filePath: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const ext = path.extname(filePath).toLowerCase();
  const lines = content.split('\n');

  // Simple regex-based parsing (could be enhanced with tree-sitter)
  const patterns: Record<string, RegExp[]> = {
    function: [
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/,
      /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\s*\([^)]*\)\s*=>/,
      /^def\s+(\w+)\s*\(/,  // Python
      /^func\s+(\w+)\s*\(/,  // Go
      /^fn\s+(\w+)\s*\(/,    // Rust
    ],
    class: [
      /^(?:export\s+)?class\s+(\w+)/,
      /^class\s+(\w+)\s*[:\(]/,  // Python
      /^type\s+(\w+)\s+struct\s*{/,  // Go
      /^struct\s+(\w+)\s*{/,  // Rust
    ],
    interface: [
      /^(?:export\s+)?interface\s+(\w+)/,
      /^(?:export\s+)?type\s+(\w+)\s*=/,
    ],
    method: [
      /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/,
      /^\s+(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/,
    ],
    import: [
      /^import\s+.*from\s+['"]([^'"]+)['"]/,
      /^import\s+['"]([^'"]+)['"]/,
      /^from\s+(\w+)\s+import/,  // Python
    ],
    export: [
      /^export\s+(?:default\s+)?(?:const|let|var|function|class)\s+(\w+)/,
      /^export\s*{([^}]+)}/,
    ]
  };

  let currentChunk: Partial<CodeChunk> | null = null;
  let braceCount = 0;
  let inMultilineComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Track multiline comments
    if (trimmedLine.startsWith('/*')) inMultilineComment = true;
    if (trimmedLine.endsWith('*/')) {
      inMultilineComment = false;
      continue;
    }
    if (inMultilineComment) continue;

    // Skip single-line comments
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) continue;

    // Check for pattern matches
    for (const [type, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        const match = line.match(regex);
        if (match) {
          // Save previous chunk
          if (currentChunk && currentChunk.content) {
            currentChunk.endLine = i;
            currentChunk.hash = crypto.createHash('md5').update(currentChunk.content).digest('hex').slice(0, 8);
            chunks.push(currentChunk as CodeChunk);
          }

          // Start new chunk
          currentChunk = {
            id: `${path.basename(filePath)}-${i + 1}`,
            file: filePath,
            startLine: i + 1,
            endLine: i + 1,
            content: line,
            type: type as CodeChunk['type'],
            name: match[1],
            signature: trimmedLine
          };
          braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
          break;
        }
      }
    }

    // Continue building current chunk
    if (currentChunk && i > currentChunk.startLine! - 1) {
      currentChunk.content += '\n' + line;
      braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

      // Check if chunk is complete (braces balanced for function/class/method)
      if (['function', 'class', 'method', 'interface'].includes(currentChunk.type!) && braceCount <= 0) {
        currentChunk.endLine = i + 1;
        currentChunk.hash = crypto.createHash('md5').update(currentChunk.content!).digest('hex').slice(0, 8);
        chunks.push(currentChunk as CodeChunk);
        currentChunk = null;
      }
    }
  }

  // Save final chunk
  if (currentChunk && currentChunk.content) {
    currentChunk.endLine = lines.length;
    currentChunk.hash = crypto.createHash('md5').update(currentChunk.content).digest('hex').slice(0, 8);
    chunks.push(currentChunk as CodeChunk);
  }

  return chunks;
}

/**
 * Build index for a directory
 */
async function buildIndex(rootDir: string): Promise<CodebaseIndex> {
  const chunks: CodeChunk[] = [];
  const symbols = new Map<string, string[]>();
  let fileCount = 0;

  async function indexDir(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      // Skip ignored patterns
      if (IGNORE_PATTERNS.some(pattern => relativePath.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        await indexDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.includes(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const fileChunks = parseCodeChunks(content, relativePath);
            chunks.push(...fileChunks);
            fileCount++;

            // Build symbol index
            for (const chunk of fileChunks) {
              if (chunk.name) {
                const existing = symbols.get(chunk.name) || [];
                existing.push(chunk.id);
                symbols.set(chunk.name, existing);
              }
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    }
  }

  await indexDir(rootDir);

  return {
    version: INDEX_VERSION,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    root: rootDir,
    files: fileCount,
    chunks,
    symbols
  };
}

/**
 * Search index for matching chunks
 */
function searchIndex(index: CodebaseIndex, query: string, options: {
  type?: string;
  file?: string;
  limit?: number;
}): CodeChunk[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);

  const results = index.chunks.filter(chunk => {
    // Filter by type if specified
    if (options.type && chunk.type !== options.type) return false;

    // Filter by file if specified
    if (options.file && !chunk.file.toLowerCase().includes(options.file.toLowerCase())) return false;

    // Search in name, signature, and content
    const searchText = [
      chunk.name || '',
      chunk.signature || '',
      chunk.content
    ].join(' ').toLowerCase();

    // All query words must match
    return queryWords.every(word => searchText.includes(word));
  });

  // Sort by relevance (name match > signature match > content match)
  results.sort((a, b) => {
    const aNameMatch = a.name?.toLowerCase().includes(queryLower) ? 3 : 0;
    const bNameMatch = b.name?.toLowerCase().includes(queryLower) ? 3 : 0;
    const aSigMatch = a.signature?.toLowerCase().includes(queryLower) ? 2 : 0;
    const bSigMatch = b.signature?.toLowerCase().includes(queryLower) ? 2 : 0;

    return (bNameMatch + bSigMatch) - (aNameMatch + aSigMatch);
  });

  return results.slice(0, options.limit || 20);
}

/**
 * Index Codebase Tool
 */
export class IndexCodebaseTool implements Tool {
  name = 'index_codebase';
  description = 'Build or rebuild the codebase index for semantic search';
  parameters = {
    path: {
      type: 'string',
      description: 'Root directory to index (default: current directory)',
      optional: true
    },
    force: {
      type: 'boolean',
      description: 'Force rebuild even if index exists (default: false)',
      optional: true
    }
  };

  async execute(params: { path?: string; force?: boolean }): Promise<string> {
    const rootDir = params.path || process.cwd();
    const indexPath = path.join(rootDir, INDEX_FILE);

    // Check for existing index
    if (!params.force && await fs.pathExists(indexPath)) {
      try {
        const existing = await fs.readJson(indexPath);
        if (existing.version === INDEX_VERSION) {
          currentIndex = existing;
          currentIndex!.symbols = new Map(Object.entries(existing.symbols || {}));
          return `Loaded existing index: ${existing.files} files, ${existing.chunks.length} chunks`;
        }
      } catch {
        // Rebuild if can't load
      }
    }

    const startTime = Date.now();
    currentIndex = await buildIndex(rootDir);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Save index to file
    const indexData = {
      ...currentIndex,
      symbols: Object.fromEntries(currentIndex.symbols)
    };
    await fs.writeJson(indexPath, indexData, { spaces: 2 });

    return `Indexed ${currentIndex.files} files, ${currentIndex.chunks.length} chunks in ${duration}s`;
  }
}

/**
 * Search Codebase Tool
 */
export class SearchCodebaseTool implements Tool {
  name = 'search_codebase';
  description = 'Search the codebase index for functions, classes, or code patterns';
  parameters = {
    query: {
      type: 'string',
      description: 'Search query (function name, class name, or keywords)',
      optional: false
    },
    type: {
      type: 'string',
      description: 'Filter by type: function, class, method, interface, import, export',
      optional: true
    },
    file: {
      type: 'string',
      description: 'Filter by file path pattern',
      optional: true
    },
    limit: {
      type: 'number',
      description: 'Max results (default: 10)',
      optional: true
    }
  };

  async execute(params: { query: string; type?: string; file?: string; limit?: number }): Promise<string> {
    if (!currentIndex) {
      // Try to load index
      const indexPath = path.join(process.cwd(), INDEX_FILE);
      if (await fs.pathExists(indexPath)) {
        const data = await fs.readJson(indexPath);
        currentIndex = data;
        currentIndex!.symbols = new Map(Object.entries(data.symbols || {}));
      } else {
        return 'No index found. Run index_codebase first.';
      }
    }

    const index = currentIndex!;
    const results = searchIndex(index, params.query, {
      type: params.type,
      file: params.file,
      limit: params.limit || 10
    });

    if (results.length === 0) {
      return `No results for "${params.query}"`;
    }

    let output = `Found ${results.length} result(s) for "${params.query}":\n\n`;

    for (const chunk of results) {
      output += `${chunk.type}: ${chunk.name || '(anonymous)'}\n`;
      output += `  File: ${chunk.file}:${chunk.startLine}-${chunk.endLine}\n`;
      if (chunk.signature && chunk.signature !== chunk.content.split('\n')[0]) {
        output += `  Signature: ${chunk.signature}\n`;
      }
      // Show first few lines of content
      const preview = chunk.content.split('\n').slice(0, 5).join('\n');
      output += `  Preview:\n    ${preview.split('\n').join('\n    ')}\n\n`;
    }

    return output;
  }
}

/**
 * Find Symbol Tool
 */
export class FindSymbolTool implements Tool {
  name = 'find_symbol';
  description = 'Find where a symbol (function, class, variable) is defined';
  parameters = {
    name: {
      type: 'string',
      description: 'Symbol name to find',
      optional: false
    },
    exact: {
      type: 'boolean',
      description: 'Exact match only (default: false)',
      optional: true
    }
  };

  async execute(params: { name: string; exact?: boolean }): Promise<string> {
    if (!currentIndex) {
      const indexPath = path.join(process.cwd(), INDEX_FILE);
      if (await fs.pathExists(indexPath)) {
        const data = await fs.readJson(indexPath);
        currentIndex = data;
        currentIndex!.symbols = new Map(Object.entries(data.symbols || {}));
      } else {
        return 'No index found. Run index_codebase first.';
      }
    }

    const index = currentIndex!;
    // Search symbols
    const matchingChunks: CodeChunk[] = [];

    if (params.exact) {
      const chunkIds = index.symbols.get(params.name);
      if (chunkIds) {
        for (const id of chunkIds) {
          const chunk = index.chunks.find(c => c.id === id);
          if (chunk) matchingChunks.push(chunk);
        }
      }
    } else {
      const queryLower = params.name.toLowerCase();
      for (const [symbol, chunkIds] of index.symbols.entries()) {
        if (symbol.toLowerCase().includes(queryLower)) {
          for (const id of chunkIds) {
            const chunk = index.chunks.find(c => c.id === id);
            if (chunk) matchingChunks.push(chunk);
          }
        }
      }
    }

    if (matchingChunks.length === 0) {
      return `Symbol "${params.name}" not found`;
    }

    let output = `Found ${matchingChunks.length} definition(s) for "${params.name}":\n\n`;

    for (const chunk of matchingChunks) {
      output += `${chunk.type} ${chunk.name}\n`;
      output += `  ${chunk.file}:${chunk.startLine}\n`;
      output += `  ${chunk.signature || chunk.content.split('\n')[0]}\n\n`;
    }

    return output;
  }
}

/**
 * Index Stats Tool
 */
export class IndexStatsTool implements Tool {
  name = 'index_stats';
  description = 'Show codebase index statistics';
  parameters = {};

  async execute(): Promise<string> {
    if (!currentIndex) {
      const indexPath = path.join(process.cwd(), INDEX_FILE);
      if (await fs.pathExists(indexPath)) {
        const data = await fs.readJson(indexPath);
        currentIndex = data;
        currentIndex!.symbols = new Map(Object.entries(data.symbols || {}));
      } else {
        return 'No index found. Run index_codebase first.';
      }
    }

    const index = currentIndex!;
    const typeCounts: Record<string, number> = {};
    for (const chunk of index.chunks) {
      typeCounts[chunk.type] = (typeCounts[chunk.type] || 0) + 1;
    }

    let output = 'Codebase Index Statistics\n';
    output += '='.repeat(40) + '\n\n';
    output += `Root: ${index.root}\n`;
    output += `Files indexed: ${index.files}\n`;
    output += `Total chunks: ${index.chunks.length}\n`;
    output += `Unique symbols: ${index.symbols.size}\n`;
    output += `Created: ${index.created}\n`;
    output += `Updated: ${index.updated}\n\n`;

    output += 'Chunks by type:\n';
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      output += `  ${type}: ${count}\n`;
    }

    return output;
  }
}
