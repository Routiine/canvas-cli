# Canvas CLI API Documentation

## Table of Contents
1. [Overview](#overview)
2. [Core APIs](#core-apis)
3. [Tool System APIs](#tool-system-apis)
4. [Command Handler APIs](#command-handler-apis)
5. [Provider APIs](#provider-apis)
6. [Context Management APIs](#context-management-apis)
7. [Recipe System APIs](#recipe-system-apis)
8. [Event System](#event-system)
9. [Extension APIs](#extension-apis)

## Overview

Canvas CLI provides a comprehensive set of TypeScript APIs for building AI-powered command-line applications. All APIs are fully typed and support async/await patterns.

### Installation
```typescript
import { CanvasCLI, CommandHandler, ToolRegistry } from 'canvas-cli';
```

## Core APIs

### CanvasCLI Class

The main entry point for Canvas CLI applications.

```typescript
class CanvasCLI {
  constructor(config?: CanvasConfig);
  
  // Initialize the CLI
  async initialize(): Promise<void>;
  
  // Start interactive chat mode
  async startChat(options?: ChatOptions): Promise<void>;
  
  // Execute a single command
  async execute(command: string, options?: ExecuteOptions): Promise<string>;
  
  // Get the tool registry
  getToolRegistry(): ToolRegistry;
  
  // Get the command handler
  getCommandHandler(): CommandHandler;
  
  // Shutdown the CLI
  async shutdown(): Promise<void>;
}
```

#### Configuration Interface
```typescript
interface CanvasConfig {
  defaultModel?: string;
  defaultProvider?: string;
  providers?: {
    ollama?: OllamaConfig;
    openai?: OpenAIConfig;
    anthropic?: AnthropicConfig;
  };
  tools?: ToolConfig;
  context?: ContextConfig;
  ui?: UIConfig;
  logging?: LogConfig;
}
```

#### Usage Example
```typescript
const cli = new CanvasCLI({
  defaultModel: 'llama3.2',
  defaultProvider: 'ollama',
  providers: {
    ollama: {
      baseUrl: 'http://localhost:11434',
      timeout: 30000
    }
  }
});

await cli.initialize();
const result = await cli.execute('Create a new React component');
console.log(result);
```

## Tool System APIs

### ToolRegistry Class

Manages all available tools in Canvas CLI.

```typescript
class ToolRegistry {
  // Register a new tool
  register(tool: Tool): void;
  
  // Unregister a tool
  unregister(name: string): void;
  
  // Get a specific tool
  get(name: string): Tool | undefined;
  
  // List all tools
  list(): Tool[];
  
  // List enabled tools
  listEnabled(): Tool[];
  
  // Enable a tool
  enable(name: string): void;
  
  // Disable a tool
  disable(name: string): void;
  
  // Check if tool is enabled
  isEnabled(name: string): boolean;
  
  // Execute a tool
  async execute(name: string, params: any): Promise<any>;
  
  // Get tool definitions for AI
  getToolDefinitions(): ToolDefinition[];
}
```

### Tool Interface

Base interface for creating custom tools.

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ParameterDefinition>;
  
  // Execute the tool
  execute(params: any): Promise<any>;
  
  // Validate parameters
  validate?(params: any): ValidationResult;
  
  // Hook called before execution
  beforeExecute?(params: any): Promise<void>;
  
  // Hook called after execution
  afterExecute?(result: any, params: any): Promise<void>;
}
```

### Creating Custom Tools

```typescript
import { BaseTool } from 'canvas-cli';

class CustomTool extends BaseTool {
  name = 'custom_tool';
  description = 'A custom tool for specific tasks';
  parameters = {
    input: {
      type: 'string',
      description: 'Input for the tool',
      required: true
    },
    options: {
      type: 'object',
      description: 'Additional options',
      required: false
    }
  };
  
  async execute(params: { input: string; options?: any }): Promise<string> {
    // Tool implementation
    const result = await this.processInput(params.input);
    return `Processed: ${result}`;
  }
  
  private async processInput(input: string): Promise<string> {
    // Processing logic
    return input.toUpperCase();
  }
}

// Register the tool
const toolRegistry = cli.getToolRegistry();
toolRegistry.register(new CustomTool());
```

### Dynamic Tool Creation

```typescript
class DynamicToolCreator {
  // Create a tool from specification
  async createTool(spec: ToolSpecification): Promise<Tool>;
  
  // Create tool from natural language description
  async createFromDescription(description: string): Promise<Tool>;
  
  // Save tool for persistence
  async saveToolDefinition(tool: Tool): Promise<void>;
  
  // Load custom tools
  async loadCustomTools(): Promise<Tool[]>;
}

interface ToolSpecification {
  name: string;
  description: string;
  parameters: Record<string, any>;
  code: string;
  sandbox?: boolean;
  timeout?: number;
}
```

## Command Handler APIs

### CommandHandler Class

Handles command routing and execution.

```typescript
class CommandHandler {
  constructor();
  
  // Handle a command
  async handleCommand(command: string): Promise<string | null>;
  
  // Add a message to history
  addMessage(message: Message): void;
  
  // Get message history
  getMessages(): Message[];
  
  // Clear message history
  clearMessages(): void;
  
  // Get tool registry
  getToolRegistry(): ToolRegistry;
  
  // Get theme manager
  getThemeManager(): ThemeManager;
  
  // Get checkpoint manager
  getCheckpointManager(): CheckpointManager;
  
  // Set VSCode context
  setVSCodeContext(context: any): void;
  
  // Update token usage
  updateTokenUsage(usage: TokenUsage): void;
  
  // Get token usage
  getTokenUsage(): TokenUsage;
}
```

### Message Interface

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    provider?: string;
    tokens?: TokenUsage;
    tools?: string[];
  };
}
```

## Provider APIs

### Provider Interface

Base interface for AI providers.

```typescript
interface Provider {
  name: string;
  
  // Check if provider is available
  isAvailable(): Promise<boolean>;
  
  // List available models
  listModels(): Promise<Model[]>;
  
  // Generate completion
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  
  // Stream completion
  stream(request: GenerateRequest): AsyncIterableIterator<StreamChunk>;
  
  // Count tokens
  countTokens(text: string, model: string): number;
}
```

### OllamaProvider

```typescript
class OllamaProvider implements Provider {
  constructor(config: OllamaConfig);
  
  // Pull a model
  async pullModel(name: string): Promise<void>;
  
  // Delete a model
  async deleteModel(name: string): Promise<void>;
  
  // Get model info
  async getModelInfo(name: string): Promise<ModelInfo>;
}

interface OllamaConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}
```

### Multi-Provider Orchestrator

```typescript
class ProviderOrchestrator {
  constructor();
  
  // Register a provider
  registerProvider(provider: Provider): void;
  
  // Get optimal provider for task
  async getOptimalProvider(task: TaskType): Promise<Provider>;
  
  // Execute with fallback
  async executeWithFallback(
    request: GenerateRequest,
    providers?: string[]
  ): Promise<GenerateResponse>;
  
  // Get provider metrics
  getMetrics(provider: string): ProviderMetrics;
}
```

## Context Management APIs

### ContextManager Class

```typescript
class ContextManager {
  constructor(config?: ContextConfig);
  
  // Add context
  addContext(content: ContextItem): void;
  
  // Remove context
  removeContext(id: string): void;
  
  // Get current context
  getContext(): ContextItem[];
  
  // Compress context
  async compressContext(strategy: CompressionStrategy): Promise<void>;
  
  // Calculate token usage
  calculateTokens(model: string): number;
  
  // Export context
  exportContext(format: 'json' | 'markdown'): string;
  
  // Import context
  importContext(data: string, format: 'json' | 'markdown'): void;
}

interface ContextItem {
  id: string;
  type: 'file' | 'message' | 'memory' | 'tool_result';
  content: string;
  metadata?: {
    filename?: string;
    timestamp?: Date;
    importance?: number;
    tokens?: number;
  };
}

type CompressionStrategy = 'drop_oldest' | 'smart_trim' | 'summarize' | 'rag';
```

### SmartContext with RAG

```typescript
class SmartContextManager extends ContextManager {
  // Initialize RAG system
  async initializeRAG(config: RAGConfig): Promise<void>;
  
  // Add document to RAG
  async addDocument(document: Document): Promise<void>;
  
  // Query relevant context
  async queryContext(query: string, k?: number): Promise<ContextItem[]>;
  
  // Rerank results
  async rerankResults(
    results: ContextItem[],
    query: string
  ): Promise<ContextItem[]>;
}

interface RAGConfig {
  embeddingModel?: string;
  vectorStore?: 'memory' | 'faiss' | 'pinecone';
  chunkSize?: number;
  chunkOverlap?: number;
}
```

## Recipe System APIs

### RecipeManager Class

```typescript
class RecipeManager {
  constructor();
  
  // Load recipe from file
  async loadRecipe(path: string): Promise<Recipe>;
  
  // Execute recipe
  async executeRecipe(
    name: string,
    variables?: Record<string, any>
  ): Promise<RecipeResult>;
  
  // List available recipes
  async listRecipes(): Promise<RecipeInfo[]>;
  
  // Create recipe from template
  async createRecipe(template: RecipeTemplate): Promise<Recipe>;
  
  // Validate recipe
  validateRecipe(recipe: Recipe): ValidationResult;
  
  // Export recipe
  exportRecipe(recipe: Recipe, format: 'yaml' | 'json'): string;
}
```

### Recipe Interface

```typescript
interface Recipe {
  version: string;
  name: string;
  description: string;
  author?: string;
  parameters: RecipeParameter[];
  steps: RecipeStep[];
  outputs?: RecipeOutput[];
  hooks?: RecipeHooks;
}

interface RecipeStep {
  id: string;
  type: 'prompt' | 'tool' | 'condition' | 'loop';
  description?: string;
  prompt?: string;
  tool?: {
    name: string;
    params: Record<string, any>;
  };
  condition?: {
    expression: string;
    then: RecipeStep[];
    else?: RecipeStep[];
  };
  loop?: {
    items: string;
    variable: string;
    steps: RecipeStep[];
  };
  retryPolicy?: {
    maxAttempts: number;
    backoff: 'linear' | 'exponential';
  };
}
```

### Recipe Templates

```typescript
// Code Review Recipe Template
const codeReviewRecipe: Recipe = {
  version: '1.0.0',
  name: 'code-review',
  description: 'Automated code review with AI',
  parameters: [
    {
      key: 'files',
      type: 'array',
      description: 'Files to review',
      required: true
    },
    {
      key: 'focus',
      type: 'string',
      description: 'Review focus areas',
      default: 'quality,security,performance'
    }
  ],
  steps: [
    {
      id: 'read-files',
      type: 'loop',
      loop: {
        items: '{{ files }}',
        variable: 'file',
        steps: [
          {
            id: 'read-file',
            type: 'tool',
            tool: {
              name: 'read_file',
              params: { path: '{{ file }}' }
            }
          }
        ]
      }
    },
    {
      id: 'analyze',
      type: 'prompt',
      prompt: `Review the following code focusing on {{ focus }}:
{{ context }}`
    }
  ]
};
```

## Event System

### EventEmitter

```typescript
class CanvasEventEmitter extends EventEmitter {
  // Emit typed events
  emit<T extends keyof EventMap>(
    event: T,
    ...args: EventMap[T]
  ): boolean;
  
  // Listen to typed events
  on<T extends keyof EventMap>(
    event: T,
    listener: (...args: EventMap[T]) => void
  ): this;
  
  // One-time listener
  once<T extends keyof EventMap>(
    event: T,
    listener: (...args: EventMap[T]) => void
  ): this;
}

interface EventMap {
  'tool:execute': [name: string, params: any];
  'tool:complete': [name: string, result: any];
  'tool:error': [name: string, error: Error];
  'message:send': [message: Message];
  'message:receive': [message: Message];
  'context:overflow': [tokens: number, limit: number];
  'provider:switch': [from: string, to: string];
  'recipe:start': [name: string];
  'recipe:complete': [name: string, result: any];
}
```

### Event Hooks

```typescript
// Global event hooks
cli.on('tool:execute', (name, params) => {
  console.log(`Executing tool: ${name}`);
});

cli.on('context:overflow', (tokens, limit) => {
  console.log(`Context overflow: ${tokens}/${limit}`);
});

cli.on('provider:switch', (from, to) => {
  console.log(`Switching provider: ${from} -> ${to}`);
});
```

## Extension APIs

### Plugin System

```typescript
interface Plugin {
  name: string;
  version: string;
  
  // Plugin lifecycle
  async install(cli: CanvasCLI): Promise<void>;
  async activate(cli: CanvasCLI): Promise<void>;
  async deactivate(): Promise<void>;
  async uninstall(): Promise<void>;
  
  // Plugin capabilities
  tools?: Tool[];
  commands?: Command[];
  providers?: Provider[];
  recipes?: Recipe[];
}

class PluginManager {
  // Install plugin
  async installPlugin(plugin: Plugin | string): Promise<void>;
  
  // Activate plugin
  async activatePlugin(name: string): Promise<void>;
  
  // Deactivate plugin
  async deactivatePlugin(name: string): Promise<void>;
  
  // List plugins
  listPlugins(): PluginInfo[];
  
  // Get plugin
  getPlugin(name: string): Plugin | undefined;
}
```

### Creating Plugins

```typescript
import { Plugin, CanvasCLI } from 'canvas-cli';

class MyPlugin implements Plugin {
  name = 'my-plugin';
  version = '1.0.0';
  
  tools = [
    new MyCustomTool(),
    new AnotherTool()
  ];
  
  commands = [
    {
      name: 'my-command',
      description: 'Custom command',
      handler: async (args) => {
        // Command implementation
      }
    }
  ];
  
  async install(cli: CanvasCLI): Promise<void> {
    console.log('Installing plugin...');
  }
  
  async activate(cli: CanvasCLI): Promise<void> {
    // Register tools
    const registry = cli.getToolRegistry();
    this.tools.forEach(tool => registry.register(tool));
    
    console.log('Plugin activated');
  }
  
  async deactivate(): Promise<void> {
    console.log('Plugin deactivated');
  }
  
  async uninstall(): Promise<void> {
    console.log('Uninstalling plugin...');
  }
}

export default MyPlugin;
```

## Advanced APIs

### Token Management

```typescript
class TokenManager {
  constructor(config?: TokenConfig);
  
  // Count tokens for text
  countTokens(text: string, model: string): number;
  
  // Estimate cost
  estimateCost(tokens: TokenUsage, model: string): CostEstimate;
  
  // Check if within limits
  isWithinLimits(tokens: number, model: string): boolean;
  
  // Get model limits
  getModelLimits(model: string): ModelLimits;
  
  // Optimize for token usage
  async optimizePrompt(
    prompt: string,
    model: string,
    targetTokens?: number
  ): Promise<string>;
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface ModelLimits {
  contextWindow: number;
  maxOutput: number;
  costPer1kTokens: {
    input: number;
    output: number;
  };
}
```

### Error Handling

```typescript
class ErrorHandler {
  constructor();
  
  // Register error handler
  registerHandler(
    errorType: ErrorType,
    handler: ErrorHandlerFunction
  ): void;
  
  // Handle error
  async handleError(error: Error): Promise<ErrorRecoveryAction>;
  
  // Get error statistics
  getErrorStats(): ErrorStatistics;
  
  // Clear error history
  clearErrorHistory(): void;
}

interface ErrorRecoveryAction {
  type: 'retry' | 'fallback' | 'abort' | 'continue';
  retryConfig?: {
    maxAttempts: number;
    delay: number;
    backoff: 'linear' | 'exponential';
  };
  fallbackProvider?: string;
  message?: string;
}
```

### Monitoring and Analytics

```typescript
class MonitoringService {
  constructor();
  
  // Track metric
  trackMetric(name: string, value: number, tags?: Record<string, string>): void;
  
  // Track event
  trackEvent(name: string, properties?: Record<string, any>): void;
  
  // Get metrics
  getMetrics(
    name: string,
    timeRange?: TimeRange
  ): Metric[];
  
  // Generate report
  generateReport(
    timeRange: TimeRange,
    format: 'json' | 'html' | 'markdown'
  ): string;
  
  // Set up alerts
  setupAlert(config: AlertConfig): void;
}

interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

interface AlertConfig {
  metric: string;
  condition: 'above' | 'below' | 'equals';
  threshold: number;
  action: (metric: Metric) => void;
}
```

## Testing APIs

### Test Utilities

```typescript
import { TestRunner, MockTool, MockProvider } from 'canvas-cli/testing';

class TestRunner {
  // Run tool tests
  async testTool(
    tool: Tool,
    testCases: ToolTestCase[]
  ): Promise<TestResults>;
  
  // Run recipe tests
  async testRecipe(
    recipe: Recipe,
    testCases: RecipeTestCase[]
  ): Promise<TestResults>;
  
  // Mock provider responses
  mockProvider(provider: string, responses: MockResponse[]): void;
  
  // Verify tool calls
  verifyToolCalls(expected: ExpectedToolCall[]): void;
}

// Example test
describe('CustomTool', () => {
  let runner: TestRunner;
  let tool: CustomTool;
  
  beforeEach(() => {
    runner = new TestRunner();
    tool = new CustomTool();
  });
  
  it('should process input correctly', async () => {
    const results = await runner.testTool(tool, [
      {
        input: { input: 'hello' },
        expected: 'Processed: HELLO'
      },
      {
        input: { input: 'world' },
        expected: 'Processed: WORLD'
      }
    ]);
    
    expect(results.passed).toBe(2);
    expect(results.failed).toBe(0);
  });
});
```

## Best Practices

### 1. Tool Development
- Always validate parameters before execution
- Implement proper error handling
- Use TypeScript for type safety
- Add comprehensive logging
- Implement retry logic for network operations

### 2. Context Management
- Monitor token usage closely
- Implement compression strategies
- Use RAG for large document sets
- Prioritize recent and relevant context

### 3. Error Handling
- Use structured error types
- Implement recovery strategies
- Log errors with context
- Provide user-friendly error messages

### 4. Performance
- Stream responses when possible
- Cache frequently used data
- Use connection pooling
- Implement request batching

### 5. Security
- Validate all user inputs
- Sandbox dynamic code execution
- Never store credentials in plain text
- Use secure communication channels

## Migration Guide

### From v1.x to v2.0

```typescript
// v1.x
import { CLI } from 'canvas-cli';
const cli = new CLI();

// v2.0
import { CanvasCLI } from 'canvas-cli';
const cli = new CanvasCLI({
  defaultProvider: 'ollama'
});
await cli.initialize();
```

### Tool API Changes

```typescript
// v1.x
class OldTool {
  run(params: any): any {
    // Implementation
  }
}

// v2.0
class NewTool extends BaseTool {
  async execute(params: any): Promise<any> {
    // Implementation
  }
}
```

## Support

For additional support and examples:
- GitHub: https://github.com/canvas-cli/canvas-cli
- Documentation: https://canvas-cli.dev/docs
- Discord: https://discord.gg/canvas-cli
- Email: support@canvas-cli.dev

---

*Last updated: December 2024 - Canvas CLI v2.0.0*