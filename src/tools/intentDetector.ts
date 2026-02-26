import type { ToolRegistry } from './registry.js';
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
    // Web/App building patterns - check these first!
    buildLandingPage: /(?:make|build|create|design)\s+(?:a\s+)?(?:landing\s+page|landing)/i,
    buildWebsite: /(?:make|build|create|design)\s+(?:a\s+)?(?:website|site|webpage)/i,
    buildWebApp: /(?:make|build|create|design)\s+(?:a\s+)?(?:web\s+app|webapp|application|app)/i,
    buildMobileApp: /(?:make|build|create)\s+(?:a\s+)?(?:mobile|ios|android)\s+(?:app|application)/i,
    
    // File operations - enhanced with natural language patterns
    createProject: /(?:create|setup|initialize|scaffold)\s+(?:a\s+)?(?:new\s+)?(?:project|app|application)/i,
    writeToSpecificFile: /(?:write|create|make|put|stick|save|store).*(?:in|into|to)\s+([\w\-\.]+\.\w+)/i,
    writeFile: /(?:write|create|make|add|put|stick|save|store)\s+(?:a\s+)?(?:file|document|story|text|content|code)/i,
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

    // FIRST: Check for web/app building requests (highest priority)
    if (this.patterns.buildLandingPage.test(lowerPrompt)) {
      return this.buildIntent('buildLandingPage', prompt);
    }
    if (this.patterns.buildWebsite.test(lowerPrompt)) {
      return this.buildIntent('buildWebsite', prompt);
    }
    if (this.patterns.buildWebApp.test(lowerPrompt)) {
      return this.buildIntent('buildWebApp', prompt);
    }
    if (this.patterns.buildMobileApp.test(lowerPrompt)) {
      return this.buildIntent('buildMobileApp', prompt);
    }

    // THEN: Check for specific file mentions with "in", "into", or "to"
    if (this.patterns.writeToSpecificFile.test(lowerPrompt)) {
      bestMatch = this.buildIntent('writeToSpecificFile', prompt);
      bestMatch.confidence = 1.0; // High confidence when file is explicitly named
      return bestMatch;
    }

    // Check each pattern
    for (const [action, pattern] of Object.entries(this.patterns)) {
      if (action !== 'writeToSpecificFile' && pattern.test(lowerPrompt)) {
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

      case 'writeToSpecificFile':
        intent.tools = ['write_file'];
        const specificFileInfo = this.extractSpecificFileInfo(prompt);
        intent.parameters = [specificFileInfo];
        intent.confidence = 1.0;
        break;

      case 'buildLandingPage':
        intent.tools = ['web_builder'];
        intent.parameters = [{ prompt, type: 'landing' }];
        intent.confidence = 1.0;
        break;

      case 'buildWebsite':
        intent.tools = ['web_builder'];
        intent.parameters = [{ prompt, type: 'website' }];
        intent.confidence = 1.0;
        break;

      case 'buildWebApp':
        intent.tools = ['web_builder'];
        intent.parameters = [{ prompt, type: 'webapp' }];
        intent.confidence = 1.0;
        break;

      case 'buildMobileApp':
        intent.tools = ['web_builder'];
        intent.parameters = [{ prompt, type: 'mobile' }];
        intent.confidence = 1.0;
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

    // Extract file name/path - enhanced patterns
    const pathMatch = prompt.match(/(?:(?:file|document)\s+)?([\/\w\-\.]+\.[a-z]{2,4})/i) ||
                     prompt.match(/(?:called|named)\s+([\/\w\-\.]+)/i) ||
                     prompt.match(/(?:in|into|to)\s+([\/\w\-\.]+\.\w+)/i);
    if (pathMatch) {
      info.path = pathMatch[1];
    }

    // Extract folder
    const folderMatch = prompt.match(/(?:in|into|to)\s+(?:the\s+)?([\/\w\-\.]+)\s+(?:folder|directory)/i);
    if (folderMatch && info.path) {
      info.path = `${folderMatch[1]}/${info.path}`;
    }

    // Extract content type and generate appropriate content
    info.content = this.extractContent(prompt);

    return info;
  }

  private extractSpecificFileInfo(prompt: string): any {
    const info: any = {};

    // Extract the specific file mentioned after "in", "into", or "to"
    const fileMatch = prompt.match(/(?:in|into|to)\s+([\/\w\-\.]+\.\w+)/i);
    if (fileMatch) {
      info.path = fileMatch[1];
    }

    // Determine what content to write based on the request
    info.content = this.extractContent(prompt);

    return info;
  }

  private extractContent(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    // Check if there's quoted content
    const quoted = this.extractQuoted(prompt);
    if (quoted) return quoted;

    // Determine content type from context
    if (lowerPrompt.includes('story')) {
      return this.generateStory();
    } else if (lowerPrompt.includes('poem')) {
      return this.generatePoem();
    } else if (lowerPrompt.includes('readme')) {
      return this.generateReadme();
    } else if (lowerPrompt.includes('test')) {
      return this.generateTest();
    } else {
      // Check file extension for type hints
      const fileMatch = prompt.match(/([\/\w\-\.]+\.\w+)/i);
      if (fileMatch) {
        const filename = fileMatch[1].toLowerCase();
        const ext = filename.split('.').pop()?.toLowerCase();
        
        // Check if filename suggests config
        if (filename.includes('config') || ext === 'json') {
          return this.generateConfig();
        }
        
        return this.generateContentForExtension(ext || 'txt');
      }
      
      // Final check for config without file extension
      if (lowerPrompt.includes('config') || lowerPrompt.includes('configuration')) {
        return this.generateConfig();
      }
      
      return 'File created by Canvas CLI';
    }
  }

  private generateStory(): string {
    return `# A Short Story

Once upon a time in a digital realm, there lived a clever CLI tool named Canvas. Canvas had a special ability - it could understand what developers wanted, even when they spoke in casual language.

One day, a developer said, "Write a story and stick it in naan.md," and Canvas knew exactly what to do. It didn't get confused or put the story in the wrong place. It created a beautiful story file exactly where the developer wanted it.

Canvas lived happily ever after, helping developers create files with natural language commands.

## The End

*Generated by Canvas CLI - Your intelligent coding assistant*`;
  }

  private generatePoem(): string {
    return `# A Poem

Code flows like water,
Through circuits and screens so bright,
Canvas CLI.

*Generated by Canvas CLI*`;
  }

  private generateReadme(): string {
    return `# Project README

## Description
This project was initialized with Canvas CLI.

## Installation
\`\`\`bash
npm install
\`\`\`

## Usage
\`\`\`bash
npm start
\`\`\`

## License
MIT`;
  }

  private generateConfig(): string {
    return JSON.stringify({
      name: 'project',
      version: '1.0.0',
      description: 'Created with Canvas CLI',
      main: 'index.js'
    }, null, 2);
  }

  private generateTest(): string {
    return `describe('Test Suite', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});`;
  }

  private generateContentForExtension(ext: string): string {
    switch(ext) {
      case 'md':
        return '# Document\n\nCreated by Canvas CLI';
      case 'json':
        return '{\n  "created": "by Canvas CLI"\n}';
      case 'js':
        return '// JavaScript file created by Canvas CLI\nconsole.log("Hello from Canvas CLI");';
      case 'html':
        return '<!DOCTYPE html>\n<html>\n<head>\n  <title>Canvas CLI</title>\n</head>\n<body>\n  <h1>Created by Canvas CLI</h1>\n</body>\n</html>';
      case 'css':
        return '/* CSS file created by Canvas CLI */\nbody {\n  margin: 0;\n  padding: 0;\n}';
      default:
        return 'File created by Canvas CLI';
    }
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

// Lazy singleton getter (avoids instantiation at import time)
let _intentDetector: IntentDetector | null = null;
export function getIntentDetector(): IntentDetector {
  if (!_intentDetector) _intentDetector = new IntentDetector();
  return _intentDetector;
}