/**
 * Integration Tool Wrappers for Canvas CLI
 * Provides tool-compatible interfaces for third-party integrations
 */

import type { Tool } from '../types.js';
import { gitlab } from './gitlab.js';
import { jira } from './jira.js';
import { slack } from './slack.js';
import chalk from 'chalk';

// GitLab Tools
export class GitLabMRTool implements Tool {
  name = 'gitlab_merge_request';
  description = 'Create or manage GitLab merge requests';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['create', 'list', 'merge', 'get'],
      description: 'Action to perform' 
    },
    title: { type: 'string', description: 'MR title (for create)' },
    sourceBranch: { type: 'string', description: 'Source branch (for create)' },
    targetBranch: { type: 'string', description: 'Target branch (for create)' },
    description: { type: 'string', description: 'MR description', optional: true },
    mrIid: { type: 'number', description: 'MR IID (for get/merge)' },
    state: { type: 'string', description: 'State filter (for list)', optional: true }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    if (!params.action || typeof params.action !== 'string') {
      throw new Error('Action is required (create, list, merge, get)');
    }

    switch (params.action) {
      case 'create':
        if (!params.title || !params.sourceBranch || !params.targetBranch) {
          throw new Error('title, sourceBranch, and targetBranch are required for create');
        }
        return await gitlab.createMergeRequest(
          params.title,
          params.sourceBranch,
          params.targetBranch,
          params.description
        );
      case 'list':
        return await gitlab.listMergeRequests(params.state || 'opened');
      case 'merge':
        if (!params.mrIid) throw new Error('mrIid is required for merge');
        return await gitlab.mergeMergeRequest(params.mrIid);
      case 'get':
        if (!params.mrIid) throw new Error('mrIid is required for get');
        return await gitlab.getMergeRequest(params.mrIid);
      default:
        throw new Error(`Unknown action: ${params.action}. Use: create, list, merge, get`);
    }
  }
}

export class GitLabPipelineTool implements Tool {
  name = 'gitlab_pipeline';
  description = 'Manage GitLab CI/CD pipelines';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['trigger', 'list', 'get', 'retry', 'cancel'],
      description: 'Action to perform' 
    },
    ref: { type: 'string', description: 'Git ref (branch/tag)' },
    pipelineId: { type: 'number', description: 'Pipeline ID' },
    variables: { type: 'object', description: 'Pipeline variables', optional: true }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    if (!params.action || typeof params.action !== 'string') {
      throw new Error('Action is required (trigger, list, get, retry, cancel)');
    }

    switch (params.action) {
      case 'trigger':
        if (!params.ref) throw new Error('ref is required for trigger');
        return await gitlab.triggerPipeline(params.ref, params.variables);
      case 'list':
        return await gitlab.listPipelines(params.ref);
      case 'get':
        if (!params.pipelineId) throw new Error('pipelineId is required for get');
        return await gitlab.getPipeline(params.pipelineId);
      case 'retry':
        if (!params.pipelineId) throw new Error('pipelineId is required for retry');
        return await gitlab.retryPipeline(params.pipelineId);
      case 'cancel':
        if (!params.pipelineId) throw new Error('pipelineId is required for cancel');
        return await gitlab.cancelPipeline(params.pipelineId);
      default:
        throw new Error(`Unknown action: ${params.action}. Use: trigger, list, get, retry, cancel`);
    }
  }
}

export class GitLabIssueTool implements Tool {
  name = 'gitlab_issue';
  description = 'Create and manage GitLab issues';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['create', 'list', 'update'],
      description: 'Action to perform' 
    },
    title: { type: 'string', description: 'Issue title' },
    description: { type: 'string', description: 'Issue description', optional: true },
    labels: { type: 'array', description: 'Issue labels', optional: true },
    issueIid: { type: 'number', description: 'Issue IID (for update)' },
    updates: { type: 'object', description: 'Updates to apply', optional: true }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    if (!params.action || typeof params.action !== 'string') {
      throw new Error('Action is required (create, list, update)');
    }

    switch (params.action) {
      case 'create':
        if (!params.title) throw new Error('title is required for create');
        return await gitlab.createIssue(
          params.title,
          params.description,
          params.labels
        );
      case 'list':
        return await gitlab.listIssues('opened', params.labels);
      case 'update':
        if (!params.issueIid) throw new Error('issueIid is required for update');
        return await gitlab.updateIssue(params.issueIid, params.updates);
      default:
        throw new Error(`Unknown action: ${params.action}. Use: create, list, update`);
    }
  }
}

// Jira Tools
export class JiraIssueTool implements Tool {
  name = 'jira_issue';
  description = 'Create and manage Jira issues';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['create', 'get', 'update', 'transition', 'search', 'my_issues'],
      description: 'Action to perform' 
    },
    summary: { type: 'string', description: 'Issue summary' },
    description: { type: 'string', description: 'Issue description', optional: true },
    issueType: { 
      type: 'string', 
      enum: ['Bug', 'Story', 'Task', 'Epic', 'Sub-task'],
      description: 'Issue type' 
    },
    issueKey: { type: 'string', description: 'Issue key (e.g., PROJ-123)' },
    transitionName: { type: 'string', description: 'Transition name' },
    jql: { type: 'string', description: 'JQL query for search' },
    updates: { type: 'object', description: 'Field updates', optional: true }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    if (!params.action || typeof params.action !== 'string') {
      throw new Error('Action is required (create, get, update, transition, search, my_issues)');
    }

    switch (params.action) {
      case 'create':
        if (!params.summary) throw new Error('summary is required for create');
        return await jira.createIssue({
          summary: params.summary,
          description: params.description,
          issueType: params.issueType || 'Task'
        });
      case 'get':
        if (!params.issueKey) throw new Error('issueKey is required for get');
        return await jira.getIssue(params.issueKey);
      case 'update':
        if (!params.issueKey) throw new Error('issueKey is required for update');
        return await jira.updateIssue(params.issueKey, params.updates);
      case 'transition':
        if (!params.issueKey || !params.transitionName) {
          throw new Error('issueKey and transitionName are required for transition');
        }
        return await jira.transitionIssue(params.issueKey, params.transitionName);
      case 'search':
        if (!params.jql) throw new Error('jql is required for search');
        return await jira.searchIssues(params.jql);
      case 'my_issues':
        return await jira.getMyIssues();
      default:
        throw new Error(`Unknown action: ${params.action}. Use: create, get, update, transition, search, my_issues`);
    }
  }
}

export class JiraSprintTool implements Tool {
  name = 'jira_sprint';
  description = 'Manage Jira sprints and boards';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['list_boards', 'list_sprints', 'get_active', 'get_issues', 'move_issues'],
      description: 'Action to perform' 
    },
    boardId: { type: 'number', description: 'Board ID' },
    sprintId: { type: 'number', description: 'Sprint ID' },
    issueKeys: { type: 'array', description: 'Issue keys to move' },
    state: { type: 'string', description: 'Sprint state filter', optional: true }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    switch (params.action) {
      case 'list_boards':
        return await jira.listBoards();
      case 'list_sprints':
        return await jira.listSprints(params.boardId, params.state);
      case 'get_active':
        return await jira.getActiveSprint(params.boardId);
      case 'get_issues':
        return await jira.getSprintIssues(params.sprintId);
      case 'move_issues':
        return await jira.moveIssuesToSprint(params.sprintId, params.issueKeys);
      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }
}

export class JiraReportTool implements Tool {
  name = 'jira_report';
  description = 'Generate Jira reports';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['sprint_report', 'epic_issues'],
      description: 'Report type' 
    },
    sprintId: { type: 'number', description: 'Sprint ID' },
    epicKey: { type: 'string', description: 'Epic key' }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    switch (params.action) {
      case 'sprint_report':
        const report = await jira.getSprintReport(params.sprintId);
        console.log(chalk.cyan('\n📊 Sprint Report:'));
        console.log(chalk.white(`Total Issues: ${report.total}`));
        console.log(chalk.green(`Completed: ${report.completed}`));
        console.log(chalk.yellow(`In Progress: ${report.inProgress}`));
        console.log(chalk.gray(`To Do: ${report.todo}`));
        return report;
      case 'epic_issues':
        return await jira.getEpicIssues(params.epicKey);
      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }
}

// Slack Tools
export class SlackMessageTool implements Tool {
  name = 'slack_message';
  description = 'Send messages to Slack';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['send', 'update', 'delete', 'ephemeral'],
      description: 'Action to perform' 
    },
    channel: { type: 'string', description: 'Channel ID or name' },
    text: { type: 'string', description: 'Message text' },
    timestamp: { type: 'string', description: 'Message timestamp (for update/delete)' },
    user: { type: 'string', description: 'User ID (for ephemeral)' },
    blocks: { type: 'array', description: 'Block Kit blocks', optional: true }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    if (!params.action || typeof params.action !== 'string') {
      throw new Error('Action is required (send, update, delete, ephemeral)');
    }
    if (!params.channel) {
      throw new Error('channel is required');
    }

    switch (params.action) {
      case 'send':
        if (!params.text && !params.blocks) {
          throw new Error('text or blocks is required for send');
        }
        return await slack.sendMessage({
          channel: params.channel,
          text: params.text,
          blocks: params.blocks
        });
      case 'update':
        if (!params.timestamp) throw new Error('timestamp is required for update');
        return await slack.updateMessage(params.channel, params.timestamp, {
          text: params.text,
          blocks: params.blocks
        });
      case 'delete':
        if (!params.timestamp) throw new Error('timestamp is required for delete');
        return await slack.deleteMessage(params.channel, params.timestamp);
      case 'ephemeral':
        if (!params.user || !params.text) {
          throw new Error('user and text are required for ephemeral');
        }
        return await slack.sendEphemeral(params.channel, params.user, params.text);
      default:
        throw new Error(`Unknown action: ${params.action}. Use: send, update, delete, ephemeral`);
    }
  }
}

export class SlackNotificationTool implements Tool {
  name = 'slack_notification';
  description = 'Send notifications to Slack';
  
  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  parameters = {
    type: { 
      type: 'string', 
      enum: ['deployment', 'build', 'test', 'error', 'custom'],
      description: 'Notification type' 
    },
    // Deployment params
    environment: { type: 'string', description: 'Deployment environment' },
    version: { type: 'string', description: 'Version/release' },
    status: { type: 'string', description: 'Status' },
    // Build params
    project: { type: 'string', description: 'Project name' },
    branch: { type: 'string', description: 'Git branch' },
    buildUrl: { type: 'string', description: 'Build URL', optional: true },
    // Test params
    suite: { type: 'string', description: 'Test suite name' },
    passed: { type: 'number', description: 'Passed tests' },
    failed: { type: 'number', description: 'Failed tests' },
    skipped: { type: 'number', description: 'Skipped tests' },
    duration: { type: 'number', description: 'Duration in ms' },
    // Error params
    error: { type: 'object', description: 'Error object' },
    context: { type: 'string', description: 'Error context', optional: true },
    // Custom notification
    title: { type: 'string', description: 'Notification title' },
    message: { type: 'string', description: 'Notification message' },
    channel: { type: 'string', description: 'Target channel', optional: true }
  };

  async run(params: any): Promise<any> {
    switch (params.type) {
      case 'deployment':
        return await slack.notifyDeployment(
          params.environment,
          params.version,
          params.status,
          params.message,
          params.channel
        );
      case 'build':
        return await slack.notifyBuild(
          params.project,
          params.branch,
          params.status,
          params.buildUrl,
          params.channel
        );
      case 'test':
        return await slack.notifyTest(
          params.suite,
          params.passed,
          params.failed,
          params.skipped,
          params.duration,
          params.channel
        );
      case 'error':
        return await slack.notifyError(
          params.error,
          params.context,
          params.channel
        );
      case 'custom':
        return await slack.sendNotification({
          type: 'info',
          title: params.title,
          message: params.message
        }, params.channel);
      default:
        throw new Error(`Unknown notification type: ${params.type}`);
    }
  }
}

export class SlackChannelTool implements Tool {
  name = 'slack_channel';
  description = 'Manage Slack channels';
  parameters = {
    action: { 
      type: 'string', 
      enum: ['list', 'get', 'create', 'invite'],
      description: 'Action to perform' 
    },
    channel: { type: 'string', description: 'Channel ID' },
    name: { type: 'string', description: 'Channel name (for create)' },
    isPrivate: { type: 'boolean', description: 'Private channel', optional: true },
    users: { type: 'array', description: 'User IDs to invite' }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    switch (params.action) {
      case 'list':
        return await slack.listChannels();
      case 'get':
        return await slack.getChannel(params.channel);
      case 'create':
        return await slack.createChannel(params.name, params.isPrivate);
      case 'invite':
        return await slack.inviteToChannel(params.channel, params.users);
      default:
        throw new Error(`Unknown action: ${params.action}`);
    }
  }
}

// Authentication Tools
export class IntegrationAuthTool implements Tool {
  name = 'integration_auth';
  description = 'Authenticate with third-party services';
  parameters = {
    service: { 
      type: 'string', 
      enum: ['gitlab', 'jira', 'slack'],
      description: 'Service to authenticate' 
    },
    // GitLab auth
    gitlabToken: { type: 'string', description: 'GitLab personal access token' },
    // Jira auth
    jiraEmail: { type: 'string', description: 'Jira email' },
    jiraApiToken: { type: 'string', description: 'Jira API token' },
    jiraDomain: { type: 'string', description: 'Jira domain (e.g., company.atlassian.net)' },
    // Slack auth
    slackBotToken: { type: 'string', description: 'Slack bot token' }
  };

  async execute(params: any): Promise<any> {
    return this.run(params);
  }

  async run(params: any): Promise<any> {
    switch (params.service) {
      case 'gitlab':
        return await gitlab.authenticate(params.gitlabToken);
      case 'jira':
        return await jira.authenticate(
          params.jiraEmail,
          params.jiraApiToken,
          params.jiraDomain
        );
      case 'slack':
        return await slack.authenticate(params.slackBotToken);
      default:
        throw new Error(`Unknown service: ${params.service}`);
    }
  }
}