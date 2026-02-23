/**
 * Code Review Agent - Automated code analysis and review
 * Similar to Kilo Code's code review capabilities
 */

import type { Tool } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

interface ReviewIssue {
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  category: string;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

// Code smell patterns
const CODE_PATTERNS: Array<{
  pattern: RegExp;
  severity: ReviewIssue['severity'];
  category: string;
  message: string;
  suggestion?: string;
}> = [
  // Security issues
  {
    pattern: /eval\s*\(/,
    severity: 'error',
    category: 'security',
    message: 'Avoid using eval() - potential code injection risk',
    suggestion: 'Use safer alternatives like JSON.parse() or Function constructor'
  },
  {
    pattern: /innerHTML\s*=/,
    severity: 'warning',
    category: 'security',
    message: 'innerHTML can lead to XSS vulnerabilities',
    suggestion: 'Use textContent or sanitize input before using innerHTML'
  },
  {
    pattern: /document\.write/,
    severity: 'warning',
    category: 'security',
    message: 'document.write is deprecated and can cause issues',
    suggestion: 'Use DOM manipulation methods instead'
  },
  {
    pattern: /new\s+Function\s*\(/,
    severity: 'warning',
    category: 'security',
    message: 'Dynamic function creation can be dangerous',
  },
  // Performance issues
  {
    pattern: /\.forEach\(.*await/,
    severity: 'warning',
    category: 'performance',
    message: 'await inside forEach does not work as expected',
    suggestion: 'Use for...of loop or Promise.all() for parallel execution'
  },
  {
    pattern: /SELECT\s+\*/i,
    severity: 'info',
    category: 'performance',
    message: 'Avoid SELECT * in production queries',
    suggestion: 'Specify only the columns you need'
  },
  // Code quality
  {
    pattern: /console\.(log|debug|info)\(/,
    severity: 'info',
    category: 'quality',
    message: 'Console statement found - remove before production',
  },
  {
    pattern: /TODO|FIXME|HACK|XXX/,
    severity: 'info',
    category: 'quality',
    message: 'TODO/FIXME comment found - address before release',
  },
  {
    pattern: /catch\s*\([^)]*\)\s*{\s*}/,
    severity: 'warning',
    category: 'quality',
    message: 'Empty catch block silently swallows errors',
    suggestion: 'Log the error or handle it appropriately'
  },
  {
    pattern: /==(?!=)/,
    severity: 'info',
    category: 'quality',
    message: 'Use === instead of == for strict equality',
  },
  {
    pattern: /!=(?!=)/,
    severity: 'info',
    category: 'quality',
    message: 'Use !== instead of != for strict inequality',
  },
  // Magic numbers
  {
    pattern: /(?<![.\w])\d{4,}(?!\d)/,
    severity: 'info',
    category: 'quality',
    message: 'Magic number detected - consider using a named constant',
  },
  // Long lines
  {
    pattern: /^.{120,}$/m,
    severity: 'info',
    category: 'style',
    message: 'Line exceeds 120 characters',
    suggestion: 'Break into multiple lines for readability'
  },
  // Duplicate code detection (simple)
  {
    pattern: /(\b\w+\b)(?:\s*,\s*\1){3,}/,
    severity: 'info',
    category: 'quality',
    message: 'Possible code duplication detected',
  },
  // TypeScript specific
  {
    pattern: /:\s*any\b/,
    severity: 'warning',
    category: 'typescript',
    message: 'Avoid using "any" type - loses type safety',
    suggestion: 'Use a more specific type or unknown'
  },
  {
    pattern: /@ts-ignore/,
    severity: 'warning',
    category: 'typescript',
    message: '@ts-ignore suppresses type errors - fix the underlying issue',
  },
  {
    pattern: /as\s+any\b/,
    severity: 'warning',
    category: 'typescript',
    message: 'Type assertion to "any" bypasses type checking',
  },
  // React specific
  {
    pattern: /dangerouslySetInnerHTML/,
    severity: 'warning',
    category: 'security',
    message: 'dangerouslySetInnerHTML can cause XSS vulnerabilities',
    suggestion: 'Sanitize HTML content before rendering'
  },
  {
    pattern: /useEffect\(\s*\(\)\s*=>\s*{[^}]*}\s*\)/,
    severity: 'info',
    category: 'react',
    message: 'useEffect with empty dependency array runs only once',
  },
];

/**
 * Analyze a file for issues
 */
async function analyzeFile(filePath: string): Promise<ReviewIssue[]> {
  const issues: ReviewIssue[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const { pattern, severity, category, message, suggestion } of CODE_PATTERNS) {
        if (pattern.test(line)) {
          issues.push({
            severity,
            category,
            file: filePath,
            line: i + 1,
            message,
            suggestion
          });
        }
      }
    }

    // Check for long functions (simple heuristic)
    let braceCount = 0;
    let functionStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/function\s+\w+|=>\s*{|{\s*$/.test(line)) {
        if (braceCount === 0) functionStart = i;
      }

      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (braceCount === 0 && functionStart >= 0) {
        const functionLength = i - functionStart;
        if (functionLength > 50) {
          issues.push({
            severity: 'info',
            category: 'quality',
            file: filePath,
            line: functionStart + 1,
            message: `Function is ${functionLength} lines - consider breaking into smaller functions`,
            suggestion: 'Extract logic into helper functions'
          });
        }
        functionStart = -1;
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return issues;
}

/**
 * Code Review Tool
 */
export class CodeReviewTool implements Tool {
  name = 'code_review';
  description = 'Perform automated code review on files or directories';
  parameters = {
    path: {
      type: 'string',
      description: 'File or directory to review',
      optional: false
    },
    severity: {
      type: 'string',
      description: 'Minimum severity: error, warning, info, suggestion',
      optional: true
    },
    category: {
      type: 'string',
      description: 'Filter by category: security, performance, quality, typescript, react',
      optional: true
    }
  };

  async execute(params: { path: string; severity?: string; category?: string }): Promise<string> {
    const targetPath = params.path;
    const allIssues: ReviewIssue[] = [];

    const severityOrder = ['error', 'warning', 'info', 'suggestion'];
    const minSeverityIndex = params.severity ? severityOrder.indexOf(params.severity) : 3;

    const stat = await fs.stat(targetPath);

    if (stat.isDirectory()) {
      // Review all files in directory
      const files = await this.getCodeFiles(targetPath);
      for (const file of files) {
        const issues = await analyzeFile(file);
        allIssues.push(...issues);
      }
    } else {
      const issues = await analyzeFile(targetPath);
      allIssues.push(...issues);
    }

    // Filter by severity
    let filteredIssues = allIssues.filter(issue => {
      const issueIndex = severityOrder.indexOf(issue.severity);
      return issueIndex <= minSeverityIndex;
    });

    // Filter by category
    if (params.category) {
      filteredIssues = filteredIssues.filter(issue => issue.category === params.category);
    }

    if (filteredIssues.length === 0) {
      return '✓ No issues found';
    }

    // Group by file
    const byFile = new Map<string, ReviewIssue[]>();
    for (const issue of filteredIssues) {
      const existing = byFile.get(issue.file) || [];
      existing.push(issue);
      byFile.set(issue.file, existing);
    }

    const severityEmoji: Record<string, string> = {
      error: '🔴',
      warning: '🟡',
      info: '🔵',
      suggestion: '💡'
    };

    let output = `Code Review: ${filteredIssues.length} issue(s) found\n`;
    output += '='.repeat(50) + '\n\n';

    for (const [file, issues] of byFile) {
      output += `📄 ${file}\n`;
      for (const issue of issues.sort((a, b) => (a.line || 0) - (b.line || 0))) {
        const emoji = severityEmoji[issue.severity];
        output += `  ${emoji} Line ${issue.line || '?'}: ${issue.message}\n`;
        if (issue.suggestion) {
          output += `     → ${issue.suggestion}\n`;
        }
      }
      output += '\n';
    }

    // Summary
    const counts = {
      error: filteredIssues.filter(i => i.severity === 'error').length,
      warning: filteredIssues.filter(i => i.severity === 'warning').length,
      info: filteredIssues.filter(i => i.severity === 'info').length,
      suggestion: filteredIssues.filter(i => i.severity === 'suggestion').length
    };

    output += 'Summary: ';
    output += Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .map(([sev, count]) => `${count} ${sev}`)
      .join(', ');

    return output;
  }

  private async getCodeFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
    const ignorePatterns = ['node_modules', 'dist', 'build', '.git'];

    const walk = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (ignorePatterns.some(pattern => fullPath.includes(pattern))) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (codeExtensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    };

    await walk(dir);
    return files;
  }
}

/**
 * Review Diff Tool - Review only changed code
 */
export class ReviewDiffTool implements Tool {
  name = 'review_diff';
  description = 'Review only changed/staged code (git diff)';
  parameters = {
    staged: {
      type: 'boolean',
      description: 'Review staged changes only (default: false)',
      optional: true
    },
    branch: {
      type: 'string',
      description: 'Compare with branch (default: HEAD)',
      optional: true
    }
  };

  async execute(params: { staged?: boolean; branch?: string }): Promise<string> {
    let diffCommand = 'git diff';
    if (params.staged) {
      diffCommand = 'git diff --staged';
    } else if (params.branch) {
      diffCommand = `git diff ${params.branch}...HEAD`;
    }

    try {
      const { stdout: diff } = await execAsync(diffCommand);

      if (!diff.trim()) {
        return 'No changes to review';
      }

      const issues: ReviewIssue[] = [];
      const lines = diff.split('\n');
      let currentFile = '';
      let lineNumber = 0;

      for (const line of lines) {
        // Track current file
        const fileMatch = line.match(/^\+\+\+ b\/(.+)/);
        if (fileMatch) {
          currentFile = fileMatch[1];
          continue;
        }

        // Track line numbers
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
        if (hunkMatch) {
          lineNumber = parseInt(hunkMatch[1]) - 1;
          continue;
        }

        // Only check added lines
        if (line.startsWith('+') && !line.startsWith('+++')) {
          lineNumber++;
          const addedContent = line.substring(1);

          for (const { pattern, severity, category, message, suggestion } of CODE_PATTERNS) {
            if (pattern.test(addedContent)) {
              issues.push({
                severity,
                category,
                file: currentFile,
                line: lineNumber,
                message,
                suggestion
              });
            }
          }
        } else if (!line.startsWith('-')) {
          lineNumber++;
        }
      }

      if (issues.length === 0) {
        return '✓ No issues in changed code';
      }

      const severityEmoji: Record<string, string> = {
        error: '🔴',
        warning: '🟡',
        info: '🔵',
        suggestion: '💡'
      };

      let output = `Review of changes: ${issues.length} issue(s)\n`;
      output += '='.repeat(40) + '\n\n';

      for (const issue of issues) {
        const emoji = severityEmoji[issue.severity];
        output += `${emoji} ${issue.file}:${issue.line}\n`;
        output += `   ${issue.message}\n`;
        if (issue.suggestion) {
          output += `   → ${issue.suggestion}\n`;
        }
        output += '\n';
      }

      return output;
    } catch (error: any) {
      return `Error getting diff: ${error.message}`;
    }
  }
}

/**
 * Review PR Tool
 */
export class ReviewPRTool implements Tool {
  name = 'review_pr';
  description = 'Review a GitHub pull request';
  parameters = {
    pr: {
      type: 'string',
      description: 'PR number or URL',
      optional: false
    },
    repo: {
      type: 'string',
      description: 'Repository (owner/repo) - auto-detected if in git repo',
      optional: true
    }
  };

  async execute(params: { pr: string; repo?: string }): Promise<string> {
    try {
      // Get PR diff using gh CLI
      const prNumber = params.pr.match(/\d+/)?.[0] || params.pr;
      const { stdout: diff } = await execAsync(`gh pr diff ${prNumber}`);

      if (!diff.trim()) {
        return 'No changes in PR';
      }

      // Analyze the diff (similar to review_diff)
      const issues: ReviewIssue[] = [];
      const lines = diff.split('\n');
      let currentFile = '';
      let lineNumber = 0;

      for (const line of lines) {
        const fileMatch = line.match(/^\+\+\+ b\/(.+)/);
        if (fileMatch) {
          currentFile = fileMatch[1];
          continue;
        }

        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
        if (hunkMatch) {
          lineNumber = parseInt(hunkMatch[1]) - 1;
          continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
          lineNumber++;
          const addedContent = line.substring(1);

          for (const { pattern, severity, category, message } of CODE_PATTERNS) {
            if (pattern.test(addedContent)) {
              issues.push({ severity, category, file: currentFile, line: lineNumber, message });
            }
          }
        } else if (!line.startsWith('-')) {
          lineNumber++;
        }
      }

      // Get PR info
      const { stdout: prInfo } = await execAsync(`gh pr view ${prNumber} --json title,author,additions,deletions`);
      const pr = JSON.parse(prInfo);

      let output = `PR #${prNumber}: ${pr.title}\n`;
      output += `Author: ${pr.author.login}\n`;
      output += `Changes: +${pr.additions} -${pr.deletions}\n`;
      output += '='.repeat(40) + '\n\n';

      if (issues.length === 0) {
        output += '✓ No issues found in PR changes';
      } else {
        output += `Found ${issues.length} issue(s):\n\n`;
        for (const issue of issues) {
          output += `• ${issue.file}:${issue.line} - ${issue.message}\n`;
        }
      }

      return output;
    } catch (error: any) {
      return `Error reviewing PR: ${error.message}`;
    }
  }
}
