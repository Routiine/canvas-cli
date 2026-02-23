/**
 * Workflow handler - Workflow command handling
 */

import type { ThemeManager } from '../themes.js';
import type { WorkflowEngine } from '../tools/workflows.js';

export class WorkflowHandler {
  constructor(
    private themeManager: ThemeManager,
    private workflowEngine: WorkflowEngine
  ) {}

  async handleCommand(args: string): Promise<string> {
    const [action, ...params] = args.split(' ');

    if (action === 'list') {
      const workflows = this.workflowEngine.listWorkflows();
      let output = this.themeManager.primary('Available Workflows:\n');
      workflows.forEach((wf: any) => {
        output += this.themeManager.success(`  ${wf.name}: `) +
          this.themeManager.dim(wf.description) + '\n';
      });
      return output;
    }

    if (action === 'run') {
      const workflowName = params[0];
      if (!workflowName) {
        return this.themeManager.error('Usage: /workflow run <name>');
      }

      try {
        await this.workflowEngine.executeWorkflow(workflowName);
        return this.themeManager.success(`Workflow '${workflowName}' completed`);
      } catch (error: any) {
        return this.themeManager.error(`Workflow failed: ${error.message}`);
      }
    }

    return this.themeManager.warning('Usage: /workflow [list|run <name>]');
  }
}