import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';

export class ReadFileTool extends BaseTool {
  name = 'read_file';
  description = 'Read the contents of a file';
  parameters = {
    path: { type: 'string', description: 'File path to read' }
  };

  async execute(params: { path: string }): Promise<string> {
    try {
      const filePath = path.resolve(params.path);
      
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
  description = 'Edit a file by replacing text';
  parameters = {
    path: { type: 'string', description: 'File path to edit' },
    search: { type: 'string', description: 'Text to search for' },
    replace: { type: 'string', description: 'Text to replace with' }
  };
  requiresConfirmation = true;

  async execute(params: { path: string; search: string; replace: string }): Promise<void> {
    const filePath = path.resolve(params.path);
    let content = await fs.readFile(filePath, 'utf-8');
    
    if (!content.includes(params.search)) {
      throw new Error(`Text "${params.search}" not found in file`);
    }
    
    content = content.replace(params.search, params.replace);
    await fs.writeFile(filePath, content, 'utf-8');
    console.log(chalk.green(`✓ Edited file: ${params.path}`));
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
    const files = await glob(params.pattern);
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