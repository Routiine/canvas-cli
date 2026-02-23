/**
 * Distributed Agent System
 * Enables agents to run across multiple nodes/processes with coordination
 */

import { EventEmitter } from 'events';
import * as net from 'net';
import * as dgram from 'dgram';
import * as crypto from 'crypto';
import { z } from 'zod';
import { AgentMemory } from '../memory/agent-memory.js';
import { CommunicationMixin } from '../communication/agent-integration.js';

// Node information schema
export const NodeInfoSchema = z.object({
  id: z.string(),
  hostname: z.string(),
  port: z.number(),
  type: z.enum(['master', 'worker', 'coordinator']),
  status: z.enum(['online', 'offline', 'busy', 'maintenance']),
  capabilities: z.array(z.string()),
  resources: z.object({
    cpuCores: z.number(),
    memoryGB: z.number(),
    diskGB: z.number(),
    gpuCount: z.number().optional()
  }),
  agents: z.array(z.string()), // Agent IDs running on this node
  lastHeartbeat: z.string(),
  metadata: z.record(z.any()).optional()
});

export type NodeInfo = z.infer<typeof NodeInfoSchema>;

// Distributed task schema
export const DistributedTaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.any(),
  sourceNode: z.string(),
  targetNode: z.string().optional(),
  targetAgent: z.string().optional(),
  priority: z.number().default(5),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  status: z.enum(['pending', 'assigned', 'executing', 'completed', 'failed']),
  result: z.any().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional()
});

export type DistributedTask = z.infer<typeof DistributedTaskSchema>;

// Cluster configuration
export interface ClusterConfig {
  clusterId: string;
  masterNodes: string[]; // Multiple masters for HA
  discoveryPort: number;
  communicationPort: number;
  heartbeatInterval: number;
  electionTimeout: number;
  replicationFactor: number;
  shardCount: number;
}

// Distributed Agent System
export class DistributedAgentSystem extends EventEmitter {
  private nodeId: string;
  private nodeInfo: NodeInfo;
  private cluster: Map<string, NodeInfo>;
  private agents: Map<string, DistributedAgent>;
  private taskQueue: DistributedTask[];
  private executingTasks: Map<string, DistributedTask>;
  private config: ClusterConfig;
  private tcpServer?: net.Server;
  private udpSocket?: dgram.Socket;
  private connections: Map<string, net.Socket>;
  private consensusManager: ConsensusManager;
  private shardManager: ShardManager;
  private isLeader: boolean = false;
  private heartbeatTimer?: NodeJS.Timeout;
  private memory: AgentMemory;

  constructor(config: ClusterConfig, nodeType: NodeInfo['type'] = 'worker') {
    super();
    this.nodeId = this.generateNodeId();
    this.config = config;
    this.cluster = new Map();
    this.agents = new Map();
    this.taskQueue = [];
    this.executingTasks = new Map();
    this.connections = new Map();
    this.memory = new AgentMemory(`node-${this.nodeId}`);
    
    // Initialize node info
    this.nodeInfo = {
      id: this.nodeId,
      hostname: this.getHostname(),
      port: config.communicationPort,
      type: nodeType,
      status: 'online',
      capabilities: [],
      resources: this.getSystemResources(),
      agents: [],
      lastHeartbeat: new Date().toISOString()
    };
    
    this.consensusManager = new ConsensusManager(this.nodeId, this.cluster);
    this.shardManager = new ShardManager(config.shardCount);
    
    this.initialize();
  }

  /**
   * Initialize the distributed system
   */
  private async initialize(): Promise<void> {
    // Start network services
    await this.startTCPServer();
    await this.startUDPDiscovery();
    
    // Join cluster
    await this.joinCluster();
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Participate in leader election if coordinator
    if (this.nodeInfo.type === 'coordinator' || this.nodeInfo.type === 'master') {
      await this.participateInElection();
    }
    
    this.emit('node:initialized', this.nodeInfo);
  }

  /**
   * Start TCP server for agent communication
   */
  private async startTCPServer(): Promise<void> {
    this.tcpServer = net.createServer((socket) => {
      const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;
      this.connections.set(connectionId, socket);
      
      socket.on('data', (data) => {
        this.handleTCPMessage(data, socket);
      });
      
      socket.on('close', () => {
        this.connections.delete(connectionId);
      });
      
      socket.on('error', (error) => {
        console.error(`TCP connection error: ${error.message}`);
        this.connections.delete(connectionId);
      });
    });
    
    return new Promise((resolve) => {
      this.tcpServer!.listen(this.config.communicationPort, () => {
        console.log(`TCP server listening on port ${this.config.communicationPort}`);
        resolve();
      });
    });
  }

  /**
   * Start UDP discovery service
   */
  private async startUDPDiscovery(): Promise<void> {
    this.udpSocket = dgram.createSocket('udp4');
    
    this.udpSocket.on('message', (msg, rinfo) => {
      this.handleDiscoveryMessage(msg, rinfo);
    });
    
    this.udpSocket.on('error', (error) => {
      console.error(`UDP discovery error: ${error.message}`);
    });
    
    return new Promise((resolve) => {
      this.udpSocket!.bind(this.config.discoveryPort, () => {
        console.log(`UDP discovery listening on port ${this.config.discoveryPort}`);
        resolve();
      });
    });
  }

  /**
   * Join the cluster
   */
  private async joinCluster(): Promise<void> {
    // Broadcast join message
    const joinMessage = {
      type: 'join',
      node: this.nodeInfo
    };
    
    await this.broadcastUDP(joinMessage);
    
    // Wait for responses
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Add self to cluster
    this.cluster.set(this.nodeId, this.nodeInfo);
    
    this.emit('cluster:joined', {
      nodeId: this.nodeId,
      clusterSize: this.cluster.size
    });
  }

  /**
   * Register a distributed agent
   */
  async registerAgent(
    agentId: string,
    capabilities: string[],
    agentInstance?: CommunicationMixin
  ): Promise<void> {
    const distributedAgent = new DistributedAgent(
      agentId,
      this.nodeId,
      capabilities,
      agentInstance
    );
    
    this.agents.set(agentId, distributedAgent);
    this.nodeInfo.agents.push(agentId);
    this.nodeInfo.capabilities = [...new Set([...this.nodeInfo.capabilities, ...capabilities])];
    
    // Announce agent to cluster
    await this.announceAgent(agentId, capabilities);
    
    // Set up agent message handling
    distributedAgent.on('task:completed', (result) => {
      this.handleTaskCompletion(result);
    });
    
    this.emit('agent:registered', { agentId, nodeId: this.nodeId });
  }

  /**
   * Submit a task for distributed execution
   */
  async submitTask(task: Omit<DistributedTask, 'id' | 'createdAt' | 'status'>): Promise<string> {
    const fullTask: DistributedTask = {
      ...task,
      id: this.generateTaskId(),
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    
    // Determine target node based on task requirements
    const targetNode = await this.selectTargetNode(fullTask);
    
    if (targetNode) {
      fullTask.targetNode = targetNode.id;
      
      if (targetNode.id === this.nodeId) {
        // Execute locally
        await this.executeTaskLocally(fullTask);
      } else {
        // Send to remote node
        await this.sendTaskToNode(fullTask, targetNode);
      }
    } else {
      // Queue for later execution
      this.taskQueue.push(fullTask);
      this.emit('task:queued', fullTask);
    }
    
    return fullTask.id;
  }

  /**
   * Execute task on local node
   */
  private async executeTaskLocally(task: DistributedTask): Promise<void> {
    task.status = 'executing';
    task.startedAt = new Date().toISOString();
    this.executingTasks.set(task.id, task);
    
    this.emit('task:executing', task);
    
    // Find appropriate agent
    const agent = this.selectLocalAgent(task);
    
    if (agent) {
      try {
        const result = await agent.executeTask(task);
        task.result = result;
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        
        // Store in memory
        await this.memory.remember(task, 'task_execution', {
          tags: [
            `taskId:${task.id}`,
            `agentId:${agent.agentId}`,
            `duration:${Date.parse(task.completedAt) - Date.parse(task.startedAt!)}`
          ]
        });
        
        this.emit('task:completed', task);
      } catch (error) {
        task.status = 'failed';
        task.error = error instanceof Error ? error.message : 'Unknown error';
        task.completedAt = new Date().toISOString();
        
        this.emit('task:failed', task);
        
        // Retry logic
        if (task.retries > 0) {
          task.retries--;
          task.status = 'pending';
          this.taskQueue.push(task);
        }
      }
    } else {
      // No suitable agent, requeue
      task.status = 'pending';
      this.taskQueue.push(task);
    }
    
    this.executingTasks.delete(task.id);
  }

  /**
   * Select target node for task execution
   */
  private async selectTargetNode(task: DistributedTask): Promise<NodeInfo | null> {
    // Get shard for task
    const shard = this.shardManager.getShardForTask(task.id);
    
    // Find nodes with required capabilities
    const capableNodes = Array.from(this.cluster.values()).filter(node => {
      if (node.status !== 'online') return false;
      if (task.targetAgent) {
        return node.agents.includes(task.targetAgent);
      }
      // Check if node has required capabilities
      return true;
    });
    
    if (capableNodes.length === 0) return null;
    
    // Load balancing: select least loaded node
    const nodeLoads = await Promise.all(
      capableNodes.map(async node => ({
        node,
        load: await this.getNodeLoad(node.id)
      }))
    );
    
    nodeLoads.sort((a, b) => a.load - b.load);
    
    return nodeLoads[0].node;
  }

  /**
   * Send task to remote node
   */
  private async sendTaskToNode(task: DistributedTask, node: NodeInfo): Promise<void> {
    const message = {
      type: 'task',
      task,
      sourceNode: this.nodeId
    };
    
    await this.sendTCPMessage(node, message);
    
    this.emit('task:sent', { task, targetNode: node.id });
  }

  /**
   * Handle incoming TCP messages
   */
  private async handleTCPMessage(data: Buffer, socket: net.Socket): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'task':
          await this.executeTaskLocally(message.task);
          break;
          
        case 'heartbeat':
          this.updateNodeStatus(message.node);
          break;
          
        case 'election':
          await this.handleElectionMessage(message);
          break;
          
        case 'replication':
          await this.handleReplication(message);
          break;
          
        case 'query':
          await this.handleQuery(message, socket);
          break;
          
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling TCP message:', error);
    }
  }

  /**
   * Handle discovery messages
   */
  private async handleDiscoveryMessage(msg: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    try {
      const message = JSON.parse(msg.toString());
      
      switch (message.type) {
        case 'join':
          // New node joining
          this.cluster.set(message.node.id, message.node);
          
          // Send cluster info back
          const response = {
            type: 'welcome',
            cluster: Array.from(this.cluster.values()),
            leader: this.isLeader ? this.nodeId : undefined
          };
          
          await this.sendUDPMessage(response, rinfo.address, rinfo.port);
          
          this.emit('node:joined', message.node);
          break;
          
        case 'welcome':
          // Update cluster information
          for (const node of message.cluster) {
            this.cluster.set(node.id, node);
          }
          
          if (message.leader) {
            this.consensusManager.setLeader(message.leader);
          }
          break;
          
        case 'announce':
          // Agent announcement
          this.updateAgentRegistry(message);
          break;
      }
    } catch (error) {
      console.error('Error handling discovery message:', error);
    }
  }

  /**
   * Participate in leader election
   */
  private async participateInElection(): Promise<void> {
    const result = await this.consensusManager.startElection();
    
    if (result.winner === this.nodeId) {
      this.isLeader = true;
      await this.announceLeadership();
      
      this.emit('leader:elected', this.nodeId);
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      this.nodeInfo.lastHeartbeat = new Date().toISOString();
      
      // Send heartbeat to all nodes
      const heartbeat = {
        type: 'heartbeat',
        node: this.nodeInfo
      };
      
      for (const node of this.cluster.values()) {
        if (node.id !== this.nodeId) {
          await this.sendTCPMessage(node, heartbeat);
        }
      }
      
      // Check for dead nodes
      this.checkNodeHealth();
    }, this.config.heartbeatInterval);
  }

  /**
   * Check health of cluster nodes
   */
  private checkNodeHealth(): void {
    const now = Date.now();
    const timeout = this.config.heartbeatInterval * 3;
    
    for (const [nodeId, node] of this.cluster) {
      const lastHeartbeat = Date.parse(node.lastHeartbeat);
      
      if (now - lastHeartbeat > timeout && nodeId !== this.nodeId) {
        node.status = 'offline';
        this.emit('node:offline', nodeId);
        
        // Reassign tasks from offline node
        this.reassignTasksFromNode(nodeId);
      }
    }
  }

  /**
   * Reassign tasks from failed node
   */
  private async reassignTasksFromNode(nodeId: string): Promise<void> {
    // Find tasks assigned to failed node
    const tasksToReassign = Array.from(this.executingTasks.values())
      .filter(task => task.targetNode === nodeId);
    
    for (const task of tasksToReassign) {
      task.status = 'pending';
      task.targetNode = undefined;
      this.taskQueue.push(task);
    }
    
    // Process queue
    await this.processTaskQueue();
  }

  /**
   * Process pending tasks in queue
   */
  private async processTaskQueue(): Promise<void> {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      const targetNode = await this.selectTargetNode(task);
      
      if (targetNode) {
        task.targetNode = targetNode.id;
        
        if (targetNode.id === this.nodeId) {
          await this.executeTaskLocally(task);
        } else {
          await this.sendTaskToNode(task, targetNode);
        }
      } else {
        // No suitable node, put back in queue
        this.taskQueue.unshift(task);
        break;
      }
    }
  }

  /**
   * Get load for a specific node
   */
  private async getNodeLoad(nodeId: string): Promise<number> {
    if (nodeId === this.nodeId) {
      return this.executingTasks.size;
    }
    
    // Query remote node
    const node = this.cluster.get(nodeId);
    if (!node) return Infinity;
    
    // Simplified: use executing task count as load metric
    // In production, would query actual resource usage
    return 0;
  }

  /**
   * Select local agent for task execution
   */
  private selectLocalAgent(task: DistributedTask): DistributedAgent | null {
    if (task.targetAgent) {
      return this.agents.get(task.targetAgent) || null;
    }
    
    // Select based on capabilities
    const capableAgents = Array.from(this.agents.values()).filter(agent => {
      // Check if agent can handle task type
      return agent.canExecute(task.type);
    });
    
    if (capableAgents.length === 0) return null;
    
    // Round-robin or least-loaded selection
    return capableAgents[0];
  }

  /**
   * Communication helpers
   */
  private async sendTCPMessage(node: NodeInfo, message: any): Promise<void> {
    const client = net.createConnection({
      host: node.hostname,
      port: node.port
    });
    
    return new Promise((resolve, reject) => {
      client.on('connect', () => {
        client.write(JSON.stringify(message));
        client.end();
        resolve();
      });
      
      client.on('error', reject);
    });
  }

  private async sendUDPMessage(message: any, address: string, port: number): Promise<void> {
    const data = Buffer.from(JSON.stringify(message));
    
    return new Promise((resolve, reject) => {
      this.udpSocket!.send(data, port, address, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private async broadcastUDP(message: any): Promise<void> {
    const data = Buffer.from(JSON.stringify(message));
    
    return new Promise((resolve, reject) => {
      this.udpSocket!.setBroadcast(true);
      this.udpSocket!.send(data, this.config.discoveryPort, '255.255.255.255', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Utility methods
   */
  private generateNodeId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getHostname(): string {
    return require('os').hostname();
  }

  private getSystemResources(): NodeInfo['resources'] {
    const os = require('os');
    return {
      cpuCores: os.cpus().length,
      memoryGB: os.totalmem() / (1024 * 1024 * 1024),
      diskGB: 100, // Simplified
      gpuCount: 0
    };
  }

  private async announceAgent(agentId: string, capabilities: string[]): Promise<void> {
    const announcement = {
      type: 'announce',
      nodeId: this.nodeId,
      agentId,
      capabilities
    };
    
    await this.broadcastUDP(announcement);
  }

  private updateAgentRegistry(message: any): void {
    // Update knowledge of agents in cluster
    const node = this.cluster.get(message.nodeId);
    if (node && !node.agents.includes(message.agentId)) {
      node.agents.push(message.agentId);
      node.capabilities = [...new Set([...node.capabilities, ...message.capabilities])];
    }
  }

  private updateNodeStatus(nodeInfo: NodeInfo): void {
    this.cluster.set(nodeInfo.id, nodeInfo);
  }

  private async handleElectionMessage(message: any): Promise<void> {
    await this.consensusManager.handleElectionMessage(message);
  }

  private async handleReplication(message: any): Promise<void> {
    // Handle data replication
    await this.memory.remember(message.data, 'replication');
  }

  private async handleQuery(message: any, socket: net.Socket): Promise<void> {
    // Handle distributed query
    const result = await this.memory.recall(message.query, message.limit || 5);
    socket.write(JSON.stringify({ type: 'query_result', result }));
  }

  private async announceLeadership(): Promise<void> {
    const announcement = {
      type: 'leader',
      nodeId: this.nodeId
    };
    
    await this.broadcastUDP(announcement);
  }

  private handleTaskCompletion(result: any): void {
    this.emit('task:completed', result);
  }

  /**
   * Shutdown the node gracefully
   */
  async shutdown(): Promise<void> {
    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    
    // Announce departure
    const departure = {
      type: 'leave',
      nodeId: this.nodeId
    };
    
    await this.broadcastUDP(departure);
    
    // Close connections
    for (const connection of this.connections.values()) {
      connection.end();
    }
    
    // Close servers
    if (this.tcpServer) {
      this.tcpServer.close();
    }
    
    if (this.udpSocket) {
      this.udpSocket.close();
    }
    
    this.emit('node:shutdown', this.nodeId);
  }
}

// Distributed Agent wrapper
class DistributedAgent extends EventEmitter {
  constructor(
    public agentId: string,
    public nodeId: string,
    public capabilities: string[],
    private agentInstance?: CommunicationMixin
  ) {
    super();
  }

  async executeTask(task: DistributedTask): Promise<any> {
    if (this.agentInstance) {
      // Use actual agent instance - execute the task via public interface
      const agent = this.agentInstance as any;
      if (typeof agent.processRequest === 'function') {
        return await agent.processRequest(task.payload);
      }
      if (typeof agent.execute === 'function') {
        return await agent.execute(task.payload);
      }
    }

    // Simulated execution
    return { success: true, taskId: task.id };
  }

  canExecute(taskType: string): boolean {
    // Check if agent can handle task type
    return this.capabilities.includes(taskType) || 
           this.capabilities.includes('general');
  }
}

// Consensus manager for leader election
class ConsensusManager {
  constructor(
    private nodeId: string,
    private cluster: Map<string, NodeInfo>
  ) {}

  async startElection(): Promise<{ winner: string }> {
    // Simplified Raft-like election
    const votes = new Map<string, number>();
    
    // Vote for self
    votes.set(this.nodeId, 1);
    
    // Request votes from other nodes
    for (const node of this.cluster.values()) {
      if (node.id !== this.nodeId) {
        // In production, would send actual vote requests
        // For now, simulate based on node IDs (lowest wins)
      }
    }
    
    // Determine winner (simplified)
    const winner = Array.from(this.cluster.keys()).sort()[0];
    
    return { winner };
  }

  setLeader(leaderId: string): void {
    // Set the current leader
  }

  async handleElectionMessage(message: any): Promise<void> {
    // Handle election-related messages
  }
}

// Shard manager for data partitioning
class ShardManager {
  constructor(private shardCount: number) {}

  getShardForTask(taskId: string): number {
    // Simple hash-based sharding
    let hash = 0;
    for (let i = 0; i < taskId.length; i++) {
      hash = ((hash << 5) - hash) + taskId.charCodeAt(i);
      hash = hash & hash;
    }
    
    return Math.abs(hash) % this.shardCount;
  }

  getNodesForShard(shard: number, nodes: NodeInfo[]): NodeInfo[] {
    // Get nodes responsible for a shard
    const nodesPerShard = Math.max(1, Math.floor(nodes.length / this.shardCount));
    const start = shard * nodesPerShard;
    const end = Math.min(start + nodesPerShard, nodes.length);
    
    return nodes.slice(start, end);
  }
}