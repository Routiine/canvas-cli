import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';
import { WORKSPACE_ROOT } from '../ollama/project-context.js';

/**
 * Fuzzy string-replace for LLM edits.
 *
 * LLMs often emit old_string with slightly wrong indentation or trailing
 * whitespace. This normalizes both the search string and a sliding window of
 * the file content to find a near-match, then applies the replacement at the
 * original (unnormalized) position in the file.
 *
 * Returns the updated file content, or null if no fuzzy match found.
 */
function fuzzyReplaceBlock(content: string, oldString: string, newString: string): string | null {
  const normalizeBlock = (s: string) =>
    s.split('\n').map(l => l.trimEnd()).join('\n').trim();

  const normOld = normalizeBlock(oldString);
  const oldLineCount = oldString.split('\n').length;
  const contentLines = content.split('\n');

  for (let i = 0; i <= contentLines.length - oldLineCount; i++) {
    const window = contentLines.slice(i, i + oldLineCount).join('\n');
    if (normalizeBlock(window) === normOld) {
      // Found: replace this window with newString, preserving surrounding lines
      const before = contentLines.slice(0, i).join('\n');
      const after = contentLines.slice(i + oldLineCount).join('\n');
      const parts = [before, newString, after].filter(p => p !== '');
      // Preserve leading/trailing newlines from original
      const result = before ? before + '\n' + newString : newString;
      return after ? result + '\n' + after : result;
    }
  }

  return null;
}

function validatePath(filePath: string): void {
  // Use the workspace root captured at launch — not process.cwd() which can
  // drift if a shell command changes directory mid-session.
  const allowedRoot = WORKSPACE_ROOT;
  const resolved = path.resolve(filePath);
  if (resolved !== allowedRoot && !resolved.startsWith(allowedRoot + path.sep)) {
    throw new Error(`Access denied: path '${filePath}' is outside the workspace (${allowedRoot})`);
  }
}


export class ReadFileTool extends BaseTool {
  name = 'read_file';
  description = 'Read the contents of a file';
  parameters = {
    path: { type: 'string', description: 'File path to read' }
  };

  async execute(params: { path: string }): Promise<string> {
    try {
      const filePath = path.resolve(params.path);
      validatePath(filePath);
      
      // Check if file exists
      if (!await fs.pathExists(filePath)) {
        console.log(chalk.yellow(`⚠️ File not found: ${params.path}`));
        return `File not found: ${params.path}`;
      }
      
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(chalk.green(`✓ Read file: ${params.path} (${content.length} chars)`));
      return content;
    } catch (error: any) {
      console.log(chalk.red(`✗ Read file failed: ${error.message}`));
      throw new Error(`Failed to read file ${params.path}: ${error.message}`);
    }
  }
}

export class WriteFileTool extends BaseTool {
  name = 'write_file';
  description = 'Write content to a file';
  parameters = {
    path: { type: 'string', description: 'File path to write' },
    content: { type: 'string', description: 'Content to write' }
  };
  requiresConfirmation = true;

  async execute(params: { path: string; content: string }): Promise<string> {
    try {
      const filePath = path.resolve(params.path);
      validatePath(filePath);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, params.content, 'utf-8');
      console.log(chalk.green(`✓ Wrote file: ${params.path} (${params.content.length} chars)`));
      return `Successfully wrote ${params.content.length} characters to ${params.path}`;
    } catch (error: any) {
      console.log(chalk.red(`✗ Write file failed: ${error.message}`));
      throw new Error(`Failed to write file ${params.path}: ${error.message}`);
    }
  }
}

export class EditFileTool extends BaseTool {
  name = 'edit_file';
  description = 'Edit a file using exact string replacement (like Claude Code). Supports old_string/new_string replacement, line-based editing, or replace_all mode.';
  parameters = {
    path: { type: 'string', description: 'File path to edit' },
    old_string: { type: 'string', description: 'Exact text to find and replace (must be unique in file unless replace_all is true)' },
    new_string: { type: 'string', description: 'Text to replace with (can be empty to delete)' },
    replace_all: { type: 'boolean', description: 'Replace all occurrences instead of just first (default: false)' },
    // Legacy support
    search: { type: 'string', description: '[Legacy] Alias for old_string' },
    replace: { type: 'string', description: '[Legacy] Alias for new_string' },
    // Line-based editing
    start_line: { type: 'number', description: 'Start line number for line-based editing (1-indexed)' },
    end_line: { type: 'number', description: 'End line number for line-based editing (inclusive)' },
    insert_line: { type: 'number', description: 'Line number to insert new content after (0 for beginning)' }
  };
  requiresConfirmation = true;

  async execute(params: {
    path: string;
    old_string?: string;
    new_string?: string;
    replace_all?: boolean;
    search?: string;
    replace?: string;
    start_line?: number;
    end_line?: number;
    insert_line?: number;
  }): Promise<string> {
    const filePath = path.resolve(params.path);
    validatePath(filePath);

    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${params.path}`);
    }

    let content = await fs.readFile(filePath, 'utf-8');
    const originalContent = content;

    // Support legacy parameters
    const oldString = params.old_string || params.search;
    const newString = params.new_string ?? params.replace ?? '';

    // Line-based editing mode
    if (params.start_line !== undefined && params.end_line !== undefined) {
      const lines = content.split('\n');
      const startIdx = params.start_line - 1;
      const endIdx = params.end_line;

      if (startIdx < 0 || endIdx > lines.length || startIdx >= endIdx) {
        throw new Error(`Invalid line range: ${params.start_line}-${params.end_line} (file has ${lines.length} lines)`);
      }

      const removedLines = lines.slice(startIdx, endIdx);
      const newLines = newString ? newString.split('\n') : [];
      lines.splice(startIdx, endIdx - startIdx, ...newLines);
      content = lines.join('\n');

      await fs.writeFile(filePath, content, 'utf-8');
      console.log(chalk.green(`✓ Edited lines ${params.start_line}-${params.end_line} in ${params.path}`));
      console.log(chalk.dim(`  Removed ${removedLines.length} lines, inserted ${newLines.length} lines`));
      return `Edited lines ${params.start_line}-${params.end_line}: removed ${removedLines.length} lines, inserted ${newLines.length} lines`;
    }

    // Insert mode (insert after line N)
    if (params.insert_line !== undefined) {
      const lines = content.split('\n');
      const insertIdx = params.insert_line;

      if (insertIdx < 0 || insertIdx > lines.length) {
        throw new Error(`Invalid insert line: ${params.insert_line} (file has ${lines.length} lines)`);
      }

      const newLines = newString ? newString.split('\n') : [];
      lines.splice(insertIdx, 0, ...newLines);
      content = lines.join('\n');

      await fs.writeFile(filePath, content, 'utf-8');
      console.log(chalk.green(`✓ Inserted ${newLines.length} lines after line ${params.insert_line} in ${params.path}`));
      return `Inserted ${newLines.length} lines after line ${params.insert_line}`;
    }

    // String replacement mode (Claude Code style)
    if (!oldString) {
      throw new Error('Either old_string/search or line numbers must be provided');
    }

    // Count occurrences
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      // Fuzzy fallback: normalize whitespace per line and retry.
      // LLMs frequently emit slightly wrong indentation — this recovers silently.
      const fuzzyResult = fuzzyReplaceBlock(content, oldString, newString);
      if (fuzzyResult !== null) {
        await fs.writeFile(filePath, fuzzyResult, 'utf-8');
        console.log(chalk.green(`✓ Edited file (fuzzy match): ${params.path}`));
        return `Successfully edited ${params.path} (fuzzy whitespace match applied)`;
      }

      const preview = oldString.length > 100 ? oldString.substring(0, 100) + '...' : oldString;
      throw new Error(`Text not found in file. Looking for:\n"${preview}"\n\nMake sure the text matches exactly including whitespace and line endings.`);
    }

    if (occurrences > 1 && !params.replace_all) {
      throw new Error(`Found ${occurrences} occurrences of the text. Use replace_all: true to replace all, or provide more context to make the match unique.`);
    }

    // Perform replacement
    if (params.replace_all) {
      content = content.split(oldString).join(newString);
      console.log(chalk.green(`✓ Replaced ${occurrences} occurrences in ${params.path}`));
    } else {
      content = content.replace(oldString, newString);
      console.log(chalk.green(`✓ Edited file: ${params.path}`));
    }

    // Show diff preview
    const oldLines = originalContent.split('\n').length;
    const newLines = content.split('\n').length;
    const lineDiff = newLines - oldLines;
    if (lineDiff !== 0) {
      console.log(chalk.dim(`  Line count: ${oldLines} → ${newLines} (${lineDiff > 0 ? '+' : ''}${lineDiff})`));
    }

    await fs.writeFile(filePath, content, 'utf-8');

    return params.replace_all
      ? `Replaced ${occurrences} occurrences in ${params.path}`
      : `Successfully edited ${params.path}`;
  }
}

export class ListDirectoryTool extends BaseTool {
  name = 'list_directory';
  description = 'List files and directories';
  parameters = {
    path: { type: 'string', description: 'Directory path to list' },
    recursive: { type: 'boolean', description: 'List recursively', default: false }
  };

  async execute(params: { path: string; recursive?: boolean }): Promise<string[]> {
    const dirPath = path.resolve(params.path || '.');
    validatePath(dirPath);
    
    if (params.recursive) {
      const pattern = path.join(dirPath, '**', '*');
      const files = await glob(pattern, { nodir: false });
      console.log(chalk.green(`✓ Listed ${files.length} items recursively`));
      return files;
    } else {
      const items = await fs.readdir(dirPath);
      console.log(chalk.green(`✓ Listed ${items.length} items`));
      return items;
    }
  }
}

export class DeleteFileTool extends BaseTool {
  name = 'delete_file';
  description = 'Delete a file or directory';
  parameters = {
    path: { type: 'string', description: 'Path to delete' }
  };
  requiresConfirmation = true;

  async execute(params: { path: string }): Promise<void> {
    const filePath = path.resolve(params.path);
    validatePath(filePath);
    await fs.remove(filePath);
    console.log(chalk.green(`✓ Deleted: ${params.path}`));
  }
}

export class SearchFilesTool extends BaseTool {
  name = 'search_files';
  description = 'Search for files by pattern';
  parameters = {
    pattern: { type: 'string', description: 'Search pattern (glob)' },
    content: { type: 'string', description: 'Optional: search for content within files' }
  };

  async execute(params: { pattern: string; content?: string }): Promise<any[]> {
    const files = (await glob(params.pattern, { cwd: WORKSPACE_ROOT })).filter(file => {
      const resolved = path.resolve(file);
      return resolved === WORKSPACE_ROOT || resolved.startsWith(WORKSPACE_ROOT + path.sep);
    });
    const results = [];

    for (const file of files) {
      if (params.content) {
        try {
          const fileContent = await fs.readFile(file, 'utf-8');
          if (fileContent.includes(params.content)) {
            const lines = fileContent.split('\n');
            const matches = lines
              .map((line, index) => ({ line, number: index + 1 }))
              .filter(({ line }) => params.content && line.includes(params.content));
            results.push({ file, matches });
          }
        } catch (error) {
          // Skip binary files
        }
      } else {
        results.push({ file });
      }
    }

    console.log(chalk.green(`✓ Found ${results.length} matching files`));
    return results;
  }
}

/**
 * Advanced grep tool similar to Claude Code's Grep
 * Supports regex patterns, file type filtering, context lines
 */
export class GrepTool extends BaseTool {
  name = 'grep';
  description = 'Search for text patterns in files using regex. Returns matching lines with file paths and line numbers.';
  parameters = {
    pattern: { type: 'string', description: 'Regex pattern to search for in file contents' },
    path: { type: 'string', description: 'Directory or file to search in (defaults to current directory)', optional: true },
    glob_pattern: { type: 'string', description: 'Glob pattern to filter files (e.g., "*.ts", "**/*.js")', optional: true },
    type: { type: 'string', description: 'File type to search (e.g., "ts", "js", "py")', optional: true },
    case_insensitive: { type: 'boolean', description: 'Case insensitive search', optional: true },
    context_lines: { type: 'number', description: 'Number of context lines to show before and after match', optional: true },
    max_results: { type: 'number', description: 'Maximum number of results to return (default: 100)', optional: true }
  };

  private readonly FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
    'ts': ['.ts', '.tsx'],
    'js': ['.js', '.jsx', '.mjs', '.cjs'],
    'py': ['.py'],
    'java': ['.java'],
    'go': ['.go'],
    'rust': ['.rs'],
    'c': ['.c', '.h'],
    'cpp': ['.cpp', '.cc', '.cxx', '.hpp', '.hh'],
    'css': ['.css', '.scss', '.sass', '.less'],
    'html': ['.html', '.htm'],
    'json': ['.json'],
    'yaml': ['.yaml', '.yml'],
    'md': ['.md', '.markdown'],
    'sh': ['.sh', '.bash', '.zsh'],
    'sql': ['.sql']
  };

  async execute(params: {
    pattern: string;
    path?: string;
    glob_pattern?: string;
    type?: string;
    case_insensitive?: boolean;
    context_lines?: number;
    max_results?: number;
  }): Promise<{ matches: any[]; summary: string }> {
    const {
      pattern,
      path: searchPath = '.',
      glob_pattern,
      type: fileType,
      case_insensitive = false,
      context_lines = 0,
      max_results = 100
    } = params;

    const results: Array<{
      file: string;
      line: number;
      content: string;
      context_before?: string[];
      context_after?: string[];
    }> = [];

    try {
      // Build regex
      const flags = case_insensitive ? 'gi' : 'g';
      const regex = new RegExp(pattern, flags);

      // Determine files to search
      let filesToSearch: string[] = [];
      const resolvedPath = path.resolve(searchPath);

      if (glob_pattern) {
        filesToSearch = await glob(glob_pattern, {
          cwd: resolvedPath,
          absolute: true,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**']
        });
      } else if ((await fs.stat(resolvedPath)).isDirectory()) {
        // Search all text files in directory
        const defaultPattern = fileType
          ? `**/*{${this.FILE_TYPE_EXTENSIONS[fileType]?.join(',') || '.' + fileType}}`
          : '**/*';
        filesToSearch = await glob(defaultPattern, {
          cwd: resolvedPath,
          absolute: true,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
        });
      } else {
        filesToSearch = [resolvedPath];
      }

      // Filter by file type if specified
      if (fileType && this.FILE_TYPE_EXTENSIONS[fileType]) {
        const extensions = this.FILE_TYPE_EXTENSIONS[fileType];
        filesToSearch = filesToSearch.filter(f =>
          extensions.some(ext => f.endsWith(ext))
        );
      }

      // Search files
      for (const file of filesToSearch) {
        if (results.length >= max_results) break;

        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (results.length >= max_results) break;

            const line = lines[i];
            if (regex.test(line)) {
              const result: any = {
                file: path.relative(process.cwd(), file),
                line: i + 1,
                content: line.trim()
              };

              // Add context if requested
              if (context_lines > 0) {
                result.context_before = lines
                  .slice(Math.max(0, i - context_lines), i)
                  .map(l => l.trim());
                result.context_after = lines
                  .slice(i + 1, Math.min(lines.length, i + 1 + context_lines))
                  .map(l => l.trim());
              }

              results.push(result);
              // Reset regex lastIndex for global flag
              regex.lastIndex = 0;
            }
          }
        } catch {
          // Skip binary/unreadable files
        }
      }

      const summary = `Found ${results.length} matches${results.length >= max_results ? ' (truncated)' : ''} in ${filesToSearch.length} files`;
      console.log(chalk.green(`✓ ${summary}`));

      return { matches: results, summary };
    } catch (error: any) {
      throw new Error(`Grep failed: ${error.message}`);
    }
  }
}