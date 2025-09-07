import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * Enhanced text box interface for Canvas CLI
 * Supports multi-line input using an external editor.
 */

export interface TextBoxOptions {
  title?: string;
  placeholder?: string;
  syntax?: string;
}

export interface TextBoxResult {
  content: string;
  metadata: {
    lines: number;
    characters: number;
    words: number;
    language?: string;
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
      syntax
    } = options;

    console.log(chalk.blue(`\n${title}`));
    const content = await this.openExternalEditor(syntax, placeholder);

    if (!content.trim()) {
      console.log(chalk.yellow('📭 No content provided.'));
      return {
        content: '',
        metadata: { lines: 0, characters: 0, words: 0 }
      };
    }

    // Process and analyze content
    const metadata = this.analyzeContent(content, true);
    
    return { content, metadata };
  }

  /**
   * Open external editor
   */
  private async openExternalEditor(syntax?: string, placeholder?: string): Promise<string> {
    const extension = this.getFileExtension(syntax);
    const tempFile = path.join(this.tempDir, `canvas-input-${Date.now()}${extension}`);
    
    const fileContent = placeholder || (syntax 
      ? `// Enter your ${syntax} content here\n// Save and close the editor to continue\n\n` 
      : `Enter your content here\nSave and close the editor to continue\n\n`);
    
    await fs.writeFile(tempFile, fileContent);
    
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
      
      return content.replace(fileContent, '').trim();
      
    } catch (error) {
      console.log(chalk.red(`❌ Error opening editor: ${error instanceof Error ? error.message : String(error)}`));
      return '';
    }
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
      'CSS': [/\{\s*[\w-]+\s*:/, /@media/, /\.["w-]+\s*\{/],
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
