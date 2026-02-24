/**
 * Git Safety Protocol
 * Blocks destructive operations, enforces Conventional Commits,
 * adds co-author trailer, and provides undo support.
 */

export interface GitSafetyConfig {
  blockForceOperations?: boolean;
  blockHardReset?: boolean;
  blockMainBranchPush?: boolean;
  enforceConventionalCommits?: boolean;
  addCoAuthorTrailer?: boolean;
  coAuthorName?: string;
  coAuthorEmail?: string;
}

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  suggestion?: string;
}

const DEFAULT_CONFIG: Required<GitSafetyConfig> = {
  blockForceOperations: true,
  blockHardReset: true,
  blockMainBranchPush: true,
  enforceConventionalCommits: false,
  addCoAuthorTrailer: true,
  coAuthorName: 'Canvas CLI',
  coAuthorEmail: 'canvas-cli@users.noreply.github.com',
};

// Patterns for destructive git operations
const DANGEROUS_PATTERNS = [
  { pattern: /git\s+push\s+.*--force(?:-with-lease)?/i, reason: 'Force push can overwrite remote history' },
  { pattern: /git\s+reset\s+--hard/i, reason: 'Hard reset discards uncommitted changes' },
  { pattern: /git\s+clean\s+-[a-z]*f/i, reason: 'git clean -f permanently deletes untracked files' },
  { pattern: /git\s+checkout\s+--\s+\./i, reason: 'Discards all unstaged changes' },
  { pattern: /git\s+branch\s+-D\s+/i, reason: 'Force-deletes a branch even if unmerged' },
  { pattern: /git\s+rebase\s+.*--force/i, reason: 'Force rebase can alter history' },
];

const PROTECTED_BRANCHES = ['main', 'master', 'production', 'release'];

const CONVENTIONAL_COMMIT_RE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s.+/;

export class GitSafety {
  private config: Required<GitSafetyConfig>;

  constructor(config?: GitSafetyConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a git command is safe to execute
   */
  checkCommand(command: string): SafetyCheckResult {
    // Check for dangerous patterns
    if (this.config.blockForceOperations) {
      for (const { pattern, reason } of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
          return {
            allowed: false,
            reason: `Blocked: ${reason}`,
            suggestion: 'Use the non-destructive alternative or run with --allow-unsafe',
          };
        }
      }
    }

    // Check for push to protected branches
    if (this.config.blockMainBranchPush) {
      const pushMatch = command.match(/git\s+push\s+\S+\s+(\S+)/i);
      if (pushMatch) {
        const branch = pushMatch[1];
        if (PROTECTED_BRANCHES.includes(branch)) {
          return {
            allowed: false,
            reason: `Blocked: Direct push to protected branch "${branch}"`,
            suggestion: 'Create a pull request instead',
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Validate a commit message
   */
  validateCommitMessage(message: string): SafetyCheckResult {
    if (!this.config.enforceConventionalCommits) {
      return { allowed: true };
    }

    const firstLine = message.split('\n')[0].trim();

    if (!CONVENTIONAL_COMMIT_RE.test(firstLine)) {
      return {
        allowed: false,
        reason: 'Commit message does not follow Conventional Commits format',
        suggestion: 'Use format: type(scope): description (e.g., "feat(auth): add login page")',
      };
    }

    return { allowed: true };
  }

  /**
   * Format a commit message with co-author trailer
   */
  formatCommitMessage(message: string): string {
    if (!this.config.addCoAuthorTrailer) return message;

    const trailer = `Co-authored-by: ${this.config.coAuthorName} <${this.config.coAuthorEmail}>`;

    // Don't add if already present
    if (message.includes(trailer)) return message;

    // Add trailer separated by blank line
    return message.trimEnd() + '\n\n' + trailer;
  }

  /**
   * Generate a conventional commit prefix based on file changes
   */
  static inferCommitType(files: string[]): string {
    const hasTests = files.some(f => f.includes('test') || f.includes('spec'));
    const hasDocs = files.some(f => f.endsWith('.md') || f.includes('doc'));
    const hasConfig = files.some(f =>
      f.includes('config') || f.endsWith('.json') || f.endsWith('.yml') || f.endsWith('.toml')
    );
    const hasSrc = files.some(f =>
      f.includes('src/') || f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.py')
    );

    if (hasTests && !hasSrc) return 'test';
    if (hasDocs && !hasSrc) return 'docs';
    if (hasConfig && !hasSrc) return 'chore';
    return 'feat';
  }

  /**
   * Get safety configuration
   */
  getConfig(): Required<GitSafetyConfig> {
    return { ...this.config };
  }
}

let instance: GitSafety | null = null;

export function getGitSafety(config?: GitSafetyConfig): GitSafety {
  if (!instance) {
    instance = new GitSafety(config);
  }
  return instance;
}
