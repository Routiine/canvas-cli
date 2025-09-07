/**
 * Solutions Architect Agent
 * Designs technical architecture and system solutions
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import chalk from 'chalk';
import { AgentConfigurationSystem } from './config/agent-config.js';
import { PromptTemplateSystem } from './config/prompt-templates.js';
import { ModelManager } from '../models/model-manager.js';

// Architecture Decision Record Schema
export const ADRSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['proposed', 'accepted', 'rejected', 'deprecated', 'superseded']),
  date: z.string(),
  
  context: z.object({
    background: z.string(),
    problem: z.string(),
    constraints: z.array(z.string()),
    assumptions: z.array(z.string())
  }),
  
  decision: z.object({
    summary: z.string(),
    rationale: z.string(),
    consequences: z.object({
      positive: z.array(z.string()),
      negative: z.array(z.string()),
      neutral: z.array(z.string())
    })
  }),
  
  alternatives: z.array(z.object({
    option: z.string(),
    description: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    rejectionReason: z.string().optional()
  })),
  
  implementation: z.object({
    approach: z.string(),
    phases: z.array(z.string()),
    technologies: z.array(z.string()),
    dependencies: z.array(z.string())
  }),
  
  compliance: z.object({
    standards: z.array(z.string()),
    regulations: z.array(z.string()).optional(),
    bestPractices: z.array(z.string())
  }).optional()
});

export type ADR = z.infer<typeof ADRSchema>;

// System Architecture Schema
export const SystemArchitectureSchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(['monolithic', 'microservices', 'serverless', 'hybrid', 'event-driven']),
  
  overview: z.object({
    description: z.string(),
    goals: z.array(z.string()),
    principles: z.array(z.string()),
    constraints: z.array(z.string())
  }),
  
  components: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['service', 'database', 'queue', 'cache', 'gateway', 'storage', 'external']),
    description: z.string(),
    responsibilities: z.array(z.string()),
    technology: z.string(),
    interfaces: z.array(z.object({
      type: z.enum(['REST', 'GraphQL', 'gRPC', 'WebSocket', 'MessageQueue', 'Database']),
      protocol: z.string(),
      endpoint: z.string().optional(),
      dataFormat: z.string()
    })),
    dependencies: z.array(z.string()),
    scalability: z.object({
      strategy: z.enum(['horizontal', 'vertical', 'both', 'none']),
      minInstances: z.number(),
      maxInstances: z.number(),
      autoScaling: z.boolean()
    }).optional()
  })),
  
  dataFlow: z.array(z.object({
    name: z.string(),
    description: z.string(),
    steps: z.array(z.object({
      step: z.number(),
      component: z.string(),
      action: z.string(),
      data: z.string()
    }))
  })),
  
  infrastructure: z.object({
    deployment: z.enum(['cloud', 'on-premise', 'hybrid', 'edge']),
    cloudProvider: z.string().optional(),
    regions: z.array(z.string()),
    networking: z.object({
      vpc: z.string().optional(),
      subnets: z.array(z.string()).optional(),
      loadBalancers: z.array(z.string()).optional(),
      cdn: z.string().optional()
    }),
    compute: z.object({
      type: z.enum(['VM', 'Container', 'Serverless', 'Kubernetes']),
      specifications: z.record(z.any())
    }),
    storage: z.array(z.object({
      type: z.enum(['object', 'block', 'file', 'database']),
      provider: z.string(),
      capacity: z.string(),
      replication: z.string()
    }))
  }),
  
  security: z.object({
    authentication: z.string(),
    authorization: z.string(),
    encryption: z.object({
      inTransit: z.string(),
      atRest: z.string()
    }),
    compliance: z.array(z.string()),
    threats: z.array(z.object({
      threat: z.string(),
      mitigation: z.string()
    }))
  }),
  
  performance: z.object({
    sla: z.object({
      availability: z.string(),
      latency: z.string(),
      throughput: z.string()
    }),
    optimization: z.array(z.string()),
    monitoring: z.array(z.string()),
    caching: z.array(z.object({
      level: z.string(),
      technology: z.string(),
      ttl: z.string()
    }))
  }),
  
  reliability: z.object({
    failureHandling: z.array(z.string()),
    backupStrategy: z.string(),
    disasterRecovery: z.object({
      rpo: z.string(), // Recovery Point Objective
      rto: z.string(), // Recovery Time Objective
      strategy: z.string()
    }),
    healthChecks: z.array(z.string())
  }),
  
  cost: z.object({
    estimate: z.string(),
    breakdown: z.array(z.object({
      component: z.string(),
      cost: z.string(),
      billing: z.enum(['hourly', 'monthly', 'usage-based', 'fixed'])
    })),
    optimization: z.array(z.string())
  }).optional()
});

export type SystemArchitecture = z.infer<typeof SystemArchitectureSchema>;

// API Design Schema
export const APIDesignSchema = z.object({
  name: z.string(),
  version: z.string(),
  type: z.enum(['REST', 'GraphQL', 'gRPC', 'WebSocket']),
  
  endpoints: z.array(z.object({
    path: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).optional(),
    description: z.string(),
    authentication: z.boolean(),
    rateLimit: z.string().optional(),
    request: z.object({
      headers: z.record(z.string()).optional(),
      params: z.record(z.string()).optional(),
      body: z.any().optional()
    }),
    response: z.object({
      status: z.array(z.number()),
      headers: z.record(z.string()).optional(),
      body: z.any()
    }),
    errors: z.array(z.object({
      code: z.number(),
      message: z.string(),
      description: z.string()
    }))
  })),
  
  dataModels: z.array(z.object({
    name: z.string(),
    description: z.string(),
    fields: z.record(z.object({
      type: z.string(),
      required: z.boolean(),
      description: z.string()
    }))
  })),
  
  authentication: z.object({
    type: z.enum(['OAuth2', 'JWT', 'API Key', 'Basic', 'Custom']),
    description: z.string(),
    flows: z.array(z.string()).optional()
  }),
  
  versioning: z.object({
    strategy: z.enum(['URI', 'Header', 'Query Parameter']),
    deprecation: z.string()
  })
});

export type APIDesign = z.infer<typeof APIDesignSchema>;

/**
 * Solutions Architect Agent Implementation
 */
export class SolutionsArchitectAgent extends EventEmitter {
  private configSystem: AgentConfigurationSystem;
  private templateSystem: PromptTemplateSystem;
  private modelManager: ModelManager;
  private agentId = 'solutions-architect';
  
  constructor() {
    super();
    this.configSystem = new AgentConfigurationSystem();
    this.templateSystem = new PromptTemplateSystem();
    this.modelManager = new ModelManager();
  }
  
  async initialize(): Promise<void> {
    await this.configSystem.initialize();
    await this.templateSystem.initialize();
    this.emit('initialized', { agent: this.agentId });
  }
  
  /**
   * Design system architecture
   */
  async designArchitecture(
    requirements: string,
    constraints?: Record<string, any>
  ): Promise<SystemArchitecture> {
    console.log(chalk.cyan('🏗️ Designing system architecture...'));
    
    const config = this.configSystem.getConfiguration(this.agentId);
    if (!config) {
      throw new Error('Solutions Architect agent configuration not found');
    }
    
    const prompt = this.buildArchitecturePrompt(requirements, constraints);
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: config.behavior.temperature,
      maxTokens: config.behavior.maxTokens,
      format: 'json'
    });
    
    const architecture = this.parseArchitecture(response);
    
    this.emit('architecture-designed', { architecture, requirements });
    
    return architecture;
  }
  
  /**
   * Create Architecture Decision Record
   */
  async createADR(
    title: string,
    context: string,
    options: string[]
  ): Promise<ADR> {
    console.log(chalk.cyan('📝 Creating Architecture Decision Record...'));
    
    const prompt = this.templateSystem.renderTemplate('adr', {
      title,
      context,
      options
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 2000,
      format: 'json'
    });
    
    const adr = this.parseADR(response);
    
    this.emit('adr-created', { adr, title });
    
    return adr;
  }
  
  /**
   * Design API specification
   */
  async designAPI(
    serviceName: string,
    requirements: string,
    type: 'REST' | 'GraphQL' | 'gRPC' = 'REST'
  ): Promise<APIDesign> {
    console.log(chalk.cyan(`🔌 Designing ${type} API...`));
    
    const prompt = this.buildAPIPrompt(serviceName, requirements, type);
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 3000,
      format: 'json'
    });
    
    const apiDesign = this.parseAPIDesign(response);
    
    this.emit('api-designed', { apiDesign, serviceName, type });
    
    return apiDesign;
  }
  
  /**
   * Perform security assessment
   */
  async assessSecurity(
    architecture: SystemArchitecture
  ): Promise<any> {
    console.log(chalk.cyan('🔒 Performing security assessment...'));
    
    const prompt = this.templateSystem.renderTemplate('security-assessment', {
      architecture: JSON.stringify(architecture, null, 2)
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.5,
      maxTokens: 2500
    });
    
    const assessment = this.parseSecurityAssessment(response);
    
    this.emit('security-assessed', { assessment });
    
    return assessment;
  }
  
  /**
   * Optimize for performance
   */
  async optimizePerformance(
    architecture: SystemArchitecture,
    metrics: Record<string, any>
  ): Promise<any> {
    console.log(chalk.cyan('⚡ Optimizing performance...'));
    
    const prompt = this.templateSystem.renderTemplate('performance-optimization', {
      architecture: JSON.stringify(architecture, null, 2),
      metrics
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 2000
    });
    
    const optimizations = this.parseOptimizations(response);
    
    this.emit('performance-optimized', { optimizations });
    
    return optimizations;
  }
  
  /**
   * Design data architecture
   */
  async designDataArchitecture(
    requirements: string,
    dataVolume: string,
    accessPatterns: string[]
  ): Promise<any> {
    console.log(chalk.cyan('💾 Designing data architecture...'));
    
    const prompt = this.templateSystem.renderTemplate('data-architecture', {
      requirements,
      dataVolume,
      accessPatterns
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 2500
    });
    
    const dataArchitecture = this.parseDataArchitecture(response);
    
    this.emit('data-architecture-designed', { dataArchitecture });
    
    return dataArchitecture;
  }
  
  /**
   * Create deployment strategy
   */
  async createDeploymentStrategy(
    architecture: SystemArchitecture,
    environment: 'development' | 'staging' | 'production'
  ): Promise<any> {
    console.log(chalk.cyan('🚀 Creating deployment strategy...'));
    
    const prompt = this.templateSystem.renderTemplate('deployment-strategy', {
      architecture: JSON.stringify(architecture, null, 2),
      environment
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.6,
      maxTokens: 2000
    });
    
    const strategy = this.parseDeploymentStrategy(response);
    
    this.emit('deployment-strategy-created', { strategy, environment });
    
    return strategy;
  }
  
  /**
   * Evaluate technology choices
   */
  async evaluateTechnologies(
    requirements: string,
    candidates: string[]
  ): Promise<any> {
    console.log(chalk.cyan('🔍 Evaluating technology choices...'));
    
    const prompt = this.templateSystem.renderTemplate('technology-evaluation', {
      requirements,
      candidates
    });
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.7,
      maxTokens: 2500
    });
    
    const evaluation = this.parseTechnologyEvaluation(response);
    
    this.emit('technologies-evaluated', { evaluation });
    
    return evaluation;
  }
  
  /**
   * Build architecture prompt
   */
  private buildArchitecturePrompt(requirements: string, constraints?: Record<string, any>): string {
    const config = this.configSystem.getConfiguration(this.agentId);
    if (!config) {
      throw new Error('Solutions Architect configuration not found');
    }
    
    let prompt = config.prompts.system + '\n\n';
    prompt += 'Design a comprehensive system architecture for the following requirements:\n\n';
    prompt += `Requirements: ${requirements}\n\n`;
    
    if (constraints) {
      prompt += 'Constraints and Considerations:\n';
      for (const [key, value] of Object.entries(constraints)) {
        prompt += `- ${key}: ${JSON.stringify(value)}\n`;
      }
      prompt += '\n';
    }
    
    prompt += `The architecture should include:
1. System Overview (type, goals, principles)
2. Component Design (services, databases, queues, etc.)
3. Data Flow Patterns
4. Infrastructure Requirements (cloud/on-premise, compute, storage)
5. Security Architecture (authentication, authorization, encryption)
6. Performance Considerations (SLA, caching, optimization)
7. Reliability and Resilience (failure handling, DR strategy)
8. Cost Estimation (if applicable)

Follow cloud-native principles, microservices best practices, and ensure scalability.
Format the response as JSON matching the SystemArchitecture schema.`;
    
    return prompt;
  }
  
  /**
   * Build API design prompt
   */
  private buildAPIPrompt(serviceName: string, requirements: string, type: string): string {
    return `Design a ${type} API for the ${serviceName} service with the following requirements:

${requirements}

The API design should include:
1. Endpoint definitions with paths, methods, and descriptions
2. Request/Response schemas
3. Data models
4. Authentication and authorization approach
5. Error handling patterns
6. Rate limiting strategy
7. Versioning strategy

Follow ${type} best practices and RESTful principles where applicable.
Format the response as JSON matching the APIDesign schema.`;
  }
  
  /**
   * Parse architecture from response
   */
  private parseArchitecture(response: string): SystemArchitecture {
    try {
      const parsed = JSON.parse(response);
      return SystemArchitectureSchema.parse(parsed);
    } catch (error) {
      return this.createDefaultArchitecture(response);
    }
  }
  
  /**
   * Create default architecture structure
   */
  private createDefaultArchitecture(content: string): SystemArchitecture {
    return {
      name: 'System Architecture',
      version: '1.0.0',
      type: 'microservices',
      overview: {
        description: content,
        goals: [],
        principles: [],
        constraints: []
      },
      components: [],
      dataFlow: [],
      infrastructure: {
        deployment: 'cloud',
        regions: [],
        networking: {},
        compute: {
          type: 'Container',
          specifications: {}
        },
        storage: []
      },
      security: {
        authentication: 'OAuth2',
        authorization: 'RBAC',
        encryption: {
          inTransit: 'TLS 1.3',
          atRest: 'AES-256'
        },
        compliance: [],
        threats: []
      },
      performance: {
        sla: {
          availability: '99.9%',
          latency: '<100ms',
          throughput: '1000 req/s'
        },
        optimization: [],
        monitoring: [],
        caching: []
      },
      reliability: {
        failureHandling: [],
        backupStrategy: 'Daily snapshots',
        disasterRecovery: {
          rpo: '1 hour',
          rto: '4 hours',
          strategy: 'Multi-region failover'
        },
        healthChecks: []
      }
    };
  }
  
  /**
   * Parse ADR from response
   */
  private parseADR(response: string): ADR {
    try {
      const parsed = JSON.parse(response);
      return ADRSchema.parse(parsed);
    } catch {
      return {
        id: `adr-${Date.now()}`,
        title: 'Architecture Decision',
        status: 'proposed',
        date: new Date().toISOString(),
        context: {
          background: response,
          problem: '',
          constraints: [],
          assumptions: []
        },
        decision: {
          summary: '',
          rationale: '',
          consequences: {
            positive: [],
            negative: [],
            neutral: []
          }
        },
        alternatives: [],
        implementation: {
          approach: '',
          phases: [],
          technologies: [],
          dependencies: []
        }
      };
    }
  }
  
  /**
   * Parse API design from response
   */
  private parseAPIDesign(response: string): APIDesign {
    try {
      const parsed = JSON.parse(response);
      return APIDesignSchema.parse(parsed);
    } catch {
      return {
        name: 'API',
        version: '1.0.0',
        type: 'REST',
        endpoints: [],
        dataModels: [],
        authentication: {
          type: 'JWT',
          description: 'JWT-based authentication'
        },
        versioning: {
          strategy: 'URI',
          deprecation: '6 months notice'
        }
      };
    }
  }
  
  /**
   * Parse security assessment
   */
  private parseSecurityAssessment(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        summary: response,
        vulnerabilities: [],
        recommendations: [],
        compliance: []
      };
    }
  }
  
  /**
   * Parse performance optimizations
   */
  private parseOptimizations(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        summary: response,
        optimizations: [],
        expectedImpact: []
      };
    }
  }
  
  /**
   * Parse data architecture
   */
  private parseDataArchitecture(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        summary: response,
        databases: [],
        schemas: [],
        migrations: []
      };
    }
  }
  
  /**
   * Parse deployment strategy
   */
  private parseDeploymentStrategy(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        summary: response,
        steps: [],
        rollback: []
      };
    }
  }
  
  /**
   * Parse technology evaluation
   */
  private parseTechnologyEvaluation(response: string): any {
    try {
      return JSON.parse(response);
    } catch {
      return {
        summary: response,
        recommendations: [],
        comparison: []
      };
    }
  }
  
  /**
   * Export architecture to Terraform
   */
  exportToTerraform(architecture: SystemArchitecture): string {
    let terraform = `# Terraform Configuration for ${architecture.name}\n\n`;
    
    terraform += `# Provider Configuration\n`;
    terraform += `provider "aws" {\n`;
    terraform += `  region = "${architecture.infrastructure.regions[0] || 'us-east-1'}"\n`;
    terraform += `}\n\n`;
    
    // Add compute resources
    architecture.components.forEach(component => {
      terraform += `# ${component.name}\n`;
      terraform += `resource "aws_ecs_service" "${component.id}" {\n`;
      terraform += `  name = "${component.name}"\n`;
      terraform += `  # Add configuration based on component specs\n`;
      terraform += `}\n\n`;
    });
    
    return terraform;
  }
  
  /**
   * Export ADR to markdown
   */
  exportADRToMarkdown(adr: ADR): string {
    let markdown = `# ${adr.title}\n\n`;
    markdown += `**ID:** ${adr.id}\n`;
    markdown += `**Status:** ${adr.status}\n`;
    markdown += `**Date:** ${adr.date}\n\n`;
    
    markdown += `## Context\n\n`;
    markdown += `### Background\n${adr.context.background}\n\n`;
    markdown += `### Problem Statement\n${adr.context.problem}\n\n`;
    
    if (adr.context.constraints.length > 0) {
      markdown += `### Constraints\n`;
      adr.context.constraints.forEach(constraint => {
        markdown += `- ${constraint}\n`;
      });
      markdown += '\n';
    }
    
    markdown += `## Decision\n\n`;
    markdown += `${adr.decision.summary}\n\n`;
    markdown += `### Rationale\n${adr.decision.rationale}\n\n`;
    
    markdown += `### Consequences\n\n`;
    if (adr.decision.consequences.positive.length > 0) {
      markdown += `#### Positive\n`;
      adr.decision.consequences.positive.forEach(consequence => {
        markdown += `- ${consequence}\n`;
      });
      markdown += '\n';
    }
    
    if (adr.alternatives.length > 0) {
      markdown += `## Alternatives Considered\n\n`;
      adr.alternatives.forEach(alt => {
        markdown += `### ${alt.option}\n`;
        markdown += `${alt.description}\n\n`;
        if (alt.rejectionReason) {
          markdown += `**Rejected because:** ${alt.rejectionReason}\n\n`;
        }
      });
    }
    
    return markdown;
  }
  
  /**
   * Generate OpenAPI specification
   */
  generateOpenAPISpec(api: APIDesign): any {
    return {
      openapi: '3.0.0',
      info: {
        title: api.name,
        version: api.version
      },
      paths: api.endpoints.reduce((paths, endpoint) => {
        if (!paths[endpoint.path]) {
          paths[endpoint.path] = {};
        }
        if (endpoint.method) {
          paths[endpoint.path][endpoint.method.toLowerCase()] = {
            description: endpoint.description,
            responses: endpoint.response.status.reduce((responses, status) => {
              responses[status] = {
                description: status === 200 ? 'Success' : 'Error'
              };
              return responses;
            }, {} as any)
          };
        }
        return paths;
      }, {} as any)
    };
  }
}

// Export singleton instance
export const solutionsArchitectAgent = new SolutionsArchitectAgent();