import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface WorkspaceState {
  id: string;
  name: string;
  path: string;
  metadata: {
    created: number;
    updated: number;
    version: string;
    description?: string;
    tags: string[];
  };
  environment: {
    variables: Record<string, string>;
    aliases: Record<string, string>;
    shell: string;
    theme: string;
  };
  history: {
    commands: Array<{
      command: string;
      timestamp: number;
      exitCode?: number;
      duration?: number;
    }>;
    sessions: Array<{
      id: string;
      start: number;
      end?: number;
      commandCount: number;
    }>;
  };
  bookmarks: Array<{
    id: string;
    name: string;
    path: string;
    description?: string;
    tags: string[];
    created: number;
  }>;
  snippets: Array<{
    id: string;
    name: string;
    command: string;
    description?: string;
    category: string;
    variables: Record<string, string>;
    created: number;
    usage: number;
  }>;
  projects: Array<{
    id: string;
    name: string;
    path: string;
    type: string;
    config: Record<string, any>;
    lastAccessed: number;
  }>;
  ai: {
    context: Array<{
      type: 'command' | 'output' | 'error' | 'note';
      content: string;
      timestamp: number;
      relevance: number;
    }>;
    preferences: {
      model: string;
      temperature: number;
      maxTokens: number;
      autoSuggest: boolean;
    };
    learningData: Record<string, any>;
  };
  settings: {
    autoSave: boolean;
    syncEnabled: boolean;
    backupEnabled: boolean;
    maxHistorySize: number;
    customCommands: Record<string, string>;
  };
}

export interface WorkspaceConfig {
  storageDir: string;
  autoSave: boolean;
  saveInterval: number;
  maxBackups: number;
  compression: boolean;
  encryption: boolean;
  syncEnabled: boolean;
}

export interface StateSnapshot {
  id: string;
  workspaceId: string;
  timestamp: number;
  name?: string;
  description?: string;
  state: Partial<WorkspaceState>;
  checksum: string;
}

class PersistentWorkspaceState extends EventEmitter {
  private currentWorkspace: WorkspaceState | null = null;
  private config: WorkspaceConfig;
  private saveTimer?: NodeJS.Timeout;
  private snapshots: Map<string, StateSnapshot> = new Map();
  private isDirty: boolean = false;

  constructor() {
    super();
    this.config = {
      storageDir: path.join(process.cwd(), '.canvas-workspace'),
      autoSave: true,
      saveInterval: 30000, // 30 seconds
      maxBackups: 10,
      compression: true,
      encryption: false,
      syncEnabled: false
    };
  }

  /**
   * Initialize workspace state system
   */
  public async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.config.storageDir, { recursive: true });
      
      if (this.config.autoSave) {
        this.startAutoSave();
      }

      this.emit('initialized');
    } catch (error) {
      this.emit('error', { operation: 'initialize', error });
      throw error;
    }
  }

  /**
   * Create a new workspace
   */
  public async createWorkspace(
    name: string,
    workspacePath: string = process.cwd(),
    options: {
      description?: string;
      tags?: string[];
      copyFrom?: string;
    } = {}
  ): Promise<WorkspaceState> {
    const workspace: WorkspaceState = {
      id: crypto.randomUUID(),
      name,
      path: workspacePath,
      metadata: {
        created: Date.now(),
        updated: Date.now(),
        version: '1.0.0',
        description: options.description,
        tags: options.tags || []
      },
      environment: {
        variables: { ...process.env } as Record<string, string>,
        aliases: {},
        shell: process.env.SHELL || 'bash',
        theme: 'default'
      },
      history: {
        commands: [],
        sessions: []
      },
      bookmarks: [],
      snippets: [],
      projects: [],
      ai: {
        context: [],
        preferences: {
          model: 'claude-3-sonnet',
          temperature: 0.7,
          maxTokens: 4096,
          autoSuggest: true
        },
        learningData: {}
      },
      settings: {
        autoSave: true,
        syncEnabled: false,
        backupEnabled: true,
        maxHistorySize: 1000,
        customCommands: {}
      }
    };

    // Copy from existing workspace if specified
    if (options.copyFrom) {
      const sourceWorkspace = await this.loadWorkspace(options.copyFrom);
      if (sourceWorkspace) {
        workspace.environment = { ...sourceWorkspace.environment };
        workspace.bookmarks = [...sourceWorkspace.bookmarks];
        workspace.snippets = [...sourceWorkspace.snippets];
        workspace.ai.preferences = { ...sourceWorkspace.ai.preferences };
        workspace.settings = { ...sourceWorkspace.settings };
      }
    }

    await this.saveWorkspace(workspace);
    this.currentWorkspace = workspace;
    this.emit('workspace:created', workspace);

    return workspace;
  }

  /**
   * Load an existing workspace
   */
  public async loadWorkspace(workspaceId: string): Promise<WorkspaceState | null> {
    try {
      const filePath = path.join(this.config.storageDir, `${workspaceId}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      const workspace: WorkspaceState = JSON.parse(data);
      
      this.currentWorkspace = workspace;
      this.emit('workspace:loaded', workspace);
      
      return workspace;
    } catch (error) {
      this.emit('error', { operation: 'load', workspaceId, error });
      return null;
    }
  }

  /**
   * Save workspace to disk
   */
  public async saveWorkspace(workspace?: WorkspaceState): Promise<void> {
    const targetWorkspace = workspace || this.currentWorkspace;
    if (!targetWorkspace) {
      throw new Error('No workspace to save');
    }

    try {
      targetWorkspace.metadata.updated = Date.now();
      
      const filePath = path.join(this.config.storageDir, `${targetWorkspace.id}.json`);
      const data = JSON.stringify(targetWorkspace, null, 2);
      
      await fs.writeFile(filePath, data, 'utf-8');
      
      // Create backup if enabled
      if (targetWorkspace.settings.backupEnabled) {
        await this.createBackup(targetWorkspace);
      }

      this.isDirty = false;
      this.emit('workspace:saved', targetWorkspace);
    } catch (error) {
      this.emit('error', { operation: 'save', workspace: targetWorkspace.id, error });
      throw error;
    }
  }

  /**
   * List all available workspaces
   */
  public async listWorkspaces(): Promise<Array<Pick<WorkspaceState, 'id' | 'name' | 'path' | 'metadata'>>> {
    try {
      const files = await fs.readdir(this.config.storageDir);
      const workspaces: Array<Pick<WorkspaceState, 'id' | 'name' | 'path' | 'metadata'>> = [];

      for (const file of files) {
        if (file.endsWith('.json') && !file.includes('backup') && !file.includes('snapshot')) {
          try {
            const filePath = path.join(this.config.storageDir, file);
            const data = await fs.readFile(filePath, 'utf-8');
            const workspace: WorkspaceState = JSON.parse(data);
            
            workspaces.push({
              id: workspace.id,
              name: workspace.name,
              path: workspace.path,
              metadata: workspace.metadata
            });
          } catch (error) {
            // Skip invalid workspace files
            continue;
          }
        }
      }

      return workspaces.sort((a, b) => b.metadata.updated - a.metadata.updated);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        this.emit('error', { operation: 'list', error });
      }
      return [];
    }
  }

  /**
   * Update current workspace state
   */
  public updateState(updates: Partial<WorkspaceState>): void {
    if (!this.currentWorkspace) {
      throw new Error('No active workspace');
    }

    // Deep merge updates
    const merged = this.deepMerge(this.currentWorkspace, updates) as WorkspaceState;
    merged.metadata.updated = Date.now();
    this.currentWorkspace = merged;

    this.isDirty = true;
    this.emit('state:updated', { workspace: merged.id, updates });
  }

  /**
   * Add command to history
   */
  public addCommand(command: string, exitCode?: number, duration?: number): void {
    if (!this.currentWorkspace) return;

    const commandEntry = {
      command,
      timestamp: Date.now(),
      exitCode,
      duration
    };

    this.currentWorkspace.history.commands.push(commandEntry);

    // Trim history if too large
    const maxSize = this.currentWorkspace.settings.maxHistorySize;
    if (this.currentWorkspace.history.commands.length > maxSize) {
      this.currentWorkspace.history.commands = this.currentWorkspace.history.commands.slice(-maxSize);
    }

    this.markDirty();
    this.emit('command:added', commandEntry);
  }

  /**
   * Add bookmark
   */
  public addBookmark(name: string, bookmarkPath: string, description?: string, tags: string[] = []): string {
    if (!this.currentWorkspace) {
      throw new Error('No active workspace');
    }

    const bookmark = {
      id: crypto.randomUUID(),
      name,
      path: bookmarkPath,
      description,
      tags,
      created: Date.now()
    };

    this.currentWorkspace.bookmarks.push(bookmark);
    this.markDirty();
    this.emit('bookmark:added', bookmark);

    return bookmark.id;
  }

  /**
   * Add code snippet
   */
  public addSnippet(
    name: string,
    command: string,
    description?: string,
    category: string = 'general',
    variables: Record<string, string> = {}
  ): string {
    if (!this.currentWorkspace) {
      throw new Error('No active workspace');
    }

    const snippet = {
      id: crypto.randomUUID(),
      name,
      command,
      description,
      category,
      variables,
      created: Date.now(),
      usage: 0
    };

    this.currentWorkspace.snippets.push(snippet);
    this.markDirty();
    this.emit('snippet:added', snippet);

    return snippet.id;
  }

  /**
   * Use a snippet (increment usage counter)
   */
  public useSnippet(snippetId: string): string | null {
    if (!this.currentWorkspace) return null;

    const snippet = this.currentWorkspace.snippets.find(s => s.id === snippetId);
    if (!snippet) return null;

    snippet.usage++;
    this.markDirty();
    this.emit('snippet:used', snippet);

    // Replace variables in command
    let command = snippet.command;
    for (const [key, value] of Object.entries(snippet.variables)) {
      command = command.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }

    return command;
  }

  /**
   * Add project to workspace
   */
  public addProject(name: string, projectPath: string, type: string, config: Record<string, any> = {}): string {
    if (!this.currentWorkspace) {
      throw new Error('No active workspace');
    }

    const project = {
      id: crypto.randomUUID(),
      name,
      path: projectPath,
      type,
      config,
      lastAccessed: Date.now()
    };

    this.currentWorkspace.projects.push(project);
    this.markDirty();
    this.emit('project:added', project);

    return project.id;
  }

  /**
   * Update AI context
   */
  public addAIContext(
    type: 'command' | 'output' | 'error' | 'note',
    content: string,
    relevance: number = 1.0
  ): void {
    if (!this.currentWorkspace) return;

    const contextEntry = {
      type,
      content,
      timestamp: Date.now(),
      relevance
    };

    this.currentWorkspace.ai.context.push(contextEntry);

    // Trim context if too large (keep most relevant)
    if (this.currentWorkspace.ai.context.length > 100) {
      this.currentWorkspace.ai.context = this.currentWorkspace.ai.context
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 100);
    }

    this.markDirty();
    this.emit('ai:context:added', contextEntry);
  }

  /**
   * Create state snapshot
   */
  public createSnapshot(name?: string, description?: string): string {
    if (!this.currentWorkspace) {
      throw new Error('No active workspace');
    }

    const snapshot: StateSnapshot = {
      id: crypto.randomUUID(),
      workspaceId: this.currentWorkspace.id,
      timestamp: Date.now(),
      name,
      description,
      state: { ...this.currentWorkspace },
      checksum: this.generateChecksum(this.currentWorkspace)
    };

    this.snapshots.set(snapshot.id, snapshot);
    this.emit('snapshot:created', snapshot);

    return snapshot.id;
  }

  /**
   * Restore from snapshot
   */
  public async restoreSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    try {
      this.currentWorkspace = { ...snapshot.state } as WorkspaceState;
      this.currentWorkspace.metadata.updated = Date.now();
      
      await this.saveWorkspace();
      this.emit('snapshot:restored', snapshot);
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'restore', snapshotId, error });
      return false;
    }
  }

  /**
   * Export workspace
   */
  public async exportWorkspace(workspaceId?: string): Promise<string> {
    const workspace = workspaceId ? await this.loadWorkspace(workspaceId) : this.currentWorkspace;
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const exportData = {
      version: '1.0.0',
      timestamp: Date.now(),
      workspace,
      snapshots: Array.from(this.snapshots.values()).filter(s => s.workspaceId === workspace.id)
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import workspace
   */
  public async importWorkspace(exportData: string): Promise<WorkspaceState> {
    try {
      const data = JSON.parse(exportData);
      const workspace = data.workspace as WorkspaceState;
      
      // Generate new ID to avoid conflicts
      workspace.id = crypto.randomUUID();
      workspace.metadata.updated = Date.now();
      
      await this.saveWorkspace(workspace);
      
      // Import snapshots
      if (data.snapshots) {
        for (const snapshot of data.snapshots) {
          snapshot.id = crypto.randomUUID();
          snapshot.workspaceId = workspace.id;
          this.snapshots.set(snapshot.id, snapshot);
        }
      }
      
      this.emit('workspace:imported', workspace);
      return workspace;
    } catch (error) {
      this.emit('error', { operation: 'import', error });
      throw error;
    }
  }

  /**
   * Delete workspace
   */
  public async deleteWorkspace(workspaceId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.config.storageDir, `${workspaceId}.json`);
      await fs.unlink(filePath);
      
      // Delete backups
      const backupPattern = `${workspaceId}-backup-`;
      const files = await fs.readdir(this.config.storageDir);
      for (const file of files) {
        if (file.includes(backupPattern)) {
          await fs.unlink(path.join(this.config.storageDir, file));
        }
      }
      
      // Remove snapshots
      for (const [id, snapshot] of this.snapshots) {
        if (snapshot.workspaceId === workspaceId) {
          this.snapshots.delete(id);
        }
      }
      
      if (this.currentWorkspace?.id === workspaceId) {
        this.currentWorkspace = null;
      }
      
      this.emit('workspace:deleted', { id: workspaceId });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'delete', workspaceId, error });
      return false;
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }

    this.saveTimer = setInterval(() => {
      if (this.isDirty && this.currentWorkspace) {
        this.saveWorkspace().catch(error => {
          this.emit('error', { operation: 'autosave', error });
        });
      }
    }, this.config.saveInterval);
  }

  /**
   * Create backup of workspace
   */
  private async createBackup(workspace: WorkspaceState): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      this.config.storageDir,
      `${workspace.id}-backup-${timestamp}.json`
    );
    
    const data = JSON.stringify(workspace, null, 2);
    await fs.writeFile(backupPath, data, 'utf-8');
    
    // Clean old backups
    await this.cleanOldBackups(workspace.id);
  }

  /**
   * Clean old backup files
   */
  private async cleanOldBackups(workspaceId: string): Promise<void> {
    try {
      const files = await fs.readdir(this.config.storageDir);
      const backupFiles = files
        .filter(file => file.startsWith(`${workspaceId}-backup-`))
        .map(file => ({
          name: file,
          path: path.join(this.config.storageDir, file),
          stat: null as any
        }));

      // Get file stats
      for (const file of backupFiles) {
        file.stat = await fs.stat(file.path);
      }

      // Sort by creation time and keep only recent backups
      backupFiles.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
      
      if (backupFiles.length > this.config.maxBackups) {
        const toDelete = backupFiles.slice(this.config.maxBackups);
        for (const file of toDelete) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Mark workspace as dirty
   */
  private markDirty(): void {
    this.isDirty = true;
    this.emit('state:dirty');
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Generate checksum for state
   */
  private generateChecksum(state: WorkspaceState): string {
    const stateString = JSON.stringify(state);
    return crypto.createHash('sha256').update(stateString).digest('hex');
  }

  /**
   * Get current workspace
   */
  public getCurrentWorkspace(): WorkspaceState | null {
    return this.currentWorkspace;
  }

  /**
   * Search across workspace data
   */
  public search(query: string, types: string[] = ['commands', 'bookmarks', 'snippets']): any[] {
    if (!this.currentWorkspace) return [];

    const results: any[] = [];
    const lowerQuery = query.toLowerCase();

    if (types.includes('commands')) {
      const commands = this.currentWorkspace.history.commands.filter(cmd =>
        cmd.command.toLowerCase().includes(lowerQuery)
      );
      results.push(...commands.map(cmd => ({ type: 'command', ...cmd })));
    }

    if (types.includes('bookmarks')) {
      const bookmarks = this.currentWorkspace.bookmarks.filter(bookmark =>
        bookmark.name.toLowerCase().includes(lowerQuery) ||
        bookmark.path.toLowerCase().includes(lowerQuery) ||
        bookmark.description?.toLowerCase().includes(lowerQuery)
      );
      results.push(...bookmarks.map(bookmark => ({ type: 'bookmark', ...bookmark })));
    }

    if (types.includes('snippets')) {
      const snippets = this.currentWorkspace.snippets.filter(snippet =>
        snippet.name.toLowerCase().includes(lowerQuery) ||
        snippet.command.toLowerCase().includes(lowerQuery) ||
        snippet.description?.toLowerCase().includes(lowerQuery)
      );
      results.push(...snippets.map(snippet => ({ type: 'snippet', ...snippet })));
    }

    return results;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<WorkspaceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.autoSave !== undefined) {
      if (newConfig.autoSave && !this.saveTimer) {
        this.startAutoSave();
      } else if (!newConfig.autoSave && this.saveTimer) {
        clearInterval(this.saveTimer);
        this.saveTimer = undefined;
      }
    }
    
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): WorkspaceConfig {
    return { ...this.config };
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
    }
    
    if (this.isDirty && this.currentWorkspace) {
      // Synchronous save on destroy
      this.saveWorkspace().catch(() => {
        // Ignore errors on destroy
      });
    }
    
    this.removeAllListeners();
    this.emit('destroyed');
  }
}

let workspaceStateInstance: PersistentWorkspaceState | null = null;

export function getPersistentWorkspaceState(): PersistentWorkspaceState {
  if (!workspaceStateInstance) {
    workspaceStateInstance = new PersistentWorkspaceState();
  }
  return workspaceStateInstance;
}

export default PersistentWorkspaceState;