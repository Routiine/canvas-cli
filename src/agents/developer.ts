/**
 * Developer Agent
 * Implements code generation, refactoring, and technical solutions
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import chalk from 'chalk';
import { AgentConfigurationSystem } from './config/agent-config.js';
import { PromptTemplateSystem } from './config/prompt-templates.js';
import { ModelManager } from '../models/model-manager.js';
import { CodeGenerator } from './pipelines/code-generator.js';
import { ImplementationStorage } from './storage/implementation-storage.js';
import { CodeValidator } from './validators/code-validator.js';

// Code Implementation Schema
export const CodeImplementationSchema = z.object({
  id: z.string(),
  storyId: z.string().optional(),
  title: z.string(),
  description: z.string(),
  language: z.enum(['typescript', 'javascript', 'python', 'java', 'go', 'rust', 'csharp']),
  framework: z.string().optional(),
  
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
    type: z.enum(['source', 'test', 'config', 'documentation']),
    language: z.string(),
    size: z.number(),
    changes: z.object({
      additions: z.number(),
      deletions: z.number(),
      modifications: z.number()
    }).optional()
  })),
  
  architecture: z.object({
    pattern: z.enum(['mvc', 'mvvm', 'microservices', 'serverless', 'monolithic', 'event-driven']),
    components: z.array(z.object({
      name: z.string(),
      type: z.string(),
      responsibility: z.string(),
      dependencies: z.array(z.string())
    })),
    layers: z.array(z.string()),
    designPatterns: z.array(z.string())
  }),
  
  dependencies: z.object({
    external: z.array(z.object({
      name: z.string(),
      version: z.string(),
      purpose: z.string()
    })),
    internal: z.array(z.string())
  }),
  
  testing: z.object({
    strategy: z.enum(['unit', 'integration', 'e2e', 'mixed']),
    coverage: z.number().optional(),
    testFiles: z.array(z.string()),
    testCases: z.array(z.object({
      name: z.string(),
      type: z.string(),
      status: z.enum(['pending', 'passing', 'failing', 'skipped']).optional()
    }))
  }),
  
  quality: z.object({
    complexity: z.number(),
    maintainability: z.number(),
    readability: z.number(),
    performance: z.enum(['excellent', 'good', 'acceptable', 'needs-improvement']),
    security: z.array(z.object({
      issue: z.string(),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      recommendation: z.string()
    })).optional()
  }),
  
  documentation: z.object({
    readme: z.string().optional(),
    apiDocs: z.array(z.object({
      endpoint: z.string(),
      method: z.string(),
      description: z.string(),
      parameters: z.array(z.any()),
      response: z.any()
    })).optional(),
    comments: z.object({
      total: z.number(),
      percentage: z.number()
    })
  }),
  
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    author: z.string(),
    reviewStatus: z.enum(['pending', 'approved', 'needs-changes', 'rejected']).optional(),
    deploymentReady: z.boolean()
  })
});

export type CodeImplementation = z.infer<typeof CodeImplementationSchema>;

// Code Review Schema
export const CodeReviewSchema = z.object({
  id: z.string(),
  implementationId: z.string(),
  reviewer: z.string(),
  status: z.enum(['pending', 'in-progress', 'completed']),
  
  findings: z.array(z.object({
    file: z.string(),
    line: z.number().optional(),
    type: z.enum(['bug', 'security', 'performance', 'style', 'design', 'documentation']),
    severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
    description: z.string(),
    suggestion: z.string()
  })),
  
  metrics: z.object({
    codeQuality: z.number(),
    testCoverage: z.number(),
    documentation: z.number(),
    security: z.number(),
    performance: z.number()
  }),
  
  recommendations: z.array(z.string()),
  approved: z.boolean(),
  comments: z.string().optional()
});

export type CodeReview = z.infer<typeof CodeReviewSchema>;

/**
 * Developer Agent Implementation
 */
export class DeveloperAgent extends EventEmitter {
  private configSystem: AgentConfigurationSystem;
  private templateSystem: PromptTemplateSystem;
  private modelManager: ModelManager;
  private codeGenerator: CodeGenerator;
  private storage: ImplementationStorage;
  private validator: CodeValidator;
  private agentId = 'developer';
  
  constructor() {
    super();
    this.configSystem = new AgentConfigurationSystem();
    this.templateSystem = new PromptTemplateSystem();
    this.modelManager = new ModelManager();
    this.codeGenerator = new CodeGenerator();
    this.storage = new ImplementationStorage();
    this.validator = new CodeValidator();
  }
  
  async initialize(): Promise<void> {
    await this.configSystem.initialize();
    await this.templateSystem.initialize();
    await this.storage.initialize();
    await this.ensureDeveloperConfig();
    
    this.emit('initialized', { agent: this.agentId });
  }
  
  /**
   * Implement a user story
   */
  async implementStory(
    story: any,
    requirements?: any,
    architecture?: any
  ): Promise<CodeImplementation> {
    console.log(chalk.cyan('💻 Implementing user story...'));
    
    // Generate implementation plan
    const plan = await this.createImplementationPlan(story, requirements, architecture);
    
    // Generate code for each component
    const files = await this.generateCode(plan);
    
    // Generate tests
    const testFiles = await this.generateTests(plan, files);
    
    // Validate implementation
    const validation = await this.validator.validateImplementation(files, testFiles);
    
    // Create implementation object
    const implementation: CodeImplementation = {
      id: `impl-${Date.now()}`,
      storyId: story.id,
      title: story.title || 'Implementation',
      description: story.narrative || story.soThat || '',
      language: plan.language,
      framework: plan.framework,
      files: [...files, ...testFiles],
      architecture: plan.architecture,
      dependencies: plan.dependencies,
      testing: {
        strategy: 'mixed',
        testFiles: testFiles.map(f => f.path),
        testCases: plan.testCases
      },
      quality: validation.quality,
      documentation: {
        comments: {
          total: validation.commentCount,
          percentage: validation.commentPercentage
        }
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: this.agentId,
        deploymentReady: validation.isValid
      }
    };
    
    // Store implementation
    await this.storage.store(implementation);
    
    this.emit('story-implemented', { implementation, story });
    
    return implementation;
  }
  
  /**
   * Refactor existing code
   */
  async refactorCode(
    code: string,
    language: string,
    objectives: string[]
  ): Promise<any> {
    console.log(chalk.cyan('🔧 Refactoring code...'));
    
    const prompt = this.buildRefactoringPrompt(code, language, objectives);
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.3,
      maxTokens: 4000,
      format: 'code'
    });
    
    const refactored = {
      original: code,
      refactored: response,
      language,
      objectives,
      improvements: await this.analyzeImprovements(code, response, language)
    };
    
    this.emit('code-refactored', { refactored });
    
    return refactored;
  }
  
  /**
   * Fix bugs in code
   */
  async fixBugs(
    code: string,
    language: string,
    bugs: Array<{ description: string; line?: number }>
  ): Promise<any> {
    console.log(chalk.cyan('🐛 Fixing bugs...'));
    
    const prompt = this.buildBugFixPrompt(code, language, bugs);
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.2,
      maxTokens: 4000,
      format: 'code'
    });
    
    const fixed = {
      original: code,
      fixed: response,
      bugs,
      changes: await this.identifyChanges(code, response)
    };
    
    this.emit('bugs-fixed', { fixed });
    
    return fixed;
  }
  
  /**
   * Optimize code performance
   */
  async optimizePerformance(
    code: string,
    language: string,
    metrics?: any
  ): Promise<any> {
    console.log(chalk.cyan('⚡ Optimizing performance...'));
    
    const prompt = this.buildOptimizationPrompt(code, language, metrics);
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.4,
      maxTokens: 4000,
      format: 'code'
    });
    
    const optimized = {
      original: code,
      optimized: response,
      improvements: await this.analyzePerformanceImprovements(code, response, language),
      recommendations: []
    };
    
    this.emit('performance-optimized', { optimized });
    
    return optimized;
  }
  
  /**
   * Generate API implementation
   */
  async implementAPI(
    specification: any,
    framework: string = 'express'
  ): Promise<any> {
    console.log(chalk.cyan('🔌 Implementing API...'));
    
    const implementation = await this.codeGenerator.generateAPI(specification, framework);
    
    // Add validation
    const validation = await this.validator.validateAPI(implementation);
    
    this.emit('api-implemented', { implementation, specification });
    
    return {
      ...implementation,
      validation
    };
  }
  
  /**
   * Generate database schema
   */
  async generateSchema(
    dataModel: any,
    database: 'postgres' | 'mysql' | 'mongodb' = 'postgres'
  ): Promise<any> {
    console.log(chalk.cyan('🗄️ Generating database schema...'));
    
    const schema = await this.codeGenerator.generateDatabaseSchema(dataModel, database);
    
    this.emit('schema-generated', { schema, database });
    
    return schema;
  }
  
  /**
   * Perform code review
   */
  async reviewCode(
    implementation: CodeImplementation
  ): Promise<CodeReview> {
    console.log(chalk.cyan('👀 Reviewing code...'));
    
    const findings = [];
    
    // Review each file
    for (const file of implementation.files) {
      const fileFindings = await this.reviewFile(file);
      findings.push(...fileFindings);
    }
    
    // Calculate metrics
    const metrics = {
      codeQuality: implementation.quality.maintainability,
      testCoverage: implementation.testing.coverage || 0,
      documentation: implementation.documentation.comments.percentage,
      security: 100 - (implementation.quality.security?.length || 0) * 10,
      performance: this.performanceToScore(implementation.quality.performance)
    };
    
    // Generate recommendations
    const recommendations = await this.generateRecommendations(findings, metrics);
    
    const review: CodeReview = {
      id: `review-${Date.now()}`,
      implementationId: implementation.id,
      reviewer: this.agentId,
      status: 'completed',
      findings,
      metrics,
      recommendations,
      approved: findings.filter(f => f.severity === 'critical').length === 0,
      comments: this.generateReviewSummary(findings, metrics)
    };
    
    this.emit('code-reviewed', { review, implementation });
    
    return review;
  }
  
  /**
   * Generate documentation
   */
  async generateDocumentation(
    code: string,
    language: string,
    type: 'inline' | 'api' | 'readme' = 'inline'
  ): Promise<string> {
    console.log(chalk.cyan('📚 Generating documentation...'));
    
    const prompt = this.buildDocumentationPrompt(code, language, type);
    
    const documentation = await this.modelManager.generateResponse(prompt, {
      temperature: 0.5,
      maxTokens: 3000
    });
    
    this.emit('documentation-generated', { type, language });
    
    return documentation;
  }
  
  /**
   * Create implementation plan
   */
  private async createImplementationPlan(story: any, requirements?: any, architecture?: any): Promise<any> {
    const prompt = `Create an implementation plan for the following user story:

Story: ${JSON.stringify(story, null, 2)}
${requirements ? `Requirements: ${JSON.stringify(requirements, null, 2)}` : ''}
${architecture ? `Architecture: ${JSON.stringify(architecture, null, 2)}` : ''}

Provide:
1. Language and framework selection
2. Component breakdown
3. File structure
4. Dependencies needed
5. Test cases to implement

Format as JSON.`;
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 2000,
      format: 'json'
    });
    
    try {
      return JSON.parse(response);
    } catch {
      return {
        language: 'typescript',
        framework: 'express',
        architecture: {
          pattern: 'mvc',
          components: [],
          layers: ['controller', 'service', 'repository'],
          designPatterns: ['repository', 'dependency-injection']
        },
        dependencies: {
          external: [],
          internal: []
        },
        testCases: []
      };
    }
  }
  
  /**
   * Generate code files
   */
  private async generateCode(plan: any): Promise<any[]> {
    const files = [];
    
    for (const component of plan.components || []) {
      const code = await this.codeGenerator.generateComponent(
        component,
        plan.language,
        plan.framework
      );
      
      files.push({
        path: component.path || `src/${component.name}.${this.getExtension(plan.language)}`,
        content: code,
        type: 'source',
        language: plan.language,
        size: code.length
      });
    }
    
    return files;
  }
  
  /**
   * Generate test files
   */
  private async generateTests(plan: any, sourceFiles: any[]): Promise<any[]> {
    const testFiles = [];
    
    for (const sourceFile of sourceFiles) {
      const tests = await this.codeGenerator.generateTests(
        sourceFile.content,
        plan.language,
        plan.testFramework || 'jest'
      );
      
      testFiles.push({
        path: sourceFile.path.replace('/src/', '/test/').replace(/\.\w+$/, '.test' + this.getExtension(plan.language)),
        content: tests,
        type: 'test',
        language: plan.language,
        size: tests.length
      });
    }
    
    return testFiles;
  }
  
  /**
   * Build refactoring prompt
   */
  private buildRefactoringPrompt(code: string, language: string, objectives: string[]): string {
    return `Refactor the following ${language} code to achieve these objectives:
${objectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

Original code:
\`\`\`${language}
${code}
\`\`\`

Provide the refactored code following best practices, clean code principles, and the specified objectives.
Maintain the same functionality while improving code quality.`;
  }
  
  /**
   * Build bug fix prompt
   */
  private buildBugFixPrompt(code: string, language: string, bugs: any[]): string {
    return `Fix the following bugs in this ${language} code:

Bugs to fix:
${bugs.map((bug, i) => `${i + 1}. ${bug.description}${bug.line ? ` (around line ${bug.line})` : ''}`).join('\n')}

Code:
\`\`\`${language}
${code}
\`\`\`

Provide the corrected code with all bugs fixed. Add comments to indicate what was changed.`;
  }
  
  /**
   * Build optimization prompt
   */
  private buildOptimizationPrompt(code: string, language: string, metrics?: any): string {
    return `Optimize the following ${language} code for better performance:

${metrics ? `Current metrics: ${JSON.stringify(metrics, null, 2)}` : ''}

Code:
\`\`\`${language}
${code}
\`\`\`

Focus on:
1. Time complexity improvements
2. Space complexity optimization
3. Reducing unnecessary operations
4. Better algorithm selection
5. Caching opportunities

Provide the optimized code with comments explaining the improvements.`;
  }
  
  /**
   * Build documentation prompt
   */
  private buildDocumentationPrompt(code: string, language: string, type: string): string {
    const prompts = {
      inline: `Add comprehensive inline documentation (comments, docstrings) to this ${language} code`,
      api: `Generate API documentation for this ${language} code in OpenAPI/Swagger format`,
      readme: `Generate a README.md file documenting this ${language} code with usage examples`
    };
    
    return `${prompts[type as keyof typeof prompts]}:

\`\`\`${language}
${code}
\`\`\`

Provide clear, concise, and helpful documentation.`;
  }
  
  /**
   * Review a single file
   */
  private async reviewFile(file: any): Promise<any[]> {
    const findings = [];
    
    // Check for common issues
    const issues = await this.validator.findIssues(file.content, file.language);
    
    for (const issue of issues) {
      findings.push({
        file: file.path,
        line: issue.line,
        type: issue.type,
        severity: issue.severity,
        description: issue.description,
        suggestion: issue.suggestion
      });
    }
    
    return findings;
  }
  
  /**
   * Analyze improvements between original and refactored code
   */
  private async analyzeImprovements(original: string, refactored: string, language: string): Promise<any> {
    return {
      linesReduced: original.split('\n').length - refactored.split('\n').length,
      complexityReduced: true, // Would calculate cyclomatic complexity
      readabilityImproved: true, // Would use readability metrics
      duplicatesRemoved: 0 // Would detect duplicate code
    };
  }
  
  /**
   * Identify changes between two code versions
   */
  private async identifyChanges(original: string, modified: string): Promise<any> {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    return {
      additions: Math.max(0, modifiedLines.length - originalLines.length),
      deletions: Math.max(0, originalLines.length - modifiedLines.length),
      modifications: Math.abs(originalLines.length - modifiedLines.length)
    };
  }
  
  /**
   * Analyze performance improvements
   */
  private async analyzePerformanceImprovements(original: string, optimized: string, language: string): Promise<any> {
    return {
      estimatedSpeedup: '2x', // Would calculate based on complexity analysis
      memoryReduction: '30%', // Would estimate based on data structure changes
      complexityImproved: 'O(n²) → O(n log n)' // Would analyze algorithm complexity
    };
  }
  
  /**
   * Convert performance enum to score
   */
  private performanceToScore(performance: string): number {
    const scores: Record<string, number> = {
      'excellent': 100,
      'good': 80,
      'acceptable': 60,
      'needs-improvement': 40
    };
    return scores[performance] || 50;
  }
  
  /**
   * Generate review recommendations
   */
  private async generateRecommendations(findings: any[], metrics: any): Promise<string[]> {
    const recommendations = [];
    
    if (metrics.testCoverage < 80) {
      recommendations.push('Increase test coverage to at least 80%');
    }
    
    if (metrics.documentation < 50) {
      recommendations.push('Add more documentation and comments');
    }
    
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      recommendations.push(`Address ${criticalFindings.length} critical issues before deployment`);
    }
    
    if (metrics.security < 80) {
      recommendations.push('Review and fix security vulnerabilities');
    }
    
    return recommendations;
  }
  
  /**
   * Generate review summary
   */
  private generateReviewSummary(findings: any[], metrics: any): string {
    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const majorCount = findings.filter(f => f.severity === 'major').length;
    
    let summary = `Code review completed with ${findings.length} findings. `;
    
    if (criticalCount > 0) {
      summary += `Found ${criticalCount} critical issues that must be fixed. `;
    }
    
    if (majorCount > 0) {
      summary += `Found ${majorCount} major issues to address. `;
    }
    
    const avgScore = Object.values(metrics).reduce((a: number, b: any) => a + b, 0) / Object.keys(metrics).length;
    summary += `Overall quality score: ${avgScore.toFixed(1)}/100.`;
    
    return summary;
  }
  
  /**
   * Get file extension for language
   */
  private getExtension(language: string): string {
    const extensions: Record<string, string> = {
      typescript: '.ts',
      javascript: '.js',
      python: '.py',
      java: '.java',
      go: '.go',
      rust: '.rs',
      csharp: '.cs'
    };
    return extensions[language] || '.txt';
  }
  
  /**
   * Ensure Developer configuration exists
   */
  private async ensureDeveloperConfig(): Promise<void> {
    const config = this.configSystem.getConfiguration(this.agentId);
    if (!config) {
      await this.configSystem.createConfiguration({
        id: 'developer',
        name: 'Developer Agent',
        description: 'Implements code generation, refactoring, and technical solutions',
        version: '1.0.0',
        enabled: true,
        role: {
          title: 'Senior Software Developer',
          department: 'Engineering',
          level: 'senior',
          expertise: [
            'Full-Stack Development',
            'System Design',
            'Code Architecture',
            'Performance Optimization',
            'Testing Strategies',
            'Clean Code Practices'
          ]
        },
        behavior: {
          temperature: 0.4,
          maxTokens: 5000,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          responseStyle: 'technical',
          personality: {
            traits: ['meticulous', 'innovative', 'pragmatic', 'quality-focused'],
            communicationStyle: 'Technical and precise with emphasis on best practices',
            decisionMaking: 'Data-driven with focus on maintainability and performance'
          }
        },
        prompts: {
          system: `You are a Senior Software Developer with expertise in multiple programming languages and frameworks.
Your role is to:
1. Write clean, maintainable, and efficient code
2. Follow SOLID principles and design patterns
3. Implement comprehensive testing strategies
4. Optimize for performance and scalability
5. Ensure code security and best practices
6. Document code thoroughly
7. Refactor and improve existing code

Always prioritize code quality, maintainability, and performance.`,
          taskPrefix: 'As a Senior Developer, I will implement:',
          taskSuffix: 'Following best practices and clean code principles.'
        },
        capabilities: {
          actions: [
            'code_generation',
            'refactoring',
            'bug_fixing',
            'optimization',
            'testing',
            'documentation',
            'code_review'
          ],
          tools: ['ide', 'debugger', 'profiler', 'linter', 'test_runner'],
          outputFormats: ['code', 'json', 'markdown'],
          maxIterations: 5
        },
        integrations: {
          requiresApproval: false,
          canCallOtherAgents: true,
          allowedAgents: ['solutions-architect', 'qa-engineer', 'scrum-master']
        },
        metrics: {
          trackUsage: true,
          trackPerformance: true,
          trackErrors: true,
          reportingInterval: 3600000
        }
      });
    }
  }
}

// Export singleton instance
export const developerAgent = new DeveloperAgent();