/**
 * Dependency Management System
 * Analyzes and manages dependencies between user stories
 */

import { EventEmitter } from 'events';
import chalk from 'chalk';

export interface Dependency {
  fromStoryId: string;
  toStoryId: string;
  type: 'blocks' | 'blocked-by' | 'relates-to' | 'duplicates' | 'parent-child';
  strength: 'strong' | 'medium' | 'weak';
  description?: string;
  autoDetected: boolean;
  confidence: number;
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Dependency[];
  cycles: string[][];
  criticalPath: string[];
  orphans: string[];
  roots: string[];
  leaves: string[];
}

export interface DependencyNode {
  id: string;
  story: any;
  incomingDeps: Set<string>;
  outgoingDeps: Set<string>;
  level: number;
  criticalityScore: number;
}

export interface DependencyAnalysis {
  graph: DependencyGraph;
  issues: DependencyIssue[];
  recommendations: string[];
  metrics: {
    totalDependencies: number;
    averageDependencies: number;
    maxDependencyChain: number;
    cycleCount: number;
    orphanCount: number;
    criticalPathLength: number;
  };
}

export interface DependencyIssue {
  type: 'cycle' | 'orphan' | 'bottleneck' | 'chain-too-long';
  severity: 'high' | 'medium' | 'low';
  affectedStories: string[];
  description: string;
  suggestion: string;
}

/**
 * Dependency Manager Implementation
 */
export class DependencyManager extends EventEmitter {
  private dependencies: Map<string, Dependency[]> = new Map();
  private graph: DependencyGraph | null = null;
  
  constructor() {
    super();
  }
  
  /**
   * Analyze dependencies between stories
   */
  async analyze(stories: any[]): Promise<Dependency[]> {
    console.log(chalk.dim('    🔗 Analyzing dependencies...'));
    
    const dependencies: Dependency[] = [];
    
    // Detect dependencies based on various criteria
    for (let i = 0; i < stories.length; i++) {
      for (let j = i + 1; j < stories.length; j++) {
        const story1 = stories[i];
        const story2 = stories[j];
        
        // Check for explicit dependencies
        const explicitDeps = this.findExplicitDependencies(story1, story2);
        dependencies.push(...explicitDeps);
        
        // Check for implicit dependencies
        const implicitDeps = await this.findImplicitDependencies(story1, story2);
        dependencies.push(...implicitDeps);
        
        // Check for technical dependencies
        const technicalDeps = this.findTechnicalDependencies(story1, story2);
        dependencies.push(...technicalDeps);
      }
    }
    
    // Build dependency graph
    this.graph = this.buildDependencyGraph(stories, dependencies);
    
    // Store dependencies
    for (const dep of dependencies) {
      if (!this.dependencies.has(dep.fromStoryId)) {
        this.dependencies.set(dep.fromStoryId, []);
      }
      this.dependencies.get(dep.fromStoryId)!.push(dep);
    }
    
    this.emit('dependencies-analyzed', { dependencies, count: dependencies.length });
    
    return dependencies;
  }
  
  /**
   * Find explicit dependencies mentioned in stories
   */
  private findExplicitDependencies(story1: any, story2: any): Dependency[] {
    const dependencies: Dependency[] = [];
    
    // Check if story1 mentions story2
    const story1Text = this.storyToText(story1).toLowerCase();
    const story2Text = this.storyToText(story2).toLowerCase();
    
    // Look for explicit dependency keywords
    const dependencyPhrases = [
      'depends on',
      'requires',
      'needs',
      'blocked by',
      'after',
      'prerequisite'
    ];
    
    for (const phrase of dependencyPhrases) {
      if (story1Text.includes(phrase) && this.storiesRelated(story1Text, story2)) {
        dependencies.push({
          fromStoryId: story1.id,
          toStoryId: story2.id,
          type: 'blocked-by',
          strength: 'strong',
          description: `Story explicitly mentions dependency: "${phrase}"`,
          autoDetected: true,
          confidence: 0.9
        });
      }
    }
    
    // Check for parent-child relationships
    if (story1.epic === story2.id || story2.epic === story1.id) {
      dependencies.push({
        fromStoryId: story1.epic === story2.id ? story1.id : story2.id,
        toStoryId: story1.epic === story2.id ? story2.id : story1.id,
        type: 'parent-child',
        strength: 'strong',
        description: 'Epic-story relationship',
        autoDetected: true,
        confidence: 1.0
      });
    }
    
    return dependencies;
  }
  
  /**
   * Find implicit dependencies based on content analysis
   */
  private async findImplicitDependencies(story1: any, story2: any): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    
    // Check for data dependencies
    if (this.hasDataDependency(story1, story2)) {
      dependencies.push({
        fromStoryId: story1.id,
        toStoryId: story2.id,
        type: 'blocks',
        strength: 'medium',
        description: 'Data dependency detected',
        autoDetected: true,
        confidence: 0.7
      });
    }
    
    // Check for UI/UX dependencies
    if (this.hasUIDependency(story1, story2)) {
      dependencies.push({
        fromStoryId: story1.id,
        toStoryId: story2.id,
        type: 'relates-to',
        strength: 'medium',
        description: 'UI/UX dependency detected',
        autoDetected: true,
        confidence: 0.6
      });
    }
    
    // Check for workflow dependencies
    if (this.hasWorkflowDependency(story1, story2)) {
      dependencies.push({
        fromStoryId: story2.id,
        toStoryId: story1.id,
        type: 'blocks',
        strength: 'strong',
        description: 'Workflow dependency detected',
        autoDetected: true,
        confidence: 0.8
      });
    }
    
    return dependencies;
  }
  
  /**
   * Find technical dependencies
   */
  private findTechnicalDependencies(story1: any, story2: any): Dependency[] {
    const dependencies: Dependency[] = [];
    
    // Check for API dependencies
    if (this.hasAPIDependency(story1, story2)) {
      dependencies.push({
        fromStoryId: story1.id,
        toStoryId: story2.id,
        type: 'blocks',
        strength: 'strong',
        description: 'API dependency detected',
        autoDetected: true,
        confidence: 0.85
      });
    }
    
    // Check for database schema dependencies
    if (this.hasSchemaDependency(story1, story2)) {
      dependencies.push({
        fromStoryId: story1.id,
        toStoryId: story2.id,
        type: 'blocks',
        strength: 'strong',
        description: 'Database schema dependency',
        autoDetected: true,
        confidence: 0.9
      });
    }
    
    // Check for infrastructure dependencies
    if (this.hasInfrastructureDependency(story1, story2)) {
      dependencies.push({
        fromStoryId: story2.id,
        toStoryId: story1.id,
        type: 'blocks',
        strength: 'medium',
        description: 'Infrastructure dependency',
        autoDetected: true,
        confidence: 0.75
      });
    }
    
    return dependencies;
  }
  
  /**
   * Build dependency graph
   */
  private buildDependencyGraph(stories: any[], dependencies: Dependency[]): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    
    // Create nodes
    for (const story of stories) {
      nodes.set(story.id, {
        id: story.id,
        story,
        incomingDeps: new Set(),
        outgoingDeps: new Set(),
        level: 0,
        criticalityScore: 0
      });
    }
    
    // Add edges
    for (const dep of dependencies) {
      const fromNode = nodes.get(dep.fromStoryId);
      const toNode = nodes.get(dep.toStoryId);
      
      if (fromNode && toNode) {
        fromNode.outgoingDeps.add(dep.toStoryId);
        toNode.incomingDeps.add(dep.fromStoryId);
      }
    }
    
    // Calculate levels (topological sort)
    this.calculateLevels(nodes);
    
    // Calculate criticality scores
    this.calculateCriticality(nodes);
    
    // Find cycles
    const cycles = this.findCycles(nodes);
    
    // Find critical path
    const criticalPath = this.findCriticalPath(nodes);
    
    // Find orphans, roots, and leaves
    const orphans: string[] = [];
    const roots: string[] = [];
    const leaves: string[] = [];
    
    for (const node of nodes.values()) {
      if (node.incomingDeps.size === 0 && node.outgoingDeps.size === 0) {
        orphans.push(node.id);
      }
      if (node.incomingDeps.size === 0 && node.outgoingDeps.size > 0) {
        roots.push(node.id);
      }
      if (node.outgoingDeps.size === 0 && node.incomingDeps.size > 0) {
        leaves.push(node.id);
      }
    }
    
    return {
      nodes,
      edges: dependencies,
      cycles,
      criticalPath,
      orphans,
      roots,
      leaves
    };
  }
  
  /**
   * Calculate node levels using topological sort
   */
  private calculateLevels(nodes: Map<string, DependencyNode>): void {
    const visited = new Set<string>();
    const levels = new Map<string, number>();
    
    // Find all root nodes
    const queue: string[] = [];
    for (const node of nodes.values()) {
      if (node.incomingDeps.size === 0) {
        queue.push(node.id);
        levels.set(node.id, 0);
      }
    }
    
    // BFS to assign levels
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      
      visited.add(nodeId);
      const node = nodes.get(nodeId)!;
      const currentLevel = levels.get(nodeId) || 0;
      node.level = currentLevel;
      
      for (const depId of node.outgoingDeps) {
        const depNode = nodes.get(depId);
        if (depNode && !visited.has(depId)) {
          const newLevel = currentLevel + 1;
          const existingLevel = levels.get(depId);
          levels.set(depId, Math.max(newLevel, existingLevel || 0));
          queue.push(depId);
        }
      }
    }
  }
  
  /**
   * Calculate criticality scores
   */
  private calculateCriticality(nodes: Map<string, DependencyNode>): void {
    for (const node of nodes.values()) {
      // Base criticality on number of dependencies
      let score = node.outgoingDeps.size * 2 + node.incomingDeps.size;
      
      // Add story priority weight
      if (node.story.priority === 'critical') score += 10;
      if (node.story.priority === 'high') score += 5;
      
      // Add complexity weight
      const complexity = parseInt(node.story.complexity) || 5;
      score += complexity / 3;
      
      node.criticalityScore = score;
    }
  }
  
  /**
   * Find cycles in the dependency graph
   */
  private findCycles(nodes: Map<string, DependencyNode>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];
    
    const dfs = (nodeId: string): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);
      
      const node = nodes.get(nodeId);
      if (node) {
        for (const depId of node.outgoingDeps) {
          if (!visited.has(depId)) {
            dfs(depId);
          } else if (recursionStack.has(depId)) {
            // Found a cycle
            const cycleStart = path.indexOf(depId);
            if (cycleStart !== -1) {
              cycles.push(path.slice(cycleStart));
            }
          }
        }
      }
      
      path.pop();
      recursionStack.delete(nodeId);
    };
    
    for (const nodeId of nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }
    
    return cycles;
  }
  
  /**
   * Find critical path
   */
  private findCriticalPath(nodes: Map<string, DependencyNode>): string[] {
    let criticalPath: string[] = [];
    let maxLength = 0;
    
    const findPath = (nodeId: string, path: string[], visited: Set<string>): void => {
      if (visited.has(nodeId)) return;
      
      visited.add(nodeId);
      path.push(nodeId);
      
      const node = nodes.get(nodeId);
      if (node && node.outgoingDeps.size > 0) {
        for (const depId of node.outgoingDeps) {
          findPath(depId, [...path], new Set(visited));
        }
      } else {
        // Reached a leaf node
        if (path.length > maxLength) {
          maxLength = path.length;
          criticalPath = [...path];
        }
      }
    };
    
    // Start from all root nodes
    for (const node of nodes.values()) {
      if (node.incomingDeps.size === 0) {
        findPath(node.id, [], new Set());
      }
    }
    
    return criticalPath;
  }
  
  /**
   * Perform full dependency analysis
   */
  async performAnalysis(stories: any[]): Promise<DependencyAnalysis> {
    const dependencies = await this.analyze(stories);
    
    if (!this.graph) {
      throw new Error('Dependency graph not built');
    }
    
    const issues = this.identifyIssues();
    const recommendations = this.generateRecommendations(issues);
    
    const metrics = {
      totalDependencies: dependencies.length,
      averageDependencies: dependencies.length / Math.max(stories.length, 1),
      maxDependencyChain: this.graph.criticalPath.length,
      cycleCount: this.graph.cycles.length,
      orphanCount: this.graph.orphans.length,
      criticalPathLength: this.graph.criticalPath.length
    };
    
    return {
      graph: this.graph,
      issues,
      recommendations,
      metrics
    };
  }
  
  /**
   * Identify dependency issues
   */
  private identifyIssues(): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    
    if (!this.graph) return issues;
    
    // Check for cycles
    if (this.graph.cycles.length > 0) {
      for (const cycle of this.graph.cycles) {
        issues.push({
          type: 'cycle',
          severity: 'high',
          affectedStories: cycle,
          description: `Circular dependency detected: ${cycle.join(' → ')} → ${cycle[0]}`,
          suggestion: 'Break the cycle by refactoring stories or removing unnecessary dependencies'
        });
      }
    }
    
    // Check for orphans
    if (this.graph.orphans.length > 0) {
      issues.push({
        type: 'orphan',
        severity: 'low',
        affectedStories: this.graph.orphans,
        description: `${this.graph.orphans.length} stories have no dependencies`,
        suggestion: 'Review orphaned stories to ensure they are truly independent'
      });
    }
    
    // Check for bottlenecks
    for (const node of this.graph.nodes.values()) {
      if (node.incomingDeps.size > 5) {
        issues.push({
          type: 'bottleneck',
          severity: 'medium',
          affectedStories: [node.id],
          description: `Story "${node.id}" is blocking ${node.incomingDeps.size} other stories`,
          suggestion: 'Consider prioritizing this story or breaking it down'
        });
      }
    }
    
    // Check for long dependency chains
    if (this.graph.criticalPath.length > 5) {
      issues.push({
        type: 'chain-too-long',
        severity: 'medium',
        affectedStories: this.graph.criticalPath,
        description: `Critical path is ${this.graph.criticalPath.length} stories long`,
        suggestion: 'Consider parallelizing work or breaking down stories'
      });
    }
    
    return issues;
  }
  
  /**
   * Generate recommendations
   */
  private generateRecommendations(issues: DependencyIssue[]): string[] {
    const recommendations: string[] = [];
    
    const hasCycles = issues.some(i => i.type === 'cycle');
    const hasBottlenecks = issues.some(i => i.type === 'bottleneck');
    const hasLongChains = issues.some(i => i.type === 'chain-too-long');
    
    if (hasCycles) {
      recommendations.push('Review and resolve circular dependencies before sprint planning');
    }
    
    if (hasBottlenecks) {
      recommendations.push('Prioritize bottleneck stories in the next sprint');
      recommendations.push('Consider splitting large stories that block many others');
    }
    
    if (hasLongChains) {
      recommendations.push('Look for opportunities to parallelize work');
      recommendations.push('Break down complex stories into smaller, independent pieces');
    }
    
    if (this.graph && this.graph.orphans.length > this.graph.nodes.size * 0.5) {
      recommendations.push('Many stories appear independent - verify this is intentional');
    }
    
    return recommendations;
  }
  
  /**
   * Helper methods for dependency detection
   */
  
  private storyToText(story: any): string {
    const parts = [];
    if (story.title) parts.push(story.title);
    if (story.narrative) parts.push(story.narrative);
    if (story.asA) parts.push(story.asA);
    if (story.iWant) parts.push(story.iWant);
    if (story.soThat) parts.push(story.soThat);
    return parts.join(' ');
  }
  
  private storiesRelated(text: string, story: any): boolean {
    const storyIdentifiers = [
      story.id,
      story.title?.toLowerCase(),
      story.asA?.toLowerCase(),
      story.iWant?.toLowerCase()
    ].filter(Boolean);
    
    return storyIdentifiers.some(id => text.includes(id));
  }
  
  private hasDataDependency(story1: any, story2: any): boolean {
    const story1Text = this.storyToText(story1).toLowerCase();
    const story2Text = this.storyToText(story2).toLowerCase();
    
    // Check if both mention same data entities
    const dataKeywords = ['user', 'account', 'profile', 'order', 'product', 'payment'];
    const shared = dataKeywords.filter(keyword => 
      story1Text.includes(keyword) && story2Text.includes(keyword)
    );
    
    return shared.length > 0 && story1.type === 'feature' && story2.type === 'feature';
  }
  
  private hasUIDependency(story1: any, story2: any): boolean {
    const story1Text = this.storyToText(story1).toLowerCase();
    const story2Text = this.storyToText(story2).toLowerCase();
    
    const uiKeywords = ['page', 'screen', 'form', 'button', 'menu', 'navigation'];
    const shared = uiKeywords.filter(keyword => 
      story1Text.includes(keyword) && story2Text.includes(keyword)
    );
    
    return shared.length > 1;
  }
  
  private hasWorkflowDependency(story1: any, story2: any): boolean {
    const story1Text = this.storyToText(story1).toLowerCase();
    const story2Text = this.storyToText(story2).toLowerCase();
    
    // Check for sequential workflow indicators
    const sequence1 = ['login', 'authenticate', 'sign in'];
    const sequence2 = ['dashboard', 'home', 'profile'];
    
    const hasSeq1in1 = sequence1.some(s => story1Text.includes(s));
    const hasSeq2in2 = sequence2.some(s => story2Text.includes(s));
    
    return hasSeq1in1 && hasSeq2in2;
  }
  
  private hasAPIDependency(story1: any, story2: any): boolean {
    const story1Text = this.storyToText(story1).toLowerCase();
    const story2Text = this.storyToText(story2).toLowerCase();
    
    const hasAPI1 = story1Text.includes('api') || story1Text.includes('endpoint');
    const hasAPI2 = story2Text.includes('api') || story2Text.includes('endpoint');
    
    const consumesAPI = story1Text.includes('call') || story1Text.includes('fetch') || story1Text.includes('request');
    const providesAPI = story2Text.includes('create') || story2Text.includes('implement') || story2Text.includes('expose');
    
    return hasAPI1 && hasAPI2 && consumesAPI && providesAPI;
  }
  
  private hasSchemaDependency(story1: any, story2: any): boolean {
    const story1Text = this.storyToText(story1).toLowerCase();
    const story2Text = this.storyToText(story2).toLowerCase();
    
    const schemaKeywords = ['database', 'table', 'schema', 'migration', 'model'];
    const hasSchema1 = schemaKeywords.some(k => story1Text.includes(k));
    const hasSchema2 = schemaKeywords.some(k => story2Text.includes(k));
    
    return hasSchema1 && hasSchema2 && story2.type === 'technical';
  }
  
  private hasInfrastructureDependency(story1: any, story2: any): boolean {
    const story1Text = this.storyToText(story1).toLowerCase();
    const story2Text = this.storyToText(story2).toLowerCase();
    
    const infraKeywords = ['deploy', 'server', 'docker', 'kubernetes', 'aws', 'azure', 'infrastructure'];
    const hasInfra1 = infraKeywords.some(k => story1Text.includes(k));
    const hasInfra2 = infraKeywords.some(k => story2Text.includes(k));
    
    return hasInfra1 && hasInfra2 && story2.type === 'technical';
  }
  
  /**
   * Get dependencies for a specific story
   */
  getDependencies(storyId: string): Dependency[] {
    return this.dependencies.get(storyId) || [];
  }
  
  /**
   * Add manual dependency
   */
  addDependency(dependency: Omit<Dependency, 'autoDetected'>): void {
    const dep: Dependency = {
      ...dependency,
      autoDetected: false
    };
    
    if (!this.dependencies.has(dep.fromStoryId)) {
      this.dependencies.set(dep.fromStoryId, []);
    }
    this.dependencies.get(dep.fromStoryId)!.push(dep);
    
    this.emit('dependency-added', { dependency: dep });
  }
  
  /**
   * Remove dependency
   */
  removeDependency(fromStoryId: string, toStoryId: string): void {
    const deps = this.dependencies.get(fromStoryId);
    if (deps) {
      const filtered = deps.filter(d => d.toStoryId !== toStoryId);
      this.dependencies.set(fromStoryId, filtered);
      this.emit('dependency-removed', { fromStoryId, toStoryId });
    }
  }
  
  /**
   * Export dependency graph to DOT format
   */
  exportToDOT(): string {
    if (!this.graph) return '';
    
    let dot = 'digraph Dependencies {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n\n';
    
    // Add nodes
    for (const node of this.graph.nodes.values()) {
      const label = node.story.title || node.id;
      const color = node.criticalityScore > 10 ? 'red' : 
                   node.criticalityScore > 5 ? 'orange' : 'green';
      dot += `  "${node.id}" [label="${label}", color=${color}];\n`;
    }
    
    dot += '\n';
    
    // Add edges
    for (const dep of this.graph.edges) {
      const style = dep.strength === 'strong' ? 'solid' : 
                   dep.strength === 'medium' ? 'dashed' : 'dotted';
      dot += `  "${dep.fromStoryId}" -> "${dep.toStoryId}" [style=${style}];\n`;
    }
    
    dot += '}\n';
    
    return dot;
  }
}

// Export singleton instance
export const dependencyManager = new DependencyManager();