import { defineStore } from 'pinia'
import { io, Socket } from 'socket.io-client'

export interface SystemMetrics {
  cpu: number
  memory: number
  activeAgents: number
  queueDepth: number
  tasksProcessed: number
  averageResponseTime: number
  successRate: number
}

export interface AgentStatus {
  id: string
  name: string
  status: 'idle' | 'active' | 'error' | 'offline'
  capabilities: string[]
  currentTask?: string
  metrics: {
    tasksCompleted: number
    averageTime: number
    successRate: number
  }
}

export interface TaskInfo {
  id: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: string
  startedAt?: string
  completedAt?: string
  assignee?: string
  data: any
  result?: any
  error?: string
}

export interface StoryProgress {
  id: string
  title: string
  description: string
  status: string
  progress: number
  tasks: string[]
  createdAt: string
  completedAt?: string
}

export interface WorkflowState {
  id: string
  name: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  stages: any[]
  currentStage: number
  startedAt: string
  completedAt?: string
}

export interface PlanningItem {
  id: string
  type: 'story' | 'task' | 'bug' | 'feature'
  title: string
  description?: string
  assignee?: string
  priority: number
  tags: string[]
  columnId?: string
}

export interface PlanningColumn {
  id: string
  title: string
  items: PlanningItem[]
}

export const useDashboardStore = defineStore('dashboard', {
  state: () => ({
    socket: null as Socket | null,
    connected: false,
    
    // System state
    metrics: {
      cpu: 0,
      memory: 0,
      activeAgents: 0,
      queueDepth: 0,
      tasksProcessed: 0,
      averageResponseTime: 0,
      successRate: 1
    } as SystemMetrics,
    
    // Collections
    agents: [] as AgentStatus[],
    tasks: [] as TaskInfo[],
    stories: [] as StoryProgress[],
    workflows: [] as WorkflowState[],
    planningColumns: [] as PlanningColumn[],
    
    // UI state
    selectedTask: null as TaskInfo | null,
    selectedStory: null as StoryProgress | null,
    selectedWorkflow: null as WorkflowState | null,
    notifications: [] as any[]
  }),

  getters: {
    activeAgents: (state) => state.agents.filter(a => a.status === 'active'),
    idleAgents: (state) => state.agents.filter(a => a.status === 'idle'),
    pendingTasks: (state) => state.tasks.filter(t => t.status === 'pending'),
    runningTasks: (state) => state.tasks.filter(t => t.status === 'running'),
    completedTasks: (state) => state.tasks.filter(t => t.status === 'completed'),
    failedTasks: (state) => state.tasks.filter(t => t.status === 'failed'),
    
    tasksByStatus: (state) => {
      const grouped = {} as Record<string, TaskInfo[]>
      state.tasks.forEach(task => {
        if (!grouped[task.status]) grouped[task.status] = []
        grouped[task.status].push(task)
      })
      return grouped
    },
    
    storiesByStatus: (state) => {
      const grouped = {} as Record<string, StoryProgress[]>
      state.stories.forEach(story => {
        if (!grouped[story.status]) grouped[story.status] = []
        grouped[story.status].push(story)
      })
      return grouped
    }
  },

  actions: {
    initializeSocket() {
      const config = useRuntimeConfig()
      
      this.socket = io(config.public.socketUrl, {
        transports: ['websocket']
      })
      
      this.socket.on('connect', () => {
        this.connected = true
        console.log('Connected to dashboard server')
      })
      
      this.socket.on('disconnect', () => {
        this.connected = false
        console.log('Disconnected from dashboard server')
      })
      
      // Set up event listeners
      this.socket.on('initial-state', (data) => {
        this.metrics = data.metrics
        this.agents = data.agents
        this.tasks = data.tasks
        this.stories = data.stories
        this.workflows = data.workflows
      })
      
      this.socket.on('metrics-update', (metrics) => {
        this.metrics = metrics
      })
      
      this.socket.on('agent-update', (agent) => {
        this.updateAgent(agent)
      })
      
      this.socket.on('task-update', (task) => {
        this.updateTask(task)
      })
      
      this.socket.on('story-update', (story) => {
        this.updateStory(story)
      })
      
      this.socket.on('workflow-update', (workflow) => {
        this.updateWorkflow(workflow)
      })
      
      this.socket.on('board-updated', (board) => {
        this.planningColumns = board.columns
      })
      
      this.socket.on('error', (error) => {
        this.addNotification({
          type: 'error',
          title: 'Error',
          message: error.message
        })
      })
    },
    
    disconnectSocket() {
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
      }
    },
    
    updateAgent(agent: AgentStatus) {
      const index = this.agents.findIndex(a => a.id === agent.id)
      if (index >= 0) {
        this.agents[index] = agent
      } else {
        this.agents.push(agent)
      }
    },
    
    updateTask(task: TaskInfo) {
      const index = this.tasks.findIndex(t => t.id === task.id)
      if (index >= 0) {
        this.tasks[index] = task
      } else {
        this.tasks.push(task)
      }
    },
    
    updateStory(story: StoryProgress) {
      const index = this.stories.findIndex(s => s.id === story.id)
      if (index >= 0) {
        this.stories[index] = story
      } else {
        this.stories.push(story)
      }
    },
    
    updateWorkflow(workflow: WorkflowState) {
      const index = this.workflows.findIndex(w => w.id === workflow.id)
      if (index >= 0) {
        this.workflows[index] = workflow
      } else {
        this.workflows.push(workflow)
      }
    },
    
    async fetchPlanningBoard() {
      const config = useRuntimeConfig()
      try {
        const response = await $fetch(`${config.public.apiBase}/api/planning/board`)
        this.planningColumns = response.columns
      } catch (error) {
        console.error('Failed to fetch planning board:', error)
      }
    },
    
    async createTask(taskData: any) {
      const config = useRuntimeConfig()
      try {
        const response = await $fetch(`${config.public.apiBase}/api/tasks`, {
          method: 'POST',
          body: taskData
        })
        return response
      } catch (error) {
        console.error('Failed to create task:', error)
        throw error
      }
    },
    
    async createStory(storyData: any) {
      const config = useRuntimeConfig()
      try {
        const response = await $fetch(`${config.public.apiBase}/api/stories`, {
          method: 'POST',
          body: storyData
        })
        return response
      } catch (error) {
        console.error('Failed to create story:', error)
        throw error
      }
    },
    
    async startWorkflow(workflowData: any) {
      const config = useRuntimeConfig()
      try {
        const response = await $fetch(`${config.public.apiBase}/api/workflows`, {
          method: 'POST',
          body: workflowData
        })
        return response
      } catch (error) {
        console.error('Failed to start workflow:', error)
        throw error
      }
    },
    
    movePlanningItem(itemId: string, sourceColumnId: string, targetColumnId: string, position: number) {
      if (this.socket) {
        this.socket.emit('drag-drop', {
          itemId,
          sourceColumn: sourceColumnId,
          targetColumn: targetColumnId,
          position
        })
      }
    },
    
    executeTask(taskData: any) {
      if (this.socket) {
        this.socket.emit('execute-task', taskData)
      }
    },
    
    updateWorkflowState(workflowId: string, updates: any) {
      if (this.socket) {
        this.socket.emit('update-workflow', { workflowId, updates })
      }
    },
    
    addNotification(notification: any) {
      this.notifications.push({
        ...notification,
        id: Date.now(),
        timestamp: new Date().toISOString()
      })
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        this.removeNotification(notification.id)
      }, 5000)
    },
    
    removeNotification(id: number) {
      const index = this.notifications.findIndex(n => n.id === id)
      if (index >= 0) {
        this.notifications.splice(index, 1)
      }
    }
  }
})