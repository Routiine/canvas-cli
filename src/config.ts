import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.canvas-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// No defaults! Config starts empty until user configures it
const emptyConfig: Config = {};

export function loadConfig(): Config {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      // Return exactly what's in the file, no merging with defaults
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Error loading config:', error);
  }

  // Return empty config - user must configure it
  return emptyConfig;
}

export function saveConfig(config: Partial<Config>): void {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Save exactly what's provided - no merging
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}
