import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.canvas-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const defaultConfig: Config = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://192.168.12.236:8082',
  defaultModel: process.env.OLLAMA_MODEL || 'llama3.2:latest',
  theme: 'default',
  vimMode: false,
  sandbox: {
    enabled: false,
    type: 'none'
  },
  tools: {
    fileOperations: true,
    shellCommands: true,
    webSearch: true,
    webFetch: true
  },
  telemetry: false,
  customCommands: {}
};

export function loadConfig(): Config {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (error) {
    console.warn('Error loading config:', error);
  }

  return defaultConfig;
}

export function saveConfig(config: Partial<Config>): void {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    const currentConfig = loadConfig();
    const newConfig = { ...currentConfig, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}
