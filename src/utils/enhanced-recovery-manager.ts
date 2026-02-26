/**
 * Enhanced Recovery Manager with Auto-Rollback
 * Provides comprehensive recovery, rollback, and state restoration capabilities
 */

import { EventEmitter } from 'events';
import fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { errorHandler } from './error-handler.js';
import { getPerformanceMonitor } from './performance-monitor.js';

export interface Checkpoint {
  id: string;
  timestamp: Date;
  label: string;
  state: RecoveryState;
  metadata: {
    size: number;
    hash: string;
    dependencies: string[];
    rollbackable: boolean;
  };
  parent?: string; // Previous checkpoint ID for chain
}

export interface RecoveryState {
  timestamp: Date;
  messages: any[];
  context: any;
  toolState: any;
  sessionFlags: any;
  metrics: any;
  files?: FileSnapshot[];
  environment?: EnvironmentSnapshot;
  memory?: MemorySnapshot;
}

export interface FileSnapshot {
  path: string;
  content: string;
  hash: string;
  permissions: string;
  modified: Date;
}

export interface EnvironmentSnapshot {
  variables: Record<string, string>;
  workingDirectory: string;
  nodeVersion: string;
  platform: string;
}

export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

export interface RollbackOptions {
  preserveUserData?: boolean;
  dryRun?: boolean;
  selective?: string[]; // Selective rollback of specific components
  force?: boolean;
}

export interface RecoveryOptions {
  autoRecover: boolean;
  autoRollback: boolean;
  maxRecoveryAttempts: number;
  maxCheckpoints: number;
  checkpointInterval: number; // Auto checkpoint interval in ms
  recoveryDelay: number;
  preserveSession: boolean;
  clearCache: boolean;
  compressionEnabled: boolean;
}

export class EnhancedRecoveryManager extends EventEmitter {
  private static instance: EnhancedRecoveryManager;
  private recoveryPath: string;
  private checkpointsPath: string;
  private currentState: RecoveryState | null = null;
  private checkpoints: Map<string, Checkpoint> = new Map();
  private checkpointChain: string[] = []; // Ordered list of checkpoint IDs
  private recoveryAttempts: number = 0;
  private isRecovering: boolean = false;
  private autoCheckpointTimer?: NodeJS.Timeout;
  private transactionStack: Transaction[] = [];
  
  private options: RecoveryOptions = {
    autoRecover: true,
    autoRollback: true,
    maxRecoveryAttempts: 3,
    maxCheckpoints: 10,
    checkpointInterval: 300000, // 5 minutes
    recoveryDelay: 1000,
    preserveSession: true,
    clearCache: false,
    compressionEnabled: true
  };

  static getInstance(): EnhancedRecoveryManager {
    if (!EnhancedRecoveryManager.instance) {
      EnhancedRecoveryManager.instance = new EnhancedRecoveryManager();
    }
    return EnhancedRecoveryManager.instance;
  }

  constructor() {
    super();
    this.recoveryPath = path.join(process.cwd(), '.canvas-cli', 'recovery');
    this.checkpointsPath = path.join(this.recoveryPath, 'checkpoints');
    this.ensureRecoveryDirectories();
    void this.loadCheckpoints();
    this.setupRecoveryHandlers();
    this.startAutoCheckpointing();
  }

  /**
   * Ensure recovery directories exist
   */
  private ensureRecoveryDirectories(): void {
    try {
      fs.ensureDirSync(this.recoveryPath);
      fs.ensureDirSync(this.checkpointsPath);
    } catch (error) {
      console.error('Failed to create recovery directories:', error);
    }
  }

  /**
   * Load existing checkpoints from disk
   */
  private async loadCheckpoints(): Promise<void> {
    try {
      const files = await fs.readdir(this.checkpointsPath);
      
      for (const file of files) {
        if (file.endsWith('.checkpoint')) {
          const checkpointPath = path.join(this.checkpointsPath, file);
          const checkpoint = await fs.readJson(checkpointPath);
          this.checkpoints.set(checkpoint.id, checkpoint);
          
          // Rebuild checkpoint chain
          if (!checkpoint.parent) {
            this.checkpointChain.unshift(checkpoint.id);
          } else {
            const parentIndex = this.checkpointChain.indexOf(checkpoint.parent);
            if (parentIndex !== -1) {
              this.checkpointChain.splice(parentIndex + 1, 0, checkpoint.id);
            }
          }
        }
      }
      
      this.emit('checkpoints:loaded', { count: this.checkpoints.size });
    } catch (error) {
      console.error('Failed to load checkpoints:', error);
    }
  }

  /**
   * Setup recovery handlers
   */
  private setupRecoveryHandlers(): void {
    // Handle critical errors
    errorHandler.on('error-storm', async () => {
      if (this.options.autoRecover && !this.isRecovering) {
        await this.initiateRecovery('error-storm');
      }
    });

    // Handle repeated errors
    errorHandler.on('repeated-error', async ({ operation, count }) => {
      if (count > 10 && this.options.autoRecover && !this.isRecovering) {
        await this.initiateRecovery('repeated-error', { operation });
      }
    });

    // Handle performance degradation
    getPerformanceMonitor().on('performance-degradation', async ({ metric }) => {
      if (this.options.autoRollback) {
        await this.rollbackToLastStable();
      }
    });

    // Handle process signals
    process.on('SIGINT', async () => {
      await this.createCheckpoint('shutdown');
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      console.error('Uncaught exception:', error);
      if (this.options.autoRollback) {
        await this.emergencyRollback();
      }
    });
  }

  /**
   * Start automatic checkpointing
   */
  private startAutoCheckpointing(): void {
    if (this.options.checkpointInterval > 0) {
      this.autoCheckpointTimer = setInterval(async () => {
        await this.createCheckpoint('auto');
      }, this.options.checkpointInterval);
    }
  }

  /**
   * Stop automatic checkpointing
   */
  private stopAutoCheckpointing(): void {
    if (this.autoCheckpointTimer) {
      clearInterval(this.autoCheckpointTimer);
      this.autoCheckpointTimer = undefined;
    }
  }

  /**
   * Create a checkpoint
   */
  async createCheckpoint(label: string = 'manual'): Promise<Checkpoint> {
    const checkpointId = this.generateCheckpointId();
    const state = await this.captureCurrentState();
    
    const checkpoint: Checkpoint = {
      id: checkpointId,
      timestamp: new Date(),
      label,
      state,
      metadata: {
        size: JSON.stringify(state).length,
        hash: this.hashState(state),
        dependencies: await this.detectDependencies(),
        rollbackable: true
      },
      parent: this.checkpointChain[this.checkpointChain.length - 1]
    };

    // Save checkpoint to disk
    const checkpointPath = path.join(this.checkpointsPath, `${checkpointId}.checkpoint`);
    
    if (this.options.compressionEnabled) {
      // Compress checkpoint data
      const compressed = await this.compressData(checkpoint);
      await fs.writeFile(checkpointPath, compressed);
    } else {
      await fs.writeJson(checkpointPath, checkpoint);
    }

    // Add to checkpoint management
    this.checkpoints.set(checkpointId, checkpoint);
    this.checkpointChain.push(checkpointId);

    // Enforce checkpoint limit
    await this.pruneOldCheckpoints();

    this.emit('checkpoint:created', { checkpoint });
    
    return checkpoint;
  }

  /**
   * Rollback to a specific checkpoint
   */
  async rollbackToCheckpoint(checkpointId: string, options: RollbackOptions = {}): Promise<boolean> {
    const checkpoint = this.checkpoints.get(checkpointId);
    
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    if (!checkpoint.metadata.rollbackable && !options.force) {
      throw new Error(`Checkpoint ${checkpointId} is not rollbackable`);
    }

    this.emit('rollback:starting', { checkpointId, options });

    try {
      // Dry run mode
      if (options.dryRun) {
        const analysis = await this.analyzeRollbackImpact(checkpoint);
        this.emit('rollback:dry-run', { analysis });
        return true;
      }

      // Create a safety checkpoint before rollback
      const safetyCheckpoint = await this.createCheckpoint('pre-rollback-safety');

      // Perform rollback
      const success = await this.performRollback(checkpoint, options);

      if (success) {
        // Update checkpoint chain
        const index = this.checkpointChain.indexOf(checkpointId);
        if (index !== -1) {
          this.checkpointChain = this.checkpointChain.slice(0, index + 1);
        }

        this.emit('rollback:completed', { checkpointId });
      } else {
        // Rollback failed, restore safety checkpoint
        await this.performRollback(safetyCheckpoint, { force: true });
        this.emit('rollback:failed', { checkpointId });
      }

      return success;

    } catch (error) {
      this.emit('rollback:error', { checkpointId, error });
      throw error;
    }
  }

  /**
   * Perform the actual rollback
   */
  private async performRollback(checkpoint: Checkpoint, options: RollbackOptions): Promise<boolean> {
    try {
      const state = checkpoint.state;

      // Selective rollback
      if (options.selective && options.selective.length > 0) {
        return await this.performSelectiveRollback(state, options.selective);
      }

      // Full rollback
      // Restore files
      if (state.files) {
        for (const file of state.files) {
          await this.restoreFile(file);
        }
      }

      // Restore environment
      if (state.environment) {
        await this.restoreEnvironment(state.environment);
      }

      // Restore tool state
      if (state.toolState) {
        await this.restoreToolState(state.toolState);
      }

      // Restore session
      if (state.sessionFlags && this.options.preserveSession) {
        await this.restoreSession(state.sessionFlags);
      }

      // Clear caches if requested
      if (this.options.clearCache) {
        await this.clearCaches();
      }

      // Update current state
      this.currentState = state;

      return true;

    } catch (error) {
      console.error('Rollback failed:', error);
      return false;
    }
  }

  /**
   * Perform selective rollback of specific components
   */
  private async performSelectiveRollback(state: RecoveryState, components: string[]): Promise<boolean> {
    try {
      for (const component of components) {
        switch (component) {
          case 'files':
            if (state.files) {
              for (const file of state.files) {
                await this.restoreFile(file);
              }
            }
            break;
          
          case 'environment':
            if (state.environment) {
              await this.restoreEnvironment(state.environment);
            }
            break;
          
          case 'toolState':
            if (state.toolState) {
              await this.restoreToolState(state.toolState);
            }
            break;
          
          case 'session':
            if (state.sessionFlags) {
              await this.restoreSession(state.sessionFlags);
            }
            break;
          
          default:
            console.warn(`Unknown component for selective rollback: ${component}`);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Selective rollback failed:', error);
      return false;
    }
  }

  /**
   * Rollback to the last stable checkpoint
   */
  async rollbackToLastStable(): Promise<boolean> {
    // Find the last stable checkpoint
    for (let i = this.checkpointChain.length - 1; i >= 0; i--) {
      const checkpointId = this.checkpointChain[i];
      const checkpoint = this.checkpoints.get(checkpointId);
      
      if (checkpoint && await this.isCheckpointStable(checkpoint)) {
        return await this.rollbackToCheckpoint(checkpointId);
      }
    }
    
    console.error('No stable checkpoint found');
    return false;
  }

  /**
   * Emergency rollback to the most recent valid checkpoint
   */
  async emergencyRollback(): Promise<boolean> {
    this.emit('rollback:emergency');
    
    // Try to rollback to the most recent checkpoint
    if (this.checkpointChain.length > 0) {
      const lastCheckpointId = this.checkpointChain[this.checkpointChain.length - 1];
      return await this.rollbackToCheckpoint(lastCheckpointId, { force: true });
    }
    
    // No checkpoints available, try to create a minimal recovery state
    return await this.createMinimalRecoveryState();
  }

  /**
   * Begin a transaction for atomic operations
   */
  beginTransaction(name: string): Transaction {
    const transaction = new Transaction(name, this);
    this.transactionStack.push(transaction);
    return transaction;
  }

  /**
   * Capture current state
   */
  private async captureCurrentState(): Promise<RecoveryState> {
    const state: RecoveryState = {
      timestamp: new Date(),
      messages: [], // Capture from message history
      context: await this.captureContext(),
      toolState: await this.captureToolState(),
      sessionFlags: await this.captureSessionFlags(),
      metrics: getPerformanceMonitor().getCurrentMetrics(),
      files: await this.captureFileSnapshots(),
      environment: await this.captureEnvironment(),
      memory: this.captureMemorySnapshot()
    };
    
    return state;
  }

  /**
   * Capture file snapshots for critical files
   */
  private async captureFileSnapshots(): Promise<FileSnapshot[]> {
    const snapshots: FileSnapshot[] = [];
    const criticalFiles = [
      '.env',
      'package.json',
      'tsconfig.json',
      '.canvas-cli/config.json'
    ];
    
    for (const file of criticalFiles) {
      const filePath = path.join(process.cwd(), file);
      
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        const stats = await fs.stat(filePath);
        
        snapshots.push({
          path: file,
          content,
          hash: this.hashContent(content),
          permissions: stats.mode.toString(8),
          modified: stats.mtime
        });
      }
    }
    
    return snapshots;
  }

  /**
   * Capture environment snapshot
   */
  private async captureEnvironment(): Promise<EnvironmentSnapshot> {
    return {
      variables: { ...process.env } as Record<string, string>,
      workingDirectory: process.cwd(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Capture memory snapshot
   */
  private captureMemorySnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };
  }

  /**
   * Restore a file from snapshot
   */
  private async restoreFile(snapshot: FileSnapshot): Promise<void> {
    const filePath = path.join(process.cwd(), snapshot.path);
    
    // Backup current file if it exists
    if (await fs.pathExists(filePath)) {
      const backupPath = `${filePath}.backup.${Date.now()}`;
      await fs.copy(filePath, backupPath);
    }
    
    // Restore file content
    await fs.writeFile(filePath, snapshot.content, 'utf-8');
    
    // Restore permissions
    await fs.chmod(filePath, parseInt(snapshot.permissions, 8));
  }

  /**
   * Restore environment
   */
  private async restoreEnvironment(snapshot: EnvironmentSnapshot): Promise<void> {
    // Restore environment variables (carefully)
    const safeVars = ['NODE_ENV', 'DEBUG', 'LOG_LEVEL'];
    
    for (const [key, value] of Object.entries(snapshot.variables)) {
      if (safeVars.includes(key)) {
        process.env[key] = value;
      }
    }
    
    // Change working directory if different
    if (snapshot.workingDirectory !== process.cwd()) {
      try {
        process.chdir(snapshot.workingDirectory);
      } catch (error) {
        console.warn('Could not restore working directory:', error);
      }
    }
  }

  /**
   * Analyze rollback impact
   */
  private async analyzeRollbackImpact(checkpoint: Checkpoint): Promise<any> {
    const currentState = await this.captureCurrentState();
    
    const impact = {
      filesChanged: 0,
      environmentChanges: 0,
      dataLoss: false,
      estimatedTime: 0
    };
    
    // Compare files
    if (currentState.files && checkpoint.state.files) {
      for (const currentFile of currentState.files) {
        const checkpointFile = checkpoint.state.files.find(f => f.path === currentFile.path);
        if (checkpointFile && checkpointFile.hash !== currentFile.hash) {
          impact.filesChanged++;
        }
      }
    }
    
    // Estimate time
    impact.estimatedTime = impact.filesChanged * 100; // 100ms per file
    
    return impact;
  }

  /**
   * Check if a checkpoint is stable
   */
  private async isCheckpointStable(checkpoint: Checkpoint): Promise<boolean> {
    // Check if checkpoint is complete
    if (!checkpoint.state || !checkpoint.metadata.hash) {
      return false;
    }
    
    // Verify integrity
    const currentHash = this.hashState(checkpoint.state);
    if (currentHash !== checkpoint.metadata.hash) {
      return false;
    }
    
    // Check age (not too old)
    const age = Date.now() - checkpoint.timestamp.getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    return age < maxAge;
  }

  /**
   * Prune old checkpoints to maintain limit
   */
  private async pruneOldCheckpoints(): Promise<void> {
    while (this.checkpointChain.length > this.options.maxCheckpoints) {
      const oldestId = this.checkpointChain.shift();
      
      if (oldestId) {
        this.checkpoints.delete(oldestId);
        
        const checkpointPath = path.join(this.checkpointsPath, `${oldestId}.checkpoint`);
        await fs.remove(checkpointPath);
        
        this.emit('checkpoint:pruned', { checkpointId: oldestId });
      }
    }
  }

  /**
   * Helper methods
   */
  
  private generateCheckpointId(): string {
    return `cp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
  
  private hashState(state: RecoveryState): string {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(state));
    return hash.digest('hex');
  }
  
  private hashContent(content: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  }
  
  private async compressData(data: any): Promise<Buffer> {
    const { promisify } = await import('util');
    const { gzip } = await import('zlib');
    const gzipAsync = promisify(gzip);
    
    const jsonStr = JSON.stringify(data);
    return await gzipAsync(jsonStr);
  }
  
  private async decompressData(buffer: Buffer): Promise<any> {
    const { promisify } = await import('util');
    const { gunzip } = await import('zlib');
    const gunzipAsync = promisify(gunzip);
    
    const jsonStr = await gunzipAsync(buffer);
    return JSON.parse(jsonStr.toString());
  }
  
  private async detectDependencies(): Promise<string[]> {
    const deps: string[] = [];
    
    // Check package.json dependencies
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      deps.push(...Object.keys(packageJson.dependencies || {}));
    }
    
    return deps;
  }
  
  private async captureContext(): Promise<any> {
    // Capture application context state
    const context: any = {
      timestamp: new Date().toISOString(),
      processId: process.pid,
      uptime: process.uptime(),
      argv: process.argv.slice(2),
      cwd: process.cwd()
    };

    // Capture canvas-cli specific context if available
    try {
      const configPath = path.join(process.cwd(), '.canvas-cli', 'context.json');
      if (await fs.pathExists(configPath)) {
        context.savedContext = await fs.readJson(configPath);
      }
    } catch (error) {
      // Context file may not exist
    }

    // Emit event to allow components to add their context
    this.emit('capture:context', context);

    return context;
  }

  private async captureToolState(): Promise<any> {
    // Capture tool registry and executor state
    const toolState: any = {
      timestamp: new Date().toISOString(),
      registeredTools: [],
      executionHistory: [],
      pendingOperations: []
    };

    // Capture from tool state file if it exists
    try {
      const toolStatePath = path.join(process.cwd(), '.canvas-cli', 'tool-state.json');
      if (await fs.pathExists(toolStatePath)) {
        const savedState = await fs.readJson(toolStatePath);
        Object.assign(toolState, savedState);
      }
    } catch (error) {
      // Tool state file may not exist
    }

    // Emit event to allow tool registry to add its state
    this.emit('capture:toolState', toolState);

    return toolState;
  }

  private async captureSessionFlags(): Promise<any> {
    // Capture session-related flags and settings
    const sessionFlags: any = {
      timestamp: new Date().toISOString(),
      autoConfirm: false,
      verboseMode: false,
      dryRunMode: false,
      debugMode: process.env.DEBUG === 'true',
      colorEnabled: true,
      interactiveMode: process.stdout.isTTY || false,
      confirmedOperations: [],
      deniedOperations: []
    };

    // Capture from session file if it exists
    try {
      const sessionPath = path.join(process.cwd(), '.canvas-cli', 'session.json');
      if (await fs.pathExists(sessionPath)) {
        const savedSession = await fs.readJson(sessionPath);
        Object.assign(sessionFlags, savedSession);
      }
    } catch (error) {
      // Session file may not exist
    }

    // Emit event to allow session manager to add its state
    this.emit('capture:sessionFlags', sessionFlags);

    return sessionFlags;
  }

  private async restoreToolState(state: any): Promise<void> {
    // Restore tool state
    try {
      if (state) {
        const toolStatePath = path.join(process.cwd(), '.canvas-cli', 'tool-state.json');
        await fs.ensureDir(path.dirname(toolStatePath));
        await fs.writeJson(toolStatePath, state, { spaces: 2 });

        // Emit event to notify tool registry to reload
        this.emit('restore:toolState', state);
      }
    } catch (error) {
      console.error('Failed to restore tool state:', error);
      throw error;
    }
  }

  private async restoreSession(flags: any): Promise<void> {
    // Restore session flags
    try {
      if (flags) {
        const sessionPath = path.join(process.cwd(), '.canvas-cli', 'session.json');
        await fs.ensureDir(path.dirname(sessionPath));
        await fs.writeJson(sessionPath, flags, { spaces: 2 });

        // Apply certain flags directly
        if (flags.debugMode !== undefined) {
          process.env.DEBUG = flags.debugMode ? 'true' : '';
        }

        // Emit event to notify session manager to reload
        this.emit('restore:sessionFlags', flags);
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
      throw error;
    }
  }

  private async clearCaches(): Promise<void> {
    // Clear various caches
    try {
      const cachePaths = [
        path.join(process.cwd(), '.canvas-cli', 'cache'),
        path.join(process.cwd(), 'node_modules', '.cache'),
        path.join(process.cwd(), '.cache')
      ];

      for (const cachePath of cachePaths) {
        if (await fs.pathExists(cachePath)) {
          await fs.emptyDir(cachePath);
          console.log(`Cleared cache: ${cachePath}`);
        }
      }

      // Clear module cache for canvas-cli modules
      for (const key of Object.keys(require.cache)) {
        if (key.includes('canvas-cli') && !key.includes('node_modules')) {
          delete require.cache[key];
        }
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Emit event for custom cache clearing
      this.emit('cache:cleared');

    } catch (error) {
      console.error('Failed to clear caches:', error);
      throw error;
    }
  }

  /**
   * Register a state capture handler for a component
   */
  registerStateCaptureHandler(component: string, handler: () => Promise<any>): void {
    this.on(`capture:${component}`, async (state) => {
      try {
        const componentState = await handler();
        Object.assign(state, { [component]: componentState });
      } catch (error) {
        console.error(`Failed to capture state for ${component}:`, error);
      }
    });
  }

  /**
   * Register a state restore handler for a component
   */
  registerStateRestoreHandler(component: string, handler: (state: any) => Promise<void>): void {
    this.on(`restore:${component}`, async (state) => {
      try {
        await handler(state);
      } catch (error) {
        console.error(`Failed to restore state for ${component}:`, error);
      }
    });
  }
  
  private async createMinimalRecoveryState(): Promise<boolean> {
    // Create a minimal working state
    try {
      this.currentState = {
        timestamp: new Date(),
        messages: [],
        context: {},
        toolState: {},
        sessionFlags: {},
        metrics: {}
      };
      
      return true;
    } catch (error) {
      console.error('Failed to create minimal recovery state:', error);
      return false;
    }
  }
  
  private async initiateRecovery(reason: string, details?: any): Promise<void> {
    if (this.isRecovering) {
      return;
    }
    
    this.isRecovering = true;
    this.recoveryAttempts++;
    
    this.emit('recovery:starting', { reason, details, attempt: this.recoveryAttempts });
    
    try {
      // Attempt recovery strategies
      if (this.options.autoRollback) {
        const success = await this.rollbackToLastStable();
        if (success) {
          this.emit('recovery:completed', { reason, method: 'rollback' });
          this.recoveryAttempts = 0;
        }
      }
    } catch (error) {
      this.emit('recovery:failed', { reason, error });
    } finally {
      this.isRecovering = false;
    }
  }
  
  /**
   * Public API
   */
  
  getCheckpoints(): Checkpoint[] {
    return this.checkpointChain.map(id => this.checkpoints.get(id)!).filter(Boolean);
  }
  
  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }
  
  async exportCheckpoint(id: string, outputPath: string): Promise<void> {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${id} not found`);
    }
    
    await fs.writeJson(outputPath, checkpoint, { spaces: 2 });
  }
  
  async importCheckpoint(inputPath: string): Promise<Checkpoint> {
    const checkpoint = await fs.readJson(inputPath);
    
    // Validate and add checkpoint
    this.checkpoints.set(checkpoint.id, checkpoint);
    this.checkpointChain.push(checkpoint.id);
    
    // Save to checkpoints directory
    const checkpointPath = path.join(this.checkpointsPath, `${checkpoint.id}.checkpoint`);
    await fs.writeJson(checkpointPath, checkpoint);
    
    return checkpoint;
  }
  
  setOptions(options: Partial<RecoveryOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Restart auto-checkpointing if interval changed
    if (options.checkpointInterval !== undefined) {
      this.stopAutoCheckpointing();
      this.startAutoCheckpointing();
    }
  }
  
  getMetrics() {
    return {
      checkpointCount: this.checkpoints.size,
      recoveryAttempts: this.recoveryAttempts,
      isRecovering: this.isRecovering,
      lastCheckpoint: this.checkpointChain[this.checkpointChain.length - 1],
      options: this.options
    };
  }
}

/**
 * Transaction class for atomic operations
 */
class Transaction {
  private name: string;
  private manager: EnhancedRecoveryManager;
  private checkpointId?: string;
  private committed: boolean = false;
  private rolledBack: boolean = false;
  
  constructor(name: string, manager: EnhancedRecoveryManager) {
    this.name = name;
    this.manager = manager;
  }
  
  async begin(): Promise<void> {
    if (this.checkpointId) {
      throw new Error('Transaction already started');
    }
    
    const checkpoint = await this.manager.createCheckpoint(`transaction-${this.name}`);
    this.checkpointId = checkpoint.id;
  }
  
  async commit(): Promise<void> {
    if (!this.checkpointId) {
      throw new Error('Transaction not started');
    }
    
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction already finalized');
    }
    
    this.committed = true;
    // Transaction committed successfully, checkpoint remains
  }
  
  async rollback(): Promise<void> {
    if (!this.checkpointId) {
      throw new Error('Transaction not started');
    }
    
    if (this.committed || this.rolledBack) {
      throw new Error('Transaction already finalized');
    }
    
    await this.manager.rollbackToCheckpoint(this.checkpointId);
    this.rolledBack = true;
  }
}

// Export singleton instance
export const enhancedRecoveryManager = EnhancedRecoveryManager.getInstance();