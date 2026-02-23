/**
 * Slack Integration Tool for Canvas CLI
 * Complete Slack notifications and interaction support
 */

import type { AxiosInstance } from 'axios';
import axios from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { EventEmitter } from 'events';

export interface SlackConfig {
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
  defaultChannel?: string;
  webhookUrl?: string;
}

export interface SlackMessage {
  channel?: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
  thread_ts?: string;
  reply_broadcast?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

export interface SlackNotification {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  fields?: { title: string; value: string; short?: boolean }[];
  actions?: { text: string; url: string }[];
  footer?: string;
  timestamp?: Date;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_mpim: boolean;
  is_private: boolean;
  created: number;
  creator: string;
  is_archived: boolean;
  is_general: boolean;
  name_normalized: string;
  is_shared: boolean;
  is_org_shared: boolean;
  is_member: boolean;
  is_private_im: boolean;
  is_mpim_shared: boolean;
  num_members?: number;
}

export interface SlackUser {
  id: string;
  team_id: string;
  name: string;
  deleted: boolean;
  real_name: string;
  profile: {
    title?: string;
    email?: string;
    image_72?: string;
    status_text?: string;
    status_emoji?: string;
  };
  is_admin?: boolean;
  is_owner?: boolean;
  is_bot: boolean;
  is_app_user: boolean;
}

export class SlackIntegration extends EventEmitter {
  private api: AxiosInstance;
  private config: SlackConfig;
  private configPath: string;

  constructor(config?: SlackConfig) {
    super();
    this.configPath = path.join(homedir(), '.canvas-cli', 'slack.json');
    this.config = this.loadConfig(config);
    
    this.api = axios.create({
      baseURL: 'https://slack.com/api',
      headers: {
        'Authorization': `Bearer ${this.config.botToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  private loadConfig(providedConfig?: SlackConfig): SlackConfig {
    let config: SlackConfig = {};

    // Load from file if exists
    if (existsSync(this.configPath)) {
      try {
        config = JSON.parse(readFileSync(this.configPath, 'utf-8'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not parse Slack config file'));
      }
    }

    // Override with provided config
    if (providedConfig) {
      config = { ...config, ...providedConfig };
    }

    // Check environment variables
    config.botToken = config.botToken || process.env.SLACK_BOT_TOKEN;
    config.appToken = config.appToken || process.env.SLACK_APP_TOKEN;
    config.signingSecret = config.signingSecret || process.env.SLACK_SIGNING_SECRET;
    config.defaultChannel = config.defaultChannel || process.env.SLACK_DEFAULT_CHANNEL;
    config.webhookUrl = config.webhookUrl || process.env.SLACK_WEBHOOK_URL;

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
  public async authenticate(botToken: string): Promise<boolean> {
    const spinner = ora('Authenticating with Slack...').start();
    
    try {
      this.config.botToken = botToken;
      this.api.defaults.headers['Authorization'] = `Bearer ${botToken}`;
      
      const response = await this.api.post('/auth.test');
      
      if (!response.data.ok) {
        throw new Error(response.data.error);
      }
      
      this.saveConfig();
      spinner.succeed(`Authenticated as ${chalk.cyan(response.data.user)} in workspace ${chalk.cyan(response.data.team)}`);
      return true;
    } catch (error: any) {
      spinner.fail('Authentication failed');
      throw new Error(`Slack authentication failed: ${error.message}`);
    }
  }

  // Messages
  public async sendMessage(message: SlackMessage): Promise<any> {
    const channel = message.channel || this.config.defaultChannel;
    if (!channel) throw new Error('Channel is required');

    const response = await this.api.post('/chat.postMessage', {
      ...message,
      channel
    });

    if (!response.data.ok) {
      throw new Error(`Failed to send message: ${response.data.error}`);
    }

    return response.data;
  }

  public async sendNotification(notification: SlackNotification, channel?: string): Promise<any> {
    const color = {
      success: 'good',
      warning: 'warning',
      error: 'danger',
      info: '#0084FF'
    }[notification.type];

    const attachment: any = {
      color,
      title: notification.title,
      text: notification.message,
      footer: notification.footer || 'Canvas CLI',
      footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
      ts: Math.floor((notification.timestamp || new Date()).getTime() / 1000)
    };

    if (notification.fields) {
      attachment.fields = notification.fields;
    }

    if (notification.actions) {
      attachment.actions = notification.actions.map(action => ({
        type: 'button',
        text: action.text,
        url: action.url
      }));
    }

    return this.sendMessage({
      channel: channel || this.config.defaultChannel,
      attachments: [attachment]
    });
  }

  public async updateMessage(channel: string, timestamp: string, message: SlackMessage): Promise<any> {
    const response = await this.api.post('/chat.update', {
      ...message,
      channel,
      ts: timestamp
    });

    if (!response.data.ok) {
      throw new Error(`Failed to update message: ${response.data.error}`);
    }

    return response.data;
  }

  public async deleteMessage(channel: string, timestamp: string): Promise<void> {
    const response = await this.api.post('/chat.delete', {
      channel,
      ts: timestamp
    });

    if (!response.data.ok) {
      throw new Error(`Failed to delete message: ${response.data.error}`);
    }
  }

  public async sendEphemeral(channel: string, user: string, text: string): Promise<any> {
    const response = await this.api.post('/chat.postEphemeral', {
      channel,
      user,
      text
    });

    if (!response.data.ok) {
      throw new Error(`Failed to send ephemeral message: ${response.data.error}`);
    }

    return response.data;
  }

  // Channels
  public async listChannels(types: string = 'public_channel,private_channel'): Promise<SlackChannel[]> {
    const response = await this.api.get('/conversations.list', {
      params: {
        types,
        limit: 1000
      }
    });

    if (!response.data.ok) {
      throw new Error(`Failed to list channels: ${response.data.error}`);
    }

    return response.data.channels;
  }

  public async getChannel(channel: string): Promise<SlackChannel> {
    const response = await this.api.get('/conversations.info', {
      params: { channel }
    });

    if (!response.data.ok) {
      throw new Error(`Failed to get channel info: ${response.data.error}`);
    }

    return response.data.channel;
  }

  public async createChannel(name: string, isPrivate: boolean = false): Promise<SlackChannel> {
    const response = await this.api.post('/conversations.create', {
      name,
      is_private: isPrivate
    });

    if (!response.data.ok) {
      throw new Error(`Failed to create channel: ${response.data.error}`);
    }

    return response.data.channel;
  }

  public async inviteToChannel(channel: string, users: string[]): Promise<void> {
    const response = await this.api.post('/conversations.invite', {
      channel,
      users: users.join(',')
    });

    if (!response.data.ok) {
      throw new Error(`Failed to invite users: ${response.data.error}`);
    }
  }

  // Users
  public async listUsers(): Promise<SlackUser[]> {
    const response = await this.api.get('/users.list', {
      params: { limit: 1000 }
    });

    if (!response.data.ok) {
      throw new Error(`Failed to list users: ${response.data.error}`);
    }

    return response.data.members;
  }

  public async getUser(user: string): Promise<SlackUser> {
    const response = await this.api.get('/users.info', {
      params: { user }
    });

    if (!response.data.ok) {
      throw new Error(`Failed to get user info: ${response.data.error}`);
    }

    return response.data.user;
  }

  // Files
  public async uploadFile(
    channels: string[],
    content: string,
    filename: string,
    title?: string,
    comment?: string
  ): Promise<any> {
    const response = await this.api.post('/files.upload', {
      channels: channels.join(','),
      content,
      filename,
      title,
      initial_comment: comment
    });

    if (!response.data.ok) {
      throw new Error(`Failed to upload file: ${response.data.error}`);
    }

    return response.data.file;
  }

  // Webhooks
  public async sendWebhook(url: string, payload: any): Promise<void> {
    const webhookUrl = url || this.config.webhookUrl;
    if (!webhookUrl) throw new Error('Webhook URL is required');

    const response = await axios.post(webhookUrl, payload);
    
    if (response.status !== 200) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }
  }

  // Workflow Notifications
  public async notifyDeployment(
    environment: string,
    version: string,
    status: 'started' | 'success' | 'failed',
    details?: string,
    channel?: string
  ): Promise<any> {
    const emoji = {
      started: '🚀',
      success: '✅',
      failed: '❌'
    }[status];

    const color = {
      started: '#0084FF',
      success: 'good',
      failed: 'danger'
    }[status];

    return this.sendMessage({
      channel: channel || this.config.defaultChannel,
      text: `${emoji} Deployment ${status}`,
      attachments: [{
        color,
        title: `Deployment to ${environment}`,
        fields: [
          { title: 'Environment', value: environment, short: true },
          { title: 'Version', value: version, short: true },
          { title: 'Status', value: status.toUpperCase(), short: true },
          { title: 'Time', value: new Date().toISOString(), short: true }
        ],
        text: details,
        footer: 'Canvas CLI Deployment',
        ts: Math.floor(Date.now() / 1000)
      }]
    });
  }

  public async notifyBuild(
    project: string,
    branch: string,
    status: 'started' | 'success' | 'failed',
    buildUrl?: string,
    channel?: string
  ): Promise<any> {
    const emoji = {
      started: '🔨',
      success: '✅',
      failed: '❌'
    }[status];

    const notification: SlackNotification = {
      type: status === 'failed' ? 'error' : status === 'success' ? 'success' : 'info',
      title: `${emoji} Build ${status}`,
      message: `Build for ${project} (${branch})`,
      fields: [
        { title: 'Project', value: project, short: true },
        { title: 'Branch', value: branch, short: true }
      ]
    };

    if (buildUrl) {
      notification.actions = [{ text: 'View Build', url: buildUrl }];
    }

    return this.sendNotification(notification, channel);
  }

  public async notifyTest(
    suite: string,
    passed: number,
    failed: number,
    skipped: number,
    duration: number,
    channel?: string
  ): Promise<any> {
    const total = passed + failed + skipped;
    const status = failed === 0 ? 'success' : 'error';
    const emoji = failed === 0 ? '✅' : '❌';

    return this.sendNotification({
      type: status,
      title: `${emoji} Test Results: ${suite}`,
      message: `${passed}/${total} tests passed`,
      fields: [
        { title: 'Passed', value: `${passed}`, short: true },
        { title: 'Failed', value: `${failed}`, short: true },
        { title: 'Skipped', value: `${skipped}`, short: true },
        { title: 'Duration', value: `${duration}ms`, short: true }
      ],
      footer: 'Canvas CLI Test Runner'
    }, channel);
  }

  public async notifyError(
    error: Error,
    context?: string,
    channel?: string
  ): Promise<any> {
    return this.sendNotification({
      type: 'error',
      title: '❌ Error Occurred',
      message: error.message,
      fields: context ? [{ title: 'Context', value: context }] : undefined,
      footer: `Canvas CLI - ${error.name || 'Error'}`
    }, channel);
  }

  // Interactive Components
  public async sendInteractiveMessage(
    channel: string,
    text: string,
    actions: Array<{
      text: string;
      value: string;
      type?: 'button' | 'select';
      style?: 'default' | 'primary' | 'danger';
    }>
  ): Promise<any> {
    return this.sendMessage({
      channel,
      text,
      attachments: [{
        text: 'Choose an action:',
        fallback: 'You are unable to choose an action',
        callback_id: 'canvas_cli_action',
        color: '#3AA3E3',
        attachment_type: 'default',
        actions: actions.map(action => ({
          name: 'action',
          text: action.text,
          type: action.type || 'button',
          value: action.value,
          style: action.style
        }))
      }]
    });
  }

  // Reactions
  public async addReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    const response = await this.api.post('/reactions.add', {
      channel,
      timestamp,
      name: emoji
    });

    if (!response.data.ok && response.data.error !== 'already_reacted') {
      throw new Error(`Failed to add reaction: ${response.data.error}`);
    }
  }

  public async removeReaction(channel: string, timestamp: string, emoji: string): Promise<void> {
    const response = await this.api.post('/reactions.remove', {
      channel,
      timestamp,
      name: emoji
    });

    if (!response.data.ok) {
      throw new Error(`Failed to remove reaction: ${response.data.error}`);
    }
  }
}

// Export singleton instance
export const slack = new SlackIntegration();