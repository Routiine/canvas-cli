/**
 * Ollama API type definitions
 */

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  tools?: any[];
  messages?: any[];
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  tool_calls?: any[];
  eval_count?: number;
  prompt_eval_count?: number;
}

export interface OllamaModel {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

export interface TokenCount {
  input: number;
  output: number;
}