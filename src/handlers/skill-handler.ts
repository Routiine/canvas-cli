/**
 * Skill handler - Skill management command handling
 */

import inquirer from 'inquirer';
import type { ThemeManager } from '../themes.js';
import { getSkillSystem } from '../skills/skillSystem.js';

export class SkillHandler {
  constructor(private themeManager: ThemeManager) {}

  async handleCommand(args: string): Promise<string> {
    const [subCommand, ...rest] = args.split(' ');
    const skillName = rest[0];
    const skillSystem = getSkillSystem();

    switch (subCommand) {
      case '':
      case 'list':
      case 'ls':
        return skillSystem.formatSkillList();

      case 'show':
      case 'view':
        if (!skillName) {
          return this.themeManager.error('Usage: /skill show <skill-name>');
        }
        const skill = skillSystem.getSkill(skillName);
        if (!skill) {
          return this.themeManager.error(`Skill not found: ${skillName}`);
        }
        let output = this.themeManager.primary(`Skill: ${skill.name}\n\n`);
        output += this.themeManager.secondary('Description: ') + skill.description + '\n';
        output += this.themeManager.secondary('Triggers: ') + skill.triggers.join(', ') + '\n';
        output += this.themeManager.secondary('Source: ') + skill.source + '\n';
        output += this.themeManager.secondary('File: ') + skill.filePath + '\n\n';
        output += this.themeManager.secondary('Content:\n') + this.themeManager.dim(skill.content);
        return output;

      case 'create':
      case 'new':
        return await this.createSkill(skillName, rest);

      case 'delete':
      case 'rm':
      case 'remove':
        return await this.deleteSkill(skillName);

      case 'reload':
      case 'refresh':
        await skillSystem.loadAllSkills();
        return this.themeManager.success('Skills reloaded');

      case 'paths':
      case 'dirs':
        const paths = skillSystem.getSkillPaths();
        return this.themeManager.primary('Skill Directories:\n') +
          this.themeManager.secondary('  Global: ') + paths.global + '\n' +
          this.themeManager.secondary('  Project: ') + paths.project;

      case 'help':
      case '?':
        return this.showHelp();

      default:
        return this.themeManager.error(`Unknown skill command: ${subCommand}\n` +
          'Use /skill help for available commands');
    }
  }

  private async createSkill(skillName: string, rest: string[]): Promise<string> {
    if (!skillName) {
      return this.themeManager.error('Usage: /skill create <skill-name> [--global]');
    }
    const isGlobal = rest.includes('--global') || rest.includes('-g');
    const skillSystem = getSkillSystem();

    const { description } = await inquirer.prompt({
      type: 'input',
      name: 'description',
      message: 'Skill description:',
      default: `Skill for ${skillName}`
    });

    const { triggersInput } = await inquirer.prompt({
      type: 'input',
      name: 'triggersInput',
      message: 'Triggers (comma-separated keywords):',
      default: skillName.replace(/-/g, ' ')
    });

    const { content } = await inquirer.prompt({
      type: 'editor',
      name: 'content',
      message: 'Skill content (opens editor):',
      default: `# ${skillName}\n\nInstructions for the AI when this skill is triggered...\n`
    });

    const triggers = triggersInput.split(',').map((t: string) => t.trim().toLowerCase());
    const filePath = await skillSystem.createSkill(skillName, description, triggers, content, isGlobal);
    return this.themeManager.success(`Created skill: ${skillName}\nFile: ${filePath}`);
  }

  private async deleteSkill(skillName: string): Promise<string> {
    if (!skillName) {
      return this.themeManager.error('Usage: /skill delete <skill-name>');
    }

    const { confirm } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirm',
      message: `Delete skill '${skillName}'?`,
      default: false
    });

    if (confirm) {
      const skillSystem = getSkillSystem();
      const deleted = await skillSystem.deleteSkill(skillName);
      if (deleted) {
        return this.themeManager.success(`Deleted skill: ${skillName}`);
      }
      return this.themeManager.error(`Skill not found: ${skillName}`);
    }
    return this.themeManager.dim('Cancelled');
  }

  private showHelp(): string {
    return this.themeManager.primary('Skill Commands:\n\n') +
      `  ${this.themeManager.secondary('/skill list')}        ${this.themeManager.dim('List all loaded skills')}\n` +
      `  ${this.themeManager.secondary('/skill show')}        ${this.themeManager.dim('Show skill details')}\n` +
      `  ${this.themeManager.secondary('/skill create')}      ${this.themeManager.dim('Create a new skill')}\n` +
      `  ${this.themeManager.secondary('/skill delete')}      ${this.themeManager.dim('Delete a skill')}\n` +
      `  ${this.themeManager.secondary('/skill reload')}      ${this.themeManager.dim('Reload all skills')}\n` +
      `  ${this.themeManager.secondary('/skill paths')}       ${this.themeManager.dim('Show skill directories')}\n\n` +
      this.themeManager.dim('Skills are markdown files that teach the AI how to handle specific tasks.\n' +
        'They are automatically activated when your input matches their triggers.');
  }
}