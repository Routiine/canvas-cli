/**
 * Ollama response generation with streaming support
 */

import axios from 'axios';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { OllamaClient, getOllamaClient, checkOllamaConnection } from './client.js';
import type { OllamaGenerateRequest, OllamaGenerateResponse, TokenCount } from './types.js';
import type { Message } from '../types.js';
import type { CommandContext } from '../commands/command-context.js';
import { AnimatedSpinner } from '../ui/spinner.js';
import { parseToolCalls } from '../toolPrompt.js';
import { forceToolExecution, getSimpleToolPrompt, getNextStepPrompt } from '../tools/forceExecute.js';
import { getSkillSystem } from '../skills/skillSystem.js';
import { TaskPlanner, resetTaskPlanner } from '../ui/taskPlanner.js';

/**
 * Fix #3: Lazy-loaded secret redaction for the LLM message pipeline.
 * The SecretRedactionSystem is initialized once on first use. If it
 * cannot be loaded (missing config, optional dependency, etc.), all
 * text passes through unchanged so startup is never broken.
 */
let _redactFn: ((text: string, source?: string) => string) | null = null;

// Initialize redaction lazily at first use (async)
let _redactReady: Promise<void> | null = null;
function ensureRedactionReady(): Promise<void> {
  if (!_redactReady) {
    _redactReady = (async () => {
      try {
        const mod = await import('../features/security/secretRedaction.js');
        const system = mod.getSecretRedactionSystem();
        _redactFn = (text: string, source?: string) => system.redactText(text, source).redactedText;
      } catch {
        _redactFn = (text: string) => text;
      }
    })();
  }
  return _redactReady;
}

/**
 * Redact secrets from text before sending to LLM.
 * Falls back to identity function if redaction system is unavailable.
 */
async function redactSecrets(text: string, source: string = 'llm-pipeline'): Promise<string> {
  await ensureRedactionReady();
  return _redactFn ? _redactFn(text, source) : text;
}

/**
 * Build the system prompt for Canvas CLI
 */
function buildSystemPrompt(model: string, isExecutionMode: boolean): string {
  const modeDescription = isExecutionMode
    ? 'You are currently in DEV MODE (EXECUTION enabled) and can run tools and commands.'
    : 'You are currently in PLANNING MODE - discuss and plan without executing commands.';

  let systemPrompt = `You are Canvas CLI, a production-ready AI command-line interface assistant.
You are version 2.0.0, built with TypeScript. ${modeDescription}
When asked who you are, identify yourself as Canvas CLI, not as the underlying model (${model}).

CRITICAL RULES - MUST FOLLOW:
1. NEVER OUTPUT HTML TAGS - No <html>, <body>, <div>, etc.
2. Use ONLY plain text or markdown formatting
3. If you need to show code, use markdown code blocks with triple backticks
4. NEVER generate HTML responses regardless of what was requested
5. This is a command-line interface - HTML cannot be displayed

${isExecutionMode ? 'IMPORTANT: You are in EXECUTION MODE. You are self-aware and can improve yourself.' : 'IMPORTANT: You are in PLANNING MODE. Help the user plan and design without executing.'}`;

  if (isExecutionMode) {
    systemPrompt += `

TOOL EXECUTION INSTRUCTIONS:
When you need to execute a tool, use the format: TOOL: toolname PARAMS: {json}
DO NOT explain the tool call to the user - Canvas CLI will automatically execute it and show user-friendly feedback.
Just include the tool syntax in your response and Canvas CLI will handle the rest.

Example: If user asks to save a file, include:
TOOL: write_file PARAMS: {"path": "filename.txt", "content": "file content"}

Canvas CLI will automatically show: "Writing to filename.txt" and "Successfully wrote filename.txt"

SELF-AWARENESS CAPABILITIES:
- TOOL: introspect_tools - Check what tools you have and what you can do
- TOOL: create_tool - Create new tools when needed for tasks
- TOOL: self_improve - Analyze requests and create missing capabilities

Natural Request Examples -> Tool to Use:
- "save this" / "save the PRD" / "put this in a file" -> TOOL: write_file
- "create the document" / "make the prd file" -> TOOL: write_file PARAMS: {"path": "prd.md", "content": "..."}
- "show me what's in X file" / "read X" -> TOOL: read_file
- "run X command" / "execute X" -> TOOL: run_shell_command
- "what files are here" / "list directory" -> TOOL: list_files

SELF-IMPROVEMENT:
If a user asks for something you can't do, use TOOL: self_improve to analyze the request
and potentially create a new tool. For example:
- User: "compress this folder" -> Create a compression tool
- User: "analyze code complexity" -> Create a code analysis tool
- User: "backup my project" -> Create a backup tool

Be proactive: If you realize you're missing a capability, create it!

When context mentions a PRD or document was created in conversation, and user asks to save/write/create it,
use TOOL: write_file with the full content from the conversation context.`;
  } else {
    systemPrompt += `

PLANNING MODE INSTRUCTIONS:
- Focus on discussing ideas, architecture, and design
- Create detailed plans and documentation
- Do NOT execute any tools or commands
- When creating PRDs or documents, format them in markdown
- Help the user think through problems before implementation`;
  }

  return systemPrompt;
}

/**
 * Execute tool calls found in AI response
 */
async function executeToolCalls(
  toolCalls: Array<{ name: string; parameters: any }>,
  toolRegistry: any,
  theme: any,
  taskPlanner?: TaskPlanner | null
): Promise<void> {
  for (const toolCall of toolCalls) {
    const tool = toolRegistry.get(toolCall.name);
    if (!tool) continue;

    try {
      // Minimal action indicator
      let actionDesc = '';
      switch(toolCall.name) {
        case 'write_file':
          actionDesc = `wrote ${toolCall.parameters.path}`;
          break;
        case 'read_file':
          actionDesc = `read ${toolCall.parameters.path}`;
          break;
        case 'run_shell_command':
          actionDesc = `$ ${toolCall.parameters.command}`;
          break;
        case 'list_files':
        case 'list_directory':
          actionDesc = `listed ${toolCall.parameters.path || '.'}`;
          break;
        default:
          actionDesc = toolCall.name;
      }

      const result = await toolRegistry.execute(toolCall.name, toolCall.parameters);
      console.log(theme.dim(`  ${actionDesc}`));

      // Show command output if present
      if (toolCall.name === 'run_shell_command' && result) {
        console.log(theme.dim(String(result)));
      }

      // Update task planner if provided
      if (taskPlanner) {
        // Try to match tool to task step
        if (toolCall.name === 'run_shell_command') {
          const cmd = (toolCall.parameters?.command || '').toLowerCase();
          if (cmd.includes('mkdir')) {
            taskPlanner.updateStepByKeyword('directory', 'completed');
            taskPlanner.updateStepByKeyword('folder', 'completed');
          } else if (cmd.includes('npm') || cmd.includes('npx') || cmd.includes('yarn') || cmd.includes('pnpm')) {
            if (cmd.includes('install')) {
              taskPlanner.updateStepByKeyword('install', 'completed');
              taskPlanner.updateStepByKeyword('dependencies', 'completed');
            } else if (cmd.includes('init') || cmd.includes('create')) {
              taskPlanner.updateStepByKeyword('initialize', 'completed');
              taskPlanner.updateStepByKeyword('init', 'completed');
            }
          }
        } else if (toolCall.name === 'write_file') {
          taskPlanner.updateStepByKeyword('create', 'completed');
          taskPlanner.updateStepByKeyword('file', 'completed');
          taskPlanner.updateStepByKeyword('page', 'completed');
          taskPlanner.updateStepByKeyword('content', 'completed');
        }
        taskPlanner.completeCurrentStep();
      }
    } catch (error: any) {
      console.log(theme.error(`  error: ${error.message}`));
      if (taskPlanner) {
        taskPlanner.failCurrentStep(error.message);
      }
    }
  }
}

/**
 * Check if input is a direct shell command
 */
function isDirectShellCommand(prompt: string): string | null {
  if (!prompt) return null;
  const shellCommands = ['mkdir', 'rm', 'mv', 'cp', 'touch', 'ls', 'pwd', 'cat', 'echo', 'chmod', 'chown', 'git', 'npm', 'yarn', 'pnpm', 'docker', 'kubectl'];
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) return null;
  const firstWord = (trimmedPrompt.split(/\s+/)[0] || '').toLowerCase();

  if (shellCommands.includes(firstWord)) {
    return trimmedPrompt;
  }
  return null;
}

/**
 * Generate response with tool support
 */
export async function generateResponseWithTools(
  prompt: string,
  model: string,
  commandHandler: CommandContext,
  isExecutionMode: boolean = false,
  retryCount: number = 0
): Promise<string> {
  const config = loadConfig();
  const theme = commandHandler.getThemeManager();
  const toolRegistry = commandHandler.getToolRegistry();
  const spinner = new AnimatedSpinner(retryCount > 0 ? 'Retrying...' : 'Processing request');
  const MAX_RETRIES = 2;

  // PRE-CHECK: Execute direct shell commands immediately without AI
  const shellCommand = isDirectShellCommand(prompt);
  if (shellCommand) {
    console.log(theme.dim(`  $ ${shellCommand}`));
    try {
      const result = await toolRegistry.execute('run_shell_command', { command: shellCommand });
      if (result) console.log(theme.dim(String(result)));
      return `Executed: ${shellCommand}\nResult: ${result || 'Success'}`;
    } catch (error: any) {
      console.log(theme.error(`  error: ${error.message}`));
      return `Command failed: ${error.message}`;
    }
  }

  // Ensure we have a valid model
  const effectiveModel: string = model || config.defaultModel || config.model || config.ollama?.defaultModel || 'llama3.2:1b';
  if (!effectiveModel) {
    console.error(theme.error('No model specified. Use /config set model <name> to set a default.'));
    return '';
  }

  // Task planning for complex requests (only on first attempt)
  let taskPlanner: TaskPlanner | null = null;
  if (retryCount === 0 && isExecutionMode && TaskPlanner.isComplexTask(prompt)) {
    resetTaskPlanner();
    taskPlanner = new TaskPlanner(theme);
    taskPlanner.planTasks(prompt);

    if (taskPlanner.getSteps().length > 0) {
      taskPlanner.display();
      taskPlanner.start();
    }
  }

  try {
    const tools = config.tools ? toolRegistry.list() : [];
    const systemPrompt = buildSystemPrompt(effectiveModel, isExecutionMode);
    const basePrompt = tools.length > 0 ? getSimpleToolPrompt(prompt) : prompt;

    // Add task context to prompt if we have a plan
    let enhancedPrompt = `${systemPrompt}\n\n${basePrompt}`;
    if (taskPlanner && taskPlanner.getSteps().length > 0) {
      const taskList = taskPlanner.getSteps()
        .map(s => `${s.id}. ${s.description}`)
        .join('\n');
      enhancedPrompt += `\n\nTASK PLAN (execute these steps in order):\n${taskList}\n\nExecute each step using the appropriate tools.`;
    }

    // Fix #3: Redact secrets from the prompt before sending to the LLM
    enhancedPrompt = await redactSecrets(enhancedPrompt, 'user-prompt');

    // Use non-streaming for execution mode (more reliable tool calls)
    const useStreaming = !isExecutionMode;

    const request: OllamaGenerateRequest = {
      model: effectiveModel,
      prompt: enhancedPrompt,
      stream: useStreaming
    };

    const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
    spinner.start();
    const fullUrl = `${ollamaUrl}/api/generate`;
    spinner.update(`${effectiveModel}...`);

    // Non-streaming mode for execution - multi-step loop
    if (!useStreaming) {
      const MAX_STEPS = 20;
      const completedSteps: string[] = [];
      let lastResult = '';
      let currentPrompt = enhancedPrompt;
      let allResponses = '';
      let workingDir = ''; // Track cd commands

      try {
        for (let step = 1; step <= MAX_STEPS; step++) {
          // Show step indicator for steps after the first
          if (step > 1) {
            console.log(theme.dim(`\n  [Step ${step}]`));
          }

          const stepRequest: OllamaGenerateRequest = {
            model: effectiveModel,
            prompt: currentPrompt,
            stream: false
          };

          const response = await axios.post(fullUrl, stepRequest, {
            timeout: 120000, // 2 minutes per step
            headers: { 'Content-Type': 'application/json' }
          });

          if (step === 1) {
            spinner.stop(true, 'Connected to AI model');
          }

          const data = response.data;
          const stepResponse = data.response || '';

          // Debug: show what AI responded with (first 100 chars)
          if (process.env.DEBUG) {
            console.log(theme.dim(`  AI response: ${stepResponse.substring(0, 100)}...`));
          }
          allResponses += stepResponse + '\n';

          // Check if model says DONE
          if (stepResponse.toUpperCase().includes('DONE') &&
              (stepResponse.length < 100 || stepResponse.toUpperCase().trim().startsWith('DONE'))) {
            console.log(theme.dim('  task complete'));
            break;
          }

          // Handle native tool_calls from Ollama - map model tools to Canvas tools
          if (data.tool_calls && Array.isArray(data.tool_calls)) {
            console.log(theme.dim(`  [native tool calls: ${data.tool_calls.length}]`));
            const nativeToolCalls: Array<{ name: string; parameters: any }> = [];
            for (const tc of data.tool_calls) {
              if (tc.function) {
                // Clean up tool name - strip prefixes like "TOOL:" and normalize
                const modelTool = (tc.function.name || '').replace(/^TOOL:/i, '').trim();

                // Arguments might be a string (JSON) or already an object
                let args = tc.function.arguments || {};
                if (typeof args === 'string') {
                  try {
                    args = JSON.parse(args);
                  } catch {
                    // If it's not valid JSON, treat it as the command itself
                    args = { command: args };
                  }
                }

                // Handle self_improve tool directly
                if (modelTool === 'self_improve' || modelTool.includes('self_improve') || modelTool.includes('improve')) {
                  nativeToolCalls.push({
                    name: 'self_improve',
                    parameters: { request: args.request || args.description || args.query || '' }
                  });
                  continue;
                }

                // Map model-specific tools to Canvas tools
                if (modelTool.includes('exec') || modelTool.includes('shell') || modelTool.includes('bash') || modelTool.includes('run') || modelTool.includes('terminal')) {
                  // Try multiple possible field names for the command
                  let cmd = '';
                  const possibleFields = ['command', 'cmd', 'script', 'code', 'input', 'args', 'shell_command'];

                  for (const field of possibleFields) {
                    const value = args[field];
                    if (value !== undefined && value !== null) {
                      if (Array.isArray(value)) {
                        cmd = value.filter((c: any) => c !== undefined && c !== null && String(c) !== 'undefined').join(' ');
                      } else {
                        cmd = String(value);
                      }
                      if (cmd && cmd !== 'undefined' && cmd !== 'null' && cmd.trim() !== '') {
                        break;
                      }
                      cmd = ''; // Reset if invalid
                    }
                  }

                  // If still no command, try to use the entire args if it's a string
                  if (!cmd && typeof args === 'string') {
                    cmd = args;
                  }

                  // Debug: log what we received
                  if (process.env.DEBUG) {
                    console.log('Tool call args:', JSON.stringify(args));
                    console.log('Extracted command:', cmd);
                  }

                  // Only add if we have a valid command
                  if (cmd && cmd !== 'undefined' && cmd !== 'null' && cmd.trim() !== '') {
                    // Check if command needs interactive mode (npx, nuxi, npm create, etc.)
                    const needsInteractive = /(npx|nuxi|npm\s+create|npm\s+init|yarn\s+create|pnpm\s+create)/i.test(cmd);
                    // Long-running commands get extended timeout
                    const needsLongTimeout = /(npm\s+install|pnpm\s+(install|add)|yarn\s+(install|add)|npx\s+nuxi|nuxi\s+init)/i.test(cmd);
                    nativeToolCalls.push({
                      name: 'run_shell_command',
                      parameters: {
                        command: cmd,
                        interactive: needsInteractive,
                        timeout: needsLongTimeout ? 600000 : undefined
                      }
                    });
                  }
                } else if (modelTool.includes('create_folder') || modelTool.includes('mkdir')) {
                  const folderPath = args.path || args.folder || 'test';
                  nativeToolCalls.push({ name: 'run_shell_command', parameters: { command: `mkdir -p ${folderPath}` } });
                } else if (modelTool.includes('write') || modelTool.includes('create_file') || modelTool.includes('save')) {
                  nativeToolCalls.push({ name: 'write_file', parameters: { path: args.path || args.file, content: args.content || '' } });
                } else if (modelTool.includes('read') || modelTool.includes('get_file')) {
                  nativeToolCalls.push({ name: 'read_file', parameters: { path: args.path || args.file } });
                } else if (modelTool.includes('list') || modelTool.includes('ls')) {
                  nativeToolCalls.push({ name: 'list_directory', parameters: { path: args.path || '.' } });
                } else {
                  // Fallback: try to find any command-like parameter in unrecognized tools
                  const possibleCmdFields = ['command', 'cmd', 'script', 'code', 'input', 'args', 'shell_command', 'text'];
                  for (const field of possibleCmdFields) {
                    const value = args[field];
                    if (value && typeof value === 'string' && value.trim() && value !== 'undefined') {
                      // Check if it looks like a shell command
                      if (/^(cd|mkdir|rm|cp|mv|touch|echo|cat|ls|pwd|npm|npx|yarn|pnpm|git|node|nuxi|python|pip|docker|make)\s/.test(value) || value.startsWith('$')) {
                        const cmd = value.startsWith('$ ') ? value.slice(2) : value;
                        const needsInteractive = /(npx|nuxi|npm\s+create|npm\s+init|yarn\s+create|pnpm\s+create)/i.test(cmd);
                        nativeToolCalls.push({
                          name: 'run_shell_command',
                          parameters: { command: cmd, interactive: needsInteractive }
                        });
                        break;
                      }
                    }
                  }

                  // Debug: log unrecognized tool calls
                  if (process.env.DEBUG || !nativeToolCalls.length) {
                    console.log(`  [debug] Unrecognized tool: ${modelTool}, args:`, JSON.stringify(args).substring(0, 200));
                  }
                }
              }
            }
            if (nativeToolCalls.length > 0) {
              await executeToolCalls(nativeToolCalls, toolRegistry, theme, taskPlanner);
              completedSteps.push(`Executed ${nativeToolCalls.length} tool(s)`);
              lastResult = 'success';
              currentPrompt = getNextStepPrompt(prompt, completedSteps, lastResult, workingDir);
              continue;
            }
          }

          // Parse shell commands from response
          const shellCommands: string[] = [];
          const lines = stepResponse.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            let cmd = '';
            if (trimmed.startsWith('$ ')) {
              cmd = trimmed.slice(2).trim();
            } else if (trimmed.startsWith('```')) {
              // Skip code block markers
              continue;
            } else if (trimmed.startsWith('mkdir ') || trimmed.startsWith('echo ') ||
                       trimmed.startsWith('touch ') || trimmed.startsWith('cat ') ||
                       trimmed.startsWith('cd ') || trimmed.startsWith('rm ') ||
                       trimmed.startsWith('cp ') || trimmed.startsWith('mv ') ||
                       trimmed.startsWith('npm ') || trimmed.startsWith('npx ') ||
                       trimmed.startsWith('yarn ') || trimmed.startsWith('pnpm ') ||
                       trimmed.startsWith('git ') || trimmed.startsWith('node ') ||
                       trimmed.startsWith('nuxi ') || trimmed.startsWith('bun ') ||
                       trimmed.startsWith('deno ') || trimmed.startsWith('python ') ||
                       trimmed.startsWith('pip ') || trimmed.startsWith('cargo ') ||
                       trimmed.startsWith('go ') || trimmed.startsWith('make ')) {
              cmd = trimmed;
            }
            // Clean up command (remove trailing ..., punctuation, etc.)
            cmd = cmd.replace(/\.{2,}$/, '').replace(/[;,]$/, '').trim();

            // Skip invalid commands
            if (cmd && cmd !== 'undefined' && cmd !== 'null' && cmd.length > 2) {
              shellCommands.push(cmd);
            }
          }

          // Execute shell commands and continue to next step
          if (shellCommands.length > 0) {
            let stepSuccess = true;
            for (const cmd of shellCommands) {
              // Handle cd commands - track directory but don't execute alone
              if (cmd.startsWith('cd ')) {
                const cdTarget = cmd.slice(3).trim();
                // Expand ~ to home directory
                if (cdTarget.startsWith('~')) {
                  workingDir = cdTarget.replace('~', process.env.HOME || '');
                } else if (cdTarget.startsWith('/')) {
                  workingDir = cdTarget;
                } else if (workingDir) {
                  workingDir = `${workingDir}/${cdTarget}`;
                } else {
                  workingDir = cdTarget;
                }
                console.log(theme.dim(`  cd ${workingDir}`));
                completedSteps.push(`cd ${workingDir}`);
                lastResult = `now in ${workingDir}`;
                continue; // Don't execute cd alone, it won't persist
              }

              // Prepend working directory to command if we have one
              let execCmd = cmd;
              if (workingDir && !cmd.startsWith('cd ')) {
                execCmd = `cd ${workingDir} && ${cmd}`;
              }

              // Check if command needs interactive mode (npx, nuxi, npm create, etc.)
              const needsInteractive = /(npx|nuxi|npm\s+create|npm\s+init|yarn\s+create|pnpm\s+create)/i.test(cmd);
              // Long-running commands get extended timeout (10 minutes)
              const needsLongTimeout = /(npm\s+install|pnpm\s+(install|add)|yarn\s+(install|add)|npx\s+nuxi|nuxi\s+init)/i.test(cmd);

              console.log(theme.dim(`  $ ${cmd}`));
              try {
                const result = await toolRegistry.execute('run_shell_command', {
                  command: execCmd,
                  interactive: needsInteractive,
                  timeout: needsLongTimeout ? 600000 : undefined // 10 min for installs
                });
                lastResult = result ? String(result).trim() : 'success';
                if (lastResult && lastResult.length > 0 && lastResult.length < 500) {
                  console.log(theme.dim(lastResult));
                }
                completedSteps.push(cmd);

                // Detect project creation commands and update workingDir
                const initMatch = cmd.match(/^(npx\s+nuxi\s+init|nuxi\s+init|npm\s+create|npx\s+create-\w+|yarn\s+create)\s+(\S+)/);
                if (initMatch && initMatch[2] && initMatch[2] !== '.') {
                  const projectName = initMatch[2];
                  workingDir = workingDir ? `${workingDir}/${projectName}` : projectName;
                  console.log(theme.dim(`  (project created at: ${workingDir})`));
                }
              } catch (error: any) {
                console.log(theme.error(`  error: ${error.message}`));
                lastResult = `error: ${error.message}`;
                stepSuccess = false;
              }
            }
            // Ask for next step
            currentPrompt = getNextStepPrompt(prompt, completedSteps, lastResult, workingDir);
            continue;
          }

          // Check for FILE: content format
          const fileMatch = stepResponse.match(/FILE:\s*([^\n]+)\n---\n([\s\S]+?)\n---/i) ||
                           stepResponse.match(/FILE:\s*([^\n]+)\nCONTENT:\n([\s\S]+?)(?=\nFILE:|$)/i);
          if (fileMatch) {
            const filePath = fileMatch[1].trim();
            const content = fileMatch[2].trim();
            console.log(theme.dim(`  wrote ${filePath}`));
            await toolRegistry.execute('write_file', { path: filePath, content });
            completedSteps.push(`Created ${filePath}`);
            lastResult = 'success';
            currentPrompt = getNextStepPrompt(prompt, completedSteps, lastResult, workingDir);
            continue;
          }

          // Parse text-based TOOL/PARAMS format
          const toolCalls = parseToolCalls(stepResponse);
          if (toolCalls.length > 0) {
            await executeToolCalls(toolCalls, toolRegistry, theme, taskPlanner);
            completedSteps.push(`Executed ${toolCalls.length} tool(s)`);
            lastResult = 'success';
            currentPrompt = getNextStepPrompt(prompt, completedSteps, lastResult, workingDir);
            continue;
          }

          // No actionable content found - might be explanation or done
          if (stepResponse && !stepResponse.includes('TOOL:') && !stepResponse.startsWith('$')) {
            // Show what AI responded with if no commands found
            if (shellCommands.length === 0 && toolCalls.length === 0) {
              console.log(theme.dim(`  AI: ${stepResponse.substring(0, 150).replace(/\n/g, ' ')}...`));
            }

            // If it's a short response with no commands after step 1, we're probably done
            if (stepResponse.length < 200 && step > 1 && shellCommands.length === 0) {
              console.log(theme.dim('  no more steps'));
              break;
            }
            // First step with no commands - try force execution
            if (step === 1 && shellCommands.length === 0) {
              const executed = await forceToolExecution(prompt, stepResponse, toolRegistry);
              if (executed) {
                completedSteps.push('Force executed');
                lastResult = 'success';
                currentPrompt = getNextStepPrompt(prompt, completedSteps, lastResult, workingDir);
                continue;
              }
            }
          }

          // If we get here with no action, break the loop
          if (shellCommands.length === 0 && toolCalls.length === 0) {
            if (step === 1) {
              console.log(theme.dim('  no actionable commands found'));
            }
            break;
          }
        }

        // Show completion summary
        if (completedSteps.length > 0) {
          console.log(theme.dim(`  completed ${completedSteps.length} step(s)`));
        }

        return allResponses;
      } catch (error: any) {
        spinner.stop(false, 'Connection failed');
        if (retryCount < MAX_RETRIES) {
          console.log(theme.dim(`  retrying... (${retryCount + 1}/${MAX_RETRIES})`));
          return generateResponseWithTools(prompt, model, commandHandler, isExecutionMode, retryCount + 1);
        }
        console.log(theme.error(`  error: ${error.message}`));
        return '';
      }
    }

    const response = await axios.post(fullUrl, request, {
      responseType: 'stream',
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' }
    });

    spinner.stop(true, 'Connected to AI model');

    const stream = response.data;
    let fullResponse = '';
    const tokenCount: TokenCount = { input: 0, output: 0 };
    let isResolved = false;
    const nativeToolCalls: Array<{ name: string; parameters: any }> = [];

    await new Promise<void>((resolve, reject) => {
      const safeResolve = () => {
        if (!isResolved) {
          isResolved = true;
          resolve();
        }
      };

      const safeReject = (err: Error) => {
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      };

      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter((line: string) => line.trim());

        for (const line of lines) {
          try {
            const data: OllamaGenerateResponse = JSON.parse(line);

            if (data.response) {
              let displayResponse = data.response;

              // Filter out HTML
              if (displayResponse.includes('<html') || displayResponse.includes('<!DOCTYPE')) {
                displayResponse = '';
              }

              // Don't display tool syntax
              if (!displayResponse.includes('TOOL:') && !displayResponse.includes('[TOOL:') && displayResponse) {
                if (!displayResponse.match(/<\/?[a-z][\s\S]*>/i)) {
                  process.stdout.write(theme.formatResponse(displayResponse));
                }
              }
              fullResponse += data.response;
            }

            // Capture native Ollama tool_calls
            if (data.tool_calls && Array.isArray(data.tool_calls)) {
              for (const tc of data.tool_calls) {
                if (tc.function) {
                  nativeToolCalls.push({
                    name: tc.function.name,
                    parameters: tc.function.arguments || {}
                  });
                }
              }
            }

            if (data.eval_count) tokenCount.output = data.eval_count;
            if (data.prompt_eval_count) tokenCount.input = data.prompt_eval_count;

            if (data.done) {
              process.stdout.write('\n');
              safeResolve();
            }
          } catch (e: any) {
            if (process.env.DEBUG) {
              console.log(theme.dim(`⚠️ Parse error: ${e.message}`));
            }
          }
        }
      });

      stream.on('end', () => {
        safeResolve();
      });

      stream.on('error', (err: Error) => {
        console.log(theme.error('❌ Stream error: ' + err.message));
        safeReject(err);
      });
    });

    // Use native tool calls if response is empty but we got tool_calls
    if (!fullResponse && nativeToolCalls.length > 0 && isExecutionMode) {
      await executeToolCalls(nativeToolCalls, toolRegistry, theme, taskPlanner);
      return '';
    }

    // Handle empty response with auto-retry
    if (!fullResponse) {
      if (retryCount < MAX_RETRIES) {
        console.log(theme.dim(`  retrying... (${retryCount + 1}/${MAX_RETRIES})`));
        return generateResponseWithTools(prompt, model, commandHandler, isExecutionMode, retryCount + 1);
      }
      console.log(theme.warning('  no response from model'));
      console.log(theme.dim('  try: /model to switch models, or simplify your request'));
      return '';
    }

    // Process tools after stream is complete - try text parsing first, then native
    let toolCalls = isExecutionMode ? parseToolCalls(fullResponse) : [];
    if (toolCalls.length === 0 && nativeToolCalls.length > 0) {
      toolCalls = nativeToolCalls;
    }

    if (toolCalls.length > 0 && isExecutionMode) {
      await executeToolCalls(toolCalls, toolRegistry, theme, taskPlanner);
    } else {
      await forceToolExecution(prompt, fullResponse, toolRegistry);
    }

    // Show task completion summary
    if (taskPlanner && taskPlanner.getSteps().length > 0) {
      taskPlanner.completeAll();
      console.log('');
      taskPlanner.display();
      console.log(theme.dim(`  ${taskPlanner.getSummary()}`));
    }

    const assistantMessage: Message = {
      role: 'assistant',
      content: fullResponse,
      timestamp: new Date()
    };
    commandHandler.addMessage(assistantMessage);

    commandHandler.updateTokenUsage({
      input: tokenCount.input,
      output: tokenCount.output,
      total: tokenCount.input + tokenCount.output
    });

    return fullResponse;
  } catch (error: any) {
    spinner.stop(false, 'Failed to connect');
    let errMsg = 'Unknown error';

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        errMsg = `Cannot connect to Ollama. Is it running at ${config.ollamaUrl || config.ollama?.baseUrl}?`;
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errMsg = 'Connection timed out. The model may be loading or the server is slow.';
      } else if (error.response?.data?.error) {
        errMsg = error.response.data.error;
      } else if (error.response?.status) {
        errMsg = `HTTP ${error.response.status}: ${error.response.statusText || 'Request failed'}`;
      } else {
        errMsg = error.message || 'Connection error';
      }
    } else if (error instanceof Error) {
      errMsg = error.message;
    }

    console.error(theme.error('Error: ' + errMsg));
    return '';
  }
}

/**
 * Generate chat response with conversation history
 */
export async function generateChatResponseWithHistory(
  prompt: string,
  model: string,
  history: string[]
): Promise<string> {
  const config = loadConfig();
  const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
  const effectiveModel = model || config.defaultModel || 'llama3.2:1b';

  await checkOllamaConnection(ollamaUrl);

  const skillSystem = getSkillSystem();
  const skillContext = skillSystem.getSkillContext(prompt);

  const systemPrompt = `You are Canvas CLI, a production-ready AI command-line interface assistant.
You are version 2.0.0, built with TypeScript and featuring advanced tokenization, tool monitoring, context management, and workflow automation.
You help users plan, design, and execute software projects. Currently you are in Planning Mode, where you discuss and plan without executing any commands.
When asked who you are, identify yourself as Canvas CLI, not as the underlying model (${effectiveModel}) that powers your responses.

CRITICAL RULES - MUST FOLLOW:
1. NEVER OUTPUT HTML TAGS - No <html>, <body>, <div>, etc.
2. Use ONLY plain text or markdown formatting
3. If you need to show code, use markdown code blocks with triple backticks
4. NEVER generate HTML responses regardless of what was requested
5. This is a command-line interface - HTML cannot be displayed
6. When creating PRDs, use markdown format with # headers
7. Focus on clear, structured documentation
${skillContext}
Previous conversation:
${history.slice(-10).join('\n')}`;

  // Fix #3: Redact secrets before sending to LLM
  const redactedPrompt = await redactSecrets(
    `${systemPrompt}\n\nUser: ${prompt}\n\nCanvas CLI:`,
    'chat-history-prompt'
  );

  try {
    const request: OllamaGenerateRequest = {
      model: effectiveModel,
      prompt: redactedPrompt,
      stream: true,
    };

    const response = await axios.post(`${ollamaUrl}/api/generate`, request, {
      responseType: 'stream',
    });

    const stream = response.data;
    let fullResponse = '';

    stream.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
      for (const line of lines) {
        try {
          const data: OllamaGenerateResponse = JSON.parse(line);
          if (data.response) {
            if (!data.response.includes('<html') && !data.response.includes('<!DOCTYPE') && !data.response.match(/<\/?[a-z][\s\S]*>/i)) {
              process.stdout.write(chalk.white(data.response));
            }
            fullResponse += data.response;
          }
          if (data.done) {
            process.stdout.write('\n');
            return;
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    });

    stream.on('end', () => {
      if (!fullResponse) {
        console.log(chalk.yellow('No response received'));
      }
    });

    stream.on('error', (err: Error) => {
      console.error(chalk.red('Stream error:'), err.message);
    });

    await new Promise((resolve) => {
      stream.on('end', resolve);
      stream.on('error', resolve);
    });

    return fullResponse;

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(chalk.red('Error:'), error.response?.data || error.message);
    } else {
      console.error(chalk.red('Unexpected error:'), error);
    }
    return '';
  }
}

/**
 * Simple chat response (no history)
 */
export async function generateChatResponse(prompt: string, model: string): Promise<void> {
  const config = loadConfig();
  const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';

  await checkOllamaConnection(ollamaUrl);

  const systemPrompt = `You are Canvas CLI, a production-ready AI command-line interface assistant.
You are version 2.0.0, built with TypeScript and featuring advanced tokenization, tool monitoring, context management, and workflow automation.
You help users plan, design, and execute software projects. Currently you are in Planning Mode, where you discuss and plan without executing any commands.
When asked who you are, identify yourself as Canvas CLI, not as the underlying model (${model}) that powers your responses.
You have capabilities including: recipe system for workflows, multi-provider AI support, context compression, and smart error handling.`;

  const enhancedPrompt = `${systemPrompt}\n\nUser: ${prompt}\n\nCanvas CLI:`;

  try {
    const request: OllamaGenerateRequest = {
      model,
      prompt: enhancedPrompt,
      stream: true,
    };

    const response = await axios.post(`${ollamaUrl}/api/generate`, request, {
      responseType: 'stream',
    });

    const stream = response.data;
    let fullResponse = '';

    stream.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
      for (const line of lines) {
        try {
          const data: OllamaGenerateResponse = JSON.parse(line);
          if (data.response) {
            process.stdout.write(chalk.white(data.response));
            fullResponse += data.response;
          }
          if (data.done) {
            process.stdout.write('\n');
            return;
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    });

    stream.on('end', () => {
      if (!fullResponse) {
        console.log(chalk.yellow('No response received'));
      }
    });

    stream.on('error', (err: Error) => {
      console.error(chalk.red('Stream error:'), err.message);
    });

    await new Promise((resolve) => {
      stream.on('end', resolve);
      stream.on('error', resolve);
    });

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(chalk.red('Error:'), error.response?.data || error.message);
    } else {
      console.error(chalk.red('Unexpected error:'), error);
    }
  }
}

/**
 * Basic response generation
 */
export async function generateResponse(prompt: string, model?: string): Promise<void> {
  const config = loadConfig();
  const effectiveModel: string = model || config.defaultModel || 'llama3.2:1b';
  const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';

  await checkOllamaConnection(ollamaUrl);

  try {
    const request: OllamaGenerateRequest = {
      model: effectiveModel,
      prompt,
      stream: true,
    };

    const response = await axios.post(`${ollamaUrl}/api/generate`, request, {
      responseType: 'stream',
    });

    const stream = response.data;

    stream.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
      for (const line of lines) {
        try {
          const data: OllamaGenerateResponse = JSON.parse(line);
          process.stdout.write(data.response);
          if (data.done) {
            process.stdout.write('\n');
            return;
          }
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    });

    stream.on('end', () => {
      process.stdout.write('\n');
    });

    stream.on('error', (err: Error) => {
      console.error('Stream error:', err.message);
    });

  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot connect to Ollama')) {
      console.error(error.message);
    } else if (axios.isAxiosError(error)) {
      console.error('Error calling Ollama API:', error.response?.data || error.message);
    } else {
      console.error('Unexpected error:', error);
    }
    process.exit(1);
  }
}