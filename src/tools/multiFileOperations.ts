import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';

/**
 * Advanced multi-file operations tool that replicates Gemini CLI's read_many_files functionality
 * with enhanced features for Canvas CLI
 */
export class ReadManyFilesTool extends BaseTool {
  name = 'read_many_files';
  description = 'Read content from multiple files specified by paths or glob patterns';
  parameters = {
    paths: { 
      type: 'array', 
      items: { type: 'string', minLength: 1 },
      minItems: 1,
      description: "Required. Array of glob patterns or paths relative to target directory. Examples: ['src/**/*.ts'], ['README.md', 'docs/']"
    },
    include: { 
      type: 'array', 
      items: { type: 'string', minLength: 1 },
      description: 'Optional. Additional glob patterns to include. Merged with paths. Example: "*.test.ts"',
      default: []
    },
    exclude: { 
      type: 'array', 
      items: { type: 'string', minLength: 1 },
      description: 'Optional. Glob patterns to exclude. Example: "**/*.log", "temp/"',
      default: []
    },
    recursive: { 
      type: 'boolean', 
      description: 'Optional. Search directories recursively (controlled by ** in patterns). Defaults to true.',
      default: true 
    },
    useDefaultExcludes: { 
      type: 'boolean', 
      description: 'Optional. Apply default exclusion patterns (node_modules, .git, etc.). Defaults to true.',
      default: true 
    },
    respectGitIgnore: { 
      type: 'boolean', 
      description: 'Optional. Respect .gitignore patterns. Defaults to true.',
      default: true 
    },
    respectCanvasIgnore: { 
      type: 'boolean', 
      description: 'Optional. Respect .canvasignore patterns. Defaults to true.',
      default: true 
    }
  };

  private readonly DEFAULT_EXCLUDES = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.svn/**',
    '**/.hg/**',
    '**/CVS/**',
    '**/.DS_Store',
    '**/Thumbs.db',
    '**/*.log',
    '**/*.tmp',
    '**/*.temp',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/.nyc_output/**',
    '**/*.min.js',
    '**/*.min.css',
    '**/vendor/**',
    '**/third_party/**'
  ];

  private readonly OUTPUT_SEPARATOR_FORMAT = '--- {filePath} ---';
  private readonly OUTPUT_TERMINATOR = '\n--- End of content ---';
  private readonly DEFAULT_ENCODING = 'utf-8';

  async execute(params: {
    paths: string[];
    include?: string[];
    exclude?: string[];
    recursive?: boolean;
    useDefaultExcludes?: boolean;
    respectGitIgnore?: boolean;
    respectCanvasIgnore?: boolean;
  }): Promise<{ content: string; summary: string }> {
    const {
      paths: inputPatterns,
      include = [],
      exclude = [],
      useDefaultExcludes = true,
      respectGitIgnore = true,
      respectCanvasIgnore = true
    } = params;

    const filesToConsider = new Set<string>();
    const skippedFiles: Array<{ path: string; reason: string }> = [];
    const processedFiles: string[] = [];
    const contentParts: string[] = [];

    // Build effective exclusion patterns
    const effectiveExcludes = useDefaultExcludes
      ? [...this.DEFAULT_EXCLUDES, ...exclude]
      : [...exclude];

    const searchPatterns = [...inputPatterns, ...include];

    try {
      // Execute glob patterns
      const allEntries = new Set<string>();
      
      for (const pattern of searchPatterns) {
        const normalizedPattern = pattern.replace(/\\/g, '/');
        const entries = await glob(normalizedPattern, {
          ignore: effectiveExcludes,
          nodir: true,
          dot: true,
          absolute: true,
          nocase: true
        });
        
        for (const entry of entries) {
          allEntries.add(entry);
        }
      }

      const entries = Array.from(allEntries);

      // Apply git ignore filtering if enabled
      let finalEntries = entries;
      if (respectGitIgnore) {
        finalEntries = await this.filterGitIgnored(entries);
      }

      // Apply canvas ignore filtering if enabled
      if (respectCanvasIgnore) {
        finalEntries = await this.filterCanvasIgnored(finalEntries);
      }

      for (const absoluteFilePath of finalEntries) {
        filesToConsider.add(absoluteFilePath);
      }

    } catch (error) {
      const errorMessage = `Error during file search: ${error instanceof Error ? error.message : String(error)}`;
      return {
        content: errorMessage,
        summary: `File Search Error: ${errorMessage}`
      };
    }

    const sortedFiles = Array.from(filesToConsider).sort();

    // Process files in parallel for better performance
    const fileProcessingPromises = sortedFiles.map(async (filePath) => {
      try {
        const relativePathForDisplay = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

        // Check if file is binary (simple check)
        const isBinary = await this.isBinaryFile(filePath);
        
        // Handle different file types
        if (this.isImageOrPdf(filePath)) {
          const fileExtension = path.extname(filePath).toLowerCase();
          const fileNameWithoutExtension = path.basename(filePath, fileExtension);
          const requestedExplicitly = inputPatterns.some(pattern =>
            pattern.toLowerCase().includes(fileExtension) ||
            pattern.includes(fileNameWithoutExtension)
          );

          if (!requestedExplicitly) {
            return {
              success: false,
              filePath,
              relativePathForDisplay,
              reason: 'asset file (image/pdf) was not explicitly requested by name or extension'
            };
          }

          // For explicitly requested images/PDFs, read as base64
          const content = await fs.readFile(filePath);
          const base64Content = content.toString('base64');
          return {
            success: true,
            filePath,
            relativePathForDisplay,
            content: `[Base64 encoded ${fileExtension.slice(1).toUpperCase()} file: ${relativePathForDisplay}]\n${base64Content}`,
            isBase64: true
          };
        }

        if (isBinary) {
          return {
            success: false,
            filePath,
            relativePathForDisplay,
            reason: 'binary file detected and skipped'
          };
        }

        // Read text file
        const content = await fs.readFile(filePath, this.DEFAULT_ENCODING);
        const fileSize = (await fs.stat(filePath)).size;
        const lines = content.split('\n').length;

        return {
          success: true,
          filePath,
          relativePathForDisplay,
          content,
          fileSize,
          lines,
          isBase64: false
        };

      } catch (error) {
        const relativePathForDisplay = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        return {
          success: false,
          filePath,
          relativePathForDisplay,
          reason: `Read error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    });

    const results = await Promise.allSettled(fileProcessingPromises);
    let totalLines = 0;
    let totalSize = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const fileResult = result.value;

        if (!fileResult.success) {
          skippedFiles.push({
            path: fileResult.relativePathForDisplay,
            reason: fileResult.reason || 'Unknown error'
          });
        } else {
          const { filePath, relativePathForDisplay, content, fileSize = 0, lines = 0, isBase64 } = fileResult;

          if (!isBase64) {
            totalLines += lines;
            totalSize += fileSize;
          }

          const separator = this.OUTPUT_SEPARATOR_FORMAT.replace('{filePath}', relativePathForDisplay);
          const fileContent = `${separator}\n\n${content}\n\n`;
          contentParts.push(fileContent);
          processedFiles.push(relativePathForDisplay);
        }
      } else {
        skippedFiles.push({
          path: 'unknown',
          reason: `Unexpected error: ${result.reason}`
        });
      }
    }

    // Build final content
    let finalContent = '';
    if (contentParts.length > 0) {
      finalContent = contentParts.join('') + this.OUTPUT_TERMINATOR;
    } else {
      finalContent = 'No files matching the criteria were found or all were skipped.';
    }

    // Build summary message
    let summary = `### ReadManyFiles Result (Target Dir: \`${process.cwd()}\`)\n\n`;
    
    if (processedFiles.length > 0) {
      summary += `Successfully read and concatenated content from **${processedFiles.length} file(s)**.\n`;
      summary += `Total lines: ${totalLines.toLocaleString()}, Total size: ${this.formatBytes(totalSize)}\n`;
      
      if (processedFiles.length <= 10) {
        summary += `\n**Processed Files:**\n`;
        processedFiles.forEach(p => summary += `- \`${p}\`\n`);
      } else {
        summary += `\n**Processed Files (first 10 shown):**\n`;
        processedFiles.slice(0, 10).forEach(p => summary += `- \`${p}\`\n`);
        summary += `- ...and ${processedFiles.length - 10} more.\n`;
      }
    }

    if (skippedFiles.length > 0) {
      if (processedFiles.length === 0) {
        summary += `No files were read and concatenated based on the criteria.\n`;
      }
      
      if (skippedFiles.length <= 5) {
        summary += `\n**Skipped ${skippedFiles.length} item(s):**\n`;
      } else {
        summary += `\n**Skipped ${skippedFiles.length} item(s) (first 5 shown):**\n`;
      }
      
      skippedFiles.slice(0, 5).forEach(f => 
        summary += `- \`${f.path}\` (Reason: ${f.reason})\n`
      );
      
      if (skippedFiles.length > 5) {
        summary += `- ...and ${skippedFiles.length - 5} more.\n`;
      }
    } else if (processedFiles.length === 0 && skippedFiles.length === 0) {
      summary += `No files were read and concatenated based on the criteria.\n`;
    }

    console.log(chalk.green(`✓ ReadManyFiles: processed ${processedFiles.length} files, skipped ${skippedFiles.length}`));

    return {
      content: finalContent,
      summary: summary.trim()
    };
  }

  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = await fs.readFile(filePath);
      const chunk = buffer.subarray(0, Math.min(512, buffer.length));
      
      // Check for null bytes which typically indicate binary files
      return chunk.includes(0);
    } catch {
      return false;
    }
  }

  private isImageOrPdf(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp', '.pdf'].includes(ext);
  }

  private async filterGitIgnored(files: string[]): Promise<string[]> {
    // Simple implementation - in production, you'd use a proper gitignore parser
    try {
      const gitignorePath = path.join(process.cwd(), '.gitignore');
      if (await fs.pathExists(gitignorePath)) {
        const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
        const patterns = gitignoreContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));

        return files.filter(file => {
          const relativePath = path.relative(process.cwd(), file);
          return !patterns.some(pattern => {
            // Very basic pattern matching - use a proper library in production
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
            return regex.test(relativePath);
          });
        });
      }
    } catch {
      // If we can't read .gitignore, just return all files
    }
    return files;
  }

  private async filterCanvasIgnored(files: string[]): Promise<string[]> {
    try {
      const canvasignorePath = path.join(process.cwd(), '.canvasignore');
      if (await fs.pathExists(canvasignorePath)) {
        const canvasignoreContent = await fs.readFile(canvasignorePath, 'utf-8');
        const patterns = canvasignoreContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));

        return files.filter(file => {
          const relativePath = path.relative(process.cwd(), file);
          return !patterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
            return regex.test(relativePath);
          });
        });
      }
    } catch {
      // If we can't read .canvasignore, just return all files
    }
    return files;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * Enhanced glob tool with advanced pattern matching
 */
export class GlobTool extends BaseTool {
  name = 'glob';
  description = 'Find files using glob patterns with advanced options';
  parameters = {
    pattern: { type: 'string', description: 'Glob pattern to match files' },
    exclude: { 
      type: 'array', 
      items: { type: 'string' },
      description: 'Patterns to exclude',
      default: []
    },
    includeDirectories: { 
      type: 'boolean', 
      description: 'Include directories in results',
      default: false 
    },
    caseSensitive: { 
      type: 'boolean', 
      description: 'Case sensitive matching',
      default: false 
    },
    followSymlinks: { 
      type: 'boolean', 
      description: 'Follow symbolic links',
      default: false 
    }
  };

  async execute(params: {
    pattern: string;
    exclude?: string[];
    includeDirectories?: boolean;
    caseSensitive?: boolean;
    followSymlinks?: boolean;
  }): Promise<string[]> {
    const {
      pattern,
      exclude = [],
      includeDirectories = false,
      caseSensitive = false,
      followSymlinks = false
    } = params;

    try {
      const files = await glob(pattern, {
        ignore: exclude,
        nodir: !includeDirectories,
        nocase: !caseSensitive,
        follow: followSymlinks,
        absolute: true
      });

      const relativeFiles = files.map(file => path.relative(process.cwd(), file));
      
      console.log(chalk.green(`✓ Found ${files.length} files matching pattern: ${pattern}`));
      
      return relativeFiles;
    } catch (error) {
      console.log(chalk.red(`✗ Error finding files: ${error instanceof Error ? error.message : String(error)}`));
      throw error;
    }
  }
}

/**
 * Multi-file edit tool for batch operations
 */
export class MultiEditTool extends BaseTool {
  name = 'multi_edit';
  description = 'Apply the same edit operation to multiple files';
  parameters = {
    files: { 
      type: 'array', 
      items: { type: 'string' },
      description: 'Array of file paths to edit'
    },
    search: { type: 'string', description: 'Text to search for in all files' },
    replace: { type: 'string', description: 'Text to replace with in all files' },
    dryRun: { 
      type: 'boolean', 
      description: 'Preview changes without applying them',
      default: false 
    }
  };
  requiresConfirmation = true;

  async execute(params: {
    files: string[];
    search: string;
    replace: string;
    dryRun?: boolean;
  }): Promise<{ results: any[]; summary: string }> {
    const { files, search, replace, dryRun = false } = params;
    const results = [];
    let modifiedCount = 0;
    let errorCount = 0;

    for (const filePath of files) {
      try {
        const absolutePath = path.resolve(filePath);
        const content = await fs.readFile(absolutePath, 'utf-8');
        
        if (content.includes(search)) {
          const newContent = content.replace(new RegExp(search, 'g'), replace);
          const matchCount = (content.match(new RegExp(search, 'g')) || []).length;
          
          if (!dryRun) {
            await fs.writeFile(absolutePath, newContent, 'utf-8');
          }
          
          results.push({
            file: filePath,
            status: 'modified',
            matches: matchCount,
            dryRun
          });
          
          modifiedCount++;
        } else {
          results.push({
            file: filePath,
            status: 'no_matches',
            matches: 0
          });
        }
      } catch (error) {
        results.push({
          file: filePath,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
        errorCount++;
      }
    }

    const summary = dryRun 
      ? `Dry run: Would modify ${modifiedCount} files, ${errorCount} errors`
      : `Modified ${modifiedCount} files, ${errorCount} errors`;

    console.log(chalk.green(`✓ ${summary}`));

    return { results, summary };
  }
}

/**
 * File comparison tool for diff operations
 */
export class FileCompareTool extends BaseTool {
  name = 'compare_files';
  description = 'Compare two files and show differences';
  parameters = {
    file1: { type: 'string', description: 'First file to compare' },
    file2: { type: 'string', description: 'Second file to compare' },
    contextLines: { 
      type: 'number', 
      description: 'Number of context lines to show',
      default: 3 
    }
  };

  async execute(params: {
    file1: string;
    file2: string;
    contextLines?: number;
  }): Promise<{ diff: string; summary: string }> {
    const { file1, file2, contextLines = 3 } = params;

    try {
      const content1 = await fs.readFile(path.resolve(file1), 'utf-8');
      const content2 = await fs.readFile(path.resolve(file2), 'utf-8');

      const lines1 = content1.split('\n');
      const lines2 = content2.split('\n');

      const diff = this.generateDiff(lines1, lines2, contextLines);
      const summary = `Compared ${file1} and ${file2}: ${diff.added} additions, ${diff.removed} removals, ${diff.changed} changes`;

      console.log(chalk.green(`✓ File comparison complete`));

      return {
        diff: diff.output,
        summary
      };
    } catch (error) {
      throw new Error(`Error comparing files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateDiff(lines1: string[], lines2: string[], contextLines: number) {
    // Simple diff implementation - in production use a proper diff library
    const result = [];
    let added = 0;
    let removed = 0;
    let changed = 0;

    const maxLines = Math.max(lines1.length, lines2.length);
    
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];

      if (line1 === undefined) {
        result.push(`+ ${line2}`);
        added++;
      } else if (line2 === undefined) {
        result.push(`- ${line1}`);
        removed++;
      } else if (line1 !== line2) {
        result.push(`- ${line1}`);
        result.push(`+ ${line2}`);
        changed++;
      } else {
        result.push(`  ${line1}`);
      }
    }

    return {
      output: result.join('\n'),
      added,
      removed,
      changed
    };
  }
}