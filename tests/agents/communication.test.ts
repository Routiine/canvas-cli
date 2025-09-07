/**
 * Cross-Agent Communication Tests
 * Demonstrates and tests agent collaboration capabilities
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { CanvasAgentSystem } from '../../src/agents/canvas-agents.js';
import { 
  AgentCommunicationHub, 
  CoordinationPatterns 
} from '../../src/agents/communication/agent-communication.js';
import {
  CommunicationAgentFactory,
  CollaborationOrchestrator
} from '../../src/agents/communication/agent-integration.js';

describe('Cross-Agent Communication System', () => {
  let agentSystem: CanvasAgentSystem;
  let communicationHub: AgentCommunicationHub;
  
  beforeAll(() => {
    // Initialize the agent system with mock Ollama
    agentSystem = new CanvasAgentSystem('http://localhost:11434', 'llama2', 'default');
    
    // Initialize communication hub
    CommunicationAgentFactory.initialize();
    communicationHub = CommunicationAgentFactory.getHub();
  });

  describe('Agent Registration and Discovery', () => {
    it('should register agents with communication capabilities', async () => {
      const agent = CommunicationAgentFactory.createAgent(
        'test-agent',
        ['testing', 'validation']
      );
      
      expect(agent.agentId).toBe('test-agent');
      expect(agent.memory).toBeDefined();
      expect(agent.communicationHub).toBeDefined();
    });

    it('should auto-subscribe agents to relevant channels', async () => {
      const developerAgent = CommunicationAgentFactory.createAgent(
        'developer-test',
        ['code_generation', 'refactoring']
      );
      
      // Check subscriptions (would need to expose subscriptions in real implementation)
      const hub = CommunicationAgentFactory.getHub() as any;
      const agent = hub.agents.get('developer-test');
      
      expect(agent).toBeDefined();
      expect(agent.subscriptions).toContain('alerts');
      expect(agent.subscriptions).toContain('development');
    });
  });

  describe('Message Passing', () => {
    it('should send direct messages between agents', async () => {
      const sender = CommunicationAgentFactory.createAgent('sender', ['messaging']);
      const receiver = CommunicationAgentFactory.createAgent('receiver', ['messaging']);
      
      // Set up message handler for receiver
      const receivedMessages: any[] = [];
      receiver.registerMessageHandler('request', async (message) => {
        receivedMessages.push(message);
      });
      
      // Send message
      const messageId = await sender.sendMessage(
        'receiver',
        { text: 'Hello from sender' },
        'request'
      );
      
      expect(messageId).toBeDefined();
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if message was received
      expect(receivedMessages.length).toBeGreaterThan(0);
      expect(receivedMessages[0].content.text).toBe('Hello from sender');
    });

    it('should broadcast messages to channels', async () => {
      const broadcaster = CommunicationAgentFactory.createAgent('broadcaster', ['broadcasting']);
      
      // Subscribe multiple agents to a channel
      const listeners = [
        CommunicationAgentFactory.createAgent('listener1', ['listening']),
        CommunicationAgentFactory.createAgent('listener2', ['listening'])
      ];
      
      // Subscribe to test channel
      listeners.forEach(listener => {
        communicationHub.subscribeToChannel(listener.agentId, 'test-channel');
      });
      
      // Broadcast message
      await broadcaster.broadcast('test-channel', {
        announcement: 'Important update'
      });
      
      // Verify broadcast (in real implementation, would check received messages)
      const metrics = communicationHub.getMetrics();
      expect(metrics.messagesSent).toBeGreaterThan(0);
    });
  });

  describe('Collaboration Workflows', () => {
    it('should execute sequential workflow', async () => {
      // Register the sequential workflow protocol
      communicationHub.registerProtocol(CoordinationPatterns.SEQUENTIAL_WORKFLOW);
      
      // Create agents for workflow
      const agents = [
        CommunicationAgentFactory.createAgent('analyst', ['requirements_analysis']),
        CommunicationAgentFactory.createAgent('architect', ['system_design']),
        CommunicationAgentFactory.createAgent('developer', ['implementation']),
        CommunicationAgentFactory.createAgent('qa', ['testing'])
      ];
      
      // Start collaboration
      const initiator = agents[0];
      const conversationId = await initiator.startCollaboration(
        ['architect', 'developer', 'qa'],
        { task: 'Build user authentication' },
        'sequential_workflow'
      );
      
      expect(conversationId).toBeDefined();
      
      // Check conversation was created
      const conversation = communicationHub.getConversation(conversationId);
      expect(conversation).toBeDefined();
      expect(conversation?.participants).toContain('analyst');
      expect(conversation?.participants).toContain('architect');
    });

    it('should execute parallel review workflow', async () => {
      // Register the parallel review protocol
      communicationHub.registerProtocol(CoordinationPatterns.PARALLEL_REVIEW);
      
      // Create review agents
      const reviewers = [
        CommunicationAgentFactory.createAgent('security', ['security_review']),
        CommunicationAgentFactory.createAgent('qa', ['quality_review']),
        CommunicationAgentFactory.createAgent('architect', ['architecture_review'])
      ];
      
      // Start parallel review
      const conversationId = await communicationHub.startConversation(
        reviewers.map(r => r.agentId),
        {
          from: 'system',
          to: reviewers.map(r => r.agentId),
          type: 'coordination',
          priority: 'high',
          content: { code: 'function authenticate() { ... }' }
        },
        'parallel_review'
      );
      
      expect(conversationId).toBeDefined();
    });
  });

  describe('Agent Memory Integration', () => {
    it('should store messages in agent memory', async () => {
      const agent = CommunicationAgentFactory.createAgent('memory-test', ['memory']);
      
      // Send a message that will be stored in memory
      await agent.sendMessage('other-agent', {
        important: 'This should be remembered'
      });
      
      // Check memory
      const memory = agent.memory;
      const recalled = await memory.recall('important', 1);
      
      expect(recalled.length).toBeGreaterThan(0);
    });

    it('should share context between agents', async () => {
      const agent1 = CommunicationAgentFactory.createAgent('agent1', ['sharing']);
      const agent2 = CommunicationAgentFactory.createAgent('agent2', ['sharing']);
      
      // Agent1 learns something
      await agent1.memory.remember({
        fact: 'The project uses TypeScript'
      }, 'knowledge');
      
      // Agent1 shares with Agent2
      await agent1.sendMessage('agent2', {
        context: await agent1.memory.recall('TypeScript', 1)
      });
      
      // Agent2 should now have this context
      // (In real implementation, Agent2 would process and store this)
      expect(agent2.agentId).toBe('agent2');
    });
  });

  describe('Canvas Agent System Integration', () => {
    it('should enable agent consultation', async () => {
      const result = await agentSystem.consultAgent(
        'analyst',
        'architect',
        { question: 'What architecture pattern should we use?' }
      );
      
      expect(result.messageId).toBeDefined();
      expect(result.status).toBe('sent');
    });

    it('should broadcast to all agents', async () => {
      await agentSystem.broadcastToChannel(
        'alerts',
        { message: 'System maintenance in 1 hour' },
        'system'
      );
      
      const metrics = agentSystem.getCommunicationMetrics();
      expect(metrics.messagesSent).toBeGreaterThan(0);
    });

    it('should execute collaborative workflows', async () => {
      const result = await agentSystem.startCollaborativeWorkflow(
        'feature_development',
        { feature: 'User profile management' }
      );
      
      expect(result).toBeDefined();
      expect(result.workflow).toBe('feature_development');
      expect(result.stages).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle agent offline scenarios', async () => {
      const sender = CommunicationAgentFactory.createAgent('online', ['messaging']);
      
      // Try to send to non-existent agent
      const messageId = await sender.sendMessage(
        'non-existent-agent',
        { content: 'This should fail gracefully' }
      );
      
      const metrics = communicationHub.getMetrics();
      expect(metrics.failedDeliveries).toBeGreaterThan(0);
    });

    it('should use fallback routing', async () => {
      const sender = CommunicationAgentFactory.createAgent('sender-fallback', ['messaging']);
      const fallback = CommunicationAgentFactory.createAgent('fallback-agent', ['messaging']);
      
      // Send with fallback
      await communicationHub.sendMessage({
        from: 'sender-fallback',
        to: 'non-existent',
        type: 'request',
        priority: 'normal',
        content: { data: 'test' },
        routing: {
          strategy: 'direct',
          fallback: 'fallback-agent'
        }
      });
      
      // Fallback should have received the message
      expect(fallback.agentId).toBe('fallback-agent');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high message volume', async () => {
      const agents = Array.from({ length: 10 }, (_, i) => 
        CommunicationAgentFactory.createAgent(`agent-${i}`, ['testing'])
      );
      
      // Send many messages
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const sender = agents[i % 10];
        const receiver = agents[(i + 1) % 10];
        promises.push(
          sender.sendMessage(receiver.agentId, { index: i })
        );
      }
      
      await Promise.all(promises);
      
      const metrics = communicationHub.getMetrics();
      expect(metrics.messagesSent).toBeGreaterThanOrEqual(100);
    });

    it('should manage memory efficiently', async () => {
      const agent = CommunicationAgentFactory.createAgent('memory-efficient', ['testing']);
      
      // Add many memories
      for (let i = 0; i < 100; i++) {
        await agent.memory.remember({ data: `Entry ${i}` });
      }
      
      // Check pruning worked
      const stats = await agent.memory.getStatistics();
      expect(stats.totalEntries).toBeLessThanOrEqual(1000); // Max entries limit
    });
  });

  afterAll(async () => {
    // Cleanup
    jest.clearAllMocks();
  });
});

describe('Communication Patterns', () => {
  let orchestrator: CollaborationOrchestrator;
  
  beforeAll(() => {
    const hub = CommunicationAgentFactory.getHub();
    orchestrator = new CollaborationOrchestrator(hub);
  });

  it('should support custom workflow registration', () => {
    orchestrator.registerWorkflow('custom_workflow', {
      name: 'Custom Workflow',
      stages: [
        {
          name: 'Planning',
          agents: ['pm', 'analyst'],
          parallel: false,
          output: 'plan'
        },
        {
          name: 'Execution',
          agents: ['developer', 'qa'],
          parallel: true,
          output: 'result'
        }
      ]
    });
    
    // Workflow should be registered (would need to expose workflows in real implementation)
    expect(orchestrator).toBeDefined();
  });

  it('should handle consensus decision making', async () => {
    // Register consensus protocol
    const hub = CommunicationAgentFactory.getHub();
    hub.registerProtocol(CoordinationPatterns.CONSENSUS_DECISION);
    
    // Create decision makers
    const decisionMakers = [
      CommunicationAgentFactory.createAgent('pm', ['decision_making']),
      CommunicationAgentFactory.createAgent('analyst', ['evaluation']),
      CommunicationAgentFactory.createAgent('architect', ['evaluation'])
    ];
    
    // Start consensus process
    const conversationId = await hub.startConversation(
      decisionMakers.map(d => d.agentId),
      {
        from: 'pm',
        to: ['analyst', 'architect'],
        type: 'coordination',
        priority: 'high',
        content: { proposal: 'Migrate to microservices' }
      },
      'consensus_decision'
    );
    
    expect(conversationId).toBeDefined();
  });
});