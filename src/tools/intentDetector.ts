import { ToolRegistry } from './registry.js';
import chalk from 'chalk';

interface Intent {
  action: string;
  confidence: number;
  tools: string[];
  parameters: any[];
  workflow?: Intent[];
}

export class IntentDetector {
  private patterns = {
    // File operations
    createProject: /(?:create|setup|initialize|scaffold)\s+(?:a\s+)?(?:new\s+)?(?:project|app|application)/i,
    writeFile: /(?:write|create|make|add)\s+(?:a\s+)?(?:file|document)/i,
    editFile: /(?:edit|modify|update|change)\s+(?:the\s+)?(?:file|document)/i,
    readFile: /(?:read|show|display|open|view)\s+(?:the\s+)?(?:file|document)/i,
    deleteFile: /(?:delete|remove|rm)\s+(?:the\s+)?(?:file|document)/i,
    
    // Directory operations
    listFiles: /(?:list|show|display)\s+(?:all\s+)?(?:files|directory|folder|structure)/i,
    exploreProject: /(?:explore|analyze|understand|show)\s+(?:the\s+)?(?:project|codebase|repository)/i,
    
    // Git operations
    gitCommit: /(?:commit|save)\s+(?:changes|code|files)/i,
    gitStatus: /(?:git\s+)?status|what.*changed/i,
    gitPush: /(?:push|upload|sync)\s+(?:to\s+)?(?:remote|github|gitlab)/i,
    
    // Code operations
    refactor: /(?:refactor|improve|optimize|clean)\s+(?:the\s+)?(?:code|function|class)/i,
    addFeature: /(?:add|implement|create)\s+(?:a\s+)?(?:feature|functionality|method|function)/i,
    fixBug: /(?:fix|solve|debug|repair)\s+(?:the\s+)?(?:bug|issue|problem|error)/i,
    
    // Testing
    runTests: /(?:run|execute)\s+(?:the\s+)?tests?/i,
    writeTests: /(?:write|create|add)\s+(?:a\s+)?tests?/i,
    
    // Documentation
    document: /(?:document|add\s+docs|write\s+documentation)/i,
    explain: /(?:explain|describe|what\s+(?:is|does))/i
  };

  detectIntent(prompt: string): Intent {
    const lowerPrompt = prompt.toLowerCase();
    let bestMatch: Intent = {
      action: 'unknown',
      confidence: 0,
      tools: [],
      parameters: []
    };

    // Check each pattern
    for (const [action, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(lowerPrompt)) {
        const intent = this.buildIntent(action, prompt);
        if (intent.confidence > bestMatch.confidence) {
          bestMatch = intent;
        }
      }
    }

    // If no pattern matched, try to infer from keywords
    if (bestMatch.confidence < 0.5) {
      bestMatch = this.inferIntent(prompt);
    }

    return bestMatch;
  }

  private buildIntent(action: string, prompt: string): Intent {
    const intent: Intent = {
      action,
      confidence: 0.8,
      tools: [],
      parameters: []
    };

    switch (action) {
      case 'createProject':
        intent.workflow = [
          { action: 'mkdir', confidence: 1, tools: ['shell_command'], parameters: [] },
          { action: 'writeFile', confidence: 1, tools: ['write_file'], parameters: [] },
          { action: 'gitInit', confidence: 1, tools: ['git_init'], parameters: [] }
        ];
        break;

      case 'writeFile':
        intent.tools = ['write_file'];
        const fileInfo = this.extractFileInfo(prompt);
        intent.parameters = [fileInfo];
        intent.confidence = fileInfo.path ? 1.0 : 0.6;
        break;

      case 'listFiles':
        intent.tools = ['list_directory'];
        intent.parameters = [{ path: '.', recursive: prompt.includes('recursive') || prompt.includes('all') }];
        intent.confidence = 0.9;
        break;

      case 'exploreProject':
        intent.workflow = [
          { action: 'listFiles', confidence: 1, tools: ['list_directory'], parameters: [{ path: '.', recursive: true }] },
          { action: 'readPackage', confidence: 0.8, tools: ['read_file'], parameters: [{ path: 'package.json' }] },
          { action: 'readReadme', confidence: 0.8, tools: ['read_file'], parameters: [{ path: 'README.md' }] }
        ];
        break;

      case 'gitCommit':
        const message = this.extractQuoted(prompt) || 'Update files';
        intent.workflow = [
          { action: 'gitAdd', confidence: 1, tools: ['git_add'], parameters: [{ files: ['.'] }] },
          { action: 'gitCommit', confidence: 1, tools: ['git_commit'], parameters: [{ message }] }
        ];
        break;

      case 'runTests':
        intent.tools = ['shell_command'];
        intent.parameters = [{ command: 'npm test' }];
        intent.confidence = 0.9;
        break;
    }

    return intent;
  }

  private inferIntent(prompt: string): Intent {
    const intent: Intent = {
      action: 'inferred',
      confidence: 0.5,
      tools: [],
      parameters: []
    };

    // Check for file paths
    if (/\.[a-z]{2,4}$/i.test(prompt)) {
      intent.action = 'file_operation';
      intent.confidence = 0.7;
      
      if (prompt.includes('create') || prompt.includes('write')) {
        intent.tools = ['write_file'];
      } else if (prompt.includes('read') || prompt.includes('show')) {
        intent.tools = ['read_file'];
      }
    }

    // Check for commands
    if (prompt.startsWith('npm ') || prompt.startsWith('git ') || prompt.startsWith('yarn ')) {
      intent.action = 'shell_command';
      intent.tools = ['shell_command'];
      intent.parameters = [{ command: prompt }];
      intent.confidence = 0.9;
    }

    return intent;
  }

  private extractFileInfo(prompt: string): any {
    const info: any = {};

    // Extract file name/path
    const pathMatch = prompt.match(/(?:(?:file|document)\s+)?([\/\w\-\.]+\.[a-z]{2,4})/i) ||
                     prompt.match(/(?:called|named)\s+([\/\w\-\.]+)/i);
    if (pathMatch) {
      info.path = pathMatch[1];
    }

    // Extract folder
    const folderMatch = prompt.match(/(?:in|into|to)\s+(?:the\s+)?([\/\w\-\.]+)\s+(?:folder|directory)/i);
    if (folderMatch && info.path) {
      info.path = `${folderMatch[1]}/${info.path}`;
    }

    // Extract content
    info.content = this.extractQuoted(prompt) || 'File created by Canvas CLI';

    return info;
  }

  private extractQuoted(text: string): string | null {
    const match = text.match(/["']([^"']+)["']/);
    return match ? match[1] : null;
  }

  async executeIntent(intent: Intent, toolRegistry: ToolRegistry): Promise<void> {
    console.log(chalk.cyan(`\n🎯 Detected intent: ${intent.action} (confidence: ${Math.round(intent.confidence * 100)}%)`));

    if (intent.workflow) {
      console.log(chalk.yellow(`📋 Executing workflow with ${intent.workflow.length} steps...`));
      
      for (const step of intent.workflow) {
        await this.executeIntent(step, toolRegistry);
      }
    } else if (intent.tools.length > 0) {
      for (let i = 0; i < intent.tools.length; i++) {
        const tool = intent.tools[i];
        const params = intent.parameters[i] || {};
        
        console.log(chalk.dim(`  → Executing ${tool}...`));
        
        try {
          const result = await toolRegistry.execute(tool, params);
          if (result) {
            console.log(chalk.green(`  ✓ ${tool} completed`));
          }
        } catch (error: any) {
          console.log(chalk.red(`  ✗ ${tool} failed: ${error.message}`));
        }
      }
    }
  }
}

// Singleton instance
export const intentDetector = new IntentDetector();