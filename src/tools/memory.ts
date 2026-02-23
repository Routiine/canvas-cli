import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { MemoryContext } from '../types.js';

export class MemoryTool extends BaseTool {
  name = 'save_memory';
  description = 'Save information to persistent memory';
  parameters = {
    key: { type: 'string', description: 'Memory key/identifier' },
    value: { type: 'any', description: 'Information to remember' },
    scope: { type: 'string', description: 'Scope: global, project, or session', default: 'session' }
  };
  
  private memoryPath = path.join(os.homedir(), '.canvas-cli', 'memory');

  async execute(params: { key: string; value: any; scope?: string }): Promise<void> {
    if (!params.key || typeof params.key !== 'string' || !params.key.trim()) {
      throw new Error('Memory key is required');
    }

    // Sanitize key to prevent directory traversal
    const sanitizedKey = params.key.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (sanitizedKey !== params.key) {
      console.log(chalk.dim(`  Key sanitized: ${params.key} → ${sanitizedKey}`));
    }

    const scope = params.scope || 'session';
    const scopePath = path.join(this.memoryPath, scope);
    await fs.ensureDir(scopePath);

    const filePath = path.join(scopePath, `${sanitizedKey}.json`);
    await fs.writeJSON(filePath, {
      key: params.key,
      value: params.value,
      timestamp: new Date().toISOString(),
      scope
    });
    
    console.log(chalk.green(`✓ Saved to ${scope} memory: ${params.key}`));
  }
}

export class RecallMemoryTool extends BaseTool {
  name = 'recall_memory';
  description = 'Recall information from memory';
  parameters = {
    key: { type: 'string', description: 'Memory key to recall' },
    scope: { type: 'string', description: 'Scope: global, project, or session', optional: true }
  };
  
  private memoryPath = path.join(os.homedir(), '.canvas-cli', 'memory');

  async execute(params: { key: string; scope?: string }): Promise<any> {
    if (!params.key || typeof params.key !== 'string' || !params.key.trim()) {
      throw new Error('Memory key is required');
    }

    // Sanitize key to prevent directory traversal
    const sanitizedKey = params.key.replace(/[^a-zA-Z0-9_-]/g, '_');
    const scopes = params.scope ? [params.scope] : ['session', 'project', 'global'];

    for (const scope of scopes) {
      const filePath = path.join(this.memoryPath, scope, `${sanitizedKey}.json`);
      if (await fs.pathExists(filePath)) {
        const data = await fs.readJSON(filePath);
        console.log(chalk.green(`✓ Recalled from ${scope} memory: ${params.key}`));
        return data.value;
      }
    }
    
    console.log(chalk.yellow(`⚠ Memory not found: ${params.key}`));
    return null;
  }
}

export class ListMemoryTool extends BaseTool {
  name = 'list_memory';
  description = 'List all memory keys';
  parameters = {
    scope: { type: 'string', description: 'Scope to list', optional: true }
  };
  
  private memoryPath = path.join(os.homedir(), '.canvas-cli', 'memory');

  async execute(params: { scope?: string }): Promise<any[]> {
    const scopes = params.scope ? [params.scope] : ['global', 'project', 'session'];
    const memories: any[] = [];
    
    for (const scope of scopes) {
      const scopePath = path.join(this.memoryPath, scope);
      if (await fs.pathExists(scopePath)) {
        const files = await fs.readdir(scopePath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const data = await fs.readJSON(path.join(scopePath, file));
            memories.push({
              key: data.key,
              scope,
              timestamp: data.timestamp
            });
          }
        }
      }
    }
    
    console.log(chalk.green(`✓ Found ${memories.length} memory entries`));
    return memories;
  }
}

export class ContextLoader {
  private configPath = path.join(os.homedir(), '.canvas-cli');
  
  async loadContext(): Promise<MemoryContext> {
    const context: MemoryContext = {
      global: [],
      project: [],
      session: []
    };
    
    // Load global CANVAS.md
    const globalFile = path.join(this.configPath, 'CANVAS.md');
    if (await fs.pathExists(globalFile)) {
      context.global.push(await fs.readFile(globalFile, 'utf-8'));
    }
    
    // Load project CANVAS.md (search up directory tree)
    let currentDir = process.cwd();
    while (currentDir !== path.parse(currentDir).root) {
      const projectFile = path.join(currentDir, 'CANVAS.md');
      if (await fs.pathExists(projectFile)) {
        context.project.push(await fs.readFile(projectFile, 'utf-8'));
        break;
      }
      currentDir = path.dirname(currentDir);
    }
    
    return context;
  }
}