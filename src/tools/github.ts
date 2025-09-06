/**
 * GitHub Integration Tool for Canvas CLI
 * Complete GitHub operations support
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

const execAsync = promisify(exec);

export interface GitHubConfig {
  token?: string;
  username?: string;
  defaultBranch?: string;
  apiUrl?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
  body?: string;
  draft: boolean;
  merged: boolean;
  mergeable?: boolean;
}

export interface Issue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
  body?: string;
  labels: Array<{
    name: string;
    color: string;
  }>;
}

export interface Repository {
  name: string;
  full_name: string;
  description?: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  language?: string;
  stargazers_count: number;
  forks_count: number;
}

export interface GitHubAction {
  id: number;
  name: string;
  status: string;
  conclusion?: string;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at?: string;
  html_url: string;
  body?: string;
  assets: Array<{
    name: string;
    size: number;
    download_url: string;
  }>;
}

class GitHubIntegration {
  private config: GitHubConfig;
  private configPath: string;
  private apiClient: any;

  constructor() {
    this.configPath = path.join(homedir(), '.canvas-cli', 'github.json');
    this.config = this.loadConfig();
    this.setupApiClient();
  }

  private loadConfig(): GitHubConfig {
    if (existsSync(this.configPath)) {
      try {
        return JSON.parse(readFileSync(this.configPath, 'utf-8'));
      } catch (error) {
        console.error('Failed to load GitHub config:', error);
      }
    }

    // Check environment variables
    return {
      token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
      username: process.env.GITHUB_USERNAME,
      defaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main',
      apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com'
    };
  }

  private saveConfig(config: GitHubConfig): void {
    const dir = path.dirname(this.configPath);
    if (!existsSync(dir)) {
      const fs = require('fs');
      fs.mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  private setupApiClient(): void {
    this.apiClient = axios.create({
      baseURL: this.config.apiUrl || 'https://api.github.com',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(this.config.token && { 'Authorization': `token ${this.config.token}` })
      }
    });
  }

  /**
   * Configure GitHub authentication
   */
  async authenticate(token?: string): Promise<void> {
    const spinner = ora('Authenticating with GitHub...').start();
    
    try {
      // Try to use GitHub CLI if available
      if (!token) {
        try {
          const { stdout } = await execAsync('gh auth token');
          token = stdout.trim();
        } catch (error) {
          // GitHub CLI not available or not authenticated
        }
      }

      if (!token) {
        spinner.fail('No GitHub token provided');
        throw new Error('GitHub token required. Set GITHUB_TOKEN environment variable or use gh auth login');
      }

      this.config.token = token;
      this.setupApiClient();

      // Verify token
      const { data } = await this.apiClient.get('/user');
      this.config.username = data.login;
      
      this.saveConfig(this.config);
      spinner.succeed(`Authenticated as ${chalk.cyan(data.login)}`);
    } catch (error: any) {
      spinner.fail('Authentication failed');
      throw error;
    }
  }

  /**
   * Get current repository info
   */
  async getCurrentRepo(): Promise<{ owner: string; repo: string }> {
    try {
      const { stdout } = await execAsync('git remote get-url origin');
      const url = stdout.trim();
      
      // Parse GitHub URL
      const match = url.match(/github\.com[:/]([^/]+)\/([^.]+)/);
      if (!match) {
        throw new Error('Not a GitHub repository');
      }

      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, '')
      };
    } catch (error) {
      throw new Error('Failed to get repository information');
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(options: {
    title: string;
    body?: string;
    base?: string;
    head?: string;
    draft?: boolean;
  }): Promise<PullRequest> {
    const spinner = ora('Creating pull request...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      
      // Get current branch if head not specified
      if (!options.head) {
        const { stdout } = await execAsync('git branch --show-current');
        options.head = stdout.trim();
      }

      // Use default branch if base not specified
      if (!options.base) {
        options.base = this.config.defaultBranch || 'main';
      }

      const { data } = await this.apiClient.post(`/repos/${owner}/${repo}/pulls`, {
        title: options.title,
        body: options.body || '',
        base: options.base,
        head: options.head,
        draft: options.draft || false
      });

      spinner.succeed(`Pull request created: ${chalk.cyan(data.html_url)}`);
      return data;
    } catch (error: any) {
      spinner.fail('Failed to create pull request');
      throw error;
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(options: {
    state?: 'open' | 'closed' | 'all';
    limit?: number;
  } = {}): Promise<PullRequest[]> {
    const spinner = ora('Fetching pull requests...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      const { data } = await this.apiClient.get(`/repos/${owner}/${repo}/pulls`, {
        params: {
          state: options.state || 'open',
          per_page: options.limit || 30
        }
      });

      spinner.succeed(`Found ${data.length} pull requests`);
      return data;
    } catch (error: any) {
      spinner.fail('Failed to fetch pull requests');
      throw error;
    }
  }

  /**
   * Create an issue
   */
  async createIssue(options: {
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
  }): Promise<Issue> {
    const spinner = ora('Creating issue...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      const { data } = await this.apiClient.post(`/repos/${owner}/${repo}/issues`, {
        title: options.title,
        body: options.body || '',
        labels: options.labels || [],
        assignees: options.assignees || []
      });

      spinner.succeed(`Issue created: ${chalk.cyan(data.html_url)}`);
      return data;
    } catch (error: any) {
      spinner.fail('Failed to create issue');
      throw error;
    }
  }

  /**
   * List issues
   */
  async listIssues(options: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    limit?: number;
  } = {}): Promise<Issue[]> {
    const spinner = ora('Fetching issues...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      const { data } = await this.apiClient.get(`/repos/${owner}/${repo}/issues`, {
        params: {
          state: options.state || 'open',
          labels: options.labels?.join(','),
          per_page: options.limit || 30
        }
      });

      // Filter out pull requests (they're also returned as issues)
      const issues = data.filter((item: any) => !item.pull_request);
      
      spinner.succeed(`Found ${issues.length} issues`);
      return issues;
    } catch (error: any) {
      spinner.fail('Failed to fetch issues');
      throw error;
    }
  }

  /**
   * Get workflow runs (GitHub Actions)
   */
  async getWorkflowRuns(options: {
    status?: 'completed' | 'in_progress' | 'queued';
    limit?: number;
  } = {}): Promise<GitHubAction[]> {
    const spinner = ora('Fetching workflow runs...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      const { data } = await this.apiClient.get(`/repos/${owner}/${repo}/actions/runs`, {
        params: {
          status: options.status,
          per_page: options.limit || 10
        }
      });

      spinner.succeed(`Found ${data.workflow_runs.length} workflow runs`);
      return data.workflow_runs;
    } catch (error: any) {
      spinner.fail('Failed to fetch workflow runs');
      throw error;
    }
  }

  /**
   * Trigger a workflow
   */
  async triggerWorkflow(workflowId: string, inputs?: Record<string, any>): Promise<void> {
    const spinner = ora(`Triggering workflow ${workflowId}...`).start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      
      // Get default branch
      const { stdout } = await execAsync('git symbolic-ref refs/remotes/origin/HEAD | sed "s@^refs/remotes/origin/@@"');
      const ref = stdout.trim() || 'main';

      await this.apiClient.post(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
        ref,
        inputs: inputs || {}
      });

      spinner.succeed('Workflow triggered successfully');
    } catch (error: any) {
      spinner.fail('Failed to trigger workflow');
      throw error;
    }
  }

  /**
   * Create a release
   */
  async createRelease(options: {
    tagName: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    generateNotes?: boolean;
  }): Promise<GitHubRelease> {
    const spinner = ora('Creating release...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      const { data } = await this.apiClient.post(`/repos/${owner}/${repo}/releases`, {
        tag_name: options.tagName,
        name: options.name || options.tagName,
        body: options.body || '',
        draft: options.draft || false,
        prerelease: options.prerelease || false,
        generate_release_notes: options.generateNotes || true
      });

      spinner.succeed(`Release created: ${chalk.cyan(data.html_url)}`);
      return data;
    } catch (error: any) {
      spinner.fail('Failed to create release');
      throw error;
    }
  }

  /**
   * Fork a repository
   */
  async forkRepository(repoUrl: string): Promise<Repository> {
    const spinner = ora('Forking repository...').start();
    
    try {
      // Parse repository URL
      const match = repoUrl.match(/github\.com[:/]([^/]+)\/([^.]+)/);
      if (!match) {
        throw new Error('Invalid GitHub repository URL');
      }

      const owner = match[1];
      const repo = match[2].replace(/\.git$/, '');

      const { data } = await this.apiClient.post(`/repos/${owner}/${repo}/forks`);
      
      spinner.succeed(`Repository forked: ${chalk.cyan(data.html_url)}`);
      
      // Clone the forked repository
      const cloneSpinner = ora('Cloning forked repository...').start();
      await execAsync(`git clone ${data.clone_url}`);
      cloneSpinner.succeed('Repository cloned');

      return data;
    } catch (error: any) {
      spinner.fail('Failed to fork repository');
      throw error;
    }
  }

  /**
   * Search repositories
   */
  async searchRepositories(query: string, options: {
    sort?: 'stars' | 'forks' | 'updated';
    order?: 'asc' | 'desc';
    limit?: number;
  } = {}): Promise<Repository[]> {
    const spinner = ora('Searching repositories...').start();
    
    try {
      const { data } = await this.apiClient.get('/search/repositories', {
        params: {
          q: query,
          sort: options.sort || 'stars',
          order: options.order || 'desc',
          per_page: options.limit || 10
        }
      });

      spinner.succeed(`Found ${data.total_count} repositories`);
      return data.items;
    } catch (error: any) {
      spinner.fail('Failed to search repositories');
      throw error;
    }
  }

  /**
   * Get repository statistics
   */
  async getRepoStats(): Promise<any> {
    const spinner = ora('Fetching repository statistics...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      
      // Fetch multiple statistics in parallel
      const [repoData, contributors, languages, commits] = await Promise.all([
        this.apiClient.get(`/repos/${owner}/${repo}`),
        this.apiClient.get(`/repos/${owner}/${repo}/contributors`),
        this.apiClient.get(`/repos/${owner}/${repo}/languages`),
        this.apiClient.get(`/repos/${owner}/${repo}/commits`, { params: { per_page: 1 } })
      ]);

      const stats = {
        name: repoData.data.full_name,
        description: repoData.data.description,
        stars: repoData.data.stargazers_count,
        forks: repoData.data.forks_count,
        watchers: repoData.data.watchers_count,
        issues: repoData.data.open_issues_count,
        size: `${(repoData.data.size / 1024).toFixed(2)} MB`,
        language: repoData.data.language,
        languages: languages.data,
        contributors: contributors.data.length,
        totalCommits: parseInt(commits.headers.link?.match(/page=(\d+)>; rel="last"/)?.[1] || '1'),
        created: repoData.data.created_at,
        updated: repoData.data.updated_at
      };

      spinner.succeed('Repository statistics fetched');
      return stats;
    } catch (error: any) {
      spinner.fail('Failed to fetch repository statistics');
      throw error;
    }
  }

  /**
   * Setup GitHub Pages
   */
  async setupGitHubPages(options: {
    branch?: string;
    path?: '/' | '/docs';
  } = {}): Promise<void> {
    const spinner = ora('Setting up GitHub Pages...').start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      
      await this.apiClient.post(`/repos/${owner}/${repo}/pages`, {
        source: {
          branch: options.branch || 'gh-pages',
          path: options.path || '/'
        }
      });

      spinner.succeed('GitHub Pages enabled');
      console.log(chalk.green(`Your site will be available at: https://${owner}.github.io/${repo}/`));
    } catch (error: any) {
      if (error.response?.status === 409) {
        spinner.info('GitHub Pages is already enabled');
      } else {
        spinner.fail('Failed to setup GitHub Pages');
        throw error;
      }
    }
  }

  /**
   * Add collaborator to repository
   */
  async addCollaborator(username: string, permission: 'pull' | 'push' | 'admin' = 'push'): Promise<void> {
    const spinner = ora(`Adding ${username} as collaborator...`).start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      
      await this.apiClient.put(`/repos/${owner}/${repo}/collaborators/${username}`, {
        permission
      });

      spinner.succeed(`${username} added as collaborator with ${permission} access`);
    } catch (error: any) {
      spinner.fail('Failed to add collaborator');
      throw error;
    }
  }

  /**
   * Create branch protection rule
   */
  async protectBranch(branch: string = 'main', options: {
    requirePullRequest?: boolean;
    requireReviews?: number;
    dismissStaleReviews?: boolean;
    requireCodeOwnerReviews?: boolean;
    requireStatusChecks?: boolean;
    requireBranchUpToDate?: boolean;
  } = {}): Promise<void> {
    const spinner = ora(`Protecting branch ${branch}...`).start();
    
    try {
      const { owner, repo } = await this.getCurrentRepo();
      
      await this.apiClient.put(`/repos/${owner}/${repo}/branches/${branch}/protection`, {
        required_status_checks: options.requireStatusChecks ? {
          strict: options.requireBranchUpToDate || false,
          contexts: []
        } : null,
        enforce_admins: false,
        required_pull_request_reviews: options.requirePullRequest ? {
          dismissal_restrictions: {},
          dismiss_stale_reviews: options.dismissStaleReviews || false,
          require_code_owner_reviews: options.requireCodeOwnerReviews || false,
          required_approving_review_count: options.requireReviews || 1
        } : null,
        restrictions: null
      });

      spinner.succeed(`Branch ${branch} protected`);
    } catch (error: any) {
      spinner.fail('Failed to protect branch');
      throw error;
    }
  }
}

// Export singleton instance
export const github = new GitHubIntegration();

// Export for use in Canvas CLI tools
export default {
  name: 'github',
  description: 'GitHub integration for pull requests, issues, actions, and more',
  
  async execute(action: string, ...args: any[]): Promise<any> {
    switch (action) {
      case 'auth':
        return github.authenticate(args[0]);
      
      case 'pr':
      case 'pull-request':
        const prCommand = args[0];
        if (prCommand === 'create') {
          return github.createPullRequest({
            title: args[1],
            body: args[2],
            draft: args[3]
          });
        } else if (prCommand === 'list') {
          return github.listPullRequests({ state: args[1] });
        }
        break;
      
      case 'issue':
        const issueCommand = args[0];
        if (issueCommand === 'create') {
          return github.createIssue({
            title: args[1],
            body: args[2],
            labels: args[3]
          });
        } else if (issueCommand === 'list') {
          return github.listIssues({ state: args[1] });
        }
        break;
      
      case 'workflow':
      case 'action':
        const workflowCommand = args[0];
        if (workflowCommand === 'list') {
          return github.getWorkflowRuns({ status: args[1] });
        } else if (workflowCommand === 'trigger') {
          return github.triggerWorkflow(args[1], args[2]);
        }
        break;
      
      case 'release':
        return github.createRelease({
          tagName: args[0],
          name: args[1],
          body: args[2],
          draft: args[3],
          prerelease: args[4]
        });
      
      case 'fork':
        return github.forkRepository(args[0]);
      
      case 'search':
        return github.searchRepositories(args[0], {
          sort: args[1],
          limit: args[2]
        });
      
      case 'stats':
        return github.getRepoStats();
      
      case 'pages':
        return github.setupGitHubPages({
          branch: args[0],
          path: args[1]
        });
      
      case 'collaborator':
        return github.addCollaborator(args[0], args[1]);
      
      case 'protect':
        return github.protectBranch(args[0], {
          requirePullRequest: args[1],
          requireReviews: args[2]
        });
      
      default:
        throw new Error(`Unknown GitHub action: ${action}`);
    }
  }
};