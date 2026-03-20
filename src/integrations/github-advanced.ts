/**
 * Advanced GitHub Integration
 * Repository analysis, pull request management, issue tracking, and release coordination
 */

import { EventEmitter } from 'events';
import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';
import * as crypto from 'crypto';

interface GitHubConfig {
  token: string;
  owner?: string;
  repo?: string;
  baseUrl?: string; // For GitHub Enterprise
}

interface RepositoryAnalysis {
  basic: {
    name: string;
    owner: string;
    description: string;
    visibility: string;
    defaultBranch: string;
    language: string;
    size: number;
    stars: number;
    forks: number;
    watchers: number;
    openIssues: number;
    topics: string[];
    license?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  contributors: Contributor[];
  languages: Record<string, number>;
  branches: BranchInfo[];
  commits: CommitStats;
  pullRequests: PRStats;
  issues: IssueStats;
  codeQuality: CodeQualityMetrics;
  activity: ActivityMetrics;
  dependencies?: DependencyInfo[];
  security?: SecurityMetrics;
}

interface Contributor {
  login: string;
  name?: string;
  contributions: number;
  type: string;
  avatar: string;
  profile: string;
}

interface BranchInfo {
  name: string;
  protected: boolean;
  lastCommit: {
    sha: string;
    message: string;
    author: string;
    date: Date;
  };
  aheadBehind?: {
    ahead: number;
    behind: number;
  };
}

interface CommitStats {
  total: number;
  lastWeek: number;
  lastMonth: number;
  authors: number;
  frequency: number[]; // Weekly frequency
}

interface PRStats {
  open: number;
  closed: number;
  merged: number;
  draft: number;
  averageMergeTime: number; // In hours
  averageReviewTime: number;
  topReviewers: string[];
}

interface IssueStats {
  open: number;
  closed: number;
  averageCloseTime: number; // In hours
  labels: LabelStats[];
  milestones: MilestoneInfo[];
}

interface LabelStats {
  name: string;
  color: string;
  count: number;
  description?: string;
}

interface MilestoneInfo {
  title: string;
  state: string;
  openIssues: number;
  closedIssues: number;
  dueOn?: Date;
  completionPercentage: number;
}

interface CodeQualityMetrics {
  coverage?: number;
  maintainabilityIndex?: number;
  cyclomaticComplexity?: number;
  duplicateLines?: number;
  technicalDebt?: number;
  codeSmells?: number;
  vulnerabilities?: number;
}

interface ActivityMetrics {
  commitsPerDay: number;
  issuesPerWeek: number;
  prsPerWeek: number;
  releaseFrequency: number; // Days between releases
  lastActivity: Date;
  contributorActivity: Record<string, number>; // Commits per contributor last month
}

interface DependencyInfo {
  name: string;
  version: string;
  type: 'production' | 'development';
  license?: string;
  vulnerabilities?: number;
  outdated: boolean;
}

interface SecurityMetrics {
  vulnerabilities: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  dependabotAlerts: number;
  codeScanning: number;
  secretScanning: number;
}

interface PullRequestManager {
  create(options: PRCreateOptions): Promise<PullRequest>;
  update(number: number, options: PRUpdateOptions): Promise<PullRequest>;
  merge(number: number, options: PRMergeOptions): Promise<MergeResult>;
  review(number: number, options: ReviewOptions): Promise<Review>;
  listReviews(number: number): Promise<Review[]>;
  requestReviewers(number: number, reviewers: string[]): Promise<void>;
  addLabels(number: number, labels: string[]): Promise<void>;
  assign(number: number, assignees: string[]): Promise<void>;
  close(number: number): Promise<void>;
  reopen(number: number): Promise<void>;
  listFiles(number: number): Promise<FileChange[]>;
  listCommits(number: number): Promise<Commit[]>;
  createComment(number: number, comment: string, path?: string, line?: number): Promise<void>;
}

interface PRCreateOptions {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
  maintainerCanModify?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
  milestone?: number;
}

interface PRUpdateOptions {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  base?: string;
  maintainerCanModify?: boolean;
}

interface PRMergeOptions {
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  commitTitle?: string;
  commitMessage?: string;
  sha?: string;
}

interface ReviewOptions {
  body?: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments?: ReviewComment[];
}

interface ReviewComment {
  path: string;
  line: number;
  body: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  merged: boolean;
  mergeable?: boolean;
  author: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  createdAt: Date;
  updatedAt: Date;
  mergedAt?: Date;
  closedAt?: Date;
  labels: string[];
  assignees: string[];
  reviewers: string[];
  url: string;
}

interface Review {
  id: number;
  user: string;
  state: string;
  body?: string;
  submittedAt: Date;
}

interface MergeResult {
  merged: boolean;
  message: string;
  sha?: string;
}

interface FileChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface Commit {
  sha: string;
  message: string;
  author: string;
  date: Date;
  verified: boolean;
}

interface IssueManager {
  create(options: IssueCreateOptions): Promise<Issue>;
  update(number: number, options: IssueUpdateOptions): Promise<Issue>;
  close(number: number): Promise<void>;
  reopen(number: number): Promise<void>;
  lock(number: number, reason?: string): Promise<void>;
  unlock(number: number): Promise<void>;
  addLabels(number: number, labels: string[]): Promise<void>;
  removeLabel(number: number, label: string): Promise<void>;
  assign(number: number, assignees: string[]): Promise<void>;
  setMilestone(number: number, milestone: number): Promise<void>;
  createComment(number: number, comment: string): Promise<void>;
  listComments(number: number): Promise<Comment[]>;
  search(query: string): Promise<Issue[]>;
}

interface IssueCreateOptions {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

interface IssueUpdateOptions {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
}

interface Issue {
  number: number;
  title: string;
  state: string;
  body?: string;
  author: string;
  labels: string[];
  assignees: string[];
  milestone?: number;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  comments: number;
  url: string;
}

interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ReleaseManager {
  create(options: ReleaseCreateOptions): Promise<Release>;
  update(id: number, options: ReleaseUpdateOptions): Promise<Release>;
  delete(id: number): Promise<void>;
  publish(id: number): Promise<Release>;
  generateNotes(options: ReleaseNotesOptions): Promise<string>;
  uploadAsset(id: number, file: Buffer, name: string, contentType: string): Promise<Asset>;
  deleteAsset(id: number): Promise<void>;
  latest(): Promise<Release>;
  list(): Promise<Release[]>;
}

interface ReleaseCreateOptions {
  tagName: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  targetCommitish?: string;
  generateReleaseNotes?: boolean;
}

interface ReleaseUpdateOptions {
  tagName?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface ReleaseNotesOptions {
  tagName: string;
  previousTagName?: string;
  targetCommitish?: string;
  configuration?: {
    categories?: Array<{
      title: string;
      labels: string[];
    }>;
  };
}

interface Release {
  id: number;
  tagName: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: Date;
  publishedAt?: Date;
  author: string;
  assets: Asset[];
  url: string;
}

interface Asset {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  contentType: string;
  url: string;
}

export class GitHubAdvancedIntegration extends EventEmitter {
  private octokit: Octokit;
  private graphqlClient: any;
  private config: GitHubConfig;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes
  
  public pullRequests: PullRequestManager;
  public issues: IssueManager;
  public releases: ReleaseManager;
  
  constructor(config: GitHubConfig) {
    super();
    
    this.config = config;
    
    // Initialize Octokit
    this.octokit = new Octokit({
      auth: config.token,
      baseUrl: config.baseUrl
    });
    
    // Initialize GraphQL client
    this.graphqlClient = graphql.defaults({
      headers: {
        authorization: `token ${config.token}`
      },
      baseUrl: config.baseUrl
    });
    
    // Initialize managers
    this.pullRequests = this.createPullRequestManager();
    this.issues = this.createIssueManager();
    this.releases = this.createReleaseManager();
  }
  
  // Repository Analysis
  
  async analyzeRepository(owner?: string, repo?: string): Promise<RepositoryAnalysis> {
    const repoOwner = owner || this.config.owner!;
    const repoName = repo || this.config.repo!;
    
    this.emit('analysis:start', { owner: repoOwner, repo: repoName });
    
    try {
      // Parallel fetch all data
      const [
        basicInfo,
        contributors,
        languages,
        branches,
        commits,
        pullRequests,
        issues,
        codeQuality,
        activity,
        dependencies,
        security
      ] = await Promise.all([
        this.getBasicInfo(repoOwner, repoName),
        this.getContributors(repoOwner, repoName),
        this.getLanguages(repoOwner, repoName),
        this.getBranches(repoOwner, repoName),
        this.getCommitStats(repoOwner, repoName),
        this.getPRStats(repoOwner, repoName),
        this.getIssueStats(repoOwner, repoName),
        this.getCodeQualityMetrics(repoOwner, repoName),
        this.getActivityMetrics(repoOwner, repoName),
        this.getDependencies(repoOwner, repoName),
        this.getSecurityMetrics(repoOwner, repoName)
      ]);
      
      const analysis: RepositoryAnalysis = {
        basic: basicInfo,
        contributors,
        languages,
        branches,
        commits,
        pullRequests,
        issues,
        codeQuality,
        activity,
        dependencies,
        security
      };
      
      this.emit('analysis:complete', analysis);
      
      return analysis;
      
    } catch (error) {
      this.emit('analysis:error', error);
      throw error;
    }
  }
  
  private async getBasicInfo(owner: string, repo: string): Promise<RepositoryAnalysis['basic']> {
    const { data } = await this.octokit.repos.get({ owner, repo });
    
    return {
      name: data.name,
      owner: data.owner.login,
      description: data.description || '',
      visibility: data.visibility || 'public',
      defaultBranch: data.default_branch,
      language: data.language || 'Unknown',
      size: data.size,
      stars: data.stargazers_count,
      forks: data.forks_count,
      watchers: data.watchers_count,
      openIssues: data.open_issues_count,
      topics: data.topics || [],
      license: data.license?.name,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    };
  }
  
  private async getContributors(owner: string, repo: string): Promise<Contributor[]> {
    const { data } = await this.octokit.repos.listContributors({
      owner,
      repo,
      per_page: 100
    });
    
    return data.map(contributor => ({
      login: contributor.login!,
      name: contributor.name,
      contributions: contributor.contributions!,
      type: contributor.type!,
      avatar: contributor.avatar_url!,
      profile: contributor.html_url!
    }));
  }
  
  private async getLanguages(owner: string, repo: string): Promise<Record<string, number>> {
    const { data } = await this.octokit.repos.listLanguages({ owner, repo });
    return data;
  }
  
  private async getBranches(owner: string, repo: string): Promise<BranchInfo[]> {
    const { data } = await this.octokit.repos.listBranches({
      owner,
      repo,
      per_page: 100
    });
    
    const branches: BranchInfo[] = [];
    
    for (const branch of data) {
      const { data: branchData } = await this.octokit.repos.getBranch({
        owner,
        repo,
        branch: branch.name
      });
      
      branches.push({
        name: branch.name,
        protected: branch.protected,
        lastCommit: {
          sha: branchData.commit.sha,
          message: branchData.commit.commit.message,
          author: branchData.commit.commit.author?.name || 'Unknown',
          date: new Date(branchData.commit.commit.author?.date || Date.now())
        }
      });
    }
    
    return branches;
  }
  
  private async getCommitStats(owner: string, repo: string): Promise<CommitStats> {
    // Get commit activity
    const { data: activity } = await this.octokit.repos.getCommitActivityStats({
      owner,
      repo
    });
    
    // Get contributors
    const { data: contributors } = await this.octokit.repos.listContributors({
      owner,
      repo
    });
    
    // Calculate stats - activity can be an array or empty object
    const activityArray = Array.isArray(activity) ? activity : [];
    const lastWeek = activityArray[activityArray.length - 1]?.total || 0;
    const lastMonth = activityArray.slice(-4).reduce((sum, week) => sum + week.total, 0) || 0;
    const total = activityArray.reduce((sum, week) => sum + week.total, 0) || 0;
    const frequency = activityArray.map(week => week.total) || [];
    
    return {
      total,
      lastWeek,
      lastMonth,
      authors: contributors.length,
      frequency
    };
  }
  
  private async getPRStats(owner: string, repo: string): Promise<PRStats> {
    // Get PR counts
    const [open, closed] = await Promise.all([
      this.octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        per_page: 1
      }),
      this.octokit.pulls.list({
        owner,
        repo,
        state: 'closed',
        per_page: 100
      })
    ]);
    
    const openCount = open.headers['x-total-count'] ? parseInt(String(open.headers['x-total-count'])) : open.data.length;
    const closedPRs = closed.data;
    
    // Calculate merge stats
    const merged = closedPRs.filter(pr => pr.merged_at).length;
    const draft = open.data.filter(pr => pr.draft).length;
    
    // Calculate average times
    let totalMergeTime = 0;
    let mergeCount = 0;
    
    for (const pr of closedPRs) {
      if (pr.merged_at) {
        const created = new Date(pr.created_at).getTime();
        const mergedTime = new Date(pr.merged_at).getTime();
        totalMergeTime += (mergedTime - created) / (1000 * 60 * 60); // Convert to hours
        mergeCount++;
      }
    }
    
    const averageMergeTime = mergeCount > 0 ? totalMergeTime / mergeCount : 0;
    
    // Get top reviewers (simplified)
    const reviewers = new Set<string>();
    for (const pr of closedPRs.slice(0, 20)) {
      if (pr.requested_reviewers) {
        pr.requested_reviewers.forEach(reviewer => {
          if ('login' in reviewer) {
            reviewers.add(reviewer.login);
          }
        });
      }
    }
    
    return {
      open: openCount,
      closed: closedPRs.length,
      merged,
      draft,
      averageMergeTime,
      averageReviewTime: averageMergeTime * 0.7, // Estimate
      topReviewers: Array.from(reviewers).slice(0, 5)
    };
  }
  
  private async getIssueStats(owner: string, repo: string): Promise<IssueStats> {
    // Get issues
    const [open, closed, labels, milestones] = await Promise.all([
      this.octokit.issues.listForRepo({
        owner,
        repo,
        state: 'open',
        per_page: 1
      }),
      this.octokit.issues.listForRepo({
        owner,
        repo,
        state: 'closed',
        per_page: 100
      }),
      this.octokit.issues.listLabelsForRepo({
        owner,
        repo,
        per_page: 100
      }),
      this.octokit.issues.listMilestones({
        owner,
        repo
      })
    ]);
    
    const openCount = open.headers['x-total-count'] ? parseInt(String(open.headers['x-total-count'])) : open.data.length;
    const closedIssues = closed.data;
    
    // Calculate average close time
    let totalCloseTime = 0;
    let closeCount = 0;
    
    for (const issue of closedIssues) {
      if (issue.closed_at && !issue.pull_request) {
        const created = new Date(issue.created_at).getTime();
        const closedTime = new Date(issue.closed_at).getTime();
        totalCloseTime += (closedTime - created) / (1000 * 60 * 60); // Convert to hours
        closeCount++;
      }
    }
    
    const averageCloseTime = closeCount > 0 ? totalCloseTime / closeCount : 0;
    
    // Process labels
    const labelStats: LabelStats[] = labels.data.map(label => ({
      name: label.name,
      color: label.color,
      count: 0, // Would need to query for each label
      description: label.description || undefined
    }));
    
    // Process milestones
    const milestoneInfo: MilestoneInfo[] = milestones.data.map(milestone => ({
      title: milestone.title,
      state: milestone.state,
      openIssues: milestone.open_issues,
      closedIssues: milestone.closed_issues,
      dueOn: milestone.due_on ? new Date(milestone.due_on) : undefined,
      completionPercentage: milestone.closed_issues / (milestone.open_issues + milestone.closed_issues) * 100
    }));
    
    return {
      open: openCount,
      closed: closedIssues.length,
      averageCloseTime,
      labels: labelStats,
      milestones: milestoneInfo
    };
  }
  
  private async getCodeQualityMetrics(owner: string, repo: string): Promise<CodeQualityMetrics> {
    const metrics: CodeQualityMetrics = {};

    try {
      // Vulnerabilities: GitHub security advisories / code scanning alerts
      try {
        const { data: alerts } = await this.octokit.request('GET /repos/{owner}/{repo}/code-scanning/alerts', {
          owner, repo, state: 'open', per_page: 100
        });
        metrics.vulnerabilities = (alerts as any[]).filter((a: any) => a.rule?.severity === 'error' || a.rule?.severity === 'critical').length;
      } catch {
        // Code scanning not enabled — check Dependabot alerts
        try {
          const { data: depAlerts } = await this.octokit.request('GET /repos/{owner}/{repo}/vulnerability-alerts', { owner, repo });
          void depAlerts; // 204 = enabled, no alerts
          metrics.vulnerabilities = 0;
        } catch { /* not available */ }
      }

      // Code smells / technical debt: approximate from TODO/FIXME count in search results
      try {
        const { data: todoSearch } = await this.octokit.search.code({
          q: `repo:${owner}/${repo} TODO OR FIXME`,
          per_page: 1
        });
        const todoCount = todoSearch.total_count;
        metrics.codeSmells = Math.min(todoCount, 999);
        metrics.technicalDebt = Math.round(todoCount * 0.5); // ~30min per TODO
      } catch { /* search rate limited */ }

      // Maintainability: derive from commit frequency (active repo = more maintainable)
      try {
        const { data: stats } = await this.octokit.repos.getCommitActivityStats({ owner, repo });
        if (stats && Array.isArray(stats)) {
          const recentWeeks = stats.slice(-12);
          const avgCommitsPerWeek = recentWeeks.reduce((s: number, w: any) => s + w.total, 0) / Math.max(recentWeeks.length, 1);
          // Active repos score higher: 0 commits/week = 40, 10+ = 90
          metrics.maintainabilityIndex = Math.min(90, Math.round(40 + avgCommitsPerWeek * 5));
        }
      } catch { /* stats not available */ }

    } catch { /* API unavailable */ }

    return metrics;
  }
  
  private async getActivityMetrics(owner: string, repo: string): Promise<ActivityMetrics> {
    // Get recent activity
    const { data: events } = await this.octokit.activity.listRepoEvents({
      owner,
      repo,
      per_page: 100
    });
    
    // Calculate metrics
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    
    const recentCommits = events.filter(e =>
      e.type === 'PushEvent' &&
      e.created_at &&
      new Date(e.created_at).getTime() > now - dayMs
    ).length;

    const recentIssues = events.filter(e =>
      e.type === 'IssuesEvent' &&
      e.created_at &&
      new Date(e.created_at).getTime() > now - weekMs
    ).length;

    const recentPRs = events.filter(e =>
      e.type === 'PullRequestEvent' &&
      e.created_at &&
      new Date(e.created_at).getTime() > now - weekMs
    ).length;
    
    // Get contributor activity
    const contributorActivity: Record<string, number> = {};
    events
      .filter(e => e.type === 'PushEvent')
      .forEach(e => {
        const actor = e.actor.login;
        contributorActivity[actor] = (contributorActivity[actor] || 0) + 1;
      });
    
    return {
      commitsPerDay: recentCommits,
      issuesPerWeek: recentIssues,
      prsPerWeek: recentPRs,
      releaseFrequency: 14, // Placeholder
      lastActivity: new Date(events[0]?.created_at || Date.now()),
      contributorActivity
    };
  }
  
  private async getDependencies(owner: string, repo: string): Promise<DependencyInfo[] | undefined> {
    try {
      // Try to get package.json for Node.js projects
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path: 'package.json'
      });
      
      if ('content' in data) {
        const packageJson = JSON.parse(
          Buffer.from(data.content, 'base64').toString('utf-8')
        );
        
        const dependencies: DependencyInfo[] = [];
        
        // Process production dependencies
        if (packageJson.dependencies) {
          for (const [name, version] of Object.entries(packageJson.dependencies)) {
            dependencies.push({
              name,
              version: version as string,
              type: 'production',
              outdated: false // Would need to check npm registry
            });
          }
        }
        
        // Process dev dependencies
        if (packageJson.devDependencies) {
          for (const [name, version] of Object.entries(packageJson.devDependencies)) {
            dependencies.push({
              name,
              version: version as string,
              type: 'development',
              outdated: false
            });
          }
        }
        
        return dependencies;
      }
    } catch {
      // Not a Node.js project or package.json not found
    }
    
    return undefined;
  }
  
  private async getSecurityMetrics(owner: string, repo: string): Promise<SecurityMetrics | undefined> {
    try {
      // Get Dependabot alerts
      const { data: alerts } = await this.octokit.dependabot.listAlertsForRepo({
        owner,
        repo
      });
      
      // Count vulnerabilities by severity
      const vulnerabilities = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };
      
      alerts.forEach(alert => {
        const severity = alert.security_vulnerability?.severity || 'low';
        vulnerabilities[severity as keyof typeof vulnerabilities]++;
      });
      
      return {
        vulnerabilities,
        dependabotAlerts: alerts.length,
        codeScanning: 0, // Would need additional API calls
        secretScanning: 0 // Would need additional API calls
      };
    } catch {
      // Security features might not be enabled
      return undefined;
    }
  }
  
  // Pull Request Manager Implementation
  
  private createPullRequestManager(): PullRequestManager {
    const self = this;
    
    return {
      async create(options: PRCreateOptions): Promise<PullRequest> {
        const { data } = await self.octokit.pulls.create({
          owner: self.config.owner!,
          repo: self.config.repo!,
          ...options
        });
        
        // Add labels, assignees, reviewers if specified
        if (options.labels) {
          await this.addLabels(data.number, options.labels);
        }
        if (options.assignees) {
          await this.assign(data.number, options.assignees);
        }
        if (options.reviewers) {
          await this.requestReviewers(data.number, options.reviewers);
        }
        
        return self.formatPullRequest(data);
      },
      
      async update(number: number, options: PRUpdateOptions): Promise<PullRequest> {
        const { data } = await self.octokit.pulls.update({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number,
          ...options
        });
        
        return self.formatPullRequest(data);
      },
      
      async merge(number: number, options: PRMergeOptions = {}): Promise<MergeResult> {
        try {
          const { data } = await self.octokit.pulls.merge({
            owner: self.config.owner!,
            repo: self.config.repo!,
            pull_number: number,
            merge_method: options.mergeMethod || 'merge',
            commit_title: options.commitTitle,
            commit_message: options.commitMessage,
            sha: options.sha
          });
          
          return {
            merged: data.merged,
            message: data.message,
            sha: data.sha
          };
        } catch (error: any) {
          return {
            merged: false,
            message: error.message
          };
        }
      },
      
      async review(number: number, options: ReviewOptions): Promise<Review> {
        const { data } = await self.octokit.pulls.createReview({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number,
          body: options.body,
          event: options.event,
          comments: options.comments
        });
        
        return {
          id: data.id,
          user: data.user?.login || 'Unknown',
          state: data.state,
          body: data.body || undefined,
          submittedAt: new Date(data.submitted_at!)
        };
      },
      
      async listReviews(number: number): Promise<Review[]> {
        const { data } = await self.octokit.pulls.listReviews({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number
        });
        
        return data.map(review => ({
          id: review.id,
          user: review.user?.login || 'Unknown',
          state: review.state,
          body: review.body || undefined,
          submittedAt: new Date(review.submitted_at!)
        }));
      },
      
      async requestReviewers(number: number, reviewers: string[]): Promise<void> {
        await self.octokit.pulls.requestReviewers({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number,
          reviewers
        });
      },
      
      async addLabels(number: number, labels: string[]): Promise<void> {
        await self.octokit.issues.addLabels({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          labels
        });
      },
      
      async assign(number: number, assignees: string[]): Promise<void> {
        await self.octokit.issues.addAssignees({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          assignees
        });
      },
      
      async close(number: number): Promise<void> {
        await self.octokit.pulls.update({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number,
          state: 'closed'
        });
      },
      
      async reopen(number: number): Promise<void> {
        await self.octokit.pulls.update({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number,
          state: 'open'
        });
      },
      
      async listFiles(number: number): Promise<FileChange[]> {
        const { data } = await self.octokit.pulls.listFiles({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number
        });
        
        return data.map(file => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: file.patch
        }));
      },
      
      async listCommits(number: number): Promise<Commit[]> {
        const { data } = await self.octokit.pulls.listCommits({
          owner: self.config.owner!,
          repo: self.config.repo!,
          pull_number: number
        });
        
        return data.map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.commit.author?.name || 'Unknown',
          date: new Date(commit.commit.author?.date || Date.now()),
          verified: commit.commit.verification?.verified || false
        }));
      },
      
      async createComment(number: number, comment: string, path?: string, line?: number): Promise<void> {
        if (path && line) {
          // Get PR head SHA for commit_id
          const pr = await self.octokit.pulls.get({
            owner: self.config.owner!,
            repo: self.config.repo!,
            pull_number: number
          });
          // Create review comment
          await self.octokit.pulls.createReviewComment({
            owner: self.config.owner!,
            repo: self.config.repo!,
            pull_number: number,
            body: comment,
            commit_id: pr.data.head.sha,
            path,
            line
          });
        } else {
          // Create issue comment
          await self.octokit.issues.createComment({
            owner: self.config.owner!,
            repo: self.config.repo!,
            issue_number: number,
            body: comment
          });
        }
      }
    };
  }
  
  // Issue Manager Implementation
  
  private createIssueManager(): IssueManager {
    const self = this;
    
    return {
      async create(options: IssueCreateOptions): Promise<Issue> {
        const { data } = await self.octokit.issues.create({
          owner: self.config.owner!,
          repo: self.config.repo!,
          ...options
        });
        
        return self.formatIssue(data);
      },
      
      async update(number: number, options: IssueUpdateOptions): Promise<Issue> {
        const { data } = await self.octokit.issues.update({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          ...options
        });
        
        return self.formatIssue(data);
      },
      
      async close(number: number): Promise<void> {
        await self.octokit.issues.update({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          state: 'closed'
        });
      },
      
      async reopen(number: number): Promise<void> {
        await self.octokit.issues.update({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          state: 'open'
        });
      },
      
      async lock(number: number, reason?: string): Promise<void> {
        await self.octokit.issues.lock({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          lock_reason: reason as any
        });
      },
      
      async unlock(number: number): Promise<void> {
        await self.octokit.issues.unlock({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number
        });
      },
      
      async addLabels(number: number, labels: string[]): Promise<void> {
        await self.octokit.issues.addLabels({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          labels
        });
      },
      
      async removeLabel(number: number, label: string): Promise<void> {
        await self.octokit.issues.removeLabel({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          name: label
        });
      },
      
      async assign(number: number, assignees: string[]): Promise<void> {
        await self.octokit.issues.addAssignees({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          assignees
        });
      },
      
      async setMilestone(number: number, milestone: number): Promise<void> {
        await self.octokit.issues.update({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          milestone
        });
      },
      
      async createComment(number: number, comment: string): Promise<void> {
        await self.octokit.issues.createComment({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number,
          body: comment
        });
      },
      
      async listComments(number: number): Promise<Comment[]> {
        const { data } = await self.octokit.issues.listComments({
          owner: self.config.owner!,
          repo: self.config.repo!,
          issue_number: number
        });
        
        return data.map(comment => ({
          id: comment.id,
          author: comment.user?.login || 'Unknown',
          body: comment.body || '',
          createdAt: new Date(comment.created_at),
          updatedAt: new Date(comment.updated_at)
        }));
      },
      
      async search(query: string): Promise<Issue[]> {
        const { data } = await self.octokit.search.issuesAndPullRequests({
          q: `${query} repo:${self.config.owner}/${self.config.repo} is:issue`
        });
        
        return data.items.map(item => self.formatIssue(item as any));
      }
    };
  }
  
  // Release Manager Implementation
  
  private createReleaseManager(): ReleaseManager {
    const self = this;
    
    return {
      async create(options: ReleaseCreateOptions): Promise<Release> {
        const { data } = await self.octokit.repos.createRelease({
          owner: self.config.owner!,
          repo: self.config.repo!,
          tag_name: options.tagName,
          name: options.name,
          body: options.body,
          draft: options.draft,
          prerelease: options.prerelease,
          target_commitish: options.targetCommitish,
          generate_release_notes: options.generateReleaseNotes
        });
        
        return self.formatRelease(data);
      },
      
      async update(id: number, options: ReleaseUpdateOptions): Promise<Release> {
        const { data } = await self.octokit.repos.updateRelease({
          owner: self.config.owner!,
          repo: self.config.repo!,
          release_id: id,
          tag_name: options.tagName,
          name: options.name,
          body: options.body,
          draft: options.draft,
          prerelease: options.prerelease
        });
        
        return self.formatRelease(data);
      },
      
      async delete(id: number): Promise<void> {
        await self.octokit.repos.deleteRelease({
          owner: self.config.owner!,
          repo: self.config.repo!,
          release_id: id
        });
      },
      
      async publish(id: number): Promise<Release> {
        const { data } = await self.octokit.repos.updateRelease({
          owner: self.config.owner!,
          repo: self.config.repo!,
          release_id: id,
          draft: false
        });
        
        return self.formatRelease(data);
      },
      
      async generateNotes(options: ReleaseNotesOptions): Promise<string> {
        const { data } = await self.octokit.repos.generateReleaseNotes({
          owner: self.config.owner!,
          repo: self.config.repo!,
          tag_name: options.tagName,
          previous_tag_name: options.previousTagName,
          target_commitish: options.targetCommitish
        });
        
        return data.body;
      },
      
      async uploadAsset(id: number, file: Buffer, name: string, contentType: string): Promise<Asset> {
        const { data: release } = await self.octokit.repos.getRelease({
          owner: self.config.owner!,
          repo: self.config.repo!,
          release_id: id
        });
        
        const { data } = await self.octokit.repos.uploadReleaseAsset({
          owner: self.config.owner!,
          repo: self.config.repo!,
          release_id: id,
          name,
          data: file as any,
          headers: {
            'content-type': contentType
          }
        } as any);
        
        return {
          id: data.id,
          name: data.name,
          size: data.size,
          downloadCount: data.download_count,
          contentType: data.content_type,
          url: data.browser_download_url
        };
      },
      
      async deleteAsset(id: number): Promise<void> {
        await self.octokit.repos.deleteReleaseAsset({
          owner: self.config.owner!,
          repo: self.config.repo!,
          asset_id: id
        });
      },
      
      async latest(): Promise<Release> {
        const { data } = await self.octokit.repos.getLatestRelease({
          owner: self.config.owner!,
          repo: self.config.repo!
        });
        
        return self.formatRelease(data);
      },
      
      async list(): Promise<Release[]> {
        const { data } = await self.octokit.repos.listReleases({
          owner: self.config.owner!,
          repo: self.config.repo!
        });
        
        return data.map(release => self.formatRelease(release));
      }
    };
  }
  
  // Helper methods
  
  private formatPullRequest(data: any): PullRequest {
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      draft: data.draft || false,
      merged: data.merged || false,
      mergeable: data.mergeable,
      author: data.user?.login || 'Unknown',
      head: {
        ref: data.head.ref,
        sha: data.head.sha
      },
      base: {
        ref: data.base.ref,
        sha: data.base.sha
      },
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      mergedAt: data.merged_at ? new Date(data.merged_at) : undefined,
      closedAt: data.closed_at ? new Date(data.closed_at) : undefined,
      labels: data.labels?.map((l: any) => l.name) || [],
      assignees: data.assignees?.map((a: any) => a.login) || [],
      reviewers: data.requested_reviewers?.map((r: any) => r.login) || [],
      url: data.html_url
    };
  }
  
  private formatIssue(data: any): Issue {
    return {
      number: data.number,
      title: data.title,
      state: data.state,
      body: data.body || undefined,
      author: data.user?.login || 'Unknown',
      labels: data.labels?.map((l: any) => l.name) || [],
      assignees: data.assignees?.map((a: any) => a.login) || [],
      milestone: data.milestone?.number,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      closedAt: data.closed_at ? new Date(data.closed_at) : undefined,
      comments: data.comments,
      url: data.html_url
    };
  }
  
  private formatRelease(data: any): Release {
    return {
      id: data.id,
      tagName: data.tag_name,
      name: data.name || data.tag_name,
      body: data.body || '',
      draft: data.draft,
      prerelease: data.prerelease,
      createdAt: new Date(data.created_at),
      publishedAt: data.published_at ? new Date(data.published_at) : undefined,
      author: data.author?.login || 'Unknown',
      assets: data.assets?.map((a: any) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        downloadCount: a.download_count,
        contentType: a.content_type,
        url: a.browser_download_url
      })) || [],
      url: data.html_url
    };
  }
  
  // GraphQL operations for advanced queries
  
  async getDetailedPRInfo(number: number): Promise<any> {
    const query = `
      query GetPullRequest($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            title
            body
            state
            isDraft
            merged
            mergeable
            author {
              login
            }
            commits {
              totalCount
            }
            changedFiles
            additions
            deletions
            reviews {
              totalCount
            }
            participants {
              totalCount
            }
            timeline {
              totalCount
            }
          }
        }
      }
    `;
    
    return await this.graphqlClient(query, {
      owner: this.config.owner,
      repo: this.config.repo,
      number
    });
  }
  
  // Webhooks
  
  async createWebhook(events: string[], url: string, secret?: string): Promise<void> {
    await this.octokit.repos.createWebhook({
      owner: this.config.owner!,
      repo: this.config.repo!,
      config: {
        url,
        content_type: 'json',
        secret
      },
      events
    });
  }
  
  async deleteWebhook(id: number): Promise<void> {
    await this.octokit.repos.deleteWebhook({
      owner: this.config.owner!,
      repo: this.config.repo!,
      hook_id: id
    });
  }
}

// Export singleton factory
export function createGitHubIntegration(config: GitHubConfig): GitHubAdvancedIntegration {
  return new GitHubAdvancedIntegration(config);
}