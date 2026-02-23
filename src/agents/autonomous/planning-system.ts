/**
 * Planning System
 *
 * Handles task decomposition, dependency management, and execution planning
 * for the autonomous agent system.
 *
 * Features:
 * - Intelligent task decomposition
 * - Dependency graph management
 * - Critical path analysis
 * - Fallback plan generation
 * - Checkpoint-based verification points
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  ExecutionPlan,
  ExecutionStep,
  PlanMetadata,
  PlanningConfig,
  ProgressCallback
} from './types.js';
import {
  ExecutionStatus,
  TaskType,
  DEFAULT_PLANNING_CONFIG
} from './types.js';
import type { OllamaBackend } from './ollama-backend.js';
import { getOllamaBackend } from './ollama-backend.js';
import type { ReasoningEngine } from './reasoning-engine.js';
import { getReasoningEngine } from './reasoning-engine.js';

// ============================================================================
// Types
// ============================================================================

interface DecompositionResult {
  steps: Array<{
    id: string;
    description: string;
    type: TaskType;
    dependencies: string[];
    complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very_complex';
    toolsRequired: string[];
    estimatedTokens?: number;
  }>;
  reasoning: string;
}

interface DependencyNode {
  stepId: string;
  dependencies: Set<string>;
  dependents: Set<string>;
  level: number;
}

// ============================================================================
// Planning System
// ============================================================================

export class PlanningSystem extends EventEmitter {
  private config: PlanningConfig;
  private ollama: OllamaBackend;
  private reasoning: ReasoningEngine;
  private activePlans: Map<string, ExecutionPlan> = new Map();

  constructor(config: Partial<PlanningConfig> = {}) {
    super();
    this.config = { ...DEFAULT_PLANNING_CONFIG, ...config };
    this.ollama = getOllamaBackend();
    this.reasoning = getReasoningEngine();
  }

  // ==========================================================================
  // Main Planning Interface
  // ==========================================================================

  async createPlan(
    goal: string,
    context: string,
    onProgress?: ProgressCallback
  ): Promise<ExecutionPlan> {
    const planId = uuidv4();
    const startTime = new Date();

    this.emit('planning_started', { planId, goal });
    onProgress?.(0, 'Starting plan creation');

    try {
      // Step 1: Decompose the goal into steps
      onProgress?.(0.2, 'Decomposing task');
      const decomposition = await this.decompose(goal, context);

      // Step 2: Build dependency graph
      onProgress?.(0.4, 'Building dependency graph');
      const dependencies = this.buildDependencyGraph(decomposition.steps);

      // Step 3: Calculate critical path
      onProgress?.(0.5, 'Calculating critical path');
      const criticalPath = this.calculateCriticalPath(dependencies, decomposition.steps);

      // Step 4: Identify checkpoints
      onProgress?.(0.6, 'Identifying checkpoints');
      const checkpoints = this.identifyCheckpoints(decomposition.steps, criticalPath);

      // Step 5: Generate fallback plans for complex steps
      onProgress?.(0.7, 'Generating fallback plans');
      const fallbackPlans = await this.generateFallbackPlans(
        decomposition.steps.filter(s => s.complexity === 'complex' || s.complexity === 'very_complex'),
        context
      );

      // Step 6: Analyze plan metadata
      onProgress?.(0.9, 'Analyzing plan');
      const metadata = this.analyzePlanMetadata(decomposition.steps, goal);

      // Create execution steps
      const executionSteps: ExecutionStep[] = decomposition.steps.map(step => ({
        id: step.id,
        description: step.description,
        type: step.type,
        status: ExecutionStatus.PENDING,
        dependencies: step.dependencies,
        estimatedComplexity: step.complexity,
        toolsRequired: step.toolsRequired,
        inputs: {},
        retryCount: 0,
        maxRetries: step.complexity === 'complex' || step.complexity === 'very_complex' ? 5 : 3
      }));

      // Create the plan
      const plan: ExecutionPlan = {
        id: planId,
        goal,
        steps: executionSteps,
        dependencies,
        criticalPath,
        fallbackPlans,
        checkpoints,
        createdAt: startTime,
        updatedAt: new Date(),
        metadata
      };

      this.activePlans.set(planId, plan);
      onProgress?.(1, 'Plan created');
      this.emit('planning_completed', { planId, plan });

      return plan;
    } catch (error) {
      this.emit('planning_failed', { planId, error });
      throw error;
    }
  }

  async decompose(goal: string, context: string): Promise<DecompositionResult> {
    const model = this.ollama.selectModelForCapability('planning');

    const systemPrompt = `You are an expert task decomposition system. Break down complex goals into executable steps.

Output your response in JSON format:
{
  "steps": [
    {
      "id": "step_1",
      "description": "Clear description of what to do",
      "type": "code_generation|code_analysis|code_modification|bug_fix|refactoring|testing|documentation|file_operation|shell_command|research|planning",
      "dependencies": ["step_0"],  // IDs of steps this depends on, empty for first steps
      "complexity": "trivial|simple|moderate|complex|very_complex",
      "toolsRequired": ["tool1", "tool2"],
      "estimatedTokens": 500  // Rough estimate of output tokens needed
    }
  ],
  "reasoning": "Brief explanation of why you decomposed it this way"
}

Guidelines:
- Create atomic, single-responsibility steps
- Order by dependency (independent steps first)
- Consider parallel execution opportunities
- Include verification steps after complex operations
- Maximum ${this.config.maxStepsPerPlan} steps`;

    const response = await this.ollama.generate({
      model,
      prompt: `Goal: ${goal}\n\nContext:\n${context}\n\nDecompose this goal into executable steps.`,
      system: systemPrompt,
      format: 'json',
      options: {
        temperature: 0.4,
        num_predict: 4000
      }
    });

    try {
      const result = JSON.parse(response.response);

      // Validate and fix step IDs
      const validatedSteps = this.validateAndFixSteps(result.steps || []);

      return {
        steps: validatedSteps,
        reasoning: result.reasoning || 'No reasoning provided'
      };
    } catch {
      // Fallback: create a single step for the whole goal
      return {
        steps: [{
          id: 'step_1',
          description: goal,
          type: this.inferTaskType(goal),
          dependencies: [],
          complexity: 'moderate',
          toolsRequired: ['ollama']
        }],
        reasoning: 'Failed to parse decomposition, created single step'
      };
    }
  }

  async replan(
    originalPlan: ExecutionPlan,
    failedStepId: string,
    error: string,
    context: string
  ): Promise<ExecutionPlan> {
    const planId = uuidv4();
    this.emit('replanning_started', { planId, failedStepId, error });

    try {
      const failedStep = originalPlan.steps.find(s => s.id === failedStepId);
      if (!failedStep) {
        throw new Error(`Step ${failedStepId} not found in plan`);
      }

      // Check for existing fallback plan
      if (originalPlan.fallbackPlans.has(failedStepId)) {
        const fallback = originalPlan.fallbackPlans.get(failedStepId)!;
        this.emit('using_fallback_plan', { planId, failedStepId });
        return fallback;
      }

      // Generate new plan considering the failure
      const model = this.ollama.selectModelForCapability('planning');

      const systemPrompt = `You are a replanning expert. A step in our execution plan failed. Create an alternative approach.

Original plan goal: ${originalPlan.goal}
Failed step: ${failedStep.description}
Error: ${error}

Output your response in JSON format with the same structure as the original plan.
Focus on alternative approaches that avoid the same failure.`;

      const response = await this.ollama.generate({
        model,
        prompt: `Create an alternative plan that avoids the failure.\n\nContext:\n${context}`,
        system: systemPrompt,
        format: 'json',
        options: {
          temperature: 0.5,
          num_predict: 4000
        }
      });

      const result = JSON.parse(response.response);
      const validatedSteps = this.validateAndFixSteps(result.steps || []);

      // Create new execution steps
      const executionSteps: ExecutionStep[] = validatedSteps.map(step => ({
        id: step.id,
        description: step.description,
        type: step.type,
        status: ExecutionStatus.PENDING,
        dependencies: step.dependencies,
        estimatedComplexity: step.complexity,
        toolsRequired: step.toolsRequired,
        inputs: {},
        retryCount: 0,
        maxRetries: 3
      }));

      const dependencies = this.buildDependencyGraph(validatedSteps);
      const criticalPath = this.calculateCriticalPath(dependencies, validatedSteps);

      const newPlan: ExecutionPlan = {
        id: planId,
        goal: originalPlan.goal,
        steps: executionSteps,
        dependencies,
        criticalPath,
        fallbackPlans: new Map(),
        checkpoints: this.identifyCheckpoints(validatedSteps, criticalPath),
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...originalPlan.metadata,
          riskLevel: 'medium' // Replans are inherently riskier
        }
      };

      this.activePlans.set(planId, newPlan);
      this.emit('replanning_completed', { planId, newPlan });

      return newPlan;
    } catch (error) {
      this.emit('replanning_failed', { planId, error });
      throw error;
    }
  }

  // ==========================================================================
  // Dependency Management
  // ==========================================================================

  private buildDependencyGraph(steps: DecompositionResult['steps']): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const step of steps) {
      // Validate dependencies exist
      const validDependencies = step.dependencies.filter(
        depId => steps.some(s => s.id === depId)
      );
      graph.set(step.id, validDependencies);
    }

    // Check for cycles
    if (this.hasCycle(graph)) {
      // Remove problematic dependencies to break cycles
      this.breakCycles(graph);
    }

    return graph;
  }

  private hasCycle(graph: Map<string, string[]>): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recStack.add(node);

      for (const neighbor of graph.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) return true;
      }
    }

    return false;
  }

  private breakCycles(graph: Map<string, string[]>): void {
    // Simple cycle breaking: remove back edges
    const order = this.topologicalSortWithCycles(graph);
    const position = new Map<string, number>();
    order.forEach((node, index) => position.set(node, index));

    for (const [node, deps] of graph) {
      const validDeps = deps.filter(dep => {
        const depPos = position.get(dep) ?? Infinity;
        const nodePos = position.get(node) ?? 0;
        return depPos < nodePos;
      });
      graph.set(node, validDeps);
    }
  }

  private topologicalSortWithCycles(graph: Map<string, string[]>): string[] {
    const inDegree = new Map<string, number>();
    const result: string[] = [];

    // Initialize in-degrees
    for (const node of graph.keys()) {
      inDegree.set(node, 0);
    }

    for (const deps of graph.values()) {
      for (const dep of deps) {
        inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
      }
    }

    // Process nodes with zero in-degree
    const queue = Array.from(graph.keys()).filter(n => (inDegree.get(n) || 0) === 0);

    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      for (const [target, deps] of graph) {
        if (deps.includes(node)) {
          const newDegree = (inDegree.get(target) || 1) - 1;
          inDegree.set(target, newDegree);
          if (newDegree === 0) {
            queue.push(target);
          }
        }
      }
    }

    // Add any remaining nodes (part of cycles)
    for (const node of graph.keys()) {
      if (!result.includes(node)) {
        result.push(node);
      }
    }

    return result;
  }

  // ==========================================================================
  // Critical Path Analysis
  // ==========================================================================

  private calculateCriticalPath(
    dependencies: Map<string, string[]>,
    steps: DecompositionResult['steps']
  ): string[] {
    // Calculate longest path through dependency graph
    const complexityWeight: Record<string, number> = {
      trivial: 1,
      simple: 2,
      moderate: 4,
      complex: 8,
      very_complex: 16
    };

    // Create adjacency list with reversed edges for backward pass
    const nodes = new Map<string, DependencyNode>();

    for (const step of steps) {
      nodes.set(step.id, {
        stepId: step.id,
        dependencies: new Set(dependencies.get(step.id) || []),
        dependents: new Set(),
        level: 0
      });
    }

    // Build dependents
    for (const [stepId, deps] of dependencies) {
      for (const dep of deps) {
        nodes.get(dep)?.dependents.add(stepId);
      }
    }

    // Calculate levels (distance from start)
    const startNodes = steps.filter(s => (dependencies.get(s.id) || []).length === 0);
    const queue = startNodes.map(s => s.id);
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.get(nodeId);
      if (!node) continue;

      // Update dependent levels
      for (const depId of node.dependents) {
        const dep = nodes.get(depId);
        if (dep) {
          dep.level = Math.max(dep.level, node.level + 1);
          queue.push(depId);
        }
      }
    }

    // Find path with maximum total weight
    const stepMap = new Map(steps.map(s => [s.id, s]));
    let maxWeight = 0;
    let criticalPath: string[] = [];

    const findPaths = (nodeId: string, currentPath: string[], currentWeight: number) => {
      const step = stepMap.get(nodeId);
      const weight = currentWeight + (step ? complexityWeight[step.complexity] : 1);
      const path = [...currentPath, nodeId];

      const node = nodes.get(nodeId);
      const dependents = node?.dependents || new Set();

      if (dependents.size === 0) {
        // Leaf node
        if (weight > maxWeight) {
          maxWeight = weight;
          criticalPath = path;
        }
      } else {
        for (const depId of dependents) {
          findPaths(depId, path, weight);
        }
      }
    };

    for (const startNode of startNodes) {
      findPaths(startNode.id, [], 0);
    }

    return criticalPath;
  }

  // ==========================================================================
  // Checkpoints & Fallbacks
  // ==========================================================================

  private identifyCheckpoints(
    steps: DecompositionResult['steps'],
    criticalPath: string[]
  ): string[] {
    const checkpoints: string[] = [];

    // Add checkpoint after each complex step on critical path
    for (const stepId of criticalPath) {
      const step = steps.find(s => s.id === stepId);
      if (step && (step.complexity === 'complex' || step.complexity === 'very_complex')) {
        checkpoints.push(stepId);
      }
    }

    // Add checkpoint at mid-point if no other checkpoints
    if (checkpoints.length === 0 && steps.length > 3) {
      const midIndex = Math.floor(steps.length / 2);
      checkpoints.push(steps[midIndex].id);
    }

    // Add checkpoint before final step
    if (steps.length > 1) {
      const lastStep = steps[steps.length - 1];
      if (!checkpoints.includes(lastStep.id)) {
        checkpoints.push(steps[steps.length - 2].id);
      }
    }

    return checkpoints;
  }

  private async generateFallbackPlans(
    complexSteps: DecompositionResult['steps'],
    context: string
  ): Promise<Map<string, ExecutionPlan>> {
    const fallbacks = new Map<string, ExecutionPlan>();

    // Only generate fallbacks for very complex steps to save resources
    const veryComplexSteps = complexSteps.filter(s => s.complexity === 'very_complex');

    for (const step of veryComplexSteps.slice(0, 3)) { // Limit to 3 fallback plans
      try {
        const fallbackPlan = await this.createPlan(
          `Alternative approach for: ${step.description}`,
          `Original approach may fail. ${context}`
        );
        fallbacks.set(step.id, fallbackPlan);
      } catch {
        // Skip if fallback generation fails
        this.emit('fallback_generation_failed', { stepId: step.id });
      }
    }

    return fallbacks;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private validateAndFixSteps(steps: any[]): DecompositionResult['steps'] {
    const validSteps: DecompositionResult['steps'] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Generate unique ID if missing or duplicate
      let id = step.id || `step_${i + 1}`;
      if (seenIds.has(id)) {
        id = `step_${i + 1}_${Date.now()}`;
      }
      seenIds.add(id);

      // Validate task type
      const validTypes = Object.values(TaskType);
      const type = validTypes.includes(step.type) ? step.type : TaskType.CODE_MODIFICATION;

      // Validate complexity
      const validComplexities = ['trivial', 'simple', 'moderate', 'complex', 'very_complex'];
      const complexity = validComplexities.includes(step.complexity) ? step.complexity : 'moderate';

      validSteps.push({
        id,
        description: step.description || `Step ${i + 1}`,
        type,
        dependencies: Array.isArray(step.dependencies) ? step.dependencies : [],
        complexity,
        toolsRequired: Array.isArray(step.toolsRequired) ? step.toolsRequired : [],
        estimatedTokens: typeof step.estimatedTokens === 'number' ? step.estimatedTokens : undefined
      });
    }

    return validSteps;
  }

  private inferTaskType(goal: string): TaskType {
    const lowerGoal = goal.toLowerCase();

    if (lowerGoal.includes('fix') || lowerGoal.includes('bug') || lowerGoal.includes('error')) {
      return TaskType.BUG_FIX;
    }
    if (lowerGoal.includes('test') || lowerGoal.includes('spec')) {
      return TaskType.TESTING;
    }
    if (lowerGoal.includes('refactor') || lowerGoal.includes('clean')) {
      return TaskType.REFACTORING;
    }
    if (lowerGoal.includes('document') || lowerGoal.includes('readme') || lowerGoal.includes('comment')) {
      return TaskType.DOCUMENTATION;
    }
    if (lowerGoal.includes('analyze') || lowerGoal.includes('review') || lowerGoal.includes('check')) {
      return TaskType.CODE_ANALYSIS;
    }
    if (lowerGoal.includes('create') || lowerGoal.includes('add') || lowerGoal.includes('implement') || lowerGoal.includes('generate')) {
      return TaskType.CODE_GENERATION;
    }
    if (lowerGoal.includes('run') || lowerGoal.includes('execute') || lowerGoal.includes('command')) {
      return TaskType.SHELL_COMMAND;
    }
    if (lowerGoal.includes('file') || lowerGoal.includes('move') || lowerGoal.includes('copy') || lowerGoal.includes('delete')) {
      return TaskType.FILE_OPERATION;
    }
    if (lowerGoal.includes('research') || lowerGoal.includes('find') || lowerGoal.includes('search')) {
      return TaskType.RESEARCH;
    }
    if (lowerGoal.includes('plan') || lowerGoal.includes('design') || lowerGoal.includes('architect')) {
      return TaskType.PLANNING;
    }

    return TaskType.CODE_MODIFICATION;
  }

  private analyzePlanMetadata(
    steps: DecompositionResult['steps'],
    goal: string
  ): PlanMetadata {
    // Calculate overall complexity
    const complexityScores = {
      trivial: 1,
      simple: 2,
      moderate: 3,
      complex: 4,
      very_complex: 5
    };

    const avgComplexity = steps.reduce(
      (sum, s) => sum + complexityScores[s.complexity],
      0
    ) / steps.length;

    let complexity: 'simple' | 'moderate' | 'complex';
    if (avgComplexity < 2) complexity = 'simple';
    else if (avgComplexity < 3.5) complexity = 'moderate';
    else complexity = 'complex';

    // Assess risk level
    const hasVeryComplexSteps = steps.some(s => s.complexity === 'very_complex');
    const hasFileOperations = steps.some(s => s.type === TaskType.FILE_OPERATION);
    const hasShellCommands = steps.some(s => s.type === TaskType.SHELL_COMMAND);

    let riskLevel: 'low' | 'medium' | 'high';
    if (hasVeryComplexSteps || (hasFileOperations && hasShellCommands)) {
      riskLevel = 'high';
    } else if (hasFileOperations || hasShellCommands || complexity === 'complex') {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    // Determine if approval is required
    const requiresApproval = riskLevel === 'high' ||
      hasShellCommands ||
      steps.some(s =>
        s.description.toLowerCase().includes('delete') ||
        s.description.toLowerCase().includes('git push')
      );

    // Identify affected files (would need actual code analysis for real implementation)
    const affectedFiles: string[] = [];

    // Identify potential side effects
    const potentialSideEffects: string[] = [];
    if (hasFileOperations) potentialSideEffects.push('File system changes');
    if (hasShellCommands) potentialSideEffects.push('System command execution');
    if (steps.some(s => s.type === TaskType.CODE_MODIFICATION)) {
      potentialSideEffects.push('Code changes may affect other components');
    }

    return {
      complexity,
      riskLevel,
      requiresApproval,
      affectedFiles,
      potentialSideEffects
    };
  }

  // ==========================================================================
  // Plan Execution Helpers
  // ==========================================================================

  getNextExecutableSteps(plan: ExecutionPlan): ExecutionStep[] {
    const completedIds = new Set(
      plan.steps
        .filter(s => s.status === ExecutionStatus.COMPLETED)
        .map(s => s.id)
    );

    return plan.steps.filter(step => {
      if (step.status !== ExecutionStatus.PENDING) return false;

      const deps = plan.dependencies.get(step.id) || [];
      return deps.every(depId => completedIds.has(depId));
    });
  }

  updateStepStatus(
    plan: ExecutionPlan,
    stepId: string,
    status: ExecutionStatus,
    outputs?: Record<string, unknown>,
    error?: any
  ): void {
    const step = plan.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = status;
    step.outputs = outputs;

    if (status === ExecutionStatus.IN_PROGRESS) {
      step.startTime = new Date();
    } else if (
      status === ExecutionStatus.COMPLETED ||
      status === ExecutionStatus.FAILED
    ) {
      step.endTime = new Date();
    }

    if (error) {
      step.error = {
        code: error.code || 'UNKNOWN',
        message: error.message || String(error),
        type: 'unknown',
        recoverable: true
      };
      step.retryCount++;
    }

    plan.updatedAt = new Date();
    this.emit('step_updated', { planId: plan.id, stepId, status });
  }

  isCheckpoint(plan: ExecutionPlan, stepId: string): boolean {
    return plan.checkpoints.includes(stepId);
  }

  getPlanProgress(plan: ExecutionPlan): {
    completed: number;
    total: number;
    percentage: number;
    currentStep?: string;
  } {
    const completed = plan.steps.filter(s => s.status === ExecutionStatus.COMPLETED).length;
    const inProgress = plan.steps.find(s => s.status === ExecutionStatus.IN_PROGRESS);

    return {
      completed,
      total: plan.steps.length,
      percentage: (completed / plan.steps.length) * 100,
      currentStep: inProgress?.description
    };
  }

  // ==========================================================================
  // Configuration & State
  // ==========================================================================

  updateConfig(config: Partial<PlanningConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): PlanningConfig {
    return { ...this.config };
  }

  getPlan(planId: string): ExecutionPlan | undefined {
    return this.activePlans.get(planId);
  }

  getActivePlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values());
  }

  removePlan(planId: string): boolean {
    return this.activePlans.delete(planId);
  }

  clearPlans(): void {
    this.activePlans.clear();
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let planningSystemInstance: PlanningSystem | null = null;

export function getPlanningSystem(config?: Partial<PlanningConfig>): PlanningSystem {
  if (!planningSystemInstance) {
    planningSystemInstance = new PlanningSystem(config);
  } else if (config) {
    planningSystemInstance.updateConfig(config);
  }
  return planningSystemInstance;
}

export function resetPlanningSystem(): void {
  if (planningSystemInstance) {
    planningSystemInstance.clearPlans();
    planningSystemInstance.removeAllListeners();
  }
  planningSystemInstance = null;
}
