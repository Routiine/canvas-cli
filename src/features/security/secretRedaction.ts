import { EventEmitter } from 'events';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Secret Redaction System
export interface SecretPattern {
  id: string;
  name: string;
  pattern: RegExp;
  replacement: string;
  category: 'api-key' | 'password' | 'token' | 'credential' | 'pii' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  enabled: boolean;
  caseSensitive: boolean;
  globalMatch: boolean;
}

export interface RedactionResult {
  id: string;
  originalText: string;
  redactedText: string;
  matches: RedactionMatch[];
  timestamp: Date;
  source: string;
  patterns: string[];
}

export interface RedactionMatch {
  pattern: string;
  patternName: string;
  original: string;
  redacted: string;
  startIndex: number;
  endIndex: number;
  severity: string;
  category: string;
}

export interface RedactionConfig {
  enabled: boolean;
  logRedactions: boolean;
  alertOnHighSeverity: boolean;
  redactionMarker: string;
  preserveLength: boolean;
  customPatterns: SecretPattern[];
  whitelist: string[];
  blacklist: string[];
  scanFiles: boolean;
  scanOutput: boolean;
  scanInput: boolean;
}

export interface SecretScan {
  id: string;
  filePath: string;
  content: string;
  redactedContent: string;
  matches: RedactionMatch[];
  scannedAt: Date;
  fileSize: number;
  fileHash: string;
}

export class SecretRedactionSystem extends EventEmitter {
  private patterns: Map<string, SecretPattern> = new Map();
  private redactionHistory: RedactionResult[] = [];
  private scannedFiles: Map<string, SecretScan> = new Map();
  private config: RedactionConfig;
  private storageDir: string;
  private encryptionKey: string;

  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'security');
    fs.ensureDirSync(this.storageDir);
    
    this.encryptionKey = this.generateEncryptionKey();
    
    this.config = {
      enabled: true,
      logRedactions: true,
      alertOnHighSeverity: true,
      redactionMarker: '***REDACTED***',
      preserveLength: false,
      customPatterns: [],
      whitelist: [],
      blacklist: [],
      scanFiles: true,
      scanOutput: true,
      scanInput: true
    };
    
    void this.loadConfig();
    this.setupDefaultPatterns();
    void this.loadCustomPatterns();
  }

  private generateEncryptionKey(): string {
    const keyPath = path.join(this.storageDir, '.encryption-key');
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8');
    }
    
    const key = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyPath, key, { mode: 0o600 });
    return key;
  }

  private setupDefaultPatterns(): void {
    const defaultPatterns: SecretPattern[] = [
      // API Keys
      {
        id: 'aws-access-key',
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/gi,
        replacement: 'AKIA***REDACTED***',
        category: 'api-key',
        severity: 'critical',
        description: 'AWS Access Key ID',
        enabled: true,
        caseSensitive: false,
        globalMatch: true
      },
      {
        id: 'aws-secret-key',
        name: 'AWS Secret Key',
        pattern: /(AWS_SECRET_ACCESS_KEY|aws_secret_access_key)\s*[=:]\s*([A-Za-z0-9/+=]{40})/g,
        replacement: '***AWS_SECRET_REDACTED***',
        category: 'api-key',
        severity: 'critical',
        description: 'AWS Secret Access Key',
        enabled: true,
        caseSensitive: true,
        globalMatch: true
      },
      {
        id: 'github-token',
        name: 'GitHub Token',
        pattern: /ghp_[a-zA-Z0-9]{36}/g,
        replacement: 'ghp_***REDACTED***',
        category: 'token',
        severity: 'high',
        description: 'GitHub Personal Access Token',
        enabled: true,
        caseSensitive: true,
        globalMatch: true
      },
      {
        id: 'openai-api-key',
        name: 'OpenAI API Key',
        pattern: /sk-[a-zA-Z0-9]{48}/g,
        replacement: 'sk-***REDACTED***',
        category: 'api-key',
        severity: 'high',
        description: 'OpenAI API Key',
        enabled: true,
        caseSensitive: true,
        globalMatch: true
      },
      {
        id: 'slack-token',
        name: 'Slack Token',
        pattern: /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/g,
        replacement: 'xoxb-***REDACTED***',
        category: 'token',
        severity: 'high',
        description: 'Slack Bot Token',
        enabled: true,
        caseSensitive: true,
        globalMatch: true
      },
      
      // Generic patterns
      {
        id: 'password-field',
        name: 'Password Field',
        pattern: /(password|pwd|pass)\s*[=:]\s*["']?([^"'\s\n]+)["']?/gi,
        replacement: '$1=***REDACTED***',
        category: 'password',
        severity: 'high',
        description: 'Password in configuration or code',
        enabled: true,
        caseSensitive: false,
        globalMatch: true
      },
      {
        id: 'jwt-token',
        name: 'JWT Token',
        pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
        replacement: 'eyJ***REDACTED***.eyJ***REDACTED***',
        category: 'token',
        severity: 'medium',
        description: 'JSON Web Token',
        enabled: true,
        caseSensitive: true,
        globalMatch: true
      },
      {
        id: 'connection-string',
        name: 'Database Connection String',
        pattern: /(mongodb|mysql|postgresql|mssql):\/\/[^\s\n]+/gi,
        replacement: '$1://***REDACTED***',
        category: 'credential',
        severity: 'high',
        description: 'Database connection string',
        enabled: true,
        caseSensitive: false,
        globalMatch: true
      },
      
      // PII
      {
        id: 'email-address',
        name: 'Email Address',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '***EMAIL_REDACTED***',
        category: 'pii',
        severity: 'medium',
        description: 'Email address',
        enabled: true,
        caseSensitive: false,
        globalMatch: true
      },
      {
        id: 'phone-number',
        name: 'Phone Number',
        pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        replacement: '***PHONE_REDACTED***',
        category: 'pii',
        severity: 'medium',
        description: 'Phone number',
        enabled: true,
        caseSensitive: false,
        globalMatch: true
      },
      {
        id: 'ssn',
        name: 'Social Security Number',
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        replacement: '***SSN_REDACTED***',
        category: 'pii',
        severity: 'critical',
        description: 'Social Security Number',
        enabled: true,
        caseSensitive: false,
        globalMatch: true
      },
      {
        id: 'credit-card',
        name: 'Credit Card Number',
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        replacement: '***CARD_REDACTED***',
        category: 'pii',
        severity: 'critical',
        description: 'Credit card number',
        enabled: true,
        caseSensitive: false,
        globalMatch: true
      },
      
      // Private keys
      {
        id: 'rsa-private-key',
        name: 'RSA Private Key',
        pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/g,
        replacement: '-----BEGIN RSA PRIVATE KEY-----\n***REDACTED***\n-----END RSA PRIVATE KEY-----',
        category: 'credential',
        severity: 'critical',
        description: 'RSA private key',
        enabled: true,
        caseSensitive: true,
        globalMatch: true
      },
      {
        id: 'ssh-private-key',
        name: 'SSH Private Key',
        pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]+?-----END OPENSSH PRIVATE KEY-----/g,
        replacement: '-----BEGIN OPENSSH PRIVATE KEY-----\n***REDACTED***\n-----END OPENSSH PRIVATE KEY-----',
        category: 'credential',
        severity: 'critical',
        description: 'SSH private key',
        enabled: true,
        caseSensitive: true,
        globalMatch: true
      }
    ];

    for (const pattern of defaultPatterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  redactText(text: string, source: string = 'unknown'): RedactionResult {
    if (!this.config.enabled) {
      return {
        id: uuidv4(),
        originalText: text,
        redactedText: text,
        matches: [],
        timestamp: new Date(),
        source,
        patterns: []
      };
    }

    let redactedText = text;
    const matches: RedactionMatch[] = [];
    const usedPatterns: string[] = [];

    for (const pattern of this.patterns.values()) {
      if (!pattern.enabled) continue;

      const regex = new RegExp(
        pattern.pattern.source,
        (pattern.caseSensitive ? '' : 'i') + (pattern.globalMatch ? 'g' : '')
      );

      let match;
      while ((match = regex.exec(text)) !== null) {
        const original = match[0];
        const replacement = this.generateReplacement(original, pattern);
        
        matches.push({
          pattern: pattern.id,
          patternName: pattern.name,
          original,
          redacted: replacement,
          startIndex: match.index,
          endIndex: match.index + original.length,
          severity: pattern.severity,
          category: pattern.category
        });

        redactedText = redactedText.replace(original, replacement);
        usedPatterns.push(pattern.id);

        if (!pattern.globalMatch) break;
      }
    }

    const result: RedactionResult = {
      id: uuidv4(),
      originalText: text,
      redactedText,
      matches,
      timestamp: new Date(),
      source,
      patterns: usedPatterns
    };

    this.logRedaction(result);
    this.checkSeverityAlerts(result);

    return result;
  }

  private generateReplacement(original: string, pattern: SecretPattern): string {
    if (this.config.preserveLength) {
      const visibleChars = Math.min(4, Math.floor(original.length * 0.2));
      const prefix = original.substring(0, visibleChars);
      const redacted = '*'.repeat(original.length - visibleChars);
      return prefix + redacted;
    }

    return pattern.replacement.includes('***') 
      ? pattern.replacement 
      : this.config.redactionMarker;
  }

  async scanFile(filePath: string): Promise<SecretScan> {
    if (!this.config.enabled || !this.config.scanFiles) {
      throw new Error('File scanning is disabled');
    }

    const absolutePath = path.resolve(filePath);
    const content = await fs.readFile(absolutePath, 'utf8');
    const fileStats = await fs.stat(absolutePath);
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');

    const redactionResult = this.redactText(content, `file:${absolutePath}`);

    const scan: SecretScan = {
      id: uuidv4(),
      filePath: absolutePath,
      content,
      redactedContent: redactionResult.redactedText,
      matches: redactionResult.matches,
      scannedAt: new Date(),
      fileSize: fileStats.size,
      fileHash
    };

    this.scannedFiles.set(absolutePath, scan);
    this.emit('file-scanned', scan);

    if (scan.matches.length > 0) {
      console.log(chalk.yellow(`⚠️ Found ${scan.matches.length} secret(s) in ${filePath}`));
      this.logScanResult(scan);
    }

    return scan;
  }

  async scanDirectory(dirPath: string, recursive: boolean = true): Promise<SecretScan[]> {
    const results: SecretScan[] = [];
    const absolutePath = path.resolve(dirPath);

    const scanDir = async (currentDir: string) => {
      const items = await fs.readdir(currentDir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(currentDir, item.name);

        if (item.isDirectory()) {
          if (recursive && !this.shouldSkipDirectory(item.name)) {
            await scanDir(fullPath);
          }
        } else if (item.isFile()) {
          if (this.shouldScanFile(fullPath)) {
            try {
              const scan = await this.scanFile(fullPath);
              results.push(scan);
            } catch (error) {
              console.warn(chalk.yellow(`Warning: Could not scan ${fullPath}: ${error}`));
            }
          }
        }
      }
    };

    await scanDir(absolutePath);
    return results;
  }

  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = ['.git', 'node_modules', '.vscode', 'dist', 'build', '.next', '.nuxt', 'coverage'];
    return skipDirs.includes(dirName);
  }

  private shouldScanFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const scanExtensions = ['.js', '.ts', '.py', '.java', '.go', '.rs', '.php', '.rb', '.cpp', '.c', 
                           '.cs', '.json', '.yaml', '.yml', '.xml', '.env', '.config', '.ini', '.properties'];
    
    // Skip binary files and certain file types
    const skipExtensions = ['.exe', '.dll', '.so', '.dylib', '.img', '.iso', '.zip', '.tar', '.gz'];
    
    if (skipExtensions.includes(ext)) return false;
    if (scanExtensions.includes(ext)) return true;
    
    // Check for common config files without extensions
    const basename = path.basename(filePath).toLowerCase();
    const configFiles = ['dockerfile', 'makefile', 'readme', 'license', 'changelog'];
    return configFiles.some(name => basename.startsWith(name));
  }

  addPattern(pattern: Omit<SecretPattern, 'id'>): string {
    const id = uuidv4();
    const newPattern: SecretPattern = {
      ...pattern,
      id
    };

    this.patterns.set(id, newPattern);
    this.config.customPatterns.push(newPattern);
    void this.saveCustomPatterns();

    console.log(chalk.green(`✅ Added pattern: ${pattern.name}`));
    this.emit('pattern-added', newPattern);
    
    return id;
  }

  removePattern(patternId: string): boolean {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;

    this.patterns.delete(patternId);
    this.config.customPatterns = this.config.customPatterns.filter(p => p.id !== patternId);
    void this.saveCustomPatterns();

    console.log(chalk.yellow(`🗑️ Removed pattern: ${pattern.name}`));
    this.emit('pattern-removed', pattern);
    
    return true;
  }

  togglePattern(patternId: string): boolean {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return false;

    pattern.enabled = !pattern.enabled;
    void this.saveCustomPatterns();

    const status = pattern.enabled ? 'enabled' : 'disabled';
    console.log(chalk.blue(`🔄 Pattern ${pattern.name} ${status}`));
    this.emit('pattern-toggled', pattern);
    
    return true;
  }

  getPatterns(): SecretPattern[] {
    return Array.from(this.patterns.values());
  }

  getPattern(patternId: string): SecretPattern | undefined {
    return this.patterns.get(patternId);
  }

  addToWhitelist(value: string): void {
    if (!this.config.whitelist.includes(value)) {
      this.config.whitelist.push(value);
      void this.saveConfig();
      console.log(chalk.green(`✅ Added to whitelist: ${value}`));
    }
  }

  removeFromWhitelist(value: string): void {
    const index = this.config.whitelist.indexOf(value);
    if (index > -1) {
      this.config.whitelist.splice(index, 1);
      void this.saveConfig();
      console.log(chalk.yellow(`🗑️ Removed from whitelist: ${value}`));
    }
  }

  private logRedaction(result: RedactionResult): void {
    if (!this.config.logRedactions) return;

    this.redactionHistory.push(result);
    
    // Keep only recent history
    if (this.redactionHistory.length > 1000) {
      this.redactionHistory.splice(0, this.redactionHistory.length - 1000);
    }

    void this.saveRedactionHistory();
    this.emit('redaction-logged', result);
  }

  private checkSeverityAlerts(result: RedactionResult): void {
    if (!this.config.alertOnHighSeverity) return;

    const highSeverityMatches = result.matches.filter(
      match => match.severity === 'high' || match.severity === 'critical'
    );

    if (highSeverityMatches.length > 0) {
      const message = `High severity secrets detected in ${result.source}`;
      console.log(chalk.red.bold(`🚨 SECURITY ALERT: ${message}`));
      
      for (const match of highSeverityMatches) {
        console.log(chalk.red(`  - ${match.patternName} (${match.severity})`));
      }

      this.emit('security-alert', { result, matches: highSeverityMatches });
    }
  }

  private logScanResult(scan: SecretScan): void {
    console.log(chalk.dim(`📁 ${scan.filePath}`));
    
    for (const match of scan.matches) {
      const severityColor = this.getSeverityColor(match.severity);
      console.log(`  ${severityColor(match.severity.toUpperCase())} ${match.patternName}`);
    }
  }

  private getSeverityColor(severity: string): typeof chalk.red {
    switch (severity) {
      case 'critical': return chalk.red.bold;
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.blue;
      default: return chalk.gray;
    }
  }

  generateReport(): any {
    const totalRedactions = this.redactionHistory.length;
    const patternUsage = new Map<string, number>();
    const severityCount = new Map<string, number>();
    
    for (const result of this.redactionHistory) {
      for (const match of result.matches) {
        patternUsage.set(match.pattern, (patternUsage.get(match.pattern) || 0) + 1);
        severityCount.set(match.severity, (severityCount.get(match.severity) || 0) + 1);
      }
    }

    const recentScans = Array.from(this.scannedFiles.values())
      .sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime())
      .slice(0, 50);

    return {
      summary: {
        totalRedactions,
        totalPatterns: this.patterns.size,
        enabledPatterns: Array.from(this.patterns.values()).filter(p => p.enabled).length,
        filesScanned: this.scannedFiles.size,
        whitelistEntries: this.config.whitelist.length
      },
      patternUsage: Object.fromEntries(patternUsage),
      severityDistribution: Object.fromEntries(severityCount),
      recentScans: recentScans.map(scan => ({
        filePath: scan.filePath,
        matchCount: scan.matches.length,
        scannedAt: scan.scannedAt,
        fileSize: scan.fileSize
      })),
      config: this.config,
      generatedAt: new Date()
    };
  }

  updateConfig(updates: Partial<RedactionConfig>): void {
    this.config = { ...this.config, ...updates };
    void this.saveConfig();
    console.log(chalk.green('✅ Configuration updated'));
    this.emit('config-updated', this.config);
  }

  private async loadConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'redaction-config.json');
    if (await fs.pathExists(configPath)) {
      const saved = await fs.readJson(configPath);
      this.config = { ...this.config, ...saved };
    }
  }

  private async saveConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'redaction-config.json');
    await fs.writeJson(configPath, this.config, { spaces: 2 });
  }

  private async loadCustomPatterns(): Promise<void> {
    const patternsPath = path.join(this.storageDir, 'custom-patterns.json');
    if (await fs.pathExists(patternsPath)) {
      const customPatterns = await fs.readJson(patternsPath);
      for (const pattern of customPatterns) {
        // Convert pattern string back to RegExp
        pattern.pattern = new RegExp(pattern.pattern.source, pattern.pattern.flags);
        this.patterns.set(pattern.id, pattern);
      }
    }
  }

  private async saveCustomPatterns(): Promise<void> {
    const patternsPath = path.join(this.storageDir, 'custom-patterns.json');
    const customPatterns = this.config.customPatterns.map(pattern => ({
      ...pattern,
      pattern: {
        source: pattern.pattern.source,
        flags: pattern.pattern.flags
      }
    }));
    await fs.writeJson(patternsPath, customPatterns, { spaces: 2 });
  }

  private async saveRedactionHistory(): Promise<void> {
    const historyPath = path.join(this.storageDir, 'redaction-history.json');
    // Only save recent history (encrypted)
    const recentHistory = this.redactionHistory.slice(-100).map(result => ({
      ...result,
      originalText: this.encrypt(result.originalText),
      redactedText: result.redactedText // Keep redacted text readable
    }));
    await fs.writeJson(historyPath, recentHistory, { spaces: 2 });
  }

  private encrypt(text: string): string {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    const [saltHex, ivHex, encrypted] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

// Singleton instance
let redactionInstance: SecretRedactionSystem | null = null;

export function getSecretRedactionSystem(): SecretRedactionSystem {
  if (!redactionInstance) {
    redactionInstance = new SecretRedactionSystem();
  }
  return redactionInstance;
}