/**
 * Task Planner - Automatic todo breakdown for complex tasks
 * Similar to Claude Code's task tracking
 */

import chalk from 'chalk';
import { ThemeManager } from '../themes.js';

export interface TaskStep {
  id: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  detail?: string;
}

export class TaskPlanner {
  private steps: TaskStep[] = [];
  private theme: ThemeManager;
  private startTime: number = 0;

  constructor(theme?: ThemeManager) {
    this.theme = theme || new ThemeManager('slate');
  }

  /**
   * Detect if a prompt requires task planning (complex multi-step task)
   */
  static isComplexTask(prompt: string): boolean {
    const lower = prompt.toLowerCase();

    // Keywords indicating multi-step tasks
    const complexIndicators = [
      'build', 'create', 'setup', 'install', 'configure', 'deploy',
      'migrate', 'refactor', 'implement', 'develop', 'make a',
      'and then', 'after that', 'also', 'with',
      'website', 'app', 'application', 'project', 'system',
      'full', 'complete', 'entire'
    ];

    const matchCount = complexIndicators.filter(ind => lower.includes(ind)).length;

    // Consider complex if 2+ indicators or specific patterns
    if (matchCount >= 2) return true;
    if (lower.includes('nuxt') || lower.includes('next') || lower.includes('react')) return true;
    if (lower.includes('folder') && (lower.includes('create') || lower.includes('build'))) return true;
    if (lower.match(/and\s+(make|create|add|build|show)/)) return true;

    return false;
  }

  /**
   * Break down a complex prompt into task steps
   */
  planTasks(prompt: string): TaskStep[] {
    const lower = prompt.toLowerCase();
    this.steps = [];
    let id = 1;

    // Detect folder/directory creation
    const folderMatch = prompt.match(/(?:build|create|make)\s+(?:a\s+)?(\w+)\s+folder/i) ||
                       prompt.match(/folder\s+(?:called|named)\s+(\w+)/i);
    if (folderMatch) {
      this.steps.push({ id: id++, description: `Create ${folderMatch[1]} directory`, status: 'pending' });
    }

    // Detect path references
    const pathMatch = prompt.match(/in\s+(?:the\s+)?(\w+)\s+folder/i) ||
                     prompt.match(/(?:documents|desktop|home)\s+folder/i);
    if (pathMatch && !folderMatch) {
      this.steps.push({ id: id++, description: `Navigate to ${pathMatch[1] || pathMatch[0]}`, status: 'pending' });
    }

    // Detect framework setup (Nuxt, Next, React, etc.)
    if (lower.includes('nuxt')) {
      this.steps.push({ id: id++, description: 'Initialize Nuxt project', status: 'pending' });
      this.steps.push({ id: id++, description: 'Install dependencies', status: 'pending' });
    } else if (lower.includes('next')) {
      this.steps.push({ id: id++, description: 'Initialize Next.js project', status: 'pending' });
      this.steps.push({ id: id++, description: 'Install dependencies', status: 'pending' });
    } else if (lower.includes('react')) {
      this.steps.push({ id: id++, description: 'Initialize React project', status: 'pending' });
      this.steps.push({ id: id++, description: 'Install dependencies', status: 'pending' });
    } else if (lower.includes('vue')) {
      this.steps.push({ id: id++, description: 'Initialize Vue project', status: 'pending' });
      this.steps.push({ id: id++, description: 'Install dependencies', status: 'pending' });
    }

    // Detect file creation
    const fileMatch = prompt.match(/(?:create|make|write|add)\s+(?:a\s+)?(\w+\.?\w*)\s+file/i);
    if (fileMatch) {
      this.steps.push({ id: id++, description: `Create ${fileMatch[1]} file`, status: 'pending' });
    }

    // Detect "hello world" or display content
    if (lower.includes('hello world') || lower.includes('showing') || lower.includes('display')) {
      this.steps.push({ id: id++, description: 'Add content to display', status: 'pending' });
    }

    // Detect website/app specific tasks
    if (lower.includes('website') || lower.includes('web app')) {
      if (!this.steps.some(s => s.description.includes('Initialize'))) {
        this.steps.push({ id: id++, description: 'Set up project structure', status: 'pending' });
      }
      this.steps.push({ id: id++, description: 'Create main page', status: 'pending' });
    }

    // Detect configuration
    if (lower.includes('config') || lower.includes('setup') || lower.includes('configure')) {
      this.steps.push({ id: id++, description: 'Configure project settings', status: 'pending' });
    }

    // Add verification step for complex tasks
    if (this.steps.length > 1) {
      this.steps.push({ id: id++, description: 'Verify setup', status: 'pending' });
    }

    // Fallback for unrecognized but complex tasks
    if (this.steps.length === 0 && TaskPlanner.isComplexTask(prompt)) {
      this.steps.push({ id: id++, description: 'Analyze request', status: 'pending' });
      this.steps.push({ id: id++, description: 'Execute task', status: 'pending' });
      this.steps.push({ id: id++, description: 'Verify result', status: 'pending' });
    }

    return this.steps;
  }

  /**
   * Display the task plan
   */
  display(): void {
    if (this.steps.length === 0) return;

    console.log('');
    console.log(this.theme.dim('  tasks'));

    for (const step of this.steps) {
      const icon = this.getStatusIcon(step.status);
      const text = step.status === 'in_progress'
        ? this.theme.text(step.description)
        : step.status === 'completed'
        ? this.theme.dim(step.description)
        : step.status === 'failed'
        ? this.theme.error(step.description)
        : this.theme.secondary(step.description);

      console.log(`  ${icon} ${text}`);
      if (step.detail) {
        console.log(this.theme.dim(`      ${step.detail}`));
      }
    }
    console.log('');
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: TaskStep['status']): string {
    switch (status) {
      case 'pending': return this.theme.dim('○');
      case 'in_progress': return this.theme.info('◐');
      case 'completed': return this.theme.success('●');
      case 'failed': return this.theme.error('✗');
    }
  }

  /**
   * Start the task execution
   */
  start(): void {
    this.startTime = Date.now();
    if (this.steps.length > 0) {
      this.steps[0].status = 'in_progress';
    }
  }

  /**
   * Mark current step as complete and move to next
   */
  completeCurrentStep(detail?: string): void {
    const current = this.steps.find(s => s.status === 'in_progress');
    if (current) {
      current.status = 'completed';
      if (detail) current.detail = detail;

      // Start next pending step
      const next = this.steps.find(s => s.status === 'pending');
      if (next) {
        next.status = 'in_progress';
      }
    }
  }

  /**
   * Mark current step as failed
   */
  failCurrentStep(error: string): void {
    const current = this.steps.find(s => s.status === 'in_progress');
    if (current) {
      current.status = 'failed';
      current.detail = error;
    }
  }

  /**
   * Update display with current progress (redraws)
   */
  updateDisplay(): void {
    // Move cursor up and redraw
    const lines = this.steps.length + 2; // +2 for header and blank line
    process.stdout.write(`\x1b[${lines}A`); // Move up
    process.stdout.write('\x1b[0J'); // Clear from cursor down
    this.display();
  }

  /**
   * Complete all remaining steps
   */
  completeAll(): void {
    for (const step of this.steps) {
      if (step.status === 'pending' || step.status === 'in_progress') {
        step.status = 'completed';
      }
    }
  }

  /**
   * Get completion summary
   */
  getSummary(): string {
    const completed = this.steps.filter(s => s.status === 'completed').length;
    const failed = this.steps.filter(s => s.status === 'failed').length;
    const total = this.steps.length;
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    if (failed > 0) {
      return `${completed}/${total} completed, ${failed} failed (${elapsed}s)`;
    }
    return `${completed}/${total} completed (${elapsed}s)`;
  }

  /**
   * Check if all steps are done
   */
  isDone(): boolean {
    return this.steps.every(s => s.status === 'completed' || s.status === 'failed');
  }

  /**
   * Get steps list
   */
  getSteps(): TaskStep[] {
    return this.steps;
  }

  /**
   * Set specific step status by description match
   */
  updateStepByKeyword(keyword: string, status: TaskStep['status'], detail?: string): void {
    const step = this.steps.find(s =>
      s.description.toLowerCase().includes(keyword.toLowerCase())
    );
    if (step) {
      step.status = status;
      if (detail) step.detail = detail;
    }
  }
}

// Singleton for current task
let currentPlanner: TaskPlanner | null = null;

export function getTaskPlanner(theme?: ThemeManager): TaskPlanner {
  if (!currentPlanner) {
    currentPlanner = new TaskPlanner(theme);
  }
  return currentPlanner;
}

export function resetTaskPlanner(): void {
  currentPlanner = null;
}
