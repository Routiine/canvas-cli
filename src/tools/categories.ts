/**
 * Tool Categories - Core vs Extra tools
 * Core tools are always available, extra tools are opt-in
 */

export const CORE_TOOLS = [
  // File Operations (essential)
  'read_file',
  'write_file',
  'edit_file',
  'list_directory',
  'glob',
  'grep',

  // Shell (essential)
  'run_shell_command',

  // Web (essential)
  'web_fetch',
  'web_search',

  // Git basics
  'git_status',
  'git_diff',
  'git_add',
  'git_commit',

  // Task/Agent system
  'task',
] as const;

export const EXTRA_TOOLS = {
  // File Operations (extended)
  files: [
    'delete_file',
    'search_files',
    'read_many_files',
    'multi_edit',
    'compare_files',
  ],

  // Shell (extended)
  shell: [
    'get_environment',
  ],

  // Web (extended)
  web: [
    'api_request',
    'web_builder',
    'web_crawler',
    'knowledge_search',
  ],

  // Memory
  memory: [
    'save_memory',
    'recall_memory',
    'list_memory',
  ],

  // Media/Multimodal
  media: [
    'analyze_image',
    'process_pdf',
    'transcribe_audio',
    'analyze_video',
    'process_document',
    'take_screenshot',
    'qr_code',
  ],

  // VS Code
  vscode: [
    'read_vscode_workspace',
    'read_vscode_settings',
    'read_vscode_extensions',
    'read_vscode_tasks',
    'read_vscode_launch',
    'read_vscode_snippets',
    'analyze_vscode_project',
    'detect_vscode',
  ],

  // Git (extended)
  git: [
    'git_push',
    'git_pull',
    'git_branch',
    'git_log',
    'git_stash',
    'git_clone',
    'git_merge',
    'git_reset',
    'github_pr',
  ],

  // File Watching
  watchers: [
    'watch_files',
    'stop_watching',
    'list_watchers',
    'auto_reload_context',
    'track_changes',
  ],

  // Context
  context: [
    'smart_context',
  ],

  // CLI Integrations
  cli: [
    'fzf_finder',
    'resource_monitor',
    'tmux_manager',
    'lazygit_ui',
    'github_cli',
    'file_watcher',
    'just_runner',
    'taskwarrior',
    'tldr_pages',
    'snippet_manager',
  ],

  // Third-party Integrations
  integrations: [
    'integration_auth',
    'gitlab_merge_request',
    'gitlab_pipeline',
    'gitlab_issue',
    'jira_issue',
    'jira_sprint',
    'jira_report',
    'slack_message',
    'slack_notification',
    'slack_channel',
  ],

  // Self-improvement
  meta: [
    'create_tool',
    'introspect_tools',
    'self_improve',
    'mcp',
    'natural_executor',
  ],

  // Browser Automation (Puppeteer)
  browser: [
    'browser_launch',
    'browser_navigate',
    'browser_click',
    'browser_type',
    'browser_screenshot',
    'browser_get_content',
    'browser_evaluate',
    'browser_wait',
    'browser_scroll',
    'browser_close',
  ],

  // Self-Verification
  verification: [
    'run_tests',
    'type_check',
    'lint',
    'build',
    'verify_changes',
  ],

  // Codebase Indexing
  codebase: [
    'index_codebase',
    'search_codebase',
    'find_symbol',
    'index_stats',
  ],

  // Cloud Agents
  cloud: [
    'cloud_agent_launch',
    'cloud_agent_status',
    'cloud_agent_list',
    'cloud_agent_logs',
    'cloud_agent_stop',
  ],

  // Failure Recovery
  recovery: [
    'auto_recover',
    'retry_with_recovery',
    'watch_and_recover',
    'recovery_history',
  ],

  // Code Review
  review: [
    'code_review',
    'review_diff',
    'review_pr',
  ],

  // Voice Prompting
  voice: [
    'voice_input',
    'voice_command',
    'text_to_speech',
    'transcribe_file',
    'voice_config',
  ],

  // Git Worktree Parallel Agents
  worktree: [
    'worktree_create',
    'worktree_list',
    'worktree_remove',
    'parallel_agent',
    'parallel_agents_status',
    'merge_worktree',
    'cleanup_worktrees',
  ],
} as const;

export type CoreTool = typeof CORE_TOOLS[number];
export type ExtraToolCategory = keyof typeof EXTRA_TOOLS;

/**
 * Get all extra tools as flat array
 */
export function getAllExtraTools(): string[] {
  return Object.values(EXTRA_TOOLS).flat();
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: ExtraToolCategory): readonly string[] {
  return EXTRA_TOOLS[category];
}

/**
 * Check if tool is core
 */
export function isCorePool(toolName: string): boolean {
  return (CORE_TOOLS as readonly string[]).includes(toolName);
}

/**
 * Get category for a tool
 */
export function getToolCategory(toolName: string): string {
  if ((CORE_TOOLS as readonly string[]).includes(toolName)) {
    return 'core';
  }

  for (const [category, tools] of Object.entries(EXTRA_TOOLS)) {
    if ((tools as readonly string[]).includes(toolName)) {
      return category;
    }
  }

  return 'unknown';
}
