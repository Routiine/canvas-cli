/**
 * Demo Dashboard Server for Canvas CLI
 * Provides simulated data and WebSocket updates
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

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

class DemoDashboardServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: SocketIOServer;
  private metrics: SystemMetrics;
  private agents: AgentStatus[];
  private tasks: any[];

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.metrics = {
      cpu: 0,
      memory: 0,
      activeAgents: 0,
      queueDepth: 0,
      tasksProcessed: 0,
      averageResponseTime: 0,
      successRate: 1
    };

    this.agents = [
      {
        id: 'analyst',
        name: 'Business Analyst',
        status: 'active',
        capabilities: ['requirements_analysis'],
        currentTask: 'Analyzing user authentication requirements',
        metrics: {
          tasksCompleted: 45,
          averageTime: 3200,
          successRate: 0.95
        }
      },
      {
        id: 'architect',
        name: 'Solutions Architect',
        status: 'idle',
        capabilities: ['system_design'],
        metrics: {
          tasksCompleted: 32,
          averageTime: 5400,
          successRate: 0.98
        }
      },
      {
        id: 'developer',
        name: 'Developer Agent',
        status: 'active',
        capabilities: ['code_generation'],
        currentTask: 'Generating React components',
        metrics: {
          tasksCompleted: 128,
          averageTime: 2800,
          successRate: 0.92
        }
      },
      {
        id: 'qa',
        name: 'QA Engineer',
        status: 'idle',
        capabilities: ['testing'],
        metrics: {
          tasksCompleted: 67,
          averageTime: 4100,
          successRate: 0.97
        }
      }
    ];

    this.tasks = [
      {
        id: 'task_1',
        type: 'Requirements Analysis',
        status: 'running',
        createdAt: new Date().toISOString(),
        assignee: 'Business Analyst'
      },
      {
        id: 'task_2',
        type: 'Code Generation',
        status: 'completed',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        assignee: 'Developer Agent'
      },
      {
        id: 'task_3',
        type: 'Testing',
        status: 'pending',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        assignee: 'QA Engineer'
      }
    ];

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startSimulation();
  }

  private setupMiddleware(): void {
    this.app.use(cors({ origin: '*' }));
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // System status
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'online',
        metrics: this.metrics,
        timestamp: new Date().toISOString()
      });
    });

    // Agents
    this.app.get('/api/agents', (req, res) => {
      res.json(this.agents);
    });

    // Tasks
    this.app.get('/api/tasks', (req, res) => {
      res.json(this.tasks);
    });

    // Stories
    this.app.get('/api/stories', (req, res) => {
      res.json([]);
    });

    // Planning board
    this.app.get('/api/planning/board', (req, res) => {
      res.json({
        columns: [
          {
            id: 'backlog',
            title: 'Backlog',
            items: [
              {
                id: '4',
                type: 'feature',
                title: 'Add Dark Mode Support',
                description: 'Implement theme switching functionality',
                priority: 3,
                tags: ['ui', 'enhancement']
              }
            ]
          },
          {
            id: 'todo',
            title: 'To Do',
            items: [
              {
                id: '2',
                type: 'task',
                title: 'Setup Database Models',
                description: 'Create user and session models',
                priority: 2,
                assignee: 'Jane Smith',
                tags: ['backend']
              }
            ]
          },
          {
            id: 'in-progress',
            title: 'In Progress',
            items: [
              {
                id: '1',
                type: 'story',
                title: 'User Authentication System',
                description: 'Implement complete authentication with JWT tokens',
                priority: 1,
                assignee: 'John Doe',
                tags: ['auth', 'security']
              }
            ]
          },
          {
            id: 'review',
            title: 'Review',
            items: [
              {
                id: '3',
                type: 'bug',
                title: 'Fix Memory Leak in Agent System',
                description: 'Agents consuming too much memory over time',
                priority: 1,
                assignee: 'Bob Wilson',
                tags: ['bug', 'performance']
              }
            ]
          },
          {
            id: 'done',
            title: 'Done',
            items: [
              {
                id: '5',
                type: 'task',
                title: 'Write API Documentation',
                description: 'Document all REST endpoints',
                priority: 4,
                tags: ['docs']
              }
            ]
          }
        ]
      });
    });

    // Create endpoints for dashboard functionality
    this.app.post('/api/tasks', (req, res) => {
      const newTask = {
        id: `task_${Date.now()}`,
        ...req.body,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      this.tasks.push(newTask);
      res.json({ taskId: newTask.id, status: 'submitted' });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);

      // Send initial state
      socket.emit('initial-state', {
        metrics: this.metrics,
        agents: this.agents,
        tasks: this.tasks,
        stories: [],
        workflows: []
      });

      // Handle client events
      socket.on('execute-task', (data) => {
        console.log('Task execution requested:', data);
        socket.emit('task-result', { success: true });
      });

      socket.on('drag-drop', (data) => {
        console.log('Drag drop event:', data);
        this.io.emit('board-updated', this.getPlanningBoard());
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  private startSimulation(): void {
    // Simulate real-time metrics updates
    setInterval(() => {
      this.updateMetrics();
      this.io.emit('metrics-update', this.metrics);
    }, 2000);

    // Simulate agent status changes
    setInterval(() => {
      this.simulateAgentActivity();
    }, 5000);

    // Simulate task updates
    setInterval(() => {
      this.simulateTaskUpdates();
    }, 8000);
  }

  private updateMetrics(): void {
    this.metrics.cpu = Math.random() * 0.6 + 0.2; // 20-80%
    this.metrics.memory = Math.random() * 0.4 + 0.3; // 30-70%
    this.metrics.activeAgents = this.agents.filter(a => a.status === 'active').length;
    this.metrics.queueDepth = Math.floor(Math.random() * 10);
    this.metrics.tasksProcessed += Math.floor(Math.random() * 3);
    this.metrics.averageResponseTime = Math.random() * 2000 + 1000; // 1-3 seconds
    this.metrics.successRate = 0.92 + Math.random() * 0.07; // 92-99%
  }

  private simulateAgentActivity(): void {
    const randomAgent = this.agents[Math.floor(Math.random() * this.agents.length)];
    
    // Toggle status
    if (randomAgent.status === 'idle') {
      randomAgent.status = 'active';
      randomAgent.currentTask = this.getRandomTask();
    } else if (randomAgent.status === 'active') {
      randomAgent.status = 'idle';
      randomAgent.currentTask = undefined;
      randomAgent.metrics.tasksCompleted++;
    }

    this.io.emit('agent-update', randomAgent);
  }

  private simulateTaskUpdates(): void {
    const runningTask = this.tasks.find(t => t.status === 'running');
    if (runningTask) {
      runningTask.status = 'completed';
      runningTask.completedAt = new Date().toISOString();
      this.io.emit('task-update', runningTask);
    }

    // Add a new task occasionally
    if (Math.random() < 0.3) {
      const newTask = {
        id: `task_${Date.now()}`,
        type: this.getRandomTaskType(),
        status: 'pending',
        createdAt: new Date().toISOString(),
        assignee: this.getRandomAgent()
      };
      this.tasks.push(newTask);
      this.io.emit('task-update', newTask);
    }
  }

  private getRandomTask(): string {
    const tasks = [
      'Analyzing requirements',
      'Designing architecture',
      'Generating code',
      'Running tests',
      'Creating documentation',
      'Optimizing performance'
    ];
    return tasks[Math.floor(Math.random() * tasks.length)];
  }

  private getRandomTaskType(): string {
    const types = ['Analysis', 'Design', 'Implementation', 'Testing', 'Documentation'];
    return types[Math.floor(Math.random() * types.length)];
  }

  private getRandomAgent(): string {
    return this.agents[Math.floor(Math.random() * this.agents.length)].name;
  }

  private getPlanningBoard(): any {
    // Return the same planning board structure
    return {
      columns: [
        { id: 'backlog', title: 'Backlog', items: [] },
        { id: 'todo', title: 'To Do', items: [] },
        { id: 'in-progress', title: 'In Progress', items: [] },
        { id: 'review', title: 'Review', items: [] },
        { id: 'done', title: 'Done', items: [] }
      ]
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(3001, '0.0.0.0', () => {
        console.log('🎨 Canvas CLI Dashboard Server running at http://localhost:3001');
        console.log('🖥️  Dashboard UI available at http://localhost:3002');
        resolve();
      });
    });
  }
}

// Start the server
async function startDemoServer() {
  const server = new DemoDashboardServer();
  await server.start();
}

startDemoServer().catch(console.error);