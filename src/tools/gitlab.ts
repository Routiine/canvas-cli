/**
 * GitLab Integration Tool for Canvas CLI
 * Complete GitLab operations support including CI/CD
 */

import type { AxiosInstance } from 'axios';
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

export interface GitLabConfig {
  token?: string;
  apiUrl?: string;
  projectId?: string;
  username?: string;
}

export interface GitLabMergeRequest {
  id: number;
  iid: number;
  title: string;
  state: string;
  web_url: string;
  author: {
    username: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
  description?: string;
  draft: boolean;
  merged: boolean;
  merge_status?: string;
  target_branch: string;
  source_branch: string;
}

export interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  state: string;
  web_url: string;
  author: {
    username: string;
    name: string;
  };
  created_at: string;
  updated_at: string;
  description?: string;
  labels: string[];
  assignees: any[];
}

export interface GitLabPipeline {
  id: number;
  status: string;
  ref: string;
  sha: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  finished_at?: string;
}

export class GitLabIntegration {
  private api: AxiosInstance;
  private config: GitLabConfig;
  private configPath: string;

  constructor(config?: GitLabConfig) {
    this.configPath = path.join(homedir(), '.canvas-cli', 'gitlab.json');
    this.config = this.loadConfig(config);
    
    this.api = axios.create({
      baseURL: this.config.apiUrl || 'https://gitlab.com/api/v4',
      headers: {
        'PRIVATE-TOKEN': this.config.token,
        'Content-Type': 'application/json'
      }
    });
  }

  private loadConfig(providedConfig?: GitLabConfig): GitLabConfig {
    let config: GitLabConfig = {};

    // Load from file if exists
    if (existsSync(this.configPath)) {
      try {
        config = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not parse GitLab config file'));
      }
    }

    // Override with provided config
    if (providedConfig) {
      config = { ...config, ...providedConfig };
    }

    // Check environment variables
    config.token = config.token || process.env.GITLAB_TOKEN;
    config.apiUrl = config.apiUrl || process.env.GITLAB_API_URL;
    config.projectId = config.projectId || process.env.GITLAB_PROJECT_ID;

    return config;
  }

  public saveConfig(): void {
    const dir = path.dirname(this.configPath);
    if (!existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  // Authentication
  public async authenticate(token: string): Promise<boolean> {
    const spinner = ora('Authenticating with GitLab...').start();
    
    try {
      this.config.token = token;
      this.api.defaults.headers['PRIVATE-TOKEN'] = token;
      
      const response = await this.api.get('/user');
      this.config.username = response.data.username;
      
      this.saveConfig();
      spinner.succeed(`Authenticated as ${chalk.cyan(response.data.name)}`);
      return true;
    } catch (error: any) {
      spinner.fail('Authentication failed');
      throw new Error(`GitLab authentication failed: ${error.message}`);
    }
  }

  // Projects
  public async getProject(projectId?: string): Promise<any> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.get(`/projects/${encodeURIComponent(id)}`);
    return response.data;
  }

  public async listProjects(search?: string): Promise<any[]> {
    const params: any = { membership: true, per_page: 100 };
    if (search) params.search = search;

    const response = await this.api.get('/projects', { params });
    return response.data;
  }

  // Merge Requests
  public async createMergeRequest(
    title: string,
    sourceBranch: string,
    targetBranch: string,
    description?: string,
    projectId?: string
  ): Promise<GitLabMergeRequest> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const spinner = ora('Creating merge request...').start();
    
    try {
      const response = await this.api.post(`/projects/${encodeURIComponent(id)}/merge_requests`, {
        title,
        source_branch: sourceBranch,
        target_branch: targetBranch,
        description,
        remove_source_branch: true,
        squash: false
      });

      spinner.succeed(`Merge request created: ${chalk.cyan(response.data.web_url)}`);
      return response.data;
    } catch (error: any) {
      spinner.fail('Failed to create merge request');
      throw new Error(`Failed to create merge request: ${error.message}`);
    }
  }

  public async listMergeRequests(
    state: 'opened' | 'closed' | 'merged' | 'all' = 'opened',
    projectId?: string
  ): Promise<GitLabMergeRequest[]> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.get(`/projects/${encodeURIComponent(id)}/merge_requests`, {
      params: { state, per_page: 100 }
    });
    return response.data;
  }

  public async getMergeRequest(mrIid: number, projectId?: string): Promise<GitLabMergeRequest> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.get(`/projects/${encodeURIComponent(id)}/merge_requests/${mrIid}`);
    return response.data;
  }

  public async mergeMergeRequest(mrIid: number, projectId?: string): Promise<void> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const spinner = ora('Merging merge request...').start();
    
    try {
      await this.api.put(`/projects/${encodeURIComponent(id)}/merge_requests/${mrIid}/merge`);
      spinner.succeed('Merge request merged successfully');
    } catch (error: any) {
      spinner.fail('Failed to merge merge request');
      throw new Error(`Failed to merge: ${error.message}`);
    }
  }

  // Issues
  public async createIssue(
    title: string,
    description?: string,
    labels?: string[],
    projectId?: string
  ): Promise<GitLabIssue> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const spinner = ora('Creating issue...').start();
    
    try {
      const response = await this.api.post(`/projects/${encodeURIComponent(id)}/issues`, {
        title,
        description,
        labels: labels?.join(',')
      });

      spinner.succeed(`Issue created: ${chalk.cyan(response.data.web_url)}`);
      return response.data;
    } catch (error: any) {
      spinner.fail('Failed to create issue');
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  public async listIssues(
    state: 'opened' | 'closed' | 'all' = 'opened',
    labels?: string[],
    projectId?: string
  ): Promise<GitLabIssue[]> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const params: any = { state, per_page: 100 };
    if (labels) params.labels = labels.join(',');

    const response = await this.api.get(`/projects/${encodeURIComponent(id)}/issues`, { params });
    return response.data;
  }

  public async updateIssue(
    issueIid: number,
    updates: Partial<GitLabIssue>,
    projectId?: string
  ): Promise<GitLabIssue> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.put(
      `/projects/${encodeURIComponent(id)}/issues/${issueIid}`,
      updates
    );
    return response.data;
  }

  // CI/CD Pipelines
  public async listPipelines(
    ref?: string,
    projectId?: string
  ): Promise<GitLabPipeline[]> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const params: any = { per_page: 100 };
    if (ref) params.ref = ref;

    const response = await this.api.get(`/projects/${encodeURIComponent(id)}/pipelines`, { params });
    return response.data;
  }

  public async getPipeline(pipelineId: number, projectId?: string): Promise<GitLabPipeline> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.get(`/projects/${encodeURIComponent(id)}/pipelines/${pipelineId}`);
    return response.data;
  }

  public async triggerPipeline(
    ref: string,
    variables?: Record<string, string>,
    projectId?: string
  ): Promise<GitLabPipeline> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const spinner = ora('Triggering pipeline...').start();
    
    try {
      const response = await this.api.post(`/projects/${encodeURIComponent(id)}/pipeline`, {
        ref,
        variables: variables ? Object.entries(variables).map(([key, value]) => ({ key, value })) : []
      });

      spinner.succeed(`Pipeline triggered: ${chalk.cyan(response.data.web_url)}`);
      return response.data;
    } catch (error: any) {
      spinner.fail('Failed to trigger pipeline');
      throw new Error(`Failed to trigger pipeline: ${error.message}`);
    }
  }

  public async retryPipeline(pipelineId: number, projectId?: string): Promise<GitLabPipeline> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.post(`/projects/${encodeURIComponent(id)}/pipelines/${pipelineId}/retry`);
    return response.data;
  }

  public async cancelPipeline(pipelineId: number, projectId?: string): Promise<GitLabPipeline> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.post(`/projects/${encodeURIComponent(id)}/pipelines/${pipelineId}/cancel`);
    return response.data;
  }

  // Repository
  public async getFile(filePath: string, ref: string = 'main', projectId?: string): Promise<string> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.get(
      `/projects/${encodeURIComponent(id)}/repository/files/${encodeURIComponent(filePath)}`,
      { params: { ref } }
    );
    
    return Buffer.from(response.data.content, 'base64').toString('utf-8');
  }

  public async updateFile(
    filePath: string,
    content: string,
    commitMessage: string,
    branch: string = 'main',
    projectId?: string
  ): Promise<void> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    await this.api.put(
      `/projects/${encodeURIComponent(id)}/repository/files/${encodeURIComponent(filePath)}`,
      {
        content: Buffer.from(content).toString('base64'),
        commit_message: commitMessage,
        branch
      }
    );
  }

  // Branches
  public async listBranches(projectId?: string): Promise<any[]> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.get(`/projects/${encodeURIComponent(id)}/repository/branches`);
    return response.data;
  }

  public async createBranch(name: string, ref: string = 'main', projectId?: string): Promise<any> {
    const id = projectId || this.config.projectId;
    if (!id) throw new Error('Project ID is required');

    const response = await this.api.post(`/projects/${encodeURIComponent(id)}/repository/branches`, {
      branch: name,
      ref
    });
    return response.data;
  }

  // Search
  public async searchCode(query: string, projectId?: string): Promise<any[]> {
    const id = projectId || this.config.projectId;
    
    const params: any = { scope: 'blobs', search: query, per_page: 100 };
    if (id) params.project_id = id;

    const response = await this.api.get('/search', { params });
    return response.data;
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _gitlab: GitLabIntegration | null = null;
export function getGitLab(): GitLabIntegration {
  if (!_gitlab) _gitlab = new GitLabIntegration();
  return _gitlab;
}