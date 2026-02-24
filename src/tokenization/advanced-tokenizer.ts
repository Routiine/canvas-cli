import { AutoTokenizer } from '@xenova/transformers';
import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_CONTEXT_LIMIT = 128_000;

// Tokenizer names for HuggingFace models
export const GPT_4O_TOKENIZER = 'Xenova/gpt-4o';
export const CLAUDE_TOKENIZER = 'Xenova/claude-tokenizer';
export const LLAMA_TOKENIZER = 'Xenova/llama-tokenizer';

// Model-specific context limits
const MODEL_SPECIFIC_LIMITS = new Map<string, number>([
  // OpenAI models
  ['gpt-4o', 128_000],
  ['gpt-4-turbo', 128_000],
  ['o3', 200_000],
  ['o3-mini', 200_000],
  ['o4-mini', 200_000],
  ['gpt-4.1', 1_000_000],
  ['gpt-4-1', 1_000_000],
  
  // Anthropic models
  ['claude', 200_000],
  ['claude-3', 200_000],
  ['claude-3.5', 200_000],
  
  // Google models
  ['gemini-2.5', 1_000_000],
  ['gemini-2-5', 1_000_000],
  
  // Meta Llama models
  ['llama3.2', 128_000],
  ['llama3.3', 128_000],
  
  // Ollama common models
  ['llama3', 128_000],
  ['llama2', 8_192],
  ['mistral', 32_768],
  ['qwen', 32_768],
  ['codellama', 16_384]
]);

export interface ToolUsage {
  name: string;
  description: string;
  input_schema: any;
}

export interface Message {
  role: string;
  content: string;
}

/**
 * Advanced tokenizer with HuggingFace integration
 * Based on goose-cli's tokenizer system
 */
export class AdvancedTokenizer {
  private tokenizer: any | null = null;
  private tokenizerName: string;
  private cacheDir: string;

  constructor(tokenizerName?: string) {
    this.tokenizerName = tokenizerName || this.inferTokenizerFromModel('gpt-4o');
    this.cacheDir = path.join(os.tmpdir(), 'canvas-cli-tokenizers');
  }

  /**
   * Initialize tokenizer by loading or downloading
   */
  async initialize(): Promise<void> {
    try {
      this.tokenizer = await this.loadOrDownloadTokenizer();
    } catch (error: any) {
      console.warn(`Failed to initialize tokenizer: ${error.message}`);
      // Fallback to basic estimation
      this.tokenizer = null;
    }
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    if (!this.tokenizer) {
      // Fallback to basic estimation (roughly 4 chars per token)
      return Math.ceil(text.length / 4);
    }

    try {
      const encoded = this.tokenizer.encode(text);
      return encoded.getLength();
    } catch (error) {
      // Fallback on error
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Count tokens for tool definitions
   */
  countTokensForTools(tools: ToolUsage[]): number {
    if (!tools || tools.length === 0) return 0;

    // Token costs based on goose-cli analysis
    const funcInit = 7; // Tokens for function initialization
    const propInit = 3; // Tokens for properties initialization  
    const propKey = 3; // Tokens for each property key
    const enumInit = -3; // Tokens adjustment for enum list start
    const enumItem = 3; // Tokens for each enum item
    const funcEnd = 12; // Tokens for function ending

    let totalTokens = 0;

    for (const tool of tools) {
      totalTokens += funcInit;
      
      // Count tokens in name and description
      const nameDesc = `${tool.name}:${tool.description.replace(/\.$/, '')}`;
      totalTokens += this.countTokens(nameDesc);

      // Count tokens in properties
      if (tool.input_schema?.properties && typeof tool.input_schema.properties === 'object') {
        const properties = tool.input_schema.properties;
        const propKeys = Object.keys(properties);
        
        if (propKeys.length > 0) {
          totalTokens += propInit;
          
          for (const key of propKeys) {
            totalTokens += propKey;
            const prop = properties[key];
            const propType = prop.type || '';
            const propDesc = (prop.description || '').replace(/\.$/, '');
            const propLine = `${key}:${propType}:${propDesc}`;
            totalTokens += this.countTokens(propLine);

            // Handle enum values
            if (prop.enum && Array.isArray(prop.enum)) {
              totalTokens = Math.max(0, totalTokens + enumInit);
              for (const enumValue of prop.enum) {
                totalTokens += enumItem;
                totalTokens += this.countTokens(String(enumValue));
              }
            }
          }
        }
      }
    }

    totalTokens += funcEnd;
    return totalTokens;
  }

  /**
   * Count tokens for chat messages
   */
  countChatTokens(
    systemPrompt: string,
    messages: Message[],
    tools: ToolUsage[] = []
  ): number {
    const tokensPerMessage = 4; // <|im_start|>ROLE<|im_sep|>MESSAGE<|im_end|>
    let totalTokens = 0;

    // System prompt
    if (systemPrompt) {
      totalTokens += this.countTokens(systemPrompt) + tokensPerMessage;
    }

    // Messages
    for (const message of messages) {
      totalTokens += tokensPerMessage;
      totalTokens += this.countTokens(message.content);
    }

    // Tools
    if (tools.length > 0) {
      totalTokens += this.countTokensForTools(tools);
    }

    // Assistant reply primer
    totalTokens += 3;

    return totalTokens;
  }

  /**
   * Get context limit for a model
   */
  getContextLimit(modelName?: string): number {
    if (!modelName) return DEFAULT_CONTEXT_LIMIT;

    // Check exact matches first
    if (MODEL_SPECIFIC_LIMITS.has(modelName)) {
      return MODEL_SPECIFIC_LIMITS.get(modelName)!;
    }

    // Check partial matches
    for (const [pattern, limit] of MODEL_SPECIFIC_LIMITS.entries()) {
      if (modelName.includes(pattern)) {
        return limit;
      }
    }

    return DEFAULT_CONTEXT_LIMIT;
  }

  /**
   * Get all supported model limits
   */
  getAllModelLimits(): Array<{pattern: string, contextLimit: number}> {
    return Array.from(MODEL_SPECIFIC_LIMITS.entries()).map(([pattern, contextLimit]) => ({
      pattern,
      contextLimit
    }));
  }

  /**
   * Infer tokenizer from model name
   */
  private inferTokenizerFromModel(modelName: string): string {
    const lowerModel = modelName.toLowerCase();
    
    if (lowerModel.includes('claude')) {
      return CLAUDE_TOKENIZER;
    } else if (lowerModel.includes('llama')) {
      return LLAMA_TOKENIZER;
    } else {
      return GPT_4O_TOKENIZER; // Default
    }
  }

  /**
   * Load tokenizer from cache or download from HuggingFace
   */
  private async loadOrDownloadTokenizer(): Promise<any> {
    const tokenizerPath = path.join(this.cacheDir, this.tokenizerName.replace('/', '--'), 'tokenizer.json');
    
    // Try to load from cache first
    if (await fs.pathExists(tokenizerPath)) {
      try {
        const tokenizerData = await fs.readFile(tokenizerPath);
        return await AutoTokenizer.from_pretrained(this.tokenizerName);
      } catch (error) {
        console.warn(`Failed to load cached tokenizer: ${error}`);
      }
    }

    // Download from HuggingFace
    console.log(`Downloading tokenizer: ${this.tokenizerName}...`);
    await this.downloadTokenizer();
    
    // Load the downloaded tokenizer
    const tokenizerData = await fs.readFile(tokenizerPath);
    return await AutoTokenizer.from_pretrained(this.tokenizerName);
  }

  /**
   * Download tokenizer from HuggingFace
   */
  private async downloadTokenizer(): Promise<void> {
    const repoId = this.tokenizerName;
    const url = `https://huggingface.co/${repoId}/resolve/main/tokenizer.json`;
    const tokenizerDir = path.join(this.cacheDir, repoId.replace('/', '--'));
    const tokenizerPath = path.join(tokenizerDir, 'tokenizer.json');

    await fs.ensureDir(tokenizerDir);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download tokenizer: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      await fs.writeFile(tokenizerPath, Buffer.from(buffer));
      
      console.log(`Successfully downloaded tokenizer to: ${tokenizerPath}`);
    } catch (error: any) {
      throw new Error(`Failed to download tokenizer from ${url}: ${error.message}`);
    }
  }

  /**
   * Update tokenizer for different model
   */
  async updateForModel(modelName: string): Promise<void> {
    const newTokenizerName = this.inferTokenizerFromModel(modelName);
    if (newTokenizerName !== this.tokenizerName) {
      this.tokenizerName = newTokenizerName;
      this.tokenizer = null;
      await this.initialize();
    }
  }

  /**
   * Check if context limit would be exceeded
   */
  wouldExceedContext(
    systemPrompt: string,
    messages: Message[],
    tools: ToolUsage[],
    modelName: string,
    bufferTokens: number = 1000
  ): boolean {
    const totalTokens = this.countChatTokens(systemPrompt, messages, tools);
    const contextLimit = this.getContextLimit(modelName);
    return totalTokens + bufferTokens > contextLimit;
  }

  /**
   * Get token usage summary
   */
  getUsageSummary(
    systemPrompt: string,
    messages: Message[],
    tools: ToolUsage[],
    modelName: string
  ): {
    systemTokens: number;
    messageTokens: number;
    toolTokens: number;
    totalTokens: number;
    contextLimit: number;
    remainingTokens: number;
    utilizationPercent: number;
  } {
    const systemTokens = systemPrompt ? this.countTokens(systemPrompt) + 4 : 0;
    const messageTokens = messages.reduce((sum, msg) => sum + this.countTokens(msg.content) + 4, 0);
    const toolTokens = this.countTokensForTools(tools);
    const totalTokens = systemTokens + messageTokens + toolTokens + 3; // +3 for assistant primer
    const contextLimit = this.getContextLimit(modelName);
    const remainingTokens = Math.max(0, contextLimit - totalTokens);
    const utilizationPercent = (totalTokens / contextLimit) * 100;

    return {
      systemTokens,
      messageTokens,
      toolTokens,
      totalTokens,
      contextLimit,
      remainingTokens,
      utilizationPercent
    };
  }
}