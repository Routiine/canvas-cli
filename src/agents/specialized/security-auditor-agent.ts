import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

interface SecurityVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  file: string;
  line?: number;
  column?: number;
  description: string;
  recommendation: string;
  cwe?: string;
  owasp?: string;
  cvss?: number;
  fixAvailable?: boolean;
  fixCommand?: string;
}

interface SecurityScanResult {
  timestamp: Date;
  projectPath: string;
  vulnerabilities: SecurityVulnerability[];
  statistics: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  dependencies?: DependencyVulnerability[];
  secrets?: SecretExposure[];
  compliance?: ComplianceIssue[];
  score: number;
  recommendations: string[];
}

interface DependencyVulnerability {
  package: string;
  version: string;
  severity: string;
  vulnerabilities: string[];
  fixedIn?: string;
  advisory?: string;
}

interface SecretExposure {
  type: string;
  file: string;
  line: number;
  pattern: string;
  entropy?: number;
  confidence: 'high' | 'medium' | 'low';
}

interface ComplianceIssue {
  standard: string;
  requirement: string;
  status: 'pass' | 'fail' | 'warning';
  description: string;
  remediation?: string;
}

interface SecurityPolicy {
  allowedLicenses?: string[];
  bannedPackages?: string[];
  maxCriticalVulnerabilities?: number;
  maxHighVulnerabilities?: number;
  requireSecurityHeaders?: boolean;
  requireHttps?: boolean;
  requireAuthentication?: boolean;
  requireEncryption?: boolean;
  minPasswordLength?: number;
  requireMFA?: boolean;
}

export class SecurityAuditorAgent extends EventEmitter {
  private scanHistory: Map<string, SecurityScanResult[]> = new Map();
  private policies: Map<string, SecurityPolicy> = new Map();
  private knownPatterns: Map<string, RegExp> = new Map();
  
  constructor() {
    super();
    this.initializeSecurityPatterns();
    this.loadDefaultPolicies();
  }
  
  private initializeSecurityPatterns(): void {
    // Secret detection patterns
    this.knownPatterns.set('aws_key', /AKIA[0-9A-Z]{16}/gi);
    this.knownPatterns.set('aws_secret', /aws(.{0,20})?['\"][0-9a-zA-Z\/+]{40}['\"]/gi);
    this.knownPatterns.set('github_token', /ghp_[0-9a-zA-Z]{36}/gi);
    this.knownPatterns.set('private_key', /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/gi);
    this.knownPatterns.set('api_key', /api[_\-]?key['\"]?\s*[:=]\s*['\"][0-9a-zA-Z\-_]{20,}['\"]/gi);
    this.knownPatterns.set('jwt_token', /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g);
    this.knownPatterns.set('db_connection', /(mongodb|postgres|mysql|redis):\/\/[^'\"\s]+/gi);
    this.knownPatterns.set('slack_token', /xox[baprs]-[0-9a-zA-Z\-]+/gi);
    this.knownPatterns.set('stripe_key', /(sk|pk)_(test|live)_[0-9a-zA-Z]{24,}/gi);
    
    // SQL Injection patterns
    this.knownPatterns.set('sql_injection', /(\$\{.*?\}|`.*?`)\s*(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)/gi);
    
    // XSS patterns
    this.knownPatterns.set('xss_danger', /dangerouslySetInnerHTML|innerHTML\s*=|document\.write/gi);
    
    // Path traversal patterns
    this.knownPatterns.set('path_traversal', /\.\.[\/\\]/g);
    
    // Command injection patterns
    this.knownPatterns.set('command_injection', /(exec|system|eval|spawn)\s*\([^)]*\$\{?[^}]*\}?\)/gi);
  }
  
  private loadDefaultPolicies(): void {
    this.policies.set('default', {
      allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC'],
      maxCriticalVulnerabilities: 0,
      maxHighVulnerabilities: 5,
      requireSecurityHeaders: true,
      requireHttps: true,
      requireAuthentication: true,
      requireEncryption: true,
      minPasswordLength: 12,
      requireMFA: false
    });
    
    this.policies.set('strict', {
      allowedLicenses: ['MIT', 'Apache-2.0'],
      maxCriticalVulnerabilities: 0,
      maxHighVulnerabilities: 0,
      requireSecurityHeaders: true,
      requireHttps: true,
      requireAuthentication: true,
      requireEncryption: true,
      minPasswordLength: 16,
      requireMFA: true
    });
  }
  
  async scan(projectPath: string, options: {
    deep?: boolean;
    includeDevDependencies?: boolean;
    scanSecrets?: boolean;
    scanDependencies?: boolean;
    scanCode?: boolean;
    policy?: string;
  } = {}): Promise<SecurityScanResult> {
    const startTime = Date.now();
    this.emit('scan:start', { projectPath, options });
    
    const result: SecurityScanResult = {
      timestamp: new Date(),
      projectPath,
      vulnerabilities: [],
      statistics: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        total: 0
      },
      dependencies: [],
      secrets: [],
      compliance: [],
      score: 100,
      recommendations: []
    };
    
    try {
      // Code scanning
      if (options.scanCode !== false) {
        await this.scanCodeVulnerabilities(projectPath, result);
      }
      
      // Secret scanning
      if (options.scanSecrets !== false) {
        await this.scanForSecrets(projectPath, result);
      }
      
      // Dependency scanning
      if (options.scanDependencies !== false) {
        await this.scanDependencies(projectPath, result, options.includeDevDependencies);
      }
      
      // Security headers and configuration
      await this.scanSecurityConfiguration(projectPath, result);
      
      // Compliance checking
      if (options.policy) {
        await this.checkCompliance(projectPath, result, options.policy);
      }
      
      // Calculate statistics and score
      this.calculateStatistics(result);
      this.calculateSecurityScore(result);
      
      // Generate recommendations
      this.generateRecommendations(result);
      
      // Store scan history
      const history = this.scanHistory.get(projectPath) || [];
      history.push(result);
      this.scanHistory.set(projectPath, history);
      
      this.emit('scan:complete', {
        projectPath,
        duration: Date.now() - startTime,
        result
      });
      
      return result;
      
    } catch (error) {
      this.emit('scan:error', { projectPath, error });
      throw error;
    }
  }
  
  private async scanCodeVulnerabilities(projectPath: string, result: SecurityScanResult): Promise<void> {
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.php', '.rb', '.go'];
    const files = await this.getProjectFiles(projectPath, extensions);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      
      // Check for SQL injection vulnerabilities
      const sqlMatches = content.matchAll(this.knownPatterns.get('sql_injection')!);
      for (const match of sqlMatches) {
        const line = this.getLineNumber(content, match.index!);
        result.vulnerabilities.push({
          id: crypto.randomUUID(),
          severity: 'high',
          type: 'SQL Injection',
          file: path.relative(projectPath, file),
          line,
          description: 'Potential SQL injection vulnerability detected',
          recommendation: 'Use parameterized queries or prepared statements',
          cwe: 'CWE-89',
          owasp: 'A03:2021',
          cvss: 8.8
        });
      }
      
      // Check for XSS vulnerabilities
      const xssMatches = content.matchAll(this.knownPatterns.get('xss_danger')!);
      for (const match of xssMatches) {
        const line = this.getLineNumber(content, match.index!);
        result.vulnerabilities.push({
          id: crypto.randomUUID(),
          severity: 'medium',
          type: 'Cross-Site Scripting (XSS)',
          file: path.relative(projectPath, file),
          line,
          description: 'Potential XSS vulnerability detected',
          recommendation: 'Sanitize user input and use safe rendering methods',
          cwe: 'CWE-79',
          owasp: 'A03:2021',
          cvss: 6.5
        });
      }
      
      // Check for command injection
      const cmdMatches = content.matchAll(this.knownPatterns.get('command_injection')!);
      for (const match of cmdMatches) {
        const line = this.getLineNumber(content, match.index!);
        result.vulnerabilities.push({
          id: crypto.randomUUID(),
          severity: 'critical',
          type: 'Command Injection',
          file: path.relative(projectPath, file),
          line,
          description: 'Potential command injection vulnerability detected',
          recommendation: 'Avoid using dynamic command execution; use safe alternatives',
          cwe: 'CWE-78',
          owasp: 'A03:2021',
          cvss: 9.8
        });
      }
      
      // Check for insecure random number generation
      if (content.includes('Math.random()') && (file.includes('crypto') || file.includes('auth'))) {
        result.vulnerabilities.push({
          id: crypto.randomUUID(),
          severity: 'medium',
          type: 'Insecure Randomness',
          file: path.relative(projectPath, file),
          description: 'Math.random() used in security-sensitive context',
          recommendation: 'Use crypto.randomBytes() or similar cryptographically secure methods',
          cwe: 'CWE-330',
          cvss: 5.3
        });
      }
    }
  }
  
  private async scanForSecrets(projectPath: string, result: SecurityScanResult): Promise<void> {
    const extensions = ['.js', '.ts', '.json', '.env', '.yml', '.yaml', '.xml', '.properties', '.conf'];
    const files = await this.getProjectFiles(projectPath, extensions);
    
    for (const file of files) {
      // Skip node_modules and other common directories
      if (file.includes('node_modules') || file.includes('.git')) continue;
      
      const content = await fs.readFile(file, 'utf-8');
      
      for (const [secretType, pattern] of this.knownPatterns.entries()) {
        if (secretType.includes('injection') || secretType.includes('xss') || secretType.includes('traversal')) {
          continue; // Skip non-secret patterns
        }
        
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const line = this.getLineNumber(content, match.index!);
          
          // Calculate entropy for better detection accuracy
          const entropy = this.calculateEntropy(match[0]);
          const confidence = entropy > 4.5 ? 'high' : entropy > 3.5 ? 'medium' : 'low';
          
          result.secrets?.push({
            type: secretType,
            file: path.relative(projectPath, file),
            line,
            pattern: match[0].substring(0, 20) + '...',
            entropy,
            confidence
          });
        }
      }
    }
  }
  
  private async scanDependencies(projectPath: string, result: SecurityScanResult, includeDevDependencies?: boolean): Promise<void> {
    // Check for package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      // Run npm audit
      try {
        const { stdout } = await execAsync('npm audit --json', { cwd: projectPath });
        const auditResult = JSON.parse(stdout);
        
        if (auditResult.vulnerabilities) {
          for (const [pkgName, vulnData] of Object.entries(auditResult.vulnerabilities as Record<string, any>)) {
            const vuln = vulnData as any;
            result.dependencies?.push({
              package: pkgName,
              version: vuln.version,
              severity: vuln.severity,
              vulnerabilities: vuln.via.map((v: any) => v.title || v).filter(Boolean),
              fixedIn: vuln.fixAvailable?.version
            });
          }
        }
      } catch (error) {
        // npm audit might fail if no package-lock.json exists
        this.emit('scan:warning', { message: 'Could not run npm audit', error });
      }
      
      // Check for outdated packages
      try {
        const { stdout } = await execAsync('npm outdated --json', { cwd: projectPath });
        if (stdout) {
          const outdated = JSON.parse(stdout);
          for (const [pkg, info] of Object.entries(outdated as Record<string, any>)) {
            if (info.current !== info.latest) {
              result.vulnerabilities.push({
                id: crypto.randomUUID(),
                severity: 'info',
                type: 'Outdated Dependency',
                file: 'package.json',
                description: `${pkg} is outdated (${info.current} -> ${info.latest})`,
                recommendation: `Update ${pkg} to version ${info.latest}`,
                fixAvailable: true,
                fixCommand: `npm install ${pkg}@${info.latest}`
              });
            }
          }
        }
      } catch (error) {
        // Outdated check is non-critical
      }
    } catch (error) {
      this.emit('scan:warning', { message: 'Could not read package.json', error });
    }
  }
  
  private async scanSecurityConfiguration(projectPath: string, result: SecurityScanResult): Promise<void> {
    // Check for security headers in Express/Node.js apps
    const serverFiles = await this.getProjectFiles(projectPath, ['.js', '.ts'], ['server', 'app', 'index']);
    
    for (const file of serverFiles) {
      const content = await fs.readFile(file, 'utf-8');
      
      // Check for helmet.js
      if (!content.includes('helmet')) {
        result.vulnerabilities.push({
          id: crypto.randomUUID(),
          severity: 'medium',
          type: 'Missing Security Headers',
          file: path.relative(projectPath, file),
          description: 'Security headers not configured (helmet.js not found)',
          recommendation: 'Install and configure helmet.js for security headers',
          cwe: 'CWE-693',
          fixAvailable: true,
          fixCommand: 'npm install helmet'
        });
      }
      
      // Check for CORS configuration
      if (content.includes('cors(') && content.includes('origin: true')) {
        result.vulnerabilities.push({
          id: crypto.randomUUID(),
          severity: 'medium',
          type: 'Insecure CORS Configuration',
          file: path.relative(projectPath, file),
          description: 'CORS configured to allow all origins',
          recommendation: 'Configure CORS with specific allowed origins',
          cwe: 'CWE-942'
        });
      }
      
      // Check for rate limiting
      if (!content.includes('rate-limit') && !content.includes('rateLimit')) {
        result.vulnerabilities.push({
          id: crypto.randomUUID(),
          severity: 'low',
          type: 'Missing Rate Limiting',
          file: path.relative(projectPath, file),
          description: 'No rate limiting detected',
          recommendation: 'Implement rate limiting to prevent DoS attacks',
          cwe: 'CWE-770'
        });
      }
    }
  }
  
  private async checkCompliance(projectPath: string, result: SecurityScanResult, policyName: string): Promise<void> {
    const policy = this.policies.get(policyName) || this.policies.get('default')!;
    
    // Check critical vulnerabilities
    const criticalCount = result.vulnerabilities.filter(v => v.severity === 'critical').length;
    result.compliance?.push({
      standard: 'Security Policy',
      requirement: 'Maximum Critical Vulnerabilities',
      status: criticalCount <= (policy.maxCriticalVulnerabilities || 0) ? 'pass' : 'fail',
      description: `Found ${criticalCount} critical vulnerabilities (max allowed: ${policy.maxCriticalVulnerabilities})`,
      remediation: criticalCount > 0 ? 'Fix all critical vulnerabilities immediately' : undefined
    });
    
    // Check high vulnerabilities
    const highCount = result.vulnerabilities.filter(v => v.severity === 'high').length;
    result.compliance?.push({
      standard: 'Security Policy',
      requirement: 'Maximum High Vulnerabilities',
      status: highCount <= (policy.maxHighVulnerabilities || 5) ? 'pass' : 'fail',
      description: `Found ${highCount} high vulnerabilities (max allowed: ${policy.maxHighVulnerabilities})`,
      remediation: highCount > (policy.maxHighVulnerabilities || 5) ? 'Reduce high severity vulnerabilities' : undefined
    });
    
    // Check for secrets
    result.compliance?.push({
      standard: 'Security Policy',
      requirement: 'No Exposed Secrets',
      status: (result.secrets?.length || 0) === 0 ? 'pass' : 'fail',
      description: `Found ${result.secrets?.length || 0} potential secrets`,
      remediation: result.secrets?.length ? 'Remove all secrets and rotate credentials' : undefined
    });
    
    // Check for authentication requirements
    const authCheck = result.vulnerabilities.filter(v => 
      v.description.toLowerCase().includes('authentication') || 
      v.description.toLowerCase().includes('auth')
    ).length === 0;
    
    result.compliance?.push({
      standard: 'Security Policy',
      requirement: 'Authentication Required',
      status: policy.requireAuthentication && !authCheck ? 'warning' : 'pass',
      description: 'Authentication implementation check',
      remediation: !authCheck ? 'Ensure proper authentication is implemented' : undefined
    });
  }
  
  private calculateStatistics(result: SecurityScanResult): void {
    for (const vuln of result.vulnerabilities) {
      result.statistics[vuln.severity]++;
      result.statistics.total++;
    }
  }
  
  private calculateSecurityScore(result: SecurityScanResult): void {
    let score = 100;
    
    // Deduct points based on vulnerabilities
    score -= result.statistics.critical * 25;
    score -= result.statistics.high * 15;
    score -= result.statistics.medium * 5;
    score -= result.statistics.low * 2;
    score -= result.statistics.info * 0.5;
    
    // Deduct points for secrets
    score -= (result.secrets?.length || 0) * 10;
    
    // Deduct points for dependency vulnerabilities
    score -= (result.dependencies?.filter(d => d.severity === 'critical').length || 0) * 10;
    score -= (result.dependencies?.filter(d => d.severity === 'high').length || 0) * 5;
    
    // Ensure score doesn't go below 0
    result.score = Math.max(0, Math.round(score));
  }
  
  private generateRecommendations(result: SecurityScanResult): void {
    const recommendations: string[] = [];
    
    if (result.statistics.critical > 0) {
      recommendations.push('🔴 URGENT: Fix all critical vulnerabilities immediately');
    }
    
    if (result.statistics.high > 0) {
      recommendations.push('⚠️ Address high severity vulnerabilities as soon as possible');
    }
    
    if (result.secrets && result.secrets.length > 0) {
      recommendations.push('🔑 Remove exposed secrets and rotate all credentials');
      recommendations.push('📝 Implement secret scanning in CI/CD pipeline');
    }
    
    if (result.dependencies && result.dependencies.length > 0) {
      recommendations.push('📦 Update vulnerable dependencies');
      recommendations.push('🔄 Set up automated dependency updates (e.g., Dependabot)');
    }
    
    if (result.score < 50) {
      recommendations.push('🛡️ Consider conducting a professional security audit');
    }
    
    if (result.vulnerabilities.some(v => v.type === 'Missing Security Headers')) {
      recommendations.push('🔒 Implement security headers using helmet.js or similar');
    }
    
    if (!result.vulnerabilities.some(v => v.description.includes('rate limit'))) {
      recommendations.push('⏱️ Implement rate limiting to prevent abuse');
    }
    
    result.recommendations = recommendations;
  }
  
  async analyze(scanResult: SecurityScanResult): Promise<{
    summary: string;
    riskLevel: 'critical' | 'high' | 'medium' | 'low';
    topRisks: SecurityVulnerability[];
    actionPlan: string[];
    estimatedEffort: string;
  }> {
    const riskLevel = this.determineRiskLevel(scanResult);
    const topRisks = this.getTopRisks(scanResult);
    const actionPlan = this.createActionPlan(scanResult);
    const estimatedEffort = this.estimateRemediationEffort(scanResult);
    
    const summary = `Security scan completed with score: ${scanResult.score}/100
Found ${scanResult.statistics.total} vulnerabilities:
- Critical: ${scanResult.statistics.critical}
- High: ${scanResult.statistics.high}
- Medium: ${scanResult.statistics.medium}
- Low: ${scanResult.statistics.low}
- Info: ${scanResult.statistics.info}

${scanResult.secrets?.length || 0} potential secrets exposed
${scanResult.dependencies?.length || 0} vulnerable dependencies`;
    
    return {
      summary,
      riskLevel,
      topRisks,
      actionPlan,
      estimatedEffort
    };
  }
  
  private determineRiskLevel(result: SecurityScanResult): 'critical' | 'high' | 'medium' | 'low' {
    if (result.statistics.critical > 0 || result.score < 30) return 'critical';
    if (result.statistics.high > 2 || result.score < 50) return 'high';
    if (result.statistics.medium > 5 || result.score < 70) return 'medium';
    return 'low';
  }
  
  private getTopRisks(result: SecurityScanResult, limit: number = 5): SecurityVulnerability[] {
    return result.vulnerabilities
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, limit);
  }
  
  private createActionPlan(result: SecurityScanResult): string[] {
    const plan: string[] = [];
    
    // Group vulnerabilities by type
    const groupedVulns = new Map<string, SecurityVulnerability[]>();
    for (const vuln of result.vulnerabilities) {
      const vulns = groupedVulns.get(vuln.type) || [];
      vulns.push(vuln);
      groupedVulns.set(vuln.type, vulns);
    }
    
    // Create action items
    let stepNumber = 1;
    
    // Critical items first
    const criticalVulns = result.vulnerabilities.filter(v => v.severity === 'critical');
    if (criticalVulns.length > 0) {
      for (const vuln of criticalVulns) {
        if (vuln.fixCommand) {
          plan.push(`${stepNumber++}. Run: ${vuln.fixCommand}`);
        } else {
          plan.push(`${stepNumber++}. Fix ${vuln.type} in ${vuln.file}${vuln.line ? `:${vuln.line}` : ''}`);
        }
      }
    }
    
    // Secrets
    if (result.secrets && result.secrets.length > 0) {
      plan.push(`${stepNumber++}. Remove ${result.secrets.length} exposed secrets from codebase`);
      plan.push(`${stepNumber++}. Rotate all exposed credentials`);
      plan.push(`${stepNumber++}. Add .gitignore entries for sensitive files`);
    }
    
    // Dependencies
    if (result.dependencies && result.dependencies.length > 0) {
      const criticalDeps = result.dependencies.filter(d => d.severity === 'critical');
      const highDeps = result.dependencies.filter(d => d.severity === 'high');
      
      if (criticalDeps.length > 0) {
        plan.push(`${stepNumber++}. Update ${criticalDeps.length} critical dependency vulnerabilities`);
      }
      if (highDeps.length > 0) {
        plan.push(`${stepNumber++}. Update ${highDeps.length} high severity dependency vulnerabilities`);
      }
      plan.push(`${stepNumber++}. Run: npm audit fix`);
    }
    
    // General improvements
    if (result.vulnerabilities.some(v => v.type === 'Missing Security Headers')) {
      plan.push(`${stepNumber++}. Install and configure helmet.js: npm install helmet`);
    }
    
    return plan;
  }
  
  private estimateRemediationEffort(result: SecurityScanResult): string {
    let hours = 0;
    
    // Estimate based on vulnerability counts
    hours += result.statistics.critical * 4;
    hours += result.statistics.high * 2;
    hours += result.statistics.medium * 1;
    hours += result.statistics.low * 0.5;
    hours += result.statistics.info * 0.25;
    
    // Add time for secrets
    hours += (result.secrets?.length || 0) * 0.5;
    
    // Add time for dependencies
    hours += (result.dependencies?.length || 0) * 0.25;
    
    if (hours < 8) return `${Math.ceil(hours)} hours`;
    if (hours < 40) return `${Math.ceil(hours / 8)} days`;
    return `${Math.ceil(hours / 40)} weeks`;
  }
  
  async improve(scanResult: SecurityScanResult, options: {
    autoFix?: boolean;
    createPullRequest?: boolean;
    updateDependencies?: boolean;
    addSecurityTools?: boolean;
  } = {}): Promise<{
    fixed: number;
    improved: number;
    remaining: number;
    commands: string[];
  }> {
    const improvements = {
      fixed: 0,
      improved: 0,
      remaining: 0,
      commands: [] as string[]
    };
    
    if (options.updateDependencies) {
      improvements.commands.push('npm audit fix');
      improvements.commands.push('npm update');
      improvements.fixed += scanResult.dependencies?.filter(d => d.fixedIn).length || 0;
    }
    
    if (options.addSecurityTools) {
      improvements.commands.push('npm install --save helmet express-rate-limit');
      improvements.commands.push('npm install --save-dev eslint-plugin-security');
      improvements.improved += 2;
    }
    
    if (options.autoFix) {
      // Auto-fixable items
      for (const vuln of scanResult.vulnerabilities) {
        if (vuln.fixCommand) {
          improvements.commands.push(vuln.fixCommand);
          improvements.fixed++;
        }
      }
    }
    
    improvements.remaining = scanResult.statistics.total - improvements.fixed;
    
    this.emit('improve:complete', improvements);
    return improvements;
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
  
  private calculateEntropy(str: string): number {
    const freq = new Map<string, number>();
    
    for (const char of str) {
      freq.set(char, (freq.get(char) || 0) + 1);
    }
    
    let entropy = 0;
    const len = str.length;
    
    for (const count of freq.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    
    return entropy;
  }
  
  async generateReport(scanResult: SecurityScanResult, format: 'html' | 'json' | 'markdown' = 'markdown'): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(scanResult, null, 2);
        
      case 'markdown':
        return this.generateMarkdownReport(scanResult);
        
      case 'html':
        return this.generateHtmlReport(scanResult);
        
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  private generateMarkdownReport(result: SecurityScanResult): string {
    const report = [];
    
    report.push('# Security Audit Report');
    report.push(`\n**Date:** ${result.timestamp.toISOString()}`);
    report.push(`**Project:** ${result.projectPath}`);
    report.push(`**Security Score:** ${result.score}/100\n`);
    
    report.push('## Summary Statistics\n');
    report.push('| Severity | Count |');
    report.push('|----------|-------|');
    report.push(`| Critical | ${result.statistics.critical} |`);
    report.push(`| High | ${result.statistics.high} |`);
    report.push(`| Medium | ${result.statistics.medium} |`);
    report.push(`| Low | ${result.statistics.low} |`);
    report.push(`| Info | ${result.statistics.info} |`);
    report.push(`| **Total** | **${result.statistics.total}** |\n`);
    
    if (result.vulnerabilities.length > 0) {
      report.push('## Vulnerabilities\n');
      
      for (const vuln of result.vulnerabilities) {
        report.push(`### ${vuln.severity.toUpperCase()}: ${vuln.type}`);
        report.push(`- **File:** ${vuln.file}${vuln.line ? `:${vuln.line}` : ''}`);
        report.push(`- **Description:** ${vuln.description}`);
        report.push(`- **Recommendation:** ${vuln.recommendation}`);
        if (vuln.cwe) report.push(`- **CWE:** ${vuln.cwe}`);
        if (vuln.owasp) report.push(`- **OWASP:** ${vuln.owasp}`);
        if (vuln.fixCommand) report.push(`- **Fix Command:** \`${vuln.fixCommand}\``);
        report.push('');
      }
    }
    
    if (result.secrets && result.secrets.length > 0) {
      report.push('## Exposed Secrets\n');
      report.push('| Type | File | Line | Confidence |');
      report.push('|------|------|------|------------|');
      
      for (const secret of result.secrets) {
        report.push(`| ${secret.type} | ${secret.file} | ${secret.line} | ${secret.confidence} |`);
      }
      report.push('');
    }
    
    if (result.dependencies && result.dependencies.length > 0) {
      report.push('## Vulnerable Dependencies\n');
      
      for (const dep of result.dependencies) {
        report.push(`- **${dep.package}@${dep.version}** (${dep.severity})`);
        if (dep.fixedIn) {
          report.push(`  - Fixed in: ${dep.fixedIn}`);
        }
      }
      report.push('');
    }
    
    if (result.recommendations.length > 0) {
      report.push('## Recommendations\n');
      for (const rec of result.recommendations) {
        report.push(`- ${rec}`);
      }
    }
    
    return report.join('\n');
  }
  
  private generateHtmlReport(result: SecurityScanResult): string {
    // Simple HTML report generation
    return `<!DOCTYPE html>
<html>
<head>
  <title>Security Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .score { font-size: 2em; font-weight: bold; }
    .critical { color: #d32f2f; }
    .high { color: #f57c00; }
    .medium { color: #fbc02d; }
    .low { color: #388e3c; }
    .info { color: #1976d2; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Security Audit Report</h1>
  <p><strong>Date:</strong> ${result.timestamp.toISOString()}</p>
  <p><strong>Project:</strong> ${result.projectPath}</p>
  <p class="score">Security Score: ${result.score}/100</p>
  
  <h2>Summary</h2>
  <table>
    <tr><th>Severity</th><th>Count</th></tr>
    <tr class="critical"><td>Critical</td><td>${result.statistics.critical}</td></tr>
    <tr class="high"><td>High</td><td>${result.statistics.high}</td></tr>
    <tr class="medium"><td>Medium</td><td>${result.statistics.medium}</td></tr>
    <tr class="low"><td>Low</td><td>${result.statistics.low}</td></tr>
    <tr class="info"><td>Info</td><td>${result.statistics.info}</td></tr>
    <tr><th>Total</th><th>${result.statistics.total}</th></tr>
  </table>
  
  <!-- Additional sections would be added here -->
</body>
</html>`;
  }
}

// Export singleton instance
export const securityAuditor = new SecurityAuditorAgent();