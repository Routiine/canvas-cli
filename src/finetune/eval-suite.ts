/**
 * Priority 5: Evaluation Suite
 * Benchmarks base model vs fine-tuned model
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const TRAINING_DIR = path.join(os.homedir(), '.canvas', 'training');

interface EvalPrompt {
  prompt: string;
  category: string;
}

const EVAL_PROMPTS: EvalPrompt[] = [
  { prompt: 'What does the loadConfig function do?', category: 'codebase-knowledge' },
  { prompt: 'Explain the ModelManager class purpose', category: 'codebase-knowledge' },
  { prompt: 'How would you add error handling to an async function?', category: 'best-practices' },
  { prompt: 'What is the purpose of Zod validation?', category: 'libraries' },
  { prompt: 'How do you write a TypeScript interface?', category: 'typescript' },
  { prompt: 'What is WAL mode in SQLite?', category: 'databases' },
  { prompt: 'How does chokidar work for file watching?', category: 'tools' },
  { prompt: 'Explain the singleton pattern in TypeScript', category: 'patterns' },
  { prompt: 'What is the difference between const and let?', category: 'basics' },
  { prompt: 'How do you handle optional parameters in TypeScript?', category: 'typescript' },
];

interface EvalResult {
  prompt: string;
  category: string;
  baseResponse: string;
  tunedResponse: string;
  baseScore: number;
  tunedScore: number;
}

function scoreResponse(response: string, prompt: string): number {
  // Simple heuristic scoring (0-100)
  let score = 50; // baseline

  // Length check (more detailed is usually better up to a point)
  const words = response.split(/\s+/).length;
  if (words > 50) score += 10;
  if (words > 150) score += 10;
  if (words > 500) score -= 10; // Too verbose

  // Code examples
  if (response.includes('```')) score += 15;

  // Specificity
  if (response.includes('TypeScript') || response.includes('JavaScript')) score += 5;

  return Math.max(0, Math.min(100, score));
}

export async function runEvalSuite(
  baseModel: string = 'llama3.2:3b',
  tunedModel: string = 'canvas-custom'
): Promise<{ results: EvalResult[]; outputFile: string }> {
  const results: EvalResult[] = [];

  for (const evalPrompt of EVAL_PROMPTS) {
    let baseResponse = '';
    let tunedResponse = '';

    // Query base model
    try {
      const baseRes = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: baseModel,
          prompt: evalPrompt.prompt,
          stream: false
        })
      });
      const baseData = await baseRes.json() as { response?: string };
      baseResponse = baseData.response || '';
    } catch {
      baseResponse = '[Model unavailable]';
    }

    // Query tuned model
    try {
      const tunedRes = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: tunedModel,
          prompt: evalPrompt.prompt,
          stream: false
        })
      });
      const tunedData = await tunedRes.json() as { response?: string };
      tunedResponse = tunedData.response || '';
    } catch {
      tunedResponse = '[Model unavailable]';
    }

    results.push({
      prompt: evalPrompt.prompt,
      category: evalPrompt.category,
      baseResponse,
      tunedResponse,
      baseScore: scoreResponse(baseResponse, evalPrompt.prompt),
      tunedScore: scoreResponse(tunedResponse, evalPrompt.prompt)
    });
  }

  await fs.ensureDir(TRAINING_DIR);
  const outputFile = path.join(TRAINING_DIR, 'eval-results.json');
  await fs.writeJson(outputFile, {
    timestamp: new Date().toISOString(),
    baseModel,
    tunedModel,
    results,
    summary: {
      avgBaseScore: results.reduce((s, r) => s + r.baseScore, 0) / results.length,
      avgTunedScore: results.reduce((s, r) => s + r.tunedScore, 0) / results.length,
      improvement: results.reduce((s, r) => s + (r.tunedScore - r.baseScore), 0) / results.length
    }
  }, { spaces: 2 });

  return { results, outputFile };
}
