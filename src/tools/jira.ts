/**
 * Jira Integration Tool for Canvas CLI
 * Complete Jira operations support for agile project management
 */

import type { AxiosInstance } from 'axios';
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

export interface JiraConfig {
  email?: string;
  apiToken?: string;
  domain?: string; // e.g., 'yourcompany.atlassian.net'
  projectKey?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: any;
    status: {
      name: string;
      statusCategory: {
        key: string;
        colorName: string;
        name: string;
      };
    };
    priority?: {
      name: string;
      iconUrl: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    reporter?: {
      displayName: string;
      emailAddress: string;
    };
    created: string;
    updated: string;
    labels?: string[];
    components?: any[];
    fixVersions?: any[];
    issuetype: {
      name: string;
      iconUrl: string;
      subtask: boolean;
    };
    project: {
      key: string;
      name: string;
    };
    storyPoints?: number;
    epic?: string;
    sprint?: any;
  };
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  originBoardId: number;
  goal?: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: 'scrum' | 'kanban';
  self: string;
  location?: {
    projectId: number;
    projectKey: string;
    projectName: string;
  };
}

export interface CreateIssueRequest {
  summary: string;
  description?: string;
  issueType: 'Bug' | 'Story' | 'Task' | 'Epic' | 'Sub-task';
  projectKey?: string;
  priority?: 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';
  labels?: string[];
  assignee?: string;
  storyPoints?: number;
  epicKey?: string;
  sprintId?: number;
}

export class JiraIntegration {
  private api: AxiosInstance;
  private agileApi: AxiosInstance;
  private config: JiraConfig;
  private configPath: string;

  constructor(config?: JiraConfig) {
    this.configPath = path.join(homedir(), '.canvas-cli', 'jira.json');
    this.config = this.loadConfig(config);
    
    const baseURL = `https://${this.config.domain}/rest/api/3`;
    const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    
    this.api = axios.create({
      baseURL,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });

    this.agileApi = axios.create({
      baseURL: `https://${this.config.domain}/rest/agile/1.0`,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  private loadConfig(providedConfig?: JiraConfig): JiraConfig {
    let config: JiraConfig = {};

    // Load from file if exists
    if (existsSync(this.configPath)) {
      try {
        config = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not parse Jira config file'));
      }
    }

    // Override with provided config
    if (providedConfig) {
      config = { ...config, ...providedConfig };
    }

    // Check environment variables
    config.email = config.email || process.env.JIRA_EMAIL;
    config.apiToken = config.apiToken || process.env.JIRA_API_TOKEN;
    config.domain = config.domain || process.env.JIRA_DOMAIN;
    config.projectKey = config.projectKey || process.env.JIRA_PROJECT_KEY;

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
  public async authenticate(email: string, apiToken: string, domain: string): Promise<boolean> {
    const spinner = ora('Authenticating with Jira...').start();
    
    try {
      this.config.email = email;
      this.config.apiToken = apiToken;
      this.config.domain = domain;
      
      const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
      this.api.defaults.headers['Authorization'] = `Basic ${auth}`;
      this.agileApi.defaults.headers['Authorization'] = `Basic ${auth}`;
      
      const response = await this.api.get('/myself');
      
      this.saveConfig();
      spinner.succeed(`Authenticated as ${chalk.cyan(response.data.displayName)}`);
      return true;
    } catch (error: any) {
      spinner.fail('Authentication failed');
      throw new Error(`Jira authentication failed: ${error.message}`);
    }
  }

  // Projects
  public async listProjects(): Promise<any[]> {
    const response = await this.api.get('/project');
    return response.data;
  }

  public async getProject(projectKey?: string): Promise<any> {
    const key = projectKey || this.config.projectKey;
    if (!key) throw new Error('Project key is required');

    const response = await this.api.get(`/project/${key}`);
    return response.data;
  }

  // Issues
  public async createIssue(request: CreateIssueRequest): Promise<JiraIssue> {
    const spinner = ora('Creating Jira issue...').start();
    
    try {
      const projectKey = request.projectKey || this.config.projectKey;
      if (!projectKey) throw new Error('Project key is required');

      const issueData: any = {
        fields: {
          project: { key: projectKey },
          summary: request.summary,
          issuetype: { name: request.issueType }
        }
      };

      if (request.description) {
        issueData.fields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{
              type: 'text',
              text: request.description
            }]
          }]
        };
      }

      if (request.priority) issueData.fields.priority = { name: request.priority };
      if (request.labels) issueData.fields.labels = request.labels;
      if (request.assignee) issueData.fields.assignee = { accountId: request.assignee };
      if (request.storyPoints) issueData.fields.customfield_10016 = request.storyPoints;
      if (request.epicKey) issueData.fields.parent = { key: request.epicKey };

      const response = await this.api.post('/issue', issueData);
      const createdIssue = await this.getIssue(response.data.key);

      spinner.succeed(`Issue created: ${chalk.cyan(createdIssue.key)} - ${createdIssue.fields.summary}`);
      return createdIssue;
    } catch (error: any) {
      spinner.fail('Failed to create issue');
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  public async getIssue(issueKey: string): Promise<JiraIssue> {
    const response = await this.api.get(`/issue/${issueKey}`);
    return response.data;
  }

  public async updateIssue(issueKey: string, updates: any): Promise<void> {
    const spinner = ora('Updating issue...').start();
    
    try {
      await this.api.put(`/issue/${issueKey}`, { fields: updates });
      spinner.succeed(`Issue ${issueKey} updated`);
    } catch (error: any) {
      spinner.fail('Failed to update issue');
      throw new Error(`Failed to update issue: ${error.message}`);
    }
  }

  public async searchIssues(jql: string, maxResults: number = 50): Promise<JiraIssue[]> {
    const response = await this.api.get('/search', {
      params: {
        jql,
        maxResults,
        fields: 'summary,status,priority,assignee,reporter,created,updated,labels,issuetype,project'
      }
    });
    return response.data.issues;
  }

  public async getMyIssues(): Promise<JiraIssue[]> {
    const jql = `assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC, updated DESC`;
    return this.searchIssues(jql);
  }

  public async transitionIssue(issueKey: string, transitionName: string): Promise<void> {
    const spinner = ora(`Transitioning ${issueKey} to ${transitionName}...`).start();
    
    try {
      // Get available transitions
      const transitionsResponse = await this.api.get(`/issue/${issueKey}/transitions`);
      const transitions = transitionsResponse.data.transitions;
      
      const transition = transitions.find((t: any) => 
        t.name.toLowerCase() === transitionName.toLowerCase()
      );
      
      if (!transition) {
        throw new Error(`Transition '${transitionName}' not available`);
      }

      await this.api.post(`/issue/${issueKey}/transitions`, {
        transition: { id: transition.id }
      });

      spinner.succeed(`Issue ${issueKey} transitioned to ${transitionName}`);
    } catch (error: any) {
      spinner.fail('Failed to transition issue');
      throw new Error(`Failed to transition issue: ${error.message}`);
    }
  }

  public async addComment(issueKey: string, comment: string): Promise<void> {
    await this.api.post(`/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: comment
          }]
        }]
      }
    });
  }

  // Boards and Sprints
  public async listBoards(projectKey?: string): Promise<JiraBoard[]> {
    const params: any = { maxResults: 50 };
    if (projectKey) params.projectKeyOrId = projectKey;

    const response = await this.agileApi.get('/board', { params });
    return response.data.values;
  }

  public async getBoard(boardId: number): Promise<JiraBoard> {
    const response = await this.agileApi.get(`/board/${boardId}`);
    return response.data;
  }

  public async listSprints(boardId: number, state?: 'active' | 'closed' | 'future'): Promise<JiraSprint[]> {
    const params: any = { maxResults: 50 };
    if (state) params.state = state;

    const response = await this.agileApi.get(`/board/${boardId}/sprint`, { params });
    return response.data.values;
  }

  public async getActiveSprint(boardId: number): Promise<JiraSprint | null> {
    const sprints = await this.listSprints(boardId, 'active');
    return sprints.length > 0 ? sprints[0] : null;
  }

  public async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    const response = await this.agileApi.get(`/sprint/${sprintId}/issue`, {
      params: {
        maxResults: 100,
        fields: 'summary,status,priority,assignee,issuetype'
      }
    });
    return response.data.issues;
  }

  public async moveIssuesToSprint(sprintId: number, issueKeys: string[]): Promise<void> {
    const spinner = ora('Moving issues to sprint...').start();
    
    try {
      await this.agileApi.post(`/sprint/${sprintId}/issue`, {
        issues: issueKeys
      });
      spinner.succeed(`Moved ${issueKeys.length} issues to sprint`);
    } catch (error: any) {
      spinner.fail('Failed to move issues to sprint');
      throw new Error(`Failed to move issues: ${error.message}`);
    }
  }

  // Epics
  public async createEpic(
    summary: string,
    description?: string,
    projectKey?: string
  ): Promise<JiraIssue> {
    return this.createIssue({
      summary,
      description,
      issueType: 'Epic',
      projectKey
    });
  }

  public async getEpicIssues(epicKey: string): Promise<JiraIssue[]> {
    const jql = `"Epic Link" = ${epicKey} OR parent = ${epicKey}`;
    return this.searchIssues(jql, 100);
  }

  // Bulk Operations
  public async bulkCreateIssues(issues: CreateIssueRequest[]): Promise<JiraIssue[]> {
    const spinner = ora(`Creating ${issues.length} issues...`).start();
    
    try {
      const createdIssues: JiraIssue[] = [];
      
      for (const issue of issues) {
        spinner.text = `Creating: ${issue.summary}`;
        const created = await this.createIssue(issue);
        createdIssues.push(created);
      }
      
      spinner.succeed(`Created ${createdIssues.length} issues`);
      return createdIssues;
    } catch (error: any) {
      spinner.fail('Bulk creation failed');
      throw error;
    }
  }

  // Reports
  public async getSprintReport(sprintId: number): Promise<any> {
    const issues = await this.getSprintIssues(sprintId);
    
    const report = {
      total: issues.length,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byAssignee: {} as Record<string, number>,
      completed: 0,
      inProgress: 0,
      todo: 0
    };

    for (const issue of issues) {
      // By status
      const status = issue.fields.status.name;
      report.byStatus[status] = (report.byStatus[status] || 0) + 1;
      
      // By type
      const type = issue.fields.issuetype.name;
      report.byType[type] = (report.byType[type] || 0) + 1;
      
      // By assignee
      const assignee = issue.fields.assignee?.displayName || 'Unassigned';
      report.byAssignee[assignee] = (report.byAssignee[assignee] || 0) + 1;
      
      // Status categories
      const category = issue.fields.status.statusCategory.key;
      if (category === 'done') report.completed++;
      else if (category === 'indeterminate') report.inProgress++;
      else report.todo++;
    }

    return report;
  }

  // Webhooks
  public async createWebhook(
    name: string,
    url: string,
    events: string[]
  ): Promise<any> {
    const response = await this.api.post('/webhook', {
      name,
      url,
      events,
      filters: {},
      excludeBody: false
    });
    return response.data;
  }

  public async listWebhooks(): Promise<any[]> {
    const response = await this.api.get('/webhook');
    return response.data.values;
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _jira: JiraIntegration | null = null;
export function getJira(): JiraIntegration {
  if (!_jira) _jira = new JiraIntegration();
  return _jira;
}