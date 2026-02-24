/**
 * Tab Completion
 * Generates shell completion scripts for bash, zsh, and fish.
 *
 * Usage: canvas completion bash|zsh|fish
 */

const COMMANDS = [
  'chat', 'config', 'init', 'agent', 'tools', 'context', 'export',
  'models', 'crawl', 'search', 'edit', 'undo', 'test', 'review-pr',
  'ask', 'plugins', 'index', 'daemon', 'memory', 'finetune', 'mcp',
  'recipe', 'palette', 'notebook', 'share', 'voice', 'monitor',
  'incident', 'workspace', 'knowledge', 'completion',
];

const GLOBAL_OPTIONS = [
  '--sandbox', '--no-tools', '--checkpointing', '--web', '--plugins',
  '--local-only', '--help', '--version', '-p', '--prompt',
  '--headless', '--auto-approve', '--output-format', '--verbose',
];

/**
 * Generate bash completion script
 */
export function generateBashCompletion(): string {
  return `
# Canvas CLI bash completion
_canvas_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${COMMANDS.join(' ')}"

  case "\${prev}" in
    canvas)
      COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
      return 0
      ;;
    mcp)
      COMPREPLY=( $(compgen -W "list add remove start stop tools test serve" -- "\${cur}") )
      return 0
      ;;
    daemon)
      COMPREPLY=( $(compgen -W "start stop status" -- "\${cur}") )
      return 0
      ;;
    index)
      COMPREPLY=( $(compgen -W "build query dataflow" -- "\${cur}") )
      return 0
      ;;
    memory)
      COMPREPLY=( $(compgen -W "show forget search sessions" -- "\${cur}") )
      return 0
      ;;
    --output-format)
      COMPREPLY=( $(compgen -W "json text markdown" -- "\${cur}") )
      return 0
      ;;
  esac

  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( $(compgen -W "${GLOBAL_OPTIONS.join(' ')}" -- "\${cur}") )
    return 0
  fi

  COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
}

complete -F _canvas_completions canvas
`.trim();
}

/**
 * Generate zsh completion script
 */
export function generateZshCompletion(): string {
  const commandDescs = COMMANDS.map(c => `'${c}:${c} command'`).join('\n    ');

  return `
#compdef canvas

_canvas() {
  local -a commands
  commands=(
    ${commandDescs}
  )

  _arguments -C \\
    '1:command:->command' \\
    '*::arg:->args'

  case "$state" in
    command)
      _describe -t commands 'canvas commands' commands
      ;;
  esac
}

_canvas "$@"
`.trim();
}

/**
 * Generate fish completion script
 */
export function generateFishCompletion(): string {
  const lines = COMMANDS.map(c =>
    `complete -c canvas -n "__fish_use_subcommand" -a "${c}" -d "${c} command"`
  );

  lines.push(
    `complete -c canvas -n "__fish_seen_subcommand_from mcp" -a "list add remove start stop tools test serve"`,
    `complete -c canvas -n "__fish_seen_subcommand_from daemon" -a "start stop status"`,
    `complete -c canvas -n "__fish_seen_subcommand_from index" -a "build query dataflow"`,
  );

  return lines.join('\n');
}

/**
 * Get completion script for the specified shell
 */
export function getCompletionScript(shell: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'bash': return generateBashCompletion();
    case 'zsh': return generateZshCompletion();
    case 'fish': return generateFishCompletion();
    default: throw new Error(`Unsupported shell: ${shell}`);
  }
}
