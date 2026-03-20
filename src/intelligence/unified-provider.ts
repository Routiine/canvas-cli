/**
 * Unified Provider Accessor
 *
 * Bridges src/intelligence/provider-registry.ts (Claude, OpenAI, DeepSeek, Groq, etc.)
 * and src/providers/provider-registry.ts (Gemini, Bedrock, Azure, Ollama, etc.)
 * into a single priority-ordered lookup.
 *
 * Priority order:
 *   1. ANTHROPIC_API_KEY  → claude-sonnet-4-6  (intelligence registry)
 *   2. OPENAI_API_KEY     → gpt-4o-mini         (intelligence registry)
 *   3. GEMINI_API_KEY     → gemini-2.0-flash    (adapter via OpenAI-compat endpoint)
 *   4. DEEPSEEK_API_KEY   → deepseek-chat       (intelligence registry)
 *   5. GROQ_API_KEY       → llama-3.3-70b       (intelligence registry)
 *   6. OPENROUTER_API_KEY → openrouter          (intelligence registry)
 *   7. TOGETHER_API_KEY   → together            (intelligence registry)
 *   8. AZURE_OPENAI_API_KEY → gpt-4o            (adapter via OpenAI-compat endpoint)
 *   9. Anything else already registered in the intelligence registry
 *
 * Note: AWS Bedrock is not included here because it requires AWS SDK signing rather than
 * a simple bearer-token REST call. Bedrock users should use the providers registry directly.
 */

import {
  getProviderRegistry as getIntelRegistry,
  OpenAICompatibleIntelligenceProvider,
  type Provider,
  type Message,
  type CompletionOptions,
} from './provider-registry.js';

export type { Provider, Message, CompletionOptions };

/**
 * Get the best available provider across both registries.
 *
 * Checks the intelligence registry first (already handles Claude, OpenAI, DeepSeek, Groq,
 * OpenRouter, Together from env vars on first call). If nothing is available there, falls
 * through to the providers-registry adapters for Gemini and Azure OpenAI.
 *
 * Returns undefined only when absolutely no provider is configured, in which case callers
 * should fall back to Ollama or a heuristic.
 *
 * @param prefer - Optional provider name to try first (e.g. "gemini", "claude").
 */
export function getUnifiedProvider(prefer?: string): Provider | undefined {
  const intelReg = getIntelRegistry();

  // If a preferred provider is named and it exists in the intelligence registry, return it.
  if (prefer) {
    const named = intelReg.getBestAvailable(prefer);
    if (named) return named;
  }

  // Walk the standard intelligence registry (Claude → OpenAI → DeepSeek → Groq → …).
  // getBestAvailable() with no argument returns the first available in insertion order,
  // which matches the priority the intelligence registry registers them in.
  const intelProvider = intelReg.getBestAvailable();
  if (intelProvider) return intelProvider;

  // Nothing in the intelligence registry — try adapters for providers-registry members
  // that can be wrapped cheaply without async initialization.

  // Gemini via OpenAI-compat endpoint (no extra dependency needed)
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  if (prefer === 'gemini' || (!prefer && geminiKey)) {
    if (geminiKey) {
      return buildGeminiAdapter(geminiKey);
    }
  }

  // Azure OpenAI via OpenAI-compat endpoint
  const azureKey = process.env.AZURE_OPENAI_API_KEY ?? '';
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT ?? '';
  if (prefer === 'azure' || prefer === 'azure-openai' || (!prefer && azureKey && azureEndpoint)) {
    if (azureKey && azureEndpoint) {
      return buildAzureAdapter(azureKey, azureEndpoint);
    }
  }

  return undefined;
}

/**
 * Wrap Google Gemini's OpenAI-compatible endpoint into the intelligence Provider interface.
 * Gemini exposes /v1beta/openai/chat/completions — no extra SDK required.
 */
function buildGeminiAdapter(apiKey: string): Provider {
  const defaultModel =
    process.env.GEMINI_DEFAULT_MODEL ?? 'gemini-2.0-flash';

  return new OpenAICompatibleIntelligenceProvider('gemini', {
    apiKey,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel,
  });
}

/**
 * Wrap Azure OpenAI into the intelligence Provider interface.
 * Azure's endpoint already speaks the OpenAI completions protocol.
 */
function buildAzureAdapter(apiKey: string, endpoint: string): Provider {
  const deployment =
    process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o';

  // Azure uses the deployment name as the model identifier
  return new OpenAICompatibleIntelligenceProvider('azure', {
    apiKey,
    baseUrl: endpoint,
    defaultModel: deployment,
  });
}
