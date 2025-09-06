import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 2. Interactive Notebooks (Jupyter-style)
export interface NotebookCell {
  id: string;
  type: 'markdown' | 'code' | 'command';
  content: string;
  output?: string;
  executionCount?: number;
  metadata?: {
    collapsed?: boolean;
    language?: string;
    kernelName?: string;
  };
}

export interface Notebook {
  id: string;
  name: string;
  description: string;
  cells: NotebookCell[];
  metadata: {
    created: Date;
    modified: Date;
    author: string;
    version: string;
    tags?: string[];
    shared?: boolean;
  };
}

export class NotebookSystem extends EventEmitter {
  private notebooks: Map<string, Notebook> = new Map();
  private activeNotebook: Notebook | null = null;
  private storageDir: string;
  private executionCount: number = 0;
  
  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'notebooks');
    fs.ensureDirSync(this.storageDir);
    this.loadNotebooks();
  }
  
  createNotebook(name: string, description: string = ''): Notebook {
    const notebook: Notebook = {
      id: uuidv4(),
      name,
      description,
      cells: [],
      metadata: {
        created: new Date(),
        modified: new Date(),
        author: os.userInfo().username,
        version: '1.0.0',
        tags: [],
        shared: false
      }
    };
    
    this.notebooks.set(notebook.id, notebook);
    this.saveNotebook(notebook);
    this.emit('notebook-created', notebook);
    
    return notebook;
  }
  
  openNotebook(id: string): Notebook | null {
    const notebook = this.notebooks.get(id);
    if (notebook) {
      this.activeNotebook = notebook;
      this.emit('notebook-opened', notebook);
      return notebook;
    }
    return null;
  }
  
  addCell(
    notebookId: string,
    type: NotebookCell['type'],
    content: string,
    position?: number
  ): NotebookCell {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) throw new Error('Notebook not found');
    
    const cell: NotebookCell = {
      id: uuidv4(),
      type,
      content,
      metadata: {
        collapsed: false,
        language: type === 'code' ? 'javascript' : undefined
      }
    };
    
    if (position !== undefined && position >= 0 && position <= notebook.cells.length) {
      notebook.cells.splice(position, 0, cell);
    } else {
      notebook.cells.push(cell);
    }
    
    notebook.metadata.modified = new Date();
    this.saveNotebook(notebook);
    this.emit('cell-added', { notebook, cell });
    
    return cell;
  }
  
  async executeCell(notebookId: string, cellId: string): Promise<void> {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) throw new Error('Notebook not found');
    
    const cell = notebook.cells.find(c => c.id === cellId);
    if (!cell) throw new Error('Cell not found');
    
    if (cell.type === 'command' || cell.type === 'code') {
      this.executionCount++;
      cell.executionCount = this.executionCount;
      
      try {
        const { stdout, stderr } = await execAsync(cell.content);
        cell.output = stdout || stderr;
        this.emit('cell-executed', { notebook, cell, success: true });
      } catch (error: any) {
        cell.output = `Error: ${error.message}`;
        this.emit('cell-executed', { notebook, cell, success: false, error });
      }
      
      this.saveNotebook(notebook);
    }
  }
  
  async executeAllCells(notebookId: string): Promise<void> {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) throw new Error('Notebook not found');
    
    for (const cell of notebook.cells) {
      if (cell.type === 'command' || cell.type === 'code') {
        await this.executeCell(notebookId, cell.id);
      }
    }
  }
  
  updateCell(notebookId: string, cellId: string, content: string): void {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) throw new Error('Notebook not found');
    
    const cell = notebook.cells.find(c => c.id === cellId);
    if (!cell) throw new Error('Cell not found');
    
    cell.content = content;
    cell.output = undefined; // Clear output on edit
    notebook.metadata.modified = new Date();
    
    this.saveNotebook(notebook);
    this.emit('cell-updated', { notebook, cell });
  }
  
  deleteCell(notebookId: string, cellId: string): void {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) throw new Error('Notebook not found');
    
    const index = notebook.cells.findIndex(c => c.id === cellId);
    if (index === -1) throw new Error('Cell not found');
    
    const [deletedCell] = notebook.cells.splice(index, 1);
    notebook.metadata.modified = new Date();
    
    this.saveNotebook(notebook);
    this.emit('cell-deleted', { notebook, cell: deletedCell });
  }
  
  exportNotebook(notebookId: string, format: 'markdown' | 'json' | 'html' = 'markdown'): string {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) throw new Error('Notebook not found');
    
    switch (format) {
      case 'json':
        return JSON.stringify(notebook, null, 2);
        
      case 'markdown':
        return this.exportToMarkdown(notebook);
        
      case 'html':
        return this.exportToHTML(notebook);
        
      default:
        throw new Error('Unsupported format');
    }
  }
  
  private exportToMarkdown(notebook: Notebook): string {
    let markdown = `# ${notebook.name}\n\n`;
    if (notebook.description) {
      markdown += `> ${notebook.description}\n\n`;
    }
    
    markdown += `**Author:** ${notebook.metadata.author}\n`;
    markdown += `**Created:** ${notebook.metadata.created}\n`;
    markdown += `**Modified:** ${notebook.metadata.modified}\n\n`;
    
    if (notebook.metadata.tags?.length) {
      markdown += `**Tags:** ${notebook.metadata.tags.join(', ')}\n\n`;
    }
    
    markdown += '---\n\n';
    
    for (const cell of notebook.cells) {
      switch (cell.type) {
        case 'markdown':
          markdown += cell.content + '\n\n';
          break;
          
        case 'code':
        case 'command':
          markdown += '```' + (cell.metadata?.language || 'bash') + '\n';
          markdown += cell.content + '\n';
          markdown += '```\n';
          
          if (cell.output) {
            markdown += '\n**Output:**\n```\n';
            markdown += cell.output + '\n';
            markdown += '```\n';
          }
          
          markdown += '\n';
          break;
      }
    }
    
    return markdown;
  }
  
  private exportToHTML(notebook: Notebook): string {
    const markdown = this.exportToMarkdown(notebook);
    // In production, use a markdown-to-HTML converter
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>${notebook.name}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px;
      background: #1a1a1a;
      color: #e0e0e0;
    }
    pre { 
      background: #2a2a2a;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
    }
    code {
      background: #2a2a2a;
      padding: 2px 5px;
      border-radius: 3px;
    }
    blockquote {
      border-left: 3px solid #4a9eff;
      padding-left: 15px;
      color: #999;
    }
  </style>
</head>
<body>
  <pre>${this.escapeHtml(markdown)}</pre>
</body>
</html>`;
  }
  
  importNotebook(content: string, format: 'markdown' | 'json' = 'markdown'): Notebook {
    if (format === 'json') {
      const data = JSON.parse(content);
      const notebook = this.createNotebook(data.name, data.description);
      notebook.cells = data.cells;
      notebook.metadata = { ...notebook.metadata, ...data.metadata };
      this.saveNotebook(notebook);
      return notebook;
    }
    
    // Parse markdown
    const lines = content.split('\n');
    const name = lines[0].replace(/^#\s+/, '') || 'Imported Notebook';
    const notebook = this.createNotebook(name);
    
    let currentCell: NotebookCell | null = null;
    let inCodeBlock = false;
    
    for (const line of lines.slice(1)) {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          // Start code block
          const language = line.slice(3).trim() || 'bash';
          currentCell = {
            id: uuidv4(),
            type: 'code',
            content: '',
            metadata: { language }
          };
          inCodeBlock = true;
        } else {
          // End code block
          if (currentCell) {
            notebook.cells.push(currentCell);
            currentCell = null;
          }
          inCodeBlock = false;
        }
      } else if (inCodeBlock && currentCell) {
        currentCell.content += line + '\n';
      } else if (line.trim()) {
        // Markdown cell
        notebook.cells.push({
          id: uuidv4(),
          type: 'markdown',
          content: line
        });
      }
    }
    
    this.saveNotebook(notebook);
    return notebook;
  }
  
  shareNotebook(notebookId: string): string {
    const notebook = this.notebooks.get(notebookId);
    if (!notebook) throw new Error('Notebook not found');
    
    notebook.metadata.shared = true;
    const shareId = uuidv4().slice(0, 8);
    const shareUrl = `canvas://notebooks/${shareId}`;
    
    // Save shared notebook
    const sharePath = path.join(this.storageDir, 'shared', `${shareId}.json`);
    fs.ensureDirSync(path.dirname(sharePath));
    fs.writeJsonSync(sharePath, notebook);
    
    this.emit('notebook-shared', { notebook, shareUrl });
    return shareUrl;
  }
  
  listNotebooks(): Array<{ id: string; name: string; description: string; modified: Date }> {
    return Array.from(this.notebooks.values()).map(nb => ({
      id: nb.id,
      name: nb.name,
      description: nb.description,
      modified: nb.metadata.modified
    }));
  }
  
  renderNotebook(notebook: Notebook): string {
    const lines: string[] = [];
    const width = process.stdout.columns || 80;
    
    // Header
    lines.push(chalk.bold.cyan(`📓 ${notebook.name}`));
    if (notebook.description) {
      lines.push(chalk.dim(`   ${notebook.description}`));
    }
    lines.push(chalk.dim(`   Modified: ${notebook.metadata.modified.toLocaleString()}`));
    lines.push('');
    
    // Cells
    notebook.cells.forEach((cell, index) => {
      const cellNum = `[${index + 1}]`;
      
      switch (cell.type) {
        case 'markdown':
          lines.push(chalk.gray(cellNum) + ' ' + chalk.white(cell.content));
          break;
          
        case 'code':
        case 'command':
          lines.push(chalk.gray(cellNum) + ' ' + chalk.yellow(`${cell.type}:`));
          lines.push(chalk.green('   ' + cell.content));
          
          if (cell.output) {
            lines.push(chalk.dim('   Output:'));
            cell.output.split('\n').forEach(line => {
              lines.push(chalk.dim('   ' + line));
            });
          }
          break;
      }
      
      lines.push('');
    });
    
    return lines.join('\n');
  }
  
  private saveNotebook(notebook: Notebook): void {
    const notebookPath = path.join(this.storageDir, `${notebook.id}.json`);
    fs.writeJsonSync(notebookPath, notebook);
  }
  
  private loadNotebooks(): void {
    try {
      const files = fs.readdirSync(this.storageDir)
        .filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const notebook = fs.readJsonSync(path.join(this.storageDir, file));
        this.notebooks.set(notebook.id, notebook);
      }
    } catch (error) {
      // Silent fail on first run
    }
  }
  
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Singleton instance
let notebookSystemInstance: NotebookSystem | null = null;

export function getNotebookSystem(): NotebookSystem {
  if (!notebookSystemInstance) {
    notebookSystemInstance = new NotebookSystem();
  }
  return notebookSystemInstance;
}