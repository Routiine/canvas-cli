import { BaseTool } from './base.js';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

interface CommandIntent {
  type: 'shell' | 'file' | 'git' | 'npm' | 'system' | 'navigation';
  command?: string;
  confidence: number;
  params?: any;
  description: string;
  risks?: string[];
}

interface NaturalExecuteOptions {
  message: string;
  autoConfirm?: boolean;
  dryRun?: boolean;
  context?: string;
}

export class NaturalExecutor extends BaseTool {
  name = 'natural_executor';
  description = 'Execute tasks and shell commands through natural conversation';
  parameters = {
    message: { type: 'string', description: 'Natural language command or task', required: true },
    autoConfirm: { type: 'boolean', description: 'Auto-confirm execution', optional: true },
    dryRun: { type: 'boolean', description: 'Preview without executing', optional: true }
  };

  // Common command patterns mapped to natural language
  private patterns = {
    // File operations
    createFile: [
      /(?:create|make|new|add)\s+(?:a\s+)?file\s+(?:called\s+|named\s+)?(.+)/i,
      /(?:touch|write)\s+(.+\.[\w]+)/i
    ],
    deleteFile: [
      /(?:delete|remove|rm|trash)\s+(?:the\s+)?(?:file\s+)?(.+)/i,
      /get rid of\s+(.+)/i
    ],
    listFiles: [
      /(?:list|show|display|ls)\s+(?:all\s+)?(?:the\s+)?files?/i,
      /what(?:'s| is) in (?:this|the) (?:folder|directory)/i,
      /show me what(?:'s| is) here/i
    ],
    
    // Directory navigation
    changeDir: [
      /(?:go to|cd|navigate to|enter|open)\s+(?:the\s+)?(?:folder|directory)?\s*(.+)/i,
      /move to\s+(.+)/i
    ],
    goBack: [
      /go back|cd\s*\.\.|go up|parent directory/i
    ],
    
    // Git operations
    gitStatus: [
      /(?:git\s+)?status|what(?:'s| is) changed/i,
      /show me (?:the\s+)?changes/i
    ],
    gitCommit: [
      /commit\s+(?:with message\s+)?(?:["'](.+)["'])?/i,
      /save changes\s+(?:with message\s+)?(?:["'](.+)["'])?/i
    ],
    gitPush: [
      /push\s+(?:to\s+)?(?:origin|remote|github)?/i,
      /upload\s+(?:my\s+)?(?:changes|commits?)/i
    ],
    gitPull: [
      /pull\s+(?:from\s+)?(?:origin|remote|github)?/i,
      /(?:get|fetch)\s+(?:latest|recent)\s+(?:changes|updates)/i
    ],
    
    // NPM/Package management
    npmInstall: [
      /(?:npm\s+)?install\s*(.*)/i,
      /add (?:the\s+)?(?:package|dependency|library)\s+(.+)/i
    ],
    npmRun: [
      /(?:npm\s+)?run\s+(.+)/i,
      /(?:start|build|test|dev)\s+(?:the\s+)?(?:app|project|server)?/i
    ],
    
    // System operations
    clearScreen: [
      /clear\s*(?:the\s+)?(?:screen|terminal)?/i,
      /cls/i
    ],
    showPath: [
      /(?:where am i|pwd|current directory|show path)/i
    ],
    
    // Process management
    killProcess: [
      /(?:kill|stop|terminate)\s+(?:process\s+)?(.+)/i,
      /stop\s+(.+)\s+(?:server|app|process)/i
    ],
    checkPorts: [
      /(?:what(?:'s| is)|check)\s+(?:running\s+)?(?:on\s+)?port\s*(\d+)/i,
      /(?:list|show)\s+(?:open\s+)?ports/i
    ]
  };

  async execute(options: NaturalExecuteOptions): Promise<any> {
    const { message, autoConfirm = false, dryRun = false } = options;
    
    console.log(chalk.cyan('🤖 Understanding your request...'));
    
    // Detect intent from natural language
    const intent = this.detectIntent(message);
    
    if (intent.confidence < 0.5) {
      console.log(chalk.yellow('⚠️  Could not understand the command clearly.'));
      console.log(chalk.dim('Try being more specific or use standard command syntax.'));
      return { 
        success: false, 
        message: 'Command not understood',
        suggestion: this.suggestCommand(message)
      };
    }
    
    // Show what will be executed
    console.log(chalk.dim(`\n📋 Detected: ${intent.description}`));
    if (intent.command) {
      console.log(chalk.dim(`   Command: ${chalk.cyan(intent.command)}`));
    }
    
    // Show risks if any
    if (intent.risks && intent.risks.length > 0) {
      console.log(chalk.yellow('\n⚠️  Potential risks:'));
      intent.risks.forEach(risk => {
        console.log(chalk.yellow(`   • ${risk}`));
      });
    }
    
    // Dry run mode
    if (dryRun) {
      console.log(chalk.blue('\n🔍 Dry run mode - command not executed'));
      return { success: true, dryRun: true, intent };
    }
    
    // Confirm execution unless auto-confirm
    if (!autoConfirm && intent.type !== 'navigation') {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Execute this command?',
        default: true
      }]);
      
      if (!confirm) {
        console.log(chalk.gray('Cancelled.'));
        return { success: false, cancelled: true };
      }
    }
    
    // Execute the command
    try {
      const result = await this.executeIntent(intent);
      console.log(chalk.green('✅ Command executed successfully'));
      return { success: true, result, intent };
    } catch (error: any) {
      console.log(chalk.red(`❌ Execution failed: ${error.message}`));
      return { success: false, error: error.message, intent };
    }
  }

  private detectIntent(message: string): CommandIntent {
    const lowercased = message.toLowerCase();
    
    // Check each pattern category
    for (const [category, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
          return this.buildIntent(category, match, message);
        }
      }
    }
    
    // Fallback: Try to detect as direct shell command
    if (this.looksLikeShellCommand(message)) {
      return {
        type: 'shell',
        command: message,
        confidence: 0.7,
        description: `Run shell command: ${message}`,
        risks: ['Executing arbitrary shell command']
      };
    }
    
    return {
      type: 'system',
      confidence: 0,
      description: 'Unknown command'
    };
  }

  private buildIntent(category: string, match: RegExpMatchArray, originalMessage: string): CommandIntent {
    switch (category) {
      case 'createFile':
        const filename = match[1] || 'newfile.txt';
        return {
          type: 'file',
          command: `touch "${filename}"`,
          confidence: 0.9,
          description: `Create file: ${filename}`,
          params: { filename }
        };
      
      case 'deleteFile':
        const fileToDelete = match[1];
        return {
          type: 'file',
          command: `rm "${fileToDelete}"`,
          confidence: 0.8,
          description: `Delete file: ${fileToDelete}`,
          risks: ['This will permanently delete the file'],
          params: { file: fileToDelete }
        };
      
      case 'listFiles':
        return {
          type: 'shell',
          command: 'ls -la',
          confidence: 0.95,
          description: 'List all files in current directory'
        };
      
      case 'changeDir':
        const dir = match[1];
        return {
          type: 'navigation',
          command: `cd "${dir}"`,
          confidence: 0.9,
          description: `Navigate to: ${dir}`,
          params: { directory: dir }
        };
      
      case 'goBack':
        return {
          type: 'navigation',
          command: 'cd ..',
          confidence: 0.95,
          description: 'Go to parent directory'
        };
      
      case 'gitStatus':
        return {
          type: 'git',
          command: 'git status',
          confidence: 0.95,
          description: 'Check git repository status'
        };
      
      case 'gitCommit':
        const commitMsg = match[1] || 'Update files';
        return {
          type: 'git',
          command: `git add . && git commit -m "${commitMsg}"`,
          confidence: 0.85,
          description: `Commit changes: "${commitMsg}"`,
          params: { message: commitMsg }
        };
      
      case 'gitPush':
        return {
          type: 'git',
          command: 'git push origin main',
          confidence: 0.9,
          description: 'Push changes to remote repository',
          risks: ['This will push to the main branch']
        };
      
      case 'gitPull':
        return {
          type: 'git',
          command: 'git pull origin main',
          confidence: 0.9,
          description: 'Pull latest changes from remote',
          risks: ['May cause merge conflicts']
        };
      
      case 'npmInstall':
        const packageName = match[1];
        const npmCmd = packageName ? `npm install ${packageName}` : 'npm install';
        return {
          type: 'npm',
          command: npmCmd,
          confidence: 0.9,
          description: packageName ? `Install package: ${packageName}` : 'Install all dependencies',
          params: { package: packageName }
        };
      
      case 'npmRun':
        const script = match[1] || this.detectNpmScript(originalMessage);
        return {
          type: 'npm',
          command: `npm run ${script}`,
          confidence: 0.85,
          description: `Run npm script: ${script}`,
          params: { script }
        };
      
      case 'clearScreen':
        return {
          type: 'system',
          command: process.platform === 'win32' ? 'cls' : 'clear',
          confidence: 0.95,
          description: 'Clear terminal screen'
        };
      
      case 'showPath':
        return {
          type: 'system',
          command: 'pwd',
          confidence: 0.95,
          description: 'Show current directory path'
        };
      
      case 'killProcess':
        const processName = match[1];
        return {
          type: 'system',
          command: process.platform === 'win32' 
            ? `taskkill /F /IM ${processName}` 
            : `pkill ${processName}`,
          confidence: 0.7,
          description: `Kill process: ${processName}`,
          risks: ['This will forcefully terminate the process'],
          params: { process: processName }
        };
      
      case 'checkPorts':
        const port = match[1];
        const portCmd = process.platform === 'win32'
          ? `netstat -an | findstr :${port || ''}`
          : `lsof -i ${port ? ':' + port : ''}`;
        return {
          type: 'system',
          command: portCmd,
          confidence: 0.8,
          description: port ? `Check port ${port}` : 'List open ports',
          params: { port }
        };
      
      default:
        return {
          type: 'system',
          confidence: 0,
          description: 'Unknown command'
        };
    }
  }

  private async executeIntent(intent: CommandIntent): Promise<string> {
    if (!intent.command) {
      throw new Error('No command to execute');
    }
    
    // Special handling for navigation commands
    if (intent.type === 'navigation') {
      // We can't actually change the shell's directory from here,
      // so we'll return a message explaining this
      console.log(chalk.yellow('\n💡 Note: Directory changes don\'t persist in the parent shell.'));
      console.log(chalk.dim('   To navigate, use: cd ' + (intent.params?.directory || '..')));
      return 'Navigation command noted';
    }
    
    // Execute the shell command
    const { stdout, stderr } = await execAsync(intent.command);
    
    if (stderr && !stdout) {
      throw new Error(stderr);
    }
    
    return stdout || 'Command completed';
  }

  private looksLikeShellCommand(message: string): boolean {
    // Common shell command patterns
    const shellPatterns = [
      /^(ls|dir|pwd|cd|mkdir|rm|mv|cp|cat|echo|grep|find|chmod|chown)/i,
      /^(git|npm|yarn|node|python|pip|docker|kubectl)/i,
      /^(curl|wget|ssh|scp|rsync|tar|zip|unzip)/i,
      /\|/, // Contains pipe
      />/, // Contains redirect
      /&&/, // Contains command chaining
    ];
    
    return shellPatterns.some(pattern => pattern.test(message));
  }

  private detectNpmScript(message: string): string {
    const scriptMap: Record<string, string[]> = {
      'dev': ['dev', 'develop', 'development'],
      'start': ['start', 'run', 'serve'],
      'build': ['build', 'compile', 'production'],
      'test': ['test', 'check', 'verify'],
      'lint': ['lint', 'check code', 'analyze']
    };
    
    const lower = message.toLowerCase();
    for (const [script, keywords] of Object.entries(scriptMap)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        return script;
      }
    }
    
    return 'start'; // Default
  }

  private suggestCommand(message: string): string {
    const lower = message.toLowerCase();
    
    // Provide helpful suggestions based on keywords
    if (lower.includes('file')) {
      return 'Try: "create a file called example.txt" or "list files"';
    }
    if (lower.includes('git')) {
      return 'Try: "git status" or "commit with message \'your message\'"';
    }
    if (lower.includes('install')) {
      return 'Try: "npm install package-name" or just "npm install"';
    }
    if (lower.includes('run') || lower.includes('start')) {
      return 'Try: "npm run dev" or "start the server"';
    }
    
    return 'Try being more specific, like: "list files", "git status", or "npm install"';
  }
}