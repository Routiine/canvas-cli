/**
 * Ollama API client for connection management
 */

import axios from 'axios';
import { loadConfig } from '../config.js';
import type { OllamaTagsResponse, OllamaModel } from './types.js';

export class OllamaClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout?: number) {
    const config = loadConfig();
    this.baseUrl = baseUrl || config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
    this.timeout = timeout || config.ollama?.timeout || 120000;
  }

  /**
   * Get the configured Ollama base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Check if Ollama is reachable
   */
  async checkConnection(): Promise<void> {
    try {
      await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Test connection and return status
   */
  async testConnection(): Promise<{ success: boolean; models?: OllamaModel[]; error?: string }> {
    try {
      const response = await axios.get<OllamaTagsResponse>(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return {
        success: true,
        models: response.data.models || []
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.message
        : error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: message
      };
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModel[]> {
    await this.checkConnection();
    const response = await axios.get<OllamaTagsResponse>(`${this.baseUrl}/api/tags`);
    return response.data.models || [];
  }

  /**
   * Get the generate endpoint URL
   */
  getGenerateUrl(): string {
    return `${this.baseUrl}/api/generate`;
  }

  /**
   * Get the chat endpoint URL
   */
  getChatUrl(): string {
    return `${this.baseUrl}/api/chat`;
  }

  /**
   * Get request timeout
   */
  getTimeout(): number {
    return this.timeout;
  }
}

// Singleton instance for convenience
let defaultClient: OllamaClient | null = null;

export function getOllamaClient(): OllamaClient {
  if (!defaultClient) {
    defaultClient = new OllamaClient();
  }
  return defaultClient;
}

export function resetOllamaClient(): void {
  defaultClient = null;
}

/**
 * Quick connection check utility
 */
export async function checkOllamaConnection(ollamaUrl?: string): Promise<void> {
  const client = ollamaUrl ? new OllamaClient(ollamaUrl) : getOllamaClient();
  await client.checkConnection();
}