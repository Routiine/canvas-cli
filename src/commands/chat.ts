/**
 * Chat command - Main interactive chat functionality
 */

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { loadConfig } from '../config.js';
import { CommandHandler } from '../commands.js';
import { generateResponseWithTools, generateChatResponseWithHistory } from '../ollama/response-generator.js';
import { displayWelcome, displaySplash } from '../utils/splash.js';
import { UnifiedBorder } from '../ui/unifiedBorder.js';
import { getHookSystem } from '../hooks/hookSystem.js';
import { getNotificationSystem } from '../hooks/notificationSystem.js';
import { getTranscriptManager } from '../hooks/transcriptManager.js';
import { getOrchestrator, executeWorkflow, coordinateGoal } from '../agents/orchestrator.js';
import type { Message } from '../types.js';
import {
  classifyByLearned,
  saveLearnedPattern,
  isCorrectionSignal,
} from './intent-learner.js';

// ---------------------------------------------------------------------------
// Intent Classification — no Athena dependency, runs locally
// ---------------------------------------------------------------------------

type Intent = 'task' | 'executable';

/**
 * Fast pattern-based heuristic. Returns a confident intent or null if
 * the input is ambiguous and needs the LLM fallback.
 */
function classifyByPattern(input: string): Intent | null {
  const t = input.trim().toLowerCase();

  // Explicit shell-like syntax → executable
  const execPatterns = [
    // Shell commands and system tools
    /^(run|execute|exec|start|stop|kill|restart|deploy|install|uninstall|update|upgrade|download|git |npm |npx |yarn |pnpm |pip |docker |kubectl |ssh |curl |wget |ls|cd|mkdir|rm|cp|mv|cat|grep|find|chmod|chown|tar|zip|unzip|ps|top|htop|ping|dig|netstat)\b/,
    // Construction verbs — "build/make/create/write/implement/code/develop X" is ALWAYS an action
    /^(build|make|create|write|implement|code|develop|program|generate|scaffold|setup|set up|spin up|bootstrap)\s+(me\s+|us\s+|a\s+|an\s+|the\s+|my\s+)?/,
    // File/project operations
    /^(save|delete|remove|rename|open|close|read|edit|modify|update|refactor|add|append|insert|replace)\s+(a\s+|the\s+|my\s+)?(file|folder|dir|directory|script|function|class|component|module|route|endpoint|dockerfile|env|config|database|table|schema|repo|branch|pr|issue|commit)\b/,
    /^(show|list|display)\s+(me\s+)?(files|folders|processes|ports|logs|errors|output|results|status)\b/,
    /^(check|test|verify|validate|lint|format)\s+(the\s+)?(code|file|config|build|tests|types)\b/,
    /^(fix|debug|resolve|patch|repair)\s+(the\s+|this\s+|my\s+)?(bug|error|issue|problem|crash|warning|test|code)\b/,
    /^(compile|transpile|bundle|minify|optimize|refactor)\b/,
    // "do X" imperative with action noun
    /^do\s+(a\s+|the\s+)?(build|deploy|test|install|migration|rollback|backup)\b/,
  ];

  for (const pattern of execPatterns) {
    if (pattern.test(t)) return 'executable';
  }

  // Conversational signals → task
  const taskPatterns = [
    /^(what|why|how|when|where|who|which|explain|describe|tell me|can you|could you|would you|should i|is it|are there|does|do you)\b/,
    /^(help|assist|guide|advise|recommend|suggest|think about|analyze|review|understand|learn|teach)\b/,
    /\?$/,  // ends with question mark
    /^(yes|no|ok|sure|thanks|great|good|sounds|i see|got it|makes sense|agree|disagree)\b/,
    /^(what('s| is) (a|the|your|this|that)|tell me about|explain (how|why|what)|give me (an? )?(overview|summary|idea|example))\b/,
  ];

  for (const pattern of taskPatterns) {
    if (pattern.test(t)) return 'task';
  }

  return null; // ambiguous — needs LLM
}

/**
 * LLM-based fallback for ambiguous inputs. Single short call to local Ollama.
 * Returns 'task' or 'executable'.
 */
async function classifyByLLM(input: string, model: string): Promise<Intent> {
  try {
    const config = loadConfig();
    const baseUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
    const prompt = `You are an intent classifier. Respond with ONLY one word: "task" or "executable".

"executable" = the user wants something BUILT or DONE: write code, create files, run commands, implement features, build apps, fix bugs, edit code, execute anything.
"task" = the user wants to TALK: ask questions, get explanations, discuss ideas, seek advice.

RULE: Any request containing build/make/create/write/implement/code/develop/fix/run = executable, even if it sounds creative (e.g. "build a snake game" = executable).

Examples:
- "build a snake game" → executable
- "make a todo app" → executable
- "write a sorting function" → executable
- "implement auth" → executable
- "what is a snake game" → task
- "how does sorting work" → task
- "explain promises" → task

Input: ${input}
Answer:`;

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0, num_predict: 5 } }),
    });

    if (!res.ok) return 'executable';
    const data = await res.json() as { response?: string };
    const result = (data.response || '').trim().toLowerCase();
    return result.startsWith('exec') ? 'executable' : 'task';
  } catch {
    return 'executable'; // safe default — tools available if needed
  }
}

/**
 * Classify user input without any Athena or external API dependency.
 *
 * Order of priority:
 *   1. Learned patterns (fuzzy match — user-corrected history)
 *   2. Fast regex patterns (deterministic)
 *   3. Local LLM fallback (for genuinely ambiguous inputs)
 */
async function classifyIntent(input: string, model: string): Promise<{ intent: Intent; source: string }> {
  // 1. Check user-corrected learned patterns first
  const learned = classifyByLearned(input);
  if (learned) {
    return { intent: learned.intent, source: `learned(${Math.round(learned.score * 100)}%)` };
  }

  // 2. Fast pattern match
  const fast = classifyByPattern(input);
  if (fast !== null) {
    return { intent: fast, source: 'pattern' };
  }

  // 3. LLM fallback
  const llm = await classifyByLLM(input, model);
  return { intent: llm, source: 'llm' };
}

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
  let manualModeOverride: Intent | null = null;
  const conversationHistory: string[] = [];

  // Correction tracking — remembers last classified input so corrections can be learned
  let lastInput = '';
  let lastIntent: Intent | null = null;

  // ── Auto-resume: offer to restore last session if recent (< 4 hours) ──────
  const checkpointManager = commandHandler.getCheckpointManager();
  const autosave = await checkpointManager.loadAutoSave();
  if (autosave && autosave.messages && autosave.messages.length > 0) {
    const age = Date.now() - new Date(autosave.timestamp).getTime();
    const FOUR_HOURS = 4 * 60 * 60 * 1000;

    if (age < FOUR_HOURS) {
      const ageMin = Math.round(age / 60000);
      const firstUser = autosave.messages.find((m: Message) => m.role === 'user');
      const preview = firstUser ? firstUser.content.substring(0, 60) : '';

      process.stdout.write(
        chalk.hex('#444')(`  session from ${ageMin}m ago — "${preview}${preview.length >= 60 ? '...' : ''}" — resume? [Y/n] `)
      );

      const answer = await new Promise<string>(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
        // For TTY we just read one keypress
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
          process.stdin.once('data', (buf) => {
            process.stdin.setRawMode(false);
            rl.close();
            resolve(buf.toString().toLowerCase());
          });
        } else {
          rl.question('', (ans) => { rl.close(); resolve(ans.toLowerCase()); });
        }
      });

      if (answer !== 'n' && answer !== 'no') {
        // Splice saved messages into CommandHandler's message array
        const msgs = commandHandler.getMessages();
        msgs.length = 0;
        msgs.push(...autosave.messages);
        process.stdout.write('\n');
        console.log(chalk.dim(`  ✓ resumed — ${autosave.messages.length} messages loaded`));
      } else {
        process.stdout.write('\n');
      }
    }
  }

  // Populate conversationHistory summaries from whatever messages are now loaded
  const savedMessages = commandHandler.getMessages();
  if (savedMessages && savedMessages.length > 0) {
    savedMessages.forEach(msg => {
      if (msg.role === 'user') {
        conversationHistory.push(`User: ${msg.content.substring(0, 300)}`);
      } else if (msg.role === 'assistant') {
        conversationHistory.push(`Canvas CLI: ${msg.content.substring(0, 300)}`);
      }
    });
  }

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
      mode: 'execution'
    });

    if (!hookResult.allow) {
      continue;
    }

    // Check for exit
    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      // Persist final state synchronously before teardown (bypasses debounce)
      const finalMessages = commandHandler.getMessages();
      if (finalMessages.length > 0) {
        await checkpointManager.flushAutoSave(finalMessages).catch(() => {});
      }

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

    // Manual mode override (/exec forces executable, /plan forces task)
    if (userInput === '/execute' || userInput === '/exec') {
      manualModeOverride = manualModeOverride === 'executable' ? null : 'executable';
      BaseTool.autoConfirmMode = manualModeOverride === 'executable'
        ? (loadConfig().features?.autoExecute ?? false)
        : false;
      console.log('');
      console.log(chalk.hex('#303030')('    mode override: ' + (manualModeOverride === 'executable' ? 'always executable' : 'auto-detect')));
      continue;
    }
    if (userInput === '/plan') {
      manualModeOverride = manualModeOverride === 'task' ? null : 'task';
      BaseTool.autoConfirmMode = false;
      console.log('');
      console.log(chalk.hex('#303030')('    mode override: ' + (manualModeOverride === 'task' ? 'always task' : 'auto-detect')));
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

    // Add to transcript (mode resolved after classification below)
    transcriptManager.addEntry({
      role: 'user',
      content: userInput,
      mode: 'execution'
    });

    // Check if this is a correction for the previous misclassification
    if (lastInput && lastIntent && isCorrectionSignal(userInput)) {
      const corrected: Intent = lastIntent === 'executable' ? 'task' : 'executable';
      saveLearnedPattern(lastInput, corrected);
      console.log('');
      console.log(chalk.hex('#444')(`    noted — "${lastInput.substring(0, 40)}" → ${corrected} (saved)`));
      console.log(chalk.hex('#444')('    re-running with correct intent...'));
      console.log('');

      // Re-run the last input with the corrected intent
      const recentHistory = conversationHistory.slice(-10).join('\n');
      if (corrected === 'executable') {
        const contextualPrompt = `IMPORTANT: DO NOT RESPOND WITH HTML. Only use plain text or markdown.\n\nCONVERSATION HISTORY:\n${recentHistory || '(none)'}\n\nUser's request: ${lastInput}`;
        await generateResponseWithTools(contextualPrompt, model, commandHandler, true);
      } else {
        await generateChatResponseWithHistory(lastInput, model, conversationHistory);
      }
      lastInput = '';
      lastIntent = null;
      continue;
    }

    // Classify intent — no Athena, no external API, works standalone
    const { intent, source } = manualModeOverride
      ? { intent: manualModeOverride, source: 'override' }
      : await classifyIntent(userInput, model);
    const isExecutable = intent === 'executable';

    // Track for potential correction on next message
    lastInput = userInput;
    lastIntent = intent;

    // Process with AI
    console.log('');
    console.log(chalk.hex('#606060')(
      isExecutable
        ? `    [exec] running... ${source !== 'pattern' ? chalk.hex('#333')(`(${source})`) : ''}`
        : `    [task] thinking... ${source !== 'pattern' ? chalk.hex('#333')(`(${source})`) : ''}`
    ));

    if (isExecutable) {
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

      if (conversationHistory.length > 500) {
        conversationHistory.splice(0, conversationHistory.length - 250);
      }

      // Auto-save after each executable exchange
      void checkpointManager.autoSave(commandHandler.getMessages());

      await hookSystem.executeHooks('post-command', { command: userInput, timestamp: new Date(), mode: 'execution' });
      await hookSystem.executeHooks('completion',   { command: userInput, timestamp: new Date(), mode: 'execution' });

    } else {
      const response = await generateChatResponseWithHistory(userInput, model, conversationHistory);
      conversationHistory.push(`User: ${userInput}`);
      conversationHistory.push(`Canvas CLI: ${response}`);

      if (conversationHistory.length > 500) {
        conversationHistory.splice(0, conversationHistory.length - 250);
      }

      transcriptManager.addEntry({ role: 'assistant', content: response, mode: 'planning' });

      // Auto-save after each task/chat exchange too
      void checkpointManager.autoSave(commandHandler.getMessages());

      await hookSystem.executeHooks('post-command', { command: userInput, timestamp: new Date(), mode: 'planning' });
      await hookSystem.executeHooks('completion',   { command: userInput, timestamp: new Date(), mode: 'planning' });
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
    } catch (error: unknown) {
      console.log(chalk.hex('#707070')(`Workflow failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  } else if (parts[1] === 'goal' && parts.slice(2).length > 0) {
    const goal = parts.slice(2).join(' ');
    try {
      console.log(chalk.hex('#808080')(`\nCoordinating for goal: ${goal}`));
      await coordinateGoal(goal);
      console.log(chalk.hex('#909090')('Goal achieved'));
    } catch (error: unknown) {
      console.log(chalk.hex('#707070')(`Goal failed: ${error instanceof Error ? error.message : String(error)}`));
    }
  } else {
    const orchestrator = await getOrchestrator();
    const status = orchestrator.getStatus();
    console.log(chalk.hex('#808080')('\nAgent System Status'));
    console.log(chalk.hex('#606060')(`  Agents: ${status.agents.length} active`));
    console.log(chalk.hex('#606060')(`  Tasks: ${status.queue} queued, ${status.running} running`));
  }
}