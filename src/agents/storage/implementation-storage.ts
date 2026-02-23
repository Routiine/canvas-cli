/**
 * Implementation Storage System
 * Stores and manages code implementations, versions, and artifacts
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import chalk from 'chalk';
import crypto from 'crypto';

export interface StoredImplementation {
  id: string;
  metadata: {
    title: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    version: string;
    tags: string[];
    author: string;
    language: string;
    framework?: string;
    size: number;
    checksum: string;
  };
  files: Array<{
    path: string;
    content: string;
    type: string;
    size: number;
  }>;
  dependencies?: Record<string, string>;
  buildConfig?: any;
  deploymentConfig?: any;
}

export interface VersionInfo {
  version: string;
  timestamp: string;
  changes: string[];
  checksum: string;
  author: string;
}

export interface StorageStats {
  totalImplementations: number;
  totalSize: number;
  languages: Record<string, number>;
  frameworks: Record<string, number>;
  recentImplementations: StoredImplementation[];
}

/**
 * Implementation Storage Class
 */
export class ImplementationStorage extends EventEmitter {
  private storagePath: string;
  private indexPath: string;
  private index: Map<string, any> = new Map();
  private maxStorageSize: number = 1024 * 1024 * 1024; // 1GB default
  
  constructor(customPath?: string) {
    super();
    const canvasDir = path.join(os.homedir(), '.canvas-cli');
    this.storagePath = customPath || path.join(canvasDir, 'implementations');
    this.indexPath = path.join(this.storagePath, 'index.json');
  }
  
  async initialize(): Promise<void> {
    await fs.ensureDir(this.storagePath);
    await this.loadIndex();
    this.emit('initialized', { path: this.storagePath });
  }
  
  /**
   * Store implementation
   */
  async store(implementation: any): Promise<string> {
    console.log(chalk.dim('    💾 Storing implementation...'));
    
    const id = implementation.id || this.generateId();
    const implPath = path.join(this.storagePath, id);
    
    // Create implementation directory
    await fs.ensureDir(implPath);
    
    // Calculate checksum
    const checksum = this.calculateChecksum(implementation);
    
    // Create stored implementation
    const stored: StoredImplementation = {
      id,
      metadata: {
        title: implementation.title,
        description: implementation.description,
        createdAt: implementation.metadata?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: '1.0.0',
        tags: implementation.tags || [],
        author: implementation.metadata?.author || 'unknown',
        language: implementation.language,
        framework: implementation.framework,
        size: this.calculateSize(implementation),
        checksum
      },
      files: implementation.files || [],
      dependencies: implementation.dependencies?.external,
      buildConfig: implementation.buildConfig,
      deploymentConfig: implementation.deploymentConfig
    };
    
    // Store files
    for (const file of stored.files) {
      const filePath = path.join(implPath, file.path);
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, file.content, 'utf-8');
    }
    
    // Store metadata
    await fs.writeJson(
      path.join(implPath, 'metadata.json'),
      stored.metadata,
      { spaces: 2 }
    );
    
    // Store manifest
    await fs.writeJson(
      path.join(implPath, 'manifest.json'),
      {
        files: stored.files.map(f => ({
          path: f.path,
          type: f.type,
          size: f.size
        })),
        dependencies: stored.dependencies,
        buildConfig: stored.buildConfig,
        deploymentConfig: stored.deploymentConfig
      },
      { spaces: 2 }
    );
    
    // Update index
    this.index.set(id, {
      id,
      path: implPath,
      metadata: stored.metadata
    });
    await this.saveIndex();
    
    this.emit('implementation-stored', { id, path: implPath });
    
    return id;
  }
  
  /**
   * Retrieve implementation
   */
  async retrieve(id: string): Promise<StoredImplementation | null> {
    console.log(chalk.dim(`    📦 Retrieving implementation ${id}...`));
    
    const indexEntry = this.index.get(id);
    if (!indexEntry) {
      return null;
    }
    
    const implPath = indexEntry.path;
    
    // Load metadata
    const metadata = await fs.readJson(path.join(implPath, 'metadata.json'));
    
    // Load manifest
    const manifest = await fs.readJson(path.join(implPath, 'manifest.json'));
    
    // Load files
    const files = [];
    for (const fileInfo of manifest.files) {
      const filePath = path.join(implPath, fileInfo.path);
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        files.push({
          path: fileInfo.path,
          content,
          type: fileInfo.type,
          size: fileInfo.size
        });
      }
    }
    
    const implementation: StoredImplementation = {
      id,
      metadata,
      files,
      dependencies: manifest.dependencies,
      buildConfig: manifest.buildConfig,
      deploymentConfig: manifest.deploymentConfig
    };
    
    this.emit('implementation-retrieved', { id });
    
    return implementation;
  }
  
  /**
   * Update implementation
   */
  async update(id: string, updates: Partial<StoredImplementation>): Promise<void> {
    console.log(chalk.dim(`    🔄 Updating implementation ${id}...`));
    
    const existing = await this.retrieve(id);
    if (!existing) {
      throw new Error(`Implementation not found: ${id}`);
    }
    
    // Create new version
    const version = this.incrementVersion(existing.metadata.version);
    const versionInfo: VersionInfo = {
      version: existing.metadata.version,
      timestamp: existing.metadata.updatedAt,
      changes: this.detectChanges(existing, updates),
      checksum: existing.metadata.checksum,
      author: existing.metadata.author
    };
    
    // Store version history
    await this.storeVersion(id, versionInfo);
    
    // Merge updates
    const updated: StoredImplementation = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        version,
        updatedAt: new Date().toISOString(),
        checksum: this.calculateChecksum({ ...existing, ...updates })
      }
    };
    
    // Update storage
    await this.store(updated);
    
    this.emit('implementation-updated', { id, version });
  }
  
  /**
   * Delete implementation
   */
  async delete(id: string): Promise<void> {
    console.log(chalk.dim(`    🗑️ Deleting implementation ${id}...`));
    
    const indexEntry = this.index.get(id);
    if (!indexEntry) {
      throw new Error(`Implementation not found: ${id}`);
    }
    
    // Remove from disk
    await fs.remove(indexEntry.path);
    
    // Remove from index
    this.index.delete(id);
    await this.saveIndex();
    
    this.emit('implementation-deleted', { id });
  }
  
  /**
   * List implementations
   */
  async list(filter?: {
    language?: string;
    framework?: string;
    tags?: string[];
    author?: string;
  }): Promise<StoredImplementation[]> {
    const implementations = [];
    
    for (const entry of this.index.values()) {
      // Apply filters
      if (filter) {
        if (filter.language && entry.metadata.language !== filter.language) continue;
        if (filter.framework && entry.metadata.framework !== filter.framework) continue;
        if (filter.author && entry.metadata.author !== filter.author) continue;
        if (filter.tags && !filter.tags.some(tag => entry.metadata.tags?.includes(tag))) continue;
      }
      
      const impl = await this.retrieve(entry.id);
      if (impl) {
        implementations.push(impl);
      }
    }
    
    return implementations;
  }
  
  /**
   * Search implementations
   */
  async search(query: string): Promise<StoredImplementation[]> {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    for (const entry of this.index.values()) {
      const metadata = entry.metadata;
      
      // Search in title, description, tags
      if (
        metadata.title?.toLowerCase().includes(lowerQuery) ||
        metadata.description?.toLowerCase().includes(lowerQuery) ||
        metadata.tags?.some((tag: string) => tag.toLowerCase().includes(lowerQuery))
      ) {
        const impl = await this.retrieve(entry.id);
        if (impl) {
          results.push(impl);
        }
      }
    }
    
    return results;
  }
  
  /**
   * Export implementation
   */
  async export(id: string, outputPath: string, format: 'zip' | 'tar' = 'zip'): Promise<void> {
    console.log(chalk.dim(`    📤 Exporting implementation ${id}...`));
    
    const implementation = await this.retrieve(id);
    if (!implementation) {
      throw new Error(`Implementation not found: ${id}`);
    }
    
    // Create temporary directory
    const tempDir = path.join(os.tmpdir(), `canvas-export-${id}`);
    await fs.ensureDir(tempDir);
    
    try {
      // Copy files
      for (const file of implementation.files) {
        const filePath = path.join(tempDir, file.path);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, file.content, 'utf-8');
      }
      
      // Add metadata
      await fs.writeJson(
        path.join(tempDir, 'canvas-metadata.json'),
        implementation.metadata,
        { spaces: 2 }
      );
      
      // Add dependencies file if exists
      if (implementation.dependencies) {
        await fs.writeJson(
          path.join(tempDir, 'package.json'),
          {
            name: implementation.metadata.title.toLowerCase().replace(/\s+/g, '-'),
            version: implementation.metadata.version,
            dependencies: implementation.dependencies
          },
          { spaces: 2 }
        );
      }
      
      // Create archive
      if (format === 'zip') {
        await this.createZip(tempDir, outputPath);
      } else {
        await this.createTar(tempDir, outputPath);
      }
      
      this.emit('implementation-exported', { id, outputPath });
    } finally {
      // Clean up temp directory
      await fs.remove(tempDir);
    }
  }
  
  /**
   * Import implementation
   */
  async import(archivePath: string): Promise<string> {
    console.log(chalk.dim(`    📥 Importing implementation...`));
    
    // Extract to temporary directory
    const tempDir = path.join(os.tmpdir(), `canvas-import-${Date.now()}`);
    await fs.ensureDir(tempDir);
    
    try {
      // Extract archive
      if (archivePath.endsWith('.zip')) {
        await this.extractZip(archivePath, tempDir);
      } else {
        await this.extractTar(archivePath, tempDir);
      }
      
      // Load metadata
      const metadataPath = path.join(tempDir, 'canvas-metadata.json');
      if (!await fs.pathExists(metadataPath)) {
        throw new Error('Invalid archive: missing metadata');
      }
      
      const metadata = await fs.readJson(metadataPath);
      
      // Load files
      const files: { path: string; content: string; type: string; size: number }[] = [];
      const walkDir = async (dir: string, base: string = ''): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(base, entry.name);
          
          if (entry.isDirectory()) {
            await walkDir(fullPath, relativePath);
          } else if (entry.isFile() && entry.name !== 'canvas-metadata.json') {
            const content = await fs.readFile(fullPath, 'utf-8');
            files.push({
              path: relativePath,
              content,
              type: this.detectFileType(relativePath),
              size: content.length
            });
          }
        }
      };
      
      await walkDir(tempDir);
      
      // Create implementation
      const implementation = {
        title: metadata.title,
        description: metadata.description,
        language: metadata.language,
        framework: metadata.framework,
        files,
        metadata
      };
      
      // Store implementation
      const id = await this.store(implementation);
      
      this.emit('implementation-imported', { id });
      
      return id;
    } finally {
      // Clean up temp directory
      await fs.remove(tempDir);
    }
  }
  
  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    const stats: StorageStats = {
      totalImplementations: this.index.size,
      totalSize: 0,
      languages: {},
      frameworks: {},
      recentImplementations: []
    };
    
    // Calculate statistics
    for (const entry of this.index.values()) {
      stats.totalSize += entry.metadata.size || 0;
      
      const lang = entry.metadata.language;
      if (lang) {
        stats.languages[lang] = (stats.languages[lang] || 0) + 1;
      }
      
      const framework = entry.metadata.framework;
      if (framework) {
        stats.frameworks[framework] = (stats.frameworks[framework] || 0) + 1;
      }
    }
    
    // Get recent implementations
    const sorted = Array.from(this.index.values())
      .sort((a, b) => new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime())
      .slice(0, 5);
    
    for (const entry of sorted) {
      const impl = await this.retrieve(entry.id);
      if (impl) {
        stats.recentImplementations.push(impl);
      }
    }
    
    return stats;
  }
  
  /**
   * Clean up old implementations
   */
  async cleanup(daysToKeep: number = 30): Promise<number> {
    console.log(chalk.dim(`    🧹 Cleaning up implementations older than ${daysToKeep} days...`));
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    let deletedCount = 0;
    
    for (const entry of this.index.values()) {
      const updatedAt = new Date(entry.metadata.updatedAt);
      if (updatedAt < cutoffDate) {
        await this.delete(entry.id);
        deletedCount++;
      }
    }
    
    this.emit('cleanup-completed', { deletedCount });
    
    return deletedCount;
  }
  
  /**
   * Private helper methods
   */
  
  private async loadIndex(): Promise<void> {
    if (await fs.pathExists(this.indexPath)) {
      const indexData = await fs.readJson(this.indexPath);
      this.index = new Map(Object.entries(indexData));
    }
  }
  
  private async saveIndex(): Promise<void> {
    const indexData = Object.fromEntries(this.index);
    await fs.writeJson(this.indexPath, indexData, { spaces: 2 });
  }
  
  private generateId(): string {
    return `impl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private calculateChecksum(data: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }
  
  private calculateSize(implementation: any): number {
    let size = 0;
    
    if (implementation.files) {
      for (const file of implementation.files) {
        size += file.content?.length || 0;
      }
    }
    
    return size;
  }
  
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }
  
  private detectChanges(existing: any, updates: any): string[] {
    const changes = [];
    
    if (updates.files && existing.files.length !== updates.files.length) {
      changes.push(`File count changed: ${existing.files.length} → ${updates.files.length}`);
    }
    
    if (updates.metadata?.title && updates.metadata.title !== existing.metadata.title) {
      changes.push(`Title updated`);
    }
    
    if (updates.metadata?.description && updates.metadata.description !== existing.metadata.description) {
      changes.push(`Description updated`);
    }
    
    return changes;
  }
  
  private async storeVersion(id: string, versionInfo: VersionInfo): Promise<void> {
    const indexEntry = this.index.get(id);
    if (!indexEntry) return;
    
    const versionsPath = path.join(indexEntry.path, 'versions');
    await fs.ensureDir(versionsPath);
    
    const versionFile = path.join(versionsPath, `${versionInfo.version}.json`);
    await fs.writeJson(versionFile, versionInfo, { spaces: 2 });
  }
  
  private detectFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const typeMap: Record<string, string> = {
      '.ts': 'source',
      '.js': 'source',
      '.py': 'source',
      '.java': 'source',
      '.go': 'source',
      '.rs': 'source',
      '.cs': 'source',
      '.test.ts': 'test',
      '.test.js': 'test',
      '.spec.ts': 'test',
      '.spec.js': 'test',
      '.json': 'config',
      '.yaml': 'config',
      '.yml': 'config',
      '.md': 'documentation',
      '.txt': 'documentation'
    };
    
    for (const [pattern, type] of Object.entries(typeMap)) {
      if (filePath.includes(pattern)) {
        return type;
      }
    }
    
    return 'source';
  }
  
  private async createZip(sourceDir: string, outputPath: string): Promise<void> {
    // Simplified - would use archiver library in production
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`zip -r "${outputPath}" .`, { cwd: sourceDir });
  }
  
  private async createTar(sourceDir: string, outputPath: string): Promise<void> {
    // Simplified - would use tar library in production
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`tar -czf "${outputPath}" .`, { cwd: sourceDir });
  }
  
  private async extractZip(archivePath: string, outputDir: string): Promise<void> {
    // Simplified - would use unzipper library in production
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`unzip -q "${archivePath}" -d "${outputDir}"`);
  }
  
  private async extractTar(archivePath: string, outputDir: string): Promise<void> {
    // Simplified - would use tar library in production
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    await execAsync(`tar -xzf "${archivePath}" -C "${outputDir}"`);
  }
}

// Export singleton instance
export const implementationStorage = new ImplementationStorage();