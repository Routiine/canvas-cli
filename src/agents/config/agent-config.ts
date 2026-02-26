/**
 * Agent Configuration System
 * Manages agent behaviors, prompts, and templates
 */

import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

// Schema for agent configuration
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  enabled: z.boolean().default(true),
  
  // Core configuration
  role: z.object({
    title: z.string(),
    department: z.string(),
    level: z.enum(['junior', 'senior', 'principal', 'executive']),
    expertise: z.array(z.string())
  }),
  
  // Behavioral configuration
  behavior: z.object({
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().default(4000),
    topP: z.number().min(0).max(1).default(0.9),
    frequencyPenalty: z.number().min(-2).max(2).default(0),
    presencePenalty: z.number().min(-2).max(2).default(0),
    responseStyle: z.enum(['concise', 'detailed', 'technical', 'business']).default('detailed'),
    personality: z.object({
      traits: z.array(z.string()),
      communicationStyle: z.string(),
      decisionMaking: z.string()
    })
  }),
  
  // Prompt templates
  prompts: z.object({
    system: z.string(),
    taskPrefix: z.string().optional(),
    taskSuffix: z.string().optional(),
    examples: z.array(z.object({
      input: z.string(),
      output: z.string()
    })).optional()
  }),
  
  // Capabilities and constraints
  capabilities: z.object({
    actions: z.array(z.string()),
    tools: z.array(z.string()),
    outputFormats: z.array(z.string()),
    maxIterations: z.number().default(3)
  }),
  
  // Integration settings
  integrations: z.object({
    requiresApproval: z.boolean().default(false),
    canCallOtherAgents: z.boolean().default(true),
    allowedAgents: z.array(z.string()).optional(),
    webhooks: z.array(z.string()).optional()
  }),
  
  // Metrics and tracking
  metrics: z.object({
    trackUsage: z.boolean().default(true),
    trackPerformance: z.boolean().default(true),
    trackErrors: z.boolean().default(true),
    reportingInterval: z.number().default(3600000) // 1 hour in ms
  })
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Agent Configuration Manager
 */
export class AgentConfigurationSystem {
  private configs: Map<string, AgentConfig> = new Map();
  private configDir: string;
  private templateDir: string;

  constructor(baseDir?: string) {
    const base = baseDir || path.join(process.env.HOME || process.env.USERPROFILE || '', '.canvas-cli');
    this.configDir = path.join(base, 'agents', 'configs');
    this.templateDir = path.join(base, 'agents', 'templates');
  }

  /**
   * Initialize the configuration system
   */
  async initialize(): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(this.configDir, { recursive: true });
    await fs.mkdir(this.templateDir, { recursive: true });
    
    // Load existing configurations
    await this.loadConfigurations();
    
    // Load default configurations if none exist
    if (this.configs.size === 0) {
      await this.loadDefaultConfigurations();
    }
  }

  /**
   * Load all agent configurations
   */
  private async loadConfigurations(): Promise<void> {
    try {
      const files = await fs.readdir(this.configDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filepath = path.join(this.configDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const config = AgentConfigSchema.parse(JSON.parse(content));
          this.configs.set(config.id, config);
        }
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
    }
  }

  /**
   * Load default agent configurations
   */
  private async loadDefaultConfigurations(): Promise<void> {
    const defaults = this.getDefaultConfigurations();
    
    for (const config of defaults) {
      await this.saveConfiguration(config);
      this.configs.set(config.id, config);
    }
  }

  /**
   * Get configuration for a specific agent
   */
  getConfiguration(agentId: string): AgentConfig | undefined {
    return this.configs.get(agentId);
  }

  /**
   * Update agent configuration
   */
  async updateConfiguration(agentId: string, updates: Partial<AgentConfig>): Promise<void> {
    const existing = this.configs.get(agentId);
    if (!existing) {
      throw new Error(`Agent configuration not found: ${agentId}`);
    }
    
    const updated = { ...existing, ...updates };
    const validated = AgentConfigSchema.parse(updated);
    
    await this.saveConfiguration(validated);
    this.configs.set(agentId, validated);
  }

  /**
   * Save configuration to disk
   */
  private async saveConfiguration(config: AgentConfig): Promise<void> {
    const filepath = path.join(this.configDir, `${config.id}.json`);
    await fs.writeFile(filepath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Create a new agent configuration
   */
  async createConfiguration(config: AgentConfig): Promise<void> {
    const validated = AgentConfigSchema.parse(config);
    await this.saveConfiguration(validated);
    this.configs.set(validated.id, validated);
  }

  /**
   * Delete agent configuration
   */
  async deleteConfiguration(agentId: string): Promise<void> {
    const filepath = path.join(this.configDir, `${agentId}.json`);
    await fs.unlink(filepath);
    this.configs.delete(agentId);
  }

  /**
   * List all agent configurations
   */
  listConfigurations(): AgentConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Export configuration
   */
  async exportConfiguration(agentId: string, outputPath: string): Promise<void> {
    const config = this.configs.get(agentId);
    if (!config) {
      throw new Error(`Agent configuration not found: ${agentId}`);
    }
    
    await fs.writeFile(outputPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Import configuration
   */
  async importConfiguration(inputPath: string): Promise<void> {
    const content = await fs.readFile(inputPath, 'utf-8');
    const config = AgentConfigSchema.parse(JSON.parse(content));
    await this.createConfiguration(config);
  }

  /**
   * Get default configurations
   */
  private getDefaultConfigurations(): AgentConfig[] {
    return [
      // Business Analyst Configuration
      {
        id: 'business-analyst',
        name: 'Business Analyst Agent',
        description: 'Analyzes business requirements and creates detailed specifications',
        version: '1.0.0',
        enabled: true,
        role: {
          title: 'Senior Business Analyst',
          department: 'Business Analysis',
          level: 'senior',
          expertise: [
            'Requirements Engineering',
            'Process Mapping',
            'Stakeholder Management',
            'Use Case Analysis',
            'Business Process Modeling'
          ]
        },
        behavior: {
          temperature: 0.7,
          maxTokens: 4000,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          responseStyle: 'detailed',
          personality: {
            traits: ['analytical', 'thorough', 'methodical', 'detail-oriented'],
            communicationStyle: 'Clear, structured, and professional with emphasis on completeness',
            decisionMaking: 'Data-driven with consideration for business impact and feasibility'
          }
        },
        prompts: {
          system: `You are a Senior Business Analyst with extensive experience in requirements engineering and business process analysis.
Your role is to:
1. Analyze and document business requirements with precision
2. Create comprehensive functional and non-functional specifications
3. Identify stakeholders and their needs
4. Map business processes and workflows
5. Define acceptance criteria and success metrics
6. Identify risks, assumptions, and dependencies
7. Ensure requirements are SMART (Specific, Measurable, Achievable, Relevant, Time-bound)

Always structure your analysis using industry-standard frameworks and methodologies.`,
          taskPrefix: 'As a Senior Business Analyst, please analyze the following:',
          taskSuffix: 'Provide a comprehensive analysis with clear recommendations and next steps.'
        },
        capabilities: {
          actions: [
            'requirements_analysis',
            'process_mapping',
            'gap_analysis',
            'stakeholder_analysis',
            'risk_assessment',
            'specification_writing',
            'use_case_creation'
          ],
          tools: ['documentation', 'diagramming', 'requirements_tracking'],
          outputFormats: ['markdown', 'json', 'html', 'pdf'],
          maxIterations: 3
        },
        integrations: {
          requiresApproval: false,
          canCallOtherAgents: true,
          allowedAgents: ['product-manager', 'solutions-architect', 'qa-engineer']
        },
        metrics: {
          trackUsage: true,
          trackPerformance: true,
          trackErrors: true,
          reportingInterval: 3600000
        }
      },
      
      // Product Manager Configuration
      {
        id: 'product-manager',
        name: 'Product Manager Agent',
        description: 'Creates product requirements and manages product strategy',
        version: '1.0.0',
        enabled: true,
        role: {
          title: 'Senior Product Manager',
          department: 'Product Management',
          level: 'senior',
          expertise: [
            'Product Strategy',
            'Roadmap Planning',
            'User Research',
            'Market Analysis',
            'Agile Methodologies',
            'Stakeholder Management'
          ]
        },
        behavior: {
          temperature: 0.8,
          maxTokens: 4000,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          responseStyle: 'business',
          personality: {
            traits: ['strategic', 'customer-focused', 'data-driven', 'innovative'],
            communicationStyle: 'Persuasive and vision-oriented with focus on value delivery',
            decisionMaking: 'Balanced between user needs, business goals, and technical feasibility'
          }
        },
        prompts: {
          system: `You are a Senior Product Manager with deep expertise in product strategy and development.
Your role is to:
1. Define product vision and strategy aligned with business objectives
2. Create detailed Product Requirements Documents (PRDs)
3. Prioritize features based on value, effort, and strategic fit
4. Define success metrics and KPIs
5. Conduct market and competitive analysis
6. Create user stories and acceptance criteria
7. Build and maintain product roadmaps
8. Ensure stakeholder alignment and buy-in

Focus on delivering customer value while balancing business constraints and technical feasibility.`,
          taskPrefix: 'As a Senior Product Manager, I need to:',
          taskSuffix: 'Ensure the solution maximizes customer value and business impact.'
        },
        capabilities: {
          actions: [
            'prd_creation',
            'roadmap_planning',
            'feature_prioritization',
            'user_story_writing',
            'market_analysis',
            'metric_definition',
            'stakeholder_communication'
          ],
          tools: ['roadmapping', 'analytics', 'user_research', 'prioritization_frameworks'],
          outputFormats: ['markdown', 'json', 'presentation', 'spreadsheet'],
          maxIterations: 3
        },
        integrations: {
          requiresApproval: false,
          canCallOtherAgents: true,
          allowedAgents: ['business-analyst', 'solutions-architect', 'developer', 'qa-engineer']
        },
        metrics: {
          trackUsage: true,
          trackPerformance: true,
          trackErrors: true,
          reportingInterval: 3600000
        }
      },
      
      // Solutions Architect Configuration
      {
        id: 'solutions-architect',
        name: 'Solutions Architect Agent',
        description: 'Designs technical architecture and system solutions',
        version: '1.0.0',
        enabled: true,
        role: {
          title: 'Principal Solutions Architect',
          department: 'Architecture',
          level: 'principal',
          expertise: [
            'System Design',
            'Cloud Architecture',
            'Microservices',
            'Security Architecture',
            'Performance Optimization',
            'Integration Patterns',
            'DevOps'
          ]
        },
        behavior: {
          temperature: 0.6,
          maxTokens: 5000,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          responseStyle: 'technical',
          personality: {
            traits: ['systematic', 'innovative', 'pragmatic', 'forward-thinking'],
            communicationStyle: 'Technical yet accessible, with focus on clarity and best practices',
            decisionMaking: 'Architecture decisions based on scalability, maintainability, and business needs'
          }
        },
        prompts: {
          system: `You are a Principal Solutions Architect with extensive experience in designing scalable, secure, and maintainable systems.
Your role is to:
1. Design robust technical architectures that meet business requirements
2. Define system components, interfaces, and interactions
3. Select appropriate technologies, frameworks, and patterns
4. Create Architecture Decision Records (ADRs) with clear rationale
5. Ensure scalability, security, and performance requirements are met
6. Design for fault tolerance and disaster recovery
7. Define integration patterns and API specifications
8. Consider cloud-native and microservices architectures where appropriate
9. Document deployment and infrastructure requirements

Always follow industry best practices and architectural principles (SOLID, DRY, KISS, etc.).`,
          taskPrefix: 'As a Principal Solutions Architect, I will design:',
          taskSuffix: 'The solution will be scalable, secure, and aligned with enterprise architecture standards.'
        },
        capabilities: {
          actions: [
            'system_design',
            'architecture_documentation',
            'technology_selection',
            'api_design',
            'security_design',
            'performance_analysis',
            'infrastructure_planning',
            'adr_creation'
          ],
          tools: ['diagramming', 'modeling', 'cloud_platforms', 'architecture_frameworks'],
          outputFormats: ['markdown', 'diagrams', 'json', 'yaml', 'terraform'],
          maxIterations: 5
        },
        integrations: {
          requiresApproval: true,
          canCallOtherAgents: true,
          allowedAgents: ['business-analyst', 'product-manager', 'developer', 'devops-engineer']
        },
        metrics: {
          trackUsage: true,
          trackPerformance: true,
          trackErrors: true,
          reportingInterval: 3600000
        }
      }
    ];
  }

  /**
   * Generate prompt from template
   */
  generatePrompt(agentId: string, task: string, context?: Record<string, any>): string {
    const config = this.configs.get(agentId);
    if (!config) {
      throw new Error(`Agent configuration not found: ${agentId}`);
    }
    
    let prompt = config.prompts.system + '\n\n';
    
    if (config.prompts.taskPrefix) {
      prompt += config.prompts.taskPrefix + '\n';
    }
    
    prompt += task;
    
    if (context) {
      prompt += '\n\nContext:\n';
      for (const [key, value] of Object.entries(context)) {
        prompt += `- ${key}: ${JSON.stringify(value)}\n`;
      }
    }
    
    if (config.prompts.taskSuffix) {
      prompt += '\n' + config.prompts.taskSuffix;
    }
    
    if (config.prompts.examples && config.prompts.examples.length > 0) {
      prompt += '\n\nExamples:\n';
      for (const example of config.prompts.examples) {
        prompt += `Input: ${example.input}\nOutput: ${example.output}\n\n`;
      }
    }
    
    return prompt;
  }

  /**
   * Validate agent performance against configuration
   */
  validatePerformance(agentId: string, metrics: Record<string, any>): boolean {
    const config = this.configs.get(agentId);
    if (!config) {
      return false;
    }
    
    // Add performance validation logic here
    return true;
  }
}

// Lazy singleton getter — avoids ~200ms+ startup cost when unused
let _agentConfigSystem: AgentConfigurationSystem | null = null;
export function getAgentConfigSystem(): AgentConfigurationSystem {
  if (!_agentConfigSystem) _agentConfigSystem = new AgentConfigurationSystem();
  return _agentConfigSystem;
}