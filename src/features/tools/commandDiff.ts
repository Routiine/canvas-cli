import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface CommandExecution {
  id: string;
  command: string;
  args: string[];
  timestamp: number;
  duration?: number;
  exitCode?: number;
  output?: {
    stdout: string;
    stderr: string;
  };
  environment: {
    cwd: string;
    env: Record<string, string>;
    shell: string;
  };
  metadata: {
    user: string;
    session: string;
    tags: string[];
  };
}

export interface CommandDiff {
  id: string;
  baseExecution: CommandExecution;
  compareExecution: CommandExecution;
  differences: {
    command: DiffResult;
    args: DiffResult;
    output: OutputDiff;
    environment: EnvironmentDiff;
    performance: PerformanceDiff;
  };
  analysis: {
    similarity: number;
    impactLevel: 'low' | 'medium' | 'high';
    recommendations: string[];
  };
  timestamp: number;
}

export interface DiffResult {
  type: 'identical' | 'modified' | 'added' | 'removed';
  changes: Array<{
    type: 'addition' | 'deletion' | 'modification';
    position: number;
    oldValue?: string;
    newValue?: string;
    context?: string;
  }>;
}

export interface OutputDiff {
  stdout: {
    identical: boolean;
    additions: string[];
    deletions: string[];
    modifications: Array<{ line: number; old: string; new: string }>;
    similarity: number;
  };
  stderr: {
    identical: boolean;
    additions: string[];
    deletions: string[];
    modifications: Array<{ line: number; old: string; new: string }>;
    similarity: number;
  };
}

export interface EnvironmentDiff {
  cwd: { changed: boolean; from?: string; to?: string };
  env: {
    added: Record<string, string>;
    removed: Record<string, string>;
    modified: Record<string, { from: string; to: string }>;
  };
  shell: { changed: boolean; from?: string; to?: string };
}

export interface PerformanceDiff {
  durationChange: number;
  durationChangePercent: number;
  exitCodeChanged: boolean;
  performanceImpact: 'improved' | 'degraded' | 'neutral';
}

export interface DiffConfig {
  includeEnvironment: boolean;
  includeOutput: boolean;
  ignoreWhitespace: boolean;
  contextLines: number;
  maxOutputLength: number;
  enablePersistence: boolean;
  autoSuggest: boolean;
}

class CommandDiffing extends EventEmitter {
  private executions: Map<string, CommandExecution> = new Map();
  private diffs: Map<string, CommandDiff> = new Map();
  private config: DiffConfig;
  private currentSession: string;

  constructor() {
    super();
    this.currentSession = crypto.randomUUID();
    this.config = {
      includeEnvironment: true,
      includeOutput: true,
      ignoreWhitespace: true,
      contextLines: 3,
      maxOutputLength: 10000,
      enablePersistence: true,
      autoSuggest: true
    };
  }

  /**
   * Record a command execution
   */
  public recordExecution(
    command: string,
    args: string[] = [],
    options: {
      output?: { stdout: string; stderr: string };
      duration?: number;
      exitCode?: number;
      cwd?: string;
      env?: Record<string, string>;
      tags?: string[];
    } = {}
  ): string {
    const id = crypto.randomUUID();
    const execution: CommandExecution = {
      id,
      command,
      args,
      timestamp: Date.now(),
      duration: options.duration,
      exitCode: options.exitCode,
      output: options.output,
      environment: {
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env as Record<string, string>,
        shell: process.env.SHELL || 'unknown'
      },
      metadata: {
        user: process.env.USER || 'unknown',
        session: this.currentSession,
        tags: options.tags || []
      }
    };

    this.executions.set(id, execution);
    this.emit('execution:recorded', execution);

    // Auto-suggest similar commands if enabled
    if (this.config.autoSuggest) {
      this.suggestSimilarCommands(execution);
    }

    return id;
  }

  /**
   * Compare two command executions
   */
  public compareExecutions(baseId: string, compareId: string): CommandDiff {
    const baseExecution = this.executions.get(baseId);
    const compareExecution = this.executions.get(compareId);

    if (!baseExecution) {
      throw new Error(`Base execution ${baseId} not found`);
    }
    if (!compareExecution) {
      throw new Error(`Compare execution ${compareId} not found`);
    }

    const diffId = `${baseId}-vs-${compareId}`;
    const diff = this.generateDiff(baseExecution, compareExecution);
    
    this.diffs.set(diffId, diff);
    this.emit('diff:created', diff);
    
    return diff;
  }

  /**
   * Generate comprehensive diff between two executions
   */
  private generateDiff(base: CommandExecution, compare: CommandExecution): CommandDiff {
    const commandDiff = this.diffStrings(base.command, compare.command);
    const argsDiff = this.diffArrays(base.args, compare.args);
    const outputDiff = this.diffOutputs(base.output, compare.output);
    const envDiff = this.diffEnvironments(base.environment, compare.environment);
    const perfDiff = this.diffPerformance(base, compare);

    const similarity = this.calculateSimilarity(base, compare);
    const impactLevel = this.assessImpact(outputDiff, envDiff, perfDiff);
    const recommendations = this.generateRecommendations(base, compare, outputDiff, envDiff, perfDiff);

    return {
      id: `${base.id}-vs-${compare.id}`,
      baseExecution: base,
      compareExecution: compare,
      differences: {
        command: commandDiff,
        args: argsDiff,
        output: outputDiff,
        environment: envDiff,
        performance: perfDiff
      },
      analysis: {
        similarity,
        impactLevel,
        recommendations
      },
      timestamp: Date.now()
    };
  }

  /**
   * Diff two strings
   */
  private diffStrings(str1: string, str2: string): DiffResult {
    if (str1 === str2) {
      return { type: 'identical', changes: [] };
    }

    const changes: DiffResult['changes'] = [];
    
    // Simple character-by-character comparison
    const maxLen = Math.max(str1.length, str2.length);
    const diffType: DiffResult['type'] = 'modified';
    
    for (let i = 0; i < maxLen; i++) {
      const char1 = str1[i];
      const char2 = str2[i];
      
      if (char1 !== char2) {
        if (char1 === undefined) {
          changes.push({
            type: 'addition',
            position: i,
            newValue: char2,
            context: str2.substring(Math.max(0, i - 5), i + 5)
          });
        } else if (char2 === undefined) {
          changes.push({
            type: 'deletion',
            position: i,
            oldValue: char1,
            context: str1.substring(Math.max(0, i - 5), i + 5)
          });
        } else {
          changes.push({
            type: 'modification',
            position: i,
            oldValue: char1,
            newValue: char2,
            context: `${str1.substring(Math.max(0, i - 5), i + 5)} -> ${str2.substring(Math.max(0, i - 5), i + 5)}`
          });
        }
      }
    }

    return { type: diffType, changes };
  }

  /**
   * Diff two arrays
   */
  private diffArrays(arr1: string[], arr2: string[]): DiffResult {
    if (JSON.stringify(arr1) === JSON.stringify(arr2)) {
      return { type: 'identical', changes: [] };
    }

    const changes: DiffResult['changes'] = [];
    const maxLen = Math.max(arr1.length, arr2.length);

    for (let i = 0; i < maxLen; i++) {
      const item1 = arr1[i];
      const item2 = arr2[i];

      if (item1 !== item2) {
        if (item1 === undefined) {
          changes.push({
            type: 'addition',
            position: i,
            newValue: item2
          });
        } else if (item2 === undefined) {
          changes.push({
            type: 'deletion',
            position: i,
            oldValue: item1
          });
        } else {
          changes.push({
            type: 'modification',
            position: i,
            oldValue: item1,
            newValue: item2
          });
        }
      }
    }

    return { type: 'modified', changes };
  }

  /**
   * Diff command outputs
   */
  private diffOutputs(
    output1?: { stdout: string; stderr: string },
    output2?: { stdout: string; stderr: string }
  ): OutputDiff {
    const stdout = this.diffTextBlocks(output1?.stdout || '', output2?.stdout || '');
    const stderr = this.diffTextBlocks(output1?.stderr || '', output2?.stderr || '');

    return { stdout, stderr };
  }

  /**
   * Diff text blocks line by line
   */
  private diffTextBlocks(text1: string, text2: string): OutputDiff['stdout'] {
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');

    if (text1 === text2) {
      return {
        identical: true,
        additions: [],
        deletions: [],
        modifications: [],
        similarity: 1.0
      };
    }

    const additions: string[] = [];
    const deletions: string[] = [];
    const modifications: Array<{ line: number; old: string; new: string }> = [];

    // Simple line-by-line comparison
    const maxLines = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLines; i++) {
      const line1 = lines1[i];
      const line2 = lines2[i];

      if (line1 !== line2) {
        if (line1 === undefined) {
          additions.push(line2);
        } else if (line2 === undefined) {
          deletions.push(line1);
        } else {
          modifications.push({ line: i, old: line1, new: line2 });
        }
      }
    }

    const similarity = this.calculateTextSimilarity(text1, text2);

    return {
      identical: false,
      additions,
      deletions,
      modifications,
      similarity
    };
  }

  /**
   * Diff environments
   */
  private diffEnvironments(env1: CommandExecution['environment'], env2: CommandExecution['environment']): EnvironmentDiff {
    const cwdChanged = env1.cwd !== env2.cwd;
    const shellChanged = env1.shell !== env2.shell;
    
    const envDiff = this.diffObjects(env1.env, env2.env);

    return {
      cwd: {
        changed: cwdChanged,
        from: cwdChanged ? env1.cwd : undefined,
        to: cwdChanged ? env2.cwd : undefined
      },
      env: envDiff,
      shell: {
        changed: shellChanged,
        from: shellChanged ? env1.shell : undefined,
        to: shellChanged ? env2.shell : undefined
      }
    };
  }

  /**
   * Diff two objects
   */
  private diffObjects(obj1: Record<string, string>, obj2: Record<string, string>): EnvironmentDiff['env'] {
    const added: Record<string, string> = {};
    const removed: Record<string, string> = {};
    const modified: Record<string, { from: string; to: string }> = {};

    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
      const val1 = obj1[key];
      const val2 = obj2[key];

      if (val1 === undefined && val2 !== undefined) {
        added[key] = val2;
      } else if (val1 !== undefined && val2 === undefined) {
        removed[key] = val1;
      } else if (val1 !== val2) {
        modified[key] = { from: val1, to: val2 };
      }
    }

    return { added, removed, modified };
  }

  /**
   * Diff performance metrics
   */
  private diffPerformance(exec1: CommandExecution, exec2: CommandExecution): PerformanceDiff {
    const duration1 = exec1.duration || 0;
    const duration2 = exec2.duration || 0;
    const durationChange = duration2 - duration1;
    const durationChangePercent = duration1 > 0 ? (durationChange / duration1) * 100 : 0;
    const exitCodeChanged = exec1.exitCode !== exec2.exitCode;

    let performanceImpact: PerformanceDiff['performanceImpact'] = 'neutral';
    if (Math.abs(durationChangePercent) > 10) {
      performanceImpact = durationChangePercent < 0 ? 'improved' : 'degraded';
    }

    return {
      durationChange,
      durationChangePercent,
      exitCodeChanged,
      performanceImpact
    };
  }

  /**
   * Calculate overall similarity between two executions
   */
  private calculateSimilarity(exec1: CommandExecution, exec2: CommandExecution): number {
    let similarity = 0;
    let factors = 0;

    // Command similarity
    if (exec1.command === exec2.command) {
      similarity += 0.4;
    } else {
      similarity += 0.4 * this.calculateTextSimilarity(exec1.command, exec2.command);
    }
    factors += 0.4;

    // Args similarity
    const argsSim = this.calculateArraySimilarity(exec1.args, exec2.args);
    similarity += 0.3 * argsSim;
    factors += 0.3;

    // Output similarity
    if (exec1.output && exec2.output) {
      const stdoutSim = this.calculateTextSimilarity(exec1.output.stdout, exec2.output.stdout);
      const stderrSim = this.calculateTextSimilarity(exec1.output.stderr, exec2.output.stderr);
      similarity += 0.2 * ((stdoutSim + stderrSim) / 2);
    }
    factors += 0.2;

    // Exit code similarity
    if (exec1.exitCode === exec2.exitCode) {
      similarity += 0.1;
    }
    factors += 0.1;

    return similarity / factors;
  }

  /**
   * Calculate text similarity using simple algorithm
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (!text1 || !text2) return 0.0;

    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate array similarity
   */
  private calculateArraySimilarity(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1.0;
    
    const intersection = arr1.filter(x => arr2.includes(x));
    const union = [...new Set([...arr1, ...arr2])];
    
    return intersection.length / union.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Assess the impact level of differences
   */
  private assessImpact(
    outputDiff: OutputDiff,
    envDiff: EnvironmentDiff,
    perfDiff: PerformanceDiff
  ): 'low' | 'medium' | 'high' {
    let score = 0;

    // Output changes impact
    if (!outputDiff.stdout.identical) score += outputDiff.stdout.modifications.length * 2;
    if (!outputDiff.stderr.identical) score += outputDiff.stderr.modifications.length * 3;

    // Environment changes impact
    if (envDiff.cwd.changed) score += 2;
    if (Object.keys(envDiff.env.modified).length > 0) score += Object.keys(envDiff.env.modified).length;

    // Performance impact
    if (perfDiff.performanceImpact === 'degraded') score += 3;
    if (perfDiff.exitCodeChanged) score += 5;

    if (score <= 5) return 'low';
    if (score <= 15) return 'medium';
    return 'high';
  }

  /**
   * Generate recommendations based on diff analysis
   */
  private generateRecommendations(
    base: CommandExecution,
    compare: CommandExecution,
    outputDiff: OutputDiff,
    envDiff: EnvironmentDiff,
    perfDiff: PerformanceDiff
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (perfDiff.performanceImpact === 'degraded' && perfDiff.durationChangePercent > 20) {
      recommendations.push(`Performance degraded by ${perfDiff.durationChangePercent.toFixed(1)}%. Consider investigating the cause.`);
    }

    // Exit code recommendations
    if (perfDiff.exitCodeChanged && compare.exitCode !== 0) {
      recommendations.push('Command execution failed in the second run. Check error output for details.');
    }

    // Environment recommendations
    if (envDiff.cwd.changed) {
      recommendations.push('Working directory changed between executions. This may affect relative path references.');
    }

    if (Object.keys(envDiff.env.modified).length > 0) {
      recommendations.push('Environment variables changed. This may affect command behavior.');
    }

    // Output recommendations
    if (!outputDiff.stderr.identical && outputDiff.stderr.additions.length > 0) {
      recommendations.push('New error messages appeared. Review stderr output for issues.');
    }

    // Command recommendations
    if (base.command !== compare.command) {
      recommendations.push('Command changed between executions. Verify the command syntax is correct.');
    }

    return recommendations;
  }

  /**
   * Find similar commands automatically
   */
  private suggestSimilarCommands(execution: CommandExecution): void {
    const similar: Array<{ execution: CommandExecution; similarity: number }> = [];

    for (const [_, exec] of this.executions) {
      if (exec.id !== execution.id) {
        const similarity = this.calculateSimilarity(execution, exec);
        if (similarity > 0.7) {
          similar.push({ execution: exec, similarity });
        }
      }
    }

    if (similar.length > 0) {
      similar.sort((a, b) => b.similarity - a.similarity);
      this.emit('suggestions:similar', { execution, similar: similar.slice(0, 5) });
    }
  }

  /**
   * Get execution history
   */
  public getExecutions(filter?: {
    command?: string;
    timeRange?: { from: number; to: number };
    exitCode?: number;
    tags?: string[];
  }): CommandExecution[] {
    let executions = Array.from(this.executions.values());

    if (filter) {
      if (filter.command) {
        executions = executions.filter(exec => exec.command.includes(filter.command!));
      }
      if (filter.timeRange) {
        executions = executions.filter(exec => 
          exec.timestamp >= filter.timeRange!.from && exec.timestamp <= filter.timeRange!.to
        );
      }
      if (filter.exitCode !== undefined) {
        executions = executions.filter(exec => exec.exitCode === filter.exitCode);
      }
      if (filter.tags && filter.tags.length > 0) {
        executions = executions.filter(exec => 
          filter.tags!.some(tag => exec.metadata.tags.includes(tag))
        );
      }
    }

    return executions.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get diff history
   */
  public getDiffs(): CommandDiff[] {
    return Array.from(this.diffs.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Export executions to JSON
   */
  public exportExecutions(): string {
    const data = {
      session: this.currentSession,
      timestamp: Date.now(),
      executions: Array.from(this.executions.values()),
      diffs: Array.from(this.diffs.values())
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import executions from JSON
   */
  public importExecutions(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.executions) {
        for (const exec of data.executions) {
          this.executions.set(exec.id, exec);
        }
      }
      
      if (data.diffs) {
        for (const diff of data.diffs) {
          this.diffs.set(diff.id, diff);
        }
      }
      
      this.emit('data:imported', { executionCount: data.executions?.length || 0 });
    } catch (error) {
      this.emit('error', { operation: 'import', error });
      throw error;
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<DiffConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('config:updated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): DiffConfig {
    return { ...this.config };
  }

  /**
   * Clear all data
   */
  public clear(): void {
    this.executions.clear();
    this.diffs.clear();
    this.emit('data:cleared');
  }
}

let commandDiffingInstance: CommandDiffing | null = null;

export function getCommandDiffing(): CommandDiffing {
  if (!commandDiffingInstance) {
    commandDiffingInstance = new CommandDiffing();
  }
  return commandDiffingInstance;
}

export default CommandDiffing;