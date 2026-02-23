/**
 * Code Validation System
 * Validates code quality, security, and best practices
 */

import { EventEmitter } from 'events';
import chalk from 'chalk';

export interface ValidationResult {
  isValid: boolean;
  quality: {
    complexity: number;
    maintainability: number;
    readability: number;
    performance: 'excellent' | 'good' | 'acceptable' | 'needs-improvement';
    security?: Array<{
      issue: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      recommendation: string;
    }>;
  };
  issues: ValidationIssue[];
  metrics: CodeMetrics;
  commentCount: number;
  commentPercentage: number;
}

export interface ValidationIssue {
  file?: string;
  line?: number;
  column?: number;
  type: 'error' | 'warning' | 'info' | 'style' | 'security' | 'performance';
  severity: 'critical' | 'major' | 'minor' | 'trivial';
  rule?: string;
  description: string;
  suggestion?: string;
}

export interface CodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maintainabilityIndex: number;
  duplicateLines: number;
  testCoverage?: number;
  codeSmells: number;
  technicalDebt: string;
}

export interface SecurityVulnerability {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: {
    file: string;
    line: number;
  };
  cwe?: string;
  owasp?: string;
  fix?: string;
}

/**
 * Code Validator Implementation
 */
export class CodeValidator extends EventEmitter {
  private rules: Map<string, ValidationRule> = new Map();
  private securityPatterns: Map<string, RegExp> = new Map();
  
  constructor() {
    super();
    this.initializeRules();
    this.initializeSecurityPatterns();
  }
  
  /**
   * Validate implementation
   */
  async validateImplementation(
    files: any[],
    testFiles: any[]
  ): Promise<ValidationResult> {
    console.log(chalk.dim('    ✅ Validating implementation...'));
    
    const issues: ValidationIssue[] = [];
    let totalLines = 0;
    let totalComments = 0;
    
    // Validate each file
    for (const file of files) {
      const fileIssues = await this.validateFile(file);
      issues.push(...fileIssues);
      
      const { lines, comments } = this.countLinesAndComments(file.content);
      totalLines += lines;
      totalComments += comments;
    }
    
    // Validate test files
    for (const testFile of testFiles) {
      const testIssues = await this.validateTestFile(testFile);
      issues.push(...testIssues);
    }
    
    // Calculate metrics
    const metrics = this.calculateMetrics(files, testFiles);
    
    // Assess quality
    const quality = this.assessQuality(metrics, issues);
    
    // Check security
    const securityIssues = await this.checkSecurity(files);
    if (securityIssues.length > 0) {
      quality.security = securityIssues.map(issue => ({
        issue: issue.description,
        severity: issue.severity,
        recommendation: issue.fix || 'Review and fix security vulnerability'
      }));
    }
    
    const result: ValidationResult = {
      isValid: issues.filter(i => i.severity === 'critical').length === 0,
      quality,
      issues,
      metrics,
      commentCount: totalComments,
      commentPercentage: totalLines > 0 ? (totalComments / totalLines) * 100 : 0
    };
    
    this.emit('validation-completed', { result });
    
    return result;
  }
  
  /**
   * Validate a single file
   */
  async validateFile(file: any): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const content = file.content;
    const language = file.language || this.detectLanguage(file.path);
    
    // Run validation rules
    for (const rule of this.rules.values()) {
      if (rule.languages.includes(language) || rule.languages.includes('all')) {
        const ruleIssues = await rule.validate(content, file.path);
        issues.push(...ruleIssues);
      }
    }
    
    return issues;
  }
  
  /**
   * Validate test file
   */
  async validateTestFile(testFile: any): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const content = testFile.content;
    
    // Check for test coverage
    if (!content.includes('describe') && !content.includes('test') && !content.includes('it')) {
      issues.push({
        file: testFile.path,
        type: 'warning',
        severity: 'major',
        description: 'Test file appears to have no test cases',
        suggestion: 'Add test cases using describe/it blocks'
      });
    }
    
    // Check for assertions
    if (!content.includes('expect') && !content.includes('assert')) {
      issues.push({
        file: testFile.path,
        type: 'warning',
        severity: 'major',
        description: 'Test file has no assertions',
        suggestion: 'Add assertions to verify behavior'
      });
    }
    
    return issues;
  }
  
  /**
   * Validate API implementation
   */
  async validateAPI(implementation: any): Promise<any> {
    console.log(chalk.dim('    🔌 Validating API implementation...'));
    
    const validation = {
      isValid: true,
      issues: [] as any[],
      coverage: {
        endpoints: 0,
        documented: 0,
        tested: 0,
        secured: 0
      }
    };
    
    // Check routes
    if (implementation.routes) {
      validation.coverage.endpoints = this.countEndpoints(implementation.routes);
      
      // Check for authentication
      if (!implementation.routes.includes('authenticate') && !implementation.routes.includes('auth')) {
        validation.issues.push({
          type: 'security',
          severity: 'high',
          description: 'No authentication middleware detected'
        });
      }
      
      // Check for error handling
      if (!implementation.routes.includes('catch') && !implementation.routes.includes('error')) {
        validation.issues.push({
          type: 'error',
          severity: 'medium',
          description: 'No error handling detected'
        });
      }
    }
    
    // Check validation
    if (implementation.validators) {
      validation.coverage.secured = this.countValidatedEndpoints(implementation.validators);
    }
    
    validation.isValid = validation.issues.filter(i => i.severity === 'high').length === 0;
    
    return validation;
  }
  
  /**
   * Find issues in code
   */
  async findIssues(code: string, language: string): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const lines = code.split('\n');
    
    // Language-specific checks
    if (language === 'javascript' || language === 'typescript') {
      issues.push(...this.findJavaScriptIssues(lines));
    } else if (language === 'python') {
      issues.push(...this.findPythonIssues(lines));
    }
    
    // Common issues
    issues.push(...this.findCommonIssues(lines));
    
    return issues;
  }
  
  /**
   * Check security vulnerabilities
   */
  async checkSecurity(files: any[]): Promise<SecurityVulnerability[]> {
    console.log(chalk.dim('    🔒 Checking security...'));
    
    const vulnerabilities: SecurityVulnerability[] = [];
    
    for (const file of files) {
      const content = file.content;
      
      // Check for security patterns
      for (const [vulnType, pattern] of this.securityPatterns) {
        if (pattern.test(content)) {
          const lines = content.split('\n');
          const lineNumber = lines.findIndex((line: string) => pattern.test(line)) + 1;
          
          vulnerabilities.push({
            type: vulnType,
            severity: this.getSecuritySeverity(vulnType),
            description: this.getSecurityDescription(vulnType),
            location: {
              file: file.path,
              line: lineNumber
            },
            fix: this.getSecurityFix(vulnType)
          });
        }
      }
    }
    
    return vulnerabilities;
  }
  
  /**
   * Initialize validation rules
   */
  private initializeRules(): void {
    // Complexity rule
    this.addRule({
      id: 'complexity',
      name: 'Cyclomatic Complexity',
      languages: ['javascript', 'typescript', 'java', 'csharp'],
      validate: async (content: string, filepath?: string) => {
        const issues: ValidationIssue[] = [];
        const complexity = this.calculateCyclomaticComplexity(content);
        
        if (complexity > 10) {
          issues.push({
            file: filepath,
            type: 'warning',
            severity: complexity > 20 ? 'major' : 'minor',
            rule: 'complexity',
            description: `High cyclomatic complexity: ${complexity}`,
            suggestion: 'Consider breaking down complex functions'
          });
        }
        
        return issues;
      }
    });
    
    // Line length rule
    this.addRule({
      id: 'line-length',
      name: 'Line Length',
      languages: ['all'],
      validate: async (content: string, filepath?: string) => {
        const issues: ValidationIssue[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.length > 120) {
            issues.push({
              file: filepath,
              line: index + 1,
              type: 'style',
              severity: 'trivial',
              rule: 'line-length',
              description: `Line too long: ${line.length} characters`,
              suggestion: 'Break long lines for better readability'
            });
          }
        });
        
        return issues;
      }
    });
    
    // TODO comments rule
    this.addRule({
      id: 'todo-comments',
      name: 'TODO Comments',
      languages: ['all'],
      validate: async (content: string, filepath?: string) => {
        const issues: ValidationIssue[] = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
            issues.push({
              file: filepath,
              line: index + 1,
              type: 'info',
              severity: 'trivial',
              rule: 'todo-comments',
              description: 'Unresolved TODO comment',
              suggestion: 'Address TODO items before production'
            });
          }
        });
        
        return issues;
      }
    });
  }
  
  /**
   * Initialize security patterns
   */
  private initializeSecurityPatterns(): void {
    // SQL Injection
    this.securityPatterns.set('sql-injection', 
      /query\s*\(\s*['"`].*\+.*['"`]\s*\)/i
    );
    
    // XSS
    this.securityPatterns.set('xss',
      /innerHTML\s*=|document\.write|eval\s*\(/i
    );
    
    // Hardcoded credentials
    this.securityPatterns.set('hardcoded-credentials',
      /password\s*[:=]\s*['"`][^'"`]+['"`]|api[_-]?key\s*[:=]\s*['"`][^'"`]+['"`]/i
    );
    
    // Insecure random
    this.securityPatterns.set('insecure-random',
      /Math\.random\(\)/
    );
    
    // Command injection
    this.securityPatterns.set('command-injection',
      /exec\s*\(|spawn\s*\(|system\s*\(/
    );
    
    // Path traversal
    this.securityPatterns.set('path-traversal',
      /\.\.\/|\.\.\\|readFile.*\+|path\.join\(.*\+/
    );
  }
  
  /**
   * Find JavaScript/TypeScript issues
   */
  private findJavaScriptIssues(lines: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    lines.forEach((line, index) => {
      // console.log in production code
      if (line.includes('console.log') && !line.includes('// eslint-disable')) {
        issues.push({
          line: index + 1,
          type: 'warning',
          severity: 'minor',
          description: 'Remove console.log from production code',
          suggestion: 'Use proper logging library'
        });
      }
      
      // var usage
      if (/\bvar\s+\w+\s*=/.test(line)) {
        issues.push({
          line: index + 1,
          type: 'style',
          severity: 'minor',
          description: 'Use const or let instead of var',
          suggestion: 'Replace var with const or let'
        });
      }
      
      // == instead of ===
      if (/[^=!]==[^=]/.test(line)) {
        issues.push({
          line: index + 1,
          type: 'warning',
          severity: 'minor',
          description: 'Use === instead of ==',
          suggestion: 'Use strict equality operator'
        });
      }
    });
    
    return issues;
  }
  
  /**
   * Find Python issues
   */
  private findPythonIssues(lines: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    lines.forEach((line, index) => {
      // Missing type hints
      if (/def\s+\w+\([^)]*\):/.test(line) && !line.includes('->')) {
        issues.push({
          line: index + 1,
          type: 'style',
          severity: 'trivial',
          description: 'Missing return type hint',
          suggestion: 'Add type hints for better code documentation'
        });
      }
      
      // print() in production
      if (line.includes('print(') && !line.trim().startsWith('#')) {
        issues.push({
          line: index + 1,
          type: 'warning',
          severity: 'minor',
          description: 'Remove print() from production code',
          suggestion: 'Use logging module instead'
        });
      }
    });
    
    return issues;
  }
  
  /**
   * Find common issues
   */
  private findCommonIssues(lines: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    
    // Check for duplicate lines
    const duplicates = new Map<string, number[]>();
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.length > 20 && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
        if (!duplicates.has(trimmed)) {
          duplicates.set(trimmed, []);
        }
        duplicates.get(trimmed)!.push(index + 1);
      }
    });
    
    for (const [line, lineNumbers] of duplicates) {
      if (lineNumbers.length > 2) {
        issues.push({
          line: lineNumbers[0],
          type: 'warning',
          severity: 'minor',
          description: `Duplicate code detected on lines ${lineNumbers.join(', ')}`,
          suggestion: 'Consider extracting duplicate code into a function'
        });
      }
    }
    
    return issues;
  }
  
  /**
   * Calculate code metrics
   */
  private calculateMetrics(files: any[], testFiles: any[]): CodeMetrics {
    let totalLines = 0;
    let totalComplexity = 0;
    const duplicateLines = 0;
    let codeSmells = 0;
    
    for (const file of files) {
      const lines = file.content.split('\n');
      totalLines += lines.length;
      totalComplexity += this.calculateCyclomaticComplexity(file.content);
      
      // Count code smells
      if (file.content.includes('TODO')) codeSmells++;
      if (file.content.includes('FIXME')) codeSmells++;
      if (file.content.includes('HACK')) codeSmells++;
    }
    
    // Calculate maintainability index (simplified)
    const maintainabilityIndex = Math.max(
      0,
      171 - 5.2 * Math.log(totalComplexity) - 0.23 * totalComplexity - 16.2 * Math.log(totalLines)
    );
    
    return {
      linesOfCode: totalLines,
      cyclomaticComplexity: totalComplexity,
      cognitiveComplexity: Math.floor(totalComplexity * 1.2), // Simplified
      maintainabilityIndex: Math.min(100, maintainabilityIndex),
      duplicateLines,
      testCoverage: testFiles.length > 0 ? 70 : 0, // Simplified
      codeSmells,
      technicalDebt: this.estimateTechnicalDebt(totalComplexity, codeSmells)
    };
  }
  
  /**
   * Calculate cyclomatic complexity
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // Base complexity
    
    // Count decision points
    const decisionPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /\?\s*[^:]+:/g, // Ternary operators
      /&&/g,
      /\|\|/g
    ];
    
    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }
  
  /**
   * Assess code quality
   */
  private assessQuality(metrics: CodeMetrics, issues: ValidationIssue[]): any {
    const criticalIssues = issues.filter(i => i.severity === 'critical').length;
    const majorIssues = issues.filter(i => i.severity === 'major').length;
    
    // Calculate scores
    const complexity = Math.min(100, 100 - metrics.cyclomaticComplexity * 2);
    const maintainability = metrics.maintainabilityIndex;
    const readability = Math.max(0, 100 - majorIssues * 10 - criticalIssues * 20);
    
    // Determine performance rating
    let performance: 'excellent' | 'good' | 'acceptable' | 'needs-improvement' = 'good';
    if (metrics.cyclomaticComplexity < 5 && criticalIssues === 0) {
      performance = 'excellent';
    } else if (metrics.cyclomaticComplexity > 15 || criticalIssues > 2) {
      performance = 'needs-improvement';
    } else if (metrics.cyclomaticComplexity > 10 || criticalIssues > 0) {
      performance = 'acceptable';
    }
    
    return {
      complexity,
      maintainability,
      readability,
      performance
    };
  }
  
  /**
   * Estimate technical debt
   */
  private estimateTechnicalDebt(complexity: number, codeSmells: number): string {
    const hours = (complexity * 0.5) + (codeSmells * 2);
    
    if (hours < 8) return `${Math.round(hours)} hours`;
    if (hours < 40) return `${Math.round(hours / 8)} days`;
    return `${Math.round(hours / 40)} weeks`;
  }
  
  /**
   * Count lines and comments
   */
  private countLinesAndComments(content: string): { lines: number; comments: number } {
    const lines = content.split('\n');
    let commentCount = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        commentCount++;
      }
    }
    
    return {
      lines: lines.length,
      comments: commentCount
    };
  }
  
  /**
   * Helper methods
   */
  
  private detectLanguage(filepath: string): string {
    const ext = filepath.split('.').pop()?.toLowerCase();
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'py': 'python',
      'java': 'java',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust'
    };
    
    return languageMap[ext || ''] || 'unknown';
  }
  
  private countEndpoints(routes: string): number {
    const routePatterns = [
      /router\.\w+\(/g,
      /app\.\w+\(/g,
      /@\w+\(/g // Decorators
    ];
    
    let count = 0;
    for (const pattern of routePatterns) {
      const matches = routes.match(pattern);
      if (matches) count += matches.length;
    }
    
    return count;
  }
  
  private countValidatedEndpoints(validators: string): number {
    const validatorPatterns = [
      /validate\(/g,
      /validator\(/g,
      /body\(/g,
      /param\(/g,
      /query\(/g
    ];
    
    let count = 0;
    for (const pattern of validatorPatterns) {
      const matches = validators.match(pattern);
      if (matches) count += matches.length;
    }
    
    return count;
  }
  
  private getSecuritySeverity(vulnType: string): 'critical' | 'high' | 'medium' | 'low' {
    const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
      'sql-injection': 'critical',
      'xss': 'high',
      'hardcoded-credentials': 'critical',
      'insecure-random': 'medium',
      'command-injection': 'critical',
      'path-traversal': 'high'
    };
    
    return severityMap[vulnType] || 'medium';
  }
  
  private getSecurityDescription(vulnType: string): string {
    const descriptions: Record<string, string> = {
      'sql-injection': 'Potential SQL injection vulnerability',
      'xss': 'Potential cross-site scripting (XSS) vulnerability',
      'hardcoded-credentials': 'Hardcoded credentials detected',
      'insecure-random': 'Use of insecure random number generator',
      'command-injection': 'Potential command injection vulnerability',
      'path-traversal': 'Potential path traversal vulnerability'
    };
    
    return descriptions[vulnType] || 'Security vulnerability detected';
  }
  
  private getSecurityFix(vulnType: string): string {
    const fixes: Record<string, string> = {
      'sql-injection': 'Use parameterized queries or prepared statements',
      'xss': 'Sanitize user input and use proper encoding',
      'hardcoded-credentials': 'Use environment variables or secure credential storage',
      'insecure-random': 'Use crypto.randomBytes() for security-sensitive operations',
      'command-injection': 'Validate and sanitize user input, use safe APIs',
      'path-traversal': 'Validate and sanitize file paths, use path.resolve()'
    };
    
    return fixes[vulnType] || 'Review and fix the security issue';
  }
  
  /**
   * Add validation rule
   */
  private addRule(rule: ValidationRule): void {
    this.rules.set(rule.id, rule);
  }
}

interface ValidationRule {
  id: string;
  name: string;
  languages: string[];
  validate: (content: string, filepath?: string) => Promise<ValidationIssue[]>;
}

// Export singleton instance
export const codeValidator = new CodeValidator();