/**
 * AST-Aware Code Analysis using tree-sitter
 *
 * Provides structure-aware code chunking and analysis across
 * JavaScript, TypeScript, Python, and other languages.
 *
 * Key improvement over line-based chunking: chunks are split at
 * function/class/block boundaries, never mid-statement.
 */

import type { Tool, ToolParameterDefinition } from '../types.js';
import path from 'path';
import fs from 'fs-extra';

// tree-sitter is a native CommonJS module — use createRequire for ESM compatibility
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

// Language detection by extension
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.cs': 'c_sharp',
  '.php': 'php',
};

export interface AstChunk {
  type: 'function' | 'class' | 'method' | 'block' | 'import' | 'export' | 'other';
  name?: string;
  startLine: number;
  endLine: number;
  text: string;
  language: string;
}

export interface AstAnalysis {
  language: string;
  functions: Array<{
    name: string;
    startLine: number;
    endLine: number;
    params: string[];
    returnType?: string;
  }>;
  classes: Array<{
    name: string;
    startLine: number;
    endLine: number;
    methods: string[];
  }>;
  imports: string[];
  exports: string[];
  complexity: number; // cyclomatic complexity estimate
  issues: Array<{ line: number; type: string; message: string }>;
}

// Parser and language instances are module-level singletons to avoid re-initialisation cost
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _parser: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _languageCache = new Map<string, any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadLanguage(langName: string): Promise<any | null> {
  if (_languageCache.has(langName)) return _languageCache.get(langName);

  try {
    // Grammars are separate npm packages: tree-sitter-javascript, etc.
    // Dynamic import works for ESM; fall back to require for CJS grammars.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let grammarModule: any;
    try {
      grammarModule = await import(`tree-sitter-${langName}` as string);
    } catch {
      grammarModule = _require(`tree-sitter-${langName}`);
    }
    const lang = grammarModule.default ?? grammarModule;
    _languageCache.set(langName, lang);
    return lang;
  } catch {
    // Grammar not installed — fall back to line-based chunking
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getParser(): any {
  if (!_parser) {
    const Parser = _require('tree-sitter');
    _parser = new Parser();
  }
  return _parser;
}

export function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_EXTENSIONS[ext] ?? null;
}

// ---------------------------------------------------------------------------
// Public: AST-aware file chunking
// ---------------------------------------------------------------------------

/**
 * Parse a file into AST-aware chunks.
 * Falls back to line-based chunks if the tree-sitter grammar is unavailable.
 */
export async function astChunkFile(
  filePath: string,
  content: string,
  maxLinesPerChunk = 80
): Promise<AstChunk[]> {
  const langName = detectLanguage(filePath);
  if (!langName) return lineBasedFallback(content, filePath);

  const lang = await loadLanguage(langName);
  if (!lang) return lineBasedFallback(content, filePath);

  try {
    const parser = getParser();
    parser.setLanguage(lang);
    const tree = parser.parse(content);
    return extractChunks(tree.rootNode, content, langName, maxLinesPerChunk);
  } catch {
    return lineBasedFallback(content, filePath);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractChunks(
  node: any,
  source: string,
  language: string,
  maxLines: number
): AstChunk[] {
  const chunks: AstChunk[] = [];
  const lines = source.split('\n');

  // Walk top-level nodes, grouping small ones and recursively splitting large ones
  for (const child of node.children as any[]) {
    const startLine: number = child.startPosition.row + 1;
    const endLine: number = child.endPosition.row + 1;
    const nodeLines = endLine - startLine + 1;
    const text = lines.slice(startLine - 1, endLine).join('\n');

    if (!text.trim()) continue;

    const type = classifyNodeType(child.type as string);
    const name = extractNodeName(child, source);

    if (nodeLines <= maxLines) {
      chunks.push({ type, name, startLine, endLine, text, language });
    } else {
      // Recursively split large nodes at their children
      const subChunks = extractChunks(child, source, language, maxLines);
      if (subChunks.length > 0) {
        chunks.push(...subChunks);
      } else {
        // Cannot split further — include as-is
        chunks.push({ type, name, startLine, endLine, text, language });
      }
    }
  }

  return chunks;
}

function classifyNodeType(treeType: string): AstChunk['type'] {
  if (/function|method|arrow/.test(treeType)) return 'function';
  if (/class/.test(treeType)) return 'class';
  if (/import/.test(treeType)) return 'import';
  if (/export/.test(treeType)) return 'export';
  if (/block|body/.test(treeType)) return 'block';
  return 'other';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractNodeName(node: any, source: string): string | undefined {
  const nameNode =
    node.childForFieldName('name') ??
    (node.children as any[]).find(
      (c: any) => c.type === 'identifier' || c.type === 'property_identifier'
    );
  if (!nameNode) return undefined;
  return source.slice(nameNode.startIndex as number, nameNode.endIndex as number);
}

function lineBasedFallback(content: string, filePath: string): AstChunk[] {
  const lines = content.split('\n');
  const CHUNK = 80;
  const OVERLAP = 10;
  const chunks: AstChunk[] = [];

  for (let i = 0; i < lines.length; i += CHUNK - OVERLAP) {
    const slice = lines.slice(i, Math.min(i + CHUNK, lines.length));
    if (slice.some(l => l.trim())) {
      chunks.push({
        type: 'other',
        startLine: i + 1,
        endLine: Math.min(i + CHUNK, lines.length),
        text: slice.join('\n'),
        language: path.extname(filePath).slice(1) || 'text',
      });
    }
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Public: AST-based file analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a file for code structure and quality issues using AST parsing.
 * Falls back to zero-result analysis if the grammar is unavailable.
 */
export async function analyzeFile(
  filePath: string,
  content: string
): Promise<AstAnalysis> {
  const langName = detectLanguage(filePath) ?? 'unknown';
  const functions: AstAnalysis['functions'] = [];
  const classes: AstAnalysis['classes'] = [];
  const imports: string[] = [];
  const exports: string[] = [];
  const issues: AstAnalysis['issues'] = [];
  let complexity = 1; // base complexity

  const lang = langName !== 'unknown' ? await loadLanguage(langName) : null;

  if (lang) {
    try {
      const parser = getParser();
      parser.setLanguage(lang);
      const tree = parser.parse(content);

      walkNode(tree.rootNode, content, { functions, classes, imports, exports, issues });

      // Cyclomatic complexity: count branching decision points
      const decisionKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch', '&&', '||', '?'];
      for (const kw of decisionKeywords) {
        // Split and count occurrences, capped per keyword to avoid runaway scores
        const count = content.split(kw).length - 1;
        complexity += Math.min(count, 20);
      }
    } catch {
      // Leave collections empty; language reported but AST walk failed
    }
  }

  return { language: langName, functions, classes, imports, exports, complexity, issues };
}

interface WalkAccumulator {
  functions: AstAnalysis['functions'];
  classes: AstAnalysis['classes'];
  imports: string[];
  exports: string[];
  issues: AstAnalysis['issues'];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkNode(node: any, source: string, acc: WalkAccumulator): void {
  const nodeType: string = node.type;

  if (
    nodeType === 'function_declaration' ||
    nodeType === 'method_definition' ||
    nodeType === 'arrow_function' ||
    nodeType === 'function_expression'
  ) {
    const nameNode = node.childForFieldName('name');
    const name: string = nameNode
      ? source.slice(nameNode.startIndex as number, nameNode.endIndex as number)
      : '<anonymous>';
    const startLine: number = node.startPosition.row + 1;
    const endLine: number = node.endPosition.row + 1;
    const length = endLine - startLine;

    acc.functions.push({ name, startLine, endLine, params: [] });

    if (length > 60) {
      acc.issues.push({
        line: startLine,
        type: 'complexity',
        message: `Function '${name}' is ${length} lines long (consider splitting at 40)`,
      });
    }
  }

  if (nodeType === 'class_declaration' || nodeType === 'class') {
    const nameNode = node.childForFieldName('name');
    const name: string = nameNode
      ? source.slice(nameNode.startIndex as number, nameNode.endIndex as number)
      : '<anonymous>';
    acc.classes.push({
      name,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      methods: [],
    });
  }

  if (nodeType === 'import_statement' || nodeType === 'import_declaration') {
    acc.imports.push(
      source.slice(node.startIndex as number, node.endIndex as number).split('\n')[0]
    );
  }

  if (nodeType === 'export_statement' || nodeType === 'export_declaration') {
    acc.exports.push(
      source.slice(node.startIndex as number, node.endIndex as number).split('\n')[0]
    );
  }

  for (const child of node.children as any[]) {
    walkNode(child, source, acc);
  }
}

// ---------------------------------------------------------------------------
// Tool class
// ---------------------------------------------------------------------------

export class AstAnalyzerTool implements Tool {
  name = 'ast_analyze';
  description =
    'Analyze code file structure using AST parsing. Returns functions, classes, imports, complexity score, and quality issues. Supports JS/TS/Python/Go/Rust/Java when the corresponding tree-sitter grammar is installed; falls back gracefully otherwise.';
  parameters: Record<string, ToolParameterDefinition> = {
    file_path: {
      type: 'string',
      description: 'Absolute path to the file to analyze',
      optional: false,
    },
    content: {
      type: 'string',
      description: 'File content to analyze directly (reads from disk when omitted)',
      optional: true,
    },
  };

  async execute(args: { file_path: string; content?: string }): Promise<string> {
    const fileContent = args.content ?? (await fs.readFile(args.file_path, 'utf-8'));
    const analysis = await analyzeFile(args.file_path, fileContent);
    return formatAnalysis(analysis, args.file_path);
  }
}

function formatAnalysis(analysis: AstAnalysis, filePath: string): string {
  const lines: string[] = [];
  lines.push(`AST Analysis: ${path.basename(filePath)}`);
  lines.push('='.repeat(50));
  lines.push(`Language : ${analysis.language}`);
  lines.push(`Complexity: ${analysis.complexity} (cyclomatic estimate)`);
  lines.push('');

  if (analysis.functions.length > 0) {
    lines.push(`Functions (${analysis.functions.length}):`);
    for (const fn of analysis.functions) {
      lines.push(`  ${fn.name}  [lines ${fn.startLine}-${fn.endLine}]`);
    }
    lines.push('');
  }

  if (analysis.classes.length > 0) {
    lines.push(`Classes (${analysis.classes.length}):`);
    for (const cls of analysis.classes) {
      lines.push(`  ${cls.name}  [lines ${cls.startLine}-${cls.endLine}]`);
    }
    lines.push('');
  }

  if (analysis.imports.length > 0) {
    lines.push(`Imports (${analysis.imports.length}):`);
    for (const imp of analysis.imports.slice(0, 10)) {
      lines.push(`  ${imp}`);
    }
    if (analysis.imports.length > 10) {
      lines.push(`  ... and ${analysis.imports.length - 10} more`);
    }
    lines.push('');
  }

  if (analysis.issues.length > 0) {
    lines.push(`Issues (${analysis.issues.length}):`);
    for (const issue of analysis.issues) {
      lines.push(`  [${issue.type}] Line ${issue.line}: ${issue.message}`);
    }
    lines.push('');
  } else {
    lines.push('Issues: none');
  }

  return lines.join('\n');
}
