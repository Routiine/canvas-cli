/**
 * Canvas CLI Web Dashboard Server
 * Real-time monitoring and control interface
 */

import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { z } from 'zod';
import { CanvasAgentSystem } from '../agents/canvas-agents.js';
import { ParallelStoryExecutor } from '../agents/execution/parallel-executor.js';
import { DistributedAgentSystem } from '../agents/distributed/distributed-agent-system.js';
import { QueueManager, LoadBalancer, ResourceOptimizer } from '../agents/orchestration/queue-load-balancer.js';

// --- Request body schemas (SEC-015) ---
const TaskSubmitSchema = z.object({
  type: z.string().min(1),
  priority: z.number().int().min(1).max(10).optional(),
  planId: z.string().optional(),
  payload: z.record(z.unknown()).optional()
});

const StoryCreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default('')
});

const WorkflowStartSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  stages: z.array(z.record(z.unknown())).optional().default([])
});

const PlanningMoveSchema = z.object({
  targetColumn: z.string().min(1),
  position: z.number().int().min(0).optional()
});

type TaskSubmit = z.infer<typeof TaskSubmitSchema>;
type StoryCreate = z.infer<typeof StoryCreateSchema>;
type WorkflowStart = z.infer<typeof WorkflowStartSchema>;
type PlanningMove = z.infer<typeof PlanningMoveSchema>;

export interface DashboardConfig {
  port: number;
  host: string;
  corsOrigin?: string;
  staticPath?: string;
  apiPrefix?: string;
}

export class DashboardServer extends EventEmitter {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private config: DashboardConfig;
  private metricsInterval?: ReturnType<typeof setInterval>;
  
  // System components
  private agentSystem?: CanvasAgentSystem;
  private parallelExecutor?: ParallelStoryExecutor;
  private distributedSystem?: DistributedAgentSystem;
  private queueManager?: QueueManager;
  private loadBalancer?: LoadBalancer;
  private resourceOptimizer?: ResourceOptimizer;
  
  // Real-time data
  private systemMetrics: SystemMetrics = {
    cpu: 0,
    memory: 0,
    activeAgents: 0,
    queueDepth: 0,
    tasksProcessed: 0,
    averageResponseTime: 0,
    successRate: 1
  };
  
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private activeTasks: Map<string, TaskInfo> = new Map();
  private storyProgress: Map<string, StoryProgress> = new Map();
  private workflowStates: Map<string, WorkflowState> = new Map();

  constructor(config: DashboardConfig) {
    super();
    this.config = config;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
        methods: ['GET', 'POST']
      }
    });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startMetricsCollection();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']
    }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Serve static files (dashboard UI)
    if (this.config.staticPath) {
      this.app.use(express.static(this.config.staticPath));
    }
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    const apiPrefix = this.config.apiPrefix || '/api';

    // JWT authentication middleware
    const authenticate = (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        // Allow unauthenticated for local-only binding
        if (req.socket?.localAddress === '127.0.0.1' || req.socket?.localAddress === '::1') {
          return next(); // localhost bypass for single-user local mode
        }
        return res.status(401).json({ error: 'Authentication required' });
      }
      const token = authHeader.slice(7);
      try {
        // Basic token validation - in production use JWT verify
        if (!token || token.length < 16) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        next();
      } catch {
        return res.status(401).json({ error: 'Invalid token' });
      }
    };

    this.app.use('/api', authenticate);
    
    // System status
    this.app.get(`${apiPrefix}/status`, (req, res) => {
      res.json({
        status: 'online',
        metrics: this.systemMetrics,
        timestamp: new Date().toISOString()
      });
    });
    
    // Agent management
    this.app.get(`${apiPrefix}/agents`, (req, res) => {
      const agents = Array.from(this.agentStatuses.values());
      res.json(agents);
    });
    
    this.app.get(`${apiPrefix}/agents/:id`, (req, res) => {
      const agent = this.agentStatuses.get(req.params.id);
      if (agent) {
        res.json(agent);
      } else {
        res.status(404).json({ error: 'Agent not found' });
      }
    });
    
    // Task management
    this.app.get(`${apiPrefix}/tasks`, (req, res) => {
      const tasks = Array.from(this.activeTasks.values());
      res.json(tasks);
    });
    
    this.app.post(`${apiPrefix}/tasks`, async (req, res) => {
      const parsed = TaskSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }
      try {
        const taskId = await this.submitTask(parsed.data);
        res.json({ taskId, status: 'submitted' });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
    
    // Story management
    this.app.get(`${apiPrefix}/stories`, (req, res) => {
      const stories = Array.from(this.storyProgress.values());
      res.json(stories);
    });
    
    this.app.post(`${apiPrefix}/stories`, async (req, res) => {
      const parsed = StoryCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }
      try {
        const storyId = await this.createStory(parsed.data);
        res.json({ storyId, status: 'created' });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
    
    // Workflow management
    this.app.get(`${apiPrefix}/workflows`, (req, res) => {
      const workflows = Array.from(this.workflowStates.values());
      res.json(workflows);
    });
    
    this.app.post(`${apiPrefix}/workflows`, async (req, res) => {
      const parsed = WorkflowStartSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }
      try {
        const workflowId = await this.startWorkflow(parsed.data);
        res.json({ workflowId, status: 'started' });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
    
    // Queue management
    this.app.get(`${apiPrefix}/queue/metrics`, (req, res) => {
      if (this.queueManager) {
        res.json(this.queueManager.getMetrics());
      } else {
        res.status(503).json({ error: 'Queue manager not initialized' });
      }
    });
    
    // Planning board
    this.app.get(`${apiPrefix}/planning/board`, (req, res) => {
      res.json(this.getPlanningBoard());
    });
    
    this.app.put(`${apiPrefix}/planning/board/:itemId/move`, async (req, res) => {
      const parsed = PlanningMoveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      }
      try {
        await this.movePlanningItem(req.params.itemId, parsed.data);
        res.json({ status: 'moved' });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });
  }

  /**
   * Setup WebSocket connections
   */
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Send initial state
      socket.emit('initial-state', {
        metrics: this.systemMetrics,
        agents: Array.from(this.agentStatuses.values()),
        tasks: Array.from(this.activeTasks.values()),
        stories: Array.from(this.storyProgress.values()),
        workflows: Array.from(this.workflowStates.values())
      });
      
      // Handle client commands
      socket.on('execute-task', async (data) => {
        try {
          const result = await this.executeTask(data);
          socket.emit('task-result', result);
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
        }
      });
      
      socket.on('update-workflow', async (data) => {
        try {
          await this.updateWorkflow(data.workflowId, data.updates);
          socket.emit('workflow-updated', { workflowId: data.workflowId });
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
        }
      });
      
      socket.on('drag-drop', async (data) => {
        try {
          await this.handleDragDrop(data);
          this.io.emit('board-updated', this.getPlanningBoard());
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
        }
      });
      
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Connect system components
   */
  connectAgentSystem(agentSystem: CanvasAgentSystem): void {
    this.agentSystem = agentSystem;
    
    // Listen to agent events
    agentSystem.on('agent:start', (data) => {
      this.updateAgentStatus(data.agent, 'active');
      this.broadcastAgentUpdate(data.agent);
    });
    
    agentSystem.on('agent:complete', (data) => {
      this.updateAgentStatus(data.agent, 'idle');
      this.broadcastAgentUpdate(data.agent);
    });
    
    agentSystem.on('agent:message', (data) => {
      this.broadcastAgentMessage(data);
    });
  }

  connectParallelExecutor(executor: ParallelStoryExecutor): void {
    this.parallelExecutor = executor;
    
    executor.on('task:started', (data) => {
      this.updateTaskStatus(data.taskId, 'running');
      this.broadcastTaskUpdate(data.taskId);
    });
    
    executor.on('task:completed', (data) => {
      this.updateTaskStatus(data.taskId, 'completed');
      this.broadcastTaskUpdate(data.taskId);
    });
    
    executor.on('execution:progress', (data) => {
      this.broadcastExecutionProgress(data);
    });
  }

  connectDistributedSystem(system: DistributedAgentSystem): void {
    this.distributedSystem = system;
    
    system.on('node:joined', (node) => {
      this.broadcastNodeUpdate('joined', node);
    });
    
    system.on('node:offline', (nodeId) => {
      this.broadcastNodeUpdate('offline', { id: nodeId });
    });
    
    system.on('task:distributed', (data) => {
      this.broadcastDistributionUpdate(data);
    });
  }

  connectQueueManager(queueManager: QueueManager): void {
    this.queueManager = queueManager;
    
    queueManager.on('item:enqueued', (item) => {
      this.systemMetrics.queueDepth++;
      this.broadcastQueueUpdate();
    });
    
    queueManager.on('item:completed', (item) => {
      this.systemMetrics.queueDepth--;
      this.systemMetrics.tasksProcessed++;
      this.broadcastQueueUpdate();
    });
  }

  connectLoadBalancer(loadBalancer: LoadBalancer): void {
    this.loadBalancer = loadBalancer;
    
    loadBalancer.on('worker:selected', (data) => {
      this.broadcastLoadBalancingUpdate(data);
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.broadcastMetrics();
    }, 1000); // Every second
  }

  private collectSystemMetrics(): void {
    // CPU usage
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += (cpu.times as Record<string, number>)[type];
      }
      totalIdle += cpu.times.idle;
    }
    
    this.systemMetrics.cpu = 1 - (totalIdle / totalTick);
    
    // Memory usage
    this.systemMetrics.memory = 1 - (os.freemem() / os.totalmem());
    
    // Active agents
    this.systemMetrics.activeAgents = Array.from(this.agentStatuses.values())
      .filter(a => a.status === 'active').length;
  }

  /**
   * Broadcasting methods
   */
  private broadcastMetrics(): void {
    this.io.emit('metrics-update', this.systemMetrics);
  }

  private broadcastAgentUpdate(agentId: string): void {
    const agent = this.agentStatuses.get(agentId);
    if (agent) {
      this.io.emit('agent-update', agent);
    }
  }

  private broadcastTaskUpdate(taskId: string): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      this.io.emit('task-update', task);
    }
  }

  private broadcastStoryUpdate(storyId: string): void {
    const story = this.storyProgress.get(storyId);
    if (story) {
      this.io.emit('story-update', story);
    }
  }

  private broadcastWorkflowUpdate(workflowId: string): void {
    const workflow = this.workflowStates.get(workflowId);
    if (workflow) {
      this.io.emit('workflow-update', workflow);
    }
  }

  private broadcastQueueUpdate(): void {
    if (this.queueManager) {
      this.io.emit('queue-update', this.queueManager.getMetrics());
    }
  }

  private broadcastAgentMessage(data: unknown): void {
    this.io.emit('agent-message', data);
  }

  private broadcastExecutionProgress(data: unknown): void {
    this.io.emit('execution-progress', data);
  }

  private broadcastNodeUpdate(event: string, node: unknown): void {
    this.io.emit('node-update', { event, node });
  }

  private broadcastDistributionUpdate(data: unknown): void {
    this.io.emit('distribution-update', data);
  }

  private broadcastLoadBalancingUpdate(data: unknown): void {
    this.io.emit('load-balancing-update', data);
  }

  /**
   * Task management
   */
  private async submitTask(taskData: TaskSubmit): Promise<string> {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const taskInfo: TaskInfo = {
      id: taskId,
      type: taskData.type,
      status: 'pending',
      createdAt: new Date().toISOString(),
      data: taskData
    };
    
    this.activeTasks.set(taskId, taskInfo);
    
    if (this.queueManager) {
      await this.queueManager.enqueue({
        type: 'task',
        priority: taskData.priority || 5,
        weight: 1,
        payload: taskData,
        metadata: {
          submittedAt: new Date().toISOString(),
          maxRetries: 3,
          retryCount: 0
        }
      });
    }
    
    return taskId;
  }

  private async executeTask(data: any): Promise<any> {
    // Execute task through appropriate system
    if (this.parallelExecutor && data.type === 'story') {
      return await this.parallelExecutor.executePlan(data.planId);
    }
    
    return { status: 'executed' };
  }

  /**
   * Story management
   */
  private async createStory(storyData: StoryCreate): Promise<string> {
    const storyId = `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const storyProgress: StoryProgress = {
      id: storyId,
      title: storyData.title,
      description: storyData.description,
      status: 'created',
      progress: 0,
      tasks: [],
      createdAt: new Date().toISOString()
    };
    
    this.storyProgress.set(storyId, storyProgress);
    this.broadcastStoryUpdate(storyId);
    
    return storyId;
  }

  /**
   * Workflow management
   */
  private async startWorkflow(workflowData: WorkflowStart): Promise<string> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const workflowState: WorkflowState = {
      id: workflowId,
      name: workflowData.name,
      type: workflowData.type,
      status: 'running',
      stages: workflowData.stages || [],
      currentStage: 0,
      startedAt: new Date().toISOString()
    };
    
    this.workflowStates.set(workflowId, workflowState);
    this.broadcastWorkflowUpdate(workflowId);
    
    return workflowId;
  }

  private async updateWorkflow(workflowId: string, updates: Partial<WorkflowState>): Promise<void> {
    const workflow = this.workflowStates.get(workflowId);
    if (workflow) {
      Object.assign(workflow, updates);
      this.broadcastWorkflowUpdate(workflowId);
    }
  }

  /**
   * Planning board
   */
  private getPlanningBoard(): PlanningBoard {
    return {
      columns: [
        {
          id: 'backlog',
          title: 'Backlog',
          items: this.getPlanningItems('backlog')
        },
        {
          id: 'todo',
          title: 'To Do',
          items: this.getPlanningItems('todo')
        },
        {
          id: 'in-progress',
          title: 'In Progress',
          items: this.getPlanningItems('in-progress')
        },
        {
          id: 'review',
          title: 'Review',
          items: this.getPlanningItems('review')
        },
        {
          id: 'done',
          title: 'Done',
          items: this.getPlanningItems('done')
        }
      ]
    };
  }

  private getPlanningItems(columnId: string): PlanningItem[] {
    // Get items for specific column
    const items: PlanningItem[] = [];
    
    // Add stories
    for (const story of this.storyProgress.values()) {
      if (this.getStoryColumn(story.status) === columnId) {
        items.push({
          id: story.id,
          type: 'story',
          title: story.title,
          description: story.description,
          assignee: undefined,
          priority: 5,
          tags: []
        });
      }
    }
    
    // Add tasks
    for (const task of this.activeTasks.values()) {
      if (this.getTaskColumn(task.status) === columnId) {
        items.push({
          id: task.id,
          type: 'task',
          title: task.type,
          description: JSON.stringify(task.data),
          assignee: task.assignee,
          priority: (typeof task.data.priority === 'number' ? task.data.priority : undefined) ?? 5,
          tags: []
        });
      }
    }
    
    return items;
  }

  private getStoryColumn(status: string): string {
    const mapping: Record<string, string> = {
      'created': 'backlog',
      'planned': 'todo',
      'in-progress': 'in-progress',
      'testing': 'review',
      'completed': 'done'
    };
    return mapping[status] || 'backlog';
  }

  private getTaskColumn(status: string): string {
    const mapping: Record<string, string> = {
      'pending': 'todo',
      'running': 'in-progress',
      'completed': 'done',
      'failed': 'backlog'
    };
    return mapping[status] || 'backlog';
  }

  private async movePlanningItem(itemId: string, moveData: PlanningMove): Promise<void> {
    // Update item position
    const { targetColumn, position } = moveData;
    
    // Find and update item
    const story = this.storyProgress.get(itemId);
    if (story) {
      story.status = this.columnToStoryStatus(targetColumn);
      this.broadcastStoryUpdate(itemId);
    }
    
    const task = this.activeTasks.get(itemId);
    if (task) {
      task.status = this.columnToTaskStatus(targetColumn) as 'running' | 'completed' | 'pending' | 'failed';
      this.broadcastTaskUpdate(itemId);
    }
    
    this.io.emit('board-updated', this.getPlanningBoard());
  }

  private columnToStoryStatus(column: string): string {
    const mapping: Record<string, string> = {
      'backlog': 'created',
      'todo': 'planned',
      'in-progress': 'in-progress',
      'review': 'testing',
      'done': 'completed'
    };
    return mapping[column] || 'created';
  }

  private columnToTaskStatus(column: string): string {
    const mapping: Record<string, string> = {
      'backlog': 'pending',
      'todo': 'pending',
      'in-progress': 'running',
      'review': 'running',
      'done': 'completed'
    };
    return mapping[column] || 'pending';
  }

  /**
   * Drag and drop handling
   */
  private async handleDragDrop(data: { itemId: string; sourceColumn: string; targetColumn: string; position?: number }): Promise<void> {
    const { itemId, sourceColumn, targetColumn, position } = data;
    
    await this.movePlanningItem(itemId, { targetColumn, position });
  }

  /**
   * Update methods
   */
  private updateAgentStatus(agentId: string, status: string): void {
    let agent = this.agentStatuses.get(agentId);
    if (!agent) {
      agent = {
        id: agentId,
        name: agentId,
        status: status as any,
        capabilities: [],
        currentTask: undefined,
        metrics: {
          tasksCompleted: 0,
          averageTime: 0,
          successRate: 1
        }
      };
      this.agentStatuses.set(agentId, agent);
    } else {
      agent.status = status as any;
    }
  }

  private updateTaskStatus(taskId: string, status: string): void {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.status = status as any;
      if (status === 'completed') {
        task.completedAt = new Date().toISOString();
      }
    }
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`Dashboard server running at http://${this.config.host}:${this.config.port}`);
        this.emit('server:started');
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.metricsInterval) clearInterval(this.metricsInterval);
      this.io.close();
      this.server.close(() => {
        this.emit('server:stopped');
        resolve();
      });
    });
  }
}

// Type definitions
interface SystemMetrics {
  cpu: number;
  memory: number;
  activeAgents: number;
  queueDepth: number;
  tasksProcessed: number;
  averageResponseTime: number;
  successRate: number;
}

interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'active' | 'error' | 'offline';
  capabilities: string[];
  currentTask?: string;
  metrics: {
    tasksCompleted: number;
    averageTime: number;
    successRate: number;
  };
}

interface TaskInfo {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  assignee?: string;
  data: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

interface StoryProgress {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number; // 0-100
  tasks: string[];
  createdAt: string;
  completedAt?: string;
}

interface WorkflowState {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  stages: Record<string, unknown>[];
  currentStage: number;
  startedAt: string;
  completedAt?: string;
}

interface PlanningBoard {
  columns: PlanningColumn[];
}

interface PlanningColumn {
  id: string;
  title: string;
  items: PlanningItem[];
}

interface PlanningItem {
  id: string;
  type: 'story' | 'task' | 'bug' | 'feature';
  title: string;
  description?: string;
  assignee?: string;
  priority: number;
  tags: string[];
}
