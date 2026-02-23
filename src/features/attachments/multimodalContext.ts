import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import FormData from 'form-data';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { parsePDF } from '../../utils/pdf-loader.js';

const execAsync = promisify(exec);

// 6. Multimodal Context Attachments
export interface Attachment {
  id: string;
  type: 'image' | 'pdf' | 'code' | 'data' | 'screenshot' | 'diagram';
  path: string;
  name: string;
  size: number;
  mimeType: string;
  metadata: {
    width?: number;
    height?: number;
    pages?: number;
    language?: string;
    extracted?: boolean;
    thumbnail?: string;
    description?: string;
    context?: string;
  };
  createdAt: Date;
}

export interface AttachmentContext {
  sessionId: string;
  attachments: Map<string, Attachment>;
  maxSize: number;
  extractedData: Map<string, any>;
}

export class MultimodalContextSystem extends EventEmitter {
  private contexts: Map<string, AttachmentContext> = new Map();
  private activeContext: AttachmentContext | null = null;
  private storageDir: string;
  private thumbnailDir: string;
  private maxFileSize: number = 50 * 1024 * 1024; // 50MB
  
  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'attachments');
    this.thumbnailDir = path.join(this.storageDir, 'thumbnails');
    fs.ensureDirSync(this.storageDir);
    fs.ensureDirSync(this.thumbnailDir);
  }
  
  createContext(sessionId: string = uuidv4()): AttachmentContext {
    const context: AttachmentContext = {
      sessionId,
      attachments: new Map(),
      maxSize: this.maxFileSize,
      extractedData: new Map()
    };
    
    this.contexts.set(sessionId, context);
    this.activeContext = context;
    this.emit('context-created', context);
    
    return context;
  }
  
  async attachFile(filePath: string, contextId?: string): Promise<Attachment> {
    const context = contextId ? this.contexts.get(contextId) : this.activeContext;
    if (!context) throw new Error('No active context');
    
    const stats = await fs.stat(filePath);
    if (stats.size > this.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.maxFileSize} bytes)`);
    }
    
    const attachment: Attachment = {
      id: uuidv4(),
      type: this.detectType(filePath),
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      mimeType: this.getMimeType(filePath),
      metadata: {},
      createdAt: new Date()
    };
    
    // Process based on type
    await this.processAttachment(attachment);
    
    context.attachments.set(attachment.id, attachment);
    this.emit('attachment-added', { context, attachment });
    
    console.log(chalk.green(`✅ Attached: ${attachment.name} (${this.formatSize(attachment.size)})`));
    
    return attachment;
  }
  
  async attachScreenshot(region?: 'full' | 'selection' | 'window'): Promise<Attachment> {
    const context = this.activeContext;
    if (!context) throw new Error('No active context');
    
    const screenshotPath = path.join(this.storageDir, `screenshot-${Date.now()}.png`);
    
    // Platform-specific screenshot commands
    let command: string;
    if (process.platform === 'darwin') {
      // macOS
      command = region === 'selection' 
        ? `screencapture -i ${screenshotPath}`
        : `screencapture ${screenshotPath}`;
    } else if (process.platform === 'win32') {
      // Windows - use PowerShell
      command = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('%{PRTSC}');"`;
    } else {
      // Linux
      command = `import ${screenshotPath}`;
    }
    
    console.log(chalk.cyan('📸 Taking screenshot...'));
    await execAsync(command);
    
    if (await fs.pathExists(screenshotPath)) {
      return this.attachFile(screenshotPath);
    } else {
      throw new Error('Screenshot capture failed');
    }
  }
  
  async attachFromClipboard(): Promise<Attachment | null> {
    const context = this.activeContext;
    if (!context) throw new Error('No active context');
    
    // Platform-specific clipboard access
    const clipboardData: string | Buffer | null = null;
    
    try {
      if (process.platform === 'darwin') {
        // Try to get image from clipboard first
        const { stdout } = await execAsync('osascript -e "clipboard info"');
        if (stdout.includes('picture')) {
          // Save clipboard image
          const imagePath = path.join(this.storageDir, `clipboard-${Date.now()}.png`);
          await execAsync(`osascript -e 'set the clipboard to (read (POSIX file "/tmp/clipboard.png") as TIFF picture)' && pbpaste > ${imagePath}`);
          return this.attachFile(imagePath);
        } else {
          // Get text from clipboard
          const { stdout: text } = await execAsync('pbpaste');
          if (text) {
            const textPath = path.join(this.storageDir, `clipboard-${Date.now()}.txt`);
            await fs.writeFile(textPath, text);
            return this.attachFile(textPath);
          }
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not access clipboard'));
    }
    
    return null;
  }
  
  private async processAttachment(attachment: Attachment): Promise<void> {
    switch (attachment.type) {
      case 'image':
        await this.processImage(attachment);
        break;
      case 'pdf':
        await this.processPDF(attachment);
        break;
      case 'code':
        await this.processCode(attachment);
        break;
      case 'data':
        await this.processData(attachment);
        break;
      case 'diagram':
        await this.processDiagram(attachment);
        break;
    }
  }
  
  private async processImage(attachment: Attachment): Promise<void> {
    try {
      const image = sharp(attachment.path);
      const metadata = await image.metadata();
      
      attachment.metadata.width = metadata.width;
      attachment.metadata.height = metadata.height;
      
      // Generate thumbnail
      const thumbnailPath = path.join(this.thumbnailDir, `${attachment.id}.jpg`);
      await image
        .resize(200, 200, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);
      
      attachment.metadata.thumbnail = thumbnailPath;
      
      // Extract text if possible (OCR would go here)
      attachment.metadata.extracted = false;
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not process image fully'));
    }
  }
  
  private async processPDF(attachment: Attachment): Promise<void> {
    try {
      const dataBuffer = await fs.readFile(attachment.path);
      const data = await parsePDF(dataBuffer);
      
      if (data.error) {
        console.log(chalk.yellow(`⚠️ PDF processing limited: ${data.error}`));
        attachment.metadata.pages = 0;
        attachment.metadata.description = 'PDF content could not be extracted';
        attachment.metadata.extracted = false;
        return;
      }
      
      attachment.metadata.pages = data.numpages || 0;
      attachment.metadata.description = data.text?.slice(0, 500) || '';
      attachment.metadata.extracted = true;
      
      // Store extracted text
      if (this.activeContext && data.text) {
        this.activeContext.extractedData.set(attachment.id, {
          text: data.text,
          pages: data.numpages
        });
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not extract PDF content'));
    }
  }
  
  private async processCode(attachment: Attachment): Promise<void> {
    const ext = path.extname(attachment.path).slice(1);
    attachment.metadata.language = this.getLanguageFromExtension(ext);
    
    // Read and analyze code
    const content = await fs.readFile(attachment.path, 'utf-8');
    const lines = content.split('\n');
    
    attachment.metadata.context = `Code file with ${lines.length} lines`;
    
    if (this.activeContext) {
      this.activeContext.extractedData.set(attachment.id, {
        content,
        lines: lines.length,
        language: attachment.metadata.language
      });
    }
  }
  
  private async processData(attachment: Attachment): Promise<void> {
    const ext = path.extname(attachment.path).slice(1);
    
    if (ext === 'json') {
      const data = await fs.readJson(attachment.path);
      attachment.metadata.description = `JSON with ${Object.keys(data).length} keys`;
      
      if (this.activeContext) {
        this.activeContext.extractedData.set(attachment.id, data);
      }
    } else if (ext === 'csv') {
      const content = await fs.readFile(attachment.path, 'utf-8');
      const lines = content.split('\n');
      const headers = lines[0]?.split(',');
      
      attachment.metadata.description = `CSV with ${lines.length} rows, ${headers?.length || 0} columns`;
      
      if (this.activeContext) {
        this.activeContext.extractedData.set(attachment.id, {
          headers,
          rowCount: lines.length - 1
        });
      }
    }
  }
  
  private async processDiagram(attachment: Attachment): Promise<void> {
    // Process mermaid, graphviz, or other diagram formats
    const content = await fs.readFile(attachment.path, 'utf-8');
    
    if (content.includes('graph') || content.includes('digraph')) {
      attachment.metadata.description = 'Graphviz diagram';
    } else if (content.includes('mermaid')) {
      attachment.metadata.description = 'Mermaid diagram';
    }
    
    if (this.activeContext) {
      this.activeContext.extractedData.set(attachment.id, { content });
    }
  }
  
  getContextSummary(contextId?: string): string {
    const context = contextId ? this.contexts.get(contextId) : this.activeContext;
    if (!context) return 'No active context';
    
    const lines: string[] = [];
    lines.push(chalk.cyan('📎 Attached Context:'));
    
    for (const [id, attachment] of context.attachments) {
      const icon = this.getTypeIcon(attachment.type);
      lines.push(`  ${icon} ${attachment.name} (${this.formatSize(attachment.size)})`);
      
      if (attachment.metadata.description) {
        lines.push(chalk.dim(`     ${attachment.metadata.description.slice(0, 100)}...`));
      }
    }
    
    return lines.join('\n');
  }
  
  async exportContext(contextId: string, format: 'zip' | 'json' = 'json'): Promise<string> {
    const context = this.contexts.get(contextId);
    if (!context) throw new Error('Context not found');
    
    const exportDir = path.join(this.storageDir, 'exports');
    await fs.ensureDir(exportDir);
    
    if (format === 'json') {
      const exportData = {
        sessionId: context.sessionId,
        attachments: Array.from(context.attachments.values()),
        extractedData: Object.fromEntries(context.extractedData),
        exportedAt: new Date()
      };
      
      const exportPath = path.join(exportDir, `context-${contextId}.json`);
      await fs.writeJson(exportPath, exportData, { spaces: 2 });
      return exportPath;
    } else {
      // ZIP export would go here
      throw new Error('ZIP export not yet implemented');
    }
  }
  
  private detectType(filePath: string): Attachment['type'] {
    const ext = path.extname(filePath).toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const codeExts = ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.go', '.rs'];
    const dataExts = ['.json', '.csv', '.xml', '.yaml', '.yml'];
    const diagramExts = ['.dot', '.gv', '.mmd', '.puml'];
    
    if (imageExts.includes(ext)) return 'image';
    if (ext === '.pdf') return 'pdf';
    if (codeExts.includes(ext)) return 'code';
    if (dataExts.includes(ext)) return 'data';
    if (diagramExts.includes(ext)) return 'diagram';
    
    return 'data'; // default
  }
  
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.txt': 'text/plain',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.py': 'text/x-python'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
  
  private getLanguageFromExtension(ext: string): string {
    const languages: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php'
    };
    
    return languages[ext] || ext;
  }
  
  private getTypeIcon(type: Attachment['type']): string {
    const icons: Record<Attachment['type'], string> = {
      'image': '🖼️',
      'pdf': '📄',
      'code': '💻',
      'data': '📊',
      'screenshot': '📸',
      'diagram': '📐'
    };
    
    return icons[type] || '📎';
  }
  
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Singleton instance
let multimodalInstance: MultimodalContextSystem | null = null;

export function getMultimodalContext(): MultimodalContextSystem {
  if (!multimodalInstance) {
    multimodalInstance = new MultimodalContextSystem();
  }
  return multimodalInstance;
}