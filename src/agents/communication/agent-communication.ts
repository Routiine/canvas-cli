/**
 * Cross-Agent Communication System
 * Enables agents to collaborate, share context, and coordinate actions
 */

import { EventEmitter } from 'events';
import type { AgentMemory } from '../memory/agent-memory.js';
import { z } from 'zod';

// Message schema
export const AgentMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string().or(z.array(z.string())), // Can send to one or multiple agents
  timestamp: z.string(),
  type: z.enum(['request', 'response', 'broadcast', 'query', 'notification', 'coordination']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  content: z.any(),
  metadata: z.object({
    conversationId: z.string().optional(),
    replyTo: z.string().optional(),
    ttl: z.number().optional(), // Time to live in ms
    requiresAck: z.boolean().default(false),
    encrypted: z.boolean().default(false)
  }).optional(),
  routing: z.object({
    strategy: z.enum(['direct', 'broadcast', 'round-robin', 'expertise-based']).default('direct'),
    fallback: z.string().optional()
  }).optional()
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

// Channel schema for topic-based communication
export const ChannelSchema = z.object({
  name: z.string(),
  description: z.string(),
  subscribers: z.array(z.string()),
  created: z.string(),
  lastActivity: z.string(),
  metadata: z.record(z.any())
});

export type Channel = z.infer<typeof ChannelSchema>;

// Conversation tracking
export interface Conversation {
  id: string;
  participants: string[];
  messages: AgentMessage[];
  startTime: string;
  lastActivity: string;
  status: 'active' | 'paused' | 'completed';
  context: Record<string, any>;
  outcome?: {
    success: boolean;
    summary: string;
    artifacts: any[];
  };
}

// Protocol for structured agent interactions
export interface CommunicationProtocol {
  name: string;
  version: string;
  steps: {
    order: number;
    agent: string;
    action: string;
    input: any;
    output: any;
    conditions?: Record<string, any>;
  }[];
  timeout?: number;
  rollback?: boolean;
}

export class AgentCommunicationHub extends EventEmitter {
  private agents: Map<string, AgentConnection>;
  private channels: Map<string, Channel>;
  private conversations: Map<string, Conversation>;
  private messageQueue: Map<string, AgentMessage[]>;
  private protocols: Map<string, CommunicationProtocol>;
  private routingTable: Map<string, string[]>;
  private metrics: {
    messagesSent: number;
    messagesReceived: number;
    averageResponseTime: number;
    failedDeliveries: number;
  };

  constructor() {
    super();
    this.agents = new Map();
    this.channels = new Map();
    this.conversations = new Map();
    this.messageQueue = new Map();
    this.protocols = new Map();
    this.routingTable = new Map();
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      averageResponseTime: 0,
      failedDeliveries: 0
    };

    this.initializeDefaultChannels();
    this.startMessageProcessor();
  }

  /**
   * Initialize default communication channels
   */
  private initializeDefaultChannels(): void {
    const defaultChannels = [
      {
        name: 'planning',
        description: 'Project planning and coordination',
        subscribers: ['analyst', 'pm', 'architect', 'scrummaster']
      },
      {
        name: 'development',
        description: 'Development and implementation',
        subscribers: ['developer', 'qa', 'devops']
      },
      {
        name: 'quality',
        description: 'Quality assurance and testing',
        subscribers: ['qa', 'security', 'developer']
      },
      {
        name: 'deployment',
        description: 'Deployment and operations',
        subscribers: ['devops', 'support', 'security']
      },
      {
        name: 'documentation',
        description: 'Documentation and knowledge sharing',
        subscribers: ['writer', 'developer', 'analyst']
      },
      {
        name: 'alerts',
        description: 'System-wide alerts and notifications',
        subscribers: [] // All agents subscribe by default
      }
    ];

    for (const channel of defaultChannels) {
      this.createChannel(channel.name, channel.description, channel.subscribers);
    }
  }

  /**
   * Register an agent with the communication hub
   */
  async registerAgent(
    agentId: string,
    capabilities: string[],
    memory?: AgentMemory
  ): Promise<void> {
    const connection: AgentConnection = {
      id: agentId,
      capabilities,
      memory,
      status: 'online',
      lastSeen: new Date().toISOString(),
      messageHandler: null,
      subscriptions: ['alerts'] // All agents get alerts by default
    };

    this.agents.set(agentId, connection);
    this.messageQueue.set(agentId, []);
    
    // Subscribe to relevant channels based on capabilities
    this.autoSubscribeToChannels(agentId, capabilities);
    
    this.emit('agent:registered', { agentId, capabilities });
  }

  /**
   * Send a message from one agent to another
   */
  async sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: AgentMessage = {
      ...message,
      id: this.generateMessageId(),
      timestamp: new Date().toISOString()
    };

    // Validate message
    const validated = AgentMessageSchema.parse(fullMessage);

    // Route message based on strategy
    const recipients = this.resolveRecipients(validated);
    
    for (const recipient of recipients) {
      if (this.agents.has(recipient)) {
        await this.deliverMessage(recipient, validated);
      } else if (validated.routing?.fallback) {
        await this.deliverMessage(validated.routing.fallback, validated);
      } else {
        this.metrics.failedDeliveries++;
        this.emit('message:failed', { message: validated, reason: 'Recipient not found' });
      }
    }

    this.metrics.messagesSent++;
    return validated.id;
  }

  /**
   * Broadcast a message to a channel
   */
  async broadcast(
    channelName: string,
    from: string,
    content: any,
    priority: AgentMessage['priority'] = 'normal'
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`);
    }

    const message: Omit<AgentMessage, 'id' | 'timestamp'> = {
      from,
      to: channel.subscribers,
      type: 'broadcast',
      priority,
      content,
      metadata: {
        conversationId: `channel:${channelName}`,
        requiresAck: false,
        encrypted: false
      }
    };

    await this.sendMessage(message);
    
    // Update channel activity
    channel.lastActivity = new Date().toISOString();
  }

  /**
   * Start a conversation between agents
   */
  async startConversation(
    participants: string[],
    initialMessage: Omit<AgentMessage, 'id' | 'timestamp' | 'metadata'>,
    protocol?: string
  ): Promise<string> {
    const conversationId = this.generateConversationId();
    
    const conversation: Conversation = {
      id: conversationId,
      participants,
      messages: [],
      startTime: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      status: 'active',
      context: {}
    };

    this.conversations.set(conversationId, conversation);

    // Send initial message with conversation context
    const message = {
      ...initialMessage,
      metadata: {
        conversationId
      }
    } as AgentMessage;

    await this.sendMessage(message);

    // Execute protocol if specified
    if (protocol && this.protocols.has(protocol)) {
      await this.executeProtocol(protocol, conversationId);
    }

    return conversationId;
  }

  /**
   * Execute a communication protocol
   */
  private async executeProtocol(
    protocolName: string,
    conversationId: string
  ): Promise<void> {
    const protocol = this.protocols.get(protocolName);
    if (!protocol) return;

    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    for (const step of protocol.steps) {
      // Check conditions
      if (step.conditions && !this.evaluateConditions(step.conditions, conversation)) {
        continue;
      }

      // Send message for this step
      const message: Omit<AgentMessage, 'id' | 'timestamp'> = {
        from: 'system',
        to: step.agent,
        type: 'coordination',
        priority: 'high',
        content: {
          action: step.action,
          input: step.input,
          expectedOutput: step.output
        },
        metadata: {
          conversationId,
          requiresAck: true,
          encrypted: false
        }
      };

      await this.sendMessage(message);

      // Wait for response (simplified - in production would have proper async handling)
      await this.waitForResponse(step.agent, conversationId, protocol.timeout);
    }
  }

  /**
   * Query agents based on expertise
   */
  async queryByExpertise(
    expertise: string,
    query: any,
    from: string
  ): Promise<AgentMessage[]> {
    const experts = this.findExpertAgents(expertise);
    const responses: AgentMessage[] = [];

    for (const expert of experts) {
      const message: Omit<AgentMessage, 'id' | 'timestamp'> = {
        from,
        to: expert,
        type: 'query',
        priority: 'normal',
        content: query,
        routing: {
          strategy: 'expertise-based'
        }
      };

      const messageId = await this.sendMessage(message);
      // In production, would wait for and collect responses
      // responses.push(await this.waitForResponse(expert, messageId));
    }

    return responses;
  }

  /**
   * Create a new communication channel
   */
  createChannel(name: string, description: string, initialSubscribers: string[] = []): void {
    const channel: Channel = {
      name,
      description,
      subscribers: initialSubscribers,
      created: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      metadata: {}
    };

    this.channels.set(name, channel);
    this.emit('channel:created', channel);
  }

  /**
   * Subscribe an agent to a channel
   */
  subscribeToChannel(agentId: string, channelName: string): void {
    const channel = this.channels.get(channelName);
    const agent = this.agents.get(agentId);
    
    if (channel && agent) {
      if (!channel.subscribers.includes(agentId)) {
        channel.subscribers.push(agentId);
      }
      if (!agent.subscriptions.includes(channelName)) {
        agent.subscriptions.push(channelName);
      }
      this.emit('channel:subscribed', { agentId, channelName });
    }
  }

  /**
   * Register a communication protocol
   */
  registerProtocol(protocol: CommunicationProtocol): void {
    this.protocols.set(protocol.name, protocol);
    this.emit('protocol:registered', protocol);
  }

  /**
   * Get conversation history
   */
  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): AgentConnection['status'] | undefined {
    return this.agents.get(agentId)?.status;
  }

  /**
   * Get communication metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Private helper methods
   */
  private async deliverMessage(recipient: string, message: AgentMessage): Promise<void> {
    const agent = this.agents.get(recipient);
    if (!agent) return;

    // Add to queue
    const queue = this.messageQueue.get(recipient) || [];
    queue.push(message);
    this.messageQueue.set(recipient, queue);

    // Store in agent's memory if available
    if (agent.memory) {
      await agent.memory.remember(message, 'communication', {
        tags: [
          `conversation:${message.metadata?.conversationId || 'none'}`,
          `from:${message.from}`,
          `priority:${message.priority || 'normal'}`
        ]
      });
    }

    // Track in conversation if applicable
    if (message.metadata?.conversationId) {
      const conversation = this.conversations.get(message.metadata.conversationId);
      if (conversation) {
        conversation.messages.push(message);
        conversation.lastActivity = message.timestamp;
      }
    }

    // Call handler if registered
    if (agent.messageHandler) {
      await agent.messageHandler(message);
    }

    this.metrics.messagesReceived++;
    this.emit('message:delivered', { recipient, message });
  }

  private resolveRecipients(message: AgentMessage): string[] {
    if (typeof message.to === 'string') {
      return [message.to];
    }
    return message.to;
  }

  private autoSubscribeToChannels(agentId: string, capabilities: string[]): void {
    // Auto-subscribe based on capabilities
    const capabilityChannelMap: Record<string, string[]> = {
      'requirements_analysis': ['planning'],
      'code_generation': ['development'],
      'testing': ['quality'],
      'deployment': ['deployment'],
      'documentation': ['documentation']
    };

    for (const capability of capabilities) {
      const channels = capabilityChannelMap[capability];
      if (channels) {
        for (const channel of channels) {
          this.subscribeToChannel(agentId, channel);
        }
      }
    }
  }

  private findExpertAgents(expertise: string): string[] {
    const experts: string[] = [];
    
    for (const [agentId, connection] of this.agents) {
      if (connection.capabilities.includes(expertise)) {
        experts.push(agentId);
      }
    }
    
    return experts;
  }

  private evaluateConditions(conditions: Record<string, any>, conversation: Conversation): boolean {
    // Simplified condition evaluation
    // In production, would have more sophisticated logic
    return true;
  }

  private async waitForResponse(
    agentId: string,
    conversationId: string,
    timeout?: number
  ): Promise<AgentMessage | null> {
    // Simplified response waiting
    // In production, would use promises and proper async handling
    return null;
  }

  private startMessageProcessor(): void {
    // Process message queues periodically
    setInterval(() => {
      for (const [agentId, queue] of this.messageQueue) {
        if (queue.length > 0) {
          // Process messages (simplified)
          this.emit('queue:processing', { agentId, count: queue.length });
        }
      }
    }, 1000);
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateConversationId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Agent connection interface
interface AgentConnection {
  id: string;
  capabilities: string[];
  memory?: AgentMemory;
  status: 'online' | 'busy' | 'offline';
  lastSeen: string;
  messageHandler: ((message: AgentMessage) => Promise<void>) | null;
  subscriptions: string[];
}

// Coordination patterns for common workflows
export class CoordinationPatterns {
  static readonly SEQUENTIAL_WORKFLOW: CommunicationProtocol = {
    name: 'sequential_workflow',
    version: '1.0',
    steps: [
      {
        order: 1,
        agent: 'analyst',
        action: 'analyze_requirements',
        input: { type: 'requirements' },
        output: { type: 'analysis' }
      },
      {
        order: 2,
        agent: 'architect',
        action: 'design_system',
        input: { type: 'analysis' },
        output: { type: 'architecture' }
      },
      {
        order: 3,
        agent: 'developer',
        action: 'implement',
        input: { type: 'architecture' },
        output: { type: 'code' }
      },
      {
        order: 4,
        agent: 'qa',
        action: 'test',
        input: { type: 'code' },
        output: { type: 'test_results' }
      }
    ],
    timeout: 300000 // 5 minutes
  };

  static readonly PARALLEL_REVIEW: CommunicationProtocol = {
    name: 'parallel_review',
    version: '1.0',
    steps: [
      {
        order: 1,
        agent: 'security',
        action: 'security_review',
        input: { type: 'code' },
        output: { type: 'security_report' }
      },
      {
        order: 1, // Same order = parallel execution
        agent: 'qa',
        action: 'quality_review',
        input: { type: 'code' },
        output: { type: 'quality_report' }
      },
      {
        order: 1,
        agent: 'architect',
        action: 'architecture_review',
        input: { type: 'code' },
        output: { type: 'architecture_report' }
      }
    ],
    timeout: 120000 // 2 minutes
  };

  static readonly CONSENSUS_DECISION: CommunicationProtocol = {
    name: 'consensus_decision',
    version: '1.0',
    steps: [
      {
        order: 1,
        agent: 'pm',
        action: 'propose',
        input: { type: 'proposal' },
        output: { type: 'proposal_details' }
      },
      {
        order: 2,
        agent: 'analyst',
        action: 'evaluate',
        input: { type: 'proposal_details' },
        output: { type: 'evaluation' }
      },
      {
        order: 2,
        agent: 'architect',
        action: 'evaluate',
        input: { type: 'proposal_details' },
        output: { type: 'evaluation' }
      },
      {
        order: 3,
        agent: 'pm',
        action: 'decide',
        input: { type: 'evaluations' },
        output: { type: 'decision' }
      }
    ],
    timeout: 180000 // 3 minutes
  };
}

// Export singleton instance
export const communicationHub = new AgentCommunicationHub();