/**
 * Canvas Agentic Planning System
 * Intelligent project planning and context-engineered development
 */

import { EventEmitter } from 'events';
import { OllamaService } from '../services/ollama-service.js';
import { FileService } from '../services/file-service.js';
import { ThemeManager } from '../themes.js';
import type { AgentMemory } from './memory/agent-memory.js';
import type { 
  CommunicationMixin} from './communication/agent-integration.js';
import { 
  CommunicationAgentFactory,
  CollaborationOrchestrator 
} from './communication/agent-integration.js';
import type { AgentMessage } from './communication/agent-communication.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';

export interface AgentRole {
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
}

export interface StoryContext {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  technicalDetails: string;
  implementation: string;
  testing: string;
  dependencies: string[];
}

export class CanvasAgentSystem extends EventEmitter {
  private ollama: OllamaService;
  private fileService: FileService;
  private themeManager: ThemeManager;
  private agents: Map<string, AgentRole>;
  private communicationAgents: Map<string, CommunicationMixin>;
  private orchestrator: CollaborationOrchestrator;
  private workDir: string;

  constructor(ollamaUrl: string, model: string, themeName: string = 'default') {
    super();
    this.ollama = new OllamaService({ baseUrl: ollamaUrl, defaultModel: model });
    this.fileService = new FileService();
    this.themeManager = new ThemeManager(themeName);
    this.agents = new Map();
    this.communicationAgents = new Map();
    this.workDir = path.join(process.cwd(), '.canvas-agents');
    
    // Initialize communication system
    CommunicationAgentFactory.initialize();
    this.orchestrator = new CollaborationOrchestrator(CommunicationAgentFactory.getHub());
    
    this.initializeAgents();
    this.initializeCommunicationAgents();
  }

  private initializeAgents(): void {
    // Analyst Agent
    this.agents.set('analyst', {
      name: 'Business Analyst',
      description: 'Analyzes requirements and creates detailed specifications',
      systemPrompt: `You are a Senior Business Analyst specializing in requirement analysis and specification.
Your role is to:
1. Analyze user requirements and business needs
2. Create detailed functional specifications
3. Identify edge cases and potential issues
4. Define clear acceptance criteria
5. Ensure requirements are complete, consistent, and testable

Always structure your output with clear sections and use precise language.`,
      capabilities: ['requirement_analysis', 'specification_writing', 'stakeholder_communication']
    });

    // Product Manager Agent
    this.agents.set('pm', {
      name: 'Product Manager',
      description: 'Creates product requirements and roadmaps',
      systemPrompt: `You are an experienced Product Manager focused on delivering value.
Your role is to:
1. Define product vision and strategy
2. Create detailed PRDs (Product Requirements Documents)
3. Prioritize features based on business value
4. Define success metrics and KPIs
5. Ensure alignment with business objectives

Structure your documents with clear goals, user stories, and measurable outcomes.`,
      capabilities: ['product_strategy', 'roadmap_planning', 'prioritization', 'metrics_definition']
    });

    // Architect Agent
    this.agents.set('architect', {
      name: 'Solutions Architect',
      description: 'Designs technical architecture and system design',
      systemPrompt: `You are a Senior Solutions Architect specializing in scalable system design.
Your role is to:
1. Design robust technical architectures
2. Define system components and their interactions
3. Select appropriate technologies and patterns
4. Document architectural decisions (ADRs)
5. Ensure scalability, security, and maintainability

Provide detailed technical specifications with diagrams when needed (using ASCII art or mermaid syntax).`,
      capabilities: ['system_design', 'technology_selection', 'architecture_documentation', 'pattern_implementation']
    });

    // Scrum Master Agent
    this.agents.set('scrummaster', {
      name: 'Scrum Master',
      description: 'Creates detailed development stories with full context',
      systemPrompt: `You are an experienced Scrum Master focused on effective story creation.
Your role is to:
1. Transform requirements into detailed user stories
2. Embed full context and implementation details
3. Define clear acceptance criteria and test cases
4. Estimate effort and identify dependencies
5. Ensure stories are actionable and well-defined

Each story should be self-contained with all necessary context for implementation.`,
      capabilities: ['story_writing', 'sprint_planning', 'estimation', 'dependency_management']
    });

    // Developer Agent
    this.agents.set('developer', {
      name: 'Senior Developer',
      description: 'Implements code based on detailed stories',
      systemPrompt: `You are a Senior Full-Stack Developer focused on clean, maintainable code.
Your role is to:
1. Implement features based on detailed specifications
2. Follow established patterns and best practices
3. Write comprehensive tests
4. Document code thoroughly
5. Ensure code quality and performance

Always follow the project's coding standards and architecture guidelines.`,
      capabilities: ['implementation', 'testing', 'debugging', 'code_review', 'documentation']
    });

    // QA Agent
    this.agents.set('qa', {
      name: 'QA Engineer',
      description: 'Creates test plans and validates implementations',
      systemPrompt: `You are a Senior QA Engineer specializing in comprehensive testing.
Your role is to:
1. Create detailed test plans and test cases
2. Identify edge cases and potential bugs
3. Validate acceptance criteria
4. Perform regression testing strategies
5. Document test results and quality metrics

Focus on both functional and non-functional requirements.`,
      capabilities: ['test_planning', 'test_execution', 'bug_tracking', 'quality_metrics']
    });
  }

  /**
   * Phase 1: Agentic Planning
   */
  async planProject(requirements: string): Promise<Map<string, string>> {
    console.log(this.themeManager.primary('\n🎯 Starting Canvas Agentic Planning Phase...\n'));
    
    const documents = new Map<string, string>();
    
    // Step 1: Analyst creates requirements document
    console.log(this.themeManager.info('📋 Analyst: Analyzing requirements...'));
    const analysisDoc = await this.runAgent('analyst', 
      `Analyze these requirements and create a detailed specification document:\n${requirements}`
    );
    documents.set('requirements.md', analysisDoc);
    
    // Step 2: PM creates PRD
    console.log(this.themeManager.info('📊 Product Manager: Creating PRD...'));
    const prdDoc = await this.runAgent('pm',
      `Based on this analysis, create a comprehensive PRD:\n${analysisDoc}`
    );
    documents.set('PRD.md', prdDoc);
    
    // Step 3: Architect creates technical design
    console.log(this.themeManager.info('🏗️ Architect: Designing system architecture...'));
    const architectureDoc = await this.runAgent('architect',
      `Design the technical architecture for this PRD:\n${prdDoc}\n\nRequirements:\n${analysisDoc}`
    );
    documents.set('architecture.md', architectureDoc);
    
    // Save planning documents
    await this.savePlanningDocuments(documents);
    
    return documents;
  }

  /**
   * Phase 2: Context-Engineered Development
   */
  async createDevelopmentStories(planningDocs: Map<string, string>): Promise<StoryContext[]> {
    console.log(this.themeManager.primary('\n📝 Starting Context-Engineered Development Phase...\n'));
    
    const stories: StoryContext[] = [];
    
    // Scrum Master creates detailed stories
    console.log(this.themeManager.info('🎯 Scrum Master: Creating development stories...'));
    
    const combinedContext = Array.from(planningDocs.entries())
      .map(([file, content]) => `=== ${file} ===\n${content}`)
      .join('\n\n');
    
    const storiesText = await this.runAgent('scrummaster',
      `Create detailed development stories with full context based on these documents:\n${combinedContext}`
    );
    
    // Parse stories (simplified - in production would use structured format)
    const storyBlocks = storiesText.split(/\n## Story \d+:/).filter(s => s.trim());
    
    for (const storyBlock of storyBlocks) {
      const story = this.parseStory(storyBlock);
      if (story) {
        stories.push(story);
        await this.saveStory(story);
      }
    }
    
    return stories;
  }

  /**
   * Execute development with context
   */
  async executeDevelopment(story: StoryContext): Promise<string> {
    console.log(this.themeManager.primary(`\n💻 Executing: ${story.title}\n`));
    
    // Developer implements based on story context
    console.log(this.themeManager.info('👨‍💻 Developer: Implementing feature...'));
    const implementation = await this.runAgent('developer',
      `Implement this story with all its context:\n${JSON.stringify(story, null, 2)}`
    );
    
    // QA validates implementation
    console.log(this.themeManager.info('🧪 QA: Validating implementation...'));
    const validation = await this.runAgent('qa',
      `Validate this implementation against the story:\nStory: ${JSON.stringify(story, null, 2)}\n\nImplementation:\n${implementation}`
    );
    
    return implementation;
  }

  /**
   * Run a specific agent with a prompt
   */
  private async runAgent(agentName: string, prompt: string): Promise<string> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }
    
    this.emit('agent:start', { agent: agentName, role: agent.name });
    
    const response = await this.ollama.generate({
      model: this.ollama.getDefaultModel(),
      prompt: `${agent.systemPrompt}\n\n${prompt}`,
      options: {
        temperature: 0.7,
        top_p: 0.9
      }
    });

    this.emit('agent:complete', { agent: agentName, response: response.response });

    return response.response;
  }

  /**
   * Parse story text into structured format
   */
  private parseStory(storyText: string): StoryContext | null {
    try {
      // Simple parsing - in production would use more robust parsing
      const lines = storyText.split('\n');
      const story: StoryContext = {
        title: '',
        description: '',
        acceptanceCriteria: [],
        technicalDetails: '',
        implementation: '',
        testing: '',
        dependencies: []
      };
      
      let currentSection = '';
      
      for (const line of lines) {
        if (line.startsWith('### Title:')) {
          story.title = line.replace('### Title:', '').trim();
        } else if (line.startsWith('### Description:')) {
          currentSection = 'description';
        } else if (line.startsWith('### Acceptance Criteria:')) {
          currentSection = 'acceptance';
        } else if (line.startsWith('### Technical Details:')) {
          currentSection = 'technical';
        } else if (line.startsWith('### Implementation:')) {
          currentSection = 'implementation';
        } else if (line.startsWith('### Testing:')) {
          currentSection = 'testing';
        } else if (line.startsWith('### Dependencies:')) {
          currentSection = 'dependencies';
        } else if (line.trim()) {
          switch (currentSection) {
            case 'description':
              story.description += line + '\n';
              break;
            case 'acceptance':
              if (line.startsWith('- ')) {
                story.acceptanceCriteria.push(line.substring(2));
              }
              break;
            case 'technical':
              story.technicalDetails += line + '\n';
              break;
            case 'implementation':
              story.implementation += line + '\n';
              break;
            case 'testing':
              story.testing += line + '\n';
              break;
            case 'dependencies':
              if (line.startsWith('- ')) {
                story.dependencies.push(line.substring(2));
              }
              break;
          }
        }
      }
      
      return story.title ? story : null;
    } catch (error) {
      console.error('Error parsing story:', error);
      return null;
    }
  }

  /**
   * Save planning documents to disk
   */
  private async savePlanningDocuments(documents: Map<string, string>): Promise<void> {
    const planDir = path.join(this.workDir, 'planning');
    await fs.mkdir(planDir, { recursive: true });
    
    for (const [filename, content] of documents) {
      const filepath = path.join(planDir, filename);
      await fs.writeFile(filepath, content, 'utf-8');
      console.log(this.themeManager.success(`✅ Saved: ${filename}`));
    }
  }

  /**
   * Save story to disk
   */
  private async saveStory(story: StoryContext): Promise<void> {
    const storiesDir = path.join(this.workDir, 'stories');
    await fs.mkdir(storiesDir, { recursive: true });
    
    const filename = `${story.title.toLowerCase().replace(/\s+/g, '-')}.json`;
    const filepath = path.join(storiesDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(story, null, 2), 'utf-8');
    console.log(this.themeManager.success(`✅ Saved story: ${filename}`));
  }

  /**
   * Load existing stories
   */
  async loadStories(): Promise<StoryContext[]> {
    const storiesDir = path.join(this.workDir, 'stories');
    
    try {
      const files = await fs.readdir(storiesDir);
      const stories: StoryContext[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filepath = path.join(storiesDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          stories.push(JSON.parse(content));
        }
      }
      
      return stories;
    } catch (error) {
      return [];
    }
  }

  /**
   * Initialize communication-capable agents
   */
  private initializeCommunicationAgents(): void {
    // Create communication-capable versions of each agent
    for (const [agentId, role] of this.agents) {
      const commAgent = CommunicationAgentFactory.createAgent(
        agentId,
        role.capabilities,
        this.createAgentHandlers(agentId)
      );
      
      this.communicationAgents.set(agentId, commAgent);
      
      // Set up event listeners
      commAgent.on('message:received', (message) => {
        this.emit('agent:message', { agentId, message });
      });
      
      commAgent.on('collaboration:started', (data) => {
        this.emit('collaboration:started', { agentId, ...data });
      });
    }
  }

  /**
   * Create custom message handlers for specific agents
   */
  private createAgentHandlers(agentId: string): Map<AgentMessage['type'], (message: AgentMessage) => Promise<void>> {
    const handlers = new Map<AgentMessage['type'], (message: AgentMessage) => Promise<void>>();
    
    // Agent-specific handlers
    switch (agentId) {
      case 'analyst':
        handlers.set('request', async (message) => {
          if (message.content.type === 'requirements_analysis') {
            const analysis = await this.runAgent('analyst', message.content.input);
            const agent = this.communicationAgents.get('analyst');
            if (agent) {
              await agent.sendMessage(message.from, analysis, 'response');
            }
          }
        });
        break;
        
      case 'architect':
        handlers.set('request', async (message) => {
          if (message.content.type === 'system_design') {
            const design = await this.runAgent('architect', message.content.input);
            const agent = this.communicationAgents.get('architect');
            if (agent) {
              await agent.sendMessage(message.from, design, 'response');
            }
          }
        });
        break;
        
      case 'developer':
        handlers.set('request', async (message) => {
          if (message.content.type === 'implementation') {
            const code = await this.runAgent('developer', message.content.input);
            const agent = this.communicationAgents.get('developer');
            if (agent) {
              await agent.sendMessage(message.from, code, 'response');
            }
          }
        });
        break;
        
      case 'qa':
        handlers.set('request', async (message) => {
          if (message.content.type === 'testing') {
            const tests = await this.runAgent('qa', message.content.input);
            const agent = this.communicationAgents.get('qa');
            if (agent) {
              await agent.sendMessage(message.from, tests, 'response');
            }
          }
        });
        break;
    }
    
    return handlers;
  }

  /**
   * Start a collaborative workflow
   */
  async startCollaborativeWorkflow(
    workflowType: 'feature_development' | 'bug_fix' | 'code_review',
    input: any
  ): Promise<any> {
    console.log(this.themeManager.primary(`\n🤝 Starting collaborative ${workflowType} workflow...\n`));
    
    const result = await this.orchestrator.executeWorkflow(
      workflowType,
      input,
      'system'
    );
    
    return result;
  }

  /**
   * Enable agent-to-agent consultation
   */
  async consultAgent(
    fromAgent: string,
    toAgent: string,
    query: any
  ): Promise<any> {
    const from = this.communicationAgents.get(fromAgent);
    const to = this.communicationAgents.get(toAgent);
    
    if (!from || !to) {
      throw new Error('Agent not found');
    }
    
    const messageId = await from.sendMessage(toAgent, query, 'query');
    
    // In production, would wait for response
    return { messageId, status: 'sent' };
  }

  /**
   * Broadcast to all agents on a channel
   */
  async broadcastToChannel(
    channel: string,
    content: any,
    fromAgent: string = 'system'
  ): Promise<void> {
    const agent = this.communicationAgents.get(fromAgent);
    if (agent) {
      await agent.broadcast(channel, content);
    } else {
      // System broadcast
      const hub = CommunicationAgentFactory.getHub();
      await hub.broadcast(channel, 'system', content);
    }
  }

  /**
   * Get agent memory
   */
  getAgentMemory(agentId: string): AgentMemory | undefined {
    return this.communicationAgents.get(agentId)?.memory;
  }

  /**
   * Get communication metrics
   */
  getCommunicationMetrics() {
    const hub = CommunicationAgentFactory.getHub();
    return hub.getMetrics();
  }
}