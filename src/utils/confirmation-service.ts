import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import * as path from 'path';

const execAsync = promisify(exec);

export interface ConfirmationOptions {
  operation: string;
  filename?: string;
  showVSCodeOpen?: boolean;
  content?: string;
  metadata?: Record<string, any>;
}

export interface ConfirmationResult {
  confirmed: boolean;
  dontAskAgain?: boolean;
  feedback?: string;
  timestamp?: Date;
}

export interface SessionFlags {
  fileOperations: boolean;
  bashCommands: boolean;
  allOperations: boolean;
  searchOperations: boolean;
  toolExecutions: boolean;
  apiCalls: boolean;
}

export interface ConfirmationCache {
  [key: string]: {
    result: ConfirmationResult;
    expires: number;
  };
}

export class ConfirmationService extends EventEmitter {
  private static instance: ConfirmationService;
  private pendingConfirmation: Promise<ConfirmationResult> | null = null;
  private resolveConfirmation: ((result: ConfirmationResult) => void) | null = null;
  
  // Session flags for different operation types
  private sessionFlags: SessionFlags = {
    fileOperations: false,
    bashCommands: false,
    allOperations: false,
    searchOperations: false,
    toolExecutions: false,
    apiCalls: false
  };

  // Cache for recent confirmations
  private confirmationCache: ConfirmationCache = {};
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  // Statistics tracking
  private stats = {
    totalRequests: 0,
    approved: 0,
    rejected: 0,
    cached: 0,
    autoApproved: 0
  };

  static getInstance(): ConfirmationService {
    if (!ConfirmationService.instance) {
      ConfirmationService.instance = new ConfirmationService();
    }
    return ConfirmationService.instance;
  }

  constructor() {
    super();
    this.cleanupExpiredCache();
  }

  /**
   * Request confirmation from user
   */
  async requestConfirmation(
    options: ConfirmationOptions,
    operationType: keyof SessionFlags = 'fileOperations'
  ): Promise<ConfirmationResult> {
    this.stats.totalRequests++;

    // Check cache first
    const cacheKey = this.getCacheKey(options);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.cached++;
      return cached;
    }

    // Check session flags
    if (
      this.sessionFlags.allOperations ||
      this.sessionFlags[operationType]
    ) {
      this.stats.autoApproved++;
      const result: ConfirmationResult = {
        confirmed: true,
        timestamp: new Date()
      };
      this.addToCache(cacheKey, result);
      return result;
    }

    // If VS Code should be opened, try to open it
    if (options.showVSCodeOpen && options.filename) {
      try {
        await this.openInVSCode(options.filename);
      } catch (error) {
        // If VS Code opening fails, continue without it
        console.warn('Could not open file in VS Code:', error);
      }
    }

    // Create a promise that will be resolved by the UI component
    this.pendingConfirmation = new Promise<ConfirmationResult>((resolve) => {
      this.resolveConfirmation = resolve;
    });

    // Emit custom event that the UI can listen to
    setImmediate(() => {
      this.emit('confirmation-requested', options);
    });

    const result = await this.pendingConfirmation;
    
    // Update statistics
    if (result.confirmed) {
      this.stats.approved++;
    } else {
      this.stats.rejected++;
    }

    // Handle "don't ask again" flag
    if (result.dontAskAgain && result.confirmed) {
      this.setSessionFlag(operationType, true);
    }

    // Cache the result
    this.addToCache(cacheKey, result);

    return result;
  }

  /**
   * Confirm or reject pending operation
   */
  confirmOperation(confirmed: boolean, dontAskAgain?: boolean, feedback?: string): void {
    if (this.resolveConfirmation) {
      const result: ConfirmationResult = {
        confirmed,
        dontAskAgain,
        feedback,
        timestamp: new Date()
      };
      this.resolveConfirmation(result);
      this.resolveConfirmation = null;
      this.pendingConfirmation = null;
    }
  }

  /**
   * Set session flag for operation type
   */
  setSessionFlag(flag: keyof SessionFlags | 'all', value: boolean): void {
    if (flag === 'all') {
      this.sessionFlags.allOperations = value;
    } else {
      this.sessionFlags[flag] = value;
    }
    this.emit('session-flag-changed', { flag, value });
  }

  /**
   * Get current session flags
   */
  getSessionFlags(): SessionFlags {
    return { ...this.sessionFlags };
  }

  /**
   * Reset session flags
   */
  resetSessionFlags(): void {
    this.sessionFlags = {
      fileOperations: false,
      bashCommands: false,
      allOperations: false,
      searchOperations: false,
      toolExecutions: false,
      apiCalls: false
    };
    this.emit('session-flags-reset');
  }

  /**
   * Open file in VS Code
   */
  private async openInVSCode(filename: string): Promise<void> {
    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      command = `code "${filename}"`;
    } else if (platform === 'darwin') {
      command = `open -a "Visual Studio Code" "${filename}"`;
    } else {
      command = `code "${filename}"`;
    }

    await execAsync(command);
  }

  /**
   * Generate cache key for confirmation
   */
  private getCacheKey(options: ConfirmationOptions): string {
    return `${options.operation}:${options.filename || 'global'}`;
  }

  /**
   * Get result from cache
   */
  private getFromCache(key: string): ConfirmationResult | null {
    const cached = this.confirmationCache[key];
    if (cached && cached.expires > Date.now()) {
      return cached.result;
    }
    return null;
  }

  /**
   * Add result to cache
   */
  private addToCache(key: string, result: ConfirmationResult): void {
    this.confirmationCache[key] = {
      result,
      expires: Date.now() + this.cacheTimeout
    };
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const key in this.confirmationCache) {
        if (this.confirmationCache[key].expires <= now) {
          delete this.confirmationCache[key];
        }
      }
    }, 60000); // Clean up every minute
    interval.unref();
  }

  /**
   * Get statistics
   */
  getStatistics(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.stats = {
      totalRequests: 0,
      approved: 0,
      rejected: 0,
      cached: 0,
      autoApproved: 0
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.confirmationCache = {};
  }

  /**
   * Set cache timeout
   */
  setCacheTimeout(ms: number): void {
    this.cacheTimeout = ms;
  }

  /**
   * Export session settings
   */
  exportSettings(): {
    flags: SessionFlags;
    stats: any;
    cacheTimeout: number;
  } {
    return {
      flags: this.getSessionFlags(),
      stats: this.getStatistics(),
      cacheTimeout: this.cacheTimeout
    };
  }

  /**
   * Import session settings
   */
  importSettings(settings: {
    flags?: Partial<SessionFlags>;
    cacheTimeout?: number;
  }): void {
    if (settings.flags) {
      Object.assign(this.sessionFlags, settings.flags);
    }
    if (settings.cacheTimeout) {
      this.cacheTimeout = settings.cacheTimeout;
    }
  }

  /**
   * Check if operation would be auto-approved
   */
  wouldAutoApprove(this: ConfirmationService, operationType: keyof SessionFlags): boolean {
    return this.sessionFlags.allOperations || this.sessionFlags[operationType];
  }

  /**
   * Get pending confirmation if any
   */
  hasPendingConfirmation(): boolean {
    return this.pendingConfirmation !== null;
  }

  /**
   * Cancel pending confirmation
   */
  cancelPendingConfirmation(): void {
    if (this.resolveConfirmation) {
      this.confirmOperation(false, false, 'Cancelled by system');
    }
  }
}

/**
 * Confirmation presets for common operations
 */
export const ConfirmationPresets = {
  fileWrite: (filename: string, content?: string): ConfirmationOptions => ({
    operation: 'Write file',
    filename,
    content,
    showVSCodeOpen: true
  }),

  fileDelete: (filename: string): ConfirmationOptions => ({
    operation: 'Delete file',
    filename,
    showVSCodeOpen: false
  }),

  bashCommand: (command: string): ConfirmationOptions => ({
    operation: 'Execute command',
    content: command,
    showVSCodeOpen: false
  }),

  apiCall: (endpoint: string, method: string = 'GET'): ConfirmationOptions => ({
    operation: `API ${method}`,
    content: endpoint,
    showVSCodeOpen: false
  }),

  toolExecution: (toolName: string, params?: any): ConfirmationOptions => ({
    operation: `Execute ${toolName}`,
    content: params ? JSON.stringify(params, null, 2) : undefined,
    showVSCodeOpen: false
  })
};

/**
 * Batch confirmation for multiple operations
 */
export class BatchConfirmation {
  private operations: ConfirmationOptions[] = [];
  private service = ConfirmationService.getInstance();

  add(operation: ConfirmationOptions): this {
    this.operations.push(operation);
    return this;
  }

  async confirmAll(): Promise<ConfirmationResult[]> {
    const results: ConfirmationResult[] = [];
    
    for (const operation of this.operations) {
      const result = await this.service.requestConfirmation(operation);
      results.push(result);
      
      // If user rejected and didn't select "don't ask again", stop
      if (!result.confirmed && !result.dontAskAgain) {
        break;
      }
    }
    
    return results;
  }

  clear(): void {
    this.operations = [];
  }
}

// Export singleton instance
export const confirmationService = ConfirmationService.getInstance();