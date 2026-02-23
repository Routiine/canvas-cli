/**
 * Flow Nexus Cloud Platform Integration
 * Provides secure, isolated sandboxes and cloud deployment for AI swarms
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';

// Types and Interfaces
export interface FlowNexusConfig {
  apiKey: string;
  apiSecret?: string;
  region?: 'us-east' | 'us-west' | 'eu-central' | 'asia-pacific';
  environment?: 'production' | 'staging' | 'development';
  baseUrl?: string;
  websocketUrl?: string;
  timeout?: number;
  maxRetries?: number;
  enableMetrics?: boolean;
  enableLogging?: boolean;
}

export interface Sandbox {
  id: string;
  name: string;
  status: 'pending' | 'initializing' | 'running' | 'stopped' | 'terminated' | 'error';
  type: 'basic' | 'standard' | 'premium' | 'enterprise';
  resources: SandboxResources;
  network: NetworkConfig;
  security: SecurityConfig;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface SandboxResources {
  cpu: number;          // vCPUs
  memory: number;       // GB
  storage: number;      // GB
  gpuEnabled?: boolean;
  gpuType?: 'T4' | 'V100' | 'A100';
  gpuCount?: number;
}

export interface NetworkConfig {
  vpcId?: string;
  subnetId?: string;
  securityGroups?: string[];
  publicIp?: string;
  privateIp?: string;
  ports?: PortMapping[];
  dns?: string[];
}

export interface PortMapping {
  protocol: 'tcp' | 'udp';
  hostPort: number;
  containerPort: number;
  public?: boolean;
}

export interface SecurityConfig {
  isolation: 'strict' | 'standard' | 'relaxed';
  encryption: boolean;
  keyManagement?: 'managed' | 'custom';
  secrets?: SecretReference[];
  policies?: SecurityPolicy[];
}

export interface SecretReference {
  name: string;
  source: 'vault' | 'kms' | 'environment';
  path?: string;
}

export interface SecurityPolicy {
  id: string;
  type: 'network' | 'resource' | 'data';
  rules: PolicyRule[];
}

export interface PolicyRule {
  action: 'allow' | 'deny';
  resource: string;
  conditions?: Record<string, any>;
}

export interface SwarmDeployment {
  id: string;
  name: string;
  status: 'deploying' | 'running' | 'scaling' | 'updating' | 'stopped' | 'failed';
  swarmConfig: SwarmConfig;
  agents: AgentInstance[];
  metrics: DeploymentMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export interface SwarmConfig {
  orchestrator: 'kubernetes' | 'docker-swarm' | 'nomad' | 'custom';
  replicas: number;
  autoScaling?: AutoScalingConfig;
  loadBalancing?: LoadBalancingConfig;
  healthChecks?: HealthCheckConfig[];
  rolloutStrategy?: RolloutStrategy;
}

export interface AutoScalingConfig {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  targetCPU?: number;
  targetMemory?: number;
  targetRequestRate?: number;
  customMetrics?: CustomMetric[];
}

export interface CustomMetric {
  name: string;
  target: number;
  type: 'average' | 'total' | 'rate';
}

export interface LoadBalancingConfig {
  type: 'round-robin' | 'least-connections' | 'ip-hash' | 'weighted';
  sessionAffinity?: boolean;
  healthCheckPath?: string;
  healthCheckInterval?: number;
}

export interface HealthCheckConfig {
  type: 'http' | 'tcp' | 'exec';
  path?: string;
  port?: number;
  command?: string;
  interval: number;
  timeout: number;
  retries: number;
}

export interface RolloutStrategy {
  type: 'rolling' | 'blue-green' | 'canary';
  maxSurge?: number;
  maxUnavailable?: number;
  canaryPercent?: number;
  validationTime?: number;
}

export interface AgentInstance {
  id: string;
  type: string;
  status: 'starting' | 'running' | 'idle' | 'busy' | 'stopping' | 'stopped' | 'error';
  sandboxId: string;
  resources: AgentResources;
  performance: AgentPerformance;
  lastHeartbeat: Date;
}

export interface AgentResources {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
}

export interface AgentPerformance {
  tasksCompleted: number;
  tasksFailed: number;
  averageLatency: number;
  throughput: number;
  errorRate: number;
}

export interface DeploymentMetrics {
  totalRequests: number;
  successRate: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  activeAgents: number;
  queuedTasks: number;
}

export interface CloudStorage {
  id: string;
  name: string;
  type: 'object' | 'block' | 'file';
  provider: 's3' | 'azure-blob' | 'gcs' | 'custom';
  region: string;
  size: number;
  used: number;
  encryption: boolean;
  versioning?: boolean;
  lifecycle?: LifecyclePolicy[];
}

export interface LifecyclePolicy {
  id: string;
  name: string;
  transitions: LifecycleTransition[];
  expiration?: number;
}

export interface LifecycleTransition {
  days: number;
  storageClass: 'standard' | 'infrequent' | 'archive' | 'glacier';
}

export interface DataPipeline {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'failed';
  source: DataSource;
  transformations: Transformation[];
  destination: DataDestination;
  schedule?: string;  // Cron expression
  metrics: PipelineMetrics;
}

export interface DataSource {
  type: 'stream' | 'batch' | 'database' | 'api' | 'file';
  config: Record<string, any>;
}

export interface Transformation {
  id: string;
  type: 'filter' | 'map' | 'aggregate' | 'join' | 'custom';
  config: Record<string, any>;
  order: number;
}

export interface DataDestination {
  type: 'storage' | 'database' | 'stream' | 'webhook';
  config: Record<string, any>;
}

export interface PipelineMetrics {
  recordsProcessed: number;
  recordsFailed: number;
  lastRun?: Date;
  averageProcessingTime: number;
  dataVolume: number;
}

// Main Flow Nexus Platform Class
export class FlowNexusPlatform extends EventEmitter {
  private config: FlowNexusConfig;
  private api: AxiosInstance;
  private websocket?: WebSocket;
  private sandboxes: Map<string, Sandbox> = new Map();
  private deployments: Map<string, SwarmDeployment> = new Map();
  private pipelines: Map<string, DataPipeline> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private metricsCollector?: ReturnType<typeof setInterval>;

  constructor(config: FlowNexusConfig) {
    super();
    this.config = {
      region: 'us-east',
      environment: 'production',
      timeout: 30000,
      maxRetries: 3,
      enableMetrics: true,
      enableLogging: true,
      ...config
    };

    // Initialize API client
    this.api = axios.create({
      baseURL: this.config.baseUrl || `https://api.flownexus.cloud/${this.config.region}`,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-API-Secret': this.config.apiSecret || '',
        'X-Environment': this.config.environment || 'production'
      }
    });

    // Setup interceptors
    this.setupInterceptors();
    
    // Initialize WebSocket if URL provided
    if (this.config.websocketUrl) {
      this.connectWebSocket();
    }

    // Start metrics collection if enabled
    if (this.config.enableMetrics) {
      this.startMetricsCollection();
    }
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        config.headers['X-Request-ID'] = uuidv4();
        config.headers['X-Timestamp'] = new Date().toISOString();
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor with retry logic
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const config = error.config;
        
        if (!config || !config.retry) {
          config.retry = 0;
        }

        if (config.retry < this.config.maxRetries!) {
          config.retry++;
          
          // Exponential backoff
          const delay = Math.pow(2, config.retry) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          return this.api(config);
        }

        return Promise.reject(error);
      }
    );
  }

  private connectWebSocket(): void {
    const wsUrl = this.config.websocketUrl || 
      `wss://ws.flownexus.cloud/${this.config.region}?token=${this.config.apiKey}`;

    this.websocket = new WebSocket(wsUrl);

    this.websocket.on('open', () => {
      this.reconnectAttempts = 0;
      this.emit('connected');
      this.authenticate();
    });

    this.websocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        this.emit('error', error);
      }
    });

    this.websocket.on('close', () => {
      this.emit('disconnected');
      this.attemptReconnect();
    });

    this.websocket.on('error', (error) => {
      this.emit('error', error);
    });
  }

  private authenticate(): void {
    if (!this.websocket) return;

    this.websocket.send(JSON.stringify({
      type: 'auth',
      apiKey: this.config.apiKey,
      apiSecret: this.config.apiSecret,
      timestamp: new Date().toISOString()
    }));
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000;
    
    setTimeout(() => {
      this.connectWebSocket();
    }, delay);
  }

  private handleWebSocketMessage(message: any): void {
    switch (message.type) {
      case 'sandbox.update':
        this.handleSandboxUpdate(message.data);
        break;
      case 'deployment.update':
        this.handleDeploymentUpdate(message.data);
        break;
      case 'agent.status':
        this.handleAgentStatus(message.data);
        break;
      case 'metrics':
        this.emit('metrics', message.data);
        break;
      case 'alert':
        this.emit('alert', message.data);
        break;
      default:
        this.emit('message', message);
    }
  }

  private handleSandboxUpdate(data: any): void {
    const sandbox = this.sandboxes.get(data.id);
    if (sandbox) {
      Object.assign(sandbox, data);
      this.emit('sandbox.updated', sandbox);
    }
  }

  private handleDeploymentUpdate(data: any): void {
    const deployment = this.deployments.get(data.id);
    if (deployment) {
      Object.assign(deployment, data);
      this.emit('deployment.updated', deployment);
    }
  }

  private handleAgentStatus(data: any): void {
    this.emit('agent.status', data);
  }

  private startMetricsCollection(): void {
    this.metricsCollector = setInterval(async () => {
      try {
        const metrics = await this.getSystemMetrics();
        this.emit('system.metrics', metrics);
      } catch (error) {
        this.emit('error', error);
      }
    }, 60000); // Collect every minute
  }

  // Sandbox Management
  async createSandbox(options: {
    name: string;
    type?: Sandbox['type'];
    resources?: Partial<SandboxResources>;
    security?: Partial<SecurityConfig>;
    network?: Partial<NetworkConfig>;
    ttl?: number;  // Time to live in hours
    metadata?: Record<string, any>;
  }): Promise<Sandbox> {
    const response = await this.api.post('/sandboxes', {
      name: options.name,
      type: options.type || 'standard',
      resources: {
        cpu: 2,
        memory: 4,
        storage: 20,
        ...options.resources
      },
      security: {
        isolation: 'strict',
        encryption: true,
        ...options.security
      },
      network: options.network || {},
      ttl: options.ttl,
      metadata: options.metadata || {}
    });

    const sandbox = response.data;
    this.sandboxes.set(sandbox.id, sandbox);
    this.emit('sandbox.created', sandbox);
    
    return sandbox;
  }

  async getSandbox(id: string): Promise<Sandbox> {
    const response = await this.api.get(`/sandboxes/${id}`);
    return response.data;
  }

  async listSandboxes(filters?: {
    status?: Sandbox['status'];
    type?: Sandbox['type'];
    createdAfter?: Date;
    createdBefore?: Date;
  }): Promise<Sandbox[]> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString());
        }
      });
    }

    const response = await this.api.get('/sandboxes', { params });
    return response.data.sandboxes;
  }

  async updateSandbox(id: string, updates: Partial<Sandbox>): Promise<Sandbox> {
    const response = await this.api.patch(`/sandboxes/${id}`, updates);
    const sandbox = response.data;
    
    this.sandboxes.set(id, sandbox);
    this.emit('sandbox.updated', sandbox);
    
    return sandbox;
  }

  async startSandbox(id: string): Promise<void> {
    await this.api.post(`/sandboxes/${id}/start`);
    this.emit('sandbox.started', id);
  }

  async stopSandbox(id: string): Promise<void> {
    await this.api.post(`/sandboxes/${id}/stop`);
    this.emit('sandbox.stopped', id);
  }

  async terminateSandbox(id: string): Promise<void> {
    await this.api.delete(`/sandboxes/${id}`);
    this.sandboxes.delete(id);
    this.emit('sandbox.terminated', id);
  }

  async executInSandbox(sandboxId: string, command: {
    type: 'shell' | 'script' | 'function';
    content: string;
    timeout?: number;
    environment?: Record<string, string>;
  }): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
  }> {
    const response = await this.api.post(`/sandboxes/${sandboxId}/execute`, command);
    return response.data;
  }

  async uploadToSandbox(sandboxId: string, files: {
    path: string;
    content: Buffer | string;
    permissions?: string;
  }[]): Promise<void> {
    const formData = new FormData();
    
    files.forEach((file, index) => {
      formData.append(`file${index}`, file.content, {
        filename: file.path
      });
      
      if (file.permissions) {
        formData.append(`permissions${index}`, file.permissions);
      }
    });

    await this.api.post(`/sandboxes/${sandboxId}/upload`, formData, {
      headers: formData.getHeaders()
    });
  }

  async downloadFromSandbox(sandboxId: string, path: string): Promise<Buffer> {
    const response = await this.api.get(`/sandboxes/${sandboxId}/download`, {
      params: { path },
      responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data);
  }

  // Swarm Deployment
  async deploySwarm(config: {
    name: string;
    agents: {
      type: string;
      count: number;
      config?: Record<string, any>;
    }[];
    orchestration?: Partial<SwarmConfig>;
    sandboxId?: string;
    autoStart?: boolean;
  }): Promise<SwarmDeployment> {
    const response = await this.api.post('/deployments', {
      name: config.name,
      agents: config.agents,
      swarmConfig: {
        orchestrator: 'kubernetes',
        replicas: config.agents.reduce((sum, a) => sum + a.count, 0),
        ...config.orchestration
      },
      sandboxId: config.sandboxId,
      autoStart: config.autoStart !== false
    });

    const deployment = response.data;
    this.deployments.set(deployment.id, deployment);
    this.emit('deployment.created', deployment);
    
    return deployment;
  }

  async getDeployment(id: string): Promise<SwarmDeployment> {
    const response = await this.api.get(`/deployments/${id}`);
    return response.data;
  }

  async listDeployments(filters?: {
    status?: SwarmDeployment['status'];
    sandboxId?: string;
  }): Promise<SwarmDeployment[]> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          params.append(key, value.toString());
        }
      });
    }

    const response = await this.api.get('/deployments', { params });
    return response.data.deployments;
  }

  async scaleDeployment(id: string, replicas: number): Promise<void> {
    await this.api.post(`/deployments/${id}/scale`, { replicas });
    this.emit('deployment.scaled', { id, replicas });
  }

  async updateDeployment(id: string, updates: {
    config?: Partial<SwarmConfig>;
    agents?: any[];
  }): Promise<SwarmDeployment> {
    const response = await this.api.patch(`/deployments/${id}`, updates);
    const deployment = response.data;
    
    this.deployments.set(id, deployment);
    this.emit('deployment.updated', deployment);
    
    return deployment;
  }

  async rollbackDeployment(id: string, version?: number): Promise<void> {
    await this.api.post(`/deployments/${id}/rollback`, { version });
    this.emit('deployment.rolledback', { id, version });
  }

  async terminateDeployment(id: string): Promise<void> {
    await this.api.delete(`/deployments/${id}`);
    this.deployments.delete(id);
    this.emit('deployment.terminated', id);
  }

  // Data Pipeline Management
  async createPipeline(config: {
    name: string;
    source: DataSource;
    transformations?: Transformation[];
    destination: DataDestination;
    schedule?: string;
  }): Promise<DataPipeline> {
    const response = await this.api.post('/pipelines', config);
    const pipeline = response.data;
    
    this.pipelines.set(pipeline.id, pipeline);
    this.emit('pipeline.created', pipeline);
    
    return pipeline;
  }

  async getPipeline(id: string): Promise<DataPipeline> {
    const response = await this.api.get(`/pipelines/${id}`);
    return response.data;
  }

  async listPipelines(filters?: {
    status?: DataPipeline['status'];
  }): Promise<DataPipeline[]> {
    const params = new URLSearchParams();
    
    if (filters?.status) {
      params.append('status', filters.status);
    }

    const response = await this.api.get('/pipelines', { params });
    return response.data.pipelines;
  }

  async startPipeline(id: string): Promise<void> {
    await this.api.post(`/pipelines/${id}/start`);
    this.emit('pipeline.started', id);
  }

  async pausePipeline(id: string): Promise<void> {
    await this.api.post(`/pipelines/${id}/pause`);
    this.emit('pipeline.paused', id);
  }

  async deletePipeline(id: string): Promise<void> {
    await this.api.delete(`/pipelines/${id}`);
    this.pipelines.delete(id);
    this.emit('pipeline.deleted', id);
  }

  // Storage Management
  async createStorage(config: {
    name: string;
    type: CloudStorage['type'];
    provider?: CloudStorage['provider'];
    size: number;  // GB
    encryption?: boolean;
    versioning?: boolean;
    lifecycle?: LifecyclePolicy[];
  }): Promise<CloudStorage> {
    const response = await this.api.post('/storage', {
      ...config,
      encryption: config.encryption !== false,
      provider: config.provider || 's3',
      region: this.config.region
    });
    
    return response.data;
  }

  async getStorage(id: string): Promise<CloudStorage> {
    const response = await this.api.get(`/storage/${id}`);
    return response.data;
  }

  async listStorage(): Promise<CloudStorage[]> {
    const response = await this.api.get('/storage');
    return response.data.storage;
  }

  async uploadToStorage(storageId: string, key: string, data: Buffer | string, metadata?: Record<string, string>): Promise<void> {
    const formData = new FormData();
    formData.append('file', data, { filename: key });
    
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    await this.api.post(`/storage/${storageId}/upload`, formData, {
      headers: formData.getHeaders()
    });
  }

  async downloadFromStorage(storageId: string, key: string): Promise<Buffer> {
    const response = await this.api.get(`/storage/${storageId}/download`, {
      params: { key },
      responseType: 'arraybuffer'
    });
    
    return Buffer.from(response.data);
  }

  async deleteFromStorage(storageId: string, key: string): Promise<void> {
    await this.api.delete(`/storage/${storageId}/objects`, {
      params: { key }
    });
  }

  async deleteStorage(id: string): Promise<void> {
    await this.api.delete(`/storage/${id}`);
  }

  // Monitoring and Metrics
  async getSystemMetrics(): Promise<{
    sandboxes: {
      total: number;
      running: number;
      stopped: number;
    };
    deployments: {
      total: number;
      active: number;
      failed: number;
    };
    resources: {
      cpuUsage: number;
      memoryUsage: number;
      storageUsage: number;
      networkBandwidth: number;
    };
    costs: {
      current: number;
      projected: number;
      breakdown: Record<string, number>;
    };
  }> {
    const response = await this.api.get('/metrics/system');
    return response.data;
  }

  async getDeploymentMetrics(deploymentId: string, options?: {
    startTime?: Date;
    endTime?: Date;
    resolution?: '1m' | '5m' | '1h' | '1d';
  }): Promise<DeploymentMetrics[]> {
    const params = new URLSearchParams();
    
    if (options) {
      if (options.startTime) params.append('startTime', options.startTime.toISOString());
      if (options.endTime) params.append('endTime', options.endTime.toISOString());
      if (options.resolution) params.append('resolution', options.resolution);
    }

    const response = await this.api.get(`/deployments/${deploymentId}/metrics`, { params });
    return response.data.metrics;
  }

  async getAgentLogs(deploymentId: string, agentId: string, options?: {
    lines?: number;
    since?: Date;
    until?: Date;
    level?: 'debug' | 'info' | 'warn' | 'error';
  }): Promise<string[]> {
    const params = new URLSearchParams();
    
    if (options) {
      if (options.lines) params.append('lines', options.lines.toString());
      if (options.since) params.append('since', options.since.toISOString());
      if (options.until) params.append('until', options.until.toISOString());
      if (options.level) params.append('level', options.level);
    }

    const response = await this.api.get(
      `/deployments/${deploymentId}/agents/${agentId}/logs`,
      { params }
    );
    
    return response.data.logs;
  }

  // Cost Management
  async getCostEstimate(config: {
    sandboxType?: Sandbox['type'];
    resources?: Partial<SandboxResources>;
    duration?: number;  // hours
    agents?: { type: string; count: number }[];
  }): Promise<{
    estimated: number;
    breakdown: {
      compute: number;
      storage: number;
      network: number;
      agents: number;
    };
    currency: string;
  }> {
    const response = await this.api.post('/costs/estimate', config);
    return response.data;
  }

  async getBillingInfo(): Promise<{
    currentUsage: number;
    limit: number;
    billingCycle: {
      start: Date;
      end: Date;
    };
    paymentMethod: string;
    invoices: {
      id: string;
      amount: number;
      date: Date;
      status: 'paid' | 'pending' | 'overdue';
    }[];
  }> {
    const response = await this.api.get('/billing');
    return response.data;
  }

  async setCostAlert(threshold: number, email?: string): Promise<void> {
    await this.api.post('/costs/alerts', {
      threshold,
      email: email || null,
      enabled: true
    });
  }

  // Backup and Recovery
  async createBackup(resourceType: 'sandbox' | 'deployment' | 'storage', resourceId: string): Promise<{
    id: string;
    status: 'creating' | 'completed' | 'failed';
    size: number;
    location: string;
    createdAt: Date;
  }> {
    const response = await this.api.post('/backups', {
      resourceType,
      resourceId
    });
    
    return response.data;
  }

  async restoreBackup(backupId: string, targetId?: string): Promise<{
    id: string;
    status: 'restoring' | 'completed' | 'failed';
    targetResource: string;
  }> {
    const response = await this.api.post(`/backups/${backupId}/restore`, {
      targetId
    });
    
    return response.data;
  }

  async listBackups(resourceType?: string, resourceId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    
    if (resourceType) params.append('resourceType', resourceType);
    if (resourceId) params.append('resourceId', resourceId);

    const response = await this.api.get('/backups', { params });
    return response.data.backups;
  }

  // Security and Compliance
  async runSecurityScan(resourceType: 'sandbox' | 'deployment', resourceId: string): Promise<{
    id: string;
    status: 'running' | 'completed' | 'failed';
    findings: {
      severity: 'critical' | 'high' | 'medium' | 'low';
      type: string;
      description: string;
      remediation?: string;
    }[];
    complianceStatus: {
      standard: string;
      compliant: boolean;
      violations: string[];
    }[];
  }> {
    const response = await this.api.post('/security/scan', {
      resourceType,
      resourceId
    });
    
    return response.data;
  }

  async getComplianceReport(standard: 'SOC2' | 'HIPAA' | 'GDPR' | 'PCI-DSS'): Promise<{
    standard: string;
    status: 'compliant' | 'non-compliant' | 'partial';
    lastAudit: Date;
    findings: any[];
    recommendations: string[];
  }> {
    const response = await this.api.get(`/compliance/${standard}`);
    return response.data;
  }

  // Cleanup
  async cleanup(): Promise<void> {
    if (this.metricsCollector) {
      clearInterval(this.metricsCollector);
    }

    if (this.websocket) {
      this.websocket.close();
    }

    this.removeAllListeners();
  }

  // WebSocket Commands
  async sendCommand(command: {
    type: string;
    target?: string;
    payload?: any;
  }): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    this.websocket.send(JSON.stringify({
      ...command,
      timestamp: new Date().toISOString(),
      id: uuidv4()
    }));
  }

  // Subscribe to real-time updates
  subscribe(resourceType: 'sandbox' | 'deployment' | 'pipeline', resourceId: string): void {
    this.sendCommand({
      type: 'subscribe',
      target: `${resourceType}:${resourceId}`
    });
  }

  unsubscribe(resourceType: 'sandbox' | 'deployment' | 'pipeline', resourceId: string): void {
    this.sendCommand({
      type: 'unsubscribe',
      target: `${resourceType}:${resourceId}`
    });
  }
}

// Export helper utilities
export class FlowNexusHelpers {
  static generateSandboxConfig(preset: 'minimal' | 'standard' | 'high-performance' | 'gpu'): Partial<SandboxResources> {
    const presets = {
      minimal: { cpu: 1, memory: 2, storage: 10 },
      standard: { cpu: 2, memory: 4, storage: 20 },
      'high-performance': { cpu: 8, memory: 16, storage: 100 },
      gpu: { cpu: 4, memory: 16, storage: 50, gpuEnabled: true, gpuType: 'T4' as const, gpuCount: 1 }
    };

    return presets[preset];
  }

  static validateDeploymentConfig(config: any): boolean {
    // Validate required fields
    if (!config.name || !config.agents || !Array.isArray(config.agents)) {
      return false;
    }

    // Validate agent configuration
    for (const agent of config.agents) {
      if (!agent.type || typeof agent.count !== 'number' || agent.count < 1) {
        return false;
      }
    }

    return true;
  }

  static calculateCost(resources: SandboxResources, hours: number): number {
    // Simple cost calculation (example rates)
    const rates = {
      cpu: 0.05,      // per vCPU per hour
      memory: 0.01,   // per GB per hour
      storage: 0.001, // per GB per hour
      gpu: {
        T4: 0.5,
        V100: 2.0,
        A100: 4.0
      }
    };

    let cost = 0;
    cost += resources.cpu * rates.cpu * hours;
    cost += resources.memory * rates.memory * hours;
    cost += resources.storage * rates.storage * hours;

    if (resources.gpuEnabled && resources.gpuType && resources.gpuCount) {
      cost += rates.gpu[resources.gpuType] * resources.gpuCount * hours;
    }

    return Math.round(cost * 100) / 100;
  }
}

// Export error classes
export class FlowNexusError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'FlowNexusError';
  }
}

export class SandboxError extends FlowNexusError {
  constructor(message: string, sandboxId?: string) {
    super(message, 'SANDBOX_ERROR');
    this.details = { sandboxId };
  }
}

export class DeploymentError extends FlowNexusError {
  constructor(message: string, deploymentId?: string) {
    super(message, 'DEPLOYMENT_ERROR');
    this.details = { deploymentId };
  }
}