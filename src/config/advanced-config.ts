/**
 * Advanced configuration system with environment variables and validation
 * Based on goose-cli's configuration management
 */

import { z } from 'zod';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Configuration schemas
const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  timeout: z.number().min(1000).max(300000).default(30000),
  maxRetries: z.number().min(0).max(10).default(3),
  rateLimitRpm: z.number().min(1).optional(),
  headers: z.record(z.string()).optional()
});

const ModelConfigSchema = z.object({
  name: z.string(),
  provider: z.string(),
  contextLimit: z.number().min(1000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().min(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  systemPrompt: z.string().optional(),
  toolsEnabled: z.boolean().default(true),
  streamingEnabled: z.boolean().default(true)
});

const ToolConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeout: z.number().min(1000).max(300000).default(30000),
  maxExecutions: z.number().min(1).max(100).default(10),
  sandboxEnabled: z.boolean().default(false),
  permissions: z.array(z.string()).default([]),
  environment: z.record(z.string()).optional()
});

const RecipeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  directories: z.array(z.string()).default([]),
  autoReload: z.boolean().default(true),
  maxParameterLength: z.number().min(1).max(10000).default(1000),
  allowUserPrompts: z.boolean().default(true)
});

const MonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxRepetitions: z.number().min(1).max(100).default(3),
  cooldownPeriod: z.number().min(100).max(60000).default(1000),
  statisticsEnabled: z.boolean().default(true),
  verboseLogging: z.boolean().default(false)
});

const ContextConfigSchema = z.object({
  compressionEnabled: z.boolean().default(true),
  strategy: z.enum(['drop_oldest', 'drop_middle', 'summarize', 'smart_trim']).default('smart_trim'),
  targetUtilization: z.number().min(0.1).max(1.0).default(0.8),
  preserveRecent: z.number().min(1).max(20).default(3),
  maxSummaryLength: z.number().min(100).max(2000).default(500),
  autoManagement: z.boolean().default(true)
});

const ErrorHandlingConfigSchema = z.object({
  maxRetryAttempts: z.number().min(0).max(10).default(3),
  retryBaseDelay: z.number().min(100).max(10000).default(1000),
  retryMultiplier: z.number().min(1).max(5).default(2),
  enableAutoRecovery: z.boolean().default(true),
  logErrors: z.boolean().default(true),
  reportErrors: z.boolean().default(false)
});

const UIConfigSchema = z.object({
  theme: z.enum(['default', 'dark', 'light', 'auto']).default('auto'),
  colorEnabled: z.boolean().default(true),
  spinnerStyle: z.string().default('dots'),
  showTimestamps: z.boolean().default(false),
  compactMode: z.boolean().default(false),
  maxLineLength: z.number().min(40).max(200).default(100)
});

// Main configuration schema
const ConfigSchema = z.object({
  version: z.string().default('2.0.0'),
  
  // Core settings
  defaultProvider: z.string().default('ollama'),
  workingDirectory: z.string().default(process.cwd()),
  dataDirectory: z.string().optional(),
  
  // Provider configurations
  providers: z.record(ProviderConfigSchema).default({}),
  
  // Model configurations
  models: z.array(ModelConfigSchema).default([]),
  
  // Tool configuration
  tools: z.record(ToolConfigSchema).default({}),
  
  // Recipe configuration
  recipes: RecipeConfigSchema.default({}),
  
  // Monitoring configuration
  monitoring: MonitoringConfigSchema.default({}),
  
  // Context management
  context: ContextConfigSchema.default({}),
  
  // Error handling
  errorHandling: ErrorHandlingConfigSchema.default({}),
  
  // UI settings
  ui: UIConfigSchema.default({}),
  
  // Feature flags
  features: z.object({
    webUI: z.boolean().default(false),
    pluginSystem: z.boolean().default(false),
    telemetry: z.boolean().default(false),
    experimentalFeatures: z.boolean().default(false)
  }).default({}),
  
  // Environment overrides
  environment: z.record(z.string()).optional()
});

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type ToolConfig = z.infer<typeof ToolConfigSchema>;

/**
 * Advanced configuration manager
 */
export class ConfigManager {
  private config: Config;
  private configPath: string;
  private userConfigDir: string;
  private globalConfigPath: string;
  private localConfigPath: string;
  private listeners: Set<(config: Config) => void> = new Set();

  constructor() {
    this.userConfigDir = path.join(os.homedir(), '.canvas-cli');
    this.globalConfigPath = path.join(this.userConfigDir, 'config.json');
    this.localConfigPath = path.join(process.cwd(), '.canvas-cli.json');
    this.configPath = this.globalConfigPath;
    
    this.config = this.loadDefaultConfig();
    void this.initialize();
  }

  /**
   * Initialize configuration system
   */
  private async initialize(): Promise<void> {
    try {
      await fs.ensureDir(this.userConfigDir);
      await this.loadConfiguration();
      this.applyEnvironmentOverrides();
    } catch (error) {
      console.warn('Failed to initialize configuration:', error);
    }
  }

  /**
   * Load configuration from files
   */
  private async loadConfiguration(): Promise<void> {
    let loadedConfig: Partial<Config> = {};

    // Load global configuration
    if (await fs.pathExists(this.globalConfigPath)) {
      try {
        const globalConfig = await fs.readJSON(this.globalConfigPath);
        loadedConfig = { ...loadedConfig, ...globalConfig };
      } catch (error) {
        console.warn('Failed to load global config:', error);
      }
    }

    // Load local configuration (overrides global)
    if (await fs.pathExists(this.localConfigPath)) {
      try {
        const localConfig = await fs.readJSON(this.localConfigPath);
        loadedConfig = { ...loadedConfig, ...localConfig };
      } catch (error) {
        console.warn('Failed to load local config:', error);
      }
    }

    // Merge with defaults and validate
    const mergedConfig = this.mergeDeep(this.config, loadedConfig);
    const validated = ConfigSchema.parse(mergedConfig);
    
    this.config = validated;
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(): void {
    const envPrefix = 'CANVAS_CLI_';
    const overrides: any = {};

    // Map environment variables to config paths
    const envMappings = {
      [`${envPrefix}DEFAULT_MODEL`]: 'defaultModel',
      [`${envPrefix}DEFAULT_PROVIDER`]: 'defaultProvider',
      [`${envPrefix}WORKING_DIRECTORY`]: 'workingDirectory',
      [`${envPrefix}DATA_DIRECTORY`]: 'dataDirectory',
      [`${envPrefix}TEMPERATURE`]: 'models.0.temperature',
      [`${envPrefix}MAX_TOKENS`]: 'models.0.maxTokens',
      [`${envPrefix}CONTEXT_STRATEGY`]: 'context.strategy',
      [`${envPrefix}CONTEXT_COMPRESSION`]: 'context.compressionEnabled',
      [`${envPrefix}TOOLS_ENABLED`]: 'models.0.toolsEnabled',
      [`${envPrefix}MONITORING_ENABLED`]: 'monitoring.enabled',
      [`${envPrefix}MAX_REPETITIONS`]: 'monitoring.maxRepetitions',
      [`${envPrefix}ERROR_LOGGING`]: 'errorHandling.logErrors',
      [`${envPrefix}AUTO_RECOVERY`]: 'errorHandling.enableAutoRecovery',
      [`${envPrefix}THEME`]: 'ui.theme',
      [`${envPrefix}COLOR_ENABLED`]: 'ui.colorEnabled',
      [`${envPrefix}WEB_UI`]: 'features.webUI',
      [`${envPrefix}PLUGINS`]: 'features.pluginSystem',
      [`${envPrefix}TELEMETRY`]: 'features.telemetry'
    };

    // Apply environment overrides
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(overrides, configPath, this.parseEnvValue(value));
      }
    }

    if (Object.keys(overrides).length > 0) {
      this.config = ConfigSchema.parse(this.mergeDeep(this.config, overrides));
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): Config {
    return { ...this.config };
  }

  /**
   * Get a specific configuration value
   */
  get<T = any>(path: string, defaultValue?: T): T {
    return this.getNestedValue(this.config, path) ?? defaultValue;
  }

  /**
   * Set a configuration value
   */
  async set(path: string, value: any): Promise<void> {
    const newConfig = { ...this.config };
    this.setNestedValue(newConfig, path, value);
    
    // Validate the new configuration
    const validated = ConfigSchema.parse(newConfig);
    this.config = validated;
    
    // Save to file
    await this.save();
    
    // Notify listeners
    this.notifyListeners();
  }

  /**
   * Update multiple configuration values
   */
  async update(updates: Partial<Config>): Promise<void> {
    const newConfig = this.mergeDeep(this.config, updates);
    const validated = ConfigSchema.parse(newConfig);
    
    this.config = validated;
    await this.save();
    this.notifyListeners();
  }

  /**
   * Save configuration to file
   */
  async save(global = true): Promise<void> {
    const savePath = global ? this.globalConfigPath : this.localConfigPath;
    
    try {
      await fs.writeJSON(savePath, this.config, { spaces: 2 });
      console.log(`Configuration saved to: ${savePath}`);
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  async reset(): Promise<void> {
    this.config = this.loadDefaultConfig();
    await this.save();
    this.notifyListeners();
  }

  /**
   * Add a configuration change listener
   */
  onChange(listener: (config: Config) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    try {
      ConfigSchema.parse(this.config);
      return { valid: true, errors: [] };
    } catch (error: any) {
      const errors = error?.issues?.map((issue: any) => 
        `${issue.path.join('.')}: ${issue.message}`
      ) || [error.message];
      return { valid: false, errors };
    }
  }

  /**
   * Get configuration schema for documentation/UI
   */
  getSchema(): any {
    return ConfigSchema;
  }

  /**
   * Export configuration for backup/sharing
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON string
   */
  async importConfig(configJson: string): Promise<void> {
    try {
      const imported = JSON.parse(configJson);
      const validated = ConfigSchema.parse(imported);
      
      this.config = validated;
      await this.save();
      this.notifyListeners();
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`);
    }
  }

  /**
   * Get model configuration
   */
  getModelConfig(modelName: string): ModelConfig | null {
    return this.config.models.find(model => model.name === modelName) || null;
  }

  /**
   * Add or update model configuration
   */
  async setModelConfig(modelConfig: ModelConfig): Promise<void> {
    const models = [...this.config.models];
    const index = models.findIndex(model => model.name === modelConfig.name);
    
    if (index >= 0) {
      models[index] = modelConfig;
    } else {
      models.push(modelConfig);
    }
    
    await this.update({ models });
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(provider: string): ProviderConfig | null {
    return this.config.providers[provider] || null;
  }

  /**
   * Set provider configuration
   */
  async setProviderConfig(provider: string, config: ProviderConfig): Promise<void> {
    const providers = { ...this.config.providers };
    providers[provider] = config;
    await this.update({ providers });
  }

  /**
   * Get tool configuration
   */
  getToolConfig(tool: string): ToolConfig | null {
    return this.config.tools[tool] || null;
  }

  /**
   * Set tool configuration
   */
  async setToolConfig(tool: string, config: ToolConfig): Promise<void> {
    const tools = { ...this.config.tools };
    tools[tool] = config;
    await this.update({ tools });
  }

  // Private helper methods

  private loadDefaultConfig(): Config {
    return ConfigSchema.parse({});
  }

  private mergeDeep(target: any, source: any): any {
    if (source === null || source === undefined) return target;
    if (typeof source !== 'object') return source;
    if (Array.isArray(source)) return source;

    const result = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.mergeDeep(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!(key in current) || current[key] === null || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  private parseEnvValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Try boolean
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
      
      // Try number
      const num = Number(value);
      if (!isNaN(num)) return num;
      
      // Return as string
      return value;
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.config);
      } catch (error) {
        console.error('Error in config listener:', error);
      }
    }
  }
}

// Export singleton instance
export const configManager = new ConfigManager();

// Convenience functions
export const getConfig = () => configManager.getConfig();
export const getConfigValue = <T = any>(path: string, defaultValue?: T): T => 
  configManager.get(path, defaultValue);
export const setConfigValue = (path: string, value: any) => 
  configManager.set(path, value);
export const updateConfig = (updates: Partial<Config>) => 
  configManager.update(updates);
export const onConfigChange = (listener: (config: Config) => void) => 
  configManager.onChange(listener);