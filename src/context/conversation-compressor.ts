/**
 * Conversation Compressor
 * Automatically summarizes old conversation turns when the context
 * approaches the model's token limit, preserving key information.
 */

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface CompressorOptions {
  /** Maximum tokens before triggering compression */
  maxTokens?: number;
  /** Number of recent messages to always keep uncompressed */
  keepRecent?: number;
  /** Approximate chars-per-token ratio */
  charsPerToken?: number;
}

const DEFAULT_OPTIONS: Required<CompressorOptions> = {
  maxTokens: 100000,
  keepRecent: 10,
  charsPerToken: 4,
};

export class ConversationCompressor {
  private options: Required<CompressorOptions>;

  constructor(options?: CompressorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Estimate token count for a set of messages
   */
  estimateTokens(messages: ConversationMessage[]): number {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / this.options.charsPerToken);
  }

  /**
   * Check if compression is needed
   */
  needsCompression(messages: ConversationMessage[]): boolean {
    return this.estimateTokens(messages) > this.options.maxTokens;
  }

  /**
   * Compress conversation history.
   * Returns a new message array with older messages summarized.
   */
  compress(messages: ConversationMessage[]): ConversationMessage[] {
    if (!this.needsCompression(messages)) return messages;

    const keepCount = this.options.keepRecent;

    // Always keep system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    if (nonSystem.length <= keepCount) return messages;

    // Split into old (to summarize) and recent (to keep)
    const old = nonSystem.slice(0, nonSystem.length - keepCount);
    const recent = nonSystem.slice(nonSystem.length - keepCount);

    // Create a summary of old messages
    const summary = this.summarizeMessages(old);

    return [
      ...systemMessages,
      {
        role: 'system' as const,
        content: `[Conversation summary of ${old.length} earlier messages]\n${summary}`,
        timestamp: Date.now(),
      },
      ...recent,
    ];
  }

  /**
   * Create a concise summary of a set of messages.
   * This is a local heuristic — for better results, use an LLM.
   */
  private summarizeMessages(messages: ConversationMessage[]): string {
    const parts: string[] = [];

    // Extract key topics and decisions
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    if (userMessages.length > 0) {
      // Take first line or first 200 chars of each user message
      const topics = userMessages.map(m => {
        const firstLine = m.content.split('\n')[0].trim();
        return firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine;
      });
      parts.push('User discussed: ' + topics.join('; '));
    }

    if (assistantMessages.length > 0) {
      // Capture key action items from assistant responses
      const actions: string[] = [];
      for (const m of assistantMessages) {
        // Look for file operations, commands, decisions
        const fileMatches = m.content.match(/(?:created|modified|edited|wrote)\s+[`"']?([^\s`"']+)/gi);
        if (fileMatches) actions.push(...fileMatches.slice(0, 3));

        const commandMatches = m.content.match(/(?:ran|executed|running)\s+[`"']([^`"']+)[`"']/gi);
        if (commandMatches) actions.push(...commandMatches.slice(0, 3));
      }

      if (actions.length > 0) {
        parts.push('Actions taken: ' + [...new Set(actions)].slice(0, 10).join('; '));
      }
    }

    return parts.join('\n') || `(${messages.length} messages exchanged)`;
  }
}

/**
 * Create a compressor with sensible defaults for a given model context size
 */
export function createCompressor(contextSize: number = 128000): ConversationCompressor {
  return new ConversationCompressor({
    maxTokens: Math.floor(contextSize * 0.75), // Compress at 75% capacity
    keepRecent: 10,
  });
}
