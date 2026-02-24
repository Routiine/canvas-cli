import { EventEmitter } from 'events';
import * as os from 'os';
import fs from 'fs-extra';
import * as path from 'path';
import { performanceConfig } from '../config/performance.js';
import { globalTokenMetrics, TokenMetrics } from './token-counter.js';

export interface PerformanceMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  process: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    uptime: number;
  };
  api: {
    requestCount: number;
    averageResponseTime: number;
    errorRate: number;
    tokenUsage: {
      input: number;
      output: number;
      total: number;
    };
  };
  tools: {
    executionCount: number;
    averageDuration: number;
    successRate: number;
    activeTools: number;
  };
  cache: {
    hits: number;
    misses: number;
    size: number;
    hitRate: number;
  };
}

export interface PerformanceAlert {
  type: 'cpu' | 'memory' | 'api' | 'error' | 'token';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export class PerformanceMonitor extends EventEmitter {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private startTime: number;
  private requestCount: number = 0;
  private totalResponseTime: number = 0;
  private errorCount: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private toolExecutions: number = 0;
  private toolDuration: number = 0;
  private toolSuccesses: number = 0;

  // Thresholds for alerts
  private thresholds = {
    cpu: { warning: 70, critical: 90 },
    memory: { warning: 80, critical: 95 },
    errorRate: { warning: 0.05, critical: 0.1 },
    responseTime: { warning: 2000, critical: 5000 },
    tokenUsage: { warning: 100000, critical: 150000 }
  };

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  constructor() {
    super();
    this.startTime = Date.now();
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.monitoringInterval) {
      return;
    }

    const config = performanceConfig.getConfig();
    if (!config.monitoring.enabled) {
      return;
    }

    this.monitoringInterval = setInterval(() => {
      this.collect();
    }, config.monitoring.metricsInterval);

    this.emit('monitoring-started');
    console.log('🔍 Performance monitoring started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.emit('monitoring-stopped');
      console.log('🛑 Performance monitoring stopped');
    }
  }

  /**
   * Collect current metrics
   */
  private collect(): void {
    const metrics = this.collectMetrics();
    this.metrics.push(metrics);
    
    // Keep only last hour of metrics
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > oneHourAgo);
    
    // Check for alerts
    this.checkAlerts(metrics);
    
    // Emit metrics
    this.emit('metrics-collected', metrics);
  }

  /**
   * Collect system and application metrics
   */
  private collectMetrics(): PerformanceMetrics {
    const cpuUsage = this.getCPUUsage();
    const memoryInfo = this.getMemoryInfo();
    const processInfo = this.getProcessInfo();
    const tokenMetrics = globalTokenMetrics.getSummary();
    
    return {
      timestamp: new Date(),
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length,
        loadAverage: os.loadavg()
      },
      memory: memoryInfo,
      process: processInfo,
      api: {
        requestCount: this.requestCount,
        averageResponseTime: this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
        tokenUsage: {
          input: tokenMetrics.totalInputTokens,
          output: tokenMetrics.totalOutputTokens,
          total: tokenMetrics.totalInputTokens + tokenMetrics.totalOutputTokens
        }
      },
      tools: {
        executionCount: this.toolExecutions,
        averageDuration: this.toolExecutions > 0 ? this.toolDuration / this.toolExecutions : 0,
        successRate: this.toolExecutions > 0 ? this.toolSuccesses / this.toolExecutions : 0,
        activeTools: 0 // Will be updated by tool executor
      },
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        size: 0, // Will be updated by cache manager
        hitRate: (this.cacheHits + this.cacheMisses) > 0 ? 
          this.cacheHits / (this.cacheHits + this.cacheMisses) : 0
      }
    };
  }

  /**
   * Get CPU usage percentage
   */
  private getCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    return 100 - Math.floor(100 * totalIdle / totalTick);
  }

  /**
   * Get memory information
   */
  private getMemoryInfo(): PerformanceMetrics['memory'] {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percentage: (usedMem / totalMem) * 100
    };
  }

  /**
   * Get process information
   */
  private getProcessInfo(): PerformanceMetrics['process'] {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime()
    };
  }

  /**
   * Check for performance alerts
   */
  private checkAlerts(metrics: PerformanceMetrics): void {
    // CPU alerts
    if (metrics.cpu.usage > this.thresholds.cpu.critical) {
      this.addAlert('cpu', 'critical', `CPU usage critical: ${metrics.cpu.usage}%`, 
        metrics.cpu.usage, this.thresholds.cpu.critical);
    } else if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      this.addAlert('cpu', 'high', `CPU usage high: ${metrics.cpu.usage}%`, 
        metrics.cpu.usage, this.thresholds.cpu.warning);
    }

    // Memory alerts
    if (metrics.memory.percentage > this.thresholds.memory.critical) {
      this.addAlert('memory', 'critical', `Memory usage critical: ${metrics.memory.percentage.toFixed(1)}%`, 
        metrics.memory.percentage, this.thresholds.memory.critical);
    } else if (metrics.memory.percentage > this.thresholds.memory.warning) {
      this.addAlert('memory', 'high', `Memory usage high: ${metrics.memory.percentage.toFixed(1)}%`, 
        metrics.memory.percentage, this.thresholds.memory.warning);
    }

    // Error rate alerts
    if (metrics.api.errorRate > this.thresholds.errorRate.critical) {
      this.addAlert('error', 'critical', `Error rate critical: ${(metrics.api.errorRate * 100).toFixed(1)}%`, 
        metrics.api.errorRate, this.thresholds.errorRate.critical);
    } else if (metrics.api.errorRate > this.thresholds.errorRate.warning) {
      this.addAlert('error', 'medium', `Error rate elevated: ${(metrics.api.errorRate * 100).toFixed(1)}%`, 
        metrics.api.errorRate, this.thresholds.errorRate.warning);
    }

    // Response time alerts
    if (metrics.api.averageResponseTime > this.thresholds.responseTime.critical) {
      this.addAlert('api', 'critical', `Response time critical: ${metrics.api.averageResponseTime}ms`, 
        metrics.api.averageResponseTime, this.thresholds.responseTime.critical);
    } else if (metrics.api.averageResponseTime > this.thresholds.responseTime.warning) {
      this.addAlert('api', 'medium', `Response time slow: ${metrics.api.averageResponseTime}ms`, 
        metrics.api.averageResponseTime, this.thresholds.responseTime.warning);
    }

    // Token usage alerts
    const totalTokens = metrics.api.tokenUsage.total;
    if (totalTokens > this.thresholds.tokenUsage.critical) {
      this.addAlert('token', 'critical', `Token usage critical: ${totalTokens}`, 
        totalTokens, this.thresholds.tokenUsage.critical);
    } else if (totalTokens > this.thresholds.tokenUsage.warning) {
      this.addAlert('token', 'high', `Token usage high: ${totalTokens}`, 
        totalTokens, this.thresholds.tokenUsage.warning);
    }
  }

  /**
   * Add performance alert
   */
  private addAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    value: number,
    threshold: number
  ): void {
    const alert: PerformanceAlert = {
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: new Date()
    };

    this.alerts.push(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    this.emit('alert', alert);

    // Log based on severity
    const config = performanceConfig.getConfig();
    if (severity === 'critical' || 
        (severity === 'high' && config.monitoring.logLevel !== 'error') ||
        (severity === 'medium' && ['debug', 'info'].includes(config.monitoring.logLevel))) {
      console.warn(`⚠️ Performance Alert: ${message}`);
    }
  }

  /**
   * Record API request
   */
  recordRequest(responseTime: number, error: boolean = false): void {
    this.requestCount++;
    this.totalResponseTime += responseTime;
    if (error) {
      this.errorCount++;
    }
  }

  /**
   * Record cache access
   */
  recordCacheAccess(hit: boolean): void {
    if (hit) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
  }

  /**
   * Record tool execution
   */
  recordToolExecution(duration: number, success: boolean = true): void {
    this.toolExecutions++;
    this.toolDuration += duration;
    if (success) {
      this.toolSuccesses++;
    }
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): PerformanceMetrics | undefined {
    return this.metrics[this.metrics.length - 1];
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(minutes: number = 60): PerformanceMetrics[] {
    const since = Date.now() - minutes * 60 * 1000;
    return this.metrics.filter(m => m.timestamp.getTime() > since);
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 10): PerformanceAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    uptime: number;
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    cacheHitRate: number;
    tokenUsage: { input: number; output: number; total: number };
    currentCPU: number;
    currentMemory: number;
    alertCount: number;
  } {
    const current = this.getCurrentMetrics();
    const tokenMetrics = globalTokenMetrics.getSummary();
    
    return {
      uptime: Date.now() - this.startTime,
      totalRequests: this.requestCount,
      averageResponseTime: this.requestCount > 0 ? this.totalResponseTime / this.requestCount : 0,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      cacheHitRate: (this.cacheHits + this.cacheMisses) > 0 ? 
        this.cacheHits / (this.cacheHits + this.cacheMisses) : 0,
      tokenUsage: {
        input: tokenMetrics.totalInputTokens,
        output: tokenMetrics.totalOutputTokens,
        total: tokenMetrics.totalInputTokens + tokenMetrics.totalOutputTokens
      },
      currentCPU: current?.cpu.usage || 0,
      currentMemory: current?.memory.percentage || 0,
      alertCount: this.alerts.length
    };
  }

  /**
   * Export metrics to file
   */
  async exportMetrics(filepath: string, format: 'json' | 'csv' = 'json'): Promise<void> {
    const data = format === 'json' ? 
      JSON.stringify(this.metrics, null, 2) :
      this.metricsToCSV();
    
    await fs.writeFile(filepath, data, 'utf-8');
  }

  /**
   * Convert metrics to CSV
   */
  private metricsToCSV(): string {
    const headers = [
      'timestamp', 'cpu_usage', 'memory_percentage', 
      'request_count', 'avg_response_time', 'error_rate',
      'token_input', 'token_output', 'cache_hit_rate'
    ];

    const rows = this.metrics.map(m => [
      m.timestamp.toISOString(),
      m.cpu.usage,
      m.memory.percentage.toFixed(2),
      m.api.requestCount,
      m.api.averageResponseTime.toFixed(2),
      (m.api.errorRate * 100).toFixed(2),
      m.api.tokenUsage.input,
      m.api.tokenUsage.output,
      (m.cache.hitRate * 100).toFixed(2)
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = [];
    this.alerts = [];
    this.requestCount = 0;
    this.totalResponseTime = 0;
    this.errorCount = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.toolExecutions = 0;
    this.toolDuration = 0;
    this.toolSuccesses = 0;
    this.startTime = Date.now();
    globalTokenMetrics.reset();
  }

  /**
   * Update thresholds
   */
  updateThresholds(thresholds: Partial<typeof this.thresholds>): void {
    Object.assign(this.thresholds, thresholds);
  }
}

/**
 * Performance dashboard generator
 */
export class PerformanceDashboard {
  private monitor = PerformanceMonitor.getInstance();

  /**
   * Generate text dashboard
   */
  generate(): string {
    const summary = this.monitor.getSummary();
    const metrics = this.monitor.getCurrentMetrics();
    const alerts = this.monitor.getAlerts(5);

    let dashboard = '\n╔══════════════════════════════════════════════╗\n';
    dashboard += '║         Canvas CLI Performance Monitor        ║\n';
    dashboard += '╚══════════════════════════════════════════════╝\n\n';

    // System metrics
    dashboard += '📊 System Metrics\n';
    dashboard += '─────────────────\n';
    dashboard += `CPU Usage:      ${this.createBar(metrics?.cpu.usage || 0, 100)} ${metrics?.cpu.usage || 0}%\n`;
    dashboard += `Memory Usage:   ${this.createBar(metrics?.memory.percentage || 0, 100)} ${metrics?.memory.percentage.toFixed(1) || 0}%\n`;
    dashboard += `Load Average:   ${metrics?.cpu.loadAverage.map(l => l.toFixed(2)).join(', ') || 'N/A'}\n\n`;

    // API metrics
    dashboard += '🌐 API Metrics\n';
    dashboard += '──────────────\n';
    dashboard += `Total Requests: ${summary.totalRequests}\n`;
    dashboard += `Avg Response:   ${summary.averageResponseTime.toFixed(0)}ms\n`;
    dashboard += `Error Rate:     ${(summary.errorRate * 100).toFixed(2)}%\n`;
    dashboard += `Cache Hit Rate: ${(summary.cacheHitRate * 100).toFixed(1)}%\n\n`;

    // Token usage
    dashboard += '🎯 Token Usage\n';
    dashboard += '──────────────\n';
    dashboard += `Input Tokens:   ${summary.tokenUsage.input.toLocaleString()}\n`;
    dashboard += `Output Tokens:  ${summary.tokenUsage.output.toLocaleString()}\n`;
    dashboard += `Total Tokens:   ${summary.tokenUsage.total.toLocaleString()}\n\n`;

    // Recent alerts
    if (alerts.length > 0) {
      dashboard += '⚠️ Recent Alerts\n';
      dashboard += '────────────────\n';
      for (const alert of alerts) {
        const icon = alert.severity === 'critical' ? '🔴' : 
                    alert.severity === 'high' ? '🟠' : 
                    alert.severity === 'medium' ? '🟡' : '🟢';
        dashboard += `${icon} ${alert.message}\n`;
      }
      dashboard += '\n';
    }

    // Uptime
    const uptimeHours = Math.floor(summary.uptime / 3600000);
    const uptimeMinutes = Math.floor((summary.uptime % 3600000) / 60000);
    dashboard += `⏱️ Uptime: ${uptimeHours}h ${uptimeMinutes}m\n`;

    return dashboard;
  }

  /**
   * Create progress bar
   */
  private createBar(value: number, max: number, width: number = 20): string {
    const percentage = Math.min(value / max, 1);
    const filled = Math.floor(percentage * width);
    const empty = width - filled;
    
    const color = percentage > 0.9 ? '🔴' : 
                  percentage > 0.7 ? '🟠' : 
                  percentage > 0.5 ? '🟡' : '🟢';
    
    return color + '█'.repeat(filled) + '░'.repeat(empty);
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();
export const performanceDashboard = new PerformanceDashboard();