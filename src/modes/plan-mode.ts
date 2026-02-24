/**
 * Plan Mode
 * Shows what changes would be made without executing them.
 * Collects all planned actions and presents them for batch approval.
 *
 * Usage: canvas chat --plan
 */

import { EventEmitter } from 'events';

export interface PlannedAction {
  tool: string;
  description: string;
  params: Record<string, any>;
  filePath?: string;
  risk: 'low' | 'medium' | 'high';
}

export interface PlanResult {
  actions: PlannedAction[];
  approved: boolean;
  executedCount: number;
}

export class PlanMode extends EventEmitter {
  private actions: PlannedAction[] = [];
  private active = false;

  /**
   * Enter plan mode — tools are intercepted rather than executed
   */
  activate(): void {
    this.active = true;
    this.actions = [];
    this.emit('activated');
  }

  /**
   * Check if plan mode is active
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Record a planned action (instead of executing it)
   */
  recordAction(action: PlannedAction): void {
    this.actions.push(action);
    this.emit('action-recorded', action);
  }

  /**
   * Get the current plan
   */
  getPlan(): PlannedAction[] {
    return [...this.actions];
  }

  /**
   * Get a human-readable summary of the plan
   */
  getSummary(): string {
    if (this.actions.length === 0) return 'No actions planned.';

    const lines: string[] = ['Plan Summary:', ''];
    for (let i = 0; i < this.actions.length; i++) {
      const action = this.actions[i];
      const riskLabel = action.risk === 'high' ? '[HIGH]' : action.risk === 'medium' ? '[MED]' : '[LOW]';
      lines.push(`  ${i + 1}. ${riskLabel} ${action.description}`);
      if (action.filePath) {
        lines.push(`     File: ${action.filePath}`);
      }
    }

    const highRisk = this.actions.filter(a => a.risk === 'high').length;
    lines.push('');
    lines.push(`Total: ${this.actions.length} actions (${highRisk} high-risk)`);

    return lines.join('\n');
  }

  /**
   * Classify risk level for a tool action
   */
  static classifyRisk(tool: string, params?: Record<string, any>): 'low' | 'medium' | 'high' {
    const highRiskTools = ['shell_exec', 'git_push', 'git_reset', 'file_delete'];
    const mediumRiskTools = ['file_write', 'file_edit', 'git_commit', 'git_checkout'];

    if (highRiskTools.some(t => tool.startsWith(t))) return 'high';
    if (mediumRiskTools.some(t => tool.startsWith(t))) return 'medium';

    // Check for dangerous shell commands
    if (tool === 'shell_exec' && params?.command) {
      const cmd = params.command as string;
      if (/rm\s+-rf|--force|reset --hard|push --force/i.test(cmd)) return 'high';
    }

    return 'low';
  }

  /**
   * Deactivate plan mode
   */
  deactivate(): void {
    this.active = false;
    this.emit('deactivated');
  }

  /**
   * Clear the plan
   */
  clear(): void {
    this.actions = [];
  }
}

let planModeInstance: PlanMode | null = null;

export function getPlanMode(): PlanMode {
  if (!planModeInstance) {
    planModeInstance = new PlanMode();
  }
  return planModeInstance;
}
