/**
 * Skill Registry
 * Manages skill installation, enabling/disabling.
 * Skills are markdown/json files that add new capabilities.
 *
 * CLI: canvas skills install|list|enable|disable
 */

import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  triggers?: string[];
  enabled: boolean;
  filePath: string;
  installedAt?: string;
}

const SKILLS_DIR = path.join(os.homedir(), '.canvas', 'skills');
const REGISTRY_FILE = path.join(SKILLS_DIR, 'registry.json');

export class SkillRegistry {
  private skills: Map<string, SkillManifest> = new Map();

  constructor() {
    fs.ensureDirSync(SKILLS_DIR);
    this.loadRegistry();
  }

  private loadRegistry(): void {
    try {
      if (fs.existsSync(REGISTRY_FILE)) {
        const data = fs.readJsonSync(REGISTRY_FILE);
        if (Array.isArray(data.skills)) {
          for (const skill of data.skills) {
            this.skills.set(skill.name, skill);
          }
        }
      }
    } catch {
      // Start fresh
    }
  }

  private saveRegistry(): void {
    fs.writeJsonSync(REGISTRY_FILE, {
      skills: Array.from(this.skills.values()),
    }, { spaces: 2 });
  }

  /**
   * Install a skill from a file path
   */
  install(filePath: string): SkillManifest {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Skill file not found: ${absPath}`);
    }

    const content = fs.readFileSync(absPath, 'utf8');
    const name = path.basename(absPath, path.extname(absPath));

    // Copy to skills directory
    const destPath = path.join(SKILLS_DIR, path.basename(absPath));
    fs.copySync(absPath, destPath);

    const manifest: SkillManifest = {
      name,
      version: '1.0.0',
      description: this.extractDescription(content),
      triggers: this.extractTriggers(content),
      enabled: true,
      filePath: destPath,
      installedAt: new Date().toISOString(),
    };

    this.skills.set(name, manifest);
    this.saveRegistry();
    return manifest;
  }

  /**
   * Uninstall a skill
   */
  uninstall(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;

    try {
      if (fs.existsSync(skill.filePath)) {
        fs.removeSync(skill.filePath);
      }
    } catch {
      // Continue even if file removal fails
    }

    this.skills.delete(name);
    this.saveRegistry();
    return true;
  }

  /**
   * Enable a skill
   */
  enable(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.enabled = true;
    this.saveRegistry();
    return true;
  }

  /**
   * Disable a skill
   */
  disable(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.enabled = false;
    this.saveRegistry();
    return true;
  }

  /**
   * List all skills
   */
  list(): SkillManifest[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get enabled skills
   */
  getEnabled(): SkillManifest[] {
    return this.list().filter(s => s.enabled);
  }

  /**
   * Get a skill by name
   */
  get(name: string): SkillManifest | undefined {
    return this.skills.get(name);
  }

  private extractDescription(content: string): string {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1] : 'No description';
  }

  private extractTriggers(content: string): string[] {
    const triggers: string[] = [];
    const match = content.match(/triggers?:\s*(.+)/i);
    if (match) {
      triggers.push(...match[1].split(',').map(t => t.trim()));
    }
    return triggers;
  }
}

let instance: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!instance) {
    instance = new SkillRegistry();
  }
  return instance;
}
