import { BaseTool } from './base.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import spawn from 'cross-spawn';
import { simpleGit, SimpleGit, StatusResult } from 'simple-git';

// Git Status Tool
export class GitStatusTool extends BaseTool {
  name = 'git_status';
  description = 'Show the current git status of the repository';
  parameters = {
    detailed: { type: 'boolean', description: 'Show detailed status', optional: true }
  };

  async execute(params: { detailed?: boolean }): Promise<any> {
    const git = simpleGit();
    
    try {
      const status = await git.status();
      
      const result = {
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        deleted: status.deleted,
        created: status.created,
        renamed: status.renamed,
        conflicted: status.conflicted,
        not_added: status.not_added
      };

      if (params.detailed) {
        console.log(chalk.cyan('📊 Git Status:'));
        console.log(chalk.yellow(`  Branch: ${result.branch}`));
        if (result.ahead > 0) console.log(chalk.green(`  Ahead: ${result.ahead}`));
        if (result.behind > 0) console.log(chalk.red(`  Behind: ${result.behind}`));
        if (result.staged.length > 0) console.log(chalk.green(`  Staged: ${result.staged.length} files`));
        if (result.modified.length > 0) console.log(chalk.yellow(`  Modified: ${result.modified.length} files`));
        if (result.not_added.length > 0) console.log(chalk.gray(`  Untracked: ${result.not_added.length} files`));
      }

      return result;
    } catch (error) {
      console.error(chalk.red('Git status failed:'), error);
      throw error;
    }
  }
}

// Git Diff Tool
export class GitDiffTool extends BaseTool {
  name = 'git_diff';
  description = 'Show git diff for files';
  parameters = {
    file: { type: 'string', description: 'Specific file to diff', optional: true },
    staged: { type: 'boolean', description: 'Show staged changes', optional: true }
  };

  async execute(params: { file?: string; staged?: boolean }): Promise<string> {
    const git = simpleGit();
    
    try {
      let diff: string;
      
      if (params.staged) {
        diff = params.file ? await git.diff(['--cached', params.file]) : await git.diff(['--cached']);
      } else {
        diff = params.file ? await git.diff([params.file]) : await git.diff();
      }

      if (!diff) {
        return 'No changes to display';
      }

      return diff;
    } catch (error) {
      console.error(chalk.red('Git diff failed:'), error);
      throw error;
    }
  }
}

// Git Add Tool
export class GitAddTool extends BaseTool {
  name = 'git_add';
  description = 'Stage files for commit';
  parameters = {
    files: { type: 'array', description: 'Files to stage (or "." for all)' }
  };
  requiresConfirmation = true;

  async execute(params: { files: string[] }): Promise<string> {
    if (!params.files || !Array.isArray(params.files) || params.files.length === 0) {
      throw new Error('At least one file must be specified');
    }

    // Filter out any undefined/null/empty values
    const validFiles = params.files.filter(f => f && typeof f === 'string' && f.trim());
    if (validFiles.length === 0) {
      throw new Error('No valid files specified');
    }

    const git = simpleGit();

    try {
      await git.add(validFiles);
      console.log(chalk.green(`✓ Staged ${validFiles.length} file(s)`));
      return `Successfully staged: ${validFiles.join(', ')}`;
    } catch (error) {
      console.error(chalk.red('Git add failed:'), error);
      throw error;
    }
  }
}

// Git Commit Tool
export class GitCommitTool extends BaseTool {
  name = 'git_commit';
  description = 'Commit staged changes';
  parameters = {
    message: { type: 'string', description: 'Commit message' },
    amend: { type: 'boolean', description: 'Amend previous commit', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: { message: string; amend?: boolean }): Promise<any> {
    if (!params.message || typeof params.message !== 'string' || !params.message.trim()) {
      throw new Error('Commit message is required');
    }

    const git = simpleGit();

    try {
      let result;

      if (params.amend) {
        result = await git.commit(params.message, undefined, { '--amend': null });
      } else {
        result = await git.commit(params.message);
      }

      console.log(chalk.green(`✓ Committed: ${result.commit}`));
      return {
        commit: result.commit,
        branch: result.branch,
        summary: result.summary
      };
    } catch (error) {
      console.error(chalk.red('Git commit failed:'), error);
      throw error;
    }
  }
}

// Git Push Tool
export class GitPushTool extends BaseTool {
  name = 'git_push';
  description = 'Push commits to remote repository';
  parameters = {
    remote: { type: 'string', description: 'Remote name', optional: true },
    branch: { type: 'string', description: 'Branch name', optional: true },
    force: { type: 'boolean', description: 'Force push', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: { remote?: string; branch?: string; force?: boolean }): Promise<string> {
    const git = simpleGit();
    
    try {
      const remote = params.remote || 'origin';
      const branch = params.branch || (await git.branch()).current;
      
      if (params.force) {
        await git.push(remote, branch, ['--force']);
      } else {
        await git.push(remote, branch);
      }
      
      console.log(chalk.green(`✓ Pushed to ${remote}/${branch}`));
      return `Successfully pushed to ${remote}/${branch}`;
    } catch (error) {
      console.error(chalk.red('Git push failed:'), error);
      throw error;
    }
  }
}

// Git Pull Tool
export class GitPullTool extends BaseTool {
  name = 'git_pull';
  description = 'Pull changes from remote repository';
  parameters = {
    remote: { type: 'string', description: 'Remote name', optional: true },
    branch: { type: 'string', description: 'Branch name', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: { remote?: string; branch?: string }): Promise<any> {
    const git = simpleGit();
    
    try {
      const remote = params.remote || 'origin';
      const branch = params.branch || (await git.branch()).current;
      
      const result = await git.pull(remote, branch);
      
      console.log(chalk.green(`✓ Pulled from ${remote}/${branch}`));
      return {
        files: result.files,
        insertions: result.insertions,
        deletions: result.deletions,
        summary: result.summary
      };
    } catch (error) {
      console.error(chalk.red('Git pull failed:'), error);
      throw error;
    }
  }
}

// Git Branch Tool
export class GitBranchTool extends BaseTool {
  name = 'git_branch';
  description = 'Manage git branches';
  parameters = {
    action: { type: 'string', description: 'Action: list, create, delete, checkout' },
    name: { type: 'string', description: 'Branch name', optional: true }
  };
  requiresConfirmation = false;

  async execute(params: { action: string; name?: string }): Promise<any> {
    const git = simpleGit();
    
    try {
      switch (params.action) {
        case 'list':
          const branches = await git.branch();
          return {
            current: branches.current,
            all: branches.all,
            branches: branches.branches
          };
        
        case 'create':
          if (!params.name) throw new Error('Branch name required');
          await git.checkoutLocalBranch(params.name);
          console.log(chalk.green(`✓ Created and switched to branch: ${params.name}`));
          return `Created branch: ${params.name}`;
        
        case 'delete':
          if (!params.name) throw new Error('Branch name required');
          await git.deleteLocalBranch(params.name);
          console.log(chalk.green(`✓ Deleted branch: ${params.name}`));
          return `Deleted branch: ${params.name}`;
        
        case 'checkout':
          if (!params.name) throw new Error('Branch name required');
          await git.checkout(params.name);
          console.log(chalk.green(`✓ Switched to branch: ${params.name}`));
          return `Switched to: ${params.name}`;
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      console.error(chalk.red('Git branch operation failed:'), error);
      throw error;
    }
  }
}

// Git Log Tool
export class GitLogTool extends BaseTool {
  name = 'git_log';
  description = 'Show git commit history';
  parameters = {
    limit: { type: 'number', description: 'Number of commits to show', optional: true },
    oneline: { type: 'boolean', description: 'Show in one-line format', optional: true }
  };

  async execute(params: { limit?: number; oneline?: boolean }): Promise<any> {
    const git = simpleGit();
    
    try {
      const options = {
        maxCount: params.limit || 10,
        oneline: params.oneline
      };
      
      const log = await git.log(options);
      
      if (!params.oneline) {
        log.all.forEach(commit => {
          console.log(chalk.yellow(`${commit.hash.substring(0, 7)}`), chalk.cyan(commit.date));
          console.log(`  Author: ${commit.author_name} <${commit.author_email}>`);
          console.log(`  ${commit.message}`);
          console.log();
        });
      }
      
      return log.all;
    } catch (error) {
      console.error(chalk.red('Git log failed:'), error);
      throw error;
    }
  }
}

// Git Stash Tool
export class GitStashTool extends BaseTool {
  name = 'git_stash';
  description = 'Manage git stash';
  parameters = {
    action: { type: 'string', description: 'Action: save, pop, list, drop' },
    message: { type: 'string', description: 'Stash message', optional: true }
  };
  requiresConfirmation = false;

  async execute(params: { action: string; message?: string }): Promise<any> {
    const git = simpleGit();
    
    try {
      switch (params.action) {
        case 'save':
        case 'push':
          const stashOptions = params.message ? ['push', '-m', params.message] : ['push'];
          await git.stash(stashOptions);
          console.log(chalk.green('✓ Changes stashed'));
          return 'Changes stashed successfully';
        
        case 'pop':
          await git.stash(['pop']);
          console.log(chalk.green('✓ Stash popped'));
          return 'Stash popped successfully';
        
        case 'list':
          const stashList = await git.stashList();
          return stashList.all;
        
        case 'drop':
          await git.stash(['drop']);
          console.log(chalk.green('✓ Stash dropped'));
          return 'Stash dropped successfully';
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      console.error(chalk.red('Git stash operation failed:'), error);
      throw error;
    }
  }
}

// Git Clone Tool
export class GitCloneTool extends BaseTool {
  name = 'git_clone';
  description = 'Clone a git repository';
  parameters = {
    url: { type: 'string', description: 'Repository URL' },
    directory: { type: 'string', description: 'Target directory', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: { url: string; directory?: string }): Promise<string> {
    const git = simpleGit();
    
    try {
      const dir = params.directory || path.basename(params.url, '.git');
      await git.clone(params.url, dir);
      
      console.log(chalk.green(`✓ Cloned repository to ${dir}`));
      return `Successfully cloned to ${dir}`;
    } catch (error) {
      console.error(chalk.red('Git clone failed:'), error);
      throw error;
    }
  }
}

// Git Merge Tool
export class GitMergeTool extends BaseTool {
  name = 'git_merge';
  description = 'Merge branches';
  parameters = {
    branch: { type: 'string', description: 'Branch to merge' },
    strategy: { type: 'string', description: 'Merge strategy', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: { branch: string; strategy?: string }): Promise<any> {
    const git = simpleGit();
    
    try {
      let result;
      if (params.strategy) {
        result = await git.merge([params.branch, '--strategy', params.strategy]);
      } else {
        result = await git.merge([params.branch]);
      }
      
      console.log(chalk.green(`✓ Merged ${params.branch}`));
      return result;
    } catch (error) {
      console.error(chalk.red('Git merge failed:'), error);
      throw error;
    }
  }
}

// Git Reset Tool
export class GitResetTool extends BaseTool {
  name = 'git_reset';
  description = 'Reset current HEAD to specified state';
  parameters = {
    mode: { type: 'string', description: 'Reset mode: soft, mixed, hard' },
    commit: { type: 'string', description: 'Commit hash or HEAD~n', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: { mode: string; commit?: string }): Promise<string> {
    const git = simpleGit();
    
    try {
      const commit = params.commit || 'HEAD';
      const modeFlag = `--${params.mode}`;
      
      await git.reset([modeFlag, commit]);
      
      console.log(chalk.green(`✓ Reset to ${commit} (${params.mode} mode)`));
      return `Reset successful`;
    } catch (error) {
      console.error(chalk.red('Git reset failed:'), error);
      throw error;
    }
  }
}

// GitHub PR Tool
export class GitHubPRTool extends BaseTool {
  name = 'github_pr';
  description = 'Create or manage GitHub pull requests';
  parameters = {
    action: { type: 'string', description: 'Action: create, list, merge' },
    title: { type: 'string', description: 'PR title', optional: true },
    body: { type: 'string', description: 'PR description', optional: true },
    base: { type: 'string', description: 'Base branch', optional: true }
  };
  requiresConfirmation = true;

  async execute(params: { action: string; title?: string; body?: string; base?: string }): Promise<any> {
    try {
      switch (params.action) {
        case 'create':
          if (!params.title) throw new Error('PR title required');
          
          const args = ['pr', 'create', '--title', params.title];
          if (params.body) args.push('--body', params.body);
          if (params.base) args.push('--base', params.base);
          
          const result = spawn.sync('gh', args, { encoding: 'utf8' });
          
          if (result.error) throw result.error;
          console.log(chalk.green('✓ Pull request created'));
          return result.stdout;
        
        case 'list':
          const listResult = spawn.sync('gh', ['pr', 'list'], { encoding: 'utf8' });
          if (listResult.error) throw listResult.error;
          return listResult.stdout;
        
        case 'merge':
          const mergeResult = spawn.sync('gh', ['pr', 'merge', '--auto'], { encoding: 'utf8' });
          if (mergeResult.error) throw mergeResult.error;
          console.log(chalk.green('✓ Pull request merged'));
          return mergeResult.stdout;
        
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      console.error(chalk.red('GitHub PR operation failed:'), error);
      throw error;
    }
  }
}