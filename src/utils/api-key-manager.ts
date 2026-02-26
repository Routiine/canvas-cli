/**
 * Canvas CLI API Key Manager
 * Centralized and secure API key management
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

interface APIKeys {
  openai?: string;
  anthropic?: string;
  google?: string;
  groq?: string;
  [key: string]: string | undefined;
}

class APIKeyManager {
  private keys: APIKeys = {};
  private configPath: string;
  private useEnvironment: boolean;
  private encryptionKey?: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.canvas-cli', 'keys.json');
    this.useEnvironment = process.env.USE_ENV_KEYS !== 'false';
    this.encryptionKey = process.env.CANVAS_ENCRYPTION_KEY;
    
    this.loadKeys();
  }

  /**
   * Load API keys from environment variables first, then from config file
   */
  private loadKeys(): void {
    // Priority 1: Environment variables
    if (this.useEnvironment) {
      this.keys.openai = process.env.OPENAI_API_KEY || this.keys.openai;
      this.keys.anthropic = process.env.ANTHROPIC_API_KEY || this.keys.anthropic;
      this.keys.google = process.env.GOOGLE_API_KEY || this.keys.google;
      this.keys.groq = process.env.GROQ_API_KEY || this.keys.groq;
    }

    // Priority 2: Encrypted config file (if no env vars)
    if (fs.existsSync(this.configPath)) {
      try {
        const configData = fs.readJsonSync(this.configPath);
        
        // Decrypt if encryption is enabled
        if (this.encryptionKey && configData.encrypted) {
          try {
            const decrypted = this.decrypt(configData.data);
            const parsedKeys = JSON.parse(decrypted);
            
            // Only use config keys if not already set from environment
            Object.keys(parsedKeys).forEach(key => {
              if (!this.keys[key]) {
                this.keys[key] = parsedKeys[key];
              }
            });
          } catch {
            // Malformed or legacy encrypted data - skip silently
          }
        } else if (!configData.encrypted) {
          // Plain text config (not recommended)
          Object.keys(configData).forEach(key => {
            if (!this.keys[key] && key !== 'encrypted') {
              this.keys[key] = configData[key];
            }
          });
        }
      } catch (error) {
        // Silently fail - keys might not be configured yet
      }
    }
  }

  /**
   * Get an API key
   */
  getKey(provider: string): string | undefined {
    return this.keys[provider.toLowerCase()];
  }

  /**
   * Set an API key (in memory only, doesn't persist)
   */
  setKey(provider: string, key: string): void {
    this.keys[provider.toLowerCase()] = key;
  }

  /**
   * Save keys to encrypted config file
   */
  async saveKeys(): Promise<void> {
    fs.ensureDirSync(path.dirname(this.configPath));
    
    if (this.encryptionKey) {
      // Encrypt the keys
      const encrypted = this.encrypt(JSON.stringify(this.keys));
      await fs.writeJson(this.configPath, {
        encrypted: true,
        data: encrypted
      });
    } else {
      // Save as plain text with warning
      await fs.writeJson(this.configPath, {
        ...this.keys,
        encrypted: false,
        warning: 'API keys stored in plain text. Set CANVAS_ENCRYPTION_KEY for encryption.'
      });
    }
    
    // Set restrictive permissions (Unix-like systems)
    if (process.platform !== 'win32') {
      fs.chmodSync(this.configPath, 0o600);
    }
  }

  /**
   * Check if a provider has an API key configured
   */
  hasKey(provider: string): boolean {
    return !!this.keys[provider.toLowerCase()];
  }

  /**
   * List configured providers
   */
  getConfiguredProviders(): string[] {
    return Object.keys(this.keys).filter(key => this.keys[key]);
  }

  /**
   * Validate API keys format
   */
  validateKey(provider: string, key: string): boolean {
    const patterns: Record<string, RegExp> = {
      openai: /^sk-[a-zA-Z0-9]{48}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9-]{40,}$/,
      google: /^[a-zA-Z0-9-_]{39}$/,
      groq: /^gsk_[a-zA-Z0-9]{52}$/
    };

    const pattern = patterns[provider.toLowerCase()];
    return pattern ? pattern.test(key) : true;
  }

  /**
   * Remove an API key
   */
  removeKey(provider: string): void {
    delete this.keys[provider.toLowerCase()];
  }

  /**
   * Clear all API keys from memory
   */
  clearKeys(): void {
    this.keys = {};
  }

  /**
   * Secure encryption for API keys with random salt and IV
   */
  private encrypt(text: string): string {
    if (!this.encryptionKey) return text;

    const algorithm = 'aes-256-cbc';
    // Generate unique random salt for each encryption (16 bytes)
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Format: salt:iv:encrypted (all in hex)
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Secure decryption for API keys
   */
  private decrypt(encryptedText: string): string {
    if (!this.encryptionKey) return encryptedText;

    const algorithm = 'aes-256-cbc';
    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted key format - legacy format no longer supported');
    }

    // Format: salt:iv:encrypted
    const [saltHex, ivHex, encrypted] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, salt, 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Get recommendation for API key security
   */
  getSecurityStatus(): {
    secure: boolean;
    recommendations: string[];
  } {
    const recommendations: string[] = [];
    let secure = true;

    if (!this.useEnvironment) {
      recommendations.push('Enable environment variable usage with USE_ENV_KEYS=true');
      secure = false;
    }

    if (!this.encryptionKey && Object.keys(this.keys).length > 0) {
      recommendations.push('Set CANVAS_ENCRYPTION_KEY to encrypt stored API keys');
      secure = false;
    }

    if (fs.existsSync(this.configPath)) {
      const stats = fs.statSync(this.configPath);
      if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0) {
        recommendations.push('Config file permissions too open. Run: chmod 600 ' + this.configPath);
        secure = false;
      }
    }

    return { secure, recommendations };
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _apiKeyManager: APIKeyManager | null = null;
export function getApiKeyManager(): APIKeyManager {
  if (!_apiKeyManager) _apiKeyManager = new APIKeyManager();
  return _apiKeyManager;
}

// Export class for testing
export { APIKeyManager };

// Convenience exports
export const getAPIKey = (...args: Parameters<APIKeyManager['getKey']>) => getApiKeyManager().getKey(...args);
export const hasAPIKey = (...args: Parameters<APIKeyManager['hasKey']>) => getApiKeyManager().hasKey(...args);
export const validateAPIKey = (...args: Parameters<APIKeyManager['validateKey']>) => getApiKeyManager().validateKey(...args);

export default getApiKeyManager;