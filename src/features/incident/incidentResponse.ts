import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'mitigating' | 'resolved' | 'closed';
  category: 'security' | 'performance' | 'availability' | 'data' | 'infrastructure' | 'other';
  metadata: {
    created: number;
    updated: number;
    resolved?: number;
    reporter: string;
    assignee?: string;
    tags: string[];
  };
  impact: {
    usersAffected: number;
    servicesAffected: string[];
    estimatedDowntime?: number;
    businessImpact: string;
  };
  timeline: IncidentEvent[];
  actions: IncidentAction[];
  communications: Communication[];
  postMortem?: PostMortem;
}

export interface IncidentEvent {
  id: string;
  timestamp: number;
  type: 'created' | 'updated' | 'escalated' | 'resolved' | 'communication' | 'action' | 'custom';
  description: string;
  author: string;
  metadata?: Record<string, any>;
}

export interface IncidentAction {
  id: string;
  type: 'command' | 'investigation' | 'mitigation' | 'communication' | 'escalation' | 'notification';
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  assignee?: string;
  created: number;
  started?: number;
  completed?: number;
  output?: string;
  command?: string;
  automation?: {
    enabled: boolean;
    script: string;
    conditions: string[];
  };
}

export interface Communication {
  id: string;
  type: 'internal' | 'external' | 'status_page' | 'stakeholder';
  channel: string; // slack, email, status page, etc.
  message: string;
  timestamp: number;
  author: string;
  recipients?: string[];
  status: 'sent' | 'failed' | 'pending';
}

export interface PostMortem {
  id: string;
  incidentId: string;
  title: string;
  summary: string;
  rootCause: string;
  timeline: string;
  impact: string;
  resolution: string;
  preventionMeasures: string[];
  actionItems: Array<{
    id: string;
    description: string;
    assignee: string;
    dueDate: number;
    status: 'open' | 'in_progress' | 'completed';
  }>;
  created: number;
  author: string;
  approved?: boolean;
  approvedBy?: string;
  approvedDate?: number;
}

export interface ResponsePlaybook {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers: {
    keywords: string[];
    severity: Incident['severity'][];
    services: string[];
    metrics: Array<{
      name: string;
      operator: 'gt' | 'lt' | 'eq' | 'contains';
      value: any;
    }>;
  };
  actions: Array<{
    type: 'command' | 'notification' | 'escalation' | 'investigation' | 'mitigation';
    title: string;
    description: string;
    command?: string;
    automated: boolean;
    delay?: number; // milliseconds
    conditions?: string[];
  }>;
  escalation: {
    enabled: boolean;
    timeouts: number[]; // minutes for each escalation level
    contacts: string[][]; // contact groups for each level
  };
  metadata: {
    created: number;
    updated: number;
    author: string;
    version: string;
    usageCount: number;
  };
}

export interface IncidentConfig {
  autoAssign: boolean;
  defaultSeverity: Incident['severity'];
  escalationEnabled: boolean;
  notificationsEnabled: boolean;
  commandLogging: boolean;
  playbookAutoTrigger: boolean;
  postMortemRequired: boolean;
  timeToAcknowledge: number; // minutes
  timeToResolve: Record<Incident['severity'], number>; // minutes by severity
}

export interface IncidentMetrics {
  totalIncidents: number;
  openIncidents: number;
  averageResolutionTime: number;
  incidentsByCategory: Record<string, number>;
  incidentsBySeverity: Record<Incident['severity'], number>;
  mttr: number; // Mean Time To Recovery
  mtta: number; // Mean Time To Acknowledge
}

class IncidentResponseMode extends EventEmitter {
  private incidents: Map<string, Incident> = new Map();
  private playbooks: Map<string, ResponsePlaybook> = new Map();
  private config: IncidentConfig;
  private isActive: boolean = false;
  private currentUser: string;
  private commandHistory: Array<{ command: string; timestamp: number; incidentId: string }> = [];
  private autoEscalationTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(currentUser: string = 'default-user') {
    super();
    this.currentUser = currentUser;
    this.config = {
      autoAssign: true,
      defaultSeverity: 'medium',
      escalationEnabled: true,
      notificationsEnabled: true,
      commandLogging: true,
      playbookAutoTrigger: true,
      postMortemRequired: true,
      timeToAcknowledge: 15, // 15 minutes
      timeToResolve: {
        low: 240,      // 4 hours
        medium: 120,   // 2 hours
        high: 60,      // 1 hour
        critical: 30   // 30 minutes
      }
    };

    this.initializeDefaultPlaybooks();
  }

  /**
   * Initialize default response playbooks
   */
  private initializeDefaultPlaybooks(): void {
    const defaultPlaybooks: Omit<ResponsePlaybook, 'id' | 'metadata'>[] = [
      {
        name: 'High CPU Usage Response',
        description: 'Automated response for high CPU usage alerts',
        category: 'performance',
        triggers: {
          keywords: ['cpu', 'high cpu', 'performance'],
          severity: ['high', 'critical'],
          services: ['api', 'web', 'database'],
          metrics: [
            { name: 'cpu_usage', operator: 'gt', value: 90 }
          ]
        },
        actions: [
          {
            type: 'investigation',
            title: 'Check System Resources',
            description: 'Gather system resource information',
            command: 'top -n 1',
            automated: true
          },
          {
            type: 'command',
            title: 'Check Process List',
            description: 'List processes by CPU usage',
            command: 'ps aux --sort=-%cpu | head -20',
            automated: true
          },
          {
            type: 'notification',
            title: 'Alert Operations Team',
            description: 'Notify on-call engineer',
            automated: true,
            delay: 0
          },
          {
            type: 'escalation',
            title: 'Escalate if Unresolved',
            description: 'Escalate to senior engineer if not resolved in 30 minutes',
            automated: true,
            delay: 1800000 // 30 minutes
          }
        ],
        escalation: {
          enabled: true,
          timeouts: [15, 30, 60], // minutes
          contacts: [['oncall-engineer'], ['senior-engineer'], ['manager']]
        }
      },
      {
        name: 'Service Outage Response',
        description: 'Standard response for service outages',
        category: 'availability',
        triggers: {
          keywords: ['outage', 'down', 'unavailable', '500 error'],
          severity: ['critical'],
          services: ['api', 'web', 'auth'],
          metrics: [
            { name: 'error_rate', operator: 'gt', value: 50 },
            { name: 'response_time', operator: 'gt', value: 5000 }
          ]
        },
        actions: [
          {
            type: 'investigation',
            title: 'Check Service Status',
            description: 'Verify service health and connectivity',
            command: 'curl -I https://api.example.com/health',
            automated: true
          },
          {
            type: 'investigation',
            title: 'Check Logs',
            description: 'Review recent error logs',
            command: 'tail -n 100 /var/log/app/error.log',
            automated: true
          },
          {
            type: 'notification',
            title: 'Update Status Page',
            description: 'Post incident to status page',
            automated: false
          },
          {
            type: 'command',
            title: 'Restart Services',
            description: 'Attempt service restart if safe',
            command: 'systemctl restart app-service',
            automated: false,
            conditions: ['error_rate > 90', 'no_database_writes']
          }
        ],
        escalation: {
          enabled: true,
          timeouts: [5, 15, 30],
          contacts: [['oncall-engineer'], ['team-lead'], ['cto']]
        }
      },
      {
        name: 'Security Incident Response',
        description: 'Response plan for security incidents',
        category: 'security',
        triggers: {
          keywords: ['security', 'breach', 'intrusion', 'malware'],
          severity: ['high', 'critical'],
          services: ['auth', 'database', 'api'],
          metrics: [
            { name: 'failed_login_attempts', operator: 'gt', value: 100 }
          ]
        },
        actions: [
          {
            type: 'investigation',
            title: 'Assess Breach Scope',
            description: 'Determine extent of security incident',
            automated: false
          },
          {
            type: 'command',
            title: 'Check Failed Logins',
            description: 'Review authentication logs',
            command: 'grep "authentication failed" /var/log/auth.log | tail -50',
            automated: true
          },
          {
            type: 'mitigation',
            title: 'Block Suspicious IPs',
            description: 'Implement IP blocking if needed',
            automated: false
          },
          {
            type: 'notification',
            title: 'Alert Security Team',
            description: 'Immediate notification to security team',
            automated: true,
            delay: 0
          },
          {
            type: 'escalation',
            title: 'Escalate to CISO',
            description: 'Escalate critical security incidents',
            automated: true,
            delay: 600000 // 10 minutes
          }
        ],
        escalation: {
          enabled: true,
          timeouts: [5, 15, 30],
          contacts: [['security-team'], ['security-lead'], ['ciso']]
        }
      }
    ];

    defaultPlaybooks.forEach(playbook => {
      const id = crypto.randomUUID();
      this.playbooks.set(id, {
        ...playbook,
        id,
        metadata: {
          created: Date.now(),
          updated: Date.now(),
          author: 'system',
          version: '1.0.0',
          usageCount: 0
        }
      });
    });

    this.emit('playbooks:initialized', { count: this.playbooks.size });
  }

  /**
   * Activate incident response mode
   */
  public activate(): void {
    if (this.isActive) {
      this.emit('warning', 'Incident response mode is already active');
      return;
    }

    this.isActive = true;
    this.emit('mode:activated', { timestamp: Date.now(), user: this.currentUser });

    // Start monitoring and automation
    this.startAutoEscalation();
  }

  /**
   * Deactivate incident response mode
   */
  public deactivate(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.stopAutoEscalation();
    this.emit('mode:deactivated', { timestamp: Date.now(), user: this.currentUser });
  }

  /**
   * Create a new incident
   */
  public createIncident(
    title: string,
    description: string,
    severity: Incident['severity'] = this.config.defaultSeverity,
    category: Incident['category'] = 'other'
  ): string {
    const id = crypto.randomUUID();
    const incident: Incident = {
      id,
      title,
      description,
      severity,
      status: 'open',
      category,
      metadata: {
        created: Date.now(),
        updated: Date.now(),
        reporter: this.currentUser,
        assignee: this.config.autoAssign ? this.currentUser : undefined,
        tags: []
      },
      impact: {
        usersAffected: 0,
        servicesAffected: [],
        businessImpact: ''
      },
      timeline: [],
      actions: [],
      communications: []
    };

    // Add creation event
    this.addIncidentEvent(incident, 'created', `Incident created by ${this.currentUser}`);

    this.incidents.set(id, incident);
    this.emit('incident:created', incident);

    // Auto-activate incident response mode for high severity incidents
    if ((severity === 'high' || severity === 'critical') && !this.isActive) {
      this.activate();
    }

    // Trigger matching playbooks
    if (this.config.playbookAutoTrigger) {
      this.triggerPlaybooks(incident);
    }

    // Set up auto-escalation
    if (this.config.escalationEnabled) {
      this.scheduleEscalation(incident);
    }

    return id;
  }

  /**
   * Update incident
   */
  public updateIncident(id: string, updates: Partial<Incident>): boolean {
    const incident = this.incidents.get(id);
    if (!incident) {
      return false;
    }

    const oldStatus = incident.status;
    const updatedIncident: Incident = {
      ...incident,
      ...updates,
      id, // Ensure ID doesn't change
      metadata: {
        ...incident.metadata,
        ...updates.metadata,
        updated: Date.now()
      }
    };

    this.incidents.set(id, updatedIncident);

    // Add timeline event for status changes
    if (updates.status && updates.status !== oldStatus) {
      this.addIncidentEvent(
        updatedIncident,
        'updated',
        `Status changed from ${oldStatus} to ${updates.status}`
      );
    }

    // Handle resolution
    if (updates.status === 'resolved' && oldStatus !== 'resolved') {
      updatedIncident.metadata.resolved = Date.now();
      this.addIncidentEvent(updatedIncident, 'resolved', 'Incident resolved');
      
      // Cancel auto-escalation
      this.cancelEscalation(id);
      
      // Schedule post-mortem if required
      if (this.config.postMortemRequired && (incident.severity === 'high' || incident.severity === 'critical')) {
        this.schedulePostMortem(updatedIncident);
      }
    }

    this.emit('incident:updated', { old: incident, new: updatedIncident });
    return true;
  }

  /**
   * Add action to incident
   */
  public addAction(
    incidentId: string,
    type: IncidentAction['type'],
    title: string,
    description: string,
    options: {
      command?: string;
      assignee?: string;
      automated?: boolean;
    } = {}
  ): string {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const actionId = crypto.randomUUID();
    const action: IncidentAction = {
      id: actionId,
      type,
      title,
      description,
      status: 'pending',
      assignee: options.assignee,
      created: Date.now(),
      command: options.command
    };

    incident.actions.push(action);
    incident.metadata.updated = Date.now();

    this.addIncidentEvent(incident, 'action', `Action added: ${title}`);
    this.emit('action:added', { incident, action });

    // Auto-execute if it's a command and automation is enabled
    if (type === 'command' && options.automated && options.command) {
      void this.executeAction(incidentId, actionId);
    }

    return actionId;
  }

  /**
   * Execute an incident action
   */
  public async executeAction(incidentId: string, actionId: string): Promise<boolean> {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      return false;
    }

    const action = incident.actions.find(a => a.id === actionId);
    if (!action) {
      return false;
    }

    action.status = 'in_progress';
    action.started = Date.now();

    this.addIncidentEvent(incident, 'action', `Executing action: ${action.title}`);
    this.emit('action:executing', { incident, action });

    try {
      if (action.type === 'command' && action.command) {
        // In a real implementation, this would execute the command
        // For now, we simulate command execution
        await this.simulateCommandExecution(action.command);
        action.output = `Command executed successfully: ${action.command}`;
        
        // Log command if enabled
        if (this.config.commandLogging) {
          this.commandHistory.push({
            command: action.command,
            timestamp: Date.now(),
            incidentId
          });
        }
      }

      action.status = 'completed';
      action.completed = Date.now();

      this.addIncidentEvent(incident, 'action', `Action completed: ${action.title}`);
      this.emit('action:completed', { incident, action });

      return true;
    } catch (error) {
      action.status = 'failed';
      action.output = `Error: ${error}`;
      
      this.addIncidentEvent(incident, 'action', `Action failed: ${action.title} - ${error}`);
      this.emit('action:failed', { incident, action, error });

      return false;
    }
  }

  /**
   * Add communication to incident
   */
  public addCommunication(
    incidentId: string,
    type: Communication['type'],
    channel: string,
    message: string,
    recipients?: string[]
  ): string {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const commId = crypto.randomUUID();
    const communication: Communication = {
      id: commId,
      type,
      channel,
      message,
      timestamp: Date.now(),
      author: this.currentUser,
      recipients,
      status: 'sent' // Simulate successful sending
    };

    incident.communications.push(communication);
    this.addIncidentEvent(incident, 'communication', `Communication sent via ${channel}`);
    this.emit('communication:sent', { incident, communication });

    return commId;
  }

  /**
   * Trigger matching playbooks for incident
   */
  private triggerPlaybooks(incident: Incident): void {
    const matchingPlaybooks: ResponsePlaybook[] = [];

    for (const playbook of this.playbooks.values()) {
      if (this.isPlaybookTriggered(playbook, incident)) {
        matchingPlaybooks.push(playbook);
      }
    }

    for (const playbook of matchingPlaybooks) {
      this.executePlaybook(incident, playbook);
    }

    if (matchingPlaybooks.length > 0) {
      this.emit('playbooks:triggered', { 
        incident, 
        playbooks: matchingPlaybooks.map(p => p.id) 
      });
    }
  }

  /**
   * Check if playbook should be triggered for incident
   */
  private isPlaybookTriggered(playbook: ResponsePlaybook, incident: Incident): boolean {
    const triggers = playbook.triggers;

    // Check severity
    if (!triggers.severity.includes(incident.severity)) {
      return false;
    }

    // Check keywords
    const text = `${incident.title} ${incident.description}`.toLowerCase();
    const hasKeyword = triggers.keywords.some(keyword => 
      text.includes(keyword.toLowerCase())
    );

    if (!hasKeyword) {
      return false;
    }

    // Check services (if specified)
    if (triggers.services.length > 0 && incident.impact.servicesAffected.length > 0) {
      const hasService = triggers.services.some(service =>
        incident.impact.servicesAffected.includes(service)
      );
      if (!hasService) {
        return false;
      }
    }

    return true;
  }

  /**
   * Execute playbook actions for incident
   */
  private executePlaybook(incident: Incident, playbook: ResponsePlaybook): void {
    playbook.metadata.usageCount++;
    
    for (const playbookAction of playbook.actions) {
      const actionId = this.addAction(
        incident.id,
        playbookAction.type,
        playbookAction.title,
        playbookAction.description,
        {
          command: playbookAction.command,
          automated: playbookAction.automated
        }
      );

      // Schedule delayed actions
      if (playbookAction.delay && playbookAction.delay > 0) {
        setTimeout(() => {
          if (playbookAction.automated) {
            void this.executeAction(incident.id, actionId);
          }
        }, playbookAction.delay);
      } else if (playbookAction.automated) {
        // Execute immediately
        setTimeout(() => this.executeAction(incident.id, actionId), 100);
      }
    }

    this.addIncidentEvent(incident, 'custom', `Playbook executed: ${playbook.name}`);
  }

  /**
   * Add event to incident timeline
   */
  private addIncidentEvent(
    incident: Incident,
    type: IncidentEvent['type'],
    description: string,
    metadata?: Record<string, any>
  ): void {
    const event: IncidentEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type,
      description,
      author: this.currentUser,
      metadata
    };

    incident.timeline.push(event);
    incident.metadata.updated = Date.now();
    this.emit('event:added', { incident, event });
  }

  /**
   * Schedule incident escalation
   */
  private scheduleEscalation(incident: Incident): void {
    const timeoutMinutes = this.config.timeToAcknowledge;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    const timer = setTimeout(() => {
      if (incident.status === 'open') {
        this.escalateIncident(incident.id);
      }
    }, timeoutMs);

    this.autoEscalationTimers.set(incident.id, timer);
  }

  /**
   * Cancel incident escalation
   */
  private cancelEscalation(incidentId: string): void {
    const timer = this.autoEscalationTimers.get(incidentId);
    if (timer) {
      clearTimeout(timer);
      this.autoEscalationTimers.delete(incidentId);
    }
  }

  /**
   * Escalate incident
   */
  public escalateIncident(incidentId: string): boolean {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      return false;
    }

    // Increase severity if possible
    const severityLevels: Incident['severity'][] = ['low', 'medium', 'high', 'critical'];
    const currentIndex = severityLevels.indexOf(incident.severity);
    if (currentIndex < severityLevels.length - 1) {
      incident.severity = severityLevels[currentIndex + 1];
    }

    this.addIncidentEvent(incident, 'escalated', `Incident escalated to ${incident.severity} severity`);
    this.emit('incident:escalated', incident);

    return true;
  }

  /**
   * Start auto-escalation monitoring
   */
  private startAutoEscalation(): void {
    // Auto-escalation is handled per-incident via scheduleEscalation
  }

  /**
   * Stop auto-escalation monitoring
   */
  private stopAutoEscalation(): void {
    for (const timer of this.autoEscalationTimers.values()) {
      clearTimeout(timer);
    }
    this.autoEscalationTimers.clear();
  }

  /**
   * Schedule post-mortem creation
   */
  private schedulePostMortem(incident: Incident): void {
    // In a real implementation, this would schedule a post-mortem
    this.emit('postmortem:scheduled', { incident });
  }

  /**
   * Simulate command execution
   */
  private async simulateCommandExecution(command: string): Promise<string> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    // Simulate success/failure
    if (Math.random() > 0.1) { // 90% success rate
      return `Command executed successfully: ${command}`;
    } else {
      throw new Error(`Command failed: ${command}`);
    }
  }

  /**
   * Get incidents with filtering
   */
  public getIncidents(filter?: {
    status?: Incident['status'];
    severity?: Incident['severity'];
    category?: Incident['category'];
    assignee?: string;
    timeRange?: { from: number; to: number };
    limit?: number;
  }): Incident[] {
    let incidents = Array.from(this.incidents.values());

    if (filter) {
      if (filter.status) {
        incidents = incidents.filter(incident => incident.status === filter.status);
      }
      if (filter.severity) {
        incidents = incidents.filter(incident => incident.severity === filter.severity);
      }
      if (filter.category) {
        incidents = incidents.filter(incident => incident.category === filter.category);
      }
      if (filter.assignee) {
        incidents = incidents.filter(incident => incident.metadata.assignee === filter.assignee);
      }
      if (filter.timeRange) {
        incidents = incidents.filter(incident =>
          incident.metadata.created >= filter.timeRange!.from &&
          incident.metadata.created <= filter.timeRange!.to
        );
      }
    }

    incidents.sort((a, b) => {
      // Sort by severity (critical first), then by creation time (newest first)
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
      
      if (severityDiff !== 0) return severityDiff;
      return b.metadata.created - a.metadata.created;
    });

    if (filter?.limit) {
      incidents = incidents.slice(0, filter.limit);
    }

    return incidents;
  }

  /**
   * Get incident metrics
   */
  public getMetrics(timeRange?: { from: number; to: number }): IncidentMetrics {
    let incidents = Array.from(this.incidents.values());

    if (timeRange) {
      incidents = incidents.filter(incident =>
        incident.metadata.created >= timeRange.from &&
        incident.metadata.created <= timeRange.to
      );
    }

    const totalIncidents = incidents.length;
    const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length;

    const resolvedIncidents = incidents.filter(i => i.metadata.resolved);
    const totalResolutionTime = resolvedIncidents.reduce((sum, incident) => {
      return sum + (incident.metadata.resolved! - incident.metadata.created);
    }, 0);
    const averageResolutionTime = resolvedIncidents.length > 0 ? 
      totalResolutionTime / resolvedIncidents.length : 0;

    const incidentsByCategory: Record<string, number> = {};
    const incidentsBySeverity: Record<Incident['severity'], number> = {
      low: 0, medium: 0, high: 0, critical: 0
    };

    incidents.forEach(incident => {
      incidentsByCategory[incident.category] = (incidentsByCategory[incident.category] || 0) + 1;
      incidentsBySeverity[incident.severity]++;
    });

    // MTTR and MTTA calculations
    const mttr = averageResolutionTime / (1000 * 60); // Convert to minutes
    
    // Calculate actual MTTA from incident timeline events
    let totalAckTime = 0;
    let acknowledgedCount = 0;
    
    incidents.forEach(incident => {
      const ackEvent = incident.timeline.find(e => 
        e.type === 'updated' && e.description.toLowerCase().includes('acknowledged')
      );
      if (ackEvent) {
        const ackTime = ackEvent.timestamp - incident.metadata.created;
        totalAckTime += ackTime;
        acknowledgedCount++;
      }
    });
    
    const mtta = acknowledgedCount > 0 
      ? (totalAckTime / acknowledgedCount) / (1000 * 60) // Convert to minutes
      : 0;

    return {
      totalIncidents,
      openIncidents,
      averageResolutionTime: mttr,
      incidentsByCategory,
      incidentsBySeverity,
      mttr,
      mtta
    };
  }

  /**
   * Create custom playbook
   */
  public createPlaybook(
    name: string,
    description: string,
    category: string,
    triggers: ResponsePlaybook['triggers'],
    actions: ResponsePlaybook['actions']
  ): string {
    const id = crypto.randomUUID();
    const playbook: ResponsePlaybook = {
      id,
      name,
      description,
      category,
      triggers,
      actions,
      escalation: {
        enabled: false,
        timeouts: [],
        contacts: []
      },
      metadata: {
        created: Date.now(),
        updated: Date.now(),
        author: this.currentUser,
        version: '1.0.0',
        usageCount: 0
      }
    };

    this.playbooks.set(id, playbook);
    this.emit('playbook:created', playbook);
    return id;
  }

  /**
   * Get all playbooks
   */
  public getPlaybooks(): ResponsePlaybook[] {
    return Array.from(this.playbooks.values())
      .sort((a, b) => b.metadata.usageCount - a.metadata.usageCount);
  }

  /**
   * Get command history
   */
  public getCommandHistory(incidentId?: string): Array<{ command: string; timestamp: number; incidentId: string }> {
    let history = [...this.commandHistory];

    if (incidentId) {
      history = history.filter(entry => entry.incidentId === incidentId);
    }

    return history.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Export incident data
   */
  public exportIncident(incidentId: string): string {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const exportData = {
      incident,
      commandHistory: this.getCommandHistory(incidentId),
      timestamp: Date.now()
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<IncidentConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): IncidentConfig {
    return { ...this.config };
  }

  /**
   * Check if incident response mode is active
   */
  public isActivated(): boolean {
    return this.isActive;
  }
}

let incidentResponseInstance: IncidentResponseMode | null = null;

export function getIncidentResponseMode(currentUser?: string): IncidentResponseMode {
  if (!incidentResponseInstance) {
    incidentResponseInstance = new IncidentResponseMode(currentUser);
  }
  return incidentResponseInstance;
}

export default IncidentResponseMode;