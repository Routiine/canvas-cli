#!/usr/bin/env node

import { Command } from 'commander';
import axios from 'axios';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import { loadConfig, saveConfig } from './config.js';
import { CommandHandler } from './commands.js';
import { Message, ToolCall, TokenUsage, Config } from './types.js';
import { ContextLoader } from './tools/memory.js';
import { VSCodeAutoDetectTool } from './tools/vscode.js';
import { createToolPrompt, parseToolCalls } from './toolPrompt.js';
import { forceToolExecution, getSimpleToolPrompt } from './tools/forceExecute.js';
import { showTextBox } from './ui/textBox.js';
import chalk from 'chalk';
import { AnimatedSpinner, withSpinner } from './ui/spinner.js';
import { PRDExecutor } from './prd/prdExecutor.js';
import { displayWelcome, displayCompactLogo, displaySplash } from './utils/splash.js';
import { UnifiedBorder } from './ui/unifiedBorder.js';
import { registerInkUICommand } from './commands/ink-ui.js';
import { getHookSystem } from './hooks/hookSystem.js';
import { getNotificationSystem } from './hooks/notificationSystem.js';
import { getTranscriptManager } from './hooks/transcriptManager.js';
import { getSmartCompletionSystem } from './hooks/smartCompletion.js';
import { createInstallCommand } from './commands/install.js';
import { createUpdateCommand } from './commands/update.js';
import { ModelManager } from './models/model-manager.js';
import { getOrchestrator, executeWorkflow, coordinateGoal } from './agents/orchestrator.js';
import { initializeCanvasFeatures, CanvasFeatures } from './features/index.js';
import { configWizard } from './config/setup-wizard.js';

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  tools?: any[];
  messages?: any[];
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  tool_calls?: any[];
  eval_count?: number;
  prompt_eval_count?: number;
}

async function checkOllamaConnection(ollamaUrl: string): Promise<void> {
  try {
    await axios.get(`${ollamaUrl}/api/tags`, { timeout: 5000 });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`Cannot connect to Ollama at ${ollamaUrl}. ${error.message}`);
    }
    throw error;
  }
}

async function startInteractiveMode(model: string): Promise<void> {
  const commandHandler = new CommandHandler();
  const contextLoader = new ContextLoader();
  const theme = commandHandler.getThemeManager();
  const checkpointManager = commandHandler.getCheckpointManager();
  
  // Initialize hook systems
  const hookSystem = getHookSystem();
  const notificationSystem = getNotificationSystem();
  const transcriptManager = getTranscriptManager();
  const smartCompletion = getSmartCompletionSystem();
  
  // Trigger session start hook
  await hookSystem.executeHooks('session-start', {
    timestamp: new Date(),
    session: { model, startTime: new Date() }
  });
  
  // Load previous session if exists
  const autoSave = await checkpointManager.loadAutoSave();
  if (autoSave) {
    console.log(theme.success('Restored previous session'));
    autoSave.messages.forEach(msg => commandHandler.addMessage(msg));
  }
  
  // Load context
  const context = await contextLoader.loadContext();
  
  // Auto-detect and load VSCode project context if available
  const vscodeDetector = new VSCodeAutoDetectTool();
  try {
    const vscodeContext = await vscodeDetector.execute({});
    if (vscodeContext.detected) {
      console.log(theme.success('✓ Detected VSCode project'));
      if (vscodeContext.workspace) {
        console.log(theme.dim(`  Workspace: ${vscodeContext.workspace.name || 'Untitled'}`));
      }
      if (vscodeContext.folders?.length > 0) {
        console.log(theme.dim(`  Folders: ${vscodeContext.folders.length}`));
      }
      if (vscodeContext.extensions?.length > 0) {
        console.log(theme.dim(`  Extensions: ${vscodeContext.extensions.length} installed`));
      }
      // Store VSCode context for AI to use
      commandHandler.setVSCodeContext(vscodeContext);
    }
  } catch (error) {
    // Silently fail if no VSCode project detected
  }
  
  // Display welcome splash screen
  displayWelcome();
  
  while (true) {
    // Check if user wants to use text box
    const inputChoice = await inquirer.prompt({
      type: 'list',
      name: 'inputMethod',
      message: theme.formatPrompt('How would you like to input your message?'),
      choices: [
        {
          name: '💬 Single line (quick input)',
          value: 'single',
          short: 'Single line'
        },
        {
          name: '📝 Text box (multi-line, paste support)',
          value: 'textbox',
          short: 'Text box'
        },
        {
          name: '🚪 Exit Canvas CLI',
          value: 'exit',
          short: 'Exit'
        }
      ],
      default: 'single'
    });

    if (inputChoice.inputMethod === 'exit') {
      console.log(theme.success('\nGoodbye!'));
      break;
    }

    let userInput: string = '';

    if (inputChoice.inputMethod === 'textbox') {
      const textBoxResult = await showTextBox({
        title: '🎨 Canvas CLI - Text Input',
        placeholder: 'Enter your message, code, or paste complex content...'
      });
      
      userInput = textBoxResult.content.trim();
      
      if (textBoxResult.metadata.lines > 1) {
        console.log(theme.success(`✅ Received ${textBoxResult.metadata.lines} lines, ${textBoxResult.metadata.words} words`));
      }
    } else {
      const answers = await inquirer.prompt({
        type: 'input',
        name: 'prompt',
        message: theme.formatPrompt('You'),
      });
      
      userInput = answers.prompt?.trim() || '';
    }
    
    if (!userInput) {
      continue;
    }
    
    // Handle exit
    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      console.log(theme.success('\nGoodbye!'));
      break;
    }
    
    // Handle commands
    if (userInput.startsWith('/')) {
      // Special command for text box
      if (userInput === '/textbox' || userInput === '/text') {
        const textBoxResult = await showTextBox({
          title: '🎨 Canvas CLI - Advanced Text Input',
          placeholder: 'Enter your complex message, code, documentation, or paste content...'
        });
        
        if (textBoxResult.content.trim()) {
          userInput = textBoxResult.content.trim();
          console.log(theme.success(`✅ Processing ${textBoxResult.metadata.lines} lines, ${textBoxResult.metadata.words} words`));
          if (textBoxResult.metadata.language && textBoxResult.metadata.language !== 'Text') {
            console.log(theme.dim(`🔍 Detected language: ${textBoxResult.metadata.language}`));
          }
        } else {
          continue;
        }
      } else {
        const result = await commandHandler.handleCommand(userInput);
        if (result) {
          console.log(result);
        }
        continue;
      }
    }
    
    // Handle @ mentions for file inclusion
    let finalPrompt = userInput;
    if (userInput.includes('@')) {
      const fileMatches = userInput.match(/@([^\s]+)/g);
      if (fileMatches) {
        for (const match of fileMatches) {
          const filePath = match.slice(1);
          try {
            const toolRegistry = commandHandler.getToolRegistry();
            const content = await toolRegistry.execute('read_file', { path: filePath });
            finalPrompt = finalPrompt.replace(match, `\n\nFile: ${filePath}\n${content}\n`);
          } catch (error) {
            console.log(theme.error(`Could not read file: ${filePath}`));
          }
        }
      }
    }
    
    // Handle ! commands for shell execution
    if (userInput.startsWith('!')) {
      const command = userInput.slice(1);
      const toolRegistry = commandHandler.getToolRegistry();
      try {
        const result = await toolRegistry.execute('run_shell_command', { command });
        console.log(result);
      } catch (error) {
        console.log(theme.error('Command failed'));
      }
      continue;
    }
    
    // Check for EXPLICIT PRD execution requests (must have both keywords)
    const lowerInput = userInput.toLowerCase();
    if (lowerInput.includes('prd') && 
        (lowerInput.includes('execute') || lowerInput.includes('run') || lowerInput.includes('implement')) && 
        (lowerInput.includes('.md') || lowerInput.includes('prd'))) {
      
      // Extract filename from input
      let prdFile = '';
      const mdMatch = userInput.match(/([\w.-]*prd[\w.-]*\.md)/i);
      if (mdMatch) {
        prdFile = mdMatch[1];
      } else if (lowerInput.includes('prd.md')) {
        prdFile = 'prd.md';
      }
      
      if (prdFile) {
        console.log(theme.dim(`\n🔍 Detected PRD execution request: ${prdFile}`));
        const toolRegistry = commandHandler.getToolRegistry();
        const prdExecutor = new PRDExecutor(toolRegistry);
        await prdExecutor.execute(prdFile);
        continue;
      }
    }
    
    // Check for web/app building requests using intent detector
    const toolRegistry = commandHandler.getToolRegistry();
    const { intentDetector } = await import('./tools/intentDetector.js');
    const intent = intentDetector.detectIntent(userInput);
    
    // If it's a build request, execute it directly
    if (intent.action.startsWith('build') && intent.tools.includes('web_builder')) {
      console.log(theme.dim(`\n🔨 Detected build request: ${intent.action}`));
      await intentDetector.executeIntent(intent, toolRegistry);
      continue;
    }
    
    // Add user message
    const userMessage: Message = {
      role: 'user',
      content: finalPrompt,
      timestamp: new Date()
    };
    commandHandler.addMessage(userMessage);
    
    // Generate AI response with tool support (default to dev/execution mode)
    console.log('\n' + theme.formatPrompt('Canvas'));
    await generateResponseWithTools(finalPrompt, model, commandHandler, true);
    console.log('');
    
    // Auto-save session
    await checkpointManager.autoSave(commandHandler['messages']);
  }
}

async function generateResponseWithTools(
  prompt: string, 
  model: string, 
  commandHandler: CommandHandler,
  isExecutionMode: boolean = false
): Promise<void> {
  const config = loadConfig();
  const theme = commandHandler.getThemeManager();
  const toolRegistry = commandHandler.getToolRegistry();
  const spinner = new AnimatedSpinner('Processing request');
  
  try {
    // Prepare request with tool definitions if enabled
    const tools = config.tools ? toolRegistry.list() : [];
    
    // Add Canvas CLI identity with appropriate mode
    const modeDescription = isExecutionMode 
      ? 'You are currently in DEV MODE (EXECUTION enabled) and can run tools and commands.'
      : 'You are currently in PLANNING MODE - discuss and plan without executing commands.';
      
    const systemPrompt = `You are Canvas CLI, a production-ready AI command-line interface assistant.
You are version 2.0.0, built with TypeScript. ${modeDescription}
When asked who you are, identify yourself as Canvas CLI, not as the underlying model (${model}).

CRITICAL RULES - MUST FOLLOW:
1. NEVER OUTPUT HTML TAGS - No <html>, <body>, <div>, etc.
2. Use ONLY plain text or markdown formatting
3. If you need to show code, use markdown code blocks with triple backticks
4. NEVER generate HTML responses regardless of what was requested
5. This is a command-line interface - HTML cannot be displayed

${isExecutionMode ? 'IMPORTANT: You are in EXECUTION MODE. You are self-aware and can improve yourself.' : 'IMPORTANT: You are in PLANNING MODE. Help the user plan and design without executing.'}

${isExecutionMode ? `TOOL EXECUTION INSTRUCTIONS:
When you need to execute a tool, use the format: TOOL: toolname PARAMS: {json}
DO NOT explain the tool call to the user - Canvas CLI will automatically execute it and show user-friendly feedback.
Just include the tool syntax in your response and Canvas CLI will handle the rest.

Example: If user asks to save a file, include:
TOOL: write_file PARAMS: {"path": "filename.txt", "content": "file content"}

Canvas CLI will automatically show: "📝 Writing to filename.txt" and "✅ Successfully wrote filename.txt"

SELF-AWARENESS CAPABILITIES:
- TOOL: introspect_tools - Check what tools you have and what you can do
- TOOL: create_tool - Create new tools when needed for tasks  
- TOOL: self_improve - Analyze requests and create missing capabilities

Natural Request Examples → Tool to Use:
- "save this" / "save the PRD" / "put this in a file" → TOOL: write_file
- "create the document" / "make the prd file" → TOOL: write_file PARAMS: {"path": "prd.md", "content": "..."}
- "show me what's in X file" / "read X" → TOOL: read_file
- "run X command" / "execute X" → TOOL: run_shell_command
- "what files are here" / "list directory" → TOOL: list_files

SELF-IMPROVEMENT:
If a user asks for something you can't do, use TOOL: self_improve to analyze the request 
and potentially create a new tool. For example:
- User: "compress this folder" → Create a compression tool
- User: "analyze code complexity" → Create a code analysis tool
- User: "backup my project" → Create a backup tool

Be proactive: If you realize you're missing a capability, create it!

When context mentions a PRD or document was created in conversation, and user asks to save/write/create it,
use TOOL: write_file with the full content from the conversation context.` : `PLANNING MODE INSTRUCTIONS:
- Focus on discussing ideas, architecture, and design
- Create detailed plans and documentation
- Do NOT execute any tools or commands
- When creating PRDs or documents, format them in markdown
- Help the user think through problems before implementation`}`;
    
    // Use simplified prompt that works better with open source models
    const basePrompt = tools.length > 0 ? getSimpleToolPrompt(prompt) : prompt;
    const enhancedPrompt = `${systemPrompt}\n\n${basePrompt}`;
    
    const request: OllamaGenerateRequest = {
      model,
      prompt: enhancedPrompt,
      stream: true
    };

    spinner.start();
    spinner.update('Connecting to Ollama...');
    
    const response = await axios.post(`${config.ollamaUrl}/api/generate`, request, {
      responseType: 'stream',
    });
    
    spinner.stop(true, 'Connected to AI model');

    const stream = response.data;
    let fullResponse = '';
    let tokenCount = { input: 0, output: 0 };

    // Wrap stream processing in a promise to properly await it
    let chunkCount = 0;
    let parseErrors = 0;
    
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunkCount++;
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data: OllamaGenerateResponse = JSON.parse(line);
            
            // Tool calls from Ollama are not standard - we'll handle them after
            
            // Handle text response
            if (data.response) {
              // Filter out HTML and tool syntax
              let displayResponse = data.response;
              
              // Remove HTML tags if present
              if (displayResponse.includes('<html') || displayResponse.includes('<!DOCTYPE')) {
                displayResponse = ''; // Don't display HTML at all
              }
              
              // Don't display tool syntax to user - we'll execute it instead
              if (!displayResponse.includes('TOOL:') && !displayResponse.includes('[TOOL:') && displayResponse) {
                // Additional HTML tag filtering
                if (!displayResponse.match(/<\/?[a-z][\s\S]*>/i)) {
                  process.stdout.write(theme.formatResponse(displayResponse));
                }
              }
              fullResponse += data.response;
            }
            
            // Update token counts
            if (data.eval_count) tokenCount.output = data.eval_count;
            if (data.prompt_eval_count) tokenCount.input = data.prompt_eval_count;
            
            if (data.done) {
            // Check if we got a response
            if (!fullResponse) {
              console.log(theme.warning('\n⚠️  No response from model'));
            }
            
            // Save message and token info for processing after stream completes
            
            process.stdout.write('\n');
            resolve(); // Resolve the promise when done
          }
          } catch (e: any) {
            parseErrors++;
            console.log(theme.dim(`⚠️ Parse error #${parseErrors}: ${e.message}`));
            console.log(theme.dim(`   Line content: "${line.substring(0, 100)}..."`));
          }
      }
    });

    stream.on('end', () => {
      console.log(theme.warning(`\n📊 Stream ended. Chunks received: ${chunkCount}, Parse errors: ${parseErrors}`));
      if (!fullResponse) {
        console.log(theme.error('❌ No response was captured from the model'));
      } else {
        console.log(theme.dim(`📝 Total response length: ${fullResponse.length} characters`));
      }
      resolve(); // Also resolve on stream end
    });

    stream.on('error', (err: Error) => {
      console.log(theme.error('❌ Stream error: ' + err.message));
      console.log(theme.error(`   Chunks processed before error: ${chunkCount}`));
      reject(err);
    });
  }); // End of promise wrapper
  
  console.log(theme.success(`\n✅ Stream processing complete`));
  console.log(theme.dim(`   Response length: ${fullResponse.length} chars`));
  console.log(theme.dim(`   Chunks processed: ${chunkCount}`));
  console.log(theme.dim(`   Parse errors: ${parseErrors}`));
  
  // Now process tools after stream is complete
  if (fullResponse) {
    // First parse tool calls from the AI response (only in execution mode)
    const toolCalls = isExecutionMode ? parseToolCalls(fullResponse) : [];
    
    // Execute all tool calls found in the response (only in execution mode)
    if (toolCalls.length > 0 && isExecutionMode) {
      console.log(theme.dim(`\n🔧 Executing actions...`));
      for (const toolCall of toolCalls) {
        const tool = toolRegistry.get(toolCall.name);
        if (tool) {
          try {
            // Create human-readable action description
            let actionDescription = '';
            switch(toolCall.name) {
              case 'write_file':
                actionDescription = `📝 Writing to ${toolCall.parameters.path}`;
                break;
              case 'read_file':
                actionDescription = `📖 Reading ${toolCall.parameters.path}`;
                break;
              case 'run_shell_command':
                actionDescription = `🖥️  Running: ${toolCall.parameters.command}`;
                break;
              case 'list_files':
                actionDescription = `📁 Listing directory: ${toolCall.parameters.path || '.'}`;
                break;
              case 'create_tool':
                actionDescription = `🛠️  Creating new tool: ${toolCall.parameters.name}`;
                break;
              case 'self_improve':
                actionDescription = `🧠 Analyzing and improving capabilities`;
                break;
              case 'introspect_tools':
                actionDescription = `🔍 Checking available tools`;
                break;
              default:
                actionDescription = `⚡ Executing: ${toolCall.name}`;
            }
            
            console.log(theme.info(`\n${actionDescription}`));
            const result = await toolRegistry.execute(toolCall.name, toolCall.parameters);
            
            // Provide human-readable success message
            switch(toolCall.name) {
              case 'write_file':
                console.log(theme.success(`✅ Successfully wrote ${toolCall.parameters.path}`));
                break;
              case 'read_file':
                console.log(theme.success(`✅ Successfully read ${toolCall.parameters.path}`));
                if (result && typeof result === 'string' && result.length < 500) {
                  console.log(theme.dim(result.substring(0, 200) + (result.length > 200 ? '...' : '')));
                }
                break;
              case 'run_shell_command':
                console.log(theme.success(`✅ Command completed`));
                if (result) console.log(theme.dim(result));
                break;
              default:
                console.log(theme.success(`✅ ${toolCall.name} completed successfully`));
                if (result && typeof result === 'string' && result.length < 500) {
                  console.log(theme.dim(result));
                }
            }
          } catch (error: any) {
            console.log(theme.error(`❌ Failed: ${error.message}`));
          }
        }
      }
    } else {
      // Only try force execution if no tool calls were found in response
      const wasForceExecuted = await forceToolExecution(prompt, fullResponse, toolRegistry);
      if (!wasForceExecuted) {
        console.log(theme.dim('ℹ️ No tool execution needed for this response'));
      }
    }
    
    // Add assistant message
    const assistantMessage: Message = {
      role: 'assistant',
      content: fullResponse,
      timestamp: new Date()
    };
    commandHandler.addMessage(assistantMessage);
    
    // Update token usage
    commandHandler.updateTokenUsage({
      input: tokenCount.input,
      output: tokenCount.output,
      total: tokenCount.input + tokenCount.output
    });
  }

  } catch (error) {
    spinner.stop(false, 'Failed to connect');
    if (axios.isAxiosError(error)) {
      console.error(theme.error('Error: ' + (error.response?.data || error.message)));
    } else {
      console.error(theme.error('Unexpected error: ' + error));
    }
  }
}

async function generateChatResponseWithHistory(prompt: string, model: string, history: string[]): Promise<string> {
  const config = loadConfig();
  const ollamaUrl = config.ollamaUrl;
  
  await checkOllamaConnection(ollamaUrl);
  
  // Add Canvas CLI identity system prompt with history context
  const systemPrompt = `You are Canvas CLI, a production-ready AI command-line interface assistant. 
You are version 2.0.0, built with TypeScript and featuring advanced tokenization, tool monitoring, context management, and workflow automation.
You help users plan, design, and execute software projects. Currently you are in Planning Mode, where you discuss and plan without executing any commands.
When asked who you are, identify yourself as Canvas CLI, not as the underlying model (${model}) that powers your responses.

CRITICAL RULES - MUST FOLLOW:
1. NEVER OUTPUT HTML TAGS - No <html>, <body>, <div>, etc.
2. Use ONLY plain text or markdown formatting
3. If you need to show code, use markdown code blocks with triple backticks
4. NEVER generate HTML responses regardless of what was requested
5. This is a command-line interface - HTML cannot be displayed
6. When creating PRDs, use markdown format with # headers
7. Focus on clear, structured documentation

Previous conversation:
${history.slice(-10).join('\n')}`;
  
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
      const lines = chunk.toString().split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const data: OllamaGenerateResponse = JSON.parse(line);
          if (data.response) {
            // Filter out HTML content  
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
    
    // Wait for stream to complete
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

async function generateChatResponse(prompt: string, model: string): Promise<void> {
  const config = loadConfig();
  const ollamaUrl = config.ollamaUrl;
  
  await checkOllamaConnection(ollamaUrl);
  
  // Add Canvas CLI identity system prompt
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
      const lines = chunk.toString().split('\n').filter(line => line.trim());
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
    
    // Wait for stream to complete
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

async function generateResponse(prompt: string, model?: string): Promise<void> {
  const config = loadConfig();
  const effectiveModel = model || config.defaultModel;
  const ollamaUrl = config.ollamaUrl;

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
      const lines = chunk.toString().split('\n').filter(line => line.trim());
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
      // Ensure final newline
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

async function main() {
  let config = loadConfig();
  
  // Check if config is empty (first run or no config)
  const needsConfig = !config.ollamaUrl && !config.ollama?.baseUrl;
  
  if (needsConfig) {
    console.log(chalk.cyan.bold('\n🎨 Welcome to Canvas CLI!'));
    console.log(chalk.yellow('No configuration found. Let\'s set up Canvas CLI.'));
    console.log(chalk.gray('You can also run "canvas config" anytime to configure.\n'));
    
    // Simple initial config - just ask for Ollama URL
    const inquirer = await import('inquirer');
    const { setupNow } = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'setupNow',
        message: 'Would you like to configure Canvas CLI now?',
        default: true
      }
    ]);
    
    if (setupNow) {
      const { ollamaUrl } = await inquirer.default.prompt([
        {
          type: 'input',
          name: 'ollamaUrl',
          message: 'Enter Ollama API URL:',
          default: 'http://localhost:11434',
          validate: (input) => {
            try {
              new URL(input);
              return true;
            } catch {
              return 'Please enter a valid URL';
            }
          }
        }
      ]);
      
      // Save minimal config
      config = {
        ollamaUrl: ollamaUrl,
        ollama: {
          baseUrl: ollamaUrl,
          defaultModel: 'llama3.2:latest'
        }
      };
      saveConfig(config);
      console.log(chalk.green('\n✅ Basic configuration saved! Use /config to add more settings.\n'));
    } else {
      console.log(chalk.yellow('\n⚠️  No configuration set. Canvas CLI may not work properly.'));
      console.log(chalk.gray('Run /config to configure at any time.\n'));
    }
  }
  
  // Set default model from config if available
  if (config.defaultModel || config.ollama?.defaultModel) {
    ModelManager.registerDefaultAliasFromConfig(config.defaultModel || config.ollama?.defaultModel);
  }
  
  // Initialize all Canvas Features (optional - don't fail if features can't load)
  let featureManager: any;
  try {
    console.log(chalk.cyan('🚀 Initializing Canvas CLI v2.0...'));
    featureManager = await initializeCanvasFeatures();
  } catch (error) {
    console.log(chalk.yellow('⚠️ Some advanced features could not be initialized'));
    // Continue without advanced features
  }
  
  const program = new Command();

  program
    .name('canvas')
    .description('Canvas CLI - Production-ready AI assistant with advanced tools (defaults to chat mode)')
    .version('2.0.0')
    .option('--sandbox <type>', 'Enable sandboxing (docker, podman, none)', 'none')
    .option('--no-tools', 'Disable all tools')
    .option('--checkpointing', 'Enable automatic checkpointing')
    .option('--web [port]', 'Start web UI server (default port: 3000)')
    .option('--plugins', 'Load plugins on startup');

  program
    .command('chat')
    .description('Start interactive chat session (default command when running "canvas")')
    .argument('[prompt]', 'Optional prompt to send directly')
    .option('-m, --model <model>', `Model to use (default: ${config.defaultModel})`, config.defaultModel)
    .action(async (prompt: string | undefined, options: { model: string }) => {
      const commandHandler = new CommandHandler();
      
      // If prompt provided directly, process it and exit (in execution mode by default)
      if (prompt) {
        await generateResponseWithTools(prompt, options.model, commandHandler, true);
        return;
      }
      
      // Check if we can interact with the user (not piped input)
      const isInteractive = process.stdin.isTTY !== false && !process.env.CI;
      
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
      
      // Interactive chat loop (planning mode by default)
      let executionMode = false;
      let conversationHistory: string[] = []; // Store conversation history for context
      
      // Initialize hook systems
      const hookSystem = getHookSystem();
      const notificationSystem = getNotificationSystem();
      const transcriptManager = getTranscriptManager();
      const smartCompletion = getSmartCompletionSystem();
      
      // Trigger session start
      await hookSystem.executeHooks('session-start', {
        timestamp: new Date(),
        mode: 'planning'
      });
      
      // Display the modern dark splash screen
      displayWelcome();
      
      // Show initial help text once
      let firstPrompt = true;
      
      while (true) {
        // Add a small space before the input box
        console.log('');
        
        // Get bordered input using simple solution
        const border = new UnifiedBorder({ style: 'double', showMode: true, clearScreen: false });
        const message = await border.getBorderedInput('>', true);
        
        // First prompt handled by border component
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
          continue; // Skip if hook blocks the command
        }
        
        // Check for exit
        if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
          // Trigger session end hook
          await hookSystem.executeHooks('session-end', {
            timestamp: new Date(),
            session: { endTime: new Date() }
          });
          
          // Save transcript
          transcriptManager.dispose();
          
          // Show goodbye notification
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
          const parts = userInput.split(' ');
          if (parts[1] === 'workflow' && parts[2]) {
            try {
              console.log(chalk.cyan(`\n🚀 Executing workflow: ${parts[2]}`));
              const result = await executeWorkflow(parts[2]);
              console.log(chalk.green('✅ Workflow completed'));
            } catch (error: any) {
              console.log(chalk.red(`❌ Workflow failed: ${error.message}`));
            }
          } else if (parts[1] === 'goal' && parts.slice(2).length > 0) {
            const goal = parts.slice(2).join(' ');
            try {
              console.log(chalk.cyan(`\n🎯 Coordinating for goal: ${goal}`));
              const result = await coordinateGoal(goal);
              console.log(chalk.green('✅ Goal achieved'));
            } catch (error: any) {
              console.log(chalk.red(`❌ Goal failed: ${error.message}`));
            }
          } else {
            const orchestrator = await getOrchestrator();
            const status = orchestrator.getStatus();
            console.log(chalk.cyan('\n🎭 Agent System Status'));
            console.log(chalk.dim(`  Agents: ${status.agents.length} active`));
            console.log(chalk.dim(`  Tasks: ${status.queue} queued, ${status.running} running`));
          }
          continue;
        }
        
        // Check for execution mode toggle
        if (userInput === '/execute' || userInput === '/exec') {
          executionMode = !executionMode;
          
          // Import BaseTool to set auto-confirm mode
          const { BaseTool } = await import('./tools/base.js');
          
          if (executionMode) {
            BaseTool.autoConfirmMode = true; // Enable auto-confirmation
          } else {
            BaseTool.autoConfirmMode = false; // Disable auto-confirmation
          }
          
          console.log('');
          console.log(chalk.hex('#303030')('    mode: ' + (executionMode ? 'execution' : 'planning')));
          continue;
        }
        
        // Add to transcript
        transcriptManager.addEntry({
          role: 'user',
          content: userInput,
          mode: executionMode ? 'execution' : 'planning'
        });
        
        // Process with AI - show mode subtly
        console.log('');
        console.log(chalk.hex('#606060')(executionMode ? '    [exec] processing...' : '    [plan] processing...'));
        
        if (executionMode) {
          // Full execution mode with tools
          // Pass conversation context to execution mode so AI knows what PRD to save
          // Extract just the PRD content from conversation history
          const prdContent = conversationHistory
            .filter(line => line.startsWith('Canvas CLI:'))
            .map(line => line.replace('Canvas CLI:', '').trim())
            .join('\n\n');
          
          const contextualPrompt = `
IMPORTANT: DO NOT RESPOND WITH HTML. Only use plain text or markdown.

Previous PRD content that was created:
---START PRD CONTENT---
${prdContent}
---END PRD CONTENT---

User's current request: ${userInput}

If the user is asking to save/write/store the PRD or document:
1. Use [TOOL: write_file] with path: "prd.md"
2. Use the EXACT content between ---START PRD CONTENT--- and ---END PRD CONTENT--- as the file content
3. Do NOT generate new content, use what was already created above

Example tool usage:
[TOOL: write_file] {"path": "prd.md", "content": "[INSERT THE PRD CONTENT HERE]"}`;
          
          await generateResponseWithTools(contextualPrompt, options.model, commandHandler, true);
          
          // Also track this in history
          conversationHistory.push(`User: ${userInput}`);
          conversationHistory.push(`[Execution mode action performed]`);
          
          // Execute post-command hooks
          await hookSystem.executeHooks('post-command', {
            command: userInput,
            timestamp: new Date(),
            mode: 'execution'
          });
          
          // Trigger completion hook for suggestions
          await hookSystem.executeHooks('completion', {
            command: userInput,
            timestamp: new Date(),
            mode: 'execution'
          });
        } else {
          // Chat-only mode without tools
          const response = await generateChatResponseWithHistory(userInput, options.model, conversationHistory);
          conversationHistory.push(`User: ${userInput}`);
          conversationHistory.push(`Canvas CLI: ${response}`);
          
          // Add assistant response to transcript
          transcriptManager.addEntry({
            role: 'assistant',
            content: response,
            mode: 'planning'
          });
          
          // Execute post-command hooks
          await hookSystem.executeHooks('post-command', {
            command: userInput,
            timestamp: new Date(),
            mode: 'planning'
          });
          
          // Trigger completion hook for suggestions
          await hookSystem.executeHooks('completion', {
            command: userInput,
            timestamp: new Date(),
            mode: 'planning'
          });
        }
        console.log('');
      }
    });

  program
    .command('models')
    .description('List available models on the Ollama server')
    .action(async () => {
      try {
        await checkOllamaConnection(config.ollamaUrl);
        const response = await axios.get(`${config.ollamaUrl}/api/tags`);
        const data = response.data;
        if (data.models && data.models.length > 0) {
          console.log('Available models:');
          for (const model of data.models) {
            console.log(`- ${model.name}`);
          }
        } else {
          console.log('No models available.');
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot connect to Ollama')) {
          console.error(error.message);
        } else if (axios.isAxiosError(error)) {
          console.error('Error fetching models:', error.response?.data || error.message);
        } else {
          console.error('Unexpected error:', error);
        }
      }
    });

  program
    .command('config')
    .description('Configure Canvas CLI settings interactively')
    .argument('[action]', 'Optional: show, set, test, reset, help')
    .argument('[key]', 'Config key (for set command)')
    .argument('[value]', 'Config value (for set command)')
    .action(async (action?: string, key?: string, value?: string) => {
      // Import the config command
      const { configCommand } = await import('./commands/config-command.js');
      
      // Build args string from arguments
      let args = '';
      if (action) {
        args = action;
        if (key) {
          args += ` ${key}`;
          if (value) {
            args += ` ${value}`;
          }
        }
      }
      
      // If no arguments provided, show interactive menu
      if (!action) {
        // Launch interactive configuration
        await configCommand.execute('');
      } else {
        // Execute with provided arguments
        const result = await configCommand.execute(args);
        if (result) {
          console.log(result);
        }
      }
    });

  // Better Canvas CLI commands
  
  program
    .command('init')
    .description('Initialize a new project with Canvas CLI templates')
    .argument('[type]', 'Project type (webapp, api, cli, library)', 'webapp')
    .option('-n, --name <name>', 'Project name')
    .option('-t, --template <template>', 'Template to use')
    .action(async (type: string, options: { name?: string; template?: string }) => {
      const commandHandler = new CommandHandler();
      const theme = commandHandler.getThemeManager();
      
      console.log(theme.primary(`🚀 Initializing new ${type} project...`));
      
      // Use AI to generate project structure
      const prompt = `Create a complete project structure for a ${type} project named "${options.name || 'my-project'}". 
      Include all necessary files, folders, configurations, and boilerplate code.
      ${options.template ? `Use the ${options.template} template style.` : ''}`;
      await generateResponseWithTools(prompt, config.defaultModel, commandHandler, true);
    });

  program
    .command('recipe')
    .description('Run predefined workflow recipes')
    .argument('[name]', 'Recipe name to execute')
    .option('-l, --list', 'List available recipes')
    .option('-v, --variables <vars>', 'Variables for recipe (JSON format)')
    .action(async (name: string | undefined, options: { list?: boolean; variables?: string }) => {
      const commandHandler = new CommandHandler();
      const theme = commandHandler.getThemeManager();
      
      if (options.list) {
        // List example recipes
        console.log(theme.primary('📋 Example Recipe Workflows:'));
        console.log(theme.success('  • test-suite: Run complete test suite'));
        console.log(theme.success('  • deploy-app: Deploy application to production'));
        console.log(theme.success('  • code-review: Perform code review'));
        console.log(theme.success('  • refactor: Refactor codebase'));
        console.log(theme.success('  • docs: Generate documentation'));
        return;
      }
      
      if (name) {
        const variables = options.variables ? JSON.parse(options.variables) : {};
        console.log(theme.dim(`🔄 Executing recipe workflow: ${name}`));
        // Use AI to execute the recipe workflow
        const prompt = `Execute the ${name} workflow with these variables: ${JSON.stringify(variables)}`;
        await generateResponseWithTools(prompt, config.defaultModel, commandHandler, true);
      } else {
        console.log(theme.warning('Please specify a recipe name or use --list'));
      }
    });

  // Agent orchestration commands
  program
    .command('agent')
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
  
  program
    .command('tools')
    .description('Manage and list Canvas CLI tools')
    .argument('[action]', 'Action to perform (list, enable, disable, create)')
    .argument('[tool]', 'Tool name for enable/disable actions')
    .action(async (action: string = 'list', tool?: string) => {
      const commandHandler = new CommandHandler();
      const toolRegistry = commandHandler.getToolRegistry();
      const theme = commandHandler.getThemeManager();
      
      switch (action) {
        case 'list':
          const tools = toolRegistry.listEnabled();
          console.log(theme.primary('🛠️  Available Tools:'));
          tools.forEach(t => {
            const status = toolRegistry.isEnabled(t.name) ? '✅' : '❌';
            console.log(`  ${status} ${t.name}: ${t.description}`);
          });
          break;
          
        case 'enable':
          if (tool) {
            toolRegistry.enable(tool);
            console.log(theme.success(`✅ Enabled tool: ${tool}`));
          }
          break;
          
        case 'disable':
          if (tool) {
            toolRegistry.disable(tool);
            console.log(theme.warning(`❌ Disabled tool: ${tool}`));
          }
          break;
          
        case 'create':
          console.log(theme.primary('🔨 Creating new tool...'));
          console.log(theme.dim('Use the chat command to create custom tools with AI assistance'));
          break;
      }
    });

  program
    .command('context')
    .description('Manage conversation context and memory')
    .argument('[action]', 'Action to perform (show, clear, save, load)')
    .option('-f, --file <file>', 'File for save/load operations')
    .action(async (action: string = 'show', options: { file?: string }) => {
      const commandHandler = new CommandHandler();
      const contextLoader = new ContextLoader();
      const theme = commandHandler.getThemeManager();
      
      switch (action) {
        case 'show':
          const context = await contextLoader.loadContext();
          console.log(theme.primary('📚 Current Context:'));
          console.log(JSON.stringify(context, null, 2));
          break;
          
        case 'clear':
          // Clear context by saving empty object
          const emptyContext = { files: [], memory: [] };
          await fs.writeFile('.canvas-context.json', JSON.stringify(emptyContext, null, 2));
          console.log(theme.success('✨ Context cleared'));
          break;
          
        case 'save':
          if (options.file) {
            const context = await contextLoader.loadContext();
            await fs.writeFile(options.file, JSON.stringify(context, null, 2));
            console.log(theme.success(`💾 Context saved to ${options.file}`));
          } else {
            console.log(theme.warning('Please specify a file with -f option'));
          }
          break;
          
        case 'load':
          if (options.file) {
            const data = await fs.readFile(options.file, 'utf-8');
            await fs.writeFile('.canvas-context.json', data);
            console.log(theme.success(`📥 Context loaded from ${options.file}`));
          } else {
            console.log(theme.warning('Please specify a file with -f option'));
          }
          break;
      }
    });

  program
    .command('export')
    .description('Export conversations and sessions')
    .option('-f, --format <format>', 'Export format (md, json, html)', 'md')
    .option('-o, --output <file>', 'Output file path', 'export.md')
    .action(async (options: { format: string; output: string }) => {
      const commandHandler = new CommandHandler();
      const checkpointManager = commandHandler.getCheckpointManager();
      const theme = commandHandler.getThemeManager();
      
      const session = await checkpointManager.loadAutoSave();
      
      if (!session) {
        console.log(theme.warning('No session to export'));
        return;
      }
      
      let content = '';
      
      switch (options.format) {
        case 'md':
          content = '# Canvas CLI Session\n\n';
          session.messages.forEach(msg => {
            content += `## ${msg.role === 'user' ? '👤 User' : '🤖 Canvas CLI'}\n`;
            content += `*${msg.timestamp}*\n\n`;
            content += `${msg.content}\n\n---\n\n`;
          });
          break;
          
        case 'json':
          content = JSON.stringify(session, null, 2);
          break;
          
        case 'html':
          content = `<!DOCTYPE html>
<html>
<head>
  <title>Canvas CLI Session</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
    .user { background: #e3f2fd; }
    .assistant { background: #f3e5f5; }
    .timestamp { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Canvas CLI Session</h1>
  ${session.messages.map(msg => `
    <div class="message ${msg.role}">
      <strong>${msg.role === 'user' ? '👤 User' : '🤖 Canvas CLI'}</strong>
      <div class="timestamp">${msg.timestamp}</div>
      <div>${msg.content}</div>
    </div>
  `).join('')}
</body>
</html>`;
          break;
      }
      
      await fs.writeFile(options.output, content);
      console.log(theme.success(`📄 Session exported to ${options.output}`));
    });

  // Register the Ink UI command
  registerInkUICommand(program);

  // Register the update command
  program.addCommand(createUpdateCommand());

  // Register the install command
  program.addCommand(createInstallCommand());

  // Knowledge management commands
  program
    .command('crawl')
    .description('Crawl and index documentation from a website')
    .argument('<url>', 'URL to start crawling from')
    .option('-d, --depth <depth>', 'Maximum crawl depth', '3')
    .option('-m, --max <pages>', 'Maximum pages to crawl', '50')
    .option('-i, --include <patterns>', 'Include URL patterns (comma-separated)')
    .option('-e, --exclude <patterns>', 'Exclude URL patterns (comma-separated)')
    .action(async (url: string, options: any) => {
      const commandHandler = new CommandHandler();
      const toolRegistry = commandHandler.getToolRegistry();
      const theme = commandHandler.getThemeManager();
      
      console.log(theme.primary(`🕷️  Starting web crawler for ${url}`));
      
      const crawlOptions = {
        url,
        maxDepth: parseInt(options.depth),
        maxPages: parseInt(options.max),
        includePatterns: options.include ? options.include.split(',') : undefined,
        excludePatterns: options.exclude ? options.exclude.split(',') : undefined
      };
      
      try {
        const result = await toolRegistry.execute('web_crawler', crawlOptions);
        console.log(theme.success(`✅ Crawled ${result.pagesCount} pages`));
        if (result.knowledgeDir) {
          console.log(theme.dim(`📁 Knowledge saved to ${result.knowledgeDir}/`));
        }
      } catch (error: any) {
        console.log(theme.error(`❌ Crawl failed: ${error.message}`));
      }
    });

  program
    .command('search')
    .description('Search through crawled knowledge base')
    .argument('<query>', 'Search query')
    .option('-l, --limit <limit>', 'Maximum results to show', '10')
    .option('-c, --code', 'Include code examples in results')
    .option('-f, --fuzzy', 'Enable fuzzy matching')
    .action(async (query: string, options: any) => {
      const commandHandler = new CommandHandler();
      const toolRegistry = commandHandler.getToolRegistry();
      const theme = commandHandler.getThemeManager();
      
      const searchOptions = {
        query,
        limit: parseInt(options.limit),
        includeCode: options.code || false,
        fuzzy: options.fuzzy || false
      };
      
      try {
        const result = await toolRegistry.execute('knowledge_search', searchOptions);
        if (result.totalResults === 0) {
          console.log(theme.warning('No results found. Try crawling some documentation first with "canvas crawl <url>"'));
        }
      } catch (error: any) {
        console.log(theme.error(`❌ Search failed: ${error.message}`));
      }
    });

  // New Feature Commands (only if features loaded successfully)
  if (featureManager) {
    program
      .command('palette')
      .description('Open smart command palette (Ctrl+P)')
      .action(async () => {
        const palette = CanvasFeatures.getProductivity().commandPalette;
        await palette.open();
      });

  program
    .command('notebook')
    .description('Manage interactive notebooks')
    .argument('[action]', 'Action: create, open, list, execute')
    .argument('[name]', 'Notebook name')
    .action(async (action?: string, name?: string) => {
      const notebooks = CanvasFeatures.getProductivity().notebooks;
      
      if (action === 'create' && name) {
        const nb = notebooks.createNotebook(name);
        console.log(chalk.green(`Created notebook: ${nb.name}`));
      } else if (action === 'list') {
        const list = notebooks.listNotebooks();
        list.forEach(nb => console.log(`- ${nb.name} (${nb.modified})`));
      } else {
        console.log('Usage: canvas notebook <create|open|list|execute> [name]');
      }
    });

  program
    .command('share')
    .description('Start live session sharing')
    .option('-n, --name <name>', 'Session name', 'Canvas Session')
    .action(async (options) => {
      const sharing = CanvasFeatures.getCollaboration().sessionSharing;
      const session = await sharing.startSharing(options.name);
      console.log(chalk.cyan(`Session ID: ${session.id}`));
    });

  program
    .command('voice')
    .description('Control voice commands')
    .argument('[action]', 'Action: start, stop, train')
    .action(async (action?: string) => {
      const voice = CanvasFeatures.getInterfaces().voiceCommand;
      
      if (action === 'start') {
        await voice.startListening();
      } else if (action === 'stop') {
        await voice.stopListening();
      } else {
        console.log('Usage: canvas voice <start|stop|train>');
      }
    });

  program
    .command('monitor')
    .description('Open performance monitoring dashboard')
    .action(async () => {
      const monitor = CanvasFeatures.getSecurity().performanceMonitor;
      await monitor.start();
      console.log(chalk.cyan('📊 Performance monitoring started'));
    });

  program
    .command('incident')
    .description('Manage incident response mode')
    .argument('[action]', 'Action: activate, deactivate, status')
    .action(async (action?: string) => {
      const incident = CanvasFeatures.getSecurity().incidentResponse;
      
      if (action === 'activate') {
        incident.activate();
      } else if (action === 'deactivate') {
        incident.deactivate();
      } else if (action === 'status') {
        console.log(chalk.cyan('Incident response mode status checked'));
      } else {
        console.log('Usage: canvas incident <activate|deactivate|status>');
      }
    });

  program
    .command('workspace')
    .description('Manage persistent workspace state')
    .argument('[action]', 'Action: save, restore, list')
    .action(async (action?: string) => {
      const workspace = CanvasFeatures.getProductivity().workspaceState;
      
      if (action === 'save') {
        const ws = await workspace.createWorkspace('current');
        console.log(chalk.green(`Workspace saved: ${ws.id}`));
      } else if (action === 'restore') {
        const list = await workspace.listWorkspaces();
        if (list.length > 0) {
          await workspace.loadWorkspace(list[0].id);
          console.log(chalk.green('Workspace restored'));
        }
      } else if (action === 'list') {
        const list = await workspace.listWorkspaces();
        list.forEach(ws => console.log(`- ${ws.name}`));
      } else {
        console.log('Usage: canvas workspace <save|restore|list>');
      }
    });

  program
    .command('knowledge')
    .description('Access team knowledge base')
    .argument('[action]', 'Action: search, add, list')
    .argument('[query]', 'Search query or content')
    .action(async (action?: string, query?: string) => {
      const kb = CanvasFeatures.getCollaboration().knowledgeBase;
      
      if (action === 'search' && query) {
        const results = await kb.search({ text: query, limit: 10 });
        results.forEach((r: any) => console.log(`- ${r.item?.title || 'Result'}`));
      } else if (action === 'list') {
        console.log('Knowledge base collections listed');
      } else {
        console.log('Usage: canvas knowledge <search|add|list> [query]');
      }
    });
  } // End of feature commands

  // If no command is provided, default to chat command
  if (process.argv.length === 2) {
    // Add 'chat' as the default command
    process.argv.push('chat');
  }
  
  await program.parseAsync();
}

main().catch(console.error);
