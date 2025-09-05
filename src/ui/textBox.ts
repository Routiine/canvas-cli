import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * Enhanced text box interface for Canvas CLI
 * Supports multi-line input, file pasting, and various input modes
 */

export interface TextBoxOptions {
  title?: string;
  placeholder?: string;
  maxLines?: number;
  enableFileImport?: boolean;
  enableMarkdown?: boolean;
  autoDetectLanguage?: boolean;
  saveToFile?: boolean;
  syntax?: string;
}

export interface TextBoxResult {
  content: string;
  metadata: {
    lines: number;
    characters: number;
    words: number;
    language?: string;
    savedFile?: string;
  };
}

/**
 * Advanced multi-line text box with enhanced features
 */
export class CanvasTextBox {
  private tempDir: string;
  private editorCommand: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'canvas-cli');
    fs.ensureDirSync(this.tempDir);
    
    // Detect available text editor
    this.editorCommand = this.detectEditor();
  }

  /**
   * Show interactive text box interface
   */
  async show(options: TextBoxOptions = {}): Promise<TextBoxResult> {
    const {
      title = '📝 Canvas Text Box',
      placeholder = 'Enter your text here...',
      maxLines = 50,
      enableFileImport = true,
      enableMarkdown = true,
      autoDetectLanguage = true,
      saveToFile = false,
      syntax
    } = options;

    // Draw title with border
    console.log(chalk.cyan('\n╔' + '═'.repeat(60) + '╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold(` ${title}`.padEnd(59)) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(60) + '╝'));
    
    // Show input method options
    const inputMethod = await this.selectInputMethod(enableFileImport);
    
    let content = '';
    
    switch (inputMethod) {
      case 'multiline':
        content = await this.showMultiLineInput(placeholder, maxLines);
        break;
      case 'editor':
        content = await this.openExternalEditor(syntax);
        break;
      case 'file':
        content = await this.importFromFile();
        break;
      case 'clipboard':
        content = await this.pasteFromClipboard();
        break;
    }

    if (!content.trim()) {
      console.log(chalk.yellow('📭 No content provided.'));
      return {
        content: '',
        metadata: { lines: 0, characters: 0, words: 0 }
      };
    }

    // Process and analyze content
    const metadata = this.analyzeContent(content, autoDetectLanguage);
    
    // Display content preview
    this.showContentPreview(content, metadata);
    
    // Save to file if requested
    if (saveToFile) {
      metadata.savedFile = await this.saveContentToFile(content, syntax);
    }

    return { content, metadata };
  }

  /**
   * Select input method
   */
  private async selectInputMethod(enableFileImport: boolean): Promise<string> {
    const choices = [
      {
        name: '📝 Multi-line text input (in terminal)',
        value: 'multiline',
        short: 'Multi-line'
      },
      {
        name: `📄 External editor (${this.editorCommand})`,
        value: 'editor',
        short: 'Editor'
      },
      {
        name: '📋 Paste from clipboard',
        value: 'clipboard',
        short: 'Clipboard'
      }
    ];

    if (enableFileImport) {
      choices.push({
        name: '📂 Import from file',
        value: 'file',
        short: 'File'
      });
    }

    const answer = await inquirer.prompt({
      type: 'list',
      name: 'method',
      message: 'How would you like to input your text?',
      choices,
      default: 'multiline'
    });

    return answer.method;
  }

  /**
   * Multi-line input in terminal
   */
  private async showMultiLineInput(placeholder: string, maxLines: number): Promise<string> {
    // Draw top border
    console.log(chalk.cyan('\n╔' + '═'.repeat(60) + '╗'));
    console.log(chalk.cyan('║') + chalk.blue.bold(' 💡 Multi-line Input Mode'.padEnd(59)) + chalk.cyan('║'));
    console.log(chalk.cyan('╟' + '─'.repeat(60) + '╢'));
    console.log(chalk.cyan('║') + chalk.gray(` • Type your content (up to ${maxLines} lines)`.padEnd(59)) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray(` • Press Enter twice to finish`.padEnd(59)) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray(` • Type 'CANCEL' on empty line to cancel`.padEnd(59)) + chalk.cyan('║'));
    console.log(chalk.cyan('╟' + '─'.repeat(60) + '╢'));
    
    const lines: string[] = [];
    let emptyLineCount = 0;
    let lineNumber = 1;

    while (lineNumber <= maxLines) {
      const prompt = chalk.cyan('║ ') + chalk.blue(`${lineNumber.toString().padStart(3)} │ `);
      
      const answer = await inquirer.prompt({
        type: 'input',
        name: 'line',
        message: prompt,
        default: lineNumber === 1 ? placeholder : ''
      });

      const line = answer.line;

      // Check for cancel command
      if (line === 'CANCEL' && lines.length === 0) {
        console.log(chalk.yellow('❌ Input cancelled.'));
        return '';
      }

      // Check for completion (two empty lines)
      if (!line.trim()) {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          break;
        }
      } else {
        emptyLineCount = 0;
      }

      lines.push(line);
      lineNumber++;
    }

    // Draw bottom border
    console.log(chalk.cyan('╚' + '═'.repeat(60) + '╝'));
    
    if (lineNumber > maxLines) {
      console.log(chalk.yellow(`\n⚠️  Maximum lines (${maxLines}) reached.`));
    }

    return lines.join('\n').trimEnd();
  }

  /**
   * Open external editor
   */
  private async openExternalEditor(syntax?: string): Promise<string> {
    const extension = this.getFileExtension(syntax);
    const tempFile = path.join(this.tempDir, `canvas-input-${Date.now()}${extension}`);
    
    // Create temp file with placeholder
    const placeholder = syntax 
      ? `// Enter your ${syntax} content here\n// Save and close the editor to continue\n\n`
      : `Enter your content here\nSave and close the editor to continue\n\n`;
    
    await fs.writeFile(tempFile, placeholder);
    
    console.log(chalk.blue(`\n📄 Opening ${this.editorCommand}...`));
    console.log(chalk.gray(`   File: ${tempFile}`));
    console.log(chalk.gray(`   Save and close the editor to continue`));
    
    try {
      const { spawn } = await import('child_process');
      
      await new Promise<void>((resolve, reject) => {
        const process = spawn(this.editorCommand, [tempFile], {
          stdio: 'inherit'
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Editor exited with code ${code}`));
          }
        });
        
        process.on('error', reject);
      });
      
      // Read content from temp file
      const content = await fs.readFile(tempFile, 'utf-8');
      
      // Clean up temp file
      await fs.remove(tempFile);
      
      return content.replace(placeholder, '').trim();
      
    } catch (error) {
      console.log(chalk.red(`❌ Error opening editor: ${error instanceof Error ? error.message : String(error)}`));
      
      // Fallback to multi-line input
      console.log(chalk.yellow('🔄 Falling back to multi-line input...'));
      return this.showMultiLineInput('Enter your content...', 50);
    }
  }

  /**
   * Import content from file
   */
  private async importFromFile(): Promise<string> {
    const answer = await inquirer.prompt({
      type: 'input',
      name: 'filePath',
      message: 'Enter file path to import:',
      validate: async (input) => {
        if (!input.trim()) return 'File path is required';
        
        const fullPath = path.resolve(input.trim());
        
        if (!await fs.pathExists(fullPath)) {
          return 'File does not exist';
        }
        
        const stats = await fs.stat(fullPath);
        if (!stats.isFile()) {
          return 'Path is not a file';
        }
        
        // Check file size (limit to 10MB)
        if (stats.size > 10 * 1024 * 1024) {
          return 'File too large (max 10MB)';
        }
        
        return true;
      }
    });

    try {
      const fullPath = path.resolve(answer.filePath.trim());
      const content = await fs.readFile(fullPath, 'utf-8');
      
      console.log(chalk.green(`✅ Imported content from: ${fullPath}`));
      return content;
      
    } catch (error) {
      console.log(chalk.red(`❌ Error reading file: ${error instanceof Error ? error.message : String(error)}`));
      return '';
    }
  }

  /**
   * Paste from clipboard (simulated - would need clipboard access)
   */
  private async pasteFromClipboard(): Promise<string> {
    console.log(chalk.blue(`\n📋 Clipboard paste mode:`));
    console.log(chalk.gray(`   • Paste your content below`));
    console.log(chalk.gray(`   • Press Ctrl+D when finished (or type END on new line)`));
    console.log(chalk.gray('━'.repeat(40)));

    const answer = await inquirer.prompt({
      type: 'editor',
      name: 'content',
      message: 'Paste your content:',
    });

    return answer.content || '';
  }

  /**
   * Analyze content and extract metadata
   */
  private analyzeContent(content: string, autoDetectLanguage: boolean): TextBoxResult['metadata'] {
    const lines = content.split('\n').length;
    const characters = content.length;
    const words = content.trim().split(/\s+/).filter(word => word.length > 0).length;
    
    const metadata: TextBoxResult['metadata'] = {
      lines,
      characters,
      words
    };

    if (autoDetectLanguage) {
      metadata.language = this.detectLanguage(content);
    }

    return metadata;
  }

  /**
   * Show content preview
   */
  private showContentPreview(content: string, metadata: TextBoxResult['metadata']): void {
    // Draw bordered preview box
    console.log(chalk.green('\n╔' + '═'.repeat(60) + '╗'));
    console.log(chalk.green('║') + chalk.green.bold(' ✅ Content Received!'.padEnd(59)) + chalk.green('║'));
    console.log(chalk.green('╟' + '─'.repeat(60) + '╢'));
    
    // Metadata section
    console.log(chalk.green('║') + chalk.blue(' 📊 Statistics:'.padEnd(59)) + chalk.green('║'));
    console.log(chalk.green('║') + chalk.gray(`    Lines: ${metadata.lines.toLocaleString()}`.padEnd(59)) + chalk.green('║'));
    console.log(chalk.green('║') + chalk.gray(`    Characters: ${metadata.characters.toLocaleString()}`.padEnd(59)) + chalk.green('║'));
    console.log(chalk.green('║') + chalk.gray(`    Words: ${metadata.words.toLocaleString()}`.padEnd(59)) + chalk.green('║'));
    
    if (metadata.language) {
      console.log(chalk.green('║') + chalk.gray(`    Language: ${metadata.language}`.padEnd(59)) + chalk.green('║'));
    }
    
    // Preview section with border
    console.log(chalk.green('╟' + '─'.repeat(60) + '╢'));
    console.log(chalk.green('║') + chalk.blue(' 📖 Preview:'.padEnd(59)) + chalk.green('║'));
    
    const preview = content.slice(0, 200);
    const hasMore = content.length > 200;
    const previewLines = preview.split('\n').slice(0, 5);
    
    previewLines.forEach((line) => {
      const truncated = line.length > 56 ? line.slice(0, 53) + '...' : line;
      console.log(chalk.green('║') + chalk.white('  ' + truncated.padEnd(57)) + chalk.green('║'));
    });
    
    if (hasMore || content.split('\n').length > 5) {
      console.log(chalk.green('║') + chalk.yellow('  ... (content continues)'.padEnd(59)) + chalk.green('║'));
    }
    
    // Close the box
    console.log(chalk.green('╚' + '═'.repeat(60) + '╝'));
  }

  /**
   * Save content to file
   */
  private async saveContentToFile(content: string, syntax?: string): Promise<string> {
    const extension = this.getFileExtension(syntax);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `canvas-content-${timestamp}${extension}`;
    const filePath = path.join(process.cwd(), fileName);
    
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(chalk.green(`💾 Content saved to: ${fileName}`));
      return filePath;
    } catch (error) {
      console.log(chalk.red(`❌ Error saving file: ${error instanceof Error ? error.message : String(error)}`));
      return '';
    }
  }

  /**
   * Detect available text editor
   */
  private detectEditor(): string {
    const editors = ['code', 'vim', 'nano', 'notepad'];
    
    for (const editor of editors) {
      try {
        const { execSync } = require('child_process');
        execSync(`which ${editor}`, { stdio: 'ignore' });
        return editor;
      } catch {
        continue;
      }
    }
    
    // Windows fallback
    if (process.platform === 'win32') {
      return 'notepad';
    }
    
    return 'vim';
  }

  /**
   * Get file extension based on syntax
   */
  private getFileExtension(syntax?: string): string {
    const extensions: Record<string, string> = {
      javascript: '.js',
      typescript: '.ts',
      python: '.py',
      java: '.java',
      cpp: '.cpp',
      c: '.c',
      html: '.html',
      css: '.css',
      json: '.json',
      yaml: '.yml',
      markdown: '.md',
      sql: '.sql',
      shell: '.sh'
    };
    
    return syntax ? (extensions[syntax.toLowerCase()] || '.txt') : '.txt';
  }

  /**
   * Simple language detection
   */
  private detectLanguage(content: string): string {
    const patterns: Record<string, RegExp[]> = {
      'JavaScript': [/function\s+\w+/, /const\s+\w+\s*=/, /\.then\(/, /console\.log/],
      'TypeScript': [/interface\s+\w+/, /type\s+\w+\s*=/, /:\s*string/, /export\s+(default\s+)?class/],
      'Python': [/def\s+\w+\(/, /import\s+\w+/, /if\s+__name__\s*==/, /print\(/],
      'Java': [/public\s+class\s+\w+/, /public\s+static\s+void\s+main/, /System\.out\.println/],
      'C++': [/#include\s*</, /std::/, /int\s+main\(/],
      'HTML': [/<html/, /<div/, /<script/, /<style/],
      'CSS': [/\{\s*[\w-]+\s*:/, /@media/, /\.[\w-]+\s*\{/],
      'JSON': [/^\s*{/, /"[\w-]+"\s*:/],
      'YAML': [/^[\w-]+\s*:/, /^\s*-\s+/],
      'Markdown': [/^#\s+/, /\*\*\w+\*\*/, /```/],
      'SQL': [/SELECT\s+/, /FROM\s+\w+/, /WHERE\s+/i]
    };

    for (const [language, regexes] of Object.entries(patterns)) {
      const matches = regexes.filter(regex => regex.test(content)).length;
      if (matches >= 2 || (matches >= 1 && regexes.length <= 2)) {
        return language;
      }
    }

    return 'Text';
  }
}

/**
 * Quick text box function for simple usage
 */
export async function showTextBox(options?: TextBoxOptions): Promise<TextBoxResult> {
  const textBox = new CanvasTextBox();
  return textBox.show(options);
}