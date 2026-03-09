/**
 * Chat command - Main interactive chat functionality
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { CommandHandler } from '../commands.js';
import { generateResponseWithTools, generateChatResponseWithHistory } from '../ollama/response-generator.js';
import { displayWelcome, displaySplash } from '../utils/splash.js';
import { UnifiedBorder } from '../ui/unifiedBorder.js';
import { getHookSystem } from '../hooks/hookSystem.js';
import { getNotificationSystem } from '../hooks/notificationSystem.js';
import { getTranscriptManager } from '../hooks/transcriptManager.js';
import { getOrchestrator, executeWorkflow, coordinateGoal } from '../agents/orchestrator.js';

export function createChatCommand(): Command {
  const config = loadConfig();

  const chatCommand = new Command('chat')
    .description('Start interactive chat session (default command when running "canvas")')
    .argument('[prompt]', 'Optional prompt to send directly')
    .option('-m, --model <model>', `Model to use (default: ${config.defaultModel || config.model || 'auto'})`, config.defaultModel || config.model)
    .action(async (prompt: string | undefined, options: { model: string }) => {
      const commandHandler = new CommandHandler();

      // If prompt provided directly, process it and exit
      if (prompt) {
        await generateResponseWithTools(prompt, options.model, commandHandler, true);
        return;
      }

      // Check if we can interact with the user
      const isInteractive = process.stdin.isTTY === true && !process.env.CI;

      if (!isInteractive) {
        // Read from stdin for piped input
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        const finalPrompt = Buffer.concat(chunks).toString().trim();
        if (!finalPrompt) {
          console.error('No input provided via stdin.');
          process.exit(1);
        }
        await generateResponseWithTools(finalPrompt, options.model, commandHandler, true);
        return;
      }

      // Interactive chat loop
      await runInteractiveChat(options.model, commandHandler);
    });

  return chatCommand;
}

async function runInteractiveChat(model: string, commandHandler: CommandHandler): Promise<void> {
  let executionMode = true;
  const conversationHistory: string[] = [];

  // Populate conversation history from restored session
  const savedMessages = commandHandler.getMessages();
  if (savedMessages && savedMessages.length > 0) {
    console.log(chalk.dim(`  ✓ Loaded ${savedMessages.length} messages from previous session`));
    savedMessages.forEach(msg => {
      if (msg.role === 'user') {
        conversationHistory.push(`User: ${msg.content.substring(0, 300)}`);
      } else if (msg.role === 'assistant') {
        conversationHistory.push(`Canvas CLI: ${msg.content.substring(0, 300)}`);
      }
    });
  }

  // Auto-confirm mode
  const { BaseTool } = await import('../tools/base.js');
  const currentConfig = loadConfig();
  BaseTool.autoConfirmMode = currentConfig.features?.autoExecute ?? false;

  // Initialize hook systems
  const hookSystem = getHookSystem();
  const notificationSystem = getNotificationSystem();
  const transcriptManager = getTranscriptManager();

  await hookSystem.executeHooks('session-start', {
    timestamp: new Date(),
    mode: 'execution'
  });

  displayWelcome();

  let firstPrompt = true;

  while (true) {
    console.log('');

    const border = new UnifiedBorder({ style: 'single', showMode: true, clearScreen: false });
    const message = await border.getBorderedInput('>', true);

    if (firstPrompt) {
      firstPrompt = false;
    }

    const userInput = message?.trim() || '';

    if (!userInput) {
      continue;
    }

    // Execute pre-command hooks
    const hookResult = await hookSystem.executeHooks('pre-command', {
      command: userInput,
      timestamp: new Date(),
      mode: executionMode ? 'execution' : 'planning'
    });

    if (!hookResult.allow) {
      continue;
    }

    // Check for exit
    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      await hookSystem.executeHooks('session-end', {
        timestamp: new Date(),
        session: { endTime: new Date() }
      });

      transcriptManager.dispose();

      await notificationSystem.info('Canvas CLI session ended', {
        desktop: true,
        sound: false
      });

      console.log(chalk.hex('#606060')('\n    goodbye'));
      break;
    }

    // Check for clear command
    if (userInput === '/clear') {
      console.clear();
      displaySplash();
      firstPrompt = true;
      continue;
    }

    // Check for agent commands
    if (userInput.startsWith('/agent')) {
      await handleAgentCommand(userInput);
      continue;
    }

    // Check for execution mode toggle
    if (userInput === '/execute' || userInput === '/exec') {
      executionMode = !executionMode;
      const modeConfig = loadConfig();

      if (executionMode) {
        BaseTool.autoConfirmMode = modeConfig.features?.autoExecute ?? false;
      } else {
        BaseTool.autoConfirmMode = false;
      }

      console.log('');
      console.log(chalk.hex('#303030')('    mode: ' + (executionMode ? 'execution' : 'planning')));
      continue;
    }

    // Handle other / commands
    if (userInput.startsWith('/')) {
      const result = await commandHandler.handleCommand(userInput);
      if (result) {
        console.log(result);
      }
      continue;
    }

    // Add to transcript
    transcriptManager.addEntry({
      role: 'user',
      content: userInput,
      mode: executionMode ? 'execution' : 'planning'
    });

    // Process with AI
    console.log('');
    console.log(chalk.hex('#606060')(executionMode ? '    [exec] processing...' : '    [plan] (use /exec to enable tools)'));

    if (executionMode) {
      const recentHistory = conversationHistory.slice(-10).join('\n');

      const contextualPrompt = `
IMPORTANT: DO NOT RESPOND WITH HTML. Only use plain text or markdown.

CONVERSATION HISTORY (for context):
${recentHistory || '(No previous messages)'}

User's current request: ${userInput}

Remember: If the user refers to files or content from previous messages, use that context to complete the task.`;

      const response = await generateResponseWithTools(contextualPrompt, model, commandHandler, true);

      conversationHistory.push(`User: ${userInput}`);
      conversationHistory.push(`Canvas CLI: ${response.substring(0, 500)}${response.length > 500 ? '...' : ''}`);

      // Cap conversation history to prevent unbounded memory growth
      if (conversationHistory.length > 500) {
        conversationHistory.splice(0, conversationHistory.length - 250);
      }

      await hookSystem.executeHooks('post-command', {
        command: userInput,
        timestamp: new Date(),
        mode: 'execution'
      });

      await hookSystem.executeHooks('completion', {
        command: userInput,
        timestamp: new Date(),
        mode: 'execution'
      });
    } else {
      const response = await generateChatResponseWithHistory(userInput, model, conversationHistory);
      conversationHistory.push(`User: ${userInput}`);
      conversationHistory.push(`Canvas CLI: ${response}`);

      // Cap conversation history to prevent unbounded memory growth
      if (conversationHistory.length > 500) {
        conversationHistory.splice(0, conversationHistory.length - 250);
      }

      transcriptManager.addEntry({
        role: 'assistant',
        content: response,
        mode: 'planning'
      });

      await hookSystem.executeHooks('post-command', {
        command: userInput,
        timestamp: new Date(),
        mode: 'planning'
      });

      await hookSystem.executeHooks('completion', {
        command: userInput,
        timestamp: new Date(),
        mode: 'planning'
      });
    }
    console.log('');
  }
}

async function handleAgentCommand(userInput: string): Promise<void> {
  const parts = userInput.split(' ');

  if (parts[1] === 'workflow' && parts[2]) {
    try {
      console.log(chalk.hex('#808080')(`\nExecuting workflow: ${parts[2]}`));
      await executeWorkflow(parts[2]);
      console.log(chalk.hex('#909090')('Workflow completed'));
    } catch (error: any) {
      console.log(chalk.hex('#707070')(`Workflow failed: ${error.message}`));
    }
  } else if (parts[1] === 'goal' && parts.slice(2).length > 0) {
    const goal = parts.slice(2).join(' ');
    try {
      console.log(chalk.hex('#808080')(`\nCoordinating for goal: ${goal}`));
      await coordinateGoal(goal);
      console.log(chalk.hex('#909090')('Goal achieved'));
    } catch (error: any) {
      console.log(chalk.hex('#707070')(`Goal failed: ${error.message}`));
    }
  } else {
    const orchestrator = await getOrchestrator();
    const status = orchestrator.getStatus();
    console.log(chalk.hex('#808080')('\nAgent System Status'));
    console.log(chalk.hex('#606060')(`  Agents: ${status.agents.length} active`));
    console.log(chalk.hex('#606060')(`  Tasks: ${status.queue} queued, ${status.running} running`));
  }
}