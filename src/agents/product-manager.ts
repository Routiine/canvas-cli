/**
 * Product Manager Agent
 * Creates product requirements, manages strategy, and prioritizes features
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import chalk from 'chalk';
import { AgentConfigurationSystem } from './config/agent-config.js';
import { PromptTemplateSystem } from './config/prompt-templates.js';
import { ModelManager } from '../models/model-manager.js';

// Product Requirements Document Schema
export const PRDSchema = z.object({
  title: z.string(),
  version: z.string(),
  status: z.enum(['draft', 'review', 'approved', 'deprecated']),
  
  executiveSummary: z.object({
    vision: z.string(),
    problem: z.string(),
    solution: z.string(),
    targetMarket: z.string(),
    successMetrics: z.array(z.object({
      metric: z.string(),
      target: z.string(),
      measurement: z.string()
    }))
  }),
  
  productOverview: z.object({
    description: z.string(),
    goals: z.array(z.string()),
    nonGoals: z.array(z.string()),
    assumptions: z.array(z.string()),
    constraints: z.array(z.string())
  }),
  
  userPersonas: z.array(z.object({
    name: z.string(),
    role: z.string(),
    background: z.string(),
    goals: z.array(z.string()),
    painPoints: z.array(z.string()),
    userJourney: z.array(z.string())
  })),
  
  features: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    priority: z.enum(['must-have', 'should-have', 'nice-to-have', 'future']),
    userStory: z.string(),
    acceptanceCriteria: z.array(z.string()),
    dependencies: z.array(z.string()),
    effort: z.enum(['XS', 'S', 'M', 'L', 'XL']),
    impact: z.enum(['low', 'medium', 'high', 'critical'])
  })),
  
  technicalConsiderations: z.object({
    architecture: z.string(),
    integrations: z.array(z.string()),
    performance: z.array(z.string()),
    security: z.array(z.string()),
    scalability: z.array(z.string())
  }),
  
  goToMarket: z.object({
    launchStrategy: z.string(),
    pricingModel: z.string().optional(),
    marketingChannels: z.array(z.string()),
    partnerships: z.array(z.string()).optional(),
    competitiveAnalysis: z.array(z.object({
      competitor: z.string(),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      differentiation: z.string()
    }))
  }),
  
  roadmap: z.object({
    phases: z.array(z.object({
      phase: z.string(),
      timeframe: z.string(),
      deliverables: z.array(z.string()),
      milestones: z.array(z.string()),
      successCriteria: z.array(z.string())
    })),
    releases: z.array(z.object({
      version: z.string(),
      date: z.string(),
      features: z.array(z.string()),
      dependencies: z.array(z.string())
    }))
  }),
  
  risksAndMitigations: z.array(z.object({
    risk: z.string(),
    probability: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high', 'critical']),
    mitigation: z.string(),
    contingency: z.string().optional()
  })),
  
  appendix: z.object({
    glossary: z.record(z.string()).optional(),
    references: z.array(z.string()).optional(),
    changelog: z.array(z.object({
      version: z.string(),
      date: z.string(),
      changes: z.array(z.string())
    })).optional()
  }).optional()
});

export type PRD = z.infer<typeof PRDSchema>;

// Feature Prioritization Schema
export const FeaturePrioritizationSchema = z.object({
  framework: z.enum(['RICE', 'MoSCoW', 'Value-Effort', 'Kano', 'ICE']),
  features: z.array(z.object({
    id: z.string(),
    name: z.string(),
    scores: z.record(z.number()),
    totalScore: z.number(),
    rank: z.number(),
    rationale: z.string()
  })),
  recommendations: z.array(z.string()),
  tradeoffs: z.array(z.string())
});

export type FeaturePrioritization = z.infer<typeof FeaturePrioritizationSchema>;

/**
 * Product Manager Agent Implementation
 */
export class ProductManagerAgent extends EventEmitter {
  private configSystem: AgentConfigurationSystem;
  private templateSystem: PromptTemplateSystem;
  private modelManager: typeof ModelManager;
  private agentId = 'product-manager';
  
  constructor() {
    super();
    this.configSystem = new AgentConfigurationSystem();
    this.templateSystem = new PromptTemplateSystem();
    this.modelManager = ModelManager;
  }
  
  async initialize(): Promise<void> {
    await this.configSystem.initialize();
    await this.templateSystem.initialize();
    this.emit('initialized', { agent: this.agentId });
  }
  
  /**
   * Create a Product Requirements Document
   */
  async createPRD(
    productDescription: string,
    context?: Record<string, any>
  ): Promise<PRD> {
    console.log(chalk.cyan('📋 Creating Product Requirements Document...'));
    
    const config = this.configSystem.getConfiguration(this.agentId);
    if (!config) {
      throw new Error('Product Manager agent configuration not found');
    }
    
    // Build comprehensive prompt
    const prompt = this.buildPRDPrompt(productDescription, context);
    
    // Generate PRD using LLM
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: config.behavior.temperature,
      maxTokens: config.behavior.maxTokens,
      format: 'json'
    });
    
    // Parse and validate PRD
    const prd = this.parsePRD(response);
    
    // Emit event
    this.emit('prd-created', { prd, productDescription });
    
    return prd;
  }
  
  /**
   * Write user stories for features
   */
  async writeUserStories(
    features: string[],
    personas?: any[]
  ): Promise<Array<{ feature: string; stories: string[] }>> {
    console.log(chalk.cyan('✍️ Writing user stories...'));
    
    const stories: Array<{ feature: string; stories: string[] }> = [];
    
    for (const feature of features) {
      const prompt = this.templateSystem.renderTemplate('user-story', {
        feature,
        personas: personas || []
      });
      
      const response = await this.modelManager.generateResponse(prompt, {
        temperature: 0.7,
        maxTokens: 1000
      });
      
      const featureStories = this.parseUserStories(response);
      stories.push({
        feature,
        stories: featureStories
      });
    }
    
    this.emit('user-stories-created', { stories });
    return stories;
  }
  
  /**
   * Prioritize features using various frameworks
   */
  async prioritizeFeatures(
    features: Array<{ name: string; description: string }>,
    framework: 'RICE' | 'MoSCoW' | 'Value-Effort' | 'Kano' | 'ICE' = 'RICE',
    context?: Record<string, any>
  ): Promise<FeaturePrioritization> {
    console.log(chalk.cyan(`📊 Prioritizing features using ${framework} framework...`));
    
    const prompt = this.buildPrioritizationPrompt(features, framework, context);
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 2000,
      format: 'json'
    });
    
    const prioritization = this.parsePrioritization(response, framework);
    
    this.emit('features-prioritized', { prioritization, framework });
    return prioritization;
  }
  
  /**
   * Conduct market analysis
   */
  async analyzeMarket(
    product: string,
    market: string,
    competitors?: string[]
  ): Promise<any> {
    console.log(chalk.cyan('📈 Analyzing market...'));
    
    const prompt = this.templateSystem.renderTemplate('market-analysis', {
      product,
      market,
      competitors: competitors || []
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.7,
      maxTokens: 3000
    });
    
    const analysis = this.parseMarketAnalysis(response);
    
    this.emit('market-analyzed', { analysis, product, market });
    return analysis;
  }
  
  /**
   * Create product roadmap
   */
  async createRoadmap(
    vision: string,
    features: any[],
    timeframe: string
  ): Promise<any> {
    console.log(chalk.cyan('🗺️ Creating product roadmap...'));
    
    const prompt = this.templateSystem.renderTemplate('product-roadmap', {
      vision,
      features,
      timeframe
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.7,
      maxTokens: 2500
    });
    
    const roadmap = this.parseRoadmap(response);
    
    this.emit('roadmap-created', { roadmap, vision });
    return roadmap;
  }
  
  /**
   * Define success metrics and KPIs
   */
  async defineMetrics(
    product: string,
    goals: string[]
  ): Promise<any> {
    console.log(chalk.cyan('📊 Defining success metrics...'));
    
    const prompt = this.templateSystem.renderTemplate('success-metrics', {
      product,
      goals
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 1500
    });
    
    const metrics = this.parseMetrics(response);
    
    this.emit('metrics-defined', { metrics, product });
    return metrics;
  }
  
  /**
   * Generate go-to-market strategy
   */
  async createGTMStrategy(
    product: string,
    targetMarket: string,
    uniqueValue: string
  ): Promise<any> {
    console.log(chalk.cyan('🚀 Creating go-to-market strategy...'));
    
    const prompt = this.templateSystem.renderTemplate('gtm-strategy', {
      product,
      targetMarket,
      uniqueValue
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.7,
      maxTokens: 2500
    });
    
    const strategy = this.parseGTMStrategy(response);
    
    this.emit('gtm-created', { strategy, product });
    return strategy;
  }
  
  /**
   * Build PRD prompt
   */
  private buildPRDPrompt(description: string, context?: Record<string, any>): string {
    const config = this.configSystem.getConfiguration(this.agentId);
    if (!config) {
      throw new Error('Product Manager configuration not found');
    }
    
    let prompt = config.prompts.system + '\n\n';
    prompt += 'Create a comprehensive Product Requirements Document (PRD) for the following product:\n\n';
    prompt += `Product Description: ${description}\n\n`;
    
    if (context) {
      prompt += 'Additional Context:\n';
      for (const [key, value] of Object.entries(context)) {
        prompt += `- ${key}: ${JSON.stringify(value)}\n`;
      }
      prompt += '\n';
    }
    
    prompt += `The PRD should include:
1. Executive Summary (vision, problem, solution, target market, success metrics)
2. Product Overview (description, goals, non-goals, assumptions, constraints)
3. User Personas (at least 2-3 detailed personas)
4. Feature List (prioritized with user stories and acceptance criteria)
5. Technical Considerations (architecture, integrations, performance, security)
6. Go-to-Market Strategy (launch strategy, marketing channels, competitive analysis)
7. Product Roadmap (phased approach with milestones)
8. Risks and Mitigations

Format the response as JSON matching the PRD schema.`;
    
    return prompt;
  }
  
  /**
   * Build feature prioritization prompt
   */
  private buildPrioritizationPrompt(
    features: Array<{ name: string; description: string }>,
    framework: string,
    context?: Record<string, any>
  ): string {
    let prompt = `As a Senior Product Manager, prioritize the following features using the ${framework} framework:\n\n`;
    
    features.forEach((feature, index) => {
      prompt += `${index + 1}. ${feature.name}: ${feature.description}\n`;
    });
    
    prompt += `\n${this.getFrameworkInstructions(framework)}\n`;
    
    if (context) {
      prompt += '\nAdditional Context:\n';
      for (const [key, value] of Object.entries(context)) {
        prompt += `- ${key}: ${JSON.stringify(value)}\n`;
      }
    }
    
    prompt += '\nProvide detailed scoring, rankings, recommendations, and tradeoffs. Format as JSON.';
    
    return prompt;
  }
  
  /**
   * Get framework-specific instructions
   */
  private getFrameworkInstructions(framework: string): string {
    const instructions: Record<string, string> = {
      'RICE': `Use RICE scoring:
- Reach: How many users will this impact?
- Impact: How much will it move the needle? (3=massive, 2=high, 1=medium, 0.5=low, 0.25=minimal)
- Confidence: How confident are we? (100%=high, 80%=medium, 50%=low)
- Effort: How many person-months?
Score = (Reach * Impact * Confidence) / Effort`,
      
      'MoSCoW': `Categorize into:
- Must Have: Critical for launch
- Should Have: Important but not critical
- Could Have: Nice to have
- Won't Have: Out of scope for now`,
      
      'Value-Effort': `Score each feature on:
- Business Value (1-10)
- User Value (1-10)
- Implementation Effort (1-10, inverse)
Plot on a matrix and identify quick wins vs strategic initiatives`,
      
      'Kano': `Classify features as:
- Basic: Expected features (dissatisfiers if missing)
- Performance: Linear satisfaction (more is better)
- Excitement: Delighters (unexpected features)
Prioritize based on customer satisfaction impact`,
      
      'ICE': `Score each feature on:
- Impact (1-10): How much will it move our key metrics?
- Confidence (1-10): How sure are we about impact?
- Ease (1-10): How easy is it to implement?
ICE Score = Impact * Confidence * Ease`
    };
    
    return instructions[framework] || instructions['RICE'];
  }
  
  /**
   * Parse PRD from LLM response
   */
  private parsePRD(response: string): PRD {
    try {
      const parsed = JSON.parse(response);
      return PRDSchema.parse(parsed);
    } catch (error) {
      // Create a default PRD structure if parsing fails
      return this.createDefaultPRD(response);
    }
  }
  
  /**
   * Create default PRD structure
   */
  private createDefaultPRD(content: string): PRD {
    return {
      title: 'Product Requirements Document',
      version: '1.0.0',
      status: 'draft',
      executiveSummary: {
        vision: 'Product vision to be defined',
        problem: 'Problem statement to be defined',
        solution: 'Solution overview to be defined',
        targetMarket: 'Target market to be defined',
        successMetrics: []
      },
      productOverview: {
        description: content,
        goals: [],
        nonGoals: [],
        assumptions: [],
        constraints: []
      },
      userPersonas: [],
      features: [],
      technicalConsiderations: {
        architecture: '',
        integrations: [],
        performance: [],
        security: [],
        scalability: []
      },
      goToMarket: {
        launchStrategy: '',
        marketingChannels: [],
        competitiveAnalysis: []
      },
      roadmap: {
        phases: [],
        releases: []
      },
      risksAndMitigations: []
    };
  }
  
  /**
   * Parse user stories from response
   */
  private parseUserStories(response: string): string[] {
    const lines = response.split('\n');
    const stories = lines.filter(line => 
      line.trim().startsWith('As a') || 
      line.trim().match(/^\d+\..*As a/)
    );
    
    return stories.map(story => 
      story.replace(/^\d+\.\s*/, '').trim()
    );
  }
  
  /**
   * Parse prioritization results
   */
  private parsePrioritization(response: string, framework: string): FeaturePrioritization {
    try {
      const parsed = JSON.parse(response);
      return FeaturePrioritizationSchema.parse({
        framework,
        ...parsed
      });
    } catch (error) {
      return {
        framework: framework as any,
        features: [],
        recommendations: ['Unable to parse prioritization results'],
        tradeoffs: []
      };
    }
  }
  
  /**
   * Parse market analysis
   */
  private parseMarketAnalysis(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        summary: response,
        marketSize: 'To be analyzed',
        growthRate: 'To be analyzed',
        competitors: [],
        opportunities: [],
        threats: []
      };
    }
  }
  
  /**
   * Parse roadmap
   */
  private parseRoadmap(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        vision: 'Product vision',
        phases: [],
        milestones: [],
        timeline: response
      };
    }
  }
  
  /**
   * Parse metrics
   */
  private parseMetrics(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        northStar: 'To be defined',
        kpis: [],
        operationalMetrics: [],
        description: response
      };
    }
  }
  
  /**
   * Parse GTM strategy
   */
  private parseGTMStrategy(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        strategy: response,
        channels: [],
        messaging: '',
        pricing: '',
        timeline: ''
      };
    }
  }
  
  /**
   * Export PRD to markdown
   */
  exportPRDToMarkdown(prd: PRD): string {
    let markdown = `# ${prd.title}\n\n`;
    markdown += `**Version:** ${prd.version}\n`;
    markdown += `**Status:** ${prd.status}\n\n`;
    
    markdown += `## Executive Summary\n\n`;
    markdown += `### Vision\n${prd.executiveSummary.vision}\n\n`;
    markdown += `### Problem Statement\n${prd.executiveSummary.problem}\n\n`;
    markdown += `### Solution Overview\n${prd.executiveSummary.solution}\n\n`;
    markdown += `### Target Market\n${prd.executiveSummary.targetMarket}\n\n`;
    
    if (prd.executiveSummary.successMetrics.length > 0) {
      markdown += `### Success Metrics\n`;
      prd.executiveSummary.successMetrics.forEach(metric => {
        markdown += `- **${metric.metric}**: ${metric.target} (${metric.measurement})\n`;
      });
      markdown += '\n';
    }
    
    markdown += `## Product Overview\n\n`;
    markdown += `${prd.productOverview.description}\n\n`;
    
    if (prd.productOverview.goals.length > 0) {
      markdown += `### Goals\n`;
      prd.productOverview.goals.forEach(goal => {
        markdown += `- ${goal}\n`;
      });
      markdown += '\n';
    }
    
    if (prd.features.length > 0) {
      markdown += `## Features\n\n`;
      prd.features.forEach(feature => {
        markdown += `### ${feature.name} (${feature.priority})\n`;
        markdown += `${feature.description}\n\n`;
        markdown += `**User Story:** ${feature.userStory}\n\n`;
        if (feature.acceptanceCriteria.length > 0) {
          markdown += `**Acceptance Criteria:**\n`;
          feature.acceptanceCriteria.forEach(criteria => {
            markdown += `- ${criteria}\n`;
          });
          markdown += '\n';
        }
      });
    }
    
    return markdown;
  }
}

// Export singleton instance
export const productManagerAgent = new ProductManagerAgent();