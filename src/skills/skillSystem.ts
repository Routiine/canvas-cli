/**
 * Canvas CLI Skills System
 *
 * Skills are markdown-based guides that teach Canvas CLI how to handle specific tasks.
 * Unlike slash commands, skills are invoked via natural language - the AI decides when to use them.
 *
 * Skills can be:
 * - Global: ~/.config/canvas-cli/skills/
 * - Project: .canvas/skills/
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

export interface Skill {
  name: string;
  description: string;
  triggers: string[];  // Keywords/phrases that trigger this skill
  content: string;     // The full markdown content
  source: 'global' | 'project';
  filePath: string;
}

export interface SkillMatch {
  skill: Skill;
  confidence: number;  // 0-1 confidence score
  matchedTriggers: string[];
}

export class SkillSystem {
  private skills: Map<string, Skill> = new Map();
  private globalSkillsPath: string;
  private projectSkillsPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.globalSkillsPath = path.join(os.homedir(), '.config', 'canvas-cli', 'skills');
    this.projectSkillsPath = path.join(projectRoot, '.canvas', 'skills');
  }

  /**
   * Initialize the skill system and load all skills
   */
  async initialize(): Promise<void> {
    await this.ensureSkillDirectories();
    await this.loadAllSkills();
  }

  /**
   * Ensure skill directories exist
   */
  private async ensureSkillDirectories(): Promise<void> {
    await fs.ensureDir(this.globalSkillsPath);
    // Project skills dir is optional - only create if .canvas exists
    const canvasDir = path.dirname(this.projectSkillsPath);
    if (await fs.pathExists(canvasDir)) {
      await fs.ensureDir(this.projectSkillsPath);
    }
  }

  /**
   * Load all skills from global and project directories
   */
  async loadAllSkills(): Promise<void> {
    this.skills.clear();

    // Load global skills
    await this.loadSkillsFromDirectory(this.globalSkillsPath, 'global');

    // Load project skills (override global if same name)
    if (await fs.pathExists(this.projectSkillsPath)) {
      await this.loadSkillsFromDirectory(this.projectSkillsPath, 'project');
    }
  }

  /**
   * Load skills from a directory
   */
  private async loadSkillsFromDirectory(dirPath: string, source: 'global' | 'project'): Promise<void> {
    if (!await fs.pathExists(dirPath)) return;

    const files = await fs.readdir(dirPath);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const file of mdFiles) {
      const filePath = path.join(dirPath, file);
      const skill = await this.parseSkillFile(filePath, source);
      if (skill) {
        this.skills.set(skill.name, skill);
      }
    }
  }

  /**
   * Parse a skill markdown file
   *
   * Expected format:
   * ---
   * name: skill-name
   * description: What this skill does
   * triggers: keyword1, keyword2, phrase with spaces
   * ---
   *
   * # Skill Content
   * Instructions for the AI...
   */
  private async parseSkillFile(filePath: string, source: 'global' | 'project'): Promise<Skill | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

      if (!frontmatterMatch) {
        // No frontmatter - use filename as name
        const name = path.basename(filePath, '.md');
        return {
          name,
          description: `Skill: ${name}`,
          triggers: [name.replace(/-/g, ' ')],
          content: content,
          source,
          filePath
        };
      }

      const [, frontmatter, body] = frontmatterMatch;
      const metadata: Record<string, string> = {};

      for (const line of frontmatter.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();
          metadata[key] = value;
        }
      }

      const name = metadata.name || path.basename(filePath, '.md');
      const triggers = metadata.triggers
        ? metadata.triggers.split(',').map(t => t.trim().toLowerCase())
        : [name.replace(/-/g, ' ')];

      return {
        name,
        description: metadata.description || `Skill: ${name}`,
        triggers,
        content: body.trim(),
        source,
        filePath
      };
    } catch (error) {
      console.error(chalk.yellow(`Warning: Could not parse skill file: ${filePath}`));
      return null;
    }
  }

  /**
   * Find skills that match a user's input
   */
  findMatchingSkills(userInput: string, maxResults: number = 3): SkillMatch[] {
    const inputLower = userInput.toLowerCase();
    const matches: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      const matchedTriggers: string[] = [];
      let totalScore = 0;

      for (const trigger of skill.triggers) {
        if (inputLower.includes(trigger)) {
          matchedTriggers.push(trigger);
          // Longer triggers = higher confidence
          totalScore += trigger.length / inputLower.length;
        }
      }

      if (matchedTriggers.length > 0) {
        // Normalize confidence to 0-1
        const confidence = Math.min(1, totalScore / matchedTriggers.length);
        matches.push({ skill, confidence, matchedTriggers });
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches.slice(0, maxResults);
  }

  /**
   * Get skill content to inject into AI prompt
   */
  getSkillContext(userInput: string): string {
    const matches = this.findMatchingSkills(userInput, 2);

    if (matches.length === 0) return '';

    let context = '\n\n--- RELEVANT SKILLS ---\n';
    context += 'The following skills may help with this request:\n\n';

    for (const match of matches) {
      context += `### Skill: ${match.skill.name}\n`;
      context += `${match.skill.description}\n\n`;
      context += `${match.skill.content}\n\n`;
    }

    context += '--- END SKILLS ---\n';
    return context;
  }

  /**
   * Get all loaded skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get a specific skill by name
   */
  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  /**
   * Create a new skill
   */
  async createSkill(
    name: string,
    description: string,
    triggers: string[],
    content: string,
    global: boolean = false
  ): Promise<string> {
    const dir = global ? this.globalSkillsPath : this.projectSkillsPath;
    await fs.ensureDir(dir);

    const fileName = `${name.replace(/\s+/g, '-').toLowerCase()}.md`;
    const filePath = path.join(dir, fileName);

    const skillContent = `---
name: ${name}
description: ${description}
triggers: ${triggers.join(', ')}
---

${content}
`;

    await fs.writeFile(filePath, skillContent);
    await this.loadAllSkills(); // Reload to include new skill

    return filePath;
  }

  /**
   * Delete a skill
   */
  async deleteSkill(name: string): Promise<boolean> {
    const skill = this.skills.get(name);
    if (!skill) return false;

    await fs.remove(skill.filePath);
    this.skills.delete(name);
    return true;
  }

  /**
   * List skills in a formatted way
   */
  formatSkillList(): string {
    const skills = this.getAllSkills();

    if (skills.length === 0) {
      return chalk.gray('No skills loaded. Create skills in:\n') +
        chalk.dim(`  Global: ${this.globalSkillsPath}\n`) +
        chalk.dim(`  Project: ${this.projectSkillsPath}`);
    }

    let output = chalk.bold('Loaded Skills:\n\n');

    const globalSkills = skills.filter(s => s.source === 'global');
    const projectSkills = skills.filter(s => s.source === 'project');

    if (globalSkills.length > 0) {
      output += chalk.cyan('Global Skills:\n');
      for (const skill of globalSkills) {
        output += `  ${chalk.green(skill.name)} - ${chalk.gray(skill.description)}\n`;
        output += `    ${chalk.dim('Triggers:')} ${skill.triggers.join(', ')}\n`;
      }
    }

    if (projectSkills.length > 0) {
      output += chalk.cyan('\nProject Skills:\n');
      for (const skill of projectSkills) {
        output += `  ${chalk.green(skill.name)} - ${chalk.gray(skill.description)}\n`;
        output += `    ${chalk.dim('Triggers:')} ${skill.triggers.join(', ')}\n`;
      }
    }

    return output;
  }

  /**
   * Get skill directories info
   */
  getSkillPaths(): { global: string; project: string } {
    return {
      global: this.globalSkillsPath,
      project: this.projectSkillsPath
    };
  }
}

// Singleton instance
let skillSystemInstance: SkillSystem | null = null;

export function getSkillSystem(projectRoot?: string): SkillSystem {
  if (!skillSystemInstance) {
    skillSystemInstance = new SkillSystem(projectRoot);
  }
  return skillSystemInstance;
}

export async function initializeSkillSystem(projectRoot?: string): Promise<SkillSystem> {
  const system = getSkillSystem(projectRoot);
  await system.initialize();
  return system;
}
