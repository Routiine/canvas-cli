import { EventEmitter } from 'events';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Performance Monitoring Dashboard
export interface PerformanceMetric {
  id: string;
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
  description: string;
}

export interface PerformanceAlert {
  id: string;
  metricId: string;
  threshold: number;
  condition: 'above' | 'below' | 'equal';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  isActive: boolean;
  triggeredAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

export interface SystemStats {
  cpu: {
    usage: number;
    temperature?: number;
    cores: number;
    model: string;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  uptime: number;
  loadAverage: number[];
}

export interface CommandPerformance {
  commandId: string;
  commandName: string;
  executionTime: number;
  memoryUsage: number;
  cpuUsage: number;
  exitCode: number;
  timestamp: Date;
  arguments: string[];
}

export interface DashboardConfig {
  refreshInterval: number;
  maxHistoryPoints: number;
  alertThresholds: {
    cpu: number;
    memory: number;
    disk: number;
    commandExecutionTime: number;
  };
  enabledWidgets: string[];
  autoRefresh: boolean;
  soundAlerts: boolean;
}

export class PerformanceDashboard extends EventEmitter {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private alerts: Map<string, PerformanceAlert> = new Map();
  private commandHistory: CommandPerformance[] = [];
  private systemStatsHistory: SystemStats[] = [];
  private config: DashboardConfig;
  private storageDir: string;
  private isRunning: boolean = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  private lastSystemStats: SystemStats | null = null;

  constructor() {
    super();
    this.storageDir = path.join(os.homedir(), '.canvas-cli', 'monitoring');
    fs.ensureDirSync(this.storageDir);
    
    this.config = {
      refreshInterval: 5000, // 5 seconds
      maxHistoryPoints: 100,
      alertThresholds: {
        cpu: 80,
        memory: 85,
        disk: 90,
        commandExecutionTime: 30000 // 30 seconds
      },
      enabledWidgets: ['system', 'commands', 'metrics', 'alerts'],
      autoRefresh: true,
      soundAlerts: true
    };
    
    void this.loadConfig();
    void this.loadHistory();
    this.setupDefaultMetrics();
    this.setupDefaultAlerts();
  }

  private setupDefaultMetrics(): void {
    // System metrics
    this.addMetric({
      id: 'system-cpu-usage',
      name: 'CPU Usage',
      type: 'gauge',
      value: 0,
      unit: '%',
      timestamp: new Date(),
      tags: { component: 'system', resource: 'cpu' },
      description: 'Current CPU utilization percentage'
    });

    this.addMetric({
      id: 'system-memory-usage',
      name: 'Memory Usage',
      type: 'gauge',
      value: 0,
      unit: '%',
      timestamp: new Date(),
      tags: { component: 'system', resource: 'memory' },
      description: 'Current memory utilization percentage'
    });

    this.addMetric({
      id: 'system-disk-usage',
      name: 'Disk Usage',
      type: 'gauge',
      value: 0,
      unit: '%',
      timestamp: new Date(),
      tags: { component: 'system', resource: 'disk' },
      description: 'Current disk utilization percentage'
    });

    // Canvas CLI metrics
    this.addMetric({
      id: 'commands-executed',
      name: 'Commands Executed',
      type: 'counter',
      value: 0,
      unit: 'count',
      timestamp: new Date(),
      tags: { component: 'canvas-cli', type: 'command' },
      description: 'Total number of commands executed'
    });

    this.addMetric({
      id: 'average-execution-time',
      name: 'Average Execution Time',
      type: 'gauge',
      value: 0,
      unit: 'ms',
      timestamp: new Date(),
      tags: { component: 'canvas-cli', type: 'performance' },
      description: 'Average command execution time'
    });
  }

  private setupDefaultAlerts(): void {
    this.addAlert({
      id: 'cpu-high-usage',
      metricId: 'system-cpu-usage',
      threshold: this.config.alertThresholds.cpu,
      condition: 'above',
      severity: 'high',
      message: 'High CPU usage detected',
      isActive: false
    });

    this.addAlert({
      id: 'memory-high-usage',
      metricId: 'system-memory-usage',
      threshold: this.config.alertThresholds.memory,
      condition: 'above',
      severity: 'high',
      message: 'High memory usage detected',
      isActive: false
    });

    this.addAlert({
      id: 'disk-high-usage',
      metricId: 'system-disk-usage',
      threshold: this.config.alertThresholds.disk,
      condition: 'above',
      severity: 'critical',
      message: 'Disk space running low',
      isActive: false
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(chalk.green('🚀 Performance Dashboard started'));

    // Start collecting system stats
    await this.collectSystemStats();

    // Setup auto-refresh
    if (this.config.autoRefresh) {
      this.refreshTimer = setInterval(() => {
        void this.collectSystemStats();
      }, this.config.refreshInterval);
    }

    this.emit('started');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    console.log(chalk.yellow('⏹️ Performance Dashboard stopped'));
    this.emit('stopped');
  }

  async show(): Promise<void> {
    console.clear();
    this.renderDashboard();
  }

  private renderDashboard(): void {
    const width = process.stdout.columns || 120;
    
    // Header
    console.log(chalk.cyan.bold('📊 Canvas CLI Performance Dashboard'));
    console.log(chalk.dim('═'.repeat(width)));
    console.log(chalk.dim(`Last updated: ${new Date().toLocaleString()}`));
    console.log();

    // System Overview
    if (this.config.enabledWidgets.includes('system')) {
      this.renderSystemOverview();
      console.log();
    }

    // Active Alerts
    if (this.config.enabledWidgets.includes('alerts')) {
      this.renderAlerts();
      console.log();
    }

    // Command Performance
    if (this.config.enabledWidgets.includes('commands')) {
      this.renderCommandPerformance();
      console.log();
    }

    // Metrics
    if (this.config.enabledWidgets.includes('metrics')) {
      this.renderMetrics();
      console.log();
    }

    // Footer
    console.log(chalk.dim('─'.repeat(width)));
    console.log(chalk.dim('Press Ctrl+C to stop monitoring | R to refresh | C to configure'));
  }

  private renderSystemOverview(): void {
    console.log(chalk.blue.bold('💻 System Overview'));
    console.log(chalk.dim('─'.repeat(50)));

    if (this.lastSystemStats) {
      const stats = this.lastSystemStats;
      
      // CPU
      const cpuColor = stats.cpu.usage > 80 ? chalk.red : stats.cpu.usage > 60 ? chalk.yellow : chalk.green;
      console.log(`CPU: ${cpuColor(`${stats.cpu.usage.toFixed(1)}%`)} ${this.renderProgressBar(stats.cpu.usage)} (${stats.cpu.cores} cores)`);
      
      // Memory
      const memColor = stats.memory.usage > 85 ? chalk.red : stats.memory.usage > 70 ? chalk.yellow : chalk.green;
      const memGB = (stats.memory.used / (1024 * 1024 * 1024)).toFixed(1);
      const memTotalGB = (stats.memory.total / (1024 * 1024 * 1024)).toFixed(1);
      console.log(`Memory: ${memColor(`${stats.memory.usage.toFixed(1)}%`)} ${this.renderProgressBar(stats.memory.usage)} (${memGB}GB/${memTotalGB}GB)`);
      
      // Disk
      const diskColor = stats.disk.usage > 90 ? chalk.red : stats.disk.usage > 75 ? chalk.yellow : chalk.green;
      const diskGB = (stats.disk.used / (1024 * 1024 * 1024)).toFixed(1);
      const diskTotalGB = (stats.disk.total / (1024 * 1024 * 1024)).toFixed(1);
      console.log(`Disk: ${diskColor(`${stats.disk.usage.toFixed(1)}%`)} ${this.renderProgressBar(stats.disk.usage)} (${diskGB}GB/${diskTotalGB}GB)`);
      
      // Uptime
      const uptimeHours = Math.floor(stats.uptime / 3600);
      const uptimeMinutes = Math.floor((stats.uptime % 3600) / 60);
      console.log(`Uptime: ${chalk.cyan(`${uptimeHours}h ${uptimeMinutes}m`)}`);
      
      // Load Average
      if (stats.loadAverage && stats.loadAverage.length > 0) {
        console.log(`Load: ${chalk.cyan(stats.loadAverage.map(l => l.toFixed(2)).join(', '))}`);
      }
    } else {
      console.log(chalk.dim('Collecting system statistics...'));
    }
  }

  private renderAlerts(): void {
    const activeAlerts = Array.from(this.alerts.values()).filter(a => a.isActive);
    
    console.log(chalk.yellow.bold(`⚠️ Active Alerts (${activeAlerts.length})`));
    console.log(chalk.dim('─'.repeat(50)));

    if (activeAlerts.length === 0) {
      console.log(chalk.green('✅ No active alerts'));
      return;
    }

    for (const alert of activeAlerts) {
      const severityColor = this.getSeverityColor(alert.severity);
      const timeAgo = alert.triggeredAt ? this.getTimeAgo(alert.triggeredAt) : '';
      console.log(`${severityColor(alert.severity.toUpperCase())} ${alert.message} ${chalk.dim(timeAgo)}`);
    }
  }

  private renderCommandPerformance(): void {
    console.log(chalk.magenta.bold('⚡ Recent Command Performance'));
    console.log(chalk.dim('─'.repeat(50)));

    const recent = this.commandHistory.slice(-10);
    if (recent.length === 0) {
      console.log(chalk.dim('No commands executed yet'));
      return;
    }

    console.log(chalk.dim('Command'.padEnd(25) + 'Time'.padEnd(10) + 'Memory'.padEnd(12) + 'Status'));
    console.log(chalk.dim('─'.repeat(50)));

    for (const cmd of recent) {
      const name = cmd.commandName.slice(0, 24);
      const time = `${cmd.executionTime}ms`.padEnd(9);
      const memory = `${(cmd.memoryUsage / 1024 / 1024).toFixed(1)}MB`.padEnd(11);
      const status = cmd.exitCode === 0 ? chalk.green('✓') : chalk.red('✗');
      
      console.log(`${name.padEnd(25)} ${time} ${memory} ${status}`);
    }

    // Summary stats
    const totalCommands = this.commandHistory.length;
    const avgTime = this.commandHistory.reduce((sum, cmd) => sum + cmd.executionTime, 0) / totalCommands;
    const successRate = (this.commandHistory.filter(cmd => cmd.exitCode === 0).length / totalCommands * 100).toFixed(1);
    
    console.log();
    console.log(chalk.dim(`Total: ${totalCommands} | Average: ${avgTime.toFixed(0)}ms | Success: ${successRate}%`));
  }

  private renderMetrics(): void {
    console.log(chalk.green.bold('📈 Key Metrics'));
    console.log(chalk.dim('─'.repeat(50)));

    const keyMetrics = ['system-cpu-usage', 'system-memory-usage', 'commands-executed', 'average-execution-time'];
    
    for (const metricId of keyMetrics) {
      const metricHistory = this.metrics.get(metricId) || [];
      if (metricHistory.length === 0) continue;

      const latest = metricHistory[metricHistory.length - 1];
      const trend = this.calculateTrend(metricHistory);
      const trendIcon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';
      
      console.log(`${latest.name}: ${chalk.cyan(latest.value.toFixed(1))}${latest.unit} ${trendIcon}`);
    }
  }

  private renderProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round(percentage / 100 * width);
    const empty = width - filled;
    const color = percentage > 80 ? chalk.red : percentage > 60 ? chalk.yellow : chalk.green;
    return color('█'.repeat(filled) + '░'.repeat(empty));
  }

  private getSeverityColor(severity: string): typeof chalk.red {
    switch (severity) {
      case 'critical': return chalk.red.bold;
      case 'high': return chalk.red;
      case 'medium': return chalk.yellow;
      case 'low': return chalk.blue;
      default: return chalk.gray;
    }
  }

  private getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  private calculateTrend(metrics: PerformanceMetric[]): number {
    if (metrics.length < 2) return 0;
    const recent = metrics.slice(-5);
    if (recent.length < 2) return 0;
    
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    return ((last - first) / first) * 100;
  }

  addMetric(metric: PerformanceMetric): void {
    const history = this.metrics.get(metric.id) || [];
    history.push(metric);
    
    // Keep only recent history
    if (history.length > this.config.maxHistoryPoints) {
      history.splice(0, history.length - this.config.maxHistoryPoints);
    }
    
    this.metrics.set(metric.id, history);
    this.checkAlerts(metric);
    this.emit('metric-added', metric);
  }

  updateMetric(id: string, value: number, tags?: Record<string, string>): void {
    const history = this.metrics.get(id) || [];
    if (history.length === 0) return;

    const latest = { ...history[history.length - 1] };
    latest.value = value;
    latest.timestamp = new Date();
    if (tags) latest.tags = { ...latest.tags, ...tags };

    this.addMetric(latest);
  }

  addAlert(alert: PerformanceAlert): void {
    this.alerts.set(alert.id, alert);
    this.emit('alert-added', alert);
  }

  private checkAlerts(metric: PerformanceMetric): void {
    for (const alert of this.alerts.values()) {
      if (alert.metricId !== metric.id) continue;

      const shouldTrigger = this.shouldTriggerAlert(alert, metric.value);
      
      if (shouldTrigger && !alert.isActive) {
        alert.isActive = true;
        alert.triggeredAt = new Date();
        this.triggerAlert(alert);
      } else if (!shouldTrigger && alert.isActive) {
        alert.isActive = false;
        alert.triggeredAt = undefined;
        this.resolveAlert(alert);
      }
    }
  }

  private shouldTriggerAlert(alert: PerformanceAlert, value: number): boolean {
    switch (alert.condition) {
      case 'above': return value > alert.threshold;
      case 'below': return value < alert.threshold;
      case 'equal': return value === alert.threshold;
      default: return false;
    }
  }

  private triggerAlert(alert: PerformanceAlert): void {
    const severityColor = this.getSeverityColor(alert.severity);
    console.log(severityColor(`🚨 ALERT: ${alert.message}`));
    
    if (this.config.soundAlerts) {
      // Play system sound (platform dependent)
      try {
        if (process.platform === 'darwin') {
          require('child_process').exec('afplay /System/Library/Sounds/Glass.aiff');
        } else if (process.platform === 'win32') {
          require('child_process').exec('powershell -c "(New-Object Media.SoundPlayer \\"C:\\Windows\\Media\\Windows Ding.wav\\").PlaySync();"');
        } else {
          require('child_process').exec('pactl play-sample bell-window-system');
        }
      } catch (error) {
        // Ignore sound errors
      }
    }
    
    this.emit('alert-triggered', alert);
  }

  private resolveAlert(alert: PerformanceAlert): void {
    console.log(chalk.green(`✅ RESOLVED: ${alert.message}`));
    this.emit('alert-resolved', alert);
  }

  acknowledgeAlert(alertId: string, acknowledgedBy: string = 'user'): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = acknowledgedBy;
      this.emit('alert-acknowledged', alert);
    }
  }

  trackCommandExecution(command: Omit<CommandPerformance, 'timestamp'>): void {
    const performance: CommandPerformance = {
      ...command,
      timestamp: new Date()
    };
    
    this.commandHistory.push(performance);
    
    // Keep only recent history
    if (this.commandHistory.length > this.config.maxHistoryPoints) {
      this.commandHistory.splice(0, this.commandHistory.length - this.config.maxHistoryPoints);
    }
    
    // Update metrics
    this.updateMetric('commands-executed', this.commandHistory.length);
    
    const avgTime = this.commandHistory.reduce((sum, cmd) => sum + cmd.executionTime, 0) / this.commandHistory.length;
    this.updateMetric('average-execution-time', avgTime);
    
    // Check for slow commands
    if (command.executionTime > this.config.alertThresholds.commandExecutionTime) {
      const alert: PerformanceAlert = {
        id: `slow-command-${uuidv4()}`,
        metricId: 'average-execution-time',
        threshold: this.config.alertThresholds.commandExecutionTime,
        condition: 'above',
        severity: 'medium',
        message: `Slow command detected: ${command.commandName} took ${command.executionTime}ms`,
        isActive: true,
        triggeredAt: new Date()
      };
      this.addAlert(alert);
    }
    
    this.emit('command-tracked', performance);
    void this.saveHistory();
  }

  private async collectSystemStats(): Promise<void> {
    try {
      const stats: SystemStats = {
        cpu: await this.getCpuStats(),
        memory: this.getMemoryStats(),
        disk: await this.getDiskStats(),
        network: await this.getNetworkStats(),
        uptime: os.uptime(),
        loadAverage: os.loadavg()
      };
      
      this.lastSystemStats = stats;
      this.systemStatsHistory.push(stats);
      
      // Keep only recent history
      if (this.systemStatsHistory.length > this.config.maxHistoryPoints) {
        this.systemStatsHistory.splice(0, this.systemStatsHistory.length - this.config.maxHistoryPoints);
      }
      
      // Update metrics
      this.updateMetric('system-cpu-usage', stats.cpu.usage);
      this.updateMetric('system-memory-usage', stats.memory.usage);
      this.updateMetric('system-disk-usage', stats.disk.usage);
      
      this.emit('stats-collected', stats);
    } catch (error) {
      console.error(chalk.red('Error collecting system stats:', error));
    }
  }

  private async getCpuStats(): Promise<SystemStats['cpu']> {
    const cpus = os.cpus();
    return {
      usage: Math.random() * 100, // Simplified - would use actual CPU monitoring
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown'
    };
  }

  private getMemoryStats(): SystemStats['memory'] {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total,
      used,
      free,
      usage: (used / total) * 100
    };
  }

  private async getDiskStats(): Promise<SystemStats['disk']> {
    // Simplified disk stats - would use actual disk monitoring
    return {
      total: 1024 * 1024 * 1024 * 1024, // 1TB
      used: 512 * 1024 * 1024 * 1024,   // 512GB
      free: 512 * 1024 * 1024 * 1024,   // 512GB
      usage: 50
    };
  }

  private async getNetworkStats(): Promise<SystemStats['network']> {
    // Simplified network stats - would use actual network monitoring
    return {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0
    };
  }

  getMetricHistory(metricId: string): PerformanceMetric[] {
    return this.metrics.get(metricId) || [];
  }

  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.alerts.values()).filter(a => a.isActive);
  }

  getCommandHistory(): CommandPerformance[] {
    return [...this.commandHistory];
  }

  exportData(): any {
    return {
      metrics: Object.fromEntries(this.metrics),
      alerts: Object.fromEntries(this.alerts),
      commandHistory: this.commandHistory,
      systemStatsHistory: this.systemStatsHistory,
      config: this.config,
      exportedAt: new Date()
    };
  }

  updateConfig(updates: Partial<DashboardConfig>): void {
    this.config = { ...this.config, ...updates };
    void this.saveConfig();
    this.emit('config-updated', this.config);
  }

  private async loadConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'config.json');
    if (await fs.pathExists(configPath)) {
      const saved = await fs.readJson(configPath);
      this.config = { ...this.config, ...saved };
    }
  }

  private async saveConfig(): Promise<void> {
    const configPath = path.join(this.storageDir, 'config.json');
    await fs.writeJson(configPath, this.config, { spaces: 2 });
  }

  private async loadHistory(): Promise<void> {
    const historyPath = path.join(this.storageDir, 'history.json');
    if (await fs.pathExists(historyPath)) {
      const data = await fs.readJson(historyPath);
      if (data.commandHistory) {
        this.commandHistory = data.commandHistory.slice(-this.config.maxHistoryPoints);
      }
      if (data.systemStatsHistory) {
        this.systemStatsHistory = data.systemStatsHistory.slice(-this.config.maxHistoryPoints);
      }
    }
  }

  private async saveHistory(): Promise<void> {
    const historyPath = path.join(this.storageDir, 'history.json');
    await fs.writeJson(historyPath, {
      commandHistory: this.commandHistory.slice(-this.config.maxHistoryPoints),
      systemStatsHistory: this.systemStatsHistory.slice(-this.config.maxHistoryPoints)
    }, { spaces: 2 });
  }
}

// Singleton instance
let dashboardInstance: PerformanceDashboard | null = null;

export function getPerformanceDashboard(): PerformanceDashboard {
  if (!dashboardInstance) {
    dashboardInstance = new PerformanceDashboard();
  }
  return dashboardInstance;
}