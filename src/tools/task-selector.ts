/**
 * Task-based tool selector
 *
 * Instead of sending all 68+ tool schemas with every request (~10K tokens),
 * classify the task from the prompt and return only the relevant subset.
 *
 * Impact: reduces tool-schema overhead from ~10K tokens to ~500–1500 tokens
 * per request — freeing that space for file contents and conversation history.
 *
 * Selection strategy:
 *   1. Classify the prompt against keyword sets for each task domain
 *   2. Union the matching domain tool sets
 *   3. Always include the META set (self-awareness tools)
 *   4. Fall back to CORE if nothing matched
 *   5. Cap at MAX_TOOLS to prevent multi-domain explosion
 */

// ─── Tool name sets by domain ─────────────────────────────────────────────────

const TOOLS: Record<string, string[]> = {
  // Always included — allow the model to discover/create tools
  META: [
    'introspect_tools', 'create_tool', 'self_improve', 'smart_context',
  ],

  // Baseline for any task that touches files
  FILE: [
    'read_file', 'write_file', 'edit_file', 'list_directory', 'delete_file',
    'search_files', 'grep_search', 'glob_search', 'read_many_files', 'multi_edit',
    'file_compare',
  ],

  // Shell execution
  SHELL: [
    'run_shell_command', 'get_environment',
  ],

  // Source control
  GIT: [
    'git_status', 'git_diff', 'git_add', 'git_commit', 'git_push',
    'git_pull', 'git_branch', 'git_log', 'git_stash', 'git_clone',
    'git_merge', 'git_reset', 'github_pr',
  ],

  // Web + HTTP
  WEB: [
    'web_fetch', 'web_search', 'api_request',
  ],

  // Code quality checks
  VERIFY: [
    'run_tests', 'type_check', 'lint', 'build', 'verify_changes',
  ],

  // Browser automation
  BROWSER: [
    'browser_launch', 'browser_navigate', 'browser_click', 'browser_type',
    'browser_screenshot', 'browser_get_content', 'browser_evaluate',
    'browser_wait', 'browser_scroll', 'browser_close',
    'stagehand_navigate', 'stagehand_act', 'stagehand_extract',
    'stagehand_observe', 'stagehand_close',
  ],

  // Code indexing + analysis
  INDEX: [
    'index_codebase', 'search_codebase', 'find_symbol', 'ast_analyzer',
  ],

  // Code review
  REVIEW: [
    'code_review', 'review_diff', 'review_pr',
  ],

  // Project management integrations
  ISSUE: [
    'gh_integration', 'gitlab_issue', 'jira_issue',
  ],
};

// ─── Keyword → domain mappings ────────────────────────────────────────────────

interface DomainRule {
  domains: string[];
  keywords: RegExp;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    domains: ['GIT'],
    keywords: /\b(git|commit|push|pull|branch|merge|diff|stash|pr|pull.?request|checkout|repo|repository|clone)\b/i,
  },
  {
    domains: ['WEB'],
    keywords: /\b(fetch|scrape|crawl|url|http|api|endpoint|request|download|web)\b/i,
  },
  {
    domains: ['VERIFY'],
    keywords: /\b(test|lint|type.?check|build|compile|verify|check|error|fail|fix)\b/i,
  },
  {
    domains: ['BROWSER'],
    keywords: /\b(browser|chrome|puppeteer|stagehand|navigate|click|screenshot|page|dom)\b/i,
  },
  {
    domains: ['INDEX'],
    keywords: /\b(index|symbol|ast|syntax.?tree|codebase|find.?class|find.?function|semantic)\b/i,
  },
  {
    domains: ['REVIEW'],
    keywords: /\b(review|audit|analyse|analyze|code.?quality|smell|refactor)\b/i,
  },
  {
    domains: ['ISSUE'],
    keywords: /\b(issue|ticket|jira|linear|github.?issue|gitlab.?issue)\b/i,
  },
  {
    // Shell-heavy tasks also get FILE so the model can read before running
    domains: ['SHELL', 'FILE'],
    keywords: /\b(run|execute|exec|install|npm|yarn|pnpm|pip|docker|kubectl|bash|script|command)\b/i,
  },
];

// ─── Maximum tool count to include per request ────────────────────────────────

const MAX_TOOLS = 22;

// ─── Public API ───────────────────────────────────────────────────────────────

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
};

/**
 * Return the relevant subset of tools for the given prompt.
 *
 * @param prompt   The user's message (or last user message in the history)
 * @param allTools All tool definitions from the registry
 * @returns        Filtered tool definitions capped at MAX_TOOLS
 */
export function selectToolsForTask(
  prompt: string,
  allTools: ToolDefinition[],
): ToolDefinition[] {
  const allNames = new Set(allTools.map(t => t.function.name));

  // Always start with META
  const selected = new Set<string>(TOOLS.META.filter(n => allNames.has(n)));

  // Match task domains from the prompt
  const matchedDomains = new Set<string>();
  for (const rule of DOMAIN_RULES) {
    if (rule.keywords.test(prompt)) {
      rule.domains.forEach(d => matchedDomains.add(d));
    }
  }

  // Every task that touches content also gets FILE + SHELL as the baseline
  // unless only WEB or BROWSER matched (those have their own I/O)
  const needsFileShell = matchedDomains.size === 0
    || matchedDomains.has('GIT')
    || matchedDomains.has('VERIFY')
    || matchedDomains.has('INDEX')
    || matchedDomains.has('REVIEW');

  if (needsFileShell || matchedDomains.size === 0) {
    TOOLS.FILE.forEach(n => allNames.has(n) && selected.add(n));
    TOOLS.SHELL.forEach(n => allNames.has(n) && selected.add(n));
  }

  // Add matched domain tools
  for (const domain of matchedDomains) {
    (TOOLS[domain] ?? []).forEach(n => allNames.has(n) && selected.add(n));
  }

  // If no domains matched, we already have FILE + SHELL + META — that covers
  // the vast majority of tasks. No extra tools needed.

  // Build the result, capped at MAX_TOOLS (META always survives the cap)
  const metaNames = new Set(TOOLS.META);
  const nonMeta   = [...selected].filter(n => !metaNames.has(n));
  const meta      = [...selected].filter(n => metaNames.has(n));

  const capped = [
    ...meta,
    ...nonMeta.slice(0, MAX_TOOLS - meta.length),
  ];

  return allTools.filter(t => capped.includes(t.function.name));
}

/**
 * Extract the most recent user message from a message array.
 * Used to pull the task description out of the full history.
 */
export function extractUserPrompt(messages: Array<{ role: string; content: string }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}
