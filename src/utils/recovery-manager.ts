import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
import * as path from 'path';
import { errorHandler } from './error-handler.js';
import { performanceMonitor } from './performance-monitor.js';

export interface RecoveryState {
  timestamp: Date;
  messages: any[];
  context: any;
  toolState: any;
  sessionFlags: any;
  metrics: any;
}

export interface RecoveryOptions {
  autoRecover: boolean;
  maxRecoveryAttempts: number;
  recoveryDelay: number;
  preserveSession: boolean;
  clearCache: boolean;
}

export class RecoveryManager extends EventEmitter {
  private static instance: RecoveryManager;
  private recoveryPath: string;
  private currentState: RecoveryState | null = null;
  private recoveryAttempts: number = 0;
  private isRecovering: boolean = false;
  
  private options: RecoveryOptions = {
    autoRecover: true,
    maxRecoveryAttempts: 3,
    recoveryDelay: 1000,
    preserveSession: true,
    clearCache: false
  };

  static getInstance(): RecoveryManager {
    if (!RecoveryManager.instance) {
      RecoveryManager.instance = new RecoveryManager();
    }
    return RecoveryManager.instance;
  }

  constructor() {
    super();
    this.recoveryPath = path.join(process.cwd(), '.canvas-cli', 'recovery');
    this.ensureRecoveryDirectory();
    this.setupRecoveryHandlers();
  }

  /**
   * Ensure recovery directory exists
   */
  private ensureRecoveryDirectory(): void {
    try {
      fs.ensureDirSync(this.recoveryPath);
    } catch (error) {
      console.error('Failed to create recovery directory:', error);
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

    // Handle shutdown events
    errorHandler.on('shutdown', async (signal) => {
      await this.saveState('shutdown', { signal });
    });
  }

  /**
   * Save current state for recovery
   */
  async saveState(reason: string = 'manual', metadata: any = {}): Promise<void> {
    try {
      const state: RecoveryState = {
        timestamp: new Date(),
        messages: [], // Will be populated by command handler
        context: {}, // Will be populated by context loader
        toolState: {}, // Will be populated by tool executor
        sessionFlags: {}, // Will be populated by confirmation service
        metrics: performanceMonitor.getSummary()
      };

      // Emit event to gather state from components
      this.emit('gather-state', state);

      // Save to file
      const filename = `recovery-${Date.now()}.json`;
      const filepath = path.join(this.recoveryPath, filename);
      
      await fs.writeJson(filepath, {
        reason,
        metadata,
        state
      }, { spaces: 2 });

      // Keep only last 10 recovery files
      await this.cleanupOldRecoveryFiles();

      this.currentState = state;
      this.emit('state-saved', { reason, filepath });
      
      console.log(`💾 Recovery state saved: ${reason}`);
    } catch (error) {
      console.error('Failed to save recovery state:', error);
    }
  }

  /**
   * Load recovery state
   */
  async loadState(filename?: string): Promise<RecoveryState | null> {
    try {
      let filepath: string;
      
      if (filename) {
        filepath = path.join(this.recoveryPath, filename);
      } else {
        // Get most recent recovery file
        const files = await fs.readdir(this.recoveryPath);
        const recoveryFiles = files
          .filter(f => f.startsWith('recovery-'))
          .sort((a, b) => b.localeCompare(a));
        
        if (recoveryFiles.length === 0) {
          return null;
        }
        
        filepath = path.join(this.recoveryPath, recoveryFiles[0]);
      }

      const data = await fs.readJson(filepath);
      this.currentState = data.state;
      
      this.emit('state-loaded', { filepath, reason: data.reason });
      
      return data.state;
    } catch (error) {
      console.error('Failed to load recovery state:', error);
      return null;
    }
  }

  /**
   * Initiate recovery process
   */
  async initiateRecovery(reason: string, metadata: any = {}): Promise<boolean> {
    if (this.isRecovering) {
      console.warn('Recovery already in progress');
      return false;
    }

    if (this.recoveryAttempts >= this.options.maxRecoveryAttempts) {
      console.error('Maximum recovery attempts exceeded');
      this.emit('recovery-failed', { reason, attempts: this.recoveryAttempts });
      return false;
    }

    this.isRecovering = true;
    this.recoveryAttempts++;
    
    console.log(`🔄 Initiating recovery (attempt ${this.recoveryAttempts}): ${reason}`);
    this.emit('recovery-started', { reason, attempt: this.recoveryAttempts });

    try {
      // Step 1: Save current state
      await this.saveState(reason, metadata);
      
      // Step 2: Wait before recovery
      await this.delay(this.options.recoveryDelay);
      
      // Step 3: Perform recovery actions
      const recovered = await this.performRecovery(reason);
      
      if (recovered) {
        console.log('✅ Recovery successful');
        this.emit('recovery-success', { reason, attempt: this.recoveryAttempts });
        this.recoveryAttempts = 0;
        return true;
      } else {
        throw new Error('Recovery failed');
      }
      
    } catch (error: any) {
      console.error('Recovery failed:', error.message);
      this.emit('recovery-error', { reason, error, attempt: this.recoveryAttempts });
      
      // Retry recovery after delay
      await this.delay(this.options.recoveryDelay * this.recoveryAttempts);
      return this.initiateRecovery(reason, metadata);
      
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Perform recovery actions
   */
  private async performRecovery(reason: string): Promise<boolean> {
    const actions: RecoveryAction[] = this.getRecoveryActions(reason);
    
    for (const action of actions) {
      try {
        console.log(`  Executing: ${action.name}`);
        await action.execute();
      } catch (error) {
        console.error(`  Failed: ${action.name}`, error);
        if (!action.optional) {
          return false;
        }
      }
    }
    
    return true;
  }

  /**
   * Get recovery actions based on reason
   */
  private getRecoveryActions(reason: string): RecoveryAction[] {
    const actions: RecoveryAction[] = [];

    switch (reason) {
      case 'error-storm':
        actions.push(
          { name: 'Clear error log', execute: () => errorHandler.clearErrorLog() },
          { name: 'Reset circuit breakers', execute: () => this.resetCircuitBreakers() },
          { name: 'Clear caches', execute: () => this.clearCaches(), optional: true },
          { name: 'Reduce concurrent operations', execute: () => this.reduceLoad() }
        );
        break;
      
      case 'repeated-error':
        actions.push(
          { name: 'Reset failed operation', execute: () => this.resetFailedOperation() },
          { name: 'Clear operation cache', execute: () => this.clearOperationCache() },
          { name: 'Increase timeouts', execute: () => this.increaseTimeouts() }
        );
        break;
      
      case 'memory-pressure':
        actions.push(
          { name: 'Clear all caches', execute: () => this.clearCaches() },
          { name: 'Garbage collection', execute: () => this.forceGarbageCollection() },
          { name: 'Reduce buffer sizes', execute: () => this.reduceBuffers() }
        );
        break;
      
      case 'shutdown':
        actions.push(
          { name: 'Save session', execute: () => this.saveSession() },
          { name: 'Export metrics', execute: () => this.exportMetrics(), optional: true }
        );
        break;
      
      default:
        actions.push(
          { name: 'Basic recovery', execute: () => this.basicRecovery() }
        );
    }

    return actions;
  }

  /**
   * Recovery action implementations
   */
  private async resetCircuitBreakers(): Promise<void> {
    // Reset all circuit breakers
    this.emit('reset-circuit-breakers');
  }

  private async clearCaches(): Promise<void> {
    // Clear all caches
    this.emit('clear-caches');
    if (global.gc) {
      global.gc();
    }
  }

  private async reduceLoad(): Promise<void> {
    // Reduce concurrent operations
    this.emit('reduce-load', { factor: 0.5 });
  }

  private async resetFailedOperation(): Promise<void> {
    // Reset specific failed operation
    this.emit('reset-operation');
  }

  private async clearOperationCache(): Promise<void> {
    // Clear operation-specific cache
    this.emit('clear-operation-cache');
  }

  private async increaseTimeouts(): Promise<void> {
    // Increase all timeouts by 50%
    this.emit('increase-timeouts', { factor: 1.5 });
  }

  private async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      global.gc();
    }
  }

  private async reduceBuffers(): Promise<void> {
    // Reduce buffer sizes
    this.emit('reduce-buffers', { factor: 0.5 });
  }

  private async saveSession(): Promise<void> {
    // Save current session
    await this.saveState('session-save');
  }

  private async exportMetrics(): Promise<void> {
    // Export performance metrics
    const filepath = path.join(this.recoveryPath, `metrics-${Date.now()}.json`);
    await performanceMonitor.exportMetrics(filepath);
  }

  private async basicRecovery(): Promise<void> {
    // Basic recovery actions
    await this.clearCaches();
    errorHandler.clearErrorLog();
  }

  /**
   * Clean up old recovery files
   */
  private async cleanupOldRecoveryFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.recoveryPath);
      const recoveryFiles = files
        .filter(f => f.startsWith('recovery-'))
        .sort((a, b) => b.localeCompare(a));
      
      // Keep only last 10 files
      if (recoveryFiles.length > 10) {
        for (const file of recoveryFiles.slice(10)) {
          await fs.remove(path.join(this.recoveryPath, file));
        }
      }
    } catch (error) {
      console.error('Failed to cleanup recovery files:', error);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if recovery is available
   */
  async hasRecoveryState(): Promise<boolean> {
    try {
      const files = await fs.readdir(this.recoveryPath);
      return files.some(f => f.startsWith('recovery-'));
    } catch {
      return false;
    }
  }

  /**
   * Get recovery options
   */
  getOptions(): RecoveryOptions {
    return { ...this.options };
  }

  /**
   * Update recovery options
   */
  updateOptions(options: Partial<RecoveryOptions>): void {
    Object.assign(this.options, options);
  }

  /**
   * Reset recovery attempts
   */
  resetAttempts(): void {
    this.recoveryAttempts = 0;
  }

  /**
   * Get recovery statistics
   */
  getStatistics(): {
    attempts: number;
    isRecovering: boolean;
    hasState: boolean;
    lastRecovery?: Date;
  } {
    return {
      attempts: this.recoveryAttempts,
      isRecovering: this.isRecovering,
      hasState: this.currentState !== null,
      lastRecovery: this.currentState?.timestamp
    };
  }
}

interface RecoveryAction {
  name: string;
  execute: () => Promise<void> | void;
  optional?: boolean;
}

/**
 * Auto-recovery decorator
 */
export function autoRecover(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  
  descriptor.value = async function (...args: any[]) {
    const recovery = RecoveryManager.getInstance();
    
    try {
      return await originalMethod.apply(this, args);
    } catch (error: any) {
      console.error(`Error in ${propertyKey}:`, error.message);
      
      // Attempt recovery
      const recovered = await recovery.initiateRecovery(`method-${propertyKey}`, {
        error: error.message,
        args
      });
      
      if (recovered) {
        // Retry the method once after recovery
        try {
          return await originalMethod.apply(this, args);
        } catch (retryError) {
          throw retryError;
        }
      }
      
      throw error;
    }
  };
  
  return descriptor;
}

// Export singleton instance
export const recoveryManager = RecoveryManager.getInstance();