/**
 * Ollama Native Tool Calling Support
 *
 * Converts Canvas CLI tools to Ollama/OpenAI function calling format
 * and handles tool call responses from models that support it.
 */

import axios from 'axios';
import chalk from 'chalk';
import { Tool } from '../types.js';

export interface OllamaToolFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface OllamaTool {
  type: 'function';
  function: OllamaToolFunction;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_call_id?: string;
}

export interface OllamaToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  tools?: OllamaTool[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

/**
 * Convert Canvas CLI tool format to Ollama/OpenAI function format
 */
export function convertToolToOllamaFormat(tool: Tool): OllamaTool {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  if (tool.parameters) {
    for (const [key, param] of Object.entries(tool.parameters)) {
      const paramDef = param as any;
      properties[key] = {
        type: paramDef.type || 'string',
        description: paramDef.description || key
      };
      if (paramDef.enum) {
        properties[key].enum = paramDef.enum;
      }
      if (!paramDef.optional && paramDef.default === undefined) {
        required.push(key);
      }
    }
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required
      }
    }
  };
}

/**
 * Convert all Canvas CLI tools to Ollama format
 */
export function convertToolsToOllamaFormat(tools: Tool[]): OllamaTool[] {
  return tools.map(convertToolToOllamaFormat);
}

/**
 * Parse tool calls from Ollama response
 */
export function parseOllamaToolCalls(message: OllamaMessage): Array<{name: string, parameters: any, id: string}> {
  if (!message.tool_calls || message.tool_calls.length === 0) {
    return [];
  }

  return message.tool_calls.map(tc => {
    let parameters = {};
    try {
      parameters = JSON.parse(tc.function.arguments);
    } catch (e) {
      console.error(chalk.yellow(`Failed to parse tool arguments: ${tc.function.arguments}`));
    }
    return {
      id: tc.id,
      name: tc.function.name,
      parameters
    };
  });
}

/**
 * Check if a model supports native tool calling
 * Based on known Ollama model capabilities
 */
export function supportsNativeToolCalling(modelName: string): boolean {
  const modelLower = modelName.toLowerCase();

  // Models known to support tool calling
  const supportedPatterns = [
    'llama3.1',
    'llama3.2',
    'mistral',
    'mixtral',
    'qwen2',
    'qwen2.5',
    'command-r',
    'firefunction',
    'hermes',
    'nous-hermes',
    'functionary'
  ];

  return supportedPatterns.some(pattern => modelLower.includes(pattern));
}

/**
 * Make a chat request with native tool calling
 */
export async function chatWithTools(
  ollamaUrl: string,
  model: string,
  messages: OllamaMessage[],
  tools: OllamaTool[],
  stream: boolean = false
): Promise<OllamaChatResponse> {
  const request: OllamaChatRequest = {
    model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    stream
  };

  try {
    const response = await axios.post(`${ollamaUrl}/api/chat`, request, {
      timeout: 120000
    });
    return response.data;
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response?.data) {
      throw new Error(`Ollama chat error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * Format tool result as message for conversation continuation
 */
export function createToolResultMessage(toolCallId: string, result: any): OllamaMessage {
  return {
    role: 'tool',
    content: typeof result === 'string' ? result : JSON.stringify(result),
    tool_call_id: toolCallId
  };
}

/**
 * Core tools that should be available in tool calling mode
 * These are the most important Claude Code-like tools
 */
export const CORE_TOOLS = [
  'read_file',
  'write_file',
  'edit_file',
  'list_directory',
  'search_files',
  'run_shell_command',
  'git_status',
  'git_diff',
  'git_commit',
  'glob'
];

/**
 * Filter tools to only include core tools for better model performance
 */
export function filterCoreTools(tools: Tool[]): Tool[] {
  return tools.filter(t => CORE_TOOLS.includes(t.name));
}
