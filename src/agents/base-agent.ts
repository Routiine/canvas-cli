/**
 * Base Agent Class
 * Foundation for all Canvas CLI agents
 */

import { EventEmitter } from 'events';
import type { AgentConfig, AgentResult, AgentLogger, AgentStatus, AgentMetrics } from './agent-types.js';
import axios from 'axios';
import { loadConfig } from '../config.js';

export class BaseAgent extends EventEmitter {
  public config: AgentConfig;
  protected status: AgentStatus = 'idle';
  public metrics: AgentMetrics;
  public logger: AgentLogger;
  protected messages: Array<{ role: string; content: string }> = [];

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.metrics = {
      tasksCompleted: 0,
      tasksFailed: 0,
      averageResponseTime: 0,
      totalTokensUsed: 0,
      uptime: Date.now()
    };

    // Create a simple logger
    this.logger = {
      info: (message: string, ...args: any[]) => {
        console.log(`[${this.config.name}] INFO:`, message, ...args);
      },
      warn: (message: string, ...args: any[]) => {
        console.warn(`[${this.config.name}] WARN:`, message, ...args);
      },
      error: (message: string, ...args: any[]) => {
        console.error(`[${this.config.name}] ERROR:`, message, ...args);
      },
      debug: (message: string, ...args: any[]) => {
        if (process.env.DEBUG) {
          console.log(`[${this.config.name}] DEBUG:`, message, ...args);
        }
      }
    };
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get agent role
   */
  getRole(): string {
    return this.config.role;
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  /**
   * Complete a prompt using the configured model
   */
  async complete(prompt: string): Promise<string> {
    const appConfig = loadConfig();
    const ollamaUrl = appConfig.ollamaUrl || appConfig.ollama?.baseUrl || 'http://localhost:11434';
    const model = this.config.model || appConfig.defaultModel || appConfig.ollama?.defaultModel || 'llama3.2:1b';

    this.status = 'busy';
    const startTime = Date.now();

    try {
      // Build messages array
      const messages = [
        { role: 'system', content: this.config.systemPrompt || `You are ${this.config.name}, a ${this.config.role}.` },
        ...this.messages,
        { role: 'user', content: prompt }
      ];

      const response = await axios.post(`${ollamaUrl}/api/chat`, {
        model,
        messages,
        stream: false,
        options: {
          temperature: this.config.temperature || 0.7,
          num_predict: this.config.maxTokens || 2000
        }
      }, { timeout: 120000 });

      const result = response.data.message?.content || response.data.response || '';

      // Update metrics
      this.metrics.tasksCompleted++;
      const responseTime = Date.now() - startTime;
      this.metrics.averageResponseTime =
        (this.metrics.averageResponseTime * (this.metrics.tasksCompleted - 1) + responseTime) /
        this.metrics.tasksCompleted;

      if (response.data.eval_count) {
        this.metrics.totalTokensUsed += response.data.eval_count;
      }

      // Store in message history
      this.messages.push({ role: 'user', content: prompt });
      this.messages.push({ role: 'assistant', content: result });

      this.status = 'idle';
      return result;
    } catch (error: any) {
      this.status = 'error';
      this.metrics.tasksFailed++;
      this.logger.error(`Completion failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a task
   */
  async execute(task: any): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const prompt = typeof task === 'string' ? task : task.description || JSON.stringify(task);
      const output = await this.complete(prompt);

      return {
        success: true,
        output,
        metadata: {
          duration: Date.now() - startTime,
          agent: this.config.name
        }
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message,
        metadata: {
          duration: Date.now() - startTime,
          agent: this.config.name
        }
      };
    }
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messages = [];
  }

  /**
   * Add a message to history
   */
  addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this.messages.push({ role, content });
  }

  /**
   * Reset the agent
   */
  reset(): void {
    this.messages = [];
    this.status = 'idle';
    this.emit('reset');
  }
}

export default BaseAgent;
