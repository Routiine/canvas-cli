import * as dotenv from 'dotenv';
import fs from 'fs-extra';
import * as path from 'path';

// Load environment variables
dotenv.config();

export interface PerformanceConfig {
  // Timeout configurations (in ms)
  timeouts: {
    api: number;
    tool: number;
    command: number;
    search: number;
    default: number;
  };
  
  // Buffer configurations
  buffers: {
    maxSize: number;
    highWaterMark: number;
    lowWaterMark: number;
    commandMaxBuffer: number;
  };
  
  // Retry configurations
  retry: {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
  };
  
  // Tool execution limits
  toolLimits: {
    maxRounds: number;
    maxConcurrent: number;
    cooldownMs: number;
  };
  
  // Streaming configurations
  streaming: {
    enabled: boolean;
    chunkSize: number;
    bufferSize: number;
    rateLimit: number; // tokens per second
  };
  
  // Cache configurations
  cache: {
    enabled: boolean;
    ttl: number; // Time to live in ms
    maxSize: number;
    cleanupInterval: number;
  };
  
  // Token configurations
  tokens: {
    maxContextWindow: number;
    reserveTokens: number;
    warningThreshold: number;
  };
  
  // Headless mode
  headless: {
    enabled: boolean;
    autoApprove: boolean;
    outputFormat: 'json' | 'text' | 'markdown';
  };
  
  // Performance monitoring
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
}

/**
 * Default performance configuration
 */
export const defaultPerformanceConfig: PerformanceConfig = {
  timeouts: {
    api: parseInt(process.env.CANVAS_API_TIMEOUT || '360000'), // 6 minutes
    tool: parseInt(process.env.CANVAS_TOOL_TIMEOUT || '120000'), // 2 minutes
    command: parseInt(process.env.CANVAS_COMMAND_TIMEOUT || '30000'), // 30 seconds
    search: parseInt(process.env.CANVAS_SEARCH_TIMEOUT || '10000'), // 10 seconds
    default: parseInt(process.env.CANVAS_DEFAULT_TIMEOUT || '60000') // 1 minute
  },
  
  buffers: {
    maxSize: parseInt(process.env.CANVAS_BUFFER_MAX_SIZE || '1000'),
    highWaterMark: parseInt(process.env.CANVAS_BUFFER_HIGH_WATERMARK || '800'),
    lowWaterMark: parseInt(process.env.CANVAS_BUFFER_LOW_WATERMARK || '200'),
    commandMaxBuffer: parseInt(process.env.CANVAS_COMMAND_MAX_BUFFER || String(1024 * 1024)) // 1MB
  },
  
  retry: {
    maxRetries: parseInt(process.env.CANVAS_MAX_RETRIES || '3'),
    initialDelay: parseInt(process.env.CANVAS_INITIAL_DELAY || '1000'),
    maxDelay: parseInt(process.env.CANVAS_MAX_DELAY || '30000'),
    backoffFactor: parseFloat(process.env.CANVAS_BACKOFF_FACTOR || '2')
  },
  
  toolLimits: {
    maxRounds: parseInt(process.env.CANVAS_MAX_TOOL_ROUNDS || '400'),
    maxConcurrent: parseInt(process.env.CANVAS_MAX_CONCURRENT_TOOLS || '5'),
    cooldownMs: parseInt(process.env.CANVAS_TOOL_COOLDOWN || '100')
  },
  
  streaming: {
    enabled: process.env.CANVAS_STREAMING_ENABLED !== 'false',
    chunkSize: parseInt(process.env.CANVAS_CHUNK_SIZE || '1024'),
    bufferSize: parseInt(process.env.CANVAS_STREAM_BUFFER_SIZE || '10000'),
    rateLimit: parseInt(process.env.CANVAS_STREAM_RATE_LIMIT || '100')
  },
  
  cache: {
    enabled: process.env.CANVAS_CACHE_ENABLED !== 'false',
    ttl: parseInt(process.env.CANVAS_CACHE_TTL || String(5 * 60 * 1000)), // 5 minutes
    maxSize: parseInt(process.env.CANVAS_CACHE_MAX_SIZE || '100'),
    cleanupInterval: parseInt(process.env.CANVAS_CACHE_CLEANUP_INTERVAL || '60000')
  },
  
  tokens: {
    maxContextWindow: parseInt(process.env.CANVAS_MAX_CONTEXT_WINDOW || '128000'),
    reserveTokens: parseInt(process.env.CANVAS_RESERVE_TOKENS || '1000'),
    warningThreshold: parseFloat(process.env.CANVAS_TOKEN_WARNING_THRESHOLD || '0.8')
  },
  
  headless: {
    enabled: process.env.CANVAS_HEADLESS_MODE === 'true',
    autoApprove: process.env.CANVAS_HEADLESS_AUTO_APPROVE === 'true',
    outputFormat: (process.env.CANVAS_HEADLESS_OUTPUT_FORMAT || 'json') as 'json' | 'text' | 'markdown'
  },
  
  monitoring: {
    enabled: process.env.CANVAS_MONITORING_ENABLED !== 'false',
    metricsInterval: parseInt(process.env.CANVAS_METRICS_INTERVAL || '5000'),
    logLevel: (process.env.CANVAS_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error'
  }
};

/**
 * Performance configuration manager
 */
export class PerformanceConfigManager {
  private static instance: PerformanceConfigManager;
  private config: PerformanceConfig;
  private configPath: string;

  static getInstance(): PerformanceConfigManager {
    if (!PerformanceConfigManager.instance) {
      PerformanceConfigManager.instance = new PerformanceConfigManager();
    }
    return PerformanceConfigManager.instance;
  }

  constructor() {
    this.configPath = path.join(process.cwd(), '.canvas-cli', 'performance.json');
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file or use defaults
   */
  private loadConfig(): PerformanceConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const customConfig = fs.readJsonSync(this.configPath);
        return { ...defaultPerformanceConfig, ...customConfig };
      }
    } catch (error) {
      console.warn('Failed to load performance config, using defaults:', error);
    }
    
    return defaultPerformanceConfig;
  }

  /**
   * Save configuration to file
   */
  saveConfig(): void {
    try {
      fs.ensureDirSync(path.dirname(this.configPath));
      fs.writeJsonSync(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      console.error('Failed to save performance config:', error);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Get specific timeout
   */
  getTimeout(type: keyof PerformanceConfig['timeouts']): number {
    return this.config.timeouts[type];
  }

  /**
   * Check if feature is enabled
   */
  isEnabled(feature: 'streaming' | 'cache' | 'monitoring' | 'headless'): boolean {
    return this.config[feature].enabled;
  }

  /**
   * Get optimized configuration for model
   */
  getOptimizedConfigForModel(model: string): Partial<PerformanceConfig> {
    const modelConfigs: Record<string, Partial<PerformanceConfig>> = {
      'gpt-4-turbo': {
        tokens: {
          maxContextWindow: 128000,
          reserveTokens: 2000,
          warningThreshold: 0.85
        },
        streaming: {
          enabled: true,
          chunkSize: 2048,
          bufferSize: 20000,
          rateLimit: 200
        }
      },
      'gpt-3.5-turbo': {
        tokens: {
          maxContextWindow: 16385,
          reserveTokens: 500,
          warningThreshold: 0.9
        },
        streaming: {
          enabled: true,
          chunkSize: 1024,
          bufferSize: 10000,
          rateLimit: 150
        }
      },
      'claude-3': {
        tokens: {
          maxContextWindow: 200000,
          reserveTokens: 3000,
          warningThreshold: 0.8
        },
        streaming: {
          enabled: true,
          chunkSize: 4096,
          bufferSize: 30000,
          rateLimit: 300
        }
      },
      'llama': {
        tokens: {
          maxContextWindow: 8192,
          reserveTokens: 500,
          warningThreshold: 0.85
        },
        streaming: {
          enabled: true,
          chunkSize: 512,
          bufferSize: 5000,
          rateLimit: 100
        }
      }
    };

    // Find matching configuration
    for (const [pattern, config] of Object.entries(modelConfigs)) {
      if (model.toLowerCase().includes(pattern)) {
        return config;
      }
    }

    return {};
  }

  /**
   * Reset to defaults
   */
  resetToDefaults(): void {
    this.config = defaultPerformanceConfig;
    this.saveConfig();
  }

  /**
   * Export configuration
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration
   */
  importConfig(configJson: string): void {
    try {
      const imported = JSON.parse(configJson);
      this.config = { ...defaultPerformanceConfig, ...imported };
      this.saveConfig();
    } catch (error) {
      throw new Error(`Failed to import config: ${error}`);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(config: Partial<PerformanceConfig>): boolean {
    // Check timeout values
    if (config.timeouts) {
      for (const value of Object.values(config.timeouts)) {
        if (typeof value !== 'number' || value <= 0) {
          return false;
        }
      }
    }

    // Check buffer values
    if (config.buffers) {
      const { maxSize, highWaterMark, lowWaterMark } = config.buffers;
      if (highWaterMark && lowWaterMark && highWaterMark <= lowWaterMark) {
        return false;
      }
      if (maxSize && highWaterMark && maxSize < highWaterMark) {
        return false;
      }
    }

    // Check retry values
    if (config.retry) {
      const { maxRetries, backoffFactor } = config.retry;
      if (maxRetries && maxRetries < 0) return false;
      if (backoffFactor && backoffFactor < 1) return false;
    }

    return true;
  }

  /**
   * Get performance recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];

    // Check if timeouts are too low
    if (this.config.timeouts.api < 60000) {
      recommendations.push('Consider increasing API timeout to at least 60 seconds');
    }

    // Check if retry is disabled
    if (this.config.retry.maxRetries === 0) {
      recommendations.push('Enable retries for better resilience');
    }

    // Check if streaming is disabled
    if (!this.config.streaming.enabled) {
      recommendations.push('Enable streaming for better user experience');
    }

    // Check if cache is disabled
    if (!this.config.cache.enabled) {
      recommendations.push('Enable caching to reduce API calls');
    }

    // Check token configuration
    if (this.config.tokens.warningThreshold > 0.95) {
      recommendations.push('Lower token warning threshold for safer operation');
    }

    return recommendations;
  }
}

// Export singleton instance
export const performanceConfig = PerformanceConfigManager.getInstance();