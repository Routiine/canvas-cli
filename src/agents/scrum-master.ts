/**
 * Scrum Master Agent
 * Manages agile processes, sprints, and user stories
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import chalk from 'chalk';
import { AgentConfigurationSystem } from './config/agent-config.js';
import { PromptTemplateSystem } from './config/prompt-templates.js';
import { ModelManager } from '../models/model-manager.js';
import { StoryParser } from './parsers/story-parser.js';
import { ContextEmbedder } from './embeddings/context-embedder.js';
import { StoryValidator } from './validators/story-validator.js';
import { DependencyManager } from './managers/dependency-manager.js';

// User Story Schema
export const UserStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['feature', 'bug', 'technical', 'spike', 'debt']),
  status: z.enum(['backlog', 'ready', 'in-progress', 'review', 'done', 'blocked']),
  
  story: z.object({
    asA: z.string(),
    iWant: z.string(),
    soThat: z.string(),
    narrative: z.string().optional()
  }),
  
  acceptanceCriteria: z.array(z.object({
    given: z.string(),
    when: z.string(),
    then: z.string(),
    verified: z.boolean().default(false)
  })),
  
  estimation: z.object({
    points: z.number().optional(),
    complexity: z.enum(['trivial', 'simple', 'moderate', 'complex', 'very-complex']).optional(),
    effort: z.enum(['XS', 'S', 'M', 'L', 'XL', 'XXL']).optional(),
    confidence: z.number().min(0).max(100).optional()
  }),
  
  priority: z.object({
    value: z.enum(['critical', 'high', 'medium', 'low']),
    rank: z.number().optional(),
    moscowCategory: z.enum(['must', 'should', 'could', 'wont']).optional()
  }),
  
  dependencies: z.array(z.object({
    storyId: z.string(),
    type: z.enum(['blocks', 'blocked-by', 'relates-to', 'duplicates']),
    description: z.string().optional()
  })),
  
  technical: z.object({
    components: z.array(z.string()),
    apis: z.array(z.string()).optional(),
    dataModels: z.array(z.string()).optional(),
    testStrategy: z.string().optional()
  }).optional(),
  
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    author: z.string(),
    assignee: z.string().optional(),
    sprint: z.string().optional(),
    epic: z.string().optional(),
    labels: z.array(z.string()).optional(),
    comments: z.array(z.object({
      author: z.string(),
      timestamp: z.string(),
      text: z.string()
    })).optional()
  })
});

export type UserStory = z.infer<typeof UserStorySchema>;

// Sprint Schema
export const SprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(['planning', 'active', 'review', 'retrospective', 'completed']),
  
  capacity: z.object({
    totalPoints: z.number(),
    availableHours: z.number(),
    teamMembers: z.number(),
    velocityTarget: z.number().optional()
  }),
  
  stories: z.array(z.string()), // Story IDs
  
  metrics: z.object({
    plannedPoints: z.number(),
    completedPoints: z.number(),
    burndownData: z.array(z.object({
      date: z.string(),
      remainingPoints: z.number(),
      idealPoints: z.number()
    })),
    velocity: z.number().optional(),
    completionRate: z.number().optional()
  }),
  
  ceremonies: z.object({
    planning: z.object({
      date: z.string(),
      duration: z.string(),
      outcomes: z.array(z.string())
    }).optional(),
    dailyStandups: z.array(z.object({
      date: z.string(),
      blockers: z.array(z.string()),
      achievements: z.array(z.string())
    })).optional(),
    review: z.object({
      date: z.string(),
      demonstrations: z.array(z.string()),
      feedback: z.array(z.string())
    }).optional(),
    retrospective: z.object({
      date: z.string(),
      whatWentWell: z.array(z.string()),
      whatCouldImprove: z.array(z.string()),
      actionItems: z.array(z.string())
    }).optional()
  }),
  
  risks: z.array(z.object({
    description: z.string(),
    impact: z.enum(['low', 'medium', 'high']),
    mitigation: z.string()
  }))
});

export type Sprint = z.infer<typeof SprintSchema>;

// Backlog Refinement Schema
export const BacklogRefinementSchema = z.object({
  sessionId: z.string(),
  date: z.string(),
  participants: z.array(z.string()),
  
  storiesRefined: z.array(z.object({
    storyId: z.string(),
    originalEstimate: z.number().optional(),
    refinedEstimate: z.number(),
    clarifications: z.array(z.string()),
    splitInto: z.array(z.string()).optional(),
    readyForSprint: z.boolean()
  })),
  
  decisions: z.array(z.object({
    topic: z.string(),
    decision: z.string(),
    rationale: z.string()
  })),
  
  actionItems: z.array(z.object({
    item: z.string(),
    owner: z.string(),
    dueDate: z.string()
  }))
});

export type BacklogRefinement = z.infer<typeof BacklogRefinementSchema>;

/**
 * Scrum Master Agent Implementation
 */
export class ScrumMasterAgent extends EventEmitter {
  private configSystem: AgentConfigurationSystem;
  private templateSystem: PromptTemplateSystem;
  private modelManager: ModelManager;
  private storyParser: StoryParser;
  private contextEmbedder: ContextEmbedder;
  private storyValidator: StoryValidator;
  private dependencyManager: DependencyManager;
  private agentId = 'scrum-master';
  
  private stories: Map<string, UserStory> = new Map();
  private sprints: Map<string, Sprint> = new Map();
  private currentSprint: Sprint | null = null;
  
  constructor() {
    super();
    this.configSystem = new AgentConfigurationSystem();
    this.templateSystem = new PromptTemplateSystem();
    this.modelManager = new ModelManager();
    this.storyParser = new StoryParser();
    this.contextEmbedder = new ContextEmbedder();
    this.storyValidator = new StoryValidator();
    this.dependencyManager = new DependencyManager();
  }
  
  async initialize(): Promise<void> {
    await this.configSystem.initialize();
    await this.templateSystem.initialize();
    await this.contextEmbedder.initialize();
    
    // Add Scrum Master configuration if not exists
    await this.ensureScrumMasterConfig();
    
    this.emit('initialized', { agent: this.agentId });
  }
  
  /**
   * Parse and create user stories from text
   */
  async parseUserStories(text: string, context?: Record<string, any>): Promise<UserStory[]> {
    console.log(chalk.cyan('📝 Parsing user stories...'));
    
    // Use the story parser to extract stories
    const parsedStories = await this.storyParser.parse(text);
    
    const stories: UserStory[] = [];
    
    for (const parsed of parsedStories) {
      // Embed context into the story
      const enrichedStory = await this.contextEmbedder.embedContext(parsed, context);
      
      // Validate the story
      const validation = await this.storyValidator.validate(enrichedStory);
      
      if (validation.isValid) {
        const story = this.createUserStory(enrichedStory);
        stories.push(story);
        this.stories.set(story.id, story);
      } else {
        console.log(chalk.yellow(`  ⚠ Story validation failed: ${validation.errors.join(', ')}`));
      }
    }
    
    // Analyze dependencies between stories
    await this.analyzeDependencies(stories);
    
    this.emit('stories-parsed', { stories, count: stories.length });
    
    return stories;
  }
  
  /**
   * Create a new sprint
   */
  async createSprint(
    name: string,
    goal: string,
    duration: number = 14, // days
    capacity?: Record<string, any>
  ): Promise<Sprint> {
    console.log(chalk.cyan('🏃 Creating new sprint...'));
    
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + duration);
    
    const sprint: Sprint = {
      id: `sprint-${Date.now()}`,
      name,
      goal,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: 'planning',
      capacity: {
        totalPoints: capacity?.totalPoints || 0,
        availableHours: capacity?.availableHours || duration * 8 * (capacity?.teamMembers || 5),
        teamMembers: capacity?.teamMembers || 5,
        velocityTarget: capacity?.velocityTarget
      },
      stories: [],
      metrics: {
        plannedPoints: 0,
        completedPoints: 0,
        burndownData: this.initializeBurndown(startDate, endDate, 0)
      },
      ceremonies: {},
      risks: []
    };
    
    this.sprints.set(sprint.id, sprint);
    this.currentSprint = sprint;
    
    this.emit('sprint-created', { sprint });
    
    return sprint;
  }
  
  /**
   * Plan sprint by selecting and estimating stories
   */
  async planSprint(
    sprintId: string,
    storyIds: string[],
    velocityTarget?: number
  ): Promise<Sprint> {
    console.log(chalk.cyan('📋 Planning sprint...'));
    
    const sprint = this.sprints.get(sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }
    
    // Estimate stories if not already estimated
    const estimatedStories = await this.estimateStories(storyIds);
    
    // Check capacity
    const totalPoints = estimatedStories.reduce((sum, story) => 
      sum + (story.estimation.points || 0), 0
    );
    
    if (velocityTarget && totalPoints > velocityTarget) {
      console.log(chalk.yellow(`  ⚠ Total points (${totalPoints}) exceed velocity target (${velocityTarget})`));
    }
    
    // Add stories to sprint
    sprint.stories = storyIds;
    sprint.metrics.plannedPoints = totalPoints;
    sprint.capacity.velocityTarget = velocityTarget || totalPoints;
    
    // Update burndown
    sprint.metrics.burndownData = this.initializeBurndown(
      new Date(sprint.startDate),
      new Date(sprint.endDate),
      totalPoints
    );
    
    // Generate sprint planning outcomes
    const planningOutcomes = await this.generatePlanningOutcomes(sprint, estimatedStories);
    
    sprint.ceremonies.planning = {
      date: new Date().toISOString(),
      duration: '2 hours',
      outcomes: planningOutcomes
    };
    
    sprint.status = 'active';
    
    this.emit('sprint-planned', { sprint, stories: estimatedStories });
    
    return sprint;
  }
  
  /**
   * Estimate stories using planning poker simulation
   */
  async estimateStories(storyIds: string[]): Promise<UserStory[]> {
    console.log(chalk.cyan('🎯 Estimating stories...'));
    
    const estimatedStories: UserStory[] = [];
    
    for (const storyId of storyIds) {
      const story = this.stories.get(storyId);
      if (!story) continue;
      
      if (!story.estimation.points) {
        const estimate = await this.estimateStory(story);
        story.estimation = estimate;
      }
      
      estimatedStories.push(story);
    }
    
    this.emit('stories-estimated', { stories: estimatedStories });
    
    return estimatedStories;
  }
  
  /**
   * Refine backlog stories
   */
  async refineBacklog(
    storyIds: string[],
    participants: string[]
  ): Promise<BacklogRefinement> {
    console.log(chalk.cyan('🔍 Refining backlog...'));
    
    const refinement: BacklogRefinement = {
      sessionId: `refinement-${Date.now()}`,
      date: new Date().toISOString(),
      participants,
      storiesRefined: [],
      decisions: [],
      actionItems: []
    };
    
    for (const storyId of storyIds) {
      const story = this.stories.get(storyId);
      if (!story) continue;
      
      const refined = await this.refineStory(story);
      refinement.storiesRefined.push(refined);
      
      // Update story with refinements
      if (refined.refinedEstimate !== story.estimation.points) {
        story.estimation.points = refined.refinedEstimate;
      }
      
      // Split story if needed
      if (refined.splitInto && refined.splitInto.length > 0) {
        const subStories = await this.splitStory(story, refined.splitInto);
        subStories.forEach(subStory => {
          this.stories.set(subStory.id, subStory);
        });
      }
    }
    
    this.emit('backlog-refined', { refinement });
    
    return refinement;
  }
  
  /**
   * Conduct daily standup
   */
  async conductStandup(
    sprintId: string,
    updates: Array<{
      member: string;
      yesterday: string;
      today: string;
      blockers: string[];
    }>
  ): Promise<any> {
    console.log(chalk.cyan('👥 Conducting daily standup...'));
    
    const sprint = this.sprints.get(sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }
    
    const standup = {
      date: new Date().toISOString(),
      blockers: updates.flatMap(u => u.blockers),
      achievements: [],
      insights: await this.analyzeStandupPatterns(updates)
    };
    
    if (!sprint.ceremonies.dailyStandups) {
      sprint.ceremonies.dailyStandups = [];
    }
    sprint.ceremonies.dailyStandups.push(standup);
    
    // Update burndown
    await this.updateBurndown(sprint);
    
    this.emit('standup-completed', { sprint, standup });
    
    return standup;
  }
  
  /**
   * Conduct sprint review
   */
  async conductSprintReview(
    sprintId: string,
    demonstrations: string[],
    feedback: string[]
  ): Promise<any> {
    console.log(chalk.cyan('🎭 Conducting sprint review...'));
    
    const sprint = this.sprints.get(sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }
    
    sprint.ceremonies.review = {
      date: new Date().toISOString(),
      demonstrations,
      feedback
    };
    
    // Calculate sprint metrics
    const metrics = await this.calculateSprintMetrics(sprint);
    sprint.metrics = { ...sprint.metrics, ...metrics };
    
    sprint.status = 'review';
    
    this.emit('sprint-reviewed', { sprint });
    
    return sprint.ceremonies.review;
  }
  
  /**
   * Conduct sprint retrospective
   */
  async conductRetrospective(
    sprintId: string,
    input: {
      whatWentWell: string[];
      whatCouldImprove: string[];
      actionItems: string[];
    }
  ): Promise<any> {
    console.log(chalk.cyan('💭 Conducting sprint retrospective...'));
    
    const sprint = this.sprints.get(sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }
    
    sprint.ceremonies.retrospective = {
      date: new Date().toISOString(),
      ...input
    };
    
    // Generate insights and recommendations
    const insights = await this.generateRetrospectiveInsights(sprint);
    
    sprint.status = 'completed';
    
    this.emit('retrospective-completed', { sprint, insights });
    
    return { retrospective: sprint.ceremonies.retrospective, insights };
  }
  
  /**
   * Analyze dependencies between stories
   */
  private async analyzeDependencies(stories: UserStory[]): Promise<void> {
    console.log(chalk.dim('  🔗 Analyzing story dependencies...'));
    
    const dependencies = await this.dependencyManager.analyze(stories);
    
    for (const dep of dependencies) {
      const story = stories.find(s => s.id === dep.fromStoryId);
      if (story) {
        story.dependencies.push({
          storyId: dep.toStoryId,
          type: dep.type as any,
          description: dep.description
        });
      }
    }
  }
  
  /**
   * Create user story from parsed data
   */
  private createUserStory(data: any): UserStory {
    return {
      id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: data.title || 'Untitled Story',
      type: data.type || 'feature',
      status: 'backlog',
      story: {
        asA: data.asA || 'user',
        iWant: data.iWant || 'to perform an action',
        soThat: data.soThat || 'I can achieve a goal',
        narrative: data.narrative
      },
      acceptanceCriteria: data.acceptanceCriteria || [],
      estimation: {
        complexity: data.complexity,
        confidence: data.confidence
      },
      priority: {
        value: data.priority || 'medium'
      },
      dependencies: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'scrum-master-agent'
      }
    };
  }
  
  /**
   * Estimate a single story
   */
  private async estimateStory(story: UserStory): Promise<any> {
    const prompt = `Estimate the following user story using the Fibonacci sequence (1, 2, 3, 5, 8, 13, 21):

Story: ${story.story.asA}, ${story.story.iWant}, ${story.story.soThat}
Type: ${story.type}
Acceptance Criteria: ${story.acceptanceCriteria.length} criteria

Consider complexity, effort, and uncertainty. Provide:
1. Story points (Fibonacci number)
2. Complexity level
3. Effort size (XS/S/M/L/XL/XXL)
4. Confidence percentage

Format as JSON.`;
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.5,
      maxTokens: 500,
      format: 'json'
    });
    
    try {
      const estimate = JSON.parse(response);
      return {
        points: estimate.points || 5,
        complexity: estimate.complexity || 'moderate',
        effort: estimate.effort || 'M',
        confidence: estimate.confidence || 70
      };
    } catch {
      return {
        points: 5,
        complexity: 'moderate',
        effort: 'M',
        confidence: 50
      };
    }
  }
  
  /**
   * Refine a single story
   */
  private async refineStory(story: UserStory): Promise<any> {
    const prompt = `Refine the following user story:

${JSON.stringify(story, null, 2)}

Provide:
1. Refined estimate (story points)
2. Clarifications needed
3. Whether to split the story (and how)
4. Whether it's ready for sprint

Format as JSON.`;
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 1000,
      format: 'json'
    });
    
    try {
      const refined = JSON.parse(response);
      return {
        storyId: story.id,
        originalEstimate: story.estimation.points,
        refinedEstimate: refined.refinedEstimate || story.estimation.points,
        clarifications: refined.clarifications || [],
        splitInto: refined.splitInto,
        readyForSprint: refined.readyForSprint !== false
      };
    } catch {
      return {
        storyId: story.id,
        originalEstimate: story.estimation.points,
        refinedEstimate: story.estimation.points || 5,
        clarifications: [],
        readyForSprint: true
      };
    }
  }
  
  /**
   * Split a story into sub-stories
   */
  private async splitStory(parentStory: UserStory, splits: string[]): Promise<UserStory[]> {
    const subStories: UserStory[] = [];
    
    for (const split of splits) {
      const subStory: UserStory = {
        ...parentStory,
        id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: split,
        metadata: {
          ...parentStory.metadata,
          epic: parentStory.id
        }
      };
      
      subStories.push(subStory);
    }
    
    return subStories;
  }
  
  /**
   * Initialize burndown chart data
   */
  private initializeBurndown(startDate: Date, endDate: Date, totalPoints: number): any[] {
    const burndown = [];
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dailyVelocity = totalPoints / days;
    
    for (let i = 0; i <= days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      
      burndown.push({
        date: date.toISOString().split('T')[0],
        remainingPoints: totalPoints,
        idealPoints: Math.max(0, totalPoints - (dailyVelocity * i))
      });
    }
    
    return burndown;
  }
  
  /**
   * Update burndown chart
   */
  private async updateBurndown(sprint: Sprint): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const completedPoints = this.calculateCompletedPoints(sprint);
    const remainingPoints = sprint.metrics.plannedPoints - completedPoints;
    
    const todayData = sprint.metrics.burndownData.find(d => d.date === today);
    if (todayData) {
      todayData.remainingPoints = remainingPoints;
    }
    
    sprint.metrics.completedPoints = completedPoints;
  }
  
  /**
   * Calculate completed points
   */
  private calculateCompletedPoints(sprint: Sprint): number {
    let completed = 0;
    
    for (const storyId of sprint.stories) {
      const story = this.stories.get(storyId);
      if (story && story.status === 'done') {
        completed += story.estimation.points || 0;
      }
    }
    
    return completed;
  }
  
  /**
   * Generate planning outcomes
   */
  private async generatePlanningOutcomes(sprint: Sprint, stories: UserStory[]): Promise<string[]> {
    return [
      `Sprint goal defined: ${sprint.goal}`,
      `${stories.length} stories selected for sprint`,
      `Total story points: ${sprint.metrics.plannedPoints}`,
      `Team capacity: ${sprint.capacity.availableHours} hours`,
      `Velocity target: ${sprint.capacity.velocityTarget} points`
    ];
  }
  
  /**
   * Analyze standup patterns
   */
  private async analyzeStandupPatterns(updates: any[]): Promise<string[]> {
    const insights: string[] = [];
    
    const blockers = updates.flatMap(u => u.blockers);
    if (blockers.length > 0) {
      insights.push(`${blockers.length} blockers identified across the team`);
    }
    
    return insights;
  }
  
  /**
   * Calculate sprint metrics
   */
  private async calculateSprintMetrics(sprint: Sprint): Promise<any> {
    const completedPoints = this.calculateCompletedPoints(sprint);
    const velocity = completedPoints;
    const completionRate = (completedPoints / sprint.metrics.plannedPoints) * 100;
    
    return {
      completedPoints,
      velocity,
      completionRate
    };
  }
  
  /**
   * Generate retrospective insights
   */
  private async generateRetrospectiveInsights(sprint: Sprint): Promise<string[]> {
    const insights: string[] = [];
    
    if (sprint.metrics.completionRate) {
      insights.push(`Sprint completion rate: ${sprint.metrics.completionRate.toFixed(1)}%`);
    }
    
    if (sprint.metrics.velocity) {
      insights.push(`Team velocity: ${sprint.metrics.velocity} points`);
    }
    
    const blockerCount = sprint.ceremonies.dailyStandups?.reduce(
      (sum, standup) => sum + standup.blockers.length, 0
    ) || 0;
    
    if (blockerCount > 0) {
      insights.push(`Total blockers encountered: ${blockerCount}`);
    }
    
    return insights;
  }
  
  /**
   * Ensure Scrum Master configuration exists
   */
  private async ensureScrumMasterConfig(): Promise<void> {
    const config = this.configSystem.getConfiguration(this.agentId);
    if (!config) {
      await this.configSystem.createConfiguration({
        id: 'scrum-master',
        name: 'Scrum Master Agent',
        description: 'Manages agile processes, sprints, and user stories',
        version: '1.0.0',
        enabled: true,
        role: {
          title: 'Scrum Master',
          department: 'Agile Delivery',
          level: 'senior',
          expertise: [
            'Scrum Framework',
            'Sprint Planning',
            'Backlog Management',
            'Story Estimation',
            'Team Facilitation',
            'Agile Metrics'
          ]
        },
        behavior: {
          temperature: 0.6,
          maxTokens: 3000,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          responseStyle: 'detailed',
          personality: {
            traits: ['facilitative', 'organized', 'supportive', 'data-driven'],
            communicationStyle: 'Clear and encouraging with focus on team empowerment',
            decisionMaking: 'Collaborative with emphasis on team consensus and continuous improvement'
          }
        },
        prompts: {
          system: `You are an experienced Scrum Master facilitating agile development processes.
Your role is to:
1. Help teams write clear, actionable user stories
2. Facilitate sprint planning and estimation
3. Track sprint progress and metrics
4. Identify and remove impediments
5. Guide teams through Scrum ceremonies
6. Promote agile best practices

Focus on team empowerment, continuous improvement, and delivering value.`,
          taskPrefix: 'As a Scrum Master, I will facilitate:',
          taskSuffix: 'Ensuring the team follows agile principles and delivers value incrementally.'
        },
        capabilities: {
          actions: [
            'story_writing',
            'sprint_planning',
            'backlog_refinement',
            'estimation',
            'standup_facilitation',
            'retrospective_facilitation',
            'metrics_tracking'
          ],
          tools: ['jira', 'confluence', 'miro', 'planning_poker'],
          outputFormats: ['markdown', 'json', 'csv'],
          maxIterations: 3
        },
        integrations: {
          requiresApproval: false,
          canCallOtherAgents: true,
          allowedAgents: ['product-manager', 'developer', 'qa-engineer']
        },
        metrics: {
          trackUsage: true,
          trackPerformance: true,
          trackErrors: true,
          reportingInterval: 3600000
        }
      });
    }
  }
  
  /**
   * Export sprint data to various formats
   */
  exportSprint(sprintId: string, format: 'json' | 'markdown' | 'csv' = 'markdown'): string {
    const sprint = this.sprints.get(sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }
    
    switch (format) {
      case 'json':
        return JSON.stringify(sprint, null, 2);
      
      case 'markdown':
        return this.exportSprintToMarkdown(sprint);
      
      case 'csv':
        return this.exportSprintToCSV(sprint);
      
      default:
        return JSON.stringify(sprint, null, 2);
    }
  }
  
  /**
   * Export sprint to markdown
   */
  private exportSprintToMarkdown(sprint: Sprint): string {
    let markdown = `# ${sprint.name}\n\n`;
    markdown += `**Goal:** ${sprint.goal}\n`;
    markdown += `**Duration:** ${sprint.startDate} to ${sprint.endDate}\n`;
    markdown += `**Status:** ${sprint.status}\n\n`;
    
    markdown += `## Metrics\n`;
    markdown += `- Planned Points: ${sprint.metrics.plannedPoints}\n`;
    markdown += `- Completed Points: ${sprint.metrics.completedPoints}\n`;
    markdown += `- Velocity: ${sprint.metrics.velocity || 'N/A'}\n`;
    markdown += `- Completion Rate: ${sprint.metrics.completionRate?.toFixed(1) || 'N/A'}%\n\n`;
    
    markdown += `## Stories\n`;
    for (const storyId of sprint.stories) {
      const story = this.stories.get(storyId);
      if (story) {
        markdown += `- **${story.title}** (${story.estimation.points || '?'} points) - ${story.status}\n`;
      }
    }
    
    return markdown;
  }
  
  /**
   * Export sprint to CSV
   */
  private exportSprintToCSV(sprint: Sprint): string {
    let csv = 'Story ID,Title,Points,Status,Type\n';
    
    for (const storyId of sprint.stories) {
      const story = this.stories.get(storyId);
      if (story) {
        csv += `${story.id},"${story.title}",${story.estimation.points || 0},${story.status},${story.type}\n`;
      }
    }
    
    return csv;
  }
}

// Export singleton instance
export const scrumMasterAgent = new ScrumMasterAgent();