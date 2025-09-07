/**
 * Self-Healing Code Generation System
 * Automatically detects, diagnoses, and fixes code issues in real-time
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as ts from 'typescript';
import * as babel from '@babel/core';
import { parse as parseAST } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';

const execAsync = promisify(exec);

interface CodeIssue {
  id: string;
  type: 'syntax' | 'runtime' | 'logic' | 'performance' | 'style' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  suggestion?: string;
  autoFixable: boolean;
  confidence: number; // 0-1 confidence in the fix
}

interface HealingStrategy {
  name: string;
  applicableTo: CodeIssue['type'][];
  canHeal: (issue: CodeIssue) => boolean;
  heal: (issue: CodeIssue, code: string) => Promise<string>;
  validate: (original: string, healed: string) => Promise<boolean>;
  priority: number;
}

interface HealingResult {
  success: boolean;
  issue: CodeIssue;
  originalCode: string;
  healedCode?: string;
  strategy?: string;
  validationPassed?: boolean;
  error?: string;
  rollbackAvailable: boolean;
}

interface CodePattern {
  name: string;
  pattern: RegExp | ((ast: any) => boolean);
  replacement: string | ((match: any) => string);
  description: string;
  category: string;
}

export class SelfHealingCodeSystem extends EventEmitter {
  private strategies: Map<string, HealingStrategy> = new Map();
  private patterns: Map<string, CodePattern> = new Map();
  private healingHistory: Map<string, HealingResult[]> = new Map();
  private watchedFiles: Set<string> = new Set();
  private fileWatchers: Map<string, any> = new Map();
  private isEnabled: boolean = true;
  private autoHealMode: 'aggressive' | 'conservative' | 'interactive' = 'conservative';
  private testCommand: string = 'npm test';
  
  constructor() {
    super();
    this.initializeStrategies();
    this.initializePatterns();
  }
  
  private initializeStrategies(): void {
    // Syntax error healing
    this.strategies.set('syntax-healer', {
      name: 'Syntax Error Healer',
      applicableTo: ['syntax'],
      canHeal: (issue) => issue.autoFixable && issue.confidence > 0.7,
      heal: async (issue, code) => {
        return await this.healSyntaxError(issue, code);
      },
      validate: async (original, healed) => {
        return await this.validateSyntax(healed);
      },
      priority: 1
    });
    
    // Runtime error healing
    this.strategies.set('runtime-healer', {
      name: 'Runtime Error Healer',
      applicableTo: ['runtime'],
      canHeal: (issue) => {
        const healableErrors = ['undefined', 'null', 'type', 'reference'];
        return healableErrors.some(err => issue.message.toLowerCase().includes(err));
      },
      heal: async (issue, code) => {
        return await this.healRuntimeError(issue, code);
      },
      validate: async (original, healed) => {
        return await this.validateRuntime(healed);
      },
      priority: 2
    });
    
    // Logic error healing
    this.strategies.set('logic-healer', {
      name: 'Logic Error Healer',
      applicableTo: ['logic'],
      canHeal: (issue) => issue.confidence > 0.6,
      heal: async (issue, code) => {
        return await this.healLogicError(issue, code);
      },
      validate: async (original, healed) => {
        return await this.validateLogic(original, healed);
      },
      priority: 3
    });
    
    // Performance optimization healing
    this.strategies.set('performance-healer', {
      name: 'Performance Optimizer',
      applicableTo: ['performance'],
      canHeal: (issue) => true,
      heal: async (issue, code) => {
        return await this.optimizePerformance(issue, code);
      },
      validate: async (original, healed) => {
        return await this.validatePerformance(original, healed);
      },
      priority: 4
    });
    
    // Security vulnerability healing
    this.strategies.set('security-healer', {
      name: 'Security Vulnerability Fixer',
      applicableTo: ['security'],
      canHeal: (issue) => issue.severity !== 'low',
      heal: async (issue, code) => {
        return await this.healSecurityIssue(issue, code);
      },
      validate: async (original, healed) => {
        return await this.validateSecurity(healed);
      },
      priority: 1 // High priority for security
    });
  }
  
  private initializePatterns(): void {
    // Common code patterns that need healing
    
    // Missing semicolons
    this.patterns.set('missing-semicolon', {
      name: 'Missing Semicolon',
      pattern: /^(?!.*[;{}]$).+$/gm,
      replacement: (match: string) => `${match};`,
      description: 'Add missing semicolons',
      category: 'syntax'
    });
    
    // Undefined variable check
    this.patterns.set('undefined-check', {
      name: 'Undefined Variable Protection',
      pattern: /if\s*\(\s*(\w+)\s*\)/g,
      replacement: 'if (typeof $1 !== "undefined" && $1)',
      description: 'Add undefined checks',
      category: 'runtime'
    });
    
    // Null pointer protection
    this.patterns.set('null-protection', {
      name: 'Null Pointer Protection',
      pattern: /(\w+)\.(\w+)/g,
      replacement: (match: string, obj: string, prop: string) => {
        return `${obj}?.${prop}`;
      },
      description: 'Add optional chaining',
      category: 'runtime'
    });
    
    // Array bounds checking
    this.patterns.set('array-bounds', {
      name: 'Array Bounds Checking',
      pattern: /(\w+)\[(\w+)\]/g,
      replacement: (match: string, arr: string, index: string) => {
        return `(${arr} && ${arr}.length > ${index} ? ${arr}[${index}] : undefined)`;
      },
      description: 'Add array bounds checking',
      category: 'runtime'
    });
    
    // Memory leak prevention
    this.patterns.set('memory-leak', {
      name: 'Memory Leak Prevention',
      pattern: /addEventListener\s*\([^)]+\)(?!.*removeEventListener)/g,
      replacement: (match: string) => {
        return `${match}; // TODO: Add removeEventListener in cleanup`;
      },
      description: 'Flag potential memory leaks',
      category: 'performance'
    });
    
    // SQL injection prevention
    this.patterns.set('sql-injection', {
      name: 'SQL Injection Prevention',
      pattern: /query\s*\(\s*[`'"].*\$\{[^}]+\}.*[`'"]\s*\)/g,
      replacement: (match: string) => {
        return match.replace(/\$\{([^}]+)\}/g, '?');
      },
      description: 'Use parameterized queries',
      category: 'security'
    });
  }
  
  async analyzeCode(filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    try {
      const code = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath);
      
      // TypeScript analysis
      if (ext === '.ts' || ext === '.tsx') {
        const tsIssues = await this.analyzeTypeScript(filePath, code);
        issues.push(...tsIssues);
      }
      
      // JavaScript analysis
      if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') {
        const jsIssues = await this.analyzeJavaScript(filePath, code);
        issues.push(...jsIssues);
      }
      
      // Pattern-based analysis
      const patternIssues = this.analyzePatterns(filePath, code);
      issues.push(...patternIssues);
      
      // Runtime analysis (if tests exist)
      const runtimeIssues = await this.analyzeRuntime(filePath);
      issues.push(...runtimeIssues);
      
      // Security analysis
      const securityIssues = await this.analyzeSecurityIssues(filePath, code);
      issues.push(...securityIssues);
      
    } catch (error) {
      this.emit('analysis:error', { filePath, error });
    }
    
    return issues;
  }
  
  private async analyzeTypeScript(filePath: string, code: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    const program = ts.createProgram([filePath], {
      noEmit: true,
      allowJs: true,
      checkJs: true,
      strict: true
    });
    
    const diagnostics = ts.getPreEmitDiagnostics(program);
    
    for (const diagnostic of diagnostics) {
      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        
        issues.push({
          id: `ts_${Date.now()}_${Math.random()}`,
          type: 'syntax',
          severity: this.mapTsSeverity(diagnostic.category),
          file: filePath,
          line: line + 1,
          column: character + 1,
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          code: diagnostic.code?.toString(),
          autoFixable: this.isTsAutoFixable(diagnostic),
          confidence: 0.8
        });
      }
    }
    
    return issues;
  }
  
  private async analyzeJavaScript(filePath: string, code: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    try {
      const ast = parseAST(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });
      
      traverse(ast, {
        enter(path: any) {
          // Check for common issues
          
          // Unreachable code
          if (path.isReturnStatement() || path.isThrowStatement()) {
            const siblings = path.getAllNextSiblings();
            if (siblings.length > 0) {
              issues.push({
                id: `js_unreachable_${Date.now()}`,
                type: 'logic',
                severity: 'medium',
                file: filePath,
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: 'Unreachable code detected',
                autoFixable: true,
                confidence: 1.0
              });
            }
          }
          
          // Unused variables
          if (path.isVariableDeclarator()) {
            const binding = path.scope.getBinding(path.node.id.name);
            if (binding && !binding.referenced) {
              issues.push({
                id: `js_unused_${Date.now()}`,
                type: 'style',
                severity: 'low',
                file: filePath,
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Unused variable: ${path.node.id.name}`,
                autoFixable: true,
                confidence: 0.9
              });
            }
          }
          
          // Missing error handling
          if (path.isAwaitExpression() && !path.findParent((p: any) => p.isTryStatement())) {
            issues.push({
              id: `js_no_try_${Date.now()}`,
              type: 'runtime',
              severity: 'medium',
              file: filePath,
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: 'Await without try-catch',
              suggestion: 'Wrap in try-catch block',
              autoFixable: true,
              confidence: 0.7
            });
          }
        }
      });
      
    } catch (error: any) {
      // Parse errors are also issues
      if (error.loc) {
        issues.push({
          id: `js_parse_${Date.now()}`,
          type: 'syntax',
          severity: 'critical',
          file: filePath,
          line: error.loc.line,
          column: error.loc.column,
          message: error.message,
          autoFixable: false,
          confidence: 0.5
        });
      }
    }
    
    return issues;
  }
  
  private analyzePatterns(filePath: string, code: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = code.split('\n');
    
    for (const [patternName, pattern] of this.patterns.entries()) {
      if (pattern.pattern instanceof RegExp) {
        const matches = code.matchAll(pattern.pattern);
        
        for (const match of matches) {
          const lineNumber = code.substring(0, match.index!).split('\n').length;
          
          issues.push({
            id: `pattern_${patternName}_${Date.now()}`,
            type: this.mapPatternType(pattern.category),
            severity: 'medium',
            file: filePath,
            line: lineNumber,
            column: 0,
            message: pattern.description,
            suggestion: typeof pattern.replacement === 'string' 
              ? pattern.replacement 
              : 'Apply pattern fix',
            autoFixable: true,
            confidence: 0.8
          });
        }
      }
    }
    
    return issues;
  }
  
  private async analyzeRuntime(filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    // Run tests to detect runtime issues
    try {
      const { stdout, stderr } = await execAsync(this.testCommand, {
        cwd: path.dirname(filePath)
      });
      
      // Parse test output for failures
      const errorPattern = /Error:.*\n.*at.*\((.+):(\d+):(\d+)\)/g;
      const matches = stderr.matchAll(errorPattern);
      
      for (const match of matches) {
        issues.push({
          id: `runtime_${Date.now()}`,
          type: 'runtime',
          severity: 'high',
          file: match[1],
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          message: match[0].split('\n')[0],
          autoFixable: false,
          confidence: 0.6
        });
      }
      
    } catch (error) {
      // Test failures are expected
    }
    
    return issues;
  }
  
  private async analyzeSecurityIssues(filePath: string, code: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    
    // Check for common security vulnerabilities
    const securityPatterns = [
      {
        pattern: /eval\s*\(/g,
        message: 'Dangerous use of eval()',
        severity: 'critical' as const
      },
      {
        pattern: /innerHTML\s*=/g,
        message: 'Potential XSS vulnerability with innerHTML',
        severity: 'high' as const
      },
      {
        pattern: /require\s*\(\s*[^'"]/g,
        message: 'Dynamic require() can be dangerous',
        severity: 'medium' as const
      },
      {
        pattern: /crypto\.pseudoRandomBytes/g,
        message: 'Use crypto.randomBytes for cryptographic operations',
        severity: 'high' as const
      },
      {
        pattern: /http:\/\//g,
        message: 'Use HTTPS instead of HTTP',
        severity: 'medium' as const
      }
    ];
    
    for (const secPattern of securityPatterns) {
      const matches = code.matchAll(secPattern.pattern);
      
      for (const match of matches) {
        const lineNumber = code.substring(0, match.index!).split('\n').length;
        
        issues.push({
          id: `security_${Date.now()}_${Math.random()}`,
          type: 'security',
          severity: secPattern.severity,
          file: filePath,
          line: lineNumber,
          column: 0,
          message: secPattern.message,
          autoFixable: secPattern.severity !== 'critical',
          confidence: 0.9
        });
      }
    }
    
    return issues;
  }
  
  async healIssue(issue: CodeIssue): Promise<HealingResult> {
    const filePath = issue.file;
    let originalCode: string;
    
    try {
      originalCode = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      return {
        success: false,
        issue,
        originalCode: '',
        error: `Failed to read file: ${error}`,
        rollbackAvailable: false
      };
    }
    
    // Find applicable healing strategies
    const strategies = Array.from(this.strategies.values())
      .filter(s => s.applicableTo.includes(issue.type))
      .sort((a, b) => a.priority - b.priority);
    
    for (const strategy of strategies) {
      if (!strategy.canHeal(issue)) continue;
      
      try {
        this.emit('healing:attempting', { issue, strategy: strategy.name });
        
        // Attempt healing
        const healedCode = await strategy.heal(issue, originalCode);
        
        // Validate the healed code
        const isValid = await strategy.validate(originalCode, healedCode);
        
        if (isValid) {
          // Apply the healed code
          await this.applyHealing(filePath, originalCode, healedCode);
          
          const result: HealingResult = {
            success: true,
            issue,
            originalCode,
            healedCode,
            strategy: strategy.name,
            validationPassed: true,
            rollbackAvailable: true
          };
          
          // Store in history
          this.addToHistory(filePath, result);
          
          this.emit('healing:success', result);
          return result;
        }
        
      } catch (error: any) {
        this.emit('healing:failed', { issue, strategy: strategy.name, error });
      }
    }
    
    return {
      success: false,
      issue,
      originalCode,
      error: 'No suitable healing strategy found',
      rollbackAvailable: false
    };
  }
  
  private async healSyntaxError(issue: CodeIssue, code: string): Promise<string> {
    const lines = code.split('\n');
    const lineIndex = issue.line - 1;
    
    if (issue.message.includes('missing semicolon')) {
      lines[lineIndex] = lines[lineIndex].trimEnd() + ';';
    } else if (issue.message.includes('unterminated string')) {
      lines[lineIndex] = lines[lineIndex] + '"';
    } else if (issue.message.includes('unexpected token')) {
      // Try to fix common syntax errors
      const line = lines[lineIndex];
      
      // Missing closing brackets
      const openBrackets = (line.match(/[\[{(]/g) || []).length;
      const closeBrackets = (line.match(/[\]})]/g) || []).length;
      
      if (openBrackets > closeBrackets) {
        const missing = openBrackets - closeBrackets;
        lines[lineIndex] = line + ')'.repeat(missing);
      }
    }
    
    return lines.join('\n');
  }
  
  private async healRuntimeError(issue: CodeIssue, code: string): Promise<string> {
    const lines = code.split('\n');
    const lineIndex = issue.line - 1;
    
    if (issue.message.includes('undefined')) {
      // Add undefined check
      const line = lines[lineIndex];
      const varMatch = line.match(/(\w+)\./);
      
      if (varMatch) {
        const varName = varMatch[1];
        lines[lineIndex] = `if (${varName}) { ${line} }`;
      }
    } else if (issue.message.includes('null')) {
      // Add null check
      const line = lines[lineIndex];
      lines[lineIndex] = line.replace(/(\w+)\.(\w+)/g, '$1?.$2');
    } else if (issue.message.includes('not a function')) {
      // Add function check
      const line = lines[lineIndex];
      const funcMatch = line.match(/(\w+)\(/);
      
      if (funcMatch) {
        const funcName = funcMatch[1];
        lines[lineIndex] = `if (typeof ${funcName} === 'function') { ${line} }`;
      }
    }
    
    return lines.join('\n');
  }
  
  private async healLogicError(issue: CodeIssue, code: string): Promise<string> {
    const lines = code.split('\n');
    const lineIndex = issue.line - 1;
    
    if (issue.message.includes('unreachable')) {
      // Remove unreachable code
      let i = lineIndex;
      while (i < lines.length && !lines[i].includes('}')) {
        lines.splice(i, 1);
      }
    } else if (issue.message.includes('unused')) {
      // Comment out unused code
      lines[lineIndex] = `// ${lines[lineIndex]} // Unused - commented by self-healing`;
    }
    
    return lines.join('\n');
  }
  
  private async optimizePerformance(issue: CodeIssue, code: string): Promise<string> {
    const lines = code.split('\n');
    const lineIndex = issue.line - 1;
    const line = lines[lineIndex];
    
    // Apply performance optimizations
    let optimized = line;
    
    // Replace array.indexOf() !== -1 with array.includes()
    optimized = optimized.replace(/\.indexOf\([^)]+\)\s*!==\s*-1/g, '.includes($1)');
    
    // Replace for loops with forEach/map where appropriate
    optimized = optimized.replace(
      /for\s*\(let\s+(\w+)\s*=\s*0;\s*\1\s*<\s*(\w+)\.length;\s*\1\+\+\)/g,
      '$2.forEach((item, $1) =>'
    );
    
    // Add caching for repeated calculations
    if (line.includes('Math.') || line.includes('calculate')) {
      optimized = `const cached_${Date.now()} = ${line}; // Cached for performance`;
    }
    
    lines[lineIndex] = optimized;
    return lines.join('\n');
  }
  
  private async healSecurityIssue(issue: CodeIssue, code: string): Promise<string> {
    const lines = code.split('\n');
    const lineIndex = issue.line - 1;
    let line = lines[lineIndex];
    
    if (issue.message.includes('eval')) {
      // Replace eval with safer alternatives
      line = line.replace(/eval\s*\(([^)]+)\)/g, 'JSON.parse($1)');
    } else if (issue.message.includes('innerHTML')) {
      // Replace innerHTML with textContent
      line = line.replace(/innerHTML\s*=/g, 'textContent =');
    } else if (issue.message.includes('HTTP')) {
      // Replace HTTP with HTTPS
      line = line.replace(/http:\/\//g, 'https://');
    } else if (issue.message.includes('SQL')) {
      // Use parameterized queries
      line = line.replace(/\$\{([^}]+)\}/g, '?');
    }
    
    lines[lineIndex] = line;
    return lines.join('\n');
  }
  
  private async validateSyntax(code: string): Promise<boolean> {
    try {
      // Try to parse the code
      parseAST(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: false
      });
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private async validateRuntime(code: string): Promise<boolean> {
    // Run tests to validate runtime behavior
    try {
      await execAsync(this.testCommand);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  private async validateLogic(original: string, healed: string): Promise<boolean> {
    // Compare AST to ensure logic is preserved
    try {
      const originalAST = parseAST(original, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
      const healedAST = parseAST(healed, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
      
      // Simple comparison - in reality would be more sophisticated
      return JSON.stringify(originalAST.program.body.length) === JSON.stringify(healedAST.program.body.length);
    } catch (error) {
      return false;
    }
  }
  
  private async validatePerformance(original: string, healed: string): Promise<boolean> {
    // Performance should not degrade
    return healed.length <= original.length * 1.1; // Allow 10% size increase
  }
  
  private async validateSecurity(code: string): Promise<boolean> {
    // Check that no new security issues were introduced
    const securityPatterns = [
      /eval\s*\(/g,
      /innerHTML\s*=/g,
      /document\.write/g,
      /\.exec\(/g
    ];
    
    for (const pattern of securityPatterns) {
      if (pattern.test(code)) {
        return false;
      }
    }
    
    return true;
  }
  
  private async applyHealing(filePath: string, originalCode: string, healedCode: string): Promise<void> {
    // Backup original
    const backupPath = `${filePath}.backup.${Date.now()}`;
    await fs.writeFile(backupPath, originalCode, 'utf-8');
    
    // Apply healed code
    await fs.writeFile(filePath, healedCode, 'utf-8');
    
    this.emit('healing:applied', { filePath, backupPath });
  }
  
  private addToHistory(filePath: string, result: HealingResult): void {
    if (!this.healingHistory.has(filePath)) {
      this.healingHistory.set(filePath, []);
    }
    
    this.healingHistory.get(filePath)!.push(result);
    
    // Keep only last 10 healing results per file
    const history = this.healingHistory.get(filePath)!;
    if (history.length > 10) {
      history.shift();
    }
  }
  
  async rollback(filePath: string): Promise<boolean> {
    const history = this.healingHistory.get(filePath);
    
    if (!history || history.length === 0) {
      return false;
    }
    
    const lastHealing = history[history.length - 1];
    
    if (lastHealing.success && lastHealing.originalCode) {
      await fs.writeFile(filePath, lastHealing.originalCode, 'utf-8');
      history.pop();
      
      this.emit('healing:rolledback', { filePath });
      return true;
    }
    
    return false;
  }
  
  async watchFile(filePath: string): Promise<void> {
    if (this.watchedFiles.has(filePath)) {
      return;
    }
    
    this.watchedFiles.add(filePath);
    
    // Set up file watcher
    const watcher = fs.watch(filePath);
    
    watcher.on('change', async () => {
      if (this.isEnabled) {
        const issues = await this.analyzeCode(filePath);
        
        for (const issue of issues) {
          if (this.shouldAutoHeal(issue)) {
            await this.healIssue(issue);
          }
        }
      }
    });
    
    this.fileWatchers.set(filePath, watcher);
    this.emit('watch:started', { filePath });
  }
  
  async unwatchFile(filePath: string): Promise<void> {
    const watcher = this.fileWatchers.get(filePath);
    
    if (watcher) {
      await watcher.close();
      this.fileWatchers.delete(filePath);
      this.watchedFiles.delete(filePath);
      
      this.emit('watch:stopped', { filePath });
    }
  }
  
  private shouldAutoHeal(issue: CodeIssue): boolean {
    switch (this.autoHealMode) {
      case 'aggressive':
        return issue.autoFixable;
      
      case 'conservative':
        return issue.autoFixable && 
               issue.confidence > 0.8 && 
               issue.severity !== 'critical';
      
      case 'interactive':
        // Would prompt user
        return false;
      
      default:
        return false;
    }
  }
  
  private mapTsSeverity(category: ts.DiagnosticCategory): CodeIssue['severity'] {
    switch (category) {
      case ts.DiagnosticCategory.Error:
        return 'high';
      case ts.DiagnosticCategory.Warning:
        return 'medium';
      default:
        return 'low';
    }
  }
  
  private isTsAutoFixable(diagnostic: ts.Diagnostic): boolean {
    // Check if TypeScript has a fix for this diagnostic
    const fixableCodes = [
      2304, // Cannot find name
      2339, // Property does not exist
      2345, // Argument type mismatch
      7006, // Parameter implicitly has 'any' type
    ];
    
    return diagnostic.code ? fixableCodes.includes(diagnostic.code) : false;
  }
  
  private mapPatternType(category: string): CodeIssue['type'] {
    const mapping: Record<string, CodeIssue['type']> = {
      'syntax': 'syntax',
      'runtime': 'runtime',
      'performance': 'performance',
      'security': 'security',
      'style': 'style'
    };
    
    return mapping[category] || 'logic';
  }
  
  // Public API
  
  setAutoHealMode(mode: 'aggressive' | 'conservative' | 'interactive'): void {
    this.autoHealMode = mode;
  }
  
  setTestCommand(command: string): void {
    this.testCommand = command;
  }
  
  enable(): void {
    this.isEnabled = true;
  }
  
  disable(): void {
    this.isEnabled = false;
  }
  
  getHistory(filePath?: string): HealingResult[] {
    if (filePath) {
      return this.healingHistory.get(filePath) || [];
    }
    
    // Return all history
    const allHistory: HealingResult[] = [];
    for (const history of this.healingHistory.values()) {
      allHistory.push(...history);
    }
    
    return allHistory;
  }
  
  addStrategy(name: string, strategy: HealingStrategy): void {
    this.strategies.set(name, strategy);
  }
  
  removeStrategy(name: string): boolean {
    return this.strategies.delete(name);
  }
  
  addPattern(name: string, pattern: CodePattern): void {
    this.patterns.set(name, pattern);
  }
  
  removePattern(name: string): boolean {
    return this.patterns.delete(name);
  }
  
  async healProject(projectPath: string): Promise<Map<string, HealingResult[]>> {
    const results = new Map<string, HealingResult[]>();
    const files = await this.findSourceFiles(projectPath);
    
    for (const file of files) {
      const issues = await this.analyzeCode(file);
      const fileResults: HealingResult[] = [];
      
      for (const issue of issues) {
        if (this.shouldAutoHeal(issue)) {
          const result = await this.healIssue(issue);
          fileResults.push(result);
        }
      }
      
      if (fileResults.length > 0) {
        results.set(file, fileResults);
      }
    }
    
    return results;
  }
  
  private async findSourceFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.jsx', '.ts', '.tsx'];
    
    async function walk(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    await walk(projectPath);
    return files;
  }
}

// Export singleton instance
export const selfHealingCode = new SelfHealingCodeSystem();