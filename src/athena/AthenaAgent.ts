/**
 * AthenaAgent
 * Business-focused autonomous agent that wraps canvas-cli's AutonomousOrchestrator
 * and layers BusinessMemory on top for persistent business context.
 */

import chalk from 'chalk';
import { EventEmitter } from 'events';
import { getAutonomousOrchestrator } from '../agents/autonomous/index.js';
import { BusinessMemory } from './BusinessMemory.js';

export interface AthenaAgentOptions {
  verbose?: boolean;
  maxSteps?: number;
  onEvent?: (event: AthenaEvent) => void;
}

export interface AthenaEvent {
  type: 'thinking' | 'step' | 'tool_use' | 'complete' | 'error' | 'progress';
  message: string;
  data?: unknown;
}

export class AthenaAgent extends EventEmitter {
  private memory: BusinessMemory;

  constructor() {
    super();
    this.memory = new BusinessMemory();
  }

  async run(goal: string, options: AthenaAgentOptions = {}): Promise<string> {
    const { verbose = false, maxSteps, onEvent } = options;

    const emitEvent = (event: AthenaEvent): void => {
      this.emit(event.type, event);
      onEvent?.(event);
    };

    // 1. Build business context from memory
    emitEvent({ type: 'thinking', message: 'Loading business context from memory...' });
    const systemContext = await this.memory.buildSystemContext();

    if (verbose) {
      console.log(chalk.dim('  [context] Business memory loaded'));
    }

    // 2. Get the autonomous orchestrator
    const orchestratorConfig = maxSteps ? { maxIterations: maxSteps } : {};
    const orchestrator = await getAutonomousOrchestrator(orchestratorConfig);

    // 3. Forward orchestrator events to Athena event format
    const unsubscribe = orchestrator.onEvent((autonomousEvent) => {
      switch (autonomousEvent.type) {
        case 'thinking_started':
        case 'thinking_step':
        case 'thinking_completed':
          emitEvent({ type: 'thinking', message: 'Reasoning about the goal...', data: autonomousEvent });
          break;

        case 'planning_started':
        case 'planning_completed':
          emitEvent({ type: 'progress', message: 'Building execution plan...', data: autonomousEvent });
          break;

        case 'step_started':
          emitEvent({
            type: 'step',
            message: (autonomousEvent as { step?: { description?: string } }).step?.description ?? 'Executing step...',
            data: autonomousEvent,
          });
          break;

        case 'step_completed':
          emitEvent({ type: 'step', message: 'Step complete', data: autonomousEvent });
          break;

        case 'step_failed':
          emitEvent({
            type: 'error',
            message: (autonomousEvent as { error?: { message?: string } }).error?.message ?? 'Step failed',
            data: autonomousEvent,
          });
          break;

        case 'task_completed':
          emitEvent({ type: 'complete', message: 'Task completed', data: autonomousEvent });
          break;

        case 'task_failed':
          emitEvent({
            type: 'error',
            message: (autonomousEvent as { error?: { message?: string } }).error?.message ?? 'Task failed',
            data: autonomousEvent,
          });
          break;

        default:
          emitEvent({ type: 'progress', message: String(autonomousEvent.type), data: autonomousEvent });
      }
    });

    try {
      // 4. Run the orchestrator with the goal + business context injected as codebase state
      let result: Awaited<ReturnType<typeof orchestrator.execute>>;
      try {
        result = await orchestrator.execute(goal, {
          codebaseState: systemContext,
          conversationHistory: [],
          relevantFiles: [],
        });
      } catch (execErr: unknown) {
        const msg = execErr instanceof Error ? execErr.message : String(execErr);
        const isAuthError =
          msg.toLowerCase().includes('api_key') ||
          msg.toLowerCase().includes('api key') ||
          msg.toLowerCase().includes('authentication') ||
          msg.toLowerCase().includes('unauthorized') ||
          msg.toLowerCase().includes('invalid x-api-key') ||
          msg.toLowerCase().includes('anthropic_api_key');

        if (isAuthError) {
          emitEvent({
            type: 'error',
            message: 'No Anthropic API key configured. Run: canvas athena providers to add one.',
          });
          this.emit('error', { message: 'No Anthropic API key configured. Run: canvas athena providers to add one.' });
          throw new Error('No Anthropic API key configured. Run: canvas athena providers to add one.');
        }
        throw execErr;
      }

      // 5. Store key outcomes to BusinessMemory
      if (result.success && result.output) {
        const summary = typeof result.output === 'string'
          ? result.output.slice(0, 500)
          : JSON.stringify(result.output).slice(0, 500);

        await this.memory.storeFact(
          `Goal completed: "${goal.slice(0, 100)}" — ${summary}`,
          'insight',
          0.7
        );
      }

      // 6. Return final output
      const finalOutput = typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output, null, 2);

      return finalOutput || (result.success ? 'Task completed successfully.' : 'Task did not produce output.');
    } finally {
      unsubscribe();
    }
  }
}
