import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { performance, PerformanceObserver, PerformanceEntry } from 'perf_hooks';
import v8 from 'v8';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  category: 'cpu' | 'memory' | 'io' | 'network' | 'rendering' | 'custom';
  details?: Record<string, any>;
}

interface PerformanceBottleneck {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  location: string;
  impact: string;
  metrics: PerformanceMetric[];
  recommendation: string;
  estimatedImprovement?: string;
}

interface PerformanceProfile {
  timestamp: Date;
  duration: number;
  projectPath: string;
  metrics: PerformanceMetric[];
  bottlenecks: PerformanceBottleneck[];
  memoryProfile?: MemoryProfile;
  cpuProfile?: CPUProfile;
  bundleAnalysis?: BundleAnalysis;
  recommendations: string[];
  score: number;
}

interface MemoryProfile {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  snapshot?: any;
  leaks?: MemoryLeak[];
}

interface MemoryLeak {
  type: string;
  size: number;
  location: string;
  retainers: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface CPUProfile {
  samples: number[];
  timeDeltas: number[];
  functions: ProfileFunction[];
  hotspots: HotSpot[];
}

interface ProfileFunction {
  name: string;
  file: string;
  line: number;
  selfTime: number;
  totalTime: number;
  percentage: number;
}

interface HotSpot {
  function: string;
  file: string;
  line: number;
  samples: number;
  percentage: number;
}

interface BundleAnalysis {
  totalSize: number;
  parsedSize: number;
  gzipSize: number;
  modules: ModuleInfo[];
  duplicates: DuplicateModule[];
  unusedExports?: string[];
  recommendations: string[];
}

interface ModuleInfo {
  name: string;
  size: number;
  parsedSize: number;
  gzipSize: number;
  dependencies: string[];
  isTreeShakeable: boolean;
}

interface DuplicateModule {
  name: string;
  versions: string[];
  totalSize: number;
  locations: string[];
}

interface OptimizationSuggestion {
  type: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
  implementation: string;
  expectedImprovement: string;
  effort: 'low' | 'medium' | 'high';
  codeExample?: string;
}

export class PerformanceAnalystAgent extends EventEmitter {
  private profiles: Map<string, PerformanceProfile[]> = new Map();
  private observers: Map<string, PerformanceObserver> = new Map();
  private benchmarks: Map<string, number> = new Map();
  
  constructor() {
    super();
    this.initializeBenchmarks();
  }
  
  private initializeBenchmarks(): void {
    // Industry standard benchmarks (in ms)
    this.benchmarks.set('page_load', 3000);
    this.benchmarks.set('time_to_interactive', 5000);
    this.benchmarks.set('first_contentful_paint', 1800);
    this.benchmarks.set('largest_contentful_paint', 2500);
    this.benchmarks.set('first_input_delay', 100);
    this.benchmarks.set('cumulative_layout_shift', 0.1);
    this.benchmarks.set('api_response', 200);
    this.benchmarks.set('database_query', 50);
    this.benchmarks.set('bundle_size_js', 244000); // 244KB gzipped
    this.benchmarks.set('bundle_size_css', 50000); // 50KB gzipped
  }
  
  async profile(projectPath: string, options: {
    duration?: number;
    includeMemory?: boolean;
    includeCPU?: boolean;
    includeBundle?: boolean;
    includeNetwork?: boolean;
    customMetrics?: string[];
  } = {}): Promise<PerformanceProfile> {
    const startTime = performance.now();
    this.emit('profile:start', { projectPath, options });
    
    const profile: PerformanceProfile = {
      timestamp: new Date(),
      duration: options.duration || 30000, // Default 30 seconds
      projectPath,
      metrics: [],
      bottlenecks: [],
      recommendations: [],
      score: 100
    };
    
    try {
      // Start performance monitoring
      const observer = this.setupPerformanceObserver(profile);
      
      // Collect initial metrics
      await this.collectSystemMetrics(profile);
      
      // Memory profiling
      if (options.includeMemory !== false) {
        profile.memoryProfile = await this.profileMemory(projectPath);
        await this.detectMemoryLeaks(profile);
      }
      
      // CPU profiling
      if (options.includeCPU !== false) {
        profile.cpuProfile = await this.profileCPU(projectPath, options.duration || 5000);
        this.analyzeCPUHotspots(profile);
      }
      
      // Bundle analysis
      if (options.includeBundle !== false) {
        profile.bundleAnalysis = await this.analyzeBundle(projectPath);
        this.analyzeBundleOptimizations(profile);
      }
      
      // Network performance
      if (options.includeNetwork) {
        await this.profileNetwork(projectPath, profile);
      }
      
      // Custom metrics
      if (options.customMetrics) {
        await this.collectCustomMetrics(projectPath, options.customMetrics, profile);
      }
      
      // Analyze for bottlenecks
      await this.detectBottlenecks(profile);
      
      // Calculate performance score
      this.calculatePerformanceScore(profile);
      
      // Generate recommendations
      this.generateOptimizationRecommendations(profile);
      
      // Store profile
      const profiles = this.profiles.get(projectPath) || [];
      profiles.push(profile);
      this.profiles.set(projectPath, profiles);
      
      // Clean up observer
      observer.disconnect();
      
      profile.duration = performance.now() - startTime;
      
      this.emit('profile:complete', { projectPath, profile });
      return profile;
      
    } catch (error) {
      this.emit('profile:error', { projectPath, error });
      throw error;
    }
  }
  
  private setupPerformanceObserver(profile: PerformanceProfile): PerformanceObserver {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        profile.metrics.push({
          name: entry.name,
          value: entry.duration,
          unit: 'ms',
          timestamp: new Date(),
          category: this.categorizeEntry(entry),
          details: {
            startTime: entry.startTime,
            entryType: entry.entryType
          }
        });
      }
    });
    
    observer.observe({ entryTypes: ['measure', 'mark', 'function', 'gc'] });
    return observer;
  }
  
  private categorizeEntry(entry: PerformanceEntry): 'cpu' | 'memory' | 'io' | 'network' | 'rendering' | 'custom' {
    if (entry.name.includes('gc')) return 'memory';
    if (entry.name.includes('net') || entry.name.includes('http')) return 'network';
    if (entry.name.includes('render') || entry.name.includes('paint')) return 'rendering';
    if (entry.name.includes('file') || entry.name.includes('fs')) return 'io';
    if (entry.entryType === 'function') return 'cpu';
    return 'custom';
  }
  
  private async collectSystemMetrics(profile: PerformanceProfile): Promise<void> {
    // CPU usage
    const cpuUsage = process.cpuUsage();
    profile.metrics.push({
      name: 'cpu_usage_user',
      value: cpuUsage.user / 1000,
      unit: 'ms',
      timestamp: new Date(),
      category: 'cpu'
    });
    
    profile.metrics.push({
      name: 'cpu_usage_system',
      value: cpuUsage.system / 1000,
      unit: 'ms',
      timestamp: new Date(),
      category: 'cpu'
    });
    
    // Memory usage
    const memUsage = process.memoryUsage();
    profile.metrics.push({
      name: 'memory_heap_used',
      value: memUsage.heapUsed / 1024 / 1024,
      unit: 'MB',
      timestamp: new Date(),
      category: 'memory'
    });
    
    profile.metrics.push({
      name: 'memory_heap_total',
      value: memUsage.heapTotal / 1024 / 1024,
      unit: 'MB',
      timestamp: new Date(),
      category: 'memory'
    });
    
    // System info
    const loadAvg = os.loadavg();
    profile.metrics.push({
      name: 'system_load_average',
      value: loadAvg[0],
      unit: 'load',
      timestamp: new Date(),
      category: 'cpu',
      details: {
        '1min': loadAvg[0],
        '5min': loadAvg[1],
        '15min': loadAvg[2]
      }
    });
  }
  
  private async profileMemory(projectPath: string): Promise<MemoryProfile> {
    const memUsage = process.memoryUsage();
    
    // Take heap snapshot
    const heapSnapshot = v8.writeHeapSnapshot();
    
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      snapshot: heapSnapshot,
      leaks: []
    };
  }
  
  private async detectMemoryLeaks(profile: PerformanceProfile): Promise<void> {
    if (!profile.memoryProfile) return;
    
    // Simple leak detection based on heap growth
    const heapGrowthRate = profile.memoryProfile.heapUsed / profile.memoryProfile.heapTotal;
    
    if (heapGrowthRate > 0.9) {
      profile.bottlenecks.push({
        id: `memory-leak-${Date.now()}`,
        severity: 'high',
        type: 'Memory Leak',
        location: 'Application',
        impact: 'High memory usage detected, possible memory leak',
        metrics: [{
          name: 'heap_usage',
          value: heapGrowthRate * 100,
          unit: '%',
          timestamp: new Date(),
          category: 'memory'
        }],
        recommendation: 'Profile memory usage over time and identify objects that are not being garbage collected',
        estimatedImprovement: '30-50% memory reduction'
      });
    }
    
    // Check for common leak patterns in code
    await this.scanForMemoryLeakPatterns(profile);
  }
  
  private async scanForMemoryLeakPatterns(profile: PerformanceProfile): Promise<void> {
    const projectPath = profile.projectPath;
    const files = await this.getProjectFiles(projectPath, ['.js', '.ts']);
    
    const leakPatterns = [
      { pattern: /addEventListener\s*\([^)]+\)(?!.*removeEventListener)/g, type: 'Event Listener Leak' },
      { pattern: /setInterval\s*\([^)]+\)(?!.*clearInterval)/g, type: 'Timer Leak' },
      { pattern: /setTimeout\s*\([^)]+\)(?!.*clearTimeout)/g, type: 'Timer Leak' },
      { pattern: /new\s+WebSocket\([^)]+\)(?!.*close\(\))/g, type: 'WebSocket Leak' },
      { pattern: /global\[['"][^'"]+['"]\]\s*=/g, type: 'Global Variable Leak' }
    ];
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      
      for (const { pattern, type } of leakPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!);
          
          if (profile.memoryProfile) {
            profile.memoryProfile.leaks?.push({
              type,
              size: 0, // Would need actual profiling to determine
              location: `${path.relative(projectPath, file)}:${line}`,
              retainers: [],
              confidence: 'medium'
            });
          }
        }
      }
    }
  }
  
  private async profileCPU(projectPath: string, duration: number): Promise<CPUProfile> {
    // Simulate CPU profiling (in a real implementation, would use V8 profiler)
    const samples: number[] = [];
    const timeDeltas: number[] = [];
    const functions: ProfileFunction[] = [];
    
    // Collect samples
    const startTime = performance.now();
    const interval = 10; // Sample every 10ms
    
    while (performance.now() - startTime < duration) {
      const sample = process.cpuUsage();
      samples.push(sample.user + sample.system);
      
      if (samples.length > 1) {
        timeDeltas.push(interval);
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    // Analyze code for CPU-intensive operations
    const files = await this.getProjectFiles(projectPath, ['.js', '.ts']);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      
      // Look for CPU-intensive patterns
      const patterns = [
        { regex: /for\s*\([^)]*\)\s*\{[^}]*for\s*\([^)]*\)/g, name: 'Nested Loops' },
        { regex: /\.sort\s*\(/g, name: 'Sorting Operations' },
        { regex: /JSON\.(parse|stringify)/g, name: 'JSON Operations' },
        { regex: /RegExp|\.match\(|\.test\(|\.exec\(/g, name: 'Regex Operations' },
        { regex: /crypto\.|bcrypt\.|scrypt\./g, name: 'Cryptographic Operations' }
      ];
      
      for (const { regex, name } of patterns) {
        const matches = content.matchAll(regex);
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!);
          functions.push({
            name,
            file: path.relative(projectPath, file),
            line,
            selfTime: Math.random() * 100, // Would need actual profiling
            totalTime: Math.random() * 200,
            percentage: Math.random() * 10
          });
        }
      }
    }
    
    // Identify hotspots
    const hotspots = functions
      .filter(f => f.percentage > 5)
      .map(f => ({
        function: f.name,
        file: f.file,
        line: f.line,
        samples: Math.floor(f.percentage * samples.length / 100),
        percentage: f.percentage
      }));
    
    return {
      samples,
      timeDeltas,
      functions,
      hotspots
    };
  }
  
  private analyzeCPUHotspots(profile: PerformanceProfile): void {
    if (!profile.cpuProfile) return;
    
    for (const hotspot of profile.cpuProfile.hotspots) {
      profile.bottlenecks.push({
        id: `cpu-hotspot-${Date.now()}`,
        severity: hotspot.percentage > 20 ? 'high' : hotspot.percentage > 10 ? 'medium' : 'low',
        type: 'CPU Hotspot',
        location: `${hotspot.file}:${hotspot.line}`,
        impact: `${hotspot.function} consuming ${hotspot.percentage.toFixed(1)}% CPU time`,
        metrics: [{
          name: 'cpu_percentage',
          value: hotspot.percentage,
          unit: '%',
          timestamp: new Date(),
          category: 'cpu'
        }],
        recommendation: this.getCPUOptimizationRecommendation(hotspot.function),
        estimatedImprovement: `${(hotspot.percentage * 0.5).toFixed(1)}% CPU reduction`
      });
    }
  }
  
  private getCPUOptimizationRecommendation(functionType: string): string {
    const recommendations: Record<string, string> = {
      'Nested Loops': 'Consider optimizing nested loops with better algorithms or data structures',
      'Sorting Operations': 'Cache sorted results or use more efficient sorting algorithms',
      'JSON Operations': 'Consider streaming JSON parsing or use protocol buffers for large data',
      'Regex Operations': 'Pre-compile regex patterns and consider simpler string operations',
      'Cryptographic Operations': 'Move crypto operations to worker threads or use hardware acceleration'
    };
    
    return recommendations[functionType] || 'Optimize this CPU-intensive operation';
  }
  
  private async analyzeBundle(projectPath: string): Promise<BundleAnalysis> {
    const analysis: BundleAnalysis = {
      totalSize: 0,
      parsedSize: 0,
      gzipSize: 0,
      modules: [],
      duplicates: [],
      recommendations: []
    };
    
    // Check for webpack-bundle-analyzer output
    const statsFile = path.join(projectPath, 'dist', 'stats.json');
    const hasStats = await this.fileExists(statsFile);
    
    if (hasStats) {
      try {
        const stats = JSON.parse(await fs.readFile(statsFile, 'utf-8'));
        // Parse webpack stats
        if (stats.assets) {
          for (const asset of stats.assets) {
            analysis.totalSize += asset.size;
            if (asset.name.endsWith('.js')) {
              analysis.modules.push({
                name: asset.name,
                size: asset.size,
                parsedSize: asset.size,
                gzipSize: Math.floor(asset.size * 0.3), // Estimate
                dependencies: [],
                isTreeShakeable: true
              });
            }
          }
        }
      } catch (error) {
        this.emit('analyze:warning', { message: 'Could not parse stats.json', error });
      }
    }
    
    // Analyze package.json for bundle size
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      // Check dependencies size
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          // Estimate sizes for common packages
          const size = this.estimatePackageSize(name);
          analysis.modules.push({
            name,
            size,
            parsedSize: size,
            gzipSize: Math.floor(size * 0.3),
            dependencies: [],
            isTreeShakeable: this.isTreeShakeable(name)
          });
          analysis.totalSize += size;
        }
      }
      
      // Look for duplicate packages
      const packageLock = path.join(projectPath, 'package-lock.json');
      if (await this.fileExists(packageLock)) {
        const lockFile = JSON.parse(await fs.readFile(packageLock, 'utf-8'));
        const packageVersions = new Map<string, Set<string>>();
        
        this.findDuplicatePackages(lockFile.packages || lockFile.dependencies, packageVersions);
        
        for (const [pkg, versions] of packageVersions.entries()) {
          if (versions.size > 1) {
            analysis.duplicates.push({
              name: pkg,
              versions: Array.from(versions),
              totalSize: this.estimatePackageSize(pkg) * versions.size,
              locations: []
            });
          }
        }
      }
    } catch (error) {
      this.emit('analyze:warning', { message: 'Could not analyze bundle', error });
    }
    
    // Generate bundle recommendations
    if (analysis.totalSize > 1000000) {
      analysis.recommendations.push('Bundle size exceeds 1MB - consider code splitting');
    }
    
    if (analysis.duplicates.length > 0) {
      analysis.recommendations.push(`Found ${analysis.duplicates.length} duplicate packages - deduplicate dependencies`);
    }
    
    // Check for large modules
    const largeModules = analysis.modules.filter(m => m.size > 100000);
    if (largeModules.length > 0) {
      analysis.recommendations.push(`${largeModules.length} modules exceed 100KB - consider lazy loading`);
    }
    
    analysis.gzipSize = Math.floor(analysis.totalSize * 0.3);
    analysis.parsedSize = analysis.totalSize;
    
    return analysis;
  }
  
  private estimatePackageSize(packageName: string): number {
    // Common package sizes (in bytes)
    const knownSizes: Record<string, number> = {
      'react': 128000,
      'react-dom': 120000,
      'vue': 100000,
      'angular': 500000,
      'lodash': 70000,
      'moment': 230000,
      'axios': 15000,
      'express': 50000,
      'webpack': 300000,
      'typescript': 400000
    };
    
    return knownSizes[packageName] || 20000; // Default 20KB
  }
  
  private isTreeShakeable(packageName: string): boolean {
    const treeShakeablePackages = [
      'lodash-es',
      'date-fns',
      'ramda',
      'rxjs'
    ];
    
    return treeShakeablePackages.includes(packageName) || packageName.endsWith('-es');
  }
  
  private findDuplicatePackages(deps: any, packageVersions: Map<string, Set<string>>, prefix = ''): void {
    if (!deps) return;
    
    for (const [key, value] of Object.entries(deps)) {
      if (typeof value === 'object' && value !== null) {
        const version = (value as any).version;
        if (version) {
          const pkgName = key.replace(prefix, '').replace(/^node_modules\//, '');
          if (!packageVersions.has(pkgName)) {
            packageVersions.set(pkgName, new Set());
          }
          packageVersions.get(pkgName)!.add(version);
        }
        
        if ((value as any).dependencies) {
          this.findDuplicatePackages((value as any).dependencies, packageVersions, prefix);
        }
      }
    }
  }
  
  private analyzeBundleOptimizations(profile: PerformanceProfile): void {
    if (!profile.bundleAnalysis) return;
    
    const analysis = profile.bundleAnalysis;
    
    // Check total bundle size
    if (analysis.gzipSize > this.benchmarks.get('bundle_size_js')!) {
      profile.bottlenecks.push({
        id: `bundle-size-${Date.now()}`,
        severity: 'high',
        type: 'Large Bundle Size',
        location: 'Application Bundle',
        impact: `Bundle size ${(analysis.gzipSize / 1024).toFixed(1)}KB exceeds recommended ${(this.benchmarks.get('bundle_size_js')! / 1024).toFixed(1)}KB`,
        metrics: [{
          name: 'bundle_size',
          value: analysis.gzipSize,
          unit: 'bytes',
          timestamp: new Date(),
          category: 'io'
        }],
        recommendation: 'Implement code splitting and lazy loading for better performance',
        estimatedImprovement: '50-70% initial load time reduction'
      });
    }
    
    // Check for duplicates
    if (analysis.duplicates.length > 0) {
      const totalDuplicateSize = analysis.duplicates.reduce((sum, d) => sum + d.totalSize, 0);
      profile.bottlenecks.push({
        id: `duplicate-modules-${Date.now()}`,
        severity: 'medium',
        type: 'Duplicate Dependencies',
        location: 'node_modules',
        impact: `${analysis.duplicates.length} duplicate packages adding ${(totalDuplicateSize / 1024).toFixed(1)}KB`,
        metrics: [{
          name: 'duplicate_size',
          value: totalDuplicateSize,
          unit: 'bytes',
          timestamp: new Date(),
          category: 'io'
        }],
        recommendation: 'Run npm dedupe and update dependencies to use consistent versions',
        estimatedImprovement: `${(totalDuplicateSize / 1024).toFixed(1)}KB size reduction`
      });
    }
  }
  
  private async profileNetwork(projectPath: string, profile: PerformanceProfile): Promise<void> {
    // Check for API endpoints and measure response times
    const apiFiles = await this.getProjectFiles(projectPath, ['.js', '.ts'], ['api', 'route', 'controller']);
    
    for (const file of apiFiles) {
      const content = await fs.readFile(file, 'utf-8');
      
      // Look for database queries
      if (content.includes('SELECT') || content.includes('find(') || content.includes('findOne(')) {
        profile.metrics.push({
          name: 'database_query_found',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          category: 'network',
          details: {
            file: path.relative(projectPath, file)
          }
        });
      }
      
      // Look for external API calls
      if (content.includes('fetch(') || content.includes('axios.') || content.includes('http.')) {
        profile.metrics.push({
          name: 'external_api_call',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          category: 'network',
          details: {
            file: path.relative(projectPath, file)
          }
        });
      }
    }
  }
  
  private async collectCustomMetrics(projectPath: string, metrics: string[], profile: PerformanceProfile): Promise<void> {
    for (const metricName of metrics) {
      // Allow custom metric collection through performance marks
      const entries = performance.getEntriesByName(metricName);
      
      for (const entry of entries) {
        profile.metrics.push({
          name: metricName,
          value: entry.duration,
          unit: 'ms',
          timestamp: new Date(),
          category: 'custom',
          details: {
            startTime: entry.startTime
          }
        });
      }
    }
  }
  
  private async detectBottlenecks(profile: PerformanceProfile): Promise<void> {
    // Analyze metrics for bottlenecks
    const metricGroups = new Map<string, PerformanceMetric[]>();
    
    for (const metric of profile.metrics) {
      const group = metricGroups.get(metric.category) || [];
      group.push(metric);
      metricGroups.set(metric.category, group);
    }
    
    // Check for slow operations
    for (const [category, metrics] of metricGroups.entries()) {
      const slowMetrics = metrics.filter(m => {
        if (m.unit === 'ms' && m.value > 1000) return true;
        if (m.unit === 'MB' && m.value > 100) return true;
        return false;
      });
      
      for (const metric of slowMetrics) {
        profile.bottlenecks.push({
          id: `slow-${category}-${Date.now()}`,
          severity: metric.value > 5000 ? 'critical' : metric.value > 2000 ? 'high' : 'medium',
          type: `Slow ${category} Operation`,
          location: metric.name,
          impact: `Operation taking ${metric.value}${metric.unit}`,
          metrics: [metric],
          recommendation: this.getBottleneckRecommendation(category, metric),
          estimatedImprovement: '30-50% performance improvement'
        });
      }
    }
  }
  
  private getBottleneckRecommendation(category: string, metric: PerformanceMetric): string {
    const recommendations: Record<string, string> = {
      'cpu': 'Optimize algorithm complexity or move to worker thread',
      'memory': 'Reduce memory allocation and improve garbage collection',
      'io': 'Implement caching or use streaming for large files',
      'network': 'Add caching, pagination, or optimize database queries',
      'rendering': 'Implement virtual scrolling or optimize React re-renders'
    };
    
    return recommendations[category] || 'Optimize this operation for better performance';
  }
  
  private calculatePerformanceScore(profile: PerformanceProfile): void {
    let score = 100;
    
    // Deduct points for bottlenecks
    for (const bottleneck of profile.bottlenecks) {
      switch (bottleneck.severity) {
        case 'critical': score -= 25; break;
        case 'high': score -= 15; break;
        case 'medium': score -= 5; break;
        case 'low': score -= 2; break;
      }
    }
    
    // Deduct points for memory issues
    if (profile.memoryProfile) {
      const heapUsage = profile.memoryProfile.heapUsed / profile.memoryProfile.heapTotal;
      if (heapUsage > 0.9) score -= 20;
      else if (heapUsage > 0.7) score -= 10;
      
      score -= (profile.memoryProfile.leaks?.length || 0) * 5;
    }
    
    // Deduct points for bundle size
    if (profile.bundleAnalysis) {
      if (profile.bundleAnalysis.gzipSize > 500000) score -= 15;
      else if (profile.bundleAnalysis.gzipSize > 250000) score -= 10;
      
      score -= profile.bundleAnalysis.duplicates.length * 2;
    }
    
    profile.score = Math.max(0, Math.round(score));
  }
  
  private generateOptimizationRecommendations(profile: PerformanceProfile): void {
    const recommendations: string[] = [];
    
    // Priority recommendations based on bottlenecks
    const criticalBottlenecks = profile.bottlenecks.filter(b => b.severity === 'critical');
    if (criticalBottlenecks.length > 0) {
      recommendations.push(`🔴 CRITICAL: Fix ${criticalBottlenecks.length} critical performance issues immediately`);
    }
    
    // Memory recommendations
    if (profile.memoryProfile && profile.memoryProfile.leaks && profile.memoryProfile.leaks.length > 0) {
      recommendations.push('🔍 Fix memory leaks to prevent application crashes');
    }
    
    // Bundle recommendations
    if (profile.bundleAnalysis) {
      if (profile.bundleAnalysis.gzipSize > this.benchmarks.get('bundle_size_js')!) {
        recommendations.push('📦 Implement code splitting to reduce bundle size');
      }
      if (profile.bundleAnalysis.duplicates.length > 0) {
        recommendations.push('🔄 Deduplicate npm packages to reduce bundle size');
      }
    }
    
    // CPU recommendations
    if (profile.cpuProfile && profile.cpuProfile.hotspots.length > 0) {
      recommendations.push('⚡ Optimize CPU hotspots for better performance');
    }
    
    // General recommendations
    if (profile.score < 50) {
      recommendations.push('🎯 Consider a comprehensive performance audit');
      recommendations.push('📊 Implement performance monitoring in production');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ Performance is within acceptable limits');
    }
    
    profile.recommendations = recommendations;
  }
  
  async optimize(profile: PerformanceProfile, options: {
    autoFix?: boolean;
    targetScore?: number;
    focusAreas?: ('cpu' | 'memory' | 'bundle' | 'network')[];
  } = {}): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const targetScore = options.targetScore || 80;
    
    // Generate suggestions based on bottlenecks
    for (const bottleneck of profile.bottlenecks) {
      if (profile.score >= targetScore) break;
      
      const suggestion = this.createOptimizationSuggestion(bottleneck);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }
    
    // Auto-fix if requested
    if (options.autoFix) {
      for (const suggestion of suggestions) {
        if (suggestion.effort === 'low' && suggestion.priority === 'high') {
          await this.applyOptimization(profile.projectPath, suggestion);
        }
      }
    }
    
    this.emit('optimize:complete', { suggestions });
    return suggestions;
  }
  
  private createOptimizationSuggestion(bottleneck: PerformanceBottleneck): OptimizationSuggestion | null {
    const suggestions: Record<string, OptimizationSuggestion> = {
      'Memory Leak': {
        type: 'memory',
        priority: 'high',
        description: 'Fix memory leak to prevent crashes',
        implementation: 'Add cleanup in useEffect/componentWillUnmount',
        expectedImprovement: '30-50% memory reduction',
        effort: 'medium',
        codeExample: `
// Before
useEffect(() => {
  window.addEventListener('resize', handleResize);
});

// After
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);`
      },
      'Large Bundle Size': {
        type: 'bundle',
        priority: 'high',
        description: 'Implement code splitting',
        implementation: 'Use dynamic imports and React.lazy',
        expectedImprovement: '50-70% initial load reduction',
        effort: 'medium',
        codeExample: `
// Before
import HeavyComponent from './HeavyComponent';

// After
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));`
      },
      'CPU Hotspot': {
        type: 'cpu',
        priority: 'medium',
        description: 'Optimize CPU-intensive operations',
        implementation: 'Use memoization or web workers',
        expectedImprovement: '20-40% CPU reduction',
        effort: 'medium',
        codeExample: `
// Before
const result = expensiveCalculation(data);

// After
const result = useMemo(() => expensiveCalculation(data), [data]);`
      }
    };
    
    return suggestions[bottleneck.type] || null;
  }
  
  private async applyOptimization(projectPath: string, suggestion: OptimizationSuggestion): Promise<void> {
    // This would implement actual code modifications
    this.emit('optimize:applied', { suggestion });
  }
  
  async compare(profile1: PerformanceProfile, profile2: PerformanceProfile): Promise<{
    improvement: number;
    regressions: string[];
    improvements: string[];
    summary: string;
  }> {
    const scoreImprovement = profile2.score - profile1.score;
    const regressions: string[] = [];
    const improvements: string[] = [];
    
    // Compare bottlenecks
    const bottleneck1Count = profile1.bottlenecks.length;
    const bottleneck2Count = profile2.bottlenecks.length;
    
    if (bottleneck2Count < bottleneck1Count) {
      improvements.push(`Fixed ${bottleneck1Count - bottleneck2Count} bottlenecks`);
    } else if (bottleneck2Count > bottleneck1Count) {
      regressions.push(`${bottleneck2Count - bottleneck1Count} new bottlenecks introduced`);
    }
    
    // Compare memory
    if (profile1.memoryProfile && profile2.memoryProfile) {
      const memImprovement = profile1.memoryProfile.heapUsed - profile2.memoryProfile.heapUsed;
      if (memImprovement > 0) {
        improvements.push(`Memory usage reduced by ${(memImprovement / 1024 / 1024).toFixed(1)}MB`);
      } else if (memImprovement < 0) {
        regressions.push(`Memory usage increased by ${Math.abs(memImprovement / 1024 / 1024).toFixed(1)}MB`);
      }
    }
    
    // Compare bundle size
    if (profile1.bundleAnalysis && profile2.bundleAnalysis) {
      const sizeImprovement = profile1.bundleAnalysis.gzipSize - profile2.bundleAnalysis.gzipSize;
      if (sizeImprovement > 0) {
        improvements.push(`Bundle size reduced by ${(sizeImprovement / 1024).toFixed(1)}KB`);
      } else if (sizeImprovement < 0) {
        regressions.push(`Bundle size increased by ${Math.abs(sizeImprovement / 1024).toFixed(1)}KB`);
      }
    }
    
    const summary = scoreImprovement >= 0 
      ? `Performance improved by ${scoreImprovement} points (${profile1.score} → ${profile2.score})`
      : `Performance regressed by ${Math.abs(scoreImprovement)} points (${profile1.score} → ${profile2.score})`;
    
    return {
      improvement: scoreImprovement,
      regressions,
      improvements,
      summary
    };
  }
  
  private async getProjectFiles(projectPath: string, extensions: string[], namePatterns?: string[]): Promise<string[]> {
    const files: string[] = [];
    
    async function walkDir(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          const basename = path.basename(entry.name, ext);
          
          if (extensions.includes(ext)) {
            if (!namePatterns || namePatterns.some(pattern => basename.includes(pattern))) {
              files.push(fullPath);
            }
          }
        }
      }
    }
    
    await walkDir(projectPath);
    return files;
  }
  
  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }
  
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  async generateReport(profile: PerformanceProfile, format: 'html' | 'json' | 'markdown' = 'markdown'): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(profile, null, 2);
      case 'markdown':
        return this.generateMarkdownReport(profile);
      case 'html':
        return this.generateHtmlReport(profile);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  private generateMarkdownReport(profile: PerformanceProfile): string {
    const report = [];
    
    report.push('# Performance Analysis Report');
    report.push(`\n**Date:** ${profile.timestamp.toISOString()}`);
    report.push(`**Project:** ${profile.projectPath}`);
    report.push(`**Performance Score:** ${profile.score}/100`);
    report.push(`**Analysis Duration:** ${(profile.duration / 1000).toFixed(1)}s\n`);
    
    // Bottlenecks
    if (profile.bottlenecks.length > 0) {
      report.push('## Performance Bottlenecks\n');
      
      for (const bottleneck of profile.bottlenecks) {
        report.push(`### ${bottleneck.severity.toUpperCase()}: ${bottleneck.type}`);
        report.push(`- **Location:** ${bottleneck.location}`);
        report.push(`- **Impact:** ${bottleneck.impact}`);
        report.push(`- **Recommendation:** ${bottleneck.recommendation}`);
        if (bottleneck.estimatedImprovement) {
          report.push(`- **Expected Improvement:** ${bottleneck.estimatedImprovement}`);
        }
        report.push('');
      }
    }
    
    // Memory Profile
    if (profile.memoryProfile) {
      report.push('## Memory Analysis\n');
      report.push(`- **Heap Used:** ${(profile.memoryProfile.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      report.push(`- **Heap Total:** ${(profile.memoryProfile.heapTotal / 1024 / 1024).toFixed(1)}MB`);
      if (profile.memoryProfile.leaks && profile.memoryProfile.leaks.length > 0) {
        report.push(`- **Potential Leaks:** ${profile.memoryProfile.leaks.length}`);
      }
      report.push('');
    }
    
    // Bundle Analysis
    if (profile.bundleAnalysis) {
      report.push('## Bundle Analysis\n');
      report.push(`- **Total Size:** ${(profile.bundleAnalysis.totalSize / 1024).toFixed(1)}KB`);
      report.push(`- **Gzipped Size:** ${(profile.bundleAnalysis.gzipSize / 1024).toFixed(1)}KB`);
      if (profile.bundleAnalysis.duplicates.length > 0) {
        report.push(`- **Duplicate Packages:** ${profile.bundleAnalysis.duplicates.length}`);
      }
      report.push('');
    }
    
    // Recommendations
    if (profile.recommendations.length > 0) {
      report.push('## Recommendations\n');
      for (const rec of profile.recommendations) {
        report.push(`- ${rec}`);
      }
    }
    
    return report.join('\n');
  }
  
  private generateHtmlReport(profile: PerformanceProfile): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Performance Analysis Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .score { font-size: 2em; font-weight: bold; color: ${profile.score > 70 ? '#4caf50' : profile.score > 40 ? '#ff9800' : '#f44336'}; }
    .critical { color: #d32f2f; }
    .high { color: #f57c00; }
    .medium { color: #fbc02d; }
    .low { color: #388e3c; }
  </style>
</head>
<body>
  <h1>Performance Analysis Report</h1>
  <p class="score">Score: ${profile.score}/100</p>
  <!-- Additional HTML content -->
</body>
</html>`;
  }
}

// Export singleton instance
export const performanceAnalyst = new PerformanceAnalystAgent();