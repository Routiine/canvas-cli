import chalk from 'chalk';
import hljs from 'highlight.js';
import stripAnsi from 'strip-ansi';

interface HighlightOptions {
  language?: string;
  theme?: 'dark' | 'light';
  lineNumbers?: boolean;
}

export class SyntaxHighlighter {
  private static tokenColors = {
    keyword: chalk.magenta,
    string: chalk.green,
    number: chalk.cyan,
    comment: chalk.gray,
    function: chalk.yellow,
    class: chalk.blue,
    variable: chalk.white,
    operator: chalk.red,
    punctuation: chalk.dim.white,
    builtin: chalk.cyan.bold,
    type: chalk.blue.italic,
    property: chalk.white,
    attribute: chalk.yellow,
    tag: chalk.blue.bold,
    selector: chalk.magenta,
    'attr-name': chalk.yellow,
    'attr-value': chalk.green
  };

  static highlight(code: string, options: HighlightOptions = {}): string {
    const { language, lineNumbers = false } = options;
    
    // Clean the code of any existing ANSI codes
    const cleanCode = stripAnsi(code);
    
    try {
      // Auto-detect language if not provided
      const result = language 
        ? hljs.highlight(cleanCode, { language })
        : hljs.highlightAuto(cleanCode);
      
      // Apply colors based on token types
      let highlighted = this.applyColors(result.value);
      
      // Add line numbers if requested
      if (lineNumbers) {
        highlighted = this.addLineNumbers(highlighted);
      }
      
      return highlighted;
    } catch (error) {
      // If highlighting fails, return original with basic formatting
      return lineNumbers ? this.addLineNumbers(cleanCode) : cleanCode;
    }
  }

  private static applyColors(html: string): string {
    // Convert HTML highlighting to terminal colors
    let result = html;
    
    // Remove HTML tags and apply colors based on class names
    result = result.replace(/<span class="hljs-([^"]+)">([^<]*)<\/span>/g, (match, className, content) => {
      const colorFn = this.tokenColors[className as keyof typeof this.tokenColors] || chalk.white;
      return colorFn(content);
    });
    
    // Clean up any remaining HTML
    result = result.replace(/<[^>]+>/g, '');
    
    // Handle common patterns directly
    result = result
      // Strings
      .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => chalk.green(match))
      // Numbers
      .replace(/\b\d+\.?\d*\b/g, (match) => chalk.cyan(match))
      // Comments (single line)
      .replace(/\/\/.*$/gm, (match) => chalk.gray(match))
      // Comments (multi-line)
      .replace(/\/\*[\s\S]*?\*\//g, (match) => chalk.gray(match))
      // Keywords (common ones)
      .replace(/\b(const|let|var|function|class|if|else|for|while|return|import|export|from|async|await|try|catch|throw|new|this|super)\b/g, 
        (match) => chalk.magenta(match));
    
    return result;
  }

  private static addLineNumbers(code: string): string {
    const lines = code.split('\n');
    const maxLineNum = lines.length;
    const padding = maxLineNum.toString().length;
    
    return lines.map((line, index) => {
      const lineNum = (index + 1).toString().padStart(padding, ' ');
      return chalk.dim(`${lineNum} │`) + ' ' + line;
    }).join('\n');
  }

  static detectLanguage(code: string): string {
    const result = hljs.highlightAuto(code);
    return result.language || 'plaintext';
  }

  static highlightInline(text: string): string {
    // Highlight inline code snippets in backticks
    return text.replace(/`([^`]+)`/g, (match, code) => {
      return chalk.bgGray.white(` ${code} `);
    });
  }

  static highlightDiff(diff: string): string {
    const lines = diff.split('\n');
    return lines.map(line => {
      if (line.startsWith('+')) {
        return chalk.green(line);
      } else if (line.startsWith('-')) {
        return chalk.red(line);
      } else if (line.startsWith('@')) {
        return chalk.cyan(line);
      }
      return line;
    }).join('\n');
  }

  static highlightJson(json: any): string {
    const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    return this.highlight(jsonString, { language: 'json' });
  }

  static highlightMarkdown(markdown: string): string {
    let result = markdown;
    
    // Headers
    result = result.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
      return chalk.bold.blue(hashes + ' ' + content);
    });
    
    // Bold
    result = result.replace(/\*\*([^*]+)\*\*/g, (match, content) => chalk.bold(content));
    
    // Italic
    result = result.replace(/\*([^*]+)\*/g, (match, content) => chalk.italic(content));
    
    // Code blocks
    result = result.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const highlighted = this.highlight(code.trim(), { language: lang });
      return chalk.gray('```') + (lang ? chalk.yellow(lang) : '') + '\n' + 
             highlighted + '\n' + chalk.gray('```');
    });
    
    // Inline code
    result = this.highlightInline(result);
    
    // Links
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      return chalk.blue.underline(text) + chalk.dim(` (${url})`);
    });
    
    // Lists
    result = result.replace(/^(\s*)([-*+])\s+(.+)$/gm, (match, indent, bullet, content) => {
      return indent + chalk.yellow(bullet) + ' ' + content;
    });
    
    // Numbered lists
    result = result.replace(/^(\s*)(\d+\.)\s+(.+)$/gm, (match, indent, num, content) => {
      return indent + chalk.yellow(num) + ' ' + content;
    });
    
    return result;
  }
}

// Convenience functions
export function highlightCode(code: string, language?: string): string {
  return SyntaxHighlighter.highlight(code, { language });
}

export function highlightMarkdown(markdown: string): string {
  return SyntaxHighlighter.highlightMarkdown(markdown);
}

export function highlightJson(json: any): string {
  return SyntaxHighlighter.highlightJson(json);
}