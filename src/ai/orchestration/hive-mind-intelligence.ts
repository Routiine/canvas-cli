/**
 * Hive-Mind Intelligence System
 * Central "Queen" AI that orchestrates and directs specialized worker agents
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as os from 'os';
import { AgentMemory } from '../../agents/memory/agent-memory.js';

// Worker agent types
export enum WorkerType {
  SCOUT = 'scout',           // Information gathering
  BUILDER = 'builder',        // Code generation
  ANALYST = 'analyst',        // Data analysis
  GUARDIAN = 'guardian',      // Security and validation
  OPTIMIZER = 'optimizer',    // Performance optimization
  HEALER = 'healer',         // Bug fixing
  ARCHITECT = 'architect',    // System design
  COMMUNICATOR = 'communicator', // Inter-agent communication
  HARVESTER = 'harvester',    // Resource collection
  SENTINEL = 'sentinel'       // Monitoring and alerting
}

// Worker state
export enum WorkerState {
  IDLE = 'idle',
  ASSIGNED = 'assigned',
  WORKING = 'working',
  REPORTING = 'reporting',
  RESTING = 'resting',
  FAILED = 'failed'
}

// Task priority levels
export enum TaskPriority {
  CRITICAL = 0,
  URGENT = 1,
  HIGH = 2,
  NORMAL = 3,
  LOW = 4
}

interface WorkerAgent {
  id: string;
  type: WorkerType;
  state: WorkerState;
  capabilities: string[];
  performance: {
    tasksCompleted: number;
    successRate: number;
    averageTime: number;
    specialization: Map<string, number>;
  };
  currentTask?: HiveTask;
  health: number; // 0-100
  load: number; // 0-100
  memory: AgentMemory;
}

interface HiveTask {
  id: string;
  type: string;
  priority: TaskPriority;
  objective: string;
  requirements: string[];
  constraints: {
    timeLimit?: number;
    resourceLimit?: number;
    qualityThreshold?: number;
  };
  dependencies: string[];
  assignedWorkers: string[];
  status: 'pending' | 'assigned' | 'in-progress' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface HiveStrategy {
  name: string;
  description: string;
  applicableWhen: (state: HiveState) => boolean;
  execute: (queen: QueenAI, task: HiveTask) => Promise<void>;
  priority: number;
}

interface HiveState {
  health: number;
  efficiency: number;
  taskQueueSize: number;
  activeWorkers: number;
  idleWorkers: number;
  completedTasks: number;
  failedTasks: number;
  resourceUtilization: number;
  threatLevel: number;
}

interface CollectiveIntelligence {
  knowledgeBase: Map<string, any>;
  sharedMemory: Map<string, any>;
  patterns: Map<string, Pattern>;
  strategies: Map<string, HiveStrategy>;
  consensus: Map<string, number>;
}

interface Pattern {
  id: string;
  type: 'success' | 'failure' | 'optimization';
  trigger: string;
  response: string;
  frequency: number;
  effectiveness: number;
}

export class QueenAI extends EventEmitter {
  private workers: Map<string, WorkerAgent> = new Map();
  private taskQueue: HiveTask[] = [];
  private executingTasks: Map<string, HiveTask> = new Map();
  private completedTasks: Map<string, HiveTask> = new Map();
  private strategies: Map<string, HiveStrategy> = new Map();
  private collectiveIntelligence: CollectiveIntelligence;
  private hiveState: HiveState;
  private decisionHistory: Decision[] = [];
  private pheromoneTrails: Map<string, PheromoneTrail> = new Map();
  
  constructor() {
    super();
    
    this.collectiveIntelligence = {
      knowledgeBase: new Map(),
      sharedMemory: new Map(),
      patterns: new Map(),
      strategies: new Map(),
      consensus: new Map()
    };
    
    this.hiveState = {
      health: 100,
      efficiency: 100,
      taskQueueSize: 0,
      activeWorkers: 0,
      idleWorkers: 0,
      completedTasks: 0,
      failedTasks: 0,
      resourceUtilization: 0,
      threatLevel: 0
    };
    
    this.initializeStrategies();
    this.initializeWorkers();
    this.startHiveOperations();
  }
  
  private initializeStrategies(): void {
    // Divide and Conquer Strategy
    this.strategies.set('divide-conquer', {
      name: 'Divide and Conquer',
      description: 'Break complex tasks into smaller subtasks',
      applicableWhen: (state) => state.taskQueueSize > 5 && state.idleWorkers > 3,
      execute: async (queen, task) => {
        const subtasks = queen.decomposeTask(task);
        for (const subtask of subtasks) {
          await queen.assignTask(subtask);
        }
      },
      priority: 1
    });
    
    // Swarm Strategy
    this.strategies.set('swarm', {
      name: 'Swarm Attack',
      description: 'Multiple workers collaborate on a single task',
      applicableWhen: (state) => state.idleWorkers > 5,
      execute: async (queen, task) => {
        const workers = queen.selectWorkers(task, 5);
        await queen.coordinateSwarm(workers, task);
      },
      priority: 2
    });
    
    // Specialist Strategy
    this.strategies.set('specialist', {
      name: 'Specialist Assignment',
      description: 'Assign task to the most qualified worker',
      applicableWhen: (state) => true,
      execute: async (queen, task) => {
        const specialist = queen.findSpecialist(task);
        if (specialist) {
          await queen.assignToWorker(specialist, task);
        }
      },
      priority: 3
    });
    
    // Emergency Response Strategy
    this.strategies.set('emergency', {
      name: 'Emergency Response',
      description: 'All hands on deck for critical tasks',
      applicableWhen: (state) => state.threatLevel > 7 || state.health < 30,
      execute: async (queen, task) => {
        queen.activateEmergencyProtocol(task);
      },
      priority: 0
    });
    
    // Learning Strategy
    this.strategies.set('learning', {
      name: 'Adaptive Learning',
      description: 'Learn from task patterns and optimize',
      applicableWhen: (state) => state.completedTasks > 10,
      execute: async (queen, task) => {
        const pattern = queen.identifyPattern(task);
        if (pattern) {
          await queen.applyPattern(pattern, task);
        }
      },
      priority: 4
    });
  }
  
  private initializeWorkers(): void {
    // Create diverse worker pool
    const workerConfigs = [
      { type: WorkerType.SCOUT, count: 3 },
      { type: WorkerType.BUILDER, count: 5 },
      { type: WorkerType.ANALYST, count: 3 },
      { type: WorkerType.GUARDIAN, count: 2 },
      { type: WorkerType.OPTIMIZER, count: 2 },
      { type: WorkerType.HEALER, count: 2 },
      { type: WorkerType.ARCHITECT, count: 1 },
      { type: WorkerType.COMMUNICATOR, count: 2 },
      { type: WorkerType.HARVESTER, count: 3 },
      { type: WorkerType.SENTINEL, count: 2 }
    ];
    
    for (const config of workerConfigs) {
      for (let i = 0; i < config.count; i++) {
        const worker = this.createWorker(config.type);
        this.workers.set(worker.id, worker);
      }
    }
    
    this.emit('hive:initialized', { workerCount: this.workers.size });
  }
  
  private createWorker(type: WorkerType): WorkerAgent {
    const workerId = `${type}_${crypto.randomBytes(4).toString('hex')}`;
    
    return {
      id: workerId,
      type,
      state: WorkerState.IDLE,
      capabilities: this.getWorkerCapabilities(type),
      performance: {
        tasksCompleted: 0,
        successRate: 1.0,
        averageTime: 0,
        specialization: new Map()
      },
      health: 100,
      load: 0,
      memory: new AgentMemory(workerId)
    };
  }
  
  private getWorkerCapabilities(type: WorkerType): string[] {
    const capabilities: Record<WorkerType, string[]> = {
      [WorkerType.SCOUT]: ['search', 'analyze', 'report', 'explore'],
      [WorkerType.BUILDER]: ['generate', 'construct', 'implement', 'test'],
      [WorkerType.ANALYST]: ['analyze', 'predict', 'optimize', 'report'],
      [WorkerType.GUARDIAN]: ['validate', 'secure', 'protect', 'audit'],
      [WorkerType.OPTIMIZER]: ['optimize', 'refactor', 'improve', 'benchmark'],
      [WorkerType.HEALER]: ['diagnose', 'fix', 'recover', 'heal'],
      [WorkerType.ARCHITECT]: ['design', 'plan', 'structure', 'blueprint'],
      [WorkerType.COMMUNICATOR]: ['coordinate', 'translate', 'broadcast', 'sync'],
      [WorkerType.HARVESTER]: ['collect', 'extract', 'process', 'store'],
      [WorkerType.SENTINEL]: ['monitor', 'alert', 'detect', 'respond']
    };
    
    return capabilities[type] || [];
  }
  
  private startHiveOperations(): void {
    // Main hive operation loop
    setInterval(() => {
      this.updateHiveState();
      this.processTaskQueue();
      this.monitorWorkerHealth();
      this.optimizeResourceAllocation();
      void this.updateCollectiveIntelligence();
    }, 1000);
    
    this.emit('hive:operational');
  }
  
  // Queen's Core Decision Making
  async makeDecision(situation: any): Promise<Decision> {
    const decision: Decision = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      situation,
      options: [],
      chosen: null,
      reasoning: '',
      confidence: 0
    };
    
    // Analyze situation
    const analysis = await this.analyzeSituation(situation);
    
    // Generate options
    decision.options = await this.generateOptions(analysis);
    
    // Evaluate options using collective intelligence
    const evaluations = await this.evaluateOptions(decision.options, analysis);
    
    // Choose best option
    decision.chosen = this.selectBestOption(evaluations);
    decision.reasoning = this.explainDecision(decision.chosen, evaluations);
    decision.confidence = evaluations.get(decision.chosen) || 0;
    
    // Record decision
    this.decisionHistory.push(decision);
    
    // Learn from decision
    this.updateDecisionPatterns(decision);
    
    this.emit('decision:made', decision);
    
    return decision;
  }
  
  // Task Management
  async submitTask(task: Omit<HiveTask, 'id' | 'status' | 'createdAt'>): Promise<string> {
    const hiveTask: HiveTask = {
      ...task,
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: new Date(),
      assignedWorkers: []
    };
    
    // Analyze task complexity
    const complexity = this.analyzeTaskComplexity(hiveTask);
    
    // Determine strategy
    const strategy = this.selectStrategy(hiveTask, complexity);
    
    if (strategy) {
      await strategy.execute(this, hiveTask);
    } else {
      // Default assignment
      this.taskQueue.push(hiveTask);
    }
    
    this.emit('task:submitted', hiveTask);
    
    return hiveTask.id;
  }
  
  private analyzeTaskComplexity(task: HiveTask): number {
    let complexity = 0;
    
    // Factor in requirements
    complexity += task.requirements.length * 2;
    
    // Factor in dependencies
    complexity += task.dependencies.length * 3;
    
    // Factor in constraints
    if (task.constraints.timeLimit) complexity += 5;
    if (task.constraints.resourceLimit) complexity += 3;
    if (task.constraints.qualityThreshold) complexity += 4;
    
    // Factor in priority
    complexity += (5 - task.priority) * 2;
    
    return complexity;
  }
  
  private selectStrategy(task: HiveTask, complexity: number): HiveStrategy | null {
    const applicableStrategies = Array.from(this.strategies.values())
      .filter(s => s.applicableWhen(this.hiveState))
      .sort((a, b) => a.priority - b.priority);
    
    return applicableStrategies[0] || null;
  }
  
  private async assignTask(task: HiveTask): Promise<void> {
    const worker = this.findBestWorker(task);
    
    if (worker) {
      await this.assignToWorker(worker, task);
    } else {
      // Queue for later
      this.taskQueue.push(task);
    }
  }
  
  private findBestWorker(task: HiveTask): WorkerAgent | null {
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.state === WorkerState.IDLE && w.health > 50);
    
    if (availableWorkers.length === 0) return null;
    
    // Score workers based on capability match
    const scores = availableWorkers.map(worker => {
      let score = 0;
      
      // Capability match
      for (const req of task.requirements) {
        if (worker.capabilities.includes(req)) score += 10;
      }
      
      // Specialization bonus
      const specialization = worker.performance.specialization.get(task.type) || 0;
      score += specialization * 5;
      
      // Performance bonus
      score += worker.performance.successRate * 10;
      
      // Health factor
      score += worker.health / 10;
      
      // Load penalty
      score -= worker.load / 10;
      
      return { worker, score };
    });
    
    // Return highest scoring worker
    scores.sort((a, b) => b.score - a.score);
    return scores[0]?.worker || null;
  }
  
  private async assignToWorker(worker: WorkerAgent, task: HiveTask): Promise<void> {
    worker.state = WorkerState.ASSIGNED;
    worker.currentTask = task;
    worker.load = Math.min(100, worker.load + 20);
    
    task.status = 'assigned';
    task.assignedWorkers.push(worker.id);
    task.startedAt = new Date();
    
    this.executingTasks.set(task.id, task);
    
    // Simulate work execution
    void this.executeWork(worker, task);
    
    this.emit('task:assigned', { worker: worker.id, task: task.id });
  }
  
  private async executeWork(worker: WorkerAgent, task: HiveTask): Promise<void> {
    worker.state = WorkerState.WORKING;
    task.status = 'in-progress';
    
    // Simulate work with timeout
    const timeout = task.constraints.timeLimit || 30000;
    
    setTimeout(async () => {
      try {
        // Simulate work completion
        const result = await this.simulateWork(worker, task);
        
        task.result = result;
        task.status = 'completed';
        task.completedAt = new Date();
        
        // Update worker performance
        worker.performance.tasksCompleted++;
        const taskTime = task.completedAt.getTime() - task.startedAt!.getTime();
        worker.performance.averageTime = 
          (worker.performance.averageTime * (worker.performance.tasksCompleted - 1) + taskTime) / 
          worker.performance.tasksCompleted;
        
        // Update specialization
        const currentSpec = worker.performance.specialization.get(task.type) || 0;
        worker.performance.specialization.set(task.type, currentSpec + 1);
        
        // Move to completed
        this.completedTasks.set(task.id, task);
        this.executingTasks.delete(task.id);
        
        // Free worker
        worker.state = WorkerState.IDLE;
        worker.currentTask = undefined;
        worker.load = Math.max(0, worker.load - 20);
        
        // Update hive state
        this.hiveState.completedTasks++;
        
        // Learn from success
        this.recordSuccess(worker, task);
        
        this.emit('task:completed', { worker: worker.id, task: task.id, result });
        
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : String(error);
        
        // Update worker performance
        worker.performance.successRate *= 0.95;
        
        // Free worker
        worker.state = WorkerState.FAILED;
        worker.health -= 10;
        worker.load = Math.max(0, worker.load - 20);
        
        // Update hive state
        this.hiveState.failedTasks++;
        
        // Learn from failure
        this.recordFailure(worker, task);
        
        this.emit('task:failed', { worker: worker.id, task: task.id, error });
      }
    }, Math.random() * timeout);
  }
  
  private async simulateWork(worker: WorkerAgent, task: HiveTask): Promise<any> {
    // Simulate different types of work based on worker type
    switch (worker.type) {
      case WorkerType.SCOUT:
        return { data: 'Information gathered', sources: ['source1', 'source2'] };
      
      case WorkerType.BUILDER:
        return { code: 'Generated code', tests: 'Test suite' };
      
      case WorkerType.ANALYST:
        return { analysis: 'Data analysis', insights: ['insight1', 'insight2'] };
      
      default:
        return { result: 'Work completed' };
    }
  }
  
  // Swarm Coordination
  private async coordinateSwarm(workers: WorkerAgent[], task: HiveTask): Promise<void> {
    this.emit('swarm:forming', { workers: workers.map(w => w.id), task: task.id });
    
    // Create swarm communication channel
    const swarmChannel = `swarm_${task.id}`;
    
    // Assign roles within swarm
    const leader = workers[0];
    const supporters = workers.slice(1);
    
    // Leader coordinates
    leader.state = WorkerState.WORKING;
    leader.currentTask = task;
    
    // Supporters assist
    for (const supporter of supporters) {
      supporter.state = WorkerState.WORKING;
      supporter.currentTask = task;
      
      // Share context through pheromone trail
      this.createPheromoneTrail(swarmChannel, {
        task: task.id,
        leader: leader.id,
        objective: task.objective
      });
    }
    
    // Execute swarm task
    void this.executeSwarmTask(workers, task);
  }
  
  private async executeSwarmTask(workers: WorkerAgent[], task: HiveTask): Promise<void> {
    // Parallel execution with coordination
    const results = await Promise.all(
      workers.map(worker => this.simulateWork(worker, task))
    );
    
    // Aggregate results
    task.result = this.aggregateSwarmResults(results);
    task.status = 'completed';
    
    // Update all workers
    for (const worker of workers) {
      worker.state = WorkerState.IDLE;
      worker.currentTask = undefined;
      worker.performance.tasksCompleted++;
    }
    
    this.emit('swarm:completed', { task: task.id, result: task.result });
  }
  
  private aggregateSwarmResults(results: any[]): any {
    // Combine results from swarm
    return {
      combined: results,
      consensus: this.findConsensus(results),
      quality: this.assessQuality(results)
    };
  }
  
  // Pattern Recognition and Learning
  private identifyPattern(task: HiveTask): Pattern | null {
    // Look for similar completed tasks
    const similar = Array.from(this.completedTasks.values())
      .filter(t => t.type === task.type && t.status === 'completed')
      .slice(-10); // Last 10 similar tasks
    
    if (similar.length < 3) return null;
    
    // Identify common successful approaches
    const successPatterns = similar
      .filter(t => !t.error)
      .map(t => ({
        workers: t.assignedWorkers,
        time: t.completedAt!.getTime() - t.startedAt!.getTime(),
        strategy: this.inferStrategy(t)
      }));
    
    if (successPatterns.length > 0) {
      const pattern: Pattern = {
        id: crypto.randomUUID(),
        type: 'success',
        trigger: task.type,
        response: successPatterns[0].strategy,
        frequency: successPatterns.length,
        effectiveness: 0.8
      };
      
      this.collectiveIntelligence.patterns.set(pattern.id, pattern);
      return pattern;
    }
    
    return null;
  }
  
  private async applyPattern(pattern: Pattern, task: HiveTask): Promise<void> {
    // Apply learned pattern to new task
    const strategy = this.strategies.get(pattern.response);
    
    if (strategy) {
      await strategy.execute(this, task);
      
      // Update pattern effectiveness based on outcome
      setTimeout(() => {
        if (task.status === 'completed') {
          pattern.effectiveness = Math.min(1, pattern.effectiveness * 1.1);
        } else {
          pattern.effectiveness = Math.max(0, pattern.effectiveness * 0.9);
        }
      }, 60000); // Check after 1 minute
    }
  }
  
  // Collective Intelligence Updates
  private async updateCollectiveIntelligence(): Promise<void> {
    // Aggregate worker knowledge
    for (const worker of this.workers.values()) {
      const knowledge = await worker.memory.getRecentMemories(undefined, 10);

      for (const mem of knowledge) {
        const key = `${worker.type}_${mem.type}`;
        const current = this.collectiveIntelligence.knowledgeBase.get(key) || [];
        current.push(mem);
        this.collectiveIntelligence.knowledgeBase.set(key, current);
      }
    }
    
    // Update consensus on strategies
    for (const [name, strategy] of this.strategies.entries()) {
      const effectiveness = this.calculateStrategyEffectiveness(name);
      this.collectiveIntelligence.consensus.set(name, effectiveness);
    }
    
    // Prune ineffective patterns
    for (const [id, pattern] of this.collectiveIntelligence.patterns.entries()) {
      if (pattern.effectiveness < 0.3) {
        this.collectiveIntelligence.patterns.delete(id);
      }
    }
  }
  
  // Resource Management
  private optimizeResourceAllocation(): void {
    // Balance worker loads
    const overloadedWorkers = Array.from(this.workers.values())
      .filter(w => w.load > 80);
    
    const underutilizedWorkers = Array.from(this.workers.values())
      .filter(w => w.load < 20 && w.state === WorkerState.IDLE);
    
    // Redistribute tasks if possible
    for (const overloaded of overloadedWorkers) {
      if (overloaded.currentTask && underutilizedWorkers.length > 0) {
        const helper = underutilizedWorkers.shift()!;
        
        // Add helper to task
        overloaded.currentTask.assignedWorkers.push(helper.id);
        helper.currentTask = overloaded.currentTask;
        helper.state = WorkerState.WORKING;
        helper.load += 30;
        
        this.emit('resource:rebalanced', { 
          from: overloaded.id, 
          to: helper.id,
          task: overloaded.currentTask.id
        });
      }
    }
  }
  
  // Health Monitoring
  private monitorWorkerHealth(): void {
    for (const worker of this.workers.values()) {
      // Recover health for idle workers
      if (worker.state === WorkerState.IDLE) {
        worker.health = Math.min(100, worker.health + 1);
      }
      
      // Reduce health for overworked workers
      if (worker.load > 90) {
        worker.health = Math.max(0, worker.health - 2);
      }
      
      // Force rest for exhausted workers
      if (worker.health < 20) {
        worker.state = WorkerState.RESTING;
        worker.currentTask = undefined;
        
        this.emit('worker:resting', { worker: worker.id, health: worker.health });
      }
      
      // Return rested workers to duty
      if (worker.state === WorkerState.RESTING && worker.health > 80) {
        worker.state = WorkerState.IDLE;
        
        this.emit('worker:recovered', { worker: worker.id });
      }
    }
  }
  
  // State Management
  private updateHiveState(): void {
    const workers = Array.from(this.workers.values());
    
    this.hiveState.activeWorkers = workers.filter(w => 
      w.state === WorkerState.WORKING || w.state === WorkerState.ASSIGNED
    ).length;
    
    this.hiveState.idleWorkers = workers.filter(w => 
      w.state === WorkerState.IDLE
    ).length;
    
    this.hiveState.taskQueueSize = this.taskQueue.length;
    
    // Calculate overall health
    const avgHealth = workers.reduce((sum, w) => sum + w.health, 0) / workers.length;
    this.hiveState.health = avgHealth;
    
    // Calculate efficiency
    const successRate = this.hiveState.completedTasks / 
      (this.hiveState.completedTasks + this.hiveState.failedTasks || 1);
    this.hiveState.efficiency = successRate * 100;
    
    // Calculate resource utilization
    const avgLoad = workers.reduce((sum, w) => sum + w.load, 0) / workers.length;
    this.hiveState.resourceUtilization = avgLoad;
    
    // Detect threats
    this.detectThreats();
  }
  
  private detectThreats(): void {
    let threatLevel = 0;
    
    // High failure rate
    if (this.hiveState.efficiency < 50) threatLevel += 3;
    
    // Low health
    if (this.hiveState.health < 50) threatLevel += 2;
    
    // Task queue overflow
    if (this.hiveState.taskQueueSize > 50) threatLevel += 2;
    
    // No idle workers
    if (this.hiveState.idleWorkers === 0) threatLevel += 3;
    
    this.hiveState.threatLevel = Math.min(10, threatLevel);
    
    if (threatLevel > 7) {
      this.emit('threat:detected', { level: threatLevel });
    }
  }
  
  // Emergency Protocols
  private activateEmergencyProtocol(task: HiveTask): void {
    this.emit('emergency:activated', { task: task.id });
    
    // Wake all resting workers
    for (const worker of this.workers.values()) {
      if (worker.state === WorkerState.RESTING) {
        worker.state = WorkerState.IDLE;
        worker.health = Math.max(50, worker.health); // Emergency boost
      }
    }
    
    // Reassign all workers to critical task
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.state === WorkerState.IDLE || w.load < 50);
    
    void this.coordinateSwarm(availableWorkers, task);
  }
  
  // Helper Methods
  private decomposeTask(task: HiveTask): HiveTask[] {
    // Break task into subtasks
    const subtasks: HiveTask[] = [];
    
    for (const req of task.requirements) {
      subtasks.push({
        id: crypto.randomUUID(),
        type: `${task.type}_sub`,
        priority: task.priority,
        objective: `${req} for ${task.objective}`,
        requirements: [req],
        constraints: { ...task.constraints },
        dependencies: [],
        assignedWorkers: [],
        status: 'pending',
        createdAt: new Date()
      });
    }
    
    return subtasks;
  }
  
  private selectWorkers(task: HiveTask, count: number): WorkerAgent[] {
    return Array.from(this.workers.values())
      .filter(w => w.state === WorkerState.IDLE)
      .sort((a, b) => b.health - a.health)
      .slice(0, count);
  }
  
  private findSpecialist(task: HiveTask): WorkerAgent | null {
    return Array.from(this.workers.values())
      .filter(w => w.state === WorkerState.IDLE)
      .sort((a, b) => {
        const aSpec = a.performance.specialization.get(task.type) || 0;
        const bSpec = b.performance.specialization.get(task.type) || 0;
        return bSpec - aSpec;
      })[0] || null;
  }
  
  private processTaskQueue(): void {
    while (this.taskQueue.length > 0 && this.hiveState.idleWorkers > 0) {
      const task = this.taskQueue.shift()!;
      void this.assignTask(task);
    }
  }
  
  private createPheromoneTrail(channel: string, data: any): void {
    this.pheromoneTrails.set(channel, {
      id: channel,
      data,
      strength: 1.0,
      timestamp: new Date()
    });
    
    // Decay over time
    setTimeout(() => {
      const trail = this.pheromoneTrails.get(channel);
      if (trail) {
        trail.strength *= 0.9;
        if (trail.strength < 0.1) {
          this.pheromoneTrails.delete(channel);
        }
      }
    }, 10000);
  }
  
  private recordSuccess(worker: WorkerAgent, task: HiveTask): void {
    const memory = {
      task: task.id,
      approach: this.inferStrategy(task),
      timestamp: new Date()
    };

    void worker.memory.addMemory('learning', memory);
  }

  private recordFailure(worker: WorkerAgent, task: HiveTask): void {
    const memory = {
      task: task.id,
      error: task.error,
      timestamp: new Date()
    };

    void worker.memory.addMemory('error', memory);
  }
  
  private inferStrategy(task: HiveTask): string {
    if (task.assignedWorkers.length > 3) return 'swarm';
    if (task.assignedWorkers.length === 1) return 'specialist';
    return 'standard';
  }
  
  private findConsensus(results: any[]): any {
    // Simple consensus - most common result
    const counts = new Map();
    
    for (const result of results) {
      const key = JSON.stringify(result);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    
    let maxCount = 0;
    let consensus = results[0];
    
    for (const [key, count] of counts.entries()) {
      if (count > maxCount) {
        maxCount = count as number;
        consensus = JSON.parse(key);
      }
    }
    
    return consensus;
  }
  
  private assessQuality(results: any[]): number {
    // Assess quality based on consensus
    const consensus = this.findConsensus(results);
    let agreementCount = 0;
    
    for (const result of results) {
      if (JSON.stringify(result) === JSON.stringify(consensus)) {
        agreementCount++;
      }
    }
    
    return agreementCount / results.length;
  }
  
  private calculateStrategyEffectiveness(strategyName: string): number {
    const relevantTasks = Array.from(this.completedTasks.values())
      .filter(t => this.inferStrategy(t) === strategyName);
    
    if (relevantTasks.length === 0) return 0.5;
    
    const successCount = relevantTasks.filter(t => t.status === 'completed').length;
    return successCount / relevantTasks.length;
  }
  
  private async analyzeSituation(situation: any): Promise<any> {
    // Analyze the situation using collective intelligence
    return {
      complexity: this.assessComplexity(situation),
      urgency: this.assessUrgency(situation),
      resources: this.assessResources(situation),
      risks: this.assessRisks(situation)
    };
  }
  
  private async generateOptions(analysis: any): Promise<any[]> {
    // Generate decision options based on analysis
    const options = [];
    
    // Always include standard options
    options.push({
      action: 'delegate',
      description: 'Delegate to specialized worker'
    });
    
    options.push({
      action: 'swarm',
      description: 'Deploy swarm for rapid completion'
    });
    
    if (analysis.complexity > 7) {
      options.push({
        action: 'decompose',
        description: 'Break into smaller tasks'
      });
    }
    
    if (analysis.urgency > 8) {
      options.push({
        action: 'emergency',
        description: 'Activate emergency protocol'
      });
    }
    
    return options;
  }
  
  private async evaluateOptions(options: any[], analysis: any): Promise<Map<any, number>> {
    const evaluations = new Map();
    
    for (const option of options) {
      let score = 0;
      
      // Evaluate based on analysis
      if (option.action === 'swarm' && this.hiveState.idleWorkers > 5) {
        score += 0.8;
      }
      
      if (option.action === 'decompose' && analysis.complexity > 7) {
        score += 0.9;
      }
      
      if (option.action === 'emergency' && analysis.urgency > 8) {
        score += 1.0;
      }
      
      evaluations.set(option, score);
    }
    
    return evaluations;
  }
  
  private selectBestOption(evaluations: Map<any, number>): any {
    let bestOption = null;
    let bestScore = -1;
    
    for (const [option, score] of evaluations.entries()) {
      if (score > bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }
    
    return bestOption;
  }
  
  private explainDecision(chosen: any, evaluations: Map<any, number>): string {
    const score = evaluations.get(chosen) || 0;
    return `Selected ${chosen.action} with confidence ${score.toFixed(2)}: ${chosen.description}`;
  }
  
  private updateDecisionPatterns(decision: Decision): void {
    // Learn from decision outcomes
    setTimeout(() => {
      // Check if decision was successful
      const success = Math.random() > 0.3; // Simulate success
      
      if (success) {
        const pattern: Pattern = {
          id: crypto.randomUUID(),
          type: 'success',
          trigger: JSON.stringify(decision.situation),
          response: decision.chosen.action,
          frequency: 1,
          effectiveness: decision.confidence
        };
        
        this.collectiveIntelligence.patterns.set(pattern.id, pattern);
      }
    }, 60000); // Check after 1 minute
  }
  
  private assessComplexity(situation: any): number {
    // Assess situation complexity
    return Math.random() * 10;
  }
  
  private assessUrgency(situation: any): number {
    // Assess situation urgency
    return Math.random() * 10;
  }
  
  private assessResources(situation: any): any {
    // Assess available resources
    return {
      workers: this.hiveState.idleWorkers,
      memory: process.memoryUsage().heapUsed,
      cpu: os.loadavg()[0]
    };
  }
  
  private assessRisks(situation: any): any[] {
    // Assess potential risks
    return [
      { type: 'failure', probability: 0.1 },
      { type: 'timeout', probability: 0.2 },
      { type: 'resource_exhaustion', probability: 0.05 }
    ];
  }
  
  // Public API
  
  getHiveStatus(): HiveState {
    return { ...this.hiveState };
  }
  
  getWorkerStatus(workerId: string): WorkerAgent | undefined {
    return this.workers.get(workerId);
  }
  
  getAllWorkers(): WorkerAgent[] {
    return Array.from(this.workers.values());
  }
  
  getTaskStatus(taskId: string): HiveTask | undefined {
    return this.executingTasks.get(taskId) || 
           this.completedTasks.get(taskId) ||
           this.taskQueue.find(t => t.id === taskId);
  }
  
  getCollectiveKnowledge(): any {
    return {
      patterns: Array.from(this.collectiveIntelligence.patterns.values()),
      consensus: Array.from(this.collectiveIntelligence.consensus.entries()),
      knowledgeSize: this.collectiveIntelligence.knowledgeBase.size
    };
  }
}

// Supporting interfaces
interface Decision {
  id: string;
  timestamp: Date;
  situation: any;
  options: any[];
  chosen: any;
  reasoning: string;
  confidence: number;
}

interface PheromoneTrail {
  id: string;
  data: any;
  strength: number;
  timestamp: Date;
}

// Export singleton instance
export const queenAI = new QueenAI();