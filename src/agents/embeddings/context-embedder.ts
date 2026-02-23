/**
 * Context Embedding System
 * Enriches stories with contextual information and semantic understanding
 */

import { EventEmitter } from 'events';
import chalk from 'chalk';
import { ModelManager } from '../../models/model-manager.js';

export interface EmbeddingContext {
  project?: {
    name: string;
    description: string;
    goals: string[];
    constraints: string[];
  };
  team?: {
    size: number;
    skills: string[];
    velocity: number;
    capacity: number;
  };
  technical?: {
    stack: string[];
    architecture: string;
    apis: string[];
    databases: string[];
  };
  business?: {
    domain: string;
    regulations: string[];
    stakeholders: string[];
    deadlines: Record<string, string>;
  };
  historical?: {
    similarStories: any[];
    averageVelocity: number;
    commonIssues: string[];
  };
}

export interface EnrichedStory {
  original: any;
  embeddings: {
    semantic: number[];
    contextual: number[];
    technical: number[];
  };
  context: {
    relevantProject: string[];
    requiredSkills: string[];
    technicalComponents: string[];
    businessImpact: string[];
    estimatedComplexity: number;
  };
  suggestions: {
    acceptanceCriteria: string[];
    technicalConsiderations: string[];
    dependencies: string[];
    risks: string[];
  };
  metadata: {
    confidence: number;
    completeness: number;
    clarity: number;
  };
}

/**
 * Context Embedder Implementation
 */
export class ContextEmbedder extends EventEmitter {
  private modelManager: typeof ModelManager;
  private contextCache: Map<string, EmbeddingContext> = new Map();
  private embeddingCache: Map<string, number[]> = new Map();
  
  constructor() {
    super();
    this.modelManager = ModelManager;
  }
  
  async initialize(): Promise<void> {
    // Initialize embedding model if needed
    this.emit('initialized');
  }
  
  /**
   * Embed context into a story
   */
  async embedContext(story: any, context?: Record<string, any>): Promise<EnrichedStory> {
    console.log(chalk.dim('    🧩 Embedding context into story...'));
    
    // Generate embeddings
    const embeddings = await this.generateEmbeddings(story);
    
    // Analyze context relevance
    const contextAnalysis = await this.analyzeContext(story, context);
    
    // Generate suggestions based on context
    const suggestions = await this.generateSuggestions(story, contextAnalysis);
    
    // Calculate metadata scores
    const metadata = this.calculateMetadata(story, contextAnalysis);
    
    const enriched: EnrichedStory = {
      original: story,
      embeddings,
      context: contextAnalysis,
      suggestions,
      metadata
    };
    
    this.emit('story-enriched', { story: enriched });
    
    return enriched;
  }
  
  /**
   * Generate embeddings for a story
   */
  private async generateEmbeddings(story: any): Promise<any> {
    // Create text representation
    const storyText = this.storyToText(story);
    
    // Check cache
    if (this.embeddingCache.has(storyText)) {
      return {
        semantic: this.embeddingCache.get(storyText)!,
        contextual: [],
        technical: []
      };
    }
    
    // Generate semantic embeddings (simplified - in production would use actual embedding model)
    const semantic = await this.generateSemanticEmbedding(storyText);
    
    // Generate contextual embeddings
    const contextual = await this.generateContextualEmbedding(story);
    
    // Generate technical embeddings
    const technical = await this.generateTechnicalEmbedding(story);
    
    // Cache semantic embedding
    this.embeddingCache.set(storyText, semantic);
    
    return {
      semantic,
      contextual,
      technical
    };
  }
  
  /**
   * Generate semantic embedding
   */
  private async generateSemanticEmbedding(text: string): Promise<number[]> {
    // Simplified embedding generation
    // In production, this would use a real embedding model (e.g., OpenAI, Sentence Transformers)
    
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0); // Standard embedding size
    
    // Simple bag-of-words style embedding
    for (let i = 0; i < words.length && i < embedding.length; i++) {
      const hash = this.hashString(words[i]);
      const index = Math.abs(hash) % embedding.length;
      embedding[index] += 1 / Math.sqrt(words.length);
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }
  
  /**
   * Generate contextual embedding
   */
  private async generateContextualEmbedding(story: any): Promise<number[]> {
    const features = [];
    
    // Extract contextual features
    features.push(story.type === 'feature' ? 1 : 0);
    features.push(story.type === 'bug' ? 1 : 0);
    features.push(story.type === 'technical' ? 1 : 0);
    features.push(story.priority === 'high' ? 1 : 0);
    features.push(story.priority === 'critical' ? 1 : 0);
    features.push(story.acceptanceCriteria ? story.acceptanceCriteria.length / 10 : 0);
    features.push(story.complexity ? parseInt(story.complexity) / 21 : 0.5); // Normalize to 0-1
    
    return features;
  }
  
  /**
   * Generate technical embedding
   */
  private async generateTechnicalEmbedding(story: any): Promise<number[]> {
    const technicalKeywords = [
      'api', 'database', 'frontend', 'backend', 'security', 'performance',
      'integration', 'authentication', 'authorization', 'cache', 'queue',
      'microservice', 'deployment', 'testing', 'monitoring', 'logging'
    ];
    
    const text = this.storyToText(story).toLowerCase();
    const embedding = [];
    
    for (const keyword of technicalKeywords) {
      embedding.push(text.includes(keyword) ? 1 : 0);
    }
    
    return embedding;
  }
  
  /**
   * Analyze context for a story
   */
  private async analyzeContext(story: any, context?: Record<string, any>): Promise<any> {
    const analysis = {
      relevantProject: [] as string[],
      requiredSkills: [] as string[],
      technicalComponents: [] as string[],
      businessImpact: [] as string[],
      estimatedComplexity: 5
    };
    
    // Analyze project relevance
    if (context?.project) {
      analysis.relevantProject = this.analyzeProjectRelevance(story, context.project);
    }
    
    // Identify required skills
    analysis.requiredSkills = await this.identifyRequiredSkills(story);
    
    // Identify technical components
    analysis.technicalComponents = await this.identifyTechnicalComponents(story);
    
    // Analyze business impact
    analysis.businessImpact = await this.analyzeBusinessImpact(story);
    
    // Estimate complexity
    analysis.estimatedComplexity = await this.estimateComplexity(story, analysis);
    
    return analysis;
  }
  
  /**
   * Generate suggestions based on context
   */
  private async generateSuggestions(story: any, context: any): Promise<any> {
    const suggestions = {
      acceptanceCriteria: [] as string[],
      technicalConsiderations: [] as string[],
      dependencies: [] as string[],
      risks: [] as string[]
    };
    
    // Generate acceptance criteria suggestions
    if (!story.acceptanceCriteria || story.acceptanceCriteria.length < 3) {
      suggestions.acceptanceCriteria = await this.suggestAcceptanceCriteria(story);
    }
    
    // Generate technical considerations
    if (context.technicalComponents.length > 0) {
      suggestions.technicalConsiderations = await this.suggestTechnicalConsiderations(
        story,
        context.technicalComponents
      );
    }
    
    // Identify potential dependencies
    suggestions.dependencies = await this.suggestDependencies(story, context);
    
    // Identify risks
    suggestions.risks = await this.identifyRisks(story, context);
    
    return suggestions;
  }
  
  /**
   * Calculate metadata scores
   */
  private calculateMetadata(story: any, context: any): any {
    let completeness = 0;
    let clarity = 0;
    let confidence = 0;
    
    // Calculate completeness score
    if (story.title) completeness += 10;
    if (story.asA && story.iWant && story.soThat) completeness += 30;
    else if (story.narrative) completeness += 20;
    if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) completeness += 30;
    if (story.type) completeness += 10;
    if (story.priority) completeness += 10;
    if (story.complexity) completeness += 10;
    
    // Calculate clarity score
    if (story.title && story.title.length > 10 && story.title.length < 100) clarity += 20;
    if (story.asA && story.iWant && story.soThat) {
      const storyLength = (story.asA + story.iWant + story.soThat).length;
      if (storyLength > 30 && storyLength < 300) clarity += 40;
    }
    if (story.acceptanceCriteria) {
      const validCriteria = story.acceptanceCriteria.filter((ac: any) => 
        ac.given && ac.when && ac.then
      );
      clarity += (validCriteria.length / story.acceptanceCriteria.length) * 40;
    }
    
    // Calculate confidence score
    confidence = (completeness + clarity) / 2;
    if (context.requiredSkills.length > 0) confidence += 10;
    if (context.technicalComponents.length > 0) confidence += 10;
    confidence = Math.min(100, confidence);
    
    return {
      confidence: confidence / 100,
      completeness: completeness / 100,
      clarity: clarity / 100
    };
  }
  
  /**
   * Convert story to text representation
   */
  private storyToText(story: any): string {
    const parts = [];
    
    if (story.title) parts.push(story.title);
    if (story.asA) parts.push(`As a ${story.asA}`);
    if (story.iWant) parts.push(`I want ${story.iWant}`);
    if (story.soThat) parts.push(`So that ${story.soThat}`);
    if (story.narrative) parts.push(story.narrative);
    
    if (story.acceptanceCriteria) {
      for (const ac of story.acceptanceCriteria) {
        if (ac.given) parts.push(`Given ${ac.given}`);
        if (ac.when) parts.push(`When ${ac.when}`);
        if (ac.then) parts.push(`Then ${ac.then}`);
      }
    }
    
    return parts.join(' ');
  }
  
  /**
   * Hash string to number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
  
  /**
   * Analyze project relevance
   */
  private analyzeProjectRelevance(story: any, project: any): string[] {
    const relevance = [];
    const storyText = this.storyToText(story).toLowerCase();
    
    // Check goal alignment
    if (project.goals) {
      for (const goal of project.goals) {
        if (storyText.includes(goal.toLowerCase())) {
          relevance.push(`Aligns with goal: ${goal}`);
        }
      }
    }
    
    // Check constraint compliance
    if (project.constraints) {
      for (const constraint of project.constraints) {
        if (storyText.includes(constraint.toLowerCase())) {
          relevance.push(`Addresses constraint: ${constraint}`);
        }
      }
    }
    
    return relevance;
  }
  
  /**
   * Identify required skills
   */
  private async identifyRequiredSkills(story: any): Promise<string[]> {
    const skills = new Set<string>();
    const text = this.storyToText(story).toLowerCase();
    
    const skillKeywords = {
      'frontend': ['ui', 'ux', 'react', 'vue', 'angular', 'css', 'html', 'design'],
      'backend': ['api', 'server', 'database', 'endpoint', 'service'],
      'database': ['sql', 'query', 'table', 'schema', 'migration'],
      'devops': ['deploy', 'ci/cd', 'docker', 'kubernetes', 'aws', 'azure'],
      'testing': ['test', 'qa', 'automation', 'unit', 'integration'],
      'security': ['auth', 'security', 'encryption', 'permission', 'role']
    };
    
    for (const [skill, keywords] of Object.entries(skillKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          skills.add(skill);
          break;
        }
      }
    }
    
    return Array.from(skills);
  }
  
  /**
   * Identify technical components
   */
  private async identifyTechnicalComponents(story: any): Promise<string[]> {
    const components = new Set<string>();
    const text = this.storyToText(story).toLowerCase();
    
    const componentPatterns = {
      'API': /\bapi\b|\bendpoint\b|\brest\b|\bgraphql\b/,
      'Database': /\bdatabase\b|\bdb\b|\btable\b|\bquery\b/,
      'Authentication': /\bauth\b|\blogin\b|\bsignin\b|\btoken\b/,
      'UI Component': /\bui\b|\bcomponent\b|\bwidget\b|\bform\b/,
      'Service': /\bservice\b|\bmicroservice\b|\bworker\b/,
      'Cache': /\bcache\b|\bredis\b|\bmemcached\b/,
      'Queue': /\bqueue\b|\bmessage\b|\bevent\b|\bpubsub\b/
    };
    
    for (const [component, pattern] of Object.entries(componentPatterns)) {
      if (pattern.test(text)) {
        components.add(component);
      }
    }
    
    return Array.from(components);
  }
  
  /**
   * Analyze business impact
   */
  private async analyzeBusinessImpact(story: any): Promise<string[]> {
    const impacts = [];
    const text = this.storyToText(story).toLowerCase();
    
    if (text.includes('customer') || text.includes('user')) {
      impacts.push('Direct customer impact');
    }
    
    if (text.includes('revenue') || text.includes('sales') || text.includes('conversion')) {
      impacts.push('Revenue impact');
    }
    
    if (text.includes('compliance') || text.includes('regulation') || text.includes('gdpr')) {
      impacts.push('Compliance requirement');
    }
    
    if (text.includes('performance') || text.includes('speed') || text.includes('optimization')) {
      impacts.push('Performance improvement');
    }
    
    if (story.priority === 'critical' || story.priority === 'high') {
      impacts.push('High priority business need');
    }
    
    return impacts;
  }
  
  /**
   * Estimate complexity
   */
  private async estimateComplexity(story: any, context: any): Promise<number> {
    let complexity = 5; // Base complexity
    
    // Adjust based on technical components
    complexity += context.technicalComponents.length * 0.5;
    
    // Adjust based on acceptance criteria
    if (story.acceptanceCriteria) {
      complexity += story.acceptanceCriteria.length * 0.3;
    }
    
    // Adjust based on required skills
    complexity += context.requiredSkills.length * 0.4;
    
    // Adjust based on type
    if (story.type === 'spike') complexity += 3;
    if (story.type === 'technical') complexity += 2;
    if (story.type === 'bug') complexity -= 1;
    
    // Cap at reasonable values
    return Math.min(21, Math.max(1, Math.round(complexity)));
  }
  
  /**
   * Suggest acceptance criteria
   */
  private async suggestAcceptanceCriteria(story: any): Promise<string[]> {
    const suggestions = [];
    
    if (story.type === 'feature') {
      suggestions.push('User can successfully complete the primary action');
      suggestions.push('System displays appropriate feedback messages');
      suggestions.push('Feature works across supported browsers/devices');
    }
    
    if (story.type === 'bug') {
      suggestions.push('Bug no longer reproduces in affected scenarios');
      suggestions.push('Regression tests pass');
      suggestions.push('No new issues introduced');
    }
    
    const text = this.storyToText(story).toLowerCase();
    
    if (text.includes('form') || text.includes('input')) {
      suggestions.push('Form validation works correctly');
      suggestions.push('Error messages are clear and helpful');
    }
    
    if (text.includes('api') || text.includes('endpoint')) {
      suggestions.push('API returns correct status codes');
      suggestions.push('Response format matches specification');
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }
  
  /**
   * Suggest technical considerations
   */
  private async suggestTechnicalConsiderations(story: any, components: string[]): Promise<string[]> {
    const considerations = [];
    
    if (components.includes('API')) {
      considerations.push('Consider API versioning strategy');
      considerations.push('Implement proper error handling');
      considerations.push('Add rate limiting if needed');
    }
    
    if (components.includes('Database')) {
      considerations.push('Ensure database queries are optimized');
      considerations.push('Consider indexing strategy');
      considerations.push('Plan for data migration if schema changes');
    }
    
    if (components.includes('Authentication')) {
      considerations.push('Implement secure token management');
      considerations.push('Consider session timeout policies');
      considerations.push('Add audit logging for auth events');
    }
    
    if (components.includes('UI Component')) {
      considerations.push('Ensure accessibility standards (WCAG)');
      considerations.push('Test responsive design');
      considerations.push('Consider loading states and error handling');
    }
    
    return considerations.slice(0, 4);
  }
  
  /**
   * Suggest dependencies
   */
  private async suggestDependencies(story: any, context: any): Promise<string[]> {
    const dependencies = [];
    
    if (context.technicalComponents.includes('Authentication') && story.type === 'feature') {
      dependencies.push('Requires authentication system to be in place');
    }
    
    if (context.technicalComponents.includes('API')) {
      dependencies.push('May depend on API design/specification');
    }
    
    if (context.technicalComponents.includes('Database')) {
      dependencies.push('May require database schema updates');
    }
    
    if (story.priority === 'high' || story.priority === 'critical') {
      dependencies.push('May block other high-priority items');
    }
    
    return dependencies;
  }
  
  /**
   * Identify risks
   */
  private async identifyRisks(story: any, context: any): Promise<string[]> {
    const risks = [];
    
    if (context.estimatedComplexity > 13) {
      risks.push('High complexity may lead to delays');
    }
    
    if (context.requiredSkills.length > 3) {
      risks.push('Requires multiple skill sets - resource availability risk');
    }
    
    if (story.type === 'spike') {
      risks.push('Research outcome uncertain - may need follow-up work');
    }
    
    if (context.businessImpact.includes('Compliance requirement')) {
      risks.push('Compliance deadline risk if delayed');
    }
    
    if (!story.acceptanceCriteria || story.acceptanceCriteria.length === 0) {
      risks.push('Unclear acceptance criteria - scope creep risk');
    }
    
    return risks;
  }
  
  /**
   * Calculate similarity between stories
   */
  async calculateSimilarity(story1: any, story2: any): Promise<number> {
    const embedding1 = await this.generateSemanticEmbedding(this.storyToText(story1));
    const embedding2 = await this.generateSemanticEmbedding(this.storyToText(story2));
    
    // Cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
  
  /**
   * Find similar stories
   */
  async findSimilarStories(story: any, allStories: any[], threshold: number = 0.7): Promise<any[]> {
    const similar = [];
    
    for (const otherStory of allStories) {
      if (otherStory === story) continue;
      
      const similarity = await this.calculateSimilarity(story, otherStory);
      if (similarity >= threshold) {
        similar.push({
          story: otherStory,
          similarity
        });
      }
    }
    
    return similar.sort((a, b) => b.similarity - a.similarity);
  }
}

// Export singleton instance
export const contextEmbedder = new ContextEmbedder();