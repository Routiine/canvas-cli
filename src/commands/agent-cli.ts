/**
 * Agent command - Manage and orchestrate intelligent agents
 */

import { Command } from 'commander';
import { CommandHandler } from '../commands.js';
import { getOrchestrator, executeWorkflow, coordinateGoal } from '../agents/orchestrator.js';

export function createAgentCommand(): Command {
  const agentCommand = new Command('agent')
    .description('Manage and orchestrate intelligent agents')
    .argument('[action]', 'Action: status, execute, workflow, coordinate')
    .argument('[target]', 'Target agent or workflow name')
    .option('-t, --task <task>', 'Task configuration (JSON)')
    .option('-g, --goal <goal>', 'High-level goal for coordination')
    .action(async (action: string = 'status', target?: string, options: any = {}) => {
      const orchestrator = await getOrchestrator();
      const commandHandler = new CommandHandler();
      const theme = commandHandler.getThemeManager();

      switch (action) {
        case 'status':
          const status = orchestrator.getStatus();
          console.log(theme.primary('🎭 Orchestrator Status'));
          console.log(theme.success(`  Agents: ${status.agents.join(', ')}`));
          console.log(theme.info(`  Queue: ${status.queue} | Running: ${status.running} | Completed: ${status.completed}`));
          console.log(theme.dim(`  Workflows: ${status.workflows.join(', ')}`));
          break;

        case 'execute':
          if (!target) {
            console.log(theme.error('Please specify an agent name'));
            return;
          }

          const task = options.task ? JSON.parse(options.task) : { type: 'interactive' };
          console.log(theme.primary(`Executing task with ${target}...`));

          try {
            const result = await orchestrator.executeTask(target, task);
            console.log(theme.success('Task completed'));
            console.log(result);
          } catch (error: any) {
            console.log(theme.error(`Task failed: ${error.message}`));
          }
          break;

        case 'workflow':
          if (!target) {
            console.log(theme.primary('Available workflows:'));
            console.log('  • development - Complete dev environment');
            console.log('  • deployment - Automated deployment pipeline');
            console.log('  • debug - Debug environment with monitoring');
            return;
          }

          console.log(theme.primary(`Executing workflow: ${target}`));
          try {
            const result = await executeWorkflow(target);
            console.log(theme.success(`Workflow ${target} completed`));
            console.log(result);
          } catch (error: any) {
            console.log(theme.error(`Workflow failed: ${error.message}`));
          }
          break;

        case 'coordinate':
          const goal = options.goal || target;
          if (!goal) {
            console.log(theme.error('Please specify a goal with -g or as target'));
            return;
          }

          console.log(theme.primary(`Coordinating agents for: ${goal}`));
          try {
            const result = await coordinateGoal(goal);
            console.log(theme.success('Goal coordination complete'));
            console.log(result);
          } catch (error: any) {
            console.log(theme.error(`Coordination failed: ${error.message}`));
          }
          break;

        default:
          console.log(theme.warning(`Unknown action: ${action}`));
      }
    });

  return agentCommand;
}