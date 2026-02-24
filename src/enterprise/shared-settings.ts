/**
 * Shared Settings
 * Project-level settings that override user-level settings.
 * Loaded from .canvas/settings.json in the project root.
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface SharedSettings {
  /** Allowed models for this project */
  allowedModels?: string[];
  /** Blocked models */
  blockedModels?: string[];
  /** Default model override */
  defaultModel?: string;
  /** Maximum budget per session */
  maxBudgetUsd?: number;
  /** Require approval for specific tool categories */
  requireApproval?: string[];
  /** Custom system prompt addition */
  systemPromptAddition?: string;
  /** Disabled tools */
  disabledTools?: string[];
  /** Team name */
  team?: string;
}

const PROJECT_SETTINGS_FILE = '.canvas/settings.json';

/**
 * Load shared settings from the project root
 */
export function loadSharedSettings(projectRoot?: string): SharedSettings | null {
  const root = projectRoot || process.cwd();
  const settingsPath = path.join(root, PROJECT_SETTINGS_FILE);

  try {
    if (fs.existsSync(settingsPath)) {
      return fs.readJsonSync(settingsPath);
    }
  } catch {
    // Invalid settings file
  }

  return null;
}

/**
 * Save shared settings to the project root
 */
export function saveSharedSettings(settings: SharedSettings, projectRoot?: string): void {
  const root = projectRoot || process.cwd();
  const settingsPath = path.join(root, PROJECT_SETTINGS_FILE);

  fs.ensureDirSync(path.dirname(settingsPath));
  fs.writeJsonSync(settingsPath, settings, { spaces: 2 });
}

/**
 * Check if a model is allowed by shared settings
 */
export function isModelAllowed(model: string, settings: SharedSettings): boolean {
  if (settings.blockedModels?.includes(model)) return false;
  if (settings.allowedModels && settings.allowedModels.length > 0) {
    return settings.allowedModels.includes(model);
  }
  return true;
}

/**
 * Check if a tool is disabled by shared settings
 */
export function isToolDisabled(tool: string, settings: SharedSettings): boolean {
  return settings.disabledTools?.includes(tool) || false;
}
