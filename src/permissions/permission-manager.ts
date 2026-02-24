/**
 * Permission Manager
 * Three-tier permission system: allow, ask, deny
 * Supports glob-style patterns and multiple permission modes.
 *
 * Config locations:
 * - User-level:    ~/.canvas/permissions.json
 * - Project-level: .canvas/permissions.json
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

export type PermissionDecision = 'allow' | 'ask' | 'deny';
export type PermissionMode = 'default' | 'auto-edit' | 'plan' | 'full-auto';

export interface PermissionRule {
  /** Glob pattern for tool name, e.g. "shell_exec", "file_write:src/**" */
  pattern: string;
  /** Decision to apply when pattern matches */
  decision: PermissionDecision;
  /** Optional human-readable reason */
  reason?: string;
}

export interface PermissionConfig {
  mode: PermissionMode;
  rules: PermissionRule[];
}

interface PermissionCheckContext {
  tool: string;
  params?: Record<string, any>;
  filePath?: string;
}

const USER_PERMISSIONS_PATH = path.join(os.homedir(), '.canvas', 'permissions.json');
const PROJECT_PERMISSIONS_DIR = '.canvas';
const PROJECT_PERMISSIONS_FILE = 'permissions.json';

const DEFAULT_CONFIG: PermissionConfig = {
  mode: 'default',
  rules: [
    // Default safe rules
    { pattern: 'file_read', decision: 'allow', reason: 'Reading files is safe' },
    { pattern: 'file_read:*', decision: 'allow', reason: 'Reading files is safe' },
    { pattern: 'search_*', decision: 'allow', reason: 'Search operations are safe' },
    { pattern: 'grep_*', decision: 'allow', reason: 'Search operations are safe' },
    { pattern: 'list_*', decision: 'allow', reason: 'Listing is safe' },
    { pattern: 'glob', decision: 'allow', reason: 'Glob is safe' },
    // Deny dangerous patterns by default
    { pattern: 'shell_exec:rm -rf *', decision: 'deny', reason: 'Destructive operation' },
    { pattern: 'shell_exec:git push --force*', decision: 'deny', reason: 'Force push protection' },
    { pattern: 'shell_exec:git reset --hard*', decision: 'deny', reason: 'Hard reset protection' },
    { pattern: 'file_write:*.env', decision: 'deny', reason: 'Protect environment files' },
    { pattern: 'file_write:*.pem', decision: 'deny', reason: 'Protect key files' },
    { pattern: 'file_write:*.key', decision: 'deny', reason: 'Protect key files' },
  ],
};

/**
 * Simple glob matching — supports * and ** wildcards
 */
function globMatch(pattern: string, value: string): boolean {
  // Escape regex special chars, then convert glob wildcards
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^:]*')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(value);
}

export class PermissionManager extends EventEmitter {
  private static instance: PermissionManager;
  private userConfig: PermissionConfig;
  private projectConfig: PermissionConfig | null = null;
  private sessionOverrides: Map<string, PermissionDecision> = new Map();
  private currentMode: PermissionMode;

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  constructor() {
    super();
    this.userConfig = this.loadConfig(USER_PERMISSIONS_PATH) || { ...DEFAULT_CONFIG };
    this.currentMode = this.userConfig.mode || 'default';
    this.loadProjectConfig();
  }

  /**
   * Load a permission config file
   */
  private loadConfig(filePath: string): PermissionConfig | null {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readJsonSync(filePath);
        return {
          mode: raw.mode || 'default',
          rules: Array.isArray(raw.rules) ? raw.rules : [],
        };
      }
    } catch {
      // Ignore invalid config
    }
    return null;
  }

  /**
   * Load project-level permissions
   */
  private loadProjectConfig(): void {
    const projectPath = path.join(
      process.cwd(),
      PROJECT_PERMISSIONS_DIR,
      PROJECT_PERMISSIONS_FILE
    );
    this.projectConfig = this.loadConfig(projectPath);
  }

  /**
   * Set the permission mode for this session
   */
  setMode(mode: PermissionMode): void {
    this.currentMode = mode;
    this.emit('mode-changed', mode);
  }

  /**
   * Get current permission mode
   */
  getMode(): PermissionMode {
    return this.currentMode;
  }

  /**
   * Check permission for a tool execution.
   * Returns the decision: allow (proceed), ask (prompt user), deny (block).
   */
  checkPermission(context: PermissionCheckContext): PermissionDecision {
    const toolKey = this.buildToolKey(context);

    // 1. Mode overrides
    switch (this.currentMode) {
      case 'full-auto':
        return 'allow';
      case 'plan':
        // In plan mode, only allow read operations
        if (this.isReadOnly(context.tool)) return 'allow';
        return 'deny';
      case 'auto-edit':
        // Auto-approve file edits, ask for everything else
        if (context.tool.startsWith('file_write') || context.tool.startsWith('file_edit')) {
          return 'allow';
        }
        break;
    }

    // 2. Session overrides (user said "allow for this session")
    const sessionOverride = this.sessionOverrides.get(toolKey);
    if (sessionOverride) return sessionOverride;

    // 3. Project-level rules (higher priority)
    if (this.projectConfig) {
      const projectDecision = this.matchRules(toolKey, this.projectConfig.rules);
      if (projectDecision) return projectDecision;
    }

    // 4. User-level rules
    const userDecision = this.matchRules(toolKey, this.userConfig.rules);
    if (userDecision) return userDecision;

    // 5. Default: ask for write/exec operations, allow reads
    if (this.isReadOnly(context.tool)) return 'allow';
    return 'ask';
  }

  /**
   * Build a tool key for pattern matching
   * e.g., "shell_exec:git push" or "file_write:src/index.ts"
   */
  private buildToolKey(context: PermissionCheckContext): string {
    if (context.filePath) {
      return `${context.tool}:${context.filePath}`;
    }
    if (context.params?.command) {
      return `${context.tool}:${context.params.command}`;
    }
    if (context.params?.path) {
      return `${context.tool}:${context.params.path}`;
    }
    return context.tool;
  }

  /**
   * Match a tool key against a list of rules
   */
  private matchRules(toolKey: string, rules: PermissionRule[]): PermissionDecision | null {
    // Check rules in reverse order (later rules have higher priority)
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (globMatch(rule.pattern, toolKey) || globMatch(rule.pattern, toolKey.split(':')[0])) {
        return rule.decision;
      }
    }
    return null;
  }

  /**
   * Check if a tool is read-only
   */
  private isReadOnly(tool: string): boolean {
    const readOnlyPrefixes = [
      'file_read', 'search', 'grep', 'list', 'glob', 'get_',
      'query', 'status', 'diff', 'log', 'show', 'find',
    ];
    return readOnlyPrefixes.some((p) => tool.startsWith(p));
  }

  /**
   * Set a session-level override (e.g., "allow for this session")
   */
  setSessionOverride(toolKey: string, decision: PermissionDecision): void {
    this.sessionOverrides.set(toolKey, decision);
  }

  /**
   * Clear all session overrides
   */
  clearSessionOverrides(): void {
    this.sessionOverrides.clear();
  }

  /**
   * Add a persistent rule to user or project config
   */
  addRule(
    rule: PermissionRule,
    scope: 'user' | 'project' = 'user'
  ): void {
    const config = scope === 'project' ? this.projectConfig : this.userConfig;
    if (!config) return;
    config.rules.push(rule);
    this.saveConfig(config, scope);
  }

  /**
   * Remove a rule by pattern
   */
  removeRule(pattern: string, scope: 'user' | 'project' = 'user'): boolean {
    const config = scope === 'project' ? this.projectConfig : this.userConfig;
    if (!config) return false;
    const before = config.rules.length;
    config.rules = config.rules.filter((r) => r.pattern !== pattern);
    if (config.rules.length !== before) {
      this.saveConfig(config, scope);
      return true;
    }
    return false;
  }

  /**
   * Get all rules for a scope
   */
  getRules(scope: 'user' | 'project' = 'user'): PermissionRule[] {
    const config = scope === 'project' ? this.projectConfig : this.userConfig;
    return config?.rules || [];
  }

  /**
   * Save config to disk
   */
  private saveConfig(config: PermissionConfig, scope: 'user' | 'project'): void {
    const filePath =
      scope === 'user'
        ? USER_PERMISSIONS_PATH
        : path.join(process.cwd(), PROJECT_PERMISSIONS_DIR, PROJECT_PERMISSIONS_FILE);
    try {
      fs.ensureDirSync(path.dirname(filePath));
      fs.writeJsonSync(filePath, config, { spaces: 2 });
    } catch (error) {
      console.error(`Failed to save permissions to ${filePath}:`, error);
    }
  }

  /**
   * Export current effective rules (merged)
   */
  getEffectiveRules(): PermissionRule[] {
    const rules = [...(this.userConfig.rules || [])];
    if (this.projectConfig) {
      rules.push(...this.projectConfig.rules);
    }
    return rules;
  }

  /**
   * Reset to default configuration
   */
  resetToDefaults(): void {
    this.userConfig = { ...DEFAULT_CONFIG };
    this.projectConfig = null;
    this.sessionOverrides.clear();
    this.currentMode = 'default';
    this.saveConfig(this.userConfig, 'user');
  }
}

export const permissionManager = PermissionManager.getInstance();
