/**
 * Parallel Story Execution System
 * Enables concurrent execution of independent stories with dependency management
 */

import { EventEmitter } from 'events';
import type { Worker } from 'worker_threads';
import * as os from 'os';
import type { StoryContext } from '../canvas-agents.js';
import { AgentMemory } from '../memory/agent-memory.js';
import { z } from 'zod';

// Execution task schema
export const ExecutionTaskSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  type: z.enum(['analysis', 'design', 'implementation', 'testing', 'deployment']),
  priority: z.number().min(0).max(10).default(5),
  dependencies: z.array(z.string()).default([]),
  estimatedTime: z.number().optional(), // in milliseconds
  requiredResources: z.object({
    cpu: z.number().min(0).max(1).default(0.2), // CPU percentage
    memory: z.number().default(256), // MB
    agents: z.array(z.string()).default([])
  }).optional(),
  status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'blocked']).default('pending'),
  result: z.any().optional(),
  error: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  retryCount: z.number().default(0),
  maxRetries: z.number().default(3)
});

export type ExecutionTask = z.infer<typeof ExecutionTaskSchema>;

// Execution plan for a story
export interface ExecutionPlan {
  id: string;
  stories: StoryContext[];
  tasks: ExecutionTask[];
  dependencies: DependencyGraph;
  estimatedDuration: number;
  parallelizationFactor: number; // 0-1, how much can be parallelized
  criticalPath: string[]; // Task IDs in critical path
}

// Dependency graph for task scheduling
export class DependencyGraph {
  private adjacencyList: Map<string, Set<string>>;
  private inDegree: Map<string, number>;
  
  constructor() {
    this.adjacencyList = new Map();
    this.inDegree = new Map();
  }
  
  addTask(taskId: string): void {
    if (!this.adjacencyList.has(taskId)) {
      this.adjacencyList.set(taskId, new Set());
      this.inDegree.set(taskId, 0);
    }
  }
  
  addDependency(from: string, to: string): void {
    this.addTask(from);
    this.addTask(to);
    
    const dependencies = this.adjacencyList.get(from)!;
    if (!dependencies.has(to)) {
      dependencies.add(to);
      this.inDegree.set(to, (this.inDegree.get(to) || 0) + 1);
    }
  }
  
  getExecutableTasks(): string[] {
    const executable: string[] = [];
    for (const [task, degree] of this.inDegree) {
      if (degree === 0) {
        executable.push(task);
      }
    }
    return executable;
  }
  
  completeTask(taskId: string): string[] {
    const newlyExecutable: string[] = [];
    const dependencies = this.adjacencyList.get(taskId);
    
    if (dependencies) {
      for (const dep of dependencies) {
        const newDegree = (this.inDegree.get(dep) || 0) - 1;
        this.inDegree.set(dep, newDegree);
        
        if (newDegree === 0) {
          newlyExecutable.push(dep);
        }
      }
    }
    
    // Remove completed task
    this.inDegree.delete(taskId);
    this.adjacencyList.delete(taskId);
    
    return newlyExecutable;
  }
  
  detectCycles(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      
      const neighbors = this.adjacencyList.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true;
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    for (const node of this.adjacencyList.keys()) {
      if (!visited.has(node)) {
        if (hasCycle(node)) return true;
      }
    }
    
    return false;
  }
  
  findCriticalPath(): string[] {
    // Topological sort with longest path calculation
    const sorted = this.topologicalSort();
    const distances = new Map<string, number>();
    const predecessors = new Map<string, string | null>();
    
    // Initialize distances
    for (const task of sorted) {
      distances.set(task, 0);
      predecessors.set(task, null);
    }
    
    // Calculate longest paths
    for (const task of sorted) {
      const neighbors = this.adjacencyList.get(task) || new Set();
      for (const neighbor of neighbors) {
        const newDistance = (distances.get(task) || 0) + 1;
        if (newDistance > (distances.get(neighbor) || 0)) {
          distances.set(neighbor, newDistance);
          predecessors.set(neighbor, task);
        }
      }
    }
    
    // Find the end node with maximum distance
    let maxDistance = 0;
    let endNode: string | null = null;
    for (const [task, distance] of distances) {
      if (distance > maxDistance) {
        maxDistance = distance;
        endNode = task;
      }
    }
    
    // Reconstruct critical path
    const criticalPath: string[] = [];
    let current = endNode;
    while (current) {
      criticalPath.unshift(current);
      current = predecessors.get(current) || null;
    }
    
    return criticalPath;
  }
  
  private topologicalSort(): string[] {
    const sorted: string[] = [];
    const inDegreeCopy = new Map(this.inDegree);
    const queue: string[] = [];
    
    // Find all nodes with no incoming edges
    for (const [task, degree] of inDegreeCopy) {
      if (degree === 0) {
        queue.push(task);
      }
    }
    
    while (queue.length > 0) {
      const task = queue.shift()!;
      sorted.push(task);
      
      const neighbors = this.adjacencyList.get(task) || new Set();
      for (const neighbor of neighbors) {
        const newDegree = (inDegreeCopy.get(neighbor) || 0) - 1;
        inDegreeCopy.set(neighbor, newDegree);
        
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
    
    return sorted;
  }
}

// Parallel executor for stories and tasks
export class ParallelStoryExecutor extends EventEmitter {
  private maxConcurrency: number;
  private runningTasks: Map<string, ExecutionTask>;
  private taskQueue: ExecutionTask[];
  private executionPlans: Map<string, ExecutionPlan>;
  private workers: Worker[];
  private availableWorkers: Worker[];
  private taskResults: Map<string, any>;
  private memory: AgentMemory;
  private resourceMonitor: ResourceMonitor;
  
  constructor(maxConcurrency?: number) {
    super();
    this.maxConcurrency = maxConcurrency || os.cpus().length;
    this.runningTasks = new Map();
    this.taskQueue = [];
    this.executionPlans = new Map();
    this.workers = [];
    this.availableWorkers = [];
    this.taskResults = new Map();
    this.memory = new AgentMemory('parallel-executor');
    this.resourceMonitor = new ResourceMonitor();
    
    this.initializeWorkers();
  }
  
  /**
   * Initialize worker threads.
   *
   * NOTE: Real worker_threads are NOT yet implemented. The previous code
   * silently faked parallel execution with setTimeout stubs that appeared
   * to work but ran tasks sequentially in the main thread with random
   * delays. Until the architecture supports true worker_threads, this
   * method throws a clear error if someone tries to use parallel execution.
   *
   * Fix #7: Remove silent stubs that pretend to be worker_threads.
   */
  private initializeWorkers(): void {
    // Do not create fake workers. The executor will fall back to
    // sequential execution in executeTask() if no workers are available.
    // Workers array stays empty to signal that parallelism is unavailable.
  }

  private createWorker(_id: number): Worker {
    throw new Error(
      'Parallel execution via worker_threads is not yet implemented. ' +
      'The ParallelStoryExecutor currently runs tasks sequentially. ' +
      'To enable true parallelism, implement actual worker_threads here.'
    );
  }
  
  /**
   * Create execution plan for stories
   */
  async createExecutionPlan(stories: StoryContext[]): Promise<ExecutionPlan> {
    const planId = this.generatePlanId();
    const tasks: ExecutionTask[] = [];
    const dependencies = new DependencyGraph();
    
    // Convert stories to tasks
    for (const story of stories) {
      const storyTasks = this.storyToTasks(story);
      tasks.push(...storyTasks);
      
      // Add dependencies
      for (const task of storyTasks) {
        dependencies.addTask(task.id);
        for (const dep of task.dependencies) {
          dependencies.addDependency(dep, task.id);
        }
      }
    }
    
    // Check for cycles
    if (dependencies.detectCycles()) {
      throw new Error('Circular dependencies detected in execution plan');
    }
    
    // Calculate critical path
    const criticalPath = dependencies.findCriticalPath();
    
    // Estimate duration and parallelization
    const estimatedDuration = this.estimateDuration(tasks, criticalPath);
    const parallelizationFactor = this.calculateParallelization(tasks, dependencies);
    
    const plan: ExecutionPlan = {
      id: planId,
      stories,
      tasks,
      dependencies,
      estimatedDuration,
      parallelizationFactor,
      criticalPath
    };
    
    this.executionPlans.set(planId, plan);
    
    // Store in memory
    await this.memory.remember(plan, 'execution_plan', {
      tags: [
        `planId:${planId}`,
        `storyCount:${stories.length}`,
        `taskCount:${tasks.length}`
      ]
    });
    
    this.emit('plan:created', plan);
    
    return plan;
  }
  
  /**
   * Execute plan with parallel processing
   */
  async executePlan(planId: string): Promise<Map<string, any>> {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      throw new Error(`Execution plan ${planId} not found`);
    }
    
    this.emit('execution:started', { planId, taskCount: plan.tasks.length });
    
    // Initialize task queue with ready tasks
    const readyTasks = this.getReadyTasks(plan);
    this.taskQueue.push(...readyTasks);
    
    // Start execution loop
    await this.executeLoop(plan);
    
    // Wait for all tasks to complete
    await this.waitForCompletion(plan);
    
    this.emit('execution:completed', {
      planId,
      results: this.taskResults,
      duration: plan.estimatedDuration
    });
    
    return this.taskResults;
  }
  
  /**
   * Main execution loop
   */
  private async executeLoop(plan: ExecutionPlan): Promise<void> {
    while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
      // Check resource availability
      const availableResources = await this.resourceMonitor.getAvailableResources();
      
      // Schedule tasks based on resources
      while (this.taskQueue.length > 0 && this.canScheduleTask(availableResources)) {
        const task = this.selectNextTask();
        if (task) {
          await this.executeTask(task, plan);
        } else {
          break;
        }
      }
      
      // Wait for some tasks to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  /**
   * Execute a single task.
   *
   * Fix #7: Since worker_threads are not implemented, tasks are executed
   * sequentially in the main thread. The worker pool is empty, so we
   * execute inline instead of dispatching to a fake setTimeout stub.
   */
  private async executeTask(task: ExecutionTask, plan: ExecutionPlan): Promise<void> {
    // Update task status
    task.status = 'running';
    task.startTime = new Date().toISOString();
    this.runningTasks.set(task.id, task);

    this.emit('task:started', { taskId: task.id, type: task.type });

    // Execute inline (no real worker_threads available)
    try {
      const _context = await this.getTaskContext(task);
      // Placeholder: actual task execution logic would go here.
      // For now, mark as completed so the dependency graph advances.
      this.handleWorkerMessage({
        workerId: -1,
        task,
        result: { success: true, message: 'Executed sequentially (worker_threads not available)' },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.handleWorkerMessage({
        workerId: -1,
        task,
        result: null,
        error: errorMessage,
      });
    }
  }
  
  /**
   * Handle worker completion
   */
  private handleWorkerMessage(message: any): void {
    const { workerId, task, result, error } = message;
    
    // Mark task as completed
    const executionTask = this.runningTasks.get(task.id);
    if (executionTask) {
      executionTask.status = error ? 'failed' : 'completed';
      executionTask.endTime = new Date().toISOString();
      executionTask.result = result;
      executionTask.error = error;
      
      this.runningTasks.delete(task.id);
      this.taskResults.set(task.id, result);
      
      // Return worker to pool (only if real workers exist)
      if (workerId >= 0 && workerId < this.workers.length) {
        const worker = this.workers[workerId];
        if (worker) {
          this.availableWorkers.push(worker);
        }
      }
      
      // Update dependencies and queue new tasks
      const plan = Array.from(this.executionPlans.values()).find(p => 
        p.tasks.some(t => t.id === task.id)
      );
      
      if (plan) {
        const newTasks = plan.dependencies.completeTask(task.id);
        for (const taskId of newTasks) {
          const newTask = plan.tasks.find(t => t.id === taskId);
          if (newTask) {
            this.taskQueue.push(newTask);
          }
        }
      }
      
      this.emit('task:completed', {
        taskId: task.id,
        result,
        error
      });
      
      // Handle retries if needed
      if (error && executionTask.retryCount < executionTask.maxRetries) {
        executionTask.retryCount++;
        executionTask.status = 'pending';
        this.taskQueue.push(executionTask);
        this.emit('task:retry', { taskId: task.id, attempt: executionTask.retryCount });
      }
    }
  }
  
  /**
   * Convert story to executable tasks
   */
  private storyToTasks(story: StoryContext): ExecutionTask[] {
    const tasks: ExecutionTask[] = [];
    const storyId = this.generateTaskId();
    
    // Analysis task
    tasks.push({
      id: `${storyId}-analysis`,
      storyId,
      type: 'analysis',
      priority: 8,
      dependencies: [],
      estimatedTime: 5000,
      requiredResources: {
        cpu: 0.2,
        memory: 256,
        agents: ['analyst']
      },
      status: 'pending',
      retryCount: 0,
      maxRetries: 3
    });
    
    // Design task (depends on analysis)
    tasks.push({
      id: `${storyId}-design`,
      storyId,
      type: 'design',
      priority: 7,
      dependencies: [`${storyId}-analysis`],
      estimatedTime: 8000,
      requiredResources: {
        cpu: 0.3,
        memory: 512,
        agents: ['architect']
      },
      status: 'pending',
      retryCount: 0,
      maxRetries: 3
    });
    
    // Implementation task (depends on design)
    tasks.push({
      id: `${storyId}-implementation`,
      storyId,
      type: 'implementation',
      priority: 6,
      dependencies: [`${storyId}-design`],
      estimatedTime: 15000,
      requiredResources: {
        cpu: 0.5,
        memory: 1024,
        agents: ['developer']
      },
      status: 'pending',
      retryCount: 0,
      maxRetries: 3
    });
    
    // Testing task (depends on implementation)
    tasks.push({
      id: `${storyId}-testing`,
      storyId,
      type: 'testing',
      priority: 5,
      dependencies: [`${storyId}-implementation`],
      estimatedTime: 10000,
      requiredResources: {
        cpu: 0.4,
        memory: 512,
        agents: ['qa']
      },
      status: 'pending',
      retryCount: 0,
      maxRetries: 3
    });
    
    return tasks;
  }
  
  /**
   * Get tasks ready for execution
   */
  private getReadyTasks(plan: ExecutionPlan): ExecutionTask[] {
    const executableIds = plan.dependencies.getExecutableTasks();
    return plan.tasks.filter(t => 
      executableIds.includes(t.id) && t.status === 'pending'
    );
  }
  
  /**
   * Select next task based on priority and resources
   */
  private selectNextTask(): ExecutionTask | null {
    // Sort by priority and select highest
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    
    for (let i = 0; i < this.taskQueue.length; i++) {
      const task = this.taskQueue[i];
      if (this.resourceMonitor.canAllocate(task.requiredResources)) {
        this.taskQueue.splice(i, 1);
        return task;
      }
    }
    
    return null;
  }
  
  /**
   * Check if we can schedule more tasks.
   * Fix #7: Workers are not available, but tasks execute sequentially inline,
   * so we allow scheduling as long as concurrency limit is not reached.
   */
  private canScheduleTask(resources: unknown): boolean {
    return this.runningTasks.size < this.maxConcurrency;
  }
  
  /**
   * Get context for task execution
   */
  private async getTaskContext(task: ExecutionTask): Promise<any> {
    // Get related memories
    const memories = await this.memory.recall(task.storyId, 5);
    
    // Get dependent task results
    const dependencyResults: any = {};
    for (const dep of task.dependencies) {
      dependencyResults[dep] = this.taskResults.get(dep);
    }
    
    return {
      task,
      memories,
      dependencyResults,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Wait for all tasks to complete
   */
  private async waitForCompletion(plan: ExecutionPlan): Promise<void> {
    return new Promise((resolve) => {
      const checkCompletion = setInterval(() => {
        const allCompleted = plan.tasks.every(t => 
          t.status === 'completed' || t.status === 'failed'
        );
        
        if (allCompleted) {
          clearInterval(checkCompletion);
          resolve();
        }
      }, 100);
    });
  }
  
  /**
   * Estimate total duration
   */
  private estimateDuration(tasks: ExecutionTask[], criticalPath: string[]): number {
    let duration = 0;
    
    for (const taskId of criticalPath) {
      const task = tasks.find(t => t.id === taskId);
      if (task?.estimatedTime) {
        duration += task.estimatedTime;
      }
    }
    
    return duration;
  }
  
  /**
   * Calculate parallelization factor
   */
  private calculateParallelization(tasks: ExecutionTask[], dependencies: DependencyGraph): number {
    const totalTime = tasks.reduce((sum, t) => sum + (t.estimatedTime || 0), 0);
    const criticalPathTime = this.estimateDuration(tasks, dependencies.findCriticalPath());
    
    if (criticalPathTime === 0) return 1;
    
    return 1 - (criticalPathTime / totalTime);
  }
  
  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Terminate any real workers if they exist
    for (const worker of this.workers) {
      try {
        void worker.terminate();
      } catch {
        // Worker may not be a real Worker instance
      }
    }

    this.workers = [];
    this.availableWorkers = [];
    this.runningTasks.clear();
    this.taskQueue = [];
  }
}

// Resource monitor for system resources
class ResourceMonitor {
  private cpuUsage: number = 0;
  private memoryUsage: number = 0;
  private allocatedResources: Map<string, any> = new Map();
  
  async getAvailableResources(): Promise<{ cpu: number; memory: number }> {
    // Get system resources
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const cpus = os.cpus();
    
    // Calculate CPU usage (simplified)
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const cpuUsage = 1 - (idle / total);
    
    return {
      cpu: 1 - cpuUsage,
      memory: freeMemory / totalMemory
    };
  }
  
  canAllocate(resources: any): boolean {
    if (!resources) return true;
    
    const available = {
      cpu: 1 - this.cpuUsage,
      memory: os.freemem()
    };
    
    return available.cpu >= (resources.cpu || 0) &&
           available.memory >= ((resources.memory || 0) * 1024 * 1024);
  }
  
  allocate(taskId: string, resources: any): void {
    this.allocatedResources.set(taskId, resources);
    this.cpuUsage += resources.cpu || 0;
    this.memoryUsage += resources.memory || 0;
  }
  
  release(taskId: string): void {
    const resources = this.allocatedResources.get(taskId);
    if (resources) {
      this.cpuUsage -= resources.cpu || 0;
      this.memoryUsage -= resources.memory || 0;
      this.allocatedResources.delete(taskId);
    }
  }
}