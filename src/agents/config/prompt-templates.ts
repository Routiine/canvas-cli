/**
 * Agent Prompt Template System
 * Manages reusable prompt templates for different agent types and tasks
 */

import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import * as nunjucks from 'nunjucks';

// Schema for prompt templates
export const PromptTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['analysis', 'planning', 'implementation', 'testing', 'documentation', 'review']),
  agentTypes: z.array(z.string()),
  version: z.string().default('1.0.0'),
  
  // Template configuration
  template: z.object({
    content: z.string(),
    variables: z.array(z.object({
      name: z.string(),
      type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
      required: z.boolean(),
      default: z.any().optional(),
      description: z.string()
    })),
    sections: z.array(z.object({
      name: z.string(),
      required: z.boolean(),
      template: z.string()
    })).optional()
  }),
  
  // Output configuration
  output: z.object({
    format: z.enum(['text', 'markdown', 'json', 'xml', 'yaml']),
    structure: z.any().optional(),
    validation: z.object({
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      requiredFields: z.array(z.string()).optional()
    }).optional()
  }),
  
  // Metadata
  metadata: z.object({
    author: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tags: z.array(z.string()).optional(),
    examples: z.array(z.object({
      input: z.record(z.any()),
      output: z.string()
    })).optional()
  })
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

/**
 * Prompt Template Manager
 */
export class PromptTemplateSystem {
  private templates: Map<string, PromptTemplate> = new Map();
  private templateDir: string;
  private nunjucksEnv: nunjucks.Environment;

  constructor(baseDir?: string) {
    const base = baseDir || path.join(process.env.HOME || process.env.USERPROFILE || '', '.canvas-cli');
    this.templateDir = path.join(base, 'agents', 'prompt-templates');
    
    // Configure Nunjucks for template rendering
    this.nunjucksEnv = nunjucks.configure({ autoescape: false });
    this.registerCustomFilters();
  }

  /**
   * Register custom Nunjucks filters
   */
  private registerCustomFilters(): void {
    // Format list items
    this.nunjucksEnv.addFilter('bulletList', (items: string[]) => {
      return items.map(item => `• ${item}`).join('\n');
    });
    
    // Format numbered list
    this.nunjucksEnv.addFilter('numberedList', (items: string[]) => {
      return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
    });
    
    // Format as code block
    this.nunjucksEnv.addFilter('codeBlock', (code: string, language: string = '') => {
      return `\`\`\`${language}\n${code}\n\`\`\``;
    });
    
    // Format as JSON
    this.nunjucksEnv.addFilter('json', (obj: any, indent: number = 2) => {
      return JSON.stringify(obj, null, indent);
    });
    
    // Title case
    this.nunjucksEnv.addFilter('titleCase', (str: string) => {
      return str.replace(/\w\S*/g, txt => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );
    });
  }

  /**
   * Initialize the template system
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.templateDir, { recursive: true });
    await this.loadTemplates();
    
    if (this.templates.size === 0) {
      await this.loadDefaultTemplates();
    }
  }

  /**
   * Load all templates
   */
  private async loadTemplates(): Promise<void> {
    try {
      const files = await fs.readdir(this.templateDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filepath = path.join(this.templateDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          const template = PromptTemplateSchema.parse(JSON.parse(content));
          this.templates.set(template.id, template);
        }
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }

  /**
   * Load default templates
   */
  private async loadDefaultTemplates(): Promise<void> {
    const defaults = this.getDefaultTemplates();
    
    for (const template of defaults) {
      await this.saveTemplate(template);
      this.templates.set(template.id, template);
    }
  }

  /**
   * Get a template by ID
   */
  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Render a template with variables
   */
  renderTemplate(templateId: string, variables: Record<string, any>): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    // Validate required variables
    for (const variable of template.template.variables) {
      if (variable.required && !(variable.name in variables)) {
        if (variable.default !== undefined) {
          variables[variable.name] = variable.default;
        } else {
          throw new Error(`Required variable missing: ${variable.name}`);
        }
      }
    }
    
    // Render the template
    let rendered = this.nunjucksEnv.renderString(template.template.content, variables);
    
    // Render sections if present
    if (template.template.sections) {
      for (const section of template.template.sections) {
        if (section.required || variables[section.name]) {
          const sectionContent = this.nunjucksEnv.renderString(section.template, variables);
          rendered = rendered.replace(`{{${section.name}}}`, sectionContent);
        }
      }
    }
    
    return rendered;
  }

  /**
   * Create a new template
   */
  async createTemplate(template: PromptTemplate): Promise<void> {
    const validated = PromptTemplateSchema.parse(template);
    await this.saveTemplate(validated);
    this.templates.set(validated.id, validated);
  }

  /**
   * Update an existing template
   */
  async updateTemplate(templateId: string, updates: Partial<PromptTemplate>): Promise<void> {
    const existing = this.templates.get(templateId);
    if (!existing) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    const updated = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        updatedAt: new Date().toISOString()
      }
    };
    
    const validated = PromptTemplateSchema.parse(updated);
    await this.saveTemplate(validated);
    this.templates.set(templateId, validated);
  }

  /**
   * Save template to disk
   */
  private async saveTemplate(template: PromptTemplate): Promise<void> {
    const filepath = path.join(this.templateDir, `${template.id}.json`);
    await fs.writeFile(filepath, JSON.stringify(template, null, 2), 'utf-8');
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const filepath = path.join(this.templateDir, `${templateId}.json`);
    await fs.unlink(filepath);
    this.templates.delete(templateId);
  }

  /**
   * List templates by category or agent type
   */
  listTemplates(filter?: { category?: string; agentType?: string }): PromptTemplate[] {
    let templates = Array.from(this.templates.values());
    
    if (filter?.category) {
      templates = templates.filter(t => t.category === filter.category);
    }
    
    if (filter?.agentType) {
      templates = templates.filter(t => t.agentTypes.includes(filter.agentType));
    }
    
    return templates;
  }

  /**
   * Get default templates
   */
  private getDefaultTemplates(): PromptTemplate[] {
    const now = new Date().toISOString();
    
    return [
      // Requirements Analysis Template
      {
        id: 'requirements-analysis',
        name: 'Requirements Analysis Template',
        description: 'Comprehensive template for analyzing and documenting requirements',
        category: 'analysis' as const,
        agentTypes: ['business-analyst'],
        version: '1.0.0',
        template: {
          content: `# Requirements Analysis for {{ projectName }}

## Executive Summary
{{ executiveSummary }}

## Business Context
{{ businessContext }}

## Stakeholder Analysis
{% for stakeholder in stakeholders %}
### {{ stakeholder.name }}
- **Role**: {{ stakeholder.role }}
- **Interest**: {{ stakeholder.interest }}
- **Influence**: {{ stakeholder.influence }}
- **Requirements**: {{ stakeholder.requirements | bulletList }}
{% endfor %}

## Functional Requirements
{% for requirement in functionalRequirements %}
### FR-{{ loop.index }}: {{ requirement.title }}
**Description**: {{ requirement.description }}
**Priority**: {{ requirement.priority }}
**Acceptance Criteria**:
{{ requirement.acceptanceCriteria | bulletList }}
{% endfor %}

## Non-Functional Requirements
{% for nfr in nonFunctionalRequirements %}
### NFR-{{ loop.index }}: {{ nfr.category | titleCase }}
{{ nfr.requirements | bulletList }}
{% endfor %}

## Use Cases
{% for useCase in useCases %}
### UC-{{ loop.index }}: {{ useCase.name }}
**Actor**: {{ useCase.actor }}
**Preconditions**: {{ useCase.preconditions | bulletList }}
**Flow**:
{{ useCase.steps | numberedList }}
**Postconditions**: {{ useCase.postconditions | bulletList }}
{% endfor %}

## Risks and Assumptions
### Risks
{{ risks | bulletList }}

### Assumptions
{{ assumptions | bulletList }}

## Dependencies
{{ dependencies | bulletList }}

## Success Criteria
{{ successCriteria | bulletList }}

## Next Steps
{{ nextSteps | numberedList }}`,
          variables: [
            { name: 'projectName', type: 'string', required: true, description: 'Name of the project' },
            { name: 'executiveSummary', type: 'string', required: true, description: 'Brief summary of the analysis' },
            { name: 'businessContext', type: 'string', required: true, description: 'Business context and background' },
            { name: 'stakeholders', type: 'array', required: true, description: 'List of stakeholders' },
            { name: 'functionalRequirements', type: 'array', required: true, description: 'Functional requirements' },
            { name: 'nonFunctionalRequirements', type: 'array', required: true, description: 'Non-functional requirements' },
            { name: 'useCases', type: 'array', required: false, description: 'Use cases' },
            { name: 'risks', type: 'array', required: true, description: 'Identified risks' },
            { name: 'assumptions', type: 'array', required: true, description: 'Assumptions made' },
            { name: 'dependencies', type: 'array', required: true, description: 'Dependencies' },
            { name: 'successCriteria', type: 'array', required: true, description: 'Success criteria' },
            { name: 'nextSteps', type: 'array', required: true, description: 'Recommended next steps' }
          ]
        },
        output: {
          format: 'markdown',
          validation: {
            minLength: 500,
            requiredFields: ['projectName', 'functionalRequirements', 'stakeholders']
          }
        },
        metadata: {
          author: 'Canvas CLI',
          createdAt: now,
          updatedAt: now,
          tags: ['requirements', 'analysis', 'business']
        }
      },
      
      // Product Requirements Document Template
      {
        id: 'prd-template',
        name: 'Product Requirements Document Template',
        description: 'Template for creating comprehensive PRDs',
        category: 'planning' as const,
        agentTypes: ['product-manager'],
        version: '1.0.0',
        template: {
          content: `# Product Requirements Document: {{ productName }}

## Product Overview
{{ productOverview }}

## Vision & Strategy
### Vision Statement
{{ visionStatement }}

### Strategic Objectives
{{ strategicObjectives | numberedList }}

## Target Audience
{% for segment in targetSegments %}
### {{ segment.name }}
- **Demographics**: {{ segment.demographics }}
- **Needs**: {{ segment.needs | bulletList }}
- **Pain Points**: {{ segment.painPoints | bulletList }}
{% endfor %}

## User Personas
{% for persona in personas %}
### {{ persona.name }}
**Role**: {{ persona.role }}
**Goals**: {{ persona.goals | bulletList }}
**Frustrations**: {{ persona.frustrations | bulletList }}
**Scenario**: {{ persona.scenario }}
{% endfor %}

## Features & Requirements
{% for feature in features %}
### {{ feature.name }}
**Description**: {{ feature.description }}
**User Story**: As a {{ feature.userType }}, I want to {{ feature.action }} so that {{ feature.benefit }}
**Priority**: {{ feature.priority }}
**Acceptance Criteria**:
{{ feature.acceptanceCriteria | numberedList }}
**Technical Requirements**:
{{ feature.technicalRequirements | bulletList }}
{% endfor %}

## Success Metrics
{% for metric in metrics %}
- **{{ metric.name }}**: {{ metric.description }}
  - Target: {{ metric.target }}
  - Measurement: {{ metric.measurement }}
{% endfor %}

## MVP Scope
### In Scope
{{ mvpInScope | bulletList }}

### Out of Scope
{{ mvpOutOfScope | bulletList }}

## Timeline & Milestones
{% for milestone in milestones %}
### {{ milestone.name }} ({{ milestone.date }})
{{ milestone.deliverables | bulletList }}
{% endfor %}

## Risks & Mitigation
{% for risk in risks %}
- **{{ risk.name }}**: {{ risk.description }}
  - Mitigation: {{ risk.mitigation }}
{% endfor %}

## Open Questions
{{ openQuestions | numberedList }}`,
          variables: [
            { name: 'productName', type: 'string', required: true, description: 'Product name' },
            { name: 'productOverview', type: 'string', required: true, description: 'Product overview' },
            { name: 'visionStatement', type: 'string', required: true, description: 'Vision statement' },
            { name: 'strategicObjectives', type: 'array', required: true, description: 'Strategic objectives' },
            { name: 'targetSegments', type: 'array', required: true, description: 'Target audience segments' },
            { name: 'personas', type: 'array', required: true, description: 'User personas' },
            { name: 'features', type: 'array', required: true, description: 'Product features' },
            { name: 'metrics', type: 'array', required: true, description: 'Success metrics' },
            { name: 'mvpInScope', type: 'array', required: true, description: 'MVP scope items' },
            { name: 'mvpOutOfScope', type: 'array', required: true, description: 'Out of scope items' },
            { name: 'milestones', type: 'array', required: true, description: 'Timeline milestones' },
            { name: 'risks', type: 'array', required: true, description: 'Risks and mitigation' },
            { name: 'openQuestions', type: 'array', required: false, description: 'Open questions' }
          ]
        },
        output: {
          format: 'markdown',
          validation: {
            minLength: 1000,
            requiredFields: ['productName', 'features', 'metrics']
          }
        },
        metadata: {
          author: 'Canvas CLI',
          createdAt: now,
          updatedAt: now,
          tags: ['product', 'requirements', 'prd']
        }
      },
      
      // Architecture Design Template
      {
        id: 'architecture-design',
        name: 'Architecture Design Document Template',
        description: 'Template for system architecture documentation',
        category: 'planning' as const,
        agentTypes: ['solutions-architect'],
        version: '1.0.0',
        template: {
          content: `# Architecture Design Document: {{ systemName }}

## Executive Summary
{{ executiveSummary }}

## System Overview
{{ systemOverview }}

## Architecture Principles
{{ principles | numberedList }}

## System Architecture
### High-Level Architecture
{{ highLevelDescription }}

### Component Architecture
{% for component in components %}
#### {{ component.name }}
- **Purpose**: {{ component.purpose }}
- **Technology**: {{ component.technology }}
- **Responsibilities**: {{ component.responsibilities | bulletList }}
- **Interfaces**: {{ component.interfaces | bulletList }}
{% endfor %}

## Data Architecture
### Data Model
{{ dataModelDescription }}

### Data Flow
{% for flow in dataFlows %}
- **{{ flow.name }}**: {{ flow.source }} → {{ flow.destination }}
  - Data: {{ flow.dataType }}
  - Protocol: {{ flow.protocol }}
  - Frequency: {{ flow.frequency }}
{% endfor %}

### Data Storage
{% for storage in dataStorage %}
- **{{ storage.name }}**: {{ storage.type }}
  - Purpose: {{ storage.purpose }}
  - Technology: {{ storage.technology }}
  - Capacity: {{ storage.capacity }}
{% endfor %}

## Integration Architecture
### API Design
{% for api in apis %}
#### {{ api.name }}
- **Type**: {{ api.type }}
- **Protocol**: {{ api.protocol }}
- **Authentication**: {{ api.authentication }}
- **Endpoints**: {{ api.endpoints | bulletList }}
{% endfor %}

### External Integrations
{{ externalIntegrations | bulletList }}

## Security Architecture
### Security Layers
{{ securityLayers | numberedList }}

### Authentication & Authorization
- **Authentication Method**: {{ authMethod }}
- **Authorization Model**: {{ authzModel }}
- **Token Management**: {{ tokenManagement }}

### Data Protection
{{ dataProtection | bulletList }}

## Infrastructure Architecture
### Deployment Architecture
{{ deploymentArchitecture }}

### Scaling Strategy
- **Horizontal Scaling**: {{ horizontalScaling }}
- **Vertical Scaling**: {{ verticalScaling }}
- **Auto-scaling Rules**: {{ autoScalingRules | bulletList }}

### High Availability
{{ highAvailability | bulletList }}

## Performance Requirements
{% for req in performanceRequirements %}
- **{{ req.metric }}**: {{ req.target }}
{% endfor %}

## Technology Stack
### Frontend
{{ frontendStack | bulletList }}

### Backend
{{ backendStack | bulletList }}

### Infrastructure
{{ infrastructureStack | bulletList }}

## Architecture Decision Records
{% for adr in adrs %}
### ADR-{{ loop.index }}: {{ adr.title }}
- **Status**: {{ adr.status }}
- **Context**: {{ adr.context }}
- **Decision**: {{ adr.decision }}
- **Consequences**: {{ adr.consequences | bulletList }}
{% endfor %}

## Risks & Mitigations
{% for risk in risks %}
- **{{ risk.name }}**: {{ risk.description }}
  - Impact: {{ risk.impact }}
  - Mitigation: {{ risk.mitigation }}
{% endfor %}

## Implementation Roadmap
{% for phase in implementationPhases %}
### Phase {{ loop.index }}: {{ phase.name }}
- **Duration**: {{ phase.duration }}
- **Deliverables**: {{ phase.deliverables | bulletList }}
{% endfor %}`,
          variables: [
            { name: 'systemName', type: 'string', required: true, description: 'System name' },
            { name: 'executiveSummary', type: 'string', required: true, description: 'Executive summary' },
            { name: 'systemOverview', type: 'string', required: true, description: 'System overview' },
            { name: 'principles', type: 'array', required: true, description: 'Architecture principles' },
            { name: 'highLevelDescription', type: 'string', required: true, description: 'High-level architecture description' },
            { name: 'components', type: 'array', required: true, description: 'System components' },
            { name: 'dataModelDescription', type: 'string', required: true, description: 'Data model description' },
            { name: 'dataFlows', type: 'array', required: true, description: 'Data flows' },
            { name: 'dataStorage', type: 'array', required: true, description: 'Data storage systems' },
            { name: 'apis', type: 'array', required: true, description: 'API definitions' },
            { name: 'externalIntegrations', type: 'array', required: false, description: 'External integrations' },
            { name: 'securityLayers', type: 'array', required: true, description: 'Security layers' },
            { name: 'authMethod', type: 'string', required: true, description: 'Authentication method' },
            { name: 'authzModel', type: 'string', required: true, description: 'Authorization model' },
            { name: 'tokenManagement', type: 'string', required: true, description: 'Token management' },
            { name: 'dataProtection', type: 'array', required: true, description: 'Data protection measures' },
            { name: 'deploymentArchitecture', type: 'string', required: true, description: 'Deployment architecture' },
            { name: 'horizontalScaling', type: 'string', required: true, description: 'Horizontal scaling strategy' },
            { name: 'verticalScaling', type: 'string', required: true, description: 'Vertical scaling strategy' },
            { name: 'autoScalingRules', type: 'array', required: false, description: 'Auto-scaling rules' },
            { name: 'highAvailability', type: 'array', required: true, description: 'High availability measures' },
            { name: 'performanceRequirements', type: 'array', required: true, description: 'Performance requirements' },
            { name: 'frontendStack', type: 'array', required: true, description: 'Frontend technology stack' },
            { name: 'backendStack', type: 'array', required: true, description: 'Backend technology stack' },
            { name: 'infrastructureStack', type: 'array', required: true, description: 'Infrastructure stack' },
            { name: 'adrs', type: 'array', required: false, description: 'Architecture Decision Records' },
            { name: 'risks', type: 'array', required: true, description: 'Risks and mitigations' },
            { name: 'implementationPhases', type: 'array', required: true, description: 'Implementation phases' }
          ]
        },
        output: {
          format: 'markdown',
          validation: {
            minLength: 1500,
            requiredFields: ['systemName', 'components', 'apis']
          }
        },
        metadata: {
          author: 'Canvas CLI',
          createdAt: now,
          updatedAt: now,
          tags: ['architecture', 'design', 'technical']
        }
      }
    ];
  }

  /**
   * Clone a template
   */
  async cloneTemplate(templateId: string, newId: string, newName: string): Promise<void> {
    const original = this.templates.get(templateId);
    if (!original) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    const cloned = {
      ...original,
      id: newId,
      name: newName,
      metadata: {
        ...original.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    
    await this.createTemplate(cloned);
  }

  /**
   * Export template
   */
  async exportTemplate(templateId: string, outputPath: string): Promise<void> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    
    await fs.writeFile(outputPath, JSON.stringify(template, null, 2), 'utf-8');
  }

  /**
   * Import template
   */
  async importTemplate(inputPath: string): Promise<void> {
    const content = await fs.readFile(inputPath, 'utf-8');
    const template = PromptTemplateSchema.parse(JSON.parse(content));
    await this.createTemplate(template);
  }
}

// Export singleton instance
export const promptTemplateSystem = new PromptTemplateSystem();