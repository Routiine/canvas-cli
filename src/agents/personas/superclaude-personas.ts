/**
 * SuperClaude Persona System
 * 9 specialized personas with auto-activation and context-aware switching
 */

import { EventEmitter } from 'events';
import { BaseAgent } from '../base-agent.js';
import type { AgentConfig } from '../agent-types.js';

export interface PersonaContext {
  fileType?: string;
  taskType?: string;
  keywords?: string[];
  complexity?: 'simple' | 'medium' | 'complex' | 'expert';
  domain?: string;
  previousPersona?: string;
}

export interface PersonaActivation {
  triggers: {
    fileTypes?: string[];
    keywords?: string[];
    taskTypes?: string[];
    domains?: string[];
  };
  priority: number;
  confidence: number;
}

export interface PersonaMetrics {
  activations: number;
  successRate: number;
  averageResponseTime: number;
  lastActivated?: Date;
  feedback: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

export abstract class SuperClaudePersona extends BaseAgent {
  protected activation: PersonaActivation;
  protected personaMetrics: PersonaMetrics;
  protected specializations: string[];
  protected contextHistory: PersonaContext[] = [];

  constructor(config: AgentConfig, activation: PersonaActivation) {
    super(config);
    this.activation = activation;
    this.personaMetrics = {
      activations: 0,
      successRate: 1.0,
      averageResponseTime: 0,
      feedback: { positive: 0, negative: 0, neutral: 0 }
    };
    this.specializations = [];
  }

  /**
   * Abstract process method to be implemented by subclasses
   */
  abstract process(input: string): Promise<string>;

  /**
   * Calculate activation score for this persona based on context
   */
  calculateActivationScore(context: PersonaContext): number {
    let score = 0;
    const { triggers } = this.activation;

    // File type matching
    if (context.fileType && triggers.fileTypes) {
      const fileMatch = triggers.fileTypes.some(ft => 
        context.fileType?.includes(ft) || ft === '*'
      );
      if (fileMatch) score += 30;
    }

    // Keyword matching
    if (context.keywords && triggers.keywords) {
      const keywordMatches = context.keywords.filter(kw =>
        triggers.keywords!.some(tk => kw.toLowerCase().includes(tk.toLowerCase()))
      ).length;
      score += Math.min(keywordMatches * 10, 40);
    }

    // Task type matching
    if (context.taskType && triggers.taskTypes) {
      const taskMatch = triggers.taskTypes.includes(context.taskType);
      if (taskMatch) score += 20;
    }

    // Domain matching
    if (context.domain && triggers.domains) {
      const domainMatch = triggers.domains.includes(context.domain);
      if (domainMatch) score += 10;
    }

    // Apply priority multiplier
    score *= this.activation.priority;

    // Consider confidence threshold
    return score * this.activation.confidence;
  }

  /**
   * Activate persona with context
   */
  async activate(context: PersonaContext): Promise<void> {
    this.personaMetrics.activations++;
    this.personaMetrics.lastActivated = new Date();
    this.contextHistory.push(context);
    
    // Keep only last 10 contexts
    if (this.contextHistory.length > 10) {
      this.contextHistory.shift();
    }

    await this.onActivate(context);
  }

  /**
   * Hook for persona-specific activation logic
   */
  protected abstract onActivate(context: PersonaContext): Promise<void>;

  /**
   * Get persona performance metrics
   */
  getPersonaMetrics(): PersonaMetrics {
    return { ...this.personaMetrics };
  }

  /**
   * Update success metrics
   */
  recordSuccess(responseTime: number): void {
    const total = this.personaMetrics.activations;
    const currentAvg = this.personaMetrics.averageResponseTime;
    
    this.personaMetrics.averageResponseTime = 
      (currentAvg * (total - 1) + responseTime) / total;
    
    this.personaMetrics.successRate = 
      (this.personaMetrics.successRate * (total - 1) + 1) / total;
  }

  /**
   * Record user feedback
   */
  recordFeedback(type: 'positive' | 'negative' | 'neutral'): void {
    this.personaMetrics.feedback[type]++;
  }
}

/**
 * Frontend Developer Persona
 */
export class FrontendPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Frontend Developer',
        role: 'frontend',
        model: 'claude-3-opus',
        temperature: 0.7,
        maxTokens: 4000,
        systemPrompt: `You are an expert frontend developer specializing in modern web technologies.
        You have deep expertise in React, Vue, Angular, TypeScript, CSS, and web performance.
        You follow best practices for accessibility, responsive design, and user experience.
        You write clean, maintainable, and performant code with proper testing.`
      },
      {
        triggers: {
          fileTypes: ['.tsx', '.jsx', '.vue', '.html', '.css', '.scss', '.sass'],
          keywords: ['ui', 'component', 'frontend', 'react', 'vue', 'css', 'style', 'layout'],
          taskTypes: ['ui-development', 'component-creation', 'styling', 'responsive-design'],
          domains: ['web', 'mobile-web', 'pwa']
        },
        priority: 1.0,
        confidence: 0.9
      }
    );

    this.specializations = [
      'React/Vue/Angular development',
      'Component architecture',
      'State management',
      'CSS/SASS/Tailwind',
      'Web accessibility',
      'Performance optimization',
      'Responsive design',
      'Cross-browser compatibility'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Frontend persona activated for ${context.fileType || context.taskType}`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a frontend expert, ${input}
    
    Consider:
    - Component reusability and composition
    - Performance implications
    - Accessibility standards (WCAG)
    - Cross-browser compatibility
    - Mobile responsiveness
    - Modern best practices`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * Backend Developer Persona
 */
export class BackendPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Backend Developer',
        role: 'backend',
        model: 'claude-3-opus',
        temperature: 0.6,
        maxTokens: 4000,
        systemPrompt: `You are an expert backend developer with deep knowledge of server-side technologies.
        You specialize in Node.js, Python, Go, databases, APIs, and microservices.
        You design scalable, secure, and maintainable backend systems.
        You follow SOLID principles and implement proper error handling, logging, and monitoring.`
      },
      {
        triggers: {
          fileTypes: ['.js', '.ts', '.py', '.go', '.java', '.rs', '.sql'],
          keywords: ['api', 'server', 'database', 'backend', 'endpoint', 'auth', 'query'],
          taskTypes: ['api-development', 'database-design', 'authentication', 'backend-logic'],
          domains: ['api', 'microservices', 'serverless']
        },
        priority: 1.0,
        confidence: 0.9
      }
    );

    this.specializations = [
      'RESTful API design',
      'GraphQL',
      'Database design and optimization',
      'Authentication and authorization',
      'Microservices architecture',
      'Message queues and event-driven systems',
      'Caching strategies',
      'Security best practices'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Backend persona activated for ${context.fileType || context.taskType}`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a backend expert, ${input}
    
    Consider:
    - Scalability and performance
    - Security implications
    - Data consistency and integrity
    - Error handling and recovery
    - API design best practices
    - Database optimization
    - Caching strategies`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * Software Architect Persona
 */
export class ArchitectPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Software Architect',
        role: 'architect',
        model: 'claude-3-opus',
        temperature: 0.5,
        maxTokens: 5000,
        systemPrompt: `You are a senior software architect with expertise in system design and architecture.
        You design scalable, maintainable, and robust software systems.
        You make informed decisions about technology choices, patterns, and trade-offs.
        You consider both technical and business requirements in your designs.`
      },
      {
        triggers: {
          fileTypes: ['.md', '.yaml', '.yml', '.json'],
          keywords: ['architecture', 'design', 'pattern', 'system', 'scalability', 'integration'],
          taskTypes: ['system-design', 'architecture-review', 'technology-selection'],
          domains: ['enterprise', 'cloud', 'distributed-systems']
        },
        priority: 1.2,
        confidence: 0.85
      }
    );

    this.specializations = [
      'System architecture',
      'Design patterns',
      'Microservices vs Monoliths',
      'Cloud architecture (AWS/Azure/GCP)',
      'Event-driven architecture',
      'Domain-driven design',
      'Technology evaluation',
      'Architecture documentation'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Architect persona activated for ${context.taskType}`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a software architect, ${input}
    
    Provide architectural insights considering:
    - System scalability and reliability
    - Technology trade-offs
    - Design patterns and best practices
    - Integration points and interfaces
    - Non-functional requirements
    - Future maintainability
    - Cost and resource implications`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * Code Analyzer Persona
 */
export class AnalyzerPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Code Analyzer',
        role: 'analyzer',
        model: 'claude-3-opus',
        temperature: 0.3,
        maxTokens: 4000,
        systemPrompt: `You are an expert code analyzer specializing in code review and analysis.
        You identify bugs, performance issues, security vulnerabilities, and code smells.
        You provide detailed analysis with specific recommendations for improvement.
        You understand multiple programming languages and their best practices.`
      },
      {
        triggers: {
          keywords: ['analyze', 'review', 'audit', 'check', 'inspect', 'evaluate'],
          taskTypes: ['code-review', 'analysis', 'audit', 'inspection'],
          domains: ['quality-assurance', 'code-quality']
        },
        priority: 1.1,
        confidence: 0.95
      }
    );

    this.specializations = [
      'Code quality analysis',
      'Bug detection',
      'Performance profiling',
      'Security vulnerability scanning',
      'Code smell identification',
      'Complexity analysis',
      'Test coverage assessment',
      'Dependency analysis'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Analyzer persona activated for code review`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a code analyzer, perform detailed analysis: ${input}
    
    Analyze for:
    - Potential bugs and logic errors
    - Performance bottlenecks
    - Security vulnerabilities
    - Code smells and anti-patterns
    - Maintainability issues
    - Missing error handling
    - Test coverage gaps
    
    Provide specific line numbers and concrete recommendations.`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * Security Expert Persona
 */
export class SecurityPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Security Expert',
        role: 'security',
        model: 'claude-3-opus',
        temperature: 0.2,
        maxTokens: 4000,
        systemPrompt: `You are a cybersecurity expert specializing in application security.
        You identify and fix security vulnerabilities following OWASP guidelines.
        You implement security best practices and secure coding patterns.
        You understand authentication, authorization, encryption, and secure communication.`
      },
      {
        triggers: {
          keywords: ['security', 'vulnerability', 'auth', 'encryption', 'oauth', 'jwt', 'ssl'],
          taskTypes: ['security-audit', 'vulnerability-assessment', 'security-implementation'],
          domains: ['security', 'compliance']
        },
        priority: 1.3,
        confidence: 0.95
      }
    );

    this.specializations = [
      'OWASP Top 10',
      'Authentication & Authorization',
      'Encryption and cryptography',
      'Secure API design',
      'Input validation and sanitization',
      'SQL injection prevention',
      'XSS and CSRF protection',
      'Security headers and CSP'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Security persona activated for security analysis`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a security expert, ${input}
    
    Focus on:
    - OWASP Top 10 vulnerabilities
    - Authentication and authorization flaws
    - Data protection and encryption
    - Input validation and sanitization
    - Secure communication
    - Security headers and configurations
    - Compliance requirements (GDPR, PCI-DSS, etc.)
    
    Provide specific security recommendations with code examples.`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * QA Engineer Persona
 */
export class QAPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'QA Engineer',
        role: 'qa',
        model: 'claude-3-opus',
        temperature: 0.4,
        maxTokens: 4000,
        systemPrompt: `You are an expert QA engineer specializing in testing strategies and automation.
        You design comprehensive test plans and write effective test cases.
        You implement unit tests, integration tests, and end-to-end tests.
        You ensure code quality through thorough testing and validation.`
      },
      {
        triggers: {
          fileTypes: ['.test.ts', '.spec.ts', '.test.js', '.spec.js'],
          keywords: ['test', 'testing', 'qa', 'quality', 'coverage', 'jest', 'mocha', 'cypress'],
          taskTypes: ['testing', 'test-creation', 'test-planning', 'qa-review'],
          domains: ['testing', 'quality-assurance']
        },
        priority: 1.0,
        confidence: 0.9
      }
    );

    this.specializations = [
      'Test strategy and planning',
      'Unit testing',
      'Integration testing',
      'End-to-end testing',
      'Performance testing',
      'Test automation',
      'Test coverage analysis',
      'Bug tracking and reporting'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`QA persona activated for testing tasks`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a QA engineer, ${input}
    
    Ensure:
    - Comprehensive test coverage
    - Edge cases and error scenarios
    - Performance and load testing considerations
    - Clear test descriptions
    - Proper assertions and expectations
    - Test data management
    - Mock and stub strategies`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * Performance Expert Persona
 */
export class PerformancePersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Performance Expert',
        role: 'performance',
        model: 'claude-3-opus',
        temperature: 0.4,
        maxTokens: 4000,
        systemPrompt: `You are a performance optimization expert specializing in application performance.
        You identify bottlenecks and implement optimizations across the stack.
        You understand profiling, caching, lazy loading, and performance best practices.
        You optimize for speed, memory usage, and resource efficiency.`
      },
      {
        triggers: {
          keywords: ['performance', 'optimize', 'slow', 'bottleneck', 'cache', 'speed', 'memory'],
          taskTypes: ['performance-optimization', 'profiling', 'benchmarking'],
          domains: ['performance', 'optimization']
        },
        priority: 1.1,
        confidence: 0.85
      }
    );

    this.specializations = [
      'Performance profiling',
      'Memory optimization',
      'Database query optimization',
      'Caching strategies',
      'Lazy loading and code splitting',
      'Network optimization',
      'Algorithm optimization',
      'Resource management'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Performance persona activated for optimization`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a performance expert, ${input}
    
    Analyze and optimize for:
    - Time complexity and algorithm efficiency
    - Memory usage and leaks
    - Database query performance
    - Network requests and payload sizes
    - Rendering performance
    - Caching opportunities
    - Resource loading strategies
    
    Provide specific metrics and benchmarks where possible.`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * Code Refactorer Persona
 */
export class RefactorerPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Code Refactorer',
        role: 'refactorer',
        model: 'claude-3-opus',
        temperature: 0.5,
        maxTokens: 4000,
        systemPrompt: `You are an expert in code refactoring and clean code principles.
        You transform complex, messy code into clean, maintainable solutions.
        You apply SOLID principles, design patterns, and best practices.
        You improve code readability, testability, and maintainability.`
      },
      {
        triggers: {
          keywords: ['refactor', 'clean', 'improve', 'reorganize', 'simplify', 'restructure'],
          taskTypes: ['refactoring', 'code-cleanup', 'restructuring'],
          domains: ['code-quality', 'maintenance']
        },
        priority: 1.0,
        confidence: 0.9
      }
    );

    this.specializations = [
      'Clean code principles',
      'SOLID principles',
      'Design patterns',
      'Code smell elimination',
      'Function extraction',
      'Class restructuring',
      'Dependency injection',
      'Code documentation'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Refactorer persona activated for code improvement`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a refactoring expert, ${input}
    
    Apply refactoring techniques:
    - Extract methods and classes
    - Eliminate code duplication
    - Improve naming and readability
    - Apply appropriate design patterns
    - Reduce complexity and coupling
    - Enhance testability
    - Add meaningful documentation
    
    Explain each refactoring decision and its benefits.`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * Mentor Persona
 */
export class MentorPersona extends SuperClaudePersona {
  constructor() {
    super(
      {
        name: 'Technical Mentor',
        role: 'mentor',
        model: 'claude-3-opus',
        temperature: 0.7,
        maxTokens: 4000,
        systemPrompt: `You are an experienced technical mentor and educator.
        You explain complex concepts clearly and provide learning guidance.
        You help developers grow their skills and understanding.
        You provide constructive feedback and suggest learning resources.`
      },
      {
        triggers: {
          keywords: ['explain', 'teach', 'learn', 'understand', 'why', 'how', 'mentor', 'guide'],
          taskTypes: ['education', 'explanation', 'mentoring', 'guidance'],
          domains: ['education', 'training']
        },
        priority: 0.9,
        confidence: 0.85
      }
    );

    this.specializations = [
      'Technical education',
      'Code review mentoring',
      'Best practices guidance',
      'Career development',
      'Skill assessment',
      'Learning path creation',
      'Documentation writing',
      'Team collaboration'
    ];
  }

  protected async onActivate(context: PersonaContext): Promise<void> {
    this.logger.info(`Mentor persona activated for education`);
  }

  async process(input: string): Promise<string> {
    const startTime = Date.now();
    
    const enhancedPrompt = `As a technical mentor, ${input}
    
    Provide educational guidance:
    - Clear explanations with examples
    - Step-by-step learning approach
    - Best practices and patterns
    - Common pitfalls to avoid
    - Additional learning resources
    - Practice exercises if appropriate
    - Encouragement and constructive feedback`;

    const result = await this.complete(enhancedPrompt);
    
    this.recordSuccess(Date.now() - startTime);
    return result;
  }
}

/**
 * SuperClaude Persona Manager
 */
export class SuperClaudeManager extends EventEmitter {
  private personas: Map<string, SuperClaudePersona>;
  private activePersona: SuperClaudePersona | null = null;
  private autoActivation: boolean = true;
  private performanceTracking: Map<string, PersonaMetrics> = new Map();

  constructor() {
    super();
    this.personas = new Map();
    this.initializePersonas();
  }

  /**
   * Initialize all personas
   */
  private initializePersonas(): void {
    const personaInstances = [
      new FrontendPersona(),
      new BackendPersona(),
      new ArchitectPersona(),
      new AnalyzerPersona(),
      new SecurityPersona(),
      new QAPersona(),
      new PerformancePersona(),
      new RefactorerPersona(),
      new MentorPersona()
    ];

    personaInstances.forEach(persona => {
      this.personas.set(persona.config.role, persona);
    });
  }

  /**
   * Auto-select best persona based on context
   */
  async autoSelectPersona(context: PersonaContext): Promise<SuperClaudePersona> {
    let bestPersona: SuperClaudePersona | null = null;
    let highestScore = 0;

    for (const persona of this.personas.values()) {
      const score = persona.calculateActivationScore(context);
      if (score > highestScore) {
        highestScore = score;
        bestPersona = persona;
      }
    }

    // If no good match, use architect as default
    if (!bestPersona || highestScore < 30) {
      bestPersona = this.personas.get('architect')!;
    }

    await this.activatePersona(bestPersona.config.role, context);
    return bestPersona;
  }

  /**
   * Manually activate a specific persona
   */
  async activatePersona(role: string, context?: PersonaContext): Promise<void> {
    const persona = this.personas.get(role);
    if (!persona) {
      throw new Error(`Persona ${role} not found`);
    }

    // Deactivate current persona
    if (this.activePersona && this.activePersona !== persona) {
      this.emit('persona-deactivated', this.activePersona.config.role);
    }

    // Activate new persona
    this.activePersona = persona;
    await persona.activate(context || {});
    
    this.emit('persona-activated', {
      role,
      context,
      metrics: persona.getPersonaMetrics()
    });
  }

  /**
   * Execute with auto persona selection
   */
  async process(input: string, context?: PersonaContext): Promise<string> {
    // Extract context from input if not provided
    if (!context) {
      context = this.extractContext(input);
    }

    // Auto-select or use active persona
    let persona = this.activePersona;
    if (this.autoActivation || !persona) {
      persona = await this.autoSelectPersona(context);
    }

    // Execute with selected persona
    return await persona.process(input);
  }

  /**
   * Extract context from input
   */
  private extractContext(input: string): PersonaContext {
    const context: PersonaContext = {
      keywords: [],
      complexity: 'medium'
    };

    // Extract keywords
    const keywords = [
      'frontend', 'backend', 'api', 'database', 'security', 'test',
      'performance', 'refactor', 'architecture', 'component', 'ui'
    ];
    
    context.keywords = keywords.filter(kw => 
      input.toLowerCase().includes(kw)
    );

    // Detect file types from input
    const fileTypeMatch = input.match(/\.(tsx?|jsx?|vue|py|go|java|css|scss|html|sql)/);
    if (fileTypeMatch) {
      context.fileType = fileTypeMatch[0];
    }

    // Detect task type
    if (input.includes('review') || input.includes('analyze')) {
      context.taskType = 'code-review';
    } else if (input.includes('test')) {
      context.taskType = 'testing';
    } else if (input.includes('design')) {
      context.taskType = 'system-design';
    }

    // Detect complexity
    if (input.length > 500 || input.includes('complex')) {
      context.complexity = 'complex';
    } else if (input.length < 100) {
      context.complexity = 'simple';
    }

    return context;
  }

  /**
   * Get all persona metrics
   */
  getAllMetrics(): Map<string, PersonaMetrics> {
    const metrics = new Map<string, PersonaMetrics>();
    
    for (const [role, persona] of this.personas) {
      metrics.set(role, persona.getPersonaMetrics());
    }
    
    return metrics;
  }

  /**
   * Toggle auto-activation
   */
  setAutoActivation(enabled: boolean): void {
    this.autoActivation = enabled;
    this.emit('auto-activation-changed', enabled);
  }

  /**
   * Get active persona
   */
  getActivePersona(): SuperClaudePersona | null {
    return this.activePersona;
  }

  /**
   * List all available personas
   */
  listPersonas(): Array<{ role: string; name: string; specializations: string[] }> {
    const list: Array<{ role: string; name: string; specializations: string[] }> = [];
    
    for (const persona of this.personas.values()) {
      list.push({
        role: persona.config.role,
        name: persona.config.name,
        specializations: (persona as any).specializations || []
      });
    }
    
    return list;
  }
}

// Export singleton instance
export const superClaudeManager = new SuperClaudeManager();