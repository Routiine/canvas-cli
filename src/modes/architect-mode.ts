/**
 * Architect Mode (Dual-Model)
 * A lead model (larger, more capable) plans and reviews,
 * while a worker model (faster, cheaper) executes edits.
 *
 * Usage: canvas chat --architect
 */

import { EventEmitter } from 'events';

export interface ArchitectConfig {
  leadModel: string;
  workerModel: string;
  leadProvider?: string;
  workerProvider?: string;
}

export interface ArchitectPlan {
  summary: string;
  steps: ArchitectStep[];
  createdAt: Date;
}

export interface ArchitectStep {
  description: string;
  type: 'edit' | 'create' | 'delete' | 'shell' | 'test';
  filePath?: string;
  instruction: string;
  completed: boolean;
}

export class ArchitectMode extends EventEmitter {
  private active = false;
  private config: ArchitectConfig;
  private currentPlan: ArchitectPlan | null = null;

  constructor(config: ArchitectConfig) {
    super();
    this.config = config;
  }

  activate(): void {
    this.active = true;
    this.emit('activated', this.config);
  }

  deactivate(): void {
    this.active = false;
    this.currentPlan = null;
    this.emit('deactivated');
  }

  isActive(): boolean {
    return this.active;
  }

  getConfig(): ArchitectConfig {
    return { ...this.config };
  }

  /**
   * Set the current plan from the lead model's output
   */
  setPlan(plan: ArchitectPlan): void {
    this.currentPlan = plan;
    this.emit('plan-set', plan);
  }

  /**
   * Get the current plan
   */
  getPlan(): ArchitectPlan | null {
    return this.currentPlan;
  }

  /**
   * Mark a step as completed
   */
  completeStep(index: number): void {
    if (this.currentPlan && index < this.currentPlan.steps.length) {
      this.currentPlan.steps[index].completed = true;
      this.emit('step-completed', index);
    }
  }

  /**
   * Get remaining (uncompleted) steps
   */
  getRemainingSteps(): ArchitectStep[] {
    if (!this.currentPlan) return [];
    return this.currentPlan.steps.filter(s => !s.completed);
  }

  /**
   * Generate a system prompt for the lead model
   */
  getLeadSystemPrompt(): string {
    return [
      'You are the Architect — a senior software engineer who plans changes.',
      'Analyze the request and create a detailed plan with specific steps.',
      'Each step should specify: what to do, which file, and the exact change.',
      'Do NOT make edits yourself. Output a structured plan for the worker model.',
      'Format each step as: [type] file_path: instruction',
      'Types: [edit], [create], [delete], [shell], [test]',
    ].join('\n');
  }

  /**
   * Generate a system prompt for the worker model
   */
  getWorkerSystemPrompt(step: ArchitectStep): string {
    return [
      'You are the Worker — you execute specific code changes as instructed.',
      'Follow the instruction exactly. Make minimal, focused changes.',
      `Current task: ${step.description}`,
      step.filePath ? `Target file: ${step.filePath}` : '',
      `Instruction: ${step.instruction}`,
    ].filter(Boolean).join('\n');
  }

  /**
   * Parse a plan from the lead model's text output
   */
  static parsePlan(text: string): ArchitectPlan {
    const steps: ArchitectStep[] = [];
    const lines = text.split('\n');

    // Extract summary (first paragraph)
    const summaryLines: string[] = [];
    let i = 0;
    while (i < lines.length && lines[i].trim()) {
      summaryLines.push(lines[i].trim());
      i++;
    }

    // Parse steps
    const stepPattern = /\[(edit|create|delete|shell|test)\]\s*([^:]*)?:?\s*(.*)/i;
    for (; i < lines.length; i++) {
      const match = lines[i].match(stepPattern);
      if (match) {
        steps.push({
          type: match[1].toLowerCase() as ArchitectStep['type'],
          filePath: match[2]?.trim() || undefined,
          description: match[3]?.trim() || lines[i].trim(),
          instruction: match[3]?.trim() || lines[i].trim(),
          completed: false,
        });
      }
    }

    return {
      summary: summaryLines.join(' ') || 'Plan',
      steps,
      createdAt: new Date(),
    };
  }
}
