/**
 * Model Leaderboard
 * Displays model benchmarks and comparisons to help users choose.
 * Data is curated from public benchmarks (SWE-bench, HumanEval, etc.)
 */

export interface ModelBenchmark {
  model: string;
  provider: string;
  contextWindow: string;
  sweBench?: number;    // SWE-bench Verified (%)
  humanEval?: number;   // HumanEval pass@1 (%)
  pricing: string;      // $/1M tokens (input/output)
  speed?: string;       // tokens/sec estimate
  notes?: string;
}

// Curated benchmark data (updated periodically)
const BENCHMARK_DATA: ModelBenchmark[] = [
  {
    model: 'claude-opus-4-6',
    provider: 'Anthropic',
    contextWindow: '200K',
    sweBench: 72.5,
    humanEval: 95.0,
    pricing: '$15 / $75',
    speed: '~30 tok/s',
    notes: 'Best overall coding, extended thinking',
  },
  {
    model: 'claude-sonnet-4-6',
    provider: 'Anthropic',
    contextWindow: '200K',
    sweBench: 65.0,
    humanEval: 93.0,
    pricing: '$3 / $15',
    speed: '~80 tok/s',
    notes: 'Best value for coding tasks',
  },
  {
    model: 'claude-haiku-4-5',
    provider: 'Anthropic',
    contextWindow: '200K',
    sweBench: 49.0,
    humanEval: 88.0,
    pricing: '$0.25 / $1.25',
    speed: '~150 tok/s',
    notes: 'Fast, cheap, good for simple tasks',
  },
  {
    model: 'gpt-4o',
    provider: 'OpenAI',
    contextWindow: '128K',
    sweBench: 38.4,
    humanEval: 90.2,
    pricing: '$2.50 / $10',
    speed: '~90 tok/s',
  },
  {
    model: 'gpt-4o-mini',
    provider: 'OpenAI',
    contextWindow: '128K',
    sweBench: 23.6,
    humanEval: 87.2,
    pricing: '$0.15 / $0.60',
    speed: '~130 tok/s',
    notes: 'Cheapest OpenAI option',
  },
  {
    model: 'gemini-2.0-flash',
    provider: 'Google',
    contextWindow: '1M',
    humanEval: 89.0,
    pricing: '$0.10 / $0.40',
    speed: '~200 tok/s',
    notes: 'Largest context window, fast',
  },
  {
    model: 'gemini-1.5-pro',
    provider: 'Google',
    contextWindow: '2M',
    humanEval: 91.0,
    pricing: '$1.25 / $5.00',
    speed: '~60 tok/s',
    notes: '2M context, strong reasoning',
  },
  {
    model: 'deepseek-chat',
    provider: 'DeepSeek',
    contextWindow: '64K',
    sweBench: 42.0,
    humanEval: 89.0,
    pricing: '$0.27 / $1.10',
    speed: '~60 tok/s',
    notes: 'Great value, prompt caching support',
  },
  {
    model: 'deepseek-reasoner',
    provider: 'DeepSeek',
    contextWindow: '64K',
    humanEval: 92.0,
    pricing: '$0.55 / $2.19',
    speed: '~30 tok/s',
    notes: 'Chain-of-thought reasoning',
  },
  {
    model: 'llama-3.3-70b',
    provider: 'Local/Groq',
    contextWindow: '128K',
    humanEval: 82.0,
    pricing: 'Free (local) / $0.59',
    speed: 'Varies',
    notes: 'Best open-source option',
  },
];

/**
 * Format the leaderboard as a table string
 */
export function formatLeaderboard(options: {
  sortBy?: 'swe-bench' | 'humaneval' | 'price' | 'speed';
  provider?: string;
  limit?: number;
} = {}): string {
  let data = [...BENCHMARK_DATA];

  // Filter by provider
  if (options.provider) {
    const p = options.provider.toLowerCase();
    data = data.filter(m => m.provider.toLowerCase().includes(p));
  }

  // Sort
  switch (options.sortBy) {
    case 'swe-bench':
      data.sort((a, b) => (b.sweBench || 0) - (a.sweBench || 0));
      break;
    case 'humaneval':
      data.sort((a, b) => (b.humanEval || 0) - (a.humanEval || 0));
      break;
    case 'price':
      // Sort by input price (first number in pricing string)
      data.sort((a, b) => {
        const pa = parseFloat(a.pricing.replace('$', '').split('/')[0]) || 999;
        const pb = parseFloat(b.pricing.replace('$', '').split('/')[0]) || 999;
        return pa - pb;
      });
      break;
    default:
      // Default: sort by SWE-bench then HumanEval
      data.sort((a, b) => (b.sweBench || b.humanEval || 0) - (a.sweBench || a.humanEval || 0));
  }

  if (options.limit) {
    data = data.slice(0, options.limit);
  }

  // Build table
  const lines: string[] = [];
  lines.push('Model Leaderboard (coding benchmarks)');
  lines.push('─'.repeat(110));
  lines.push(
    padRight('Model', 24) +
    padRight('Provider', 12) +
    padRight('Context', 8) +
    padRight('SWE-bench', 11) +
    padRight('HumanEval', 11) +
    padRight('Price (in/out)', 20) +
    'Notes'
  );
  lines.push('─'.repeat(110));

  for (const m of data) {
    lines.push(
      padRight(m.model, 24) +
      padRight(m.provider, 12) +
      padRight(m.contextWindow, 8) +
      padRight(m.sweBench ? `${m.sweBench}%` : '—', 11) +
      padRight(m.humanEval ? `${m.humanEval}%` : '—', 11) +
      padRight(m.pricing, 20) +
      (m.notes || '')
    );
  }

  lines.push('─'.repeat(110));
  lines.push('Prices per 1M tokens. SWE-bench = real-world bug fixing. HumanEval = function generation.');

  return lines.join('\n');
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

/**
 * Register the leaderboard CLI command
 */
export function registerLeaderboardCommand(program: any): void {
  program
    .command('leaderboard')
    .description('Show model benchmark leaderboard')
    .option('--sort <by>', 'Sort by: swe-bench, humaneval, price, speed', 'swe-bench')
    .option('--provider <name>', 'Filter by provider name')
    .option('--limit <n>', 'Show top N models', parseInt)
    .action((opts: { sort?: string; provider?: string; limit?: number }) => {
      console.log(formatLeaderboard({
        sortBy: opts.sort as any,
        provider: opts.provider,
        limit: opts.limit,
      }));
    });
}
