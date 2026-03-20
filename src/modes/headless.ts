import { EventEmitter } from 'events';
import { confirmationService } from '../utils/confirmation-service.js';
import { errorHandler } from '../utils/error-handler.js';
import { performanceConfig } from '../config/performance.js';
import { TokenCounter, formatTokenCount } from '../utils/token-counter.js';
import { StreamingHandler } from '../utils/streaming-handler.js';
import { loadConfig } from '../config.js';

export interface HeadlessOptions {
  prompt: string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
  maxToolRounds?: number;
  outputFormat?: 'json' | 'text' | 'markdown';
  autoApprove?: boolean;
  stream?: boolean;
  verbose?: boolean;
  timeout?: number;
}

export interface HeadlessResult {
  success: boolean;
  messages?: any[];
  error?: string;
  metrics?: {
    duration: number;
    tokenCount: number;
    toolRounds: number;
    errors: number;
  };
}

export class HeadlessMode extends EventEmitter {
  private tokenCounter: TokenCounter;
  private streamingHandler: StreamingHandler;
  private startTime: number = 0;
  private toolRounds: number = 0;
  private errors: number = 0;

  constructor(private options: HeadlessOptions) {
    super();
    const config = loadConfig();
    this.tokenCounter = new TokenCounter(options.model || config.defaultModel);
    this.streamingHandler = new StreamingHandler(options.model || config.defaultModel);
    
    // Configure for headless mode
    this.configureHeadlessEnvironment();
  }

  /**
   * Configure environment for headless execution
   */
  private configureHeadlessEnvironment(): void {
    const config = performanceConfig.getConfig();
    
    // Set headless mode in performance config
    performanceConfig.updateConfig({
      headless: {
        enabled: true,
        autoApprove: this.options.autoApprove ?? config.headless.autoApprove,
        outputFormat: this.options.outputFormat ?? config.headless.outputFormat
      }
    });

    // Configure confirmation service for auto-approval if specified
    if (this.options.autoApprove) {
      confirmationService.setSessionFlag('allOperations', true);
    }

    // Disable interactive features
    process.env.CANVAS_HEADLESS = 'true';
    
    // Set up error handling
    errorHandler.on('error', (context) => {
      this.errors++;
      if (this.options.verbose) {
        console.error(`[ERROR] ${context.operation}: ${context.error.message}`);
      }
    });
  }

  /**
   * Execute prompt in headless mode
   */
  async execute(): Promise<HeadlessResult> {
    this.startTime = Date.now();
    
    try {
      // Validate options
      this.validateOptions();
      
      // Process the prompt
      const result = await this.processPrompt();
      
      // Calculate metrics
      const metrics = this.calculateMetrics();
      
      // Format and return result
      return this.formatResult(result, metrics);
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metrics: this.calculateMetrics()
      };
    } finally {
      this.cleanup();
    }
  }

  /**
   * Validate headless options
   */
  private validateOptions(): void {
    if (!this.options.prompt) {
      throw new Error('Prompt is required for headless mode');
    }
    const maxRounds = this.options.maxToolRounds ?? performanceConfig.getConfig().toolLimits.maxRounds;
    if (maxRounds < 1 || maxRounds > 1000) {
      throw new Error('maxToolRounds must be between 1 and 1000');
    }
  }

  /**
   * Process the prompt
   */
  private async processPrompt(): Promise<any[]> {
    const messages: any[] = [];
    
    // Add system message
    messages.push({
      role: 'system',
      content: 'You are Canvas CLI in headless mode. Respond concisely and execute tasks efficiently.'
    });
    
    // Add user prompt
    messages.push({
      role: 'user',
      content: this.options.prompt
    });
    
    // Process with configured agent
    const agent = await this.createAgent();
    
    // Execute with tool rounds limit
    const maxRounds = this.options.maxToolRounds ?? performanceConfig.getConfig().toolLimits.maxRounds;
    
    while (this.toolRounds < maxRounds) {
      const response = await this.executeWithTimeout(
        () => agent.processMessages(messages),
        this.options.timeout ?? performanceConfig.getTimeout('api')
      );
      
      if (!(response as any).requiresTools) {
        // Push the final assistant turn so callers can extract it
        if ((response as any).response) {
          messages.push({ role: 'assistant', content: (response as any).response });
        }
        break;
      }

      this.toolRounds++;

      // Push the assistant turn that contained the tool calls, then the tool results
      if ((response as any).response) {
        messages.push({ role: 'assistant', content: (response as any).response });
      }
      messages.push(...(response as any).toolResults);
    }
    
    return messages;
  }

  /**
   * Create agent based on available providers.
   * Priority: Anthropic → OpenAI (or any registered provider) → Ollama HTTP fallback.
   *
   * When an API provider is available, responses are parsed for TOOL:/PARAMS: blocks
   * using parseToolCalls(), each tool is executed via the ToolRegistry, and the
   * results are returned so processPrompt() can feed them back into the next round.
   */
  private async createAgent(): Promise<any> {
    const { getUnifiedProvider } = await import('../intelligence/unified-provider.js');
    const { parseToolCalls } = await import('../toolPrompt.js');
    const { CommandHandler } = await import('../commands.js');

    const provider = getUnifiedProvider();
    const handler = new CommandHandler();
    const toolRegistry = handler.getToolRegistry();

    if (!provider) {
      // Ollama fallback — generateResponseWithTools handles tool execution natively
      return {
        processMessages: async (messages: any[]) => {
          const { generateResponseWithTools } = await import('../ollama/response-generator.js');
          const userMsg = [...messages].reverse().find((m: any) => m.role === 'user');
          const result = await generateResponseWithTools(
            userMsg?.content || this.options.prompt,
            this.options.model || 'llama3.2',
            handler as any,
            true // execution mode
          );
          return { requiresTools: false, toolResults: [], response: result };
        },
      };
    }

    // API provider path: call provider, parse tool calls, execute them, return results
    return {
      processMessages: async (messages: any[]) => {
        const response = await provider.complete(messages, {
          model: this.options.model || provider.getDefaultModel(),
          stream: false,
        });

        // Parse any tool calls from the response text
        const toolCalls = parseToolCalls(response);

        if (toolCalls.length === 0) {
          // No tools needed — print the response and signal done
          if (this.options.outputFormat !== 'json') {
            process.stdout.write(response + '\n');
          }
          return { requiresTools: false, toolResults: [], response };
        }

        // Execute each tool call and collect results
        const toolResults: any[] = [];
        for (const toolCall of toolCalls) {
          try {
            const result = await toolRegistry.execute(toolCall.name, toolCall.parameters);
            toolResults.push({
              role: 'tool',
              content: typeof result === 'string' ? result : JSON.stringify(result),
              tool_call_id: toolCall.name,
            });
            if (this.options.verbose) {
              console.error(`[tool] ${toolCall.name}: ${String(result).slice(0, 100)}`);
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            toolResults.push({
              role: 'tool',
              content: `Error: ${message}`,
              tool_call_id: toolCall.name,
            });
          }
        }

        return { requiresTools: true, toolResults, response };
      },
    };
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout)
    );
    
    return Promise.race([fn(), timeoutPromise]);
  }

  /**
   * Calculate execution metrics
   */
  private calculateMetrics(): HeadlessResult['metrics'] {
    const duration = Date.now() - this.startTime;
    const tokenCount = this.tokenCounter.countTokens(this.options.prompt);
    
    return {
      duration,
      tokenCount,
      toolRounds: this.toolRounds,
      errors: this.errors
    };
  }

  /**
   * Format result based on output format
   */
  private formatResult(messages: any[], metrics: HeadlessResult['metrics']): HeadlessResult {
    const format = this.options.outputFormat ?? 'json';
    
    switch (format) {
      case 'json':
        return {
          success: true,
          messages,
          metrics
        };
      
      case 'text':
        // Convert to plain text
        const text = messages
          .filter(m => m.role === 'assistant')
          .map(m => m.content)
          .join('\n\n');
        
        console.log(text);
        return { success: true, metrics };
      
      case 'markdown':
        // Convert to markdown
        const markdown = this.formatAsMarkdown(messages, metrics);
        console.log(markdown);
        return { success: true, metrics };
      
      default:
        return { success: true, messages, metrics };
    }
  }

  /**
   * Format messages as markdown
   */
  private formatAsMarkdown(messages: any[], metrics?: HeadlessResult['metrics']): string {
    let markdown = '# Canvas CLI Headless Execution\n\n';
    
    // Add prompt
    markdown += '## Prompt\n\n';
    markdown += '```\n' + this.options.prompt + '\n```\n\n';
    
    // Add response
    markdown += '## Response\n\n';
    
    for (const message of messages) {
      if (message.role === 'assistant') {
        markdown += message.content + '\n\n';
      } else if (message.role === 'tool' && this.options.verbose) {
        markdown += '### Tool Execution\n\n';
        markdown += '```json\n' + JSON.stringify(message, null, 2) + '\n```\n\n';
      }
    }
    
    // Add metrics if verbose
    if (metrics && this.options.verbose) {
      markdown += '## Metrics\n\n';
      markdown += `- **Duration**: ${metrics.duration}ms\n`;
      markdown += `- **Tokens**: ${formatTokenCount(metrics.tokenCount)}\n`;
      markdown += `- **Tool Rounds**: ${metrics.toolRounds}\n`;
      markdown += `- **Errors**: ${metrics.errors}\n`;
    }
    
    return markdown;
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    this.tokenCounter.dispose();
    this.streamingHandler.dispose();
    
    // Reset headless configuration
    if (this.options.autoApprove) {
      confirmationService.resetSessionFlags();
    }
    
    delete process.env.CANVAS_HEADLESS;
  }
}

/**
 * Execute command in headless mode
 */
export async function executeHeadless(options: HeadlessOptions): Promise<HeadlessResult> {
  const headless = new HeadlessMode(options);
  return headless.execute();
}

/**
 * Headless mode for Git operations
 */
export class HeadlessGit {
  constructor(private options: HeadlessOptions) {}

  /**
   * Commit and push in headless mode
   */
  async commitAndPush(): Promise<HeadlessResult> {
    const startTime = Date.now();
    
    try {
      // Check for changes
      const status = await this.executeCommand('git status --porcelain');
      
      if (!status.trim()) {
        return {
          success: false,
          error: 'No changes to commit',
          metrics: {
            duration: Date.now() - startTime,
            tokenCount: 0,
            toolRounds: 0,
            errors: 0
          }
        };
      }
      
      // Stage changes
      await this.executeCommand('git add .');
      
      // Get diff for commit message generation
      const diff = await this.executeCommand('git diff --cached');
      
      // Generate commit message using AI
      const commitMessage = await this.generateCommitMessage(status, diff);
      
      // Commit changes
      await this.executeCommand(`git commit -m "${commitMessage}"`);
      
      // Push to remote
      let pushResult = await this.executeCommand('git push').catch(() => null);
      
      if (!pushResult) {
        // Try with upstream setup
        pushResult = await this.executeCommand('git push -u origin HEAD');
      }
      
      return {
        success: true,
        messages: [{
          role: 'assistant',
          content: `Successfully committed and pushed changes.\nCommit message: ${commitMessage}`
        }],
        metrics: {
          duration: Date.now() - startTime,
          tokenCount: 0,
          toolRounds: 1,
          errors: 0
        }
      };
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          tokenCount: 0,
          toolRounds: 0,
          errors: 1
        }
      };
    }
  }

  /**
   * Execute shell command
   */
  private async executeCommand(command: string): Promise<string> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const timeout = performanceConfig.getTimeout('command');
    const { stdout, stderr } = await execAsync(command, { timeout });
    
    if (stderr && !stdout) {
      throw new Error(stderr);
    }
    
    return stdout;
  }

  /**
   * Generate commit message using AI
   */
  private async generateCommitMessage(status: string, diff: string): Promise<string> {
    // This would integrate with your AI system
    // For now, return a generic message
    const files = status.split('\n').length;
    return `Update ${files} file${files > 1 ? 's' : ''}`;
  }
}

/**
 * Headless mode CLI handler
 */
export function registerHeadlessCommands(program: any): void {
  // Add headless command
  program
    .option('-p, --prompt <prompt>', 'Execute prompt in headless mode')
    .option('--headless', 'Run in headless mode')
    .option('--auto-approve', 'Auto-approve all operations')
    .option('--output-format <format>', 'Output format: json, text, markdown')
    .option('--max-tool-rounds <rounds>', 'Maximum tool execution rounds')
    .option('--verbose', 'Verbose output');

  // Git headless commands
  const gitCommand = program.command('git');
  
  gitCommand
    .command('commit-and-push')
    .description('Commit and push changes with AI-generated message')
    .option('--headless', 'Run in headless mode')
    .action(async (options: any) => {
      const git = new HeadlessGit(options);
      const result = await git.commitAndPush();
      
      if (!result.success) {
        console.error(result.error);
        process.exit(1);
      }
      
      process.exit(0);
    });
}

/**
 * Check if running in headless mode
 */
export function isHeadlessMode(): boolean {
  return process.env.CANVAS_HEADLESS === 'true' || performanceConfig.getConfig().headless.enabled;
}

/**
 * Get headless configuration
 */
export function getHeadlessConfig(): HeadlessOptions {
  const config = performanceConfig.getConfig();
  
  return {
    prompt: process.argv.find(arg => arg.startsWith('--prompt='))?.split('=')[1] || '',
    outputFormat: config.headless.outputFormat,
    autoApprove: config.headless.autoApprove,
    stream: config.streaming.enabled,
    maxToolRounds: config.toolLimits.maxRounds
  };
}