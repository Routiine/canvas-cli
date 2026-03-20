/**
 * AthenaProviderBridge
 * Extends canvas-cli's intelligence provider registry with Groq and Mistral.
 * Called once at Athena module init time; idempotent.
 */

import {
  getProviderRegistry as getIntelligenceRegistry,
  OpenAICompatibleIntelligenceProvider,
} from '../intelligence/provider-registry.js';

let extended = false;

export function extendProviderRegistry(): void {
  if (extended) return;
  extended = true;

  const registry = getIntelligenceRegistry();

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    registry.register(
      'groq',
      new OpenAICompatibleIntelligenceProvider('groq', {
        apiKey: groqKey,
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
      })
    );
  }

  const mistralKey = process.env.MISTRAL_API_KEY;
  if (mistralKey) {
    registry.register(
      'mistral',
      new OpenAICompatibleIntelligenceProvider('mistral', {
        apiKey: mistralKey,
        baseUrl: 'https://api.mistral.ai/v1',
        defaultModel: 'mistral-large-latest',
      })
    );
  }
}

/**
 * Return a snapshot of all providers and whether each is currently available.
 */
export function getProviderStatus(): Array<{
  name: string;
  available: boolean;
  defaultModel: string;
}> {
  const registry = getIntelligenceRegistry();
  const all = registry.getAvailable();
  const names = ['claude', 'openai', 'groq', 'mistral'];

  return names.map((name) => {
    const provider = registry.get(name);
    return {
      name,
      available: provider ? provider.isAvailable() : false,
      defaultModel: provider ? provider.getDefaultModel() : 'n/a',
    };
  }).concat(
    all
      .filter((p) => !names.includes(p.name))
      .map((p) => ({
        name: p.name,
        available: p.isAvailable(),
        defaultModel: p.getDefaultModel(),
      }))
  );
}
