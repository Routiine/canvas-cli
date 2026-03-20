import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Config } from './types.js';
import { findConfigFile, loadConfigFile, saveConfigFile } from './config/config-formats.js';

const CONFIG_DIR = path.join(os.homedir(), '.canvas-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Safe production defaults
 */
const DEFAULT_CONFIG: Config = {
  ollamaUrl: 'http://localhost:11434',
  defaultModel: 'llama3.2:1b',
  theme: 'default',
  vimMode: false,
  features: {
    autoExecute: false,  // IMPORTANT: Require confirmation by default for safety
    confirmBeforeExecute: true,
    saveHistory: true,
    maxHistorySize: 1000,
    enableTelemetry: false
  },
  sandbox: {
    enabled: false,
    type: 'none',
    maxTimeout: 30000,
    filterEnv: true  // Filter sensitive env vars by default
  },
  tools: {
    fileOperations: true,
    shellCommands: true,
    webSearch: true,
    webFetch: true
  }
};

/**
 * Validation errors collection
 */
interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a URL string
 */
function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and merge config with safe defaults
 */
function validateConfig(userConfig: any): Config {
  const config: Config = { ...DEFAULT_CONFIG };
  const warnings: string[] = [];

  // Merge user config with defaults (user values override defaults)
  if (userConfig && typeof userConfig === 'object') {
    // Top-level simple values with URL validation
    if (typeof userConfig.ollamaUrl === 'string') {
      if (isValidUrl(userConfig.ollamaUrl)) {
        config.ollamaUrl = userConfig.ollamaUrl;
      } else {
        warnings.push(`Invalid ollamaUrl "${userConfig.ollamaUrl}", using default`);
      }
    }
    // Migrate: both "model" and "defaultModel" are accepted from old configs.
    // Canonical key is "defaultModel". "model" is promoted and ignored thereafter.
    if (typeof userConfig.defaultModel === 'string') config.defaultModel = userConfig.defaultModel;
    if (typeof userConfig.model === 'string' && !userConfig.defaultModel) {
      config.defaultModel = userConfig.model;
    }
    if (typeof userConfig.theme === 'string') config.theme = userConfig.theme;
    if (typeof userConfig.vimMode === 'boolean') config.vimMode = userConfig.vimMode;

    // Ollama nested config with URL validation
    if (userConfig.ollama && typeof userConfig.ollama === 'object') {
      let baseUrl = DEFAULT_CONFIG.ollamaUrl!;
      if (typeof userConfig.ollama.baseUrl === 'string') {
        if (isValidUrl(userConfig.ollama.baseUrl)) {
          baseUrl = userConfig.ollama.baseUrl;
        } else {
          warnings.push(`Invalid ollama.baseUrl "${userConfig.ollama.baseUrl}", using default`);
        }
      }
      config.ollama = {
        baseUrl,
        defaultModel: userConfig.ollama.defaultModel || DEFAULT_CONFIG.defaultModel!,
        timeout: typeof userConfig.ollama.timeout === 'number'
          ? Math.min(Math.max(userConfig.ollama.timeout, 1000), 600000) // 1s to 10min
          : 120000,
        maxRetries: typeof userConfig.ollama.maxRetries === 'number'
          ? Math.min(Math.max(userConfig.ollama.maxRetries, 0), 10) // 0 to 10
          : 3
      };
    }

    // Features - be strict about autoExecute (safety critical)
    if (userConfig.features && typeof userConfig.features === 'object') {
      config.features = {
        ...DEFAULT_CONFIG.features,
        autoExecute: userConfig.features.autoExecute === true, // Only true if explicitly set
        confirmBeforeExecute: userConfig.features.confirmBeforeExecute !== false,
        saveHistory: userConfig.features.saveHistory !== false,
        maxHistorySize: typeof userConfig.features.maxHistorySize === 'number'
          ? userConfig.features.maxHistorySize : 1000
      };
    }

    // Sandbox config
    if (userConfig.sandbox && typeof userConfig.sandbox === 'object') {
      config.sandbox = {
        ...DEFAULT_CONFIG.sandbox,
        enabled: userConfig.sandbox.enabled === true,
        type: ['docker', 'podman', 'none'].includes(userConfig.sandbox.type)
          ? userConfig.sandbox.type : 'none',
        maxTimeout: typeof userConfig.sandbox.maxTimeout === 'number'
          ? Math.min(userConfig.sandbox.maxTimeout, 600000) : 30000, // Max 10 min
        filterEnv: userConfig.sandbox.filterEnv !== false
      };
    }

    // Tools config
    if (userConfig.tools && typeof userConfig.tools === 'object') {
      config.tools = { ...DEFAULT_CONFIG.tools, ...userConfig.tools };
    }
  }

  return config;
}

let _cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (_cachedConfig) return _cachedConfig;

  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Try multi-format: config.json, config.toml, config.yaml, config.yml
    const found = findConfigFile(CONFIG_DIR, 'config');
    if (found) {
      const userConfig = loadConfigFile(found.path);
      if (userConfig) {
        _cachedConfig = validateConfig(userConfig);
        return _cachedConfig;
      }
    }

    // Also check project-level .canvas/ directory
    const projectConfig = findConfigFile(path.join(process.cwd(), '.canvas'), 'config');
    if (projectConfig) {
      const projectData = loadConfigFile(projectConfig.path);
      if (projectData) {
        // Project config merges on top of user config
        _cachedConfig = validateConfig(projectData);
        return _cachedConfig;
      }
    }

    // Fallback to legacy JSON path
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const userConfig = JSON.parse(data);
      _cachedConfig = validateConfig(userConfig);
      return _cachedConfig;
    }
  } catch (error) {
    console.warn('Warning: Error loading config, using defaults:', error);
  }

  // Return safe defaults
  _cachedConfig = DEFAULT_CONFIG;
  return _cachedConfig;
}

export function saveConfig(config: Partial<Config>): void {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    // Save exactly what's provided - no merging
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    // Invalidate cache so next loadConfig() picks up new values
    _cachedConfig = null;
  } catch (error) {
    console.error('Error saving config:', error);
  }
}
