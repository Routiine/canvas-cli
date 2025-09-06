/**
 * Canvas CLI Application Configuration
 * Centralizes all configuration values previously hardcoded throughout the app
 */

import os from 'os';
import path from 'path';

export interface AppConfig {
  server: {
    host: string;
    port: number;
    websocketEnabled: boolean;
  };
  ollama: {
    baseUrl: string;
    timeout: number;
  };
  api: {
    endpoints: {
      health: string;
      status: string;
    };
  };
  paths: {
    home: string;
    config: string;
    logs: string;
    cache: string;
    sessions: string;
  };
  defaults: {
    model: string;
    temperature: number;
    maxTokens: number;
    timeout: number;
  };
  security: {
    useEnvironmentKeys: boolean;
    allowConfigKeys: boolean;
    encryptSessions: boolean;
  };
  features: {
    enableTelemetry: boolean;
    enableAutoSave: boolean;
    enableNotifications: boolean;
  };
}

// Load configuration from environment variables or use defaults
const getConfig = (): AppConfig => {
  const homeDir = os.homedir();
  const canvasDir = path.join(homeDir, '.canvas-cli');
  
  return {
    server: {
      host: process.env.CANVAS_HOST || 'localhost',
      port: parseInt(process.env.CANVAS_PORT || '3000', 10),
      websocketEnabled: process.env.CANVAS_WEBSOCKET !== 'false'
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000', 10)
    },
    api: {
      endpoints: {
        health: process.env.API_HEALTH_ENDPOINT || '/health',
        status: process.env.API_STATUS_ENDPOINT || '/status'
      }
    },
    paths: {
      home: canvasDir,
      config: path.join(canvasDir, 'config.json'),
      logs: path.join(canvasDir, 'logs'),
      cache: path.join(canvasDir, 'cache'),
      sessions: path.join(canvasDir, 'sessions')
    },
    defaults: {
      model: process.env.DEFAULT_MODEL || 'llama3.2',
      temperature: parseFloat(process.env.DEFAULT_TEMPERATURE || '0.7'),
      maxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS || '4096', 10),
      timeout: parseInt(process.env.DEFAULT_TIMEOUT || '120000', 10)
    },
    security: {
      useEnvironmentKeys: process.env.USE_ENV_KEYS !== 'false',
      allowConfigKeys: process.env.ALLOW_CONFIG_KEYS === 'true',
      encryptSessions: process.env.ENCRYPT_SESSIONS === 'true'
    },
    features: {
      enableTelemetry: process.env.ENABLE_TELEMETRY === 'true',
      enableAutoSave: process.env.ENABLE_AUTOSAVE !== 'false',
      enableNotifications: process.env.ENABLE_NOTIFICATIONS !== 'false'
    }
  };
};

// Export singleton configuration
export const appConfig = getConfig();

// Helper functions
export const getServerUrl = (path: string = ''): string => {
  const { host, port } = appConfig.server;
  return `http://${host}:${port}${path}`;
};

export const getWebSocketUrl = (path: string = ''): string => {
  const { host, port } = appConfig.server;
  return `ws://${host}:${port}${path}`;
};

export const getOllamaUrl = (endpoint: string = ''): string => {
  return `${appConfig.ollama.baseUrl}${endpoint}`;
};

// Configuration validator
export const validateConfig = (): string[] => {
  const errors: string[] = [];
  
  if (appConfig.server.port < 1 || appConfig.server.port > 65535) {
    errors.push('Invalid server port');
  }
  
  if (appConfig.defaults.temperature < 0 || appConfig.defaults.temperature > 2) {
    errors.push('Temperature must be between 0 and 2');
  }
  
  if (appConfig.defaults.maxTokens < 1) {
    errors.push('Max tokens must be positive');
  }
  
  return errors;
};

export default appConfig;