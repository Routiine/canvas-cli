/**
 * Business Analysis Agent
 * Specialized agent for requirements analysis and business process documentation
 */

import { EventEmitter } from 'events';
import { AgentConfigurationSystem } from './config/agent-config.js';
import { PromptTemplateSystem } from './config/prompt-templates.js';
import { ThemeManager } from '../themes.js';
import chalk from 'chalk';
import ora from 'ora';

export interface RequirementsAnalysis {
  projectName: string;
  executiveSummary: string;
  businessContext: string;
  stakeholders: Stakeholder[];
  functionalRequirements: FunctionalRequirement[];
  nonFunctionalRequirements: NonFunctionalRequirement[];
  useCases: UseCase[];
  risks: Risk[];
  assumptions: string[];
  dependencies: string[];
  successCriteria: string[];
  recommendations: string[];
}

export interface Stakeholder {
  name: string;
  role: string;
  interest: string;
  influence: 'high' | 'medium' | 'low';
  requirements: string[];
  communicationPreference: string;
}

export interface FunctionalRequirement {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  acceptanceCriteria: string[];
  dependencies: string[];
  effort: 'small' | 'medium' | 'large' | 'extra-large';
}

export interface NonFunctionalRequirement {
  category: string;
  requirements: string[];
  metrics: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface UseCase {
  id: string;
  name: string;
  actor: string;
  description: string;
  preconditions: string[];
  steps: string[];
  postconditions: string[];
  alternativeFlows: string[];
  exceptions: string[];
}

export interface Risk {
  id: string;
  name: string;
  description: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  mitigation: string;
  owner: string;
}

export interface ProcessMap {
  name: string;
  description: string;
  steps: ProcessStep[];
  inputs: string[];
  outputs: string[];
  roles: string[];
  systems: string[];
}

export interface ProcessStep {
  id: string;
  name: string;
  description: string;
  role: string;
  system: string;
  inputs: string[];
  outputs: string[];
  duration: string;
  decisions?: Decision[];
}

export interface Decision {
  question: string;
  options: Array<{
    condition: string;
    nextStep: string;
  }>;
}

export class BusinessAnalystAgent extends EventEmitter {
  private configSystem: AgentConfigurationSystem;
  private templateSystem: PromptTemplateSystem;
  private themeManager: ThemeManager;
  private agentId: string = 'business-analyst';

  constructor() {
    super();
    this.configSystem = new AgentConfigurationSystem();
    this.templateSystem = new PromptTemplateSystem();
    this.themeManager = new ThemeManager();
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    await this.configSystem.initialize();
    await this.templateSystem.initialize();
    
    this.emit('initialized', { agent: this.agentId });
  }

  /**
   * Analyze requirements from raw input
   */
  async analyzeRequirements(input: string, context?: Record<string, any>): Promise<RequirementsAnalysis> {
    const spinner = ora('Analyzing requirements...').start();
    
    try {
      // Get agent configuration
      const config = this.configSystem.getConfiguration(this.agentId);
      if (!config) {
        throw new Error('Business Analyst agent configuration not found');
      }
      
      // Generate prompt
      const prompt = this.configSystem.generatePrompt(
        this.agentId,
        `Analyze the following requirements and provide a comprehensive requirements analysis:\n\n${input}`,
        context
      );
      
      // Simulate AI processing (in production, this would call the actual AI service)
      const analysis = await this.performAnalysis(prompt, input);
      
      spinner.succeed('Requirements analysis completed');
      
      this.emit('analysis:complete', { 
        agent: this.agentId, 
        type: 'requirements',
        results: analysis 
      });
      
      return analysis;
    } catch (error) {
      spinner.fail('Requirements analysis failed');
      this.emit('analysis:error', { agent: this.agentId, error });
      throw error;
    }
  }

  /**
   * Perform stakeholder analysis
   */
  async analyzeStakeholders(projectContext: string): Promise<Stakeholder[]> {
    const spinner = ora('Performing stakeholder analysis...').start();
    
    try {
      const prompt = this.configSystem.generatePrompt(
        this.agentId,
        `Perform a comprehensive stakeholder analysis for the following project:\n\n${projectContext}`,
        { analysisType: 'stakeholder' }
      );
      
      const stakeholders = await this.identifyStakeholders(projectContext);
      
      spinner.succeed('Stakeholder analysis completed');
      
      this.emit('analysis:complete', { 
        agent: this.agentId, 
        type: 'stakeholder',
        results: stakeholders 
      });
      
      return stakeholders;
    } catch (error) {
      spinner.fail('Stakeholder analysis failed');
      throw error;
    }
  }

  /**
   * Create process maps
   */
  async mapBusinessProcess(processDescription: string): Promise<ProcessMap> {
    const spinner = ora('Mapping business process...').start();
    
    try {
      const prompt = this.configSystem.generatePrompt(
        this.agentId,
        `Create a detailed business process map for:\n\n${processDescription}`,
        { analysisType: 'process-mapping' }
      );
      
      const processMap = await this.createProcessMap(processDescription);
      
      spinner.succeed('Process mapping completed');
      
      this.emit('analysis:complete', { 
        agent: this.agentId, 
        type: 'process-map',
        results: processMap 
      });
      
      return processMap;
    } catch (error) {
      spinner.fail('Process mapping failed');
      throw error;
    }
  }

  /**
   * Perform gap analysis
   */
  async performGapAnalysis(
    currentState: string,
    desiredState: string
  ): Promise<{
    gaps: Array<{ area: string; current: string; desired: string; gap: string; priority: string }>;
    recommendations: string[];
    timeline: string;
  }> {
    const spinner = ora('Performing gap analysis...').start();
    
    try {
      const prompt = this.configSystem.generatePrompt(
        this.agentId,
        `Perform a gap analysis between:\n\nCurrent State:\n${currentState}\n\nDesired State:\n${desiredState}`,
        { analysisType: 'gap-analysis' }
      );
      
      const gapAnalysis = {
        gaps: [
          {
            area: 'Technology',
            current: 'Legacy monolithic application',
            desired: 'Microservices architecture',
            gap: 'Complete architectural transformation needed',
            priority: 'High'
          },
          {
            area: 'Process',
            current: 'Manual approval workflows',
            desired: 'Automated approval system',
            gap: 'Workflow automation implementation required',
            priority: 'Medium'
          }
        ],
        recommendations: [
          'Phase 1: Implement API gateway and begin service extraction',
          'Phase 2: Automate critical approval workflows',
          'Phase 3: Complete microservices migration'
        ],
        timeline: '6-9 months for complete transformation'
      };
      
      spinner.succeed('Gap analysis completed');
      
      this.emit('analysis:complete', { 
        agent: this.agentId, 
        type: 'gap-analysis',
        results: gapAnalysis 
      });
      
      return gapAnalysis;
    } catch (error) {
      spinner.fail('Gap analysis failed');
      throw error;
    }
  }

  /**
   * Create use cases
   */
  async createUseCases(requirements: FunctionalRequirement[]): Promise<UseCase[]> {
    const spinner = ora('Creating use cases...').start();
    
    try {
      const useCases: UseCase[] = [];
      
      for (const req of requirements) {
        const useCase = await this.generateUseCase(req);
        useCases.push(useCase);
      }
      
      spinner.succeed(`Created ${useCases.length} use cases`);
      
      this.emit('analysis:complete', { 
        agent: this.agentId, 
        type: 'use-cases',
        results: useCases 
      });
      
      return useCases;
    } catch (error) {
      spinner.fail('Use case creation failed');
      throw error;
    }
  }

  /**
   * Perform risk assessment
   */
  async assessRisks(projectContext: string): Promise<Risk[]> {
    const spinner = ora('Assessing risks...').start();
    
    try {
      const prompt = this.configSystem.generatePrompt(
        this.agentId,
        `Identify and assess risks for the following project:\n\n${projectContext}`,
        { analysisType: 'risk-assessment' }
      );
      
      const risks = await this.identifyRisks(projectContext);
      
      spinner.succeed(`Identified ${risks.length} risks`);
      
      this.emit('analysis:complete', { 
        agent: this.agentId, 
        type: 'risk-assessment',
        results: risks 
      });
      
      return risks;
    } catch (error) {
      spinner.fail('Risk assessment failed');
      throw error;
    }
  }

  /**
   * Generate requirements document
   */
  async generateRequirementsDocument(analysis: RequirementsAnalysis): Promise<string> {
    const spinner = ora('Generating requirements document...').start();
    
    try {
      // Use the requirements analysis template
      const document = await this.templateSystem.renderTemplate('requirements-analysis', {
        projectName: analysis.projectName,
        executiveSummary: analysis.executiveSummary,
        businessContext: analysis.businessContext,
        stakeholders: analysis.stakeholders,
        functionalRequirements: analysis.functionalRequirements,
        nonFunctionalRequirements: analysis.nonFunctionalRequirements,
        useCases: analysis.useCases,
        risks: analysis.risks,
        assumptions: analysis.assumptions,
        dependencies: analysis.dependencies,
        successCriteria: analysis.successCriteria,
        nextSteps: analysis.recommendations
      });
      
      spinner.succeed('Requirements document generated');
      
      this.emit('document:generated', { 
        agent: this.agentId, 
        type: 'requirements',
        content: document 
      });
      
      return document;
    } catch (error) {
      spinner.fail('Document generation failed');
      throw error;
    }
  }

  /**
   * Validate requirements
   */
  async validateRequirements(requirements: FunctionalRequirement[]): Promise<{
    valid: boolean;
    issues: Array<{ requirement: string; issue: string; severity: string }>;
    suggestions: string[];
  }> {
    console.log(this.themeManager.info('Validating requirements...'));
    
    const validation = {
      valid: true,
      issues: [] as Array<{ requirement: string; issue: string; severity: string }>,
      suggestions: [] as string[]
    };
    
    for (const req of requirements) {
      // Check for completeness
      if (!req.acceptanceCriteria || req.acceptanceCriteria.length === 0) {
        validation.issues.push({
          requirement: req.title,
          issue: 'Missing acceptance criteria',
          severity: 'high'
        });
        validation.valid = false;
      }
      
      // Check for testability
      if (!this.isTestable(req.description)) {
        validation.issues.push({
          requirement: req.title,
          issue: 'Requirement is not testable',
          severity: 'medium'
        });
      }
      
      // Check for clarity
      if (this.hasAmbiguousTerms(req.description)) {
        validation.issues.push({
          requirement: req.title,
          issue: 'Contains ambiguous terms',
          severity: 'low'
        });
      }
    }
    
    // Generate suggestions
    if (validation.issues.length > 0) {
      validation.suggestions.push('Review and clarify ambiguous requirements');
      validation.suggestions.push('Add acceptance criteria to all requirements');
      validation.suggestions.push('Ensure all requirements are testable and measurable');
    }
    
    this.emit('validation:complete', { 
      agent: this.agentId, 
      results: validation 
    });
    
    return validation;
  }

  /**
   * Private helper methods
   */
  
  private async performAnalysis(prompt: string, input: string): Promise<RequirementsAnalysis> {
    // In production, this would call the actual AI service
    // For now, return a structured example
    return {
      projectName: 'Sample Project',
      executiveSummary: 'Comprehensive requirements analysis for the project',
      businessContext: 'Business context extracted from input',
      stakeholders: await this.identifyStakeholders(input),
      functionalRequirements: await this.extractFunctionalRequirements(input),
      nonFunctionalRequirements: await this.extractNonFunctionalRequirements(input),
      useCases: [],
      risks: await this.identifyRisks(input),
      assumptions: ['System will have internet connectivity', 'Users have basic technical skills'],
      dependencies: ['External API availability', 'Database infrastructure'],
      successCriteria: ['All functional requirements implemented', 'Performance targets met'],
      recommendations: ['Start with MVP features', 'Implement in phases']
    };
  }

  private async identifyStakeholders(context: string): Promise<Stakeholder[]> {
    return [
      {
        name: 'Product Owner',
        role: 'Decision Maker',
        interest: 'Business value delivery',
        influence: 'high',
        requirements: ['ROI visibility', 'Quick time to market'],
        communicationPreference: 'Executive summaries'
      },
      {
        name: 'End Users',
        role: 'System Users',
        interest: 'Ease of use',
        influence: 'medium',
        requirements: ['Intuitive interface', 'Fast response times'],
        communicationPreference: 'User guides and tutorials'
      }
    ];
  }

  private async extractFunctionalRequirements(input: string): Promise<FunctionalRequirement[]> {
    return [
      {
        id: 'FR-001',
        title: 'User Authentication',
        description: 'System shall provide secure user authentication',
        priority: 'critical',
        category: 'Security',
        acceptanceCriteria: [
          'Users can log in with email and password',
          'Password must meet security requirements',
          'Session timeout after 30 minutes of inactivity'
        ],
        dependencies: [],
        effort: 'medium'
      }
    ];
  }

  private async extractNonFunctionalRequirements(input: string): Promise<NonFunctionalRequirement[]> {
    return [
      {
        category: 'Performance',
        requirements: [
          'Page load time < 2 seconds',
          'Support 1000 concurrent users',
          'API response time < 200ms'
        ],
        metrics: ['Response time', 'Throughput', 'Resource utilization'],
        priority: 'high'
      },
      {
        category: 'Security',
        requirements: [
          'Data encryption at rest and in transit',
          'OWASP Top 10 compliance',
          'Regular security audits'
        ],
        metrics: ['Vulnerability count', 'Incident response time'],
        priority: 'critical'
      }
    ];
  }

  private async identifyRisks(context: string): Promise<Risk[]> {
    return [
      {
        id: 'R-001',
        name: 'Technology Risk',
        description: 'New technology stack may require team training',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Provide comprehensive training and documentation',
        owner: 'Technical Lead'
      }
    ];
  }

  private async createProcessMap(description: string): Promise<ProcessMap> {
    return {
      name: 'Sample Business Process',
      description: description,
      steps: [
        {
          id: 'S1',
          name: 'Initiate Request',
          description: 'User initiates a new request',
          role: 'Requester',
          system: 'Web Portal',
          inputs: ['Request form'],
          outputs: ['Request ID'],
          duration: '5 minutes'
        },
        {
          id: 'S2',
          name: 'Review Request',
          description: 'Manager reviews the request',
          role: 'Manager',
          system: 'Approval System',
          inputs: ['Request details'],
          outputs: ['Approval decision'],
          duration: '1 hour',
          decisions: [
            {
              question: 'Is request approved?',
              options: [
                { condition: 'Yes', nextStep: 'S3' },
                { condition: 'No', nextStep: 'End' }
              ]
            }
          ]
        }
      ],
      inputs: ['Request form', 'Supporting documents'],
      outputs: ['Approved request', 'Notification'],
      roles: ['Requester', 'Manager', 'Administrator'],
      systems: ['Web Portal', 'Approval System', 'Notification Service']
    };
  }

  private async generateUseCase(requirement: FunctionalRequirement): Promise<UseCase> {
    return {
      id: `UC-${requirement.id}`,
      name: requirement.title,
      actor: 'User',
      description: requirement.description,
      preconditions: ['User is authenticated', 'System is available'],
      steps: [
        'User navigates to the feature',
        'System displays the interface',
        'User performs the action',
        'System validates the input',
        'System processes the request',
        'System displays the result'
      ],
      postconditions: ['Action is completed successfully', 'Data is persisted'],
      alternativeFlows: ['Validation failure flow', 'Error handling flow'],
      exceptions: ['System unavailable', 'Invalid input']
    };
  }

  private isTestable(description: string): boolean {
    // Check if requirement contains measurable criteria
    const testableKeywords = ['shall', 'must', 'will', 'should'];
    return testableKeywords.some(keyword => description.toLowerCase().includes(keyword));
  }

  private hasAmbiguousTerms(description: string): boolean {
    // Check for ambiguous terms
    const ambiguousTerms = ['maybe', 'possibly', 'might', 'could', 'sometimes', 'often', 'usually'];
    return ambiguousTerms.some(term => description.toLowerCase().includes(term));
  }
}

// Export singleton instance
export const businessAnalystAgent = new BusinessAnalystAgent();