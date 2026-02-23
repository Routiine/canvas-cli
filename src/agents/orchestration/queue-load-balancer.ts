/**
 * Queue Management and Load Balancing System
 * Advanced task queuing, prioritization, and intelligent load distribution
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import * as os from 'os';
import { performance } from 'perf_hooks';

// Queue item schema
export const QueueItemSchema = z.object({
  id: z.string(),
  type: z.enum(['task', 'story', 'agent_request', 'system']),
  priority: z.number().min(0).max(10),
  weight: z.number().min(0.1).max(10), // Resource weight
  payload: z.any(),
  metadata: z.object({
    submittedAt: z.string(),
    requester: z.string().optional(),
    deadline: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    retryCount: z.number().default(0),
    maxRetries: z.number().default(3),
    estimatedDuration: z.number().optional(), // ms
    requiredCapabilities: z.array(z.string()).optional()
  }),
  status: z.enum(['pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled']),
  assignedTo: z.string().optional(),
  result: z.any().optional(),
  error: z.string().optional()
});

export type QueueItem = z.infer<typeof QueueItemSchema>;

// Worker/Agent capacity
export interface WorkerCapacity {
  id: string;
  type: 'agent' | 'worker' | 'node';
  currentLoad: number; // 0-1
  maxCapacity: number; // Max concurrent tasks
  activeTaskCount: number;
  capabilities: string[];
  performance: {
    averageResponseTime: number;
    successRate: number;
    throughput: number;
  };
  status: 'idle' | 'busy' | 'overloaded' | 'offline';
  lastUpdate: string;
}

// Load balancing strategies
export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'round_robin',
  LEAST_CONNECTIONS = 'least_connections',
  WEIGHTED_ROUND_ROBIN = 'weighted_round_robin',
  LEAST_RESPONSE_TIME = 'least_response_time',
  CAPACITY_BASED = 'capacity_based',
  ADAPTIVE = 'adaptive'
}

// Priority queue implementation
export class PriorityQueue<T> {
  private heap: Array<{ item: T; priority: number }> = [];
  
  enqueue(item: T, priority: number): void {
    const node = { item, priority };
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }
  
  dequeue(): T | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop()!.item;
    
    const result = this.heap[0].item;
    this.heap[0] = this.heap.pop()!;
    this.bubbleDown(0);
    
    return result;
  }
  
  peek(): T | undefined {
    return this.heap[0]?.item;
  }
  
  size(): number {
    return this.heap.length;
  }
  
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      
      if (this.heap[parentIndex].priority <= this.heap[index].priority) {
        break;
      }
      
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }
  
  private bubbleDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;
      
      if (leftChild < this.heap.length && 
          this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }
      
      if (rightChild < this.heap.length && 
          this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }
      
      if (smallest === index) break;
      
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

// Advanced Queue Manager with multiple queue types
export class QueueManager extends EventEmitter {
  private queues: Map<string, PriorityQueue<QueueItem>>;
  private deadLetterQueue: QueueItem[];
  private scheduledItems: Map<string, NodeJS.Timeout>;
  private processingItems: Map<string, QueueItem>;
  private processingTimeouts: Map<string, NodeJS.Timeout>; // Track timeout handles for cleanup
  private metrics: QueueMetrics;
  private maxQueueSize: number;
  private processingTimeout: number;
  private dequeueLock: boolean = false; // Mutex for dequeue operations

  constructor(maxQueueSize: number = 10000, processingTimeout: number = 60000) {
    super();
    this.queues = new Map();
    this.deadLetterQueue = [];
    this.scheduledItems = new Map();
    this.processingItems = new Map();
    this.processingTimeouts = new Map();
    this.maxQueueSize = maxQueueSize;
    this.processingTimeout = processingTimeout;
    this.metrics = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0,
      queueDepth: 0
    };

    this.initializeQueues();
    this.startMetricsCollection();
  }

  /**
   * Acquire dequeue lock (simple mutex for single-process scenarios)
   */
  private async acquireLock(): Promise<boolean> {
    const maxWait = 5000; // 5 second max wait
    const start = Date.now();

    while (this.dequeueLock) {
      if (Date.now() - start > maxWait) {
        return false; // Timeout acquiring lock
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.dequeueLock = true;
    return true;
  }

  /**
   * Release dequeue lock
   */
  private releaseLock(): void {
    this.dequeueLock = false;
  }
  
  private initializeQueues(): void {
    // Create separate queues for different priority levels
    this.queues.set('urgent', new PriorityQueue<QueueItem>());
    this.queues.set('high', new PriorityQueue<QueueItem>());
    this.queues.set('normal', new PriorityQueue<QueueItem>());
    this.queues.set('low', new PriorityQueue<QueueItem>());
    this.queues.set('background', new PriorityQueue<QueueItem>());
  }
  
  /**
   * Enqueue an item with intelligent routing
   */
  async enqueue(item: Omit<QueueItem, 'id' | 'status'>): Promise<string> {
    const fullItem: QueueItem = {
      ...item,
      id: this.generateItemId(),
      status: 'pending'
    };
    
    // Check queue capacity
    if (this.getTotalQueueSize() >= this.maxQueueSize) {
      this.emit('queue:full', fullItem);
      throw new Error('Queue is at maximum capacity');
    }
    
    // Handle scheduled items
    if (fullItem.metadata.deadline) {
      const delay = Date.parse(fullItem.metadata.deadline) - Date.now();
      if (delay > 0) {
        this.scheduleItem(fullItem, delay);
        return fullItem.id;
      }
    }
    
    // Route to appropriate queue based on priority
    const queueName = this.getQueueName(fullItem.priority);
    const queue = this.queues.get(queueName)!;
    
    // Calculate effective priority (considering age, dependencies, etc.)
    const effectivePriority = this.calculateEffectivePriority(fullItem);
    queue.enqueue(fullItem, effectivePriority);
    
    this.metrics.totalEnqueued++;
    this.metrics.queueDepth = this.getTotalQueueSize();
    
    this.emit('item:enqueued', fullItem);
    
    return fullItem.id;
  }
  
  /**
   * Dequeue next item based on strategy (thread-safe with lock)
   */
  async dequeue(workerId: string): Promise<QueueItem | null> {
    // Acquire lock to prevent race conditions
    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      this.emit('dequeue:lock_timeout', { workerId });
      return null;
    }

    try {
      // Check queues in priority order
      const queueOrder = ['urgent', 'high', 'normal', 'low', 'background'];

      for (const queueName of queueOrder) {
        const queue = this.queues.get(queueName)!;
        const item = queue.dequeue();

        if (item) {
          item.status = 'processing';
          item.assignedTo = workerId;
          this.processingItems.set(item.id, item);

          // Set timeout for processing and track the handle for cleanup
          const timeoutHandle = setTimeout(() => {
            if (this.processingItems.has(item.id)) {
              this.handleTimeout(item);
            }
          }, this.processingTimeout);
          this.processingTimeouts.set(item.id, timeoutHandle);

          this.emit('item:dequeued', item);
          return item;
        }
      }

      return null;
    } finally {
      this.releaseLock();
    }
  }
  
  /**
   * Clear timeout handle for an item
   */
  private clearItemTimeout(itemId: string): void {
    const timeout = this.processingTimeouts.get(itemId);
    if (timeout) {
      clearTimeout(timeout);
      this.processingTimeouts.delete(itemId);
    }
  }

  /**
   * Mark item as completed
   */
  async complete(itemId: string, result: any): Promise<void> {
    const item = this.processingItems.get(itemId);
    if (!item) return;

    // Clear the timeout to prevent memory leak
    this.clearItemTimeout(itemId);

    item.status = 'completed';
    item.result = result;
    this.processingItems.delete(itemId);

    this.metrics.totalProcessed++;
    this.updateAverageProcessingTime(item);

    this.emit('item:completed', item);
  }

  /**
   * Mark item as failed
   */
  async fail(itemId: string, error: string): Promise<void> {
    const item = this.processingItems.get(itemId);
    if (!item) return;

    // Clear the timeout to prevent memory leak
    this.clearItemTimeout(itemId);

    item.status = 'failed';
    item.error = error;
    item.metadata.retryCount++;

    this.processingItems.delete(itemId);
    
    // Retry logic
    if (item.metadata.retryCount < item.metadata.maxRetries) {
      item.status = 'pending';
      await this.enqueue(item);
      this.emit('item:retry', item);
    } else {
      // Move to dead letter queue
      this.deadLetterQueue.push(item);
      this.metrics.totalFailed++;
      this.emit('item:dead_letter', item);
    }
  }
  
  /**
   * Schedule item for future execution
   */
  private scheduleItem(item: QueueItem, delay: number): void {
    const timeout = setTimeout(() => {
      this.scheduledItems.delete(item.id);
      void this.enqueue(item);
    }, delay);
    
    this.scheduledItems.set(item.id, timeout);
    item.status = 'scheduled';
    
    this.emit('item:scheduled', { item, delay });
  }
  
  /**
   * Handle processing timeout
   */
  private handleTimeout(item: QueueItem): void {
    this.processingItems.delete(item.id);
    item.metadata.retryCount++;
    
    if (item.metadata.retryCount < item.metadata.maxRetries) {
      item.status = 'pending';
      void this.enqueue(item);
      this.emit('item:timeout_retry', item);
    } else {
      item.status = 'failed';
      item.error = 'Processing timeout';
      this.deadLetterQueue.push(item);
      this.emit('item:timeout_failed', item);
    }
  }
  
  /**
   * Calculate effective priority considering various factors
   */
  private calculateEffectivePriority(item: QueueItem): number {
    let priority = item.priority;
    
    // Age factor (older items get higher priority)
    const age = Date.now() - Date.parse(item.metadata.submittedAt);
    const ageFactor = Math.min(age / (1000 * 60 * 60), 1); // Max 1 hour
    priority -= ageFactor;
    
    // Deadline factor
    if (item.metadata.deadline) {
      const timeToDeadline = Date.parse(item.metadata.deadline) - Date.now();
      if (timeToDeadline < 1000 * 60 * 5) { // Less than 5 minutes
        priority -= 2;
      }
    }
    
    // Retry factor (retried items get higher priority)
    priority -= item.metadata.retryCount * 0.5;
    
    return Math.max(0, priority);
  }
  
  private getQueueName(priority: number): string {
    if (priority <= 2) return 'urgent';
    if (priority <= 4) return 'high';
    if (priority <= 6) return 'normal';
    if (priority <= 8) return 'low';
    return 'background';
  }
  
  private getTotalQueueSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.size();
    }
    return total;
  }
  
  private updateAverageProcessingTime(item: QueueItem): void {
    const processingTime = Date.now() - Date.parse(item.metadata.submittedAt);
    const currentAvg = this.metrics.averageProcessingTime;
    const totalProcessed = this.metrics.totalProcessed;
    
    this.metrics.averageProcessingTime = 
      (currentAvg * (totalProcessed - 1) + processingTime) / totalProcessed;
  }
  
  private startMetricsCollection(): void {
    setInterval(() => {
      this.metrics.queueDepth = this.getTotalQueueSize();
      this.emit('metrics:update', this.metrics);
    }, 5000);
  }
  
  private generateItemId(): string {
    return `qi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }
  
  getDeadLetterQueue(): QueueItem[] {
    return [...this.deadLetterQueue];
  }
}

// Load Balancer
export class LoadBalancer extends EventEmitter {
  private workers: Map<string, WorkerCapacity>;
  private strategy: LoadBalancingStrategy;
  private roundRobinIndex: number = 0;
  private healthChecker: HealthChecker;
  private adaptiveOptimizer: AdaptiveOptimizer;
  private circuitBreakers: Map<string, CircuitBreaker>;
  
  constructor(strategy: LoadBalancingStrategy = LoadBalancingStrategy.ADAPTIVE) {
    super();
    this.workers = new Map();
    this.strategy = strategy;
    this.healthChecker = new HealthChecker();
    this.adaptiveOptimizer = new AdaptiveOptimizer();
    this.circuitBreakers = new Map();
    
    this.startHealthChecking();
  }
  
  /**
   * Register a worker/agent
   */
  registerWorker(worker: WorkerCapacity): void {
    this.workers.set(worker.id, worker);
    this.circuitBreakers.set(worker.id, new CircuitBreaker(worker.id));
    
    this.emit('worker:registered', worker);
  }
  
  /**
   * Select best worker for task
   */
  async selectWorker(
    item: QueueItem,
    excludeWorkers: string[] = []
  ): Promise<WorkerCapacity | null> {
    const availableWorkers = this.getAvailableWorkers(item, excludeWorkers);
    
    if (availableWorkers.length === 0) {
      return null;
    }
    
    let selected: WorkerCapacity | null = null;
    
    switch (this.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        selected = this.roundRobinSelect(availableWorkers);
        break;
        
      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        selected = this.leastConnectionsSelect(availableWorkers);
        break;
        
      case LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN:
        selected = this.weightedRoundRobinSelect(availableWorkers);
        break;
        
      case LoadBalancingStrategy.LEAST_RESPONSE_TIME:
        selected = this.leastResponseTimeSelect(availableWorkers);
        break;
        
      case LoadBalancingStrategy.CAPACITY_BASED:
        selected = this.capacityBasedSelect(availableWorkers, item);
        break;
        
      case LoadBalancingStrategy.ADAPTIVE:
        selected = await this.adaptiveSelect(availableWorkers, item);
        break;
        
      default:
        selected = availableWorkers[0];
    }
    
    if (selected) {
      // Update worker load
      selected.activeTaskCount++;
      selected.currentLoad = selected.activeTaskCount / selected.maxCapacity;
      selected.status = selected.currentLoad > 0.8 ? 'overloaded' : 
                       selected.currentLoad > 0.5 ? 'busy' : 'idle';
      selected.lastUpdate = new Date().toISOString();
      
      this.emit('worker:selected', { worker: selected, item });
    }
    
    return selected;
  }
  
  /**
   * Release worker after task completion
   */
  releaseWorker(workerId: string, success: boolean, responseTime: number): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    
    // Update worker metrics
    worker.activeTaskCount = Math.max(0, worker.activeTaskCount - 1);
    worker.currentLoad = worker.activeTaskCount / worker.maxCapacity;
    worker.status = worker.currentLoad > 0.8 ? 'overloaded' : 
                   worker.currentLoad > 0.5 ? 'busy' : 'idle';
    
    // Update performance metrics
    const metrics = worker.performance;
    metrics.throughput++;
    
    if (success) {
      metrics.successRate = (metrics.successRate * (metrics.throughput - 1) + 1) / metrics.throughput;
    } else {
      metrics.successRate = (metrics.successRate * (metrics.throughput - 1)) / metrics.throughput;
      
      // Update circuit breaker
      const breaker = this.circuitBreakers.get(workerId);
      if (breaker) {
        breaker.recordFailure();
      }
    }
    
    metrics.averageResponseTime = 
      (metrics.averageResponseTime * (metrics.throughput - 1) + responseTime) / metrics.throughput;
    
    worker.lastUpdate = new Date().toISOString();
    
    // Update adaptive optimizer
    this.adaptiveOptimizer.recordPerformance(workerId, responseTime, success);
    
    this.emit('worker:released', worker);
  }
  
  /**
   * Get available workers for task
   */
  private getAvailableWorkers(item: QueueItem, exclude: string[]): WorkerCapacity[] {
    const workers: WorkerCapacity[] = [];
    
    for (const [id, worker] of this.workers) {
      // Skip excluded workers
      if (exclude.includes(id)) continue;
      
      // Check circuit breaker
      const breaker = this.circuitBreakers.get(id);
      if (breaker && !breaker.isAvailable()) continue;
      
      // Check if worker is online and has capacity
      if (worker.status === 'offline') continue;
      if (worker.activeTaskCount >= worker.maxCapacity) continue;
      
      // Check capabilities if required
      if (item.metadata.requiredCapabilities) {
        const hasCapabilities = item.metadata.requiredCapabilities.every(cap =>
          worker.capabilities.includes(cap)
        );
        if (!hasCapabilities) continue;
      }
      
      workers.push(worker);
    }
    
    return workers;
  }
  
  private roundRobinSelect(workers: WorkerCapacity[]): WorkerCapacity {
    const selected = workers[this.roundRobinIndex % workers.length];
    this.roundRobinIndex++;
    return selected;
  }
  
  private leastConnectionsSelect(workers: WorkerCapacity[]): WorkerCapacity {
    return workers.reduce((min, worker) =>
      worker.activeTaskCount < min.activeTaskCount ? worker : min
    );
  }
  
  private weightedRoundRobinSelect(workers: WorkerCapacity[]): WorkerCapacity {
    // Weight based on capacity
    const weights = workers.map(w => w.maxCapacity - w.activeTaskCount);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < workers.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return workers[i];
      }
    }
    
    return workers[workers.length - 1];
  }
  
  private leastResponseTimeSelect(workers: WorkerCapacity[]): WorkerCapacity {
    return workers.reduce((min, worker) =>
      worker.performance.averageResponseTime < min.performance.averageResponseTime ? worker : min
    );
  }
  
  private capacityBasedSelect(workers: WorkerCapacity[], item: QueueItem): WorkerCapacity {
    // Select based on remaining capacity and item weight
    const itemWeight = item.weight;
    
    const suitable = workers.filter(w => 
      (1 - w.currentLoad) * w.maxCapacity >= itemWeight
    );
    
    if (suitable.length === 0) {
      // Fallback to least loaded
      return this.leastConnectionsSelect(workers);
    }
    
    return suitable.reduce((best, worker) => {
      const currentScore = (1 - worker.currentLoad) * worker.performance.successRate;
      const bestScore = (1 - best.currentLoad) * best.performance.successRate;
      return currentScore > bestScore ? worker : best;
    });
  }
  
  private async adaptiveSelect(workers: WorkerCapacity[], item: QueueItem): Promise<WorkerCapacity> {
    // Use machine learning-inspired approach
    const scores = await this.adaptiveOptimizer.scoreWorkers(workers, item);
    
    let bestWorker = workers[0];
    let bestScore = scores.get(workers[0].id) || 0;
    
    for (const worker of workers) {
      const score = scores.get(worker.id) || 0;
      if (score > bestScore) {
        bestScore = score;
        bestWorker = worker;
      }
    }
    
    return bestWorker;
  }
  
  private startHealthChecking(): void {
    setInterval(() => {
      for (const worker of this.workers.values()) {
        void this.healthChecker.checkWorker(worker).then(healthy => {
          if (!healthy && worker.status !== 'offline') {
            worker.status = 'offline';
            this.emit('worker:offline', worker);
          } else if (healthy && worker.status === 'offline') {
            worker.status = 'idle';
            this.emit('worker:online', worker);
          }
        });
      }
    }, 10000); // Check every 10 seconds
  }
  
  getWorkerStats(): Map<string, WorkerCapacity> {
    return new Map(this.workers);
  }
  
  setStrategy(strategy: LoadBalancingStrategy): void {
    this.strategy = strategy;
    this.emit('strategy:changed', strategy);
  }
}

// Health checker for workers
class HealthChecker {
  async checkWorker(worker: WorkerCapacity): Promise<boolean> {
    // Check if last update is recent
    const lastUpdate = Date.parse(worker.lastUpdate);
    const now = Date.now();
    
    if (now - lastUpdate > 30000) { // 30 seconds
      return false;
    }
    
    // Check success rate
    if (worker.performance.successRate < 0.5) {
      return false;
    }
    
    return true;
  }
}

// Circuit breaker for fault tolerance
class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly threshold: number = 5;
  private readonly timeout: number = 60000; // 1 minute
  
  constructor(private workerId: string) {}
  
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
  
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
    }
  }
  
  isAvailable(): boolean {
    if (this.state === 'closed') {
      return true;
    }
    
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    
    return true; // half-open
  }
}

// Adaptive optimizer for intelligent selection
class AdaptiveOptimizer {
  private performanceHistory: Map<string, PerformanceRecord[]> = new Map();
  private readonly historyLimit: number = 100;
  
  recordPerformance(workerId: string, responseTime: number, success: boolean): void {
    if (!this.performanceHistory.has(workerId)) {
      this.performanceHistory.set(workerId, []);
    }
    
    const history = this.performanceHistory.get(workerId)!;
    history.push({
      timestamp: Date.now(),
      responseTime,
      success
    });
    
    // Keep only recent history
    if (history.length > this.historyLimit) {
      history.shift();
    }
  }
  
  async scoreWorkers(workers: WorkerCapacity[], item: QueueItem): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    
    for (const worker of workers) {
      let score = 100; // Base score
      
      // Current load factor
      score *= (1 - worker.currentLoad);
      
      // Success rate factor
      score *= worker.performance.successRate;
      
      // Response time factor (inverse)
      const avgResponseTime = worker.performance.averageResponseTime || 1000;
      score *= (1000 / avgResponseTime);
      
      // Historical performance
      const history = this.performanceHistory.get(worker.id);
      if (history && history.length > 0) {
        const recentPerformance = this.calculateRecentPerformance(history);
        score *= recentPerformance;
      }
      
      // Priority boost for matching capabilities
      if (item.metadata.requiredCapabilities) {
        const matchingCaps = item.metadata.requiredCapabilities.filter(cap =>
          worker.capabilities.includes(cap)
        ).length;
        score *= (1 + matchingCaps * 0.1);
      }
      
      scores.set(worker.id, score);
    }
    
    return scores;
  }
  
  private calculateRecentPerformance(history: PerformanceRecord[]): number {
    const recent = history.slice(-10); // Last 10 records
    
    const successRate = recent.filter(r => r.success).length / recent.length;
    const avgResponseTime = recent.reduce((sum, r) => sum + r.responseTime, 0) / recent.length;
    
    // Weighted score
    return successRate * (1000 / avgResponseTime);
  }
}

// Types
interface QueueMetrics {
  totalEnqueued: number;
  totalProcessed: number;
  totalFailed: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  queueDepth: number;
}

interface PerformanceRecord {
  timestamp: number;
  responseTime: number;
  success: boolean;
}

// Resource optimizer for system-wide optimization
export class ResourceOptimizer extends EventEmitter {
  private queueManager: QueueManager;
  private loadBalancer: LoadBalancer;
  private optimizationInterval!: NodeJS.Timeout;
  private resourceMonitor: SystemResourceMonitor;
  
  constructor(queueManager: QueueManager, loadBalancer: LoadBalancer) {
    super();
    this.queueManager = queueManager;
    this.loadBalancer = loadBalancer;
    this.resourceMonitor = new SystemResourceMonitor();
    
    this.startOptimization();
  }
  
  private startOptimization(): void {
    this.optimizationInterval = setInterval(async () => {
      await this.optimize();
    }, 30000); // Every 30 seconds
  }
  
  private async optimize(): Promise<void> {
    const systemResources = await this.resourceMonitor.getResources();
    const queueMetrics = this.queueManager.getMetrics();
    const workerStats = this.loadBalancer.getWorkerStats();
    
    // Dynamic strategy adjustment
    if (queueMetrics.queueDepth > 100) {
      // High load - switch to capacity-based
      this.loadBalancer.setStrategy(LoadBalancingStrategy.CAPACITY_BASED);
    } else if (queueMetrics.averageWaitTime > 5000) {
      // Long wait times - switch to least response time
      this.loadBalancer.setStrategy(LoadBalancingStrategy.LEAST_RESPONSE_TIME);
    } else {
      // Normal load - use adaptive
      this.loadBalancer.setStrategy(LoadBalancingStrategy.ADAPTIVE);
    }
    
    // Worker scaling recommendations
    const totalCapacity = Array.from(workerStats.values())
      .reduce((sum, w) => sum + w.maxCapacity, 0);
    
    const totalLoad = Array.from(workerStats.values())
      .reduce((sum, w) => sum + w.activeTaskCount, 0);
    
    const utilization = totalLoad / totalCapacity;
    
    if (utilization > 0.8) {
      this.emit('scale:up', { current: workerStats.size, recommended: workerStats.size + 2 });
    } else if (utilization < 0.2 && workerStats.size > 2) {
      this.emit('scale:down', { current: workerStats.size, recommended: workerStats.size - 1 });
    }
    
    this.emit('optimization:complete', {
      systemResources,
      queueMetrics,
      utilization
    });
  }
  
  stop(): void {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }
  }
}

// System resource monitor
class SystemResourceMonitor {
  async getResources(): Promise<{
    cpu: number;
    memory: number;
    disk: number;
  }> {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    // Calculate CPU usage
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    const cpuUsage = 1 - (totalIdle / totalTick);
    const memoryUsage = 1 - (freeMemory / totalMemory);
    
    return {
      cpu: cpuUsage,
      memory: memoryUsage,
      disk: 0.5 // Simplified
    };
  }
}