/**
 * Agent Communication Integration
 * Integrates communication capabilities into existing agents
 */

import { AgentCommunicationHub, AgentMessage, CoordinationPatterns } from './agent-communication.js';
import { AgentMemory } from '../memory/agent-memory.js';
import { EventEmitter } from 'events';

export interface CommunicationCapableAgent {
  agentId: string;
  memory: AgentMemory;
  communicationHub: AgentCommunicationHub;
  sendMessage(to: string | string[], content: any, type?: AgentMessage['type']): Promise<string>;
  broadcast(channel: string, content: any): Promise<void>;
  startCollaboration(agents: string[], task: any, protocol?: string): Promise<string>;
  queryExperts(expertise: string, query: any): Promise<any[]>;
  handleMessage(message: AgentMessage): Promise<void>;
}

/**
 * Mixin to add communication capabilities to agents
 */
export class CommunicationMixin extends EventEmitter implements CommunicationCapableAgent {
  agentId: string;
  memory: AgentMemory;
  communicationHub: AgentCommunicationHub;
  private messageHandlers: Map<AgentMessage['type'], (message: AgentMessage) => Promise<void>>;
  private collaborations: Map<string, CollaborationContext>;

  constructor(
    agentId: string,
    capabilities: string[],
    communicationHub: AgentCommunicationHub
  ) {
    super();
    this.agentId = agentId;
    this.memory = new AgentMemory(agentId);
    this.communicationHub = communicationHub;
    this.messageHandlers = new Map();
    this.collaborations = new Map();

    // Register with communication hub
    this.registerWithHub(capabilities);
    
    // Set up default message handlers
    this.setupDefaultHandlers();
  }

  /**
   * Register agent with communication hub
   */
  private async registerWithHub(capabilities: string[]): Promise<void> {
    await this.communicationHub.registerAgent(
      this.agentId,
      capabilities,
      this.memory
    );

    // Set up message handler
    const hub = this.communicationHub as any;
    const agent = hub.agents.get(this.agentId);
    if (agent) {
      agent.messageHandler = this.handleMessage.bind(this);
    }
  }

  /**
   * Send a message to other agents
   */
  async sendMessage(
    to: string | string[],
    content: any,
    type: AgentMessage['type'] = 'request',
    priority: AgentMessage['priority'] = 'normal'
  ): Promise<string> {
    const messageId = await this.communicationHub.sendMessage({
      from: this.agentId,
      to,
      type,
      priority,
      content
    });

    // Log in memory
    await this.memory.remember({
      type: 'message_sent',
      to,
      content,
      messageId
    }, 'communication');

    this.emit('message:sent', { to, messageId });
    return messageId;
  }

  /**
   * Broadcast to a channel
   */
  async broadcast(channel: string, content: any, priority?: AgentMessage['priority']): Promise<void> {
    await this.communicationHub.broadcast(
      channel,
      this.agentId,
      content,
      priority
    );

    this.emit('broadcast:sent', { channel, content });
  }

  /**
   * Start a collaboration with other agents
   */
  async startCollaboration(
    agents: string[],
    task: any,
    protocol?: string
  ): Promise<string> {
    const conversationId = await this.communicationHub.startConversation(
      [this.agentId, ...agents],
      {
        from: this.agentId,
        to: agents,
        type: 'coordination',
        priority: 'high',
        content: {
          task,
          initiator: this.agentId
        }
      },
      protocol
    );

    // Track collaboration
    this.collaborations.set(conversationId, {
      id: conversationId,
      agents,
      task,
      startTime: new Date().toISOString(),
      status: 'active',
      results: []
    });

    this.emit('collaboration:started', { conversationId, agents, task });
    return conversationId;
  }

  /**
   * Query experts for specific expertise
   */
  async queryExperts(expertise: string, query: any): Promise<any[]> {
    const responses = await this.communicationHub.queryByExpertise(
      expertise,
      query,
      this.agentId
    );

    // Process and return expert responses
    const results = responses.map(r => r.content);
    
    // Remember the consultation
    await this.memory.remember({
      expertise,
      query,
      responses: results
    }, 'consultation');

    return results;
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(message: AgentMessage): Promise<void> {
    this.emit('message:received', message);

    // Store in memory
    await this.memory.remember(message, 'communication', {
      from: message.from,
      priority: message.priority
    });

    // Route to appropriate handler
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      await handler(message);
    } else {
      await this.handleDefaultMessage(message);
    }

    // Update collaboration if part of one
    if (message.metadata?.conversationId) {
      const collaboration = this.collaborations.get(message.metadata.conversationId);
      if (collaboration) {
        collaboration.results.push({
          from: message.from,
          content: message.content,
          timestamp: message.timestamp
        });
      }
    }
  }

  /**
   * Register a message handler for a specific type
   */
  registerMessageHandler(
    type: AgentMessage['type'],
    handler: (message: AgentMessage) => Promise<void>
  ): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Setup default message handlers
   */
  private setupDefaultHandlers(): void {
    // Handle requests
    this.registerMessageHandler('request', async (message) => {
      const response = await this.processRequest(message.content);
      await this.sendMessage(message.from, response, 'response');
    });

    // Handle queries
    this.registerMessageHandler('query', async (message) => {
      const answer = await this.processQuery(message.content);
      await this.sendMessage(message.from, answer, 'response');
    });

    // Handle coordination messages
    this.registerMessageHandler('coordination', async (message) => {
      await this.processCoordination(message);
    });

    // Handle notifications
    this.registerMessageHandler('notification', async (message) => {
      await this.processNotification(message.content);
    });
  }

  /**
   * Process different message types (to be overridden by specific agents)
   */
  protected async processRequest(content: any): Promise<any> {
    // Default implementation - override in specific agents
    return { status: 'received', agentId: this.agentId };
  }

  protected async processQuery(content: any): Promise<any> {
    // Default implementation - override in specific agents
    const relevantMemory = await this.memory.recall(JSON.stringify(content), 5);
    return { results: relevantMemory, agentId: this.agentId };
  }

  protected async processCoordination(message: AgentMessage): Promise<void> {
    // Default coordination handling
    if (message.content.action) {
      this.emit('coordination:action', message.content);
    }
  }

  protected async processNotification(content: any): Promise<void> {
    // Default notification handling
    this.emit('notification', content);
  }

  /**
   * Default message handler
   */
  private async handleDefaultMessage(message: AgentMessage): Promise<void> {
    console.log(`[${this.agentId}] Received message:`, message.type, 'from', message.from);
    
    // Send acknowledgment if required
    if (message.metadata?.requiresAck) {
      await this.sendMessage(message.from, {
        type: 'ack',
        originalMessageId: message.id
      }, 'notification');
    }
  }

  /**
   * Get collaboration status
   */
  getCollaboration(conversationId: string): CollaborationContext | undefined {
    return this.collaborations.get(conversationId);
  }

  /**
   * End a collaboration
   */
  async endCollaboration(conversationId: string, outcome?: any): Promise<void> {
    const collaboration = this.collaborations.get(conversationId);
    if (collaboration) {
      collaboration.status = 'completed';
      collaboration.endTime = new Date().toISOString();
      collaboration.outcome = outcome;

      // Notify other participants
      await this.broadcast('coordination', {
        type: 'collaboration_ended',
        conversationId,
        outcome
      });

      this.emit('collaboration:ended', { conversationId, outcome });
    }
  }
}

/**
 * Collaboration context
 */
interface CollaborationContext {
  id: string;
  agents: string[];
  task: any;
  startTime: string;
  endTime?: string;
  status: 'active' | 'completed' | 'failed';
  results: any[];
  outcome?: any;
}

/**
 * Factory to create communication-capable agents
 */
export class CommunicationAgentFactory {
  private static hub: AgentCommunicationHub;

  static initialize(hub?: AgentCommunicationHub): void {
    this.hub = hub || new AgentCommunicationHub();
    
    // Register default protocols
    this.hub.registerProtocol(CoordinationPatterns.SEQUENTIAL_WORKFLOW);
    this.hub.registerProtocol(CoordinationPatterns.PARALLEL_REVIEW);
    this.hub.registerProtocol(CoordinationPatterns.CONSENSUS_DECISION);
  }

  static createAgent(
    agentId: string,
    capabilities: string[],
    customHandlers?: Map<AgentMessage['type'], (message: AgentMessage) => Promise<void>>
  ): CommunicationMixin {
    if (!this.hub) {
      this.initialize();
    }

    const agent = new CommunicationMixin(agentId, capabilities, this.hub);
    
    // Add custom handlers if provided
    if (customHandlers) {
      for (const [type, handler] of customHandlers) {
        agent.registerMessageHandler(type, handler);
      }
    }

    return agent;
  }

  static getHub(): AgentCommunicationHub {
    if (!this.hub) {
      this.initialize();
    }
    return this.hub;
  }
}

/**
 * Collaboration orchestrator for complex multi-agent workflows
 */
export class CollaborationOrchestrator {
  private hub: AgentCommunicationHub;
  private workflows: Map<string, WorkflowDefinition>;

  constructor(hub: AgentCommunicationHub) {
    this.hub = hub;
    this.workflows = new Map();
    this.initializeWorkflows();
  }

  /**
   * Initialize predefined workflows
   */
  private initializeWorkflows(): void {
    // Feature development workflow
    this.workflows.set('feature_development', {
      name: 'Feature Development',
      stages: [
        {
          name: 'Requirements',
          agents: ['analyst', 'pm'],
          parallel: false,
          output: 'requirements_doc'
        },
        {
          name: 'Design',
          agents: ['architect', 'ux'],
          parallel: true,
          output: 'design_docs'
        },
        {
          name: 'Implementation',
          agents: ['developer'],
          parallel: false,
          output: 'code'
        },
        {
          name: 'Testing',
          agents: ['qa', 'security'],
          parallel: true,
          output: 'test_results'
        },
        {
          name: 'Deployment',
          agents: ['devops'],
          parallel: false,
          output: 'deployment_status'
        }
      ]
    });

    // Bug fix workflow
    this.workflows.set('bug_fix', {
      name: 'Bug Fix',
      stages: [
        {
          name: 'Analysis',
          agents: ['support', 'developer'],
          parallel: false,
          output: 'bug_analysis'
        },
        {
          name: 'Fix',
          agents: ['developer'],
          parallel: false,
          output: 'fix_code'
        },
        {
          name: 'Verification',
          agents: ['qa'],
          parallel: false,
          output: 'verification_result'
        }
      ]
    });

    // Code review workflow
    this.workflows.set('code_review', {
      name: 'Code Review',
      stages: [
        {
          name: 'Review',
          agents: ['architect', 'security', 'qa'],
          parallel: true,
          output: 'review_results'
        },
        {
          name: 'Consolidation',
          agents: ['developer'],
          parallel: false,
          output: 'consolidated_feedback'
        }
      ]
    });
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowName: string,
    input: any,
    initiator: string
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow ${workflowName} not found`);
    }

    const result: WorkflowResult = {
      workflow: workflowName,
      startTime: new Date().toISOString(),
      stages: [],
      status: 'running'
    };

    let stageInput = input;

    for (const stage of workflow.stages) {
      const stageResult = await this.executeStage(stage, stageInput, initiator);
      result.stages.push(stageResult);
      
      if (stageResult.status === 'failed') {
        result.status = 'failed';
        break;
      }
      
      stageInput = stageResult.output;
    }

    if (result.status !== 'failed') {
      result.status = 'completed';
    }

    result.endTime = new Date().toISOString();
    return result;
  }

  /**
   * Execute a workflow stage
   */
  private async executeStage(
    stage: WorkflowStage,
    input: any,
    initiator: string
  ): Promise<StageResult> {
    const stageResult: StageResult = {
      name: stage.name,
      startTime: new Date().toISOString(),
      agents: stage.agents,
      status: 'running',
      output: null
    };

    try {
      if (stage.parallel) {
        // Execute in parallel
        const promises = stage.agents.map(agent =>
          this.hub.sendMessage({
            from: initiator,
            to: agent,
            type: 'request',
            priority: 'high',
            content: { stage: stage.name, input }
          })
        );
        
        await Promise.all(promises);
        // In production, would collect and merge results
        stageResult.output = { merged: true, stage: stage.name };
      } else {
        // Execute sequentially
        let currentOutput = input;
        for (const agent of stage.agents) {
          await this.hub.sendMessage({
            from: initiator,
            to: agent,
            type: 'request',
            priority: 'high',
            content: { stage: stage.name, input: currentOutput }
          });
          // In production, would wait for and use response
          currentOutput = { processed: true, by: agent };
        }
        stageResult.output = currentOutput;
      }
      
      stageResult.status = 'completed';
    } catch (error) {
      stageResult.status = 'failed';
      stageResult.error = error instanceof Error ? error.message : 'Unknown error';
    }

    stageResult.endTime = new Date().toISOString();
    return stageResult;
  }

  /**
   * Register a custom workflow
   */
  registerWorkflow(name: string, definition: WorkflowDefinition): void {
    this.workflows.set(name, definition);
  }
}

// Type definitions
interface WorkflowDefinition {
  name: string;
  stages: WorkflowStage[];
}

interface WorkflowStage {
  name: string;
  agents: string[];
  parallel: boolean;
  output: string;
}

interface WorkflowResult {
  workflow: string;
  startTime: string;
  endTime?: string;
  stages: StageResult[];
  status: 'running' | 'completed' | 'failed';
}

interface StageResult {
  name: string;
  startTime: string;
  endTime?: string;
  agents: string[];
  status: 'running' | 'completed' | 'failed';
  output: any;
  error?: string;
}