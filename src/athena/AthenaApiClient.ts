/**
 * AthenaApiClient
 * HTTP client for connecting to a remote devproject-2 Athena API.
 * Execution events are delivered via Server-Sent Events (SSE).
 */

import axios from 'axios';

export interface ExecutionEvent {
  type: string;
  executionId: string;
  stepId?: string;
  message: string;
  data?: unknown;
  timestamp: Date;
}

export class AthenaApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string
  ) {}

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  async testConnection(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, {
        headers: this.headers,
        timeout: 8000,
      });
      return res.status >= 200 && res.status < 300;
    } catch {
      return false;
    }
  }

  /**
   * Stream execution events for a goal via SSE.
   * Parses `data: {...}` lines from the response body.
   */
  async *executeStream(goal: string): AsyncGenerator<ExecutionEvent> {
    const response = await axios.post(
      `${this.baseUrl}/api/athena/execute`,
      { goal },
      {
        headers: { ...this.headers, Accept: 'text/event-stream' },
        responseType: 'stream',
        timeout: 300000,
      }
    );

    yield* this.parseSSEStream(response.data as NodeJS.ReadableStream);
  }

  async plan(goal: string): Promise<unknown> {
    const res = await axios.post(
      `${this.baseUrl}/api/athena/plan`,
      { goal },
      { headers: this.headers, timeout: 60000 }
    );
    return res.data;
  }

  async approve(executionId: string, approved: boolean): Promise<void> {
    await axios.post(
      `${this.baseUrl}/api/athena/approve`,
      { executionId, approved },
      { headers: this.headers, timeout: 15000 }
    );
  }

  async getMemory(): Promise<unknown[]> {
    const res = await axios.get(`${this.baseUrl}/api/athena/memory`, {
      headers: this.headers,
      timeout: 15000,
    });
    return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
  }

  async getProfile(): Promise<unknown> {
    const res = await axios.get(`${this.baseUrl}/api/athena/profile`, {
      headers: this.headers,
      timeout: 15000,
    });
    return res.data;
  }

  async listRecipes(): Promise<unknown[]> {
    const res = await axios.get(`${this.baseUrl}/api/athena/recipes`, {
      headers: this.headers,
      timeout: 15000,
    });
    return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
  }

  async *runRecipe(
    id: string,
    params?: Record<string, string>
  ): AsyncGenerator<ExecutionEvent> {
    const response = await axios.post(
      `${this.baseUrl}/api/athena/recipes/${id}/run`,
      { params: params ?? {} },
      {
        headers: { ...this.headers, Accept: 'text/event-stream' },
        responseType: 'stream',
        timeout: 300000,
      }
    );

    yield* this.parseSSEStream(response.data as NodeJS.ReadableStream);
  }

  async getCost(): Promise<unknown> {
    const res = await axios.get(`${this.baseUrl}/api/athena/cost`, {
      headers: this.headers,
      timeout: 15000,
    });
    return res.data;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async *parseSSEStream(
    stream: NodeJS.ReadableStream
  ): AsyncGenerator<ExecutionEvent> {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += (chunk as Buffer).toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;

        try {
          const parsed = JSON.parse(raw) as Partial<ExecutionEvent>;
          yield {
            type: parsed.type ?? 'unknown',
            executionId: parsed.executionId ?? '',
            stepId: parsed.stepId,
            message: parsed.message ?? '',
            data: parsed.data,
            timestamp: parsed.timestamp ? new Date(parsed.timestamp as unknown as string) : new Date(),
          };
        } catch {
          // Malformed chunk — skip
        }
      }
    }
  }
}
