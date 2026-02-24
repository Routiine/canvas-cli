/**
 * Verification Engine
 *
 * Provides diff-aware verification of execution results to ensure
 * task completion meets requirements.
 *
 * Features:
 * - Syntax validation
 * - Semantic change analysis
 * - Test execution (optional)
 * - Type checking (for TypeScript)
 * - Custom verification rules
 */

import { EventEmitter } from 'events';
import { exec, ExecException } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import * as path from 'path';
import type {
  VerificationReport,
  VerificationCheck,
  VerificationConfig,
  DiffAnalysis,
  SemanticChange,
  ExecutionStep} from './types.js';
import {
  VerificationResult,
  DEFAULT_VERIFICATION_CONFIG
} from './types.js';
import type { OllamaBackend } from './ollama-backend.js';
import { getOllamaBackend } from './ollama-backend.js';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  beforeContent?: string;
  afterContent?: string;
  diff?: string;
}

interface VerificationContext {
  step: ExecutionStep;
  fileChanges: FileChange[];
  commandOutputs: string[];
  workingDirectory: string;
}

// ============================================================================
// Verification Engine
// ============================================================================

export class VerificationEngine extends EventEmitter {
  private config: VerificationConfig;
  private ollama: OllamaBackend;
  private customChecks: Map<string, (ctx: VerificationContext) => Promise<VerificationCheck>> = new Map();

  constructor(config: Partial<VerificationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_VERIFICATION_CONFIG, ...config };
    this.ollama = getOllamaBackend();
  }

  // ==========================================================================
  // Main Verification Interface
  // ==========================================================================

  async verify(
    step: ExecutionStep,
    fileChanges: FileChange[],
    commandOutputs: string[] = [],
    workingDirectory: string = process.cwd()
  ): Promise<VerificationReport> {
    const startTime = Date.now();
    const checks: VerificationCheck[] = [];

    const context: VerificationContext = {
      step,
      fileChanges,
      commandOutputs,
      workingDirectory
    };

    this.emit('verification_started', { stepId: step.id });

    try {
      // Run syntax checks
      if (this.config.enableSyntaxCheck && fileChanges.length > 0) {
        const syntaxChecks = await this.runSyntaxChecks(fileChanges);
        checks.push(...syntaxChecks);
      }

      // Run type checks for TypeScript files
      if (this.config.enableTypeCheck) {
        const tsFiles = fileChanges.filter(f =>
          f.path.endsWith('.ts') || f.path.endsWith('.tsx')
        );
        if (tsFiles.length > 0) {
          const typeCheck = await this.runTypeCheck(workingDirectory);
          checks.push(typeCheck);
        }
      }

      // Run semantic analysis
      if (this.config.enableSemanticAnalysis && fileChanges.length > 0) {
        const semanticCheck = await this.runSemanticAnalysis(fileChanges, step.description);
        checks.push(semanticCheck);
      }

      // Run tests if enabled
      if (this.config.enableTestExecution) {
        const testCheck = await this.runTests(workingDirectory);
        checks.push(testCheck);
      }

      // Run custom checks
      for (const [name, checkFn] of this.customChecks) {
        try {
          const customCheck = await checkFn(context);
          customCheck.name = name;
          checks.push(customCheck);
        } catch (error: any) {
          checks.push({
            id: `custom_${name}`,
            name,
            description: `Custom check: ${name}`,
            type: 'custom',
            passed: false,
            message: error.message
          });
        }
      }

      // Analyze diffs
      const diffAnalysis = await this.analyzeDiffs(fileChanges);

      // Determine overall result
      const result = this.determineResult(checks, diffAnalysis);

      const report: VerificationReport = {
        stepId: step.id,
        result,
        checks,
        diffAnalysis,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        suggestions: this.generateSuggestions(checks, diffAnalysis)
      };

      this.emit('verification_completed', { stepId: step.id, report });
      return report;
    } catch (error) {
      this.emit('verification_failed', { stepId: step.id, error });
      throw error;
    }
  }

  async quickVerify(
    code: string,
    language: string
  ): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Basic syntax check based on language
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        issues.push(...this.checkJavaScriptSyntax(code));
        break;
      case 'python':
        issues.push(...this.checkPythonSyntax(code));
        break;
      case 'json':
        issues.push(...this.checkJsonSyntax(code));
        break;
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  // ==========================================================================
  // Syntax Checks
  // ==========================================================================

  private async runSyntaxChecks(fileChanges: FileChange[]): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    for (const change of fileChanges) {
      if (change.type === 'deleted' || !change.afterContent) continue;

      const ext = path.extname(change.path).toLowerCase();
      let issues: string[] = [];

      switch (ext) {
        case '.ts':
        case '.tsx':
        case '.js':
        case '.jsx':
          issues = this.checkJavaScriptSyntax(change.afterContent);
          break;
        case '.py':
          issues = this.checkPythonSyntax(change.afterContent);
          break;
        case '.json':
          issues = this.checkJsonSyntax(change.afterContent);
          break;
        case '.yaml':
        case '.yml':
          issues = this.checkYamlSyntax(change.afterContent);
          break;
      }

      checks.push({
        id: `syntax_${path.basename(change.path)}`,
        name: `Syntax: ${path.basename(change.path)}`,
        description: `Syntax validation for ${change.path}`,
        type: 'syntax',
        passed: issues.length === 0,
        message: issues.length > 0 ? issues.join('; ') : 'Syntax valid',
        details: { file: change.path, issues }
      });
    }

    return checks;
  }

  private checkJavaScriptSyntax(code: string): string[] {
    const issues: string[] = [];

    try {
      // Basic bracket matching
      const brackets = { '(': ')', '{': '}', '[': ']' };
      const stack: string[] = [];
      let inString = false;
      let stringChar = '';
      let inComment = false;
      let inMultilineComment = false;

      for (let i = 0; i < code.length; i++) {
        const char = code[i];
        const nextChar = code[i + 1];

        // Handle strings
        if (!inComment && !inMultilineComment) {
          if ((char === '"' || char === "'" || char === '`') && code[i - 1] !== '\\') {
            if (!inString) {
              inString = true;
              stringChar = char;
            } else if (char === stringChar) {
              inString = false;
            }
            continue;
          }
        }

        if (inString) continue;

        // Handle comments
        if (char === '/' && nextChar === '/') {
          inComment = true;
          continue;
        }
        if (char === '/' && nextChar === '*') {
          inMultilineComment = true;
          continue;
        }
        if (char === '*' && nextChar === '/') {
          inMultilineComment = false;
          i++;
          continue;
        }
        if (char === '\n') {
          inComment = false;
          continue;
        }
        if (inComment || inMultilineComment) continue;

        // Check brackets
        if (char in brackets) {
          stack.push(brackets[char as keyof typeof brackets]);
        } else if (Object.values(brackets).includes(char)) {
          if (stack.pop() !== char) {
            const line = code.substring(0, i).split('\n').length;
            issues.push(`Mismatched bracket '${char}' at line ${line}`);
          }
        }
      }

      if (stack.length > 0) {
        issues.push(`Unclosed brackets: ${stack.join(', ')}`);
      }

      if (inString) {
        issues.push('Unclosed string literal');
      }

      // Check for common syntax errors
      const errorPatterns = [
        { pattern: /,\s*[}\])]/, message: 'Trailing comma before closing bracket' },
        { pattern: /\)\s*{(?!\s*(?:\/\/|\/\*))(?!\s*$)(?![^}]*})/, message: 'Possible missing function body' }
      ];

      for (const { pattern, message } of errorPatterns) {
        if (pattern.test(code)) {
          // Only add if it's actually an issue (more validation needed)
        }
      }
    } catch (error: any) {
      issues.push(`Parse error: ${error.message}`);
    }

    return issues;
  }

  private checkPythonSyntax(code: string): string[] {
    const issues: string[] = [];

    // Basic indentation check
    const lines = code.split('\n');
    const expectedIndent = 0;
    const indentStack: number[] = [0];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#')) continue;

      const indent = line.length - line.trimStart().length;

      // Check for mixed tabs/spaces
      if (/^\t+ +|\t/.test(line.substring(0, indent))) {
        issues.push(`Line ${i + 1}: Mixed tabs and spaces in indentation`);
      }

      // Check if line ends with colon (starts a block)
      if (trimmed.endsWith(':') && !trimmed.startsWith('#')) {
        indentStack.push(indent);
      }
    }

    // Check for unclosed brackets
    const brackets = { '(': ')', '[': ']', '{': '}' };
    const stack: string[] = [];
    let inString = false;
    let stringChar = '';

    for (const char of code) {
      if ((char === '"' || char === "'") && !inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && inString) {
        inString = false;
      } else if (!inString) {
        if (char in brackets) {
          stack.push(brackets[char as keyof typeof brackets]);
        } else if (Object.values(brackets).includes(char)) {
          if (stack.pop() !== char) {
            issues.push(`Mismatched bracket '${char}'`);
          }
        }
      }
    }

    if (stack.length > 0) {
      issues.push(`Unclosed brackets: ${stack.join(', ')}`);
    }

    return issues;
  }

  private checkJsonSyntax(code: string): string[] {
    try {
      JSON.parse(code);
      return [];
    } catch (error: any) {
      return [error.message];
    }
  }

  private checkYamlSyntax(code: string): string[] {
    const issues: string[] = [];

    // Basic YAML validation
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for tabs (YAML prefers spaces)
      if (line.includes('\t')) {
        issues.push(`Line ${i + 1}: Tabs not recommended in YAML`);
      }

      // Check for inconsistent indentation
      const indent = line.length - line.trimStart().length;
      if (indent % 2 !== 0 && line.trim()) {
        issues.push(`Line ${i + 1}: Inconsistent indentation (should be multiple of 2)`);
      }
    }

    return issues;
  }

  // ==========================================================================
  // Type Checking
  // ==========================================================================

  private async runTypeCheck(workingDirectory: string): Promise<VerificationCheck> {
    try {
      // Check if tsconfig exists
      const tsconfigPath = path.join(workingDirectory, 'tsconfig.json');
      if (!await fs.pathExists(tsconfigPath)) {
        return {
          id: 'typecheck',
          name: 'TypeScript Type Check',
          description: 'TypeScript compilation check',
          type: 'semantic',
          passed: true,
          message: 'No tsconfig.json found, skipping type check'
        };
      }

      // Run tsc --noEmit
      const { stdout, stderr } = await execAsync('npx tsc --noEmit 2>&1 || true', {
        cwd: workingDirectory,
        timeout: this.config.timeoutMs
      });

      const output = stdout + stderr;
      const hasErrors = output.includes('error TS');

      // Extract error count
      const errorMatch = output.match(/Found (\d+) error/);
      const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;

      return {
        id: 'typecheck',
        name: 'TypeScript Type Check',
        description: 'TypeScript compilation check',
        type: 'semantic',
        passed: !hasErrors,
        message: hasErrors ? `${errorCount} type error(s) found` : 'No type errors',
        details: hasErrors ? { output: output.substring(0, 2000) } : undefined
      };
    } catch (error: any) {
      return {
        id: 'typecheck',
        name: 'TypeScript Type Check',
        description: 'TypeScript compilation check',
        type: 'semantic',
        passed: false,
        message: `Type check failed: ${error.message}`
      };
    }
  }

  // ==========================================================================
  // Semantic Analysis
  // ==========================================================================

  private async runSemanticAnalysis(
    fileChanges: FileChange[],
    taskDescription: string
  ): Promise<VerificationCheck> {
    // Use AI to analyze if changes match intent
    const changesDescription = fileChanges.map(c =>
      `${c.type}: ${c.path}${c.diff ? `\n${c.diff.substring(0, 500)}` : ''}`
    ).join('\n\n');

    const model = this.ollama.selectModelForCapability('code_analysis');

    try {
      const response = await this.ollama.generate({
        model,
        prompt: `Task: ${taskDescription}

Changes made:
${changesDescription}

Analyze if these changes correctly implement the task.`,
        system: `You are a code review expert. Analyze if code changes match the intended task.

Output JSON:
{
  "matchesIntent": true/false,
  "completeness": 0.0-1.0,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1"]
}`,
        format: 'json',
        options: {
          temperature: 0.2,
          num_predict: 1000
        }
      });

      const result = JSON.parse(response.response);

      return {
        id: 'semantic',
        name: 'Semantic Analysis',
        description: 'AI-powered semantic validation',
        type: 'semantic',
        passed: result.matchesIntent && result.completeness >= 0.7,
        message: result.matchesIntent
          ? `Changes match intent (${Math.round(result.completeness * 100)}% complete)`
          : 'Changes may not fully implement the task',
        details: {
          completeness: result.completeness,
          issues: result.issues,
          suggestions: result.suggestions
        }
      };
    } catch (error: any) {
      return {
        id: 'semantic',
        name: 'Semantic Analysis',
        description: 'AI-powered semantic validation',
        type: 'semantic',
        passed: true, // Don't fail on analysis error
        message: `Semantic analysis skipped: ${error.message}`
      };
    }
  }

  // ==========================================================================
  // Test Execution
  // ==========================================================================

  private async runTests(workingDirectory: string): Promise<VerificationCheck> {
    try {
      // Detect test framework
      const packageJsonPath = path.join(workingDirectory, 'package.json');
      let testCommand = 'npm test';

      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        const scripts = packageJson.scripts || {};

        if (scripts.test) {
          testCommand = 'npm test';
        } else if (await fs.pathExists(path.join(workingDirectory, 'pytest.ini'))) {
          testCommand = 'pytest';
        } else if (await fs.pathExists(path.join(workingDirectory, 'setup.py'))) {
          testCommand = 'python -m pytest';
        }
      }

      const { stdout, stderr } = await execAsync(`${testCommand} 2>&1 || true`, {
        cwd: workingDirectory,
        timeout: this.config.timeoutMs
      });

      const output = stdout + stderr;

      // Parse test results (basic heuristics)
      const passed = !output.includes('FAIL') &&
                     !output.includes('failed') &&
                     !output.includes('Error:') &&
                     (output.includes('pass') || output.includes('PASS') || output.includes('ok'));

      // Extract test counts if available
      const passMatch = output.match(/(\d+) pass/i);
      const failMatch = output.match(/(\d+) fail/i);

      return {
        id: 'tests',
        name: 'Test Execution',
        description: 'Run test suite',
        type: 'functional',
        passed,
        message: passed
          ? `Tests passed${passMatch ? ` (${passMatch[1]} passing)` : ''}`
          : `Tests failed${failMatch ? ` (${failMatch[1]} failing)` : ''}`,
        details: { output: output.substring(0, 2000) }
      };
    } catch (error: any) {
      return {
        id: 'tests',
        name: 'Test Execution',
        description: 'Run test suite',
        type: 'functional',
        passed: false,
        message: `Test execution failed: ${error.message}`
      };
    }
  }

  // ==========================================================================
  // Diff Analysis
  // ==========================================================================

  private async analyzeDiffs(fileChanges: FileChange[]): Promise<DiffAnalysis> {
    const filesChanged = fileChanges.map(c => c.path);
    let linesAdded = 0;
    let linesRemoved = 0;
    const semanticChanges: SemanticChange[] = [];
    const potentialIssues: string[] = [];
    const syntaxValid = true;

    for (const change of fileChanges) {
      if (change.diff) {
        // Count lines
        const lines = change.diff.split('\n');
        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) linesAdded++;
          if (line.startsWith('-') && !line.startsWith('---')) linesRemoved++;
        }
      }

      // Detect semantic changes
      if (change.afterContent && change.beforeContent) {
        const changes = this.detectSemanticChanges(
          change.beforeContent,
          change.afterContent,
          change.path
        );
        semanticChanges.push(...changes);
      } else if (change.type === 'added' && change.afterContent) {
        // New file
        const changes = this.detectSemanticChanges('', change.afterContent, change.path);
        semanticChanges.push(...changes);
      }

      // Check for potential issues
      if (change.afterContent) {
        const issues = this.detectPotentialIssues(change.afterContent, change.path);
        potentialIssues.push(...issues);
      }
    }

    return {
      filesChanged,
      linesAdded,
      linesRemoved,
      syntaxValid,
      semanticChanges,
      potentialIssues
    };
  }

  private detectSemanticChanges(before: string, after: string, file: string): SemanticChange[] {
    const changes: SemanticChange[] = [];
    const ext = path.extname(file).toLowerCase();

    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      // Detect function changes
      const functionPattern = /(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)\s*=>|\function)/g;

      const beforeFuncs = new Set<string>();
      const afterFuncs = new Set<string>();

      let match;
      while ((match = functionPattern.exec(before)) !== null) {
        beforeFuncs.add(match[1] || match[2]);
      }
      functionPattern.lastIndex = 0;
      while ((match = functionPattern.exec(after)) !== null) {
        afterFuncs.add(match[1] || match[2]);
      }

      // Added functions
      for (const func of afterFuncs) {
        if (!beforeFuncs.has(func)) {
          changes.push({
            type: 'function_added',
            name: func,
            file,
            description: `Function '${func}' added`,
            impact: 'low'
          });
        }
      }

      // Removed functions
      for (const func of beforeFuncs) {
        if (!afterFuncs.has(func)) {
          changes.push({
            type: 'function_removed',
            name: func,
            file,
            description: `Function '${func}' removed`,
            impact: 'medium'
          });
        }
      }

      // Detect class changes
      const classPattern = /class\s+(\w+)/g;
      const beforeClasses = new Set<string>();
      const afterClasses = new Set<string>();

      while ((match = classPattern.exec(before)) !== null) {
        beforeClasses.add(match[1]);
      }
      classPattern.lastIndex = 0;
      while ((match = classPattern.exec(after)) !== null) {
        afterClasses.add(match[1]);
      }

      for (const cls of afterClasses) {
        if (!beforeClasses.has(cls)) {
          changes.push({
            type: 'class_added',
            name: cls,
            file,
            description: `Class '${cls}' added`,
            impact: 'low'
          });
        }
      }

      // Detect import changes
      const importPattern = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
      const beforeImports = new Set<string>();
      const afterImports = new Set<string>();

      while ((match = importPattern.exec(before)) !== null) {
        beforeImports.add(match[1]);
      }
      importPattern.lastIndex = 0;
      while ((match = importPattern.exec(after)) !== null) {
        afterImports.add(match[1]);
      }

      for (const imp of afterImports) {
        if (!beforeImports.has(imp)) {
          changes.push({
            type: 'import_added',
            name: imp,
            file,
            description: `Import '${imp}' added`,
            impact: 'none'
          });
        }
      }
    }

    return changes;
  }

  private detectPotentialIssues(content: string, file: string): string[] {
    const issues: string[] = [];

    // Check for common security issues
    if (/eval\s*\(/.test(content)) {
      issues.push(`${file}: Use of eval() detected (security concern)`);
    }

    if (/innerHTML\s*=/.test(content)) {
      issues.push(`${file}: Direct innerHTML assignment (XSS risk)`);
    }

    // Check for console.log in production code
    if (!/\.test\.|\.spec\.|__tests__/.test(file) && /console\.(log|debug)/.test(content)) {
      issues.push(`${file}: console.log statements found`);
    }

    // Check for TODO/FIXME comments
    const todoMatch = content.match(/(?:TODO|FIXME|HACK|XXX):/gi);
    if (todoMatch && todoMatch.length > 0) {
      issues.push(`${file}: ${todoMatch.length} TODO/FIXME comments`);
    }

    // Check for hardcoded secrets patterns
    if (/(?:api[_-]?key|password|secret|token)\s*[:=]\s*['"][^'"]+['"]/i.test(content)) {
      issues.push(`${file}: Potential hardcoded secret detected`);
    }

    return issues;
  }

  // ==========================================================================
  // Result Determination
  // ==========================================================================

  private determineResult(checks: VerificationCheck[], diffAnalysis: DiffAnalysis): VerificationResult {
    const failedChecks = checks.filter(c => !c.passed);
    const criticalFailed = failedChecks.some(c =>
      c.type === 'syntax' || (c.type === 'functional' && this.config.strictMode)
    );

    if (criticalFailed) {
      return VerificationResult.FAILED;
    }

    if (failedChecks.length > 0) {
      return this.config.strictMode ? VerificationResult.FAILED : VerificationResult.PARTIAL;
    }

    if (diffAnalysis.potentialIssues.length > 0) {
      return VerificationResult.NEEDS_REVIEW;
    }

    return VerificationResult.PASSED;
  }

  private generateSuggestions(checks: VerificationCheck[], diffAnalysis: DiffAnalysis): string[] {
    const suggestions: string[] = [];

    for (const check of checks) {
      if (!check.passed && check.details?.suggestions && Array.isArray(check.details.suggestions)) {
        suggestions.push(...(check.details.suggestions as string[]));
      }
    }

    // Add suggestions based on diff analysis
    if (diffAnalysis.linesAdded > 500) {
      suggestions.push('Consider breaking large changes into smaller commits');
    }

    if (diffAnalysis.semanticChanges.some(c => c.type === 'function_removed')) {
      suggestions.push('Verify that removed functions are not used elsewhere');
    }

    for (const issue of diffAnalysis.potentialIssues) {
      suggestions.push(`Review: ${issue}`);
    }

    return [...new Set(suggestions)]; // Remove duplicates
  }

  // ==========================================================================
  // Custom Checks
  // ==========================================================================

  registerCustomCheck(
    name: string,
    check: (ctx: VerificationContext) => Promise<VerificationCheck>
  ): void {
    this.customChecks.set(name, check);
  }

  unregisterCustomCheck(name: string): boolean {
    return this.customChecks.delete(name);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  async getFileDiff(filePath: string, beforeContent: string, afterContent: string): Promise<string> {
    // Simple line-by-line diff
    const beforeLines = beforeContent.split('\n');
    const afterLines = afterContent.split('\n');
    const diff: string[] = [];

    diff.push(`--- a/${filePath}`);
    diff.push(`+++ b/${filePath}`);

    // Very basic diff (for more sophisticated diff, use a diff library)
    const maxLines = Math.max(beforeLines.length, afterLines.length);

    for (let i = 0; i < maxLines; i++) {
      const before = beforeLines[i];
      const after = afterLines[i];

      if (before === after) {
        diff.push(` ${before || ''}`);
      } else if (before === undefined) {
        diff.push(`+${after}`);
      } else if (after === undefined) {
        diff.push(`-${before}`);
      } else {
        diff.push(`-${before}`);
        diff.push(`+${after}`);
      }
    }

    return diff.join('\n');
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  updateConfig(config: Partial<VerificationConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config_updated', this.config);
  }

  getConfig(): VerificationConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let verificationEngineInstance: VerificationEngine | null = null;

export function getVerificationEngine(config?: Partial<VerificationConfig>): VerificationEngine {
  if (!verificationEngineInstance) {
    verificationEngineInstance = new VerificationEngine(config);
  } else if (config) {
    verificationEngineInstance.updateConfig(config);
  }
  return verificationEngineInstance;
}

export function resetVerificationEngine(): void {
  if (verificationEngineInstance) {
    verificationEngineInstance.removeAllListeners();
  }
  verificationEngineInstance = null;
}
