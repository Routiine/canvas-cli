/**
 * Unit Tests for Business Analyst Agent
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BusinessAnalystAgent } from '../../../src/agents/business-analyst';
import { AgentConfigurationSystem } from '../../../src/agents/config/agent-config';
import { PromptTemplateSystem } from '../../../src/agents/config/prompt-templates';

// Mock dependencies
jest.mock('../../../src/agents/config/agent-config');
jest.mock('../../../src/agents/config/prompt-templates');

describe('BusinessAnalystAgent', () => {
  let agent: BusinessAnalystAgent;
  let mockConfigSystem: jest.Mocked<AgentConfigurationSystem>;
  let mockTemplateSystem: jest.Mocked<PromptTemplateSystem>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create agent instance
    agent = new BusinessAnalystAgent();

    // ts-jest ESM auto-mock doesn't produce jest.fn() prototype methods —
    // patch the private dependency instances directly after construction.
    const cs = agent['configSystem'] as any;
    cs.initialize = jest.fn().mockResolvedValue(undefined as never);
    cs.getConfiguration = jest.fn().mockReturnValue({
      id: 'business-analyst',
      behavior: { temperature: 0.7, maxTokens: 4000 },
      prompts: { system: 'You are a Business Analyst' }
    } as never);
    cs.generatePrompt = jest.fn().mockReturnValue('Generated prompt' as never);

    const ts = agent['templateSystem'] as any;
    ts.initialize = jest.fn().mockResolvedValue(undefined as never);
    ts.renderTemplate = jest.fn().mockResolvedValue('# Requirements Analysis\n## Functional Requirements\nFR001' as never);

    mockConfigSystem = cs as jest.Mocked<AgentConfigurationSystem>;
    mockTemplateSystem = ts as jest.Mocked<PromptTemplateSystem>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockConfigSystem.initialize.mockResolvedValue(undefined);
      mockTemplateSystem.initialize.mockResolvedValue(undefined);

      const initSpy = jest.spyOn(agent, 'emit');
      
      await agent.initialize();
      
      expect(mockConfigSystem.initialize).toHaveBeenCalled();
      expect(mockTemplateSystem.initialize).toHaveBeenCalled();
      expect(initSpy).toHaveBeenCalledWith('initialized', { agent: 'business-analyst' });
    });

    it('should handle initialization errors', async () => {
      mockConfigSystem.initialize.mockRejectedValue(new Error('Config error'));
      
      await expect(agent.initialize()).rejects.toThrow('Config error');
    });
  });

  describe('analyzeRequirements', () => {
    const mockInput = 'Build a user authentication system';
    const mockContext = { project: 'E-commerce Platform' };

    it('should analyze requirements successfully', async () => {
      const result = await agent.analyzeRequirements(mockInput, mockContext);

      expect(result).toBeDefined();
      expect(result.functionalRequirements).toBeDefined();
      expect(result.nonFunctionalRequirements).toBeDefined();
      expect(result.assumptions).toBeDefined();
    });

    it('should handle empty input', async () => {
      const result = await agent.analyzeRequirements('', mockContext);

      expect(result).toBeDefined();
    });

    it('should emit event after analysis', async () => {
      const emitSpy = jest.spyOn(agent, 'emit');

      await agent.analyzeRequirements(mockInput, mockContext);

      expect(emitSpy).toHaveBeenCalledWith('analysis:complete', expect.any(Object));
    });
  });

  describe('createUseCases', () => {
    const mockFunctionalRequirements = [
      {
        id: 'FR001',
        title: 'User Login',
        description: 'System shall allow users to log in',
        priority: 'high' as const,
        category: 'Authentication',
        acceptanceCriteria: ['User can log in with valid credentials'],
        dependencies: [],
        effort: 'medium' as const
      }
    ];

    it('should create use cases from requirements', async () => {
      const result = await agent.createUseCases(mockFunctionalRequirements);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('UC-FR001');
      expect(result[0].actor).toBe('User');
    });

    it('should handle empty requirements', async () => {
      const result = await agent.createUseCases([]);

      expect(result).toEqual([]);
    });
  });

  describe('performGapAnalysis', () => {
    const mockCurrent = 'Current state: basic authentication using username/password';
    const mockDesired = 'Desired state: OAuth2 and MFA support';

    it('should identify gaps between current and desired state', async () => {
      const result = await agent.performGapAnalysis(mockCurrent, mockDesired);

      expect(result).toBeDefined();
      expect(result.gaps).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });
  });

  describe('mapBusinessProcess', () => {
    const mockProcess = 'User registration process';

    it('should create a process map', async () => {
      const result = await agent.mapBusinessProcess(mockProcess);

      expect(result).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.steps).toBeDefined();
      expect(result.steps.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeStakeholders', () => {
    const mockProject = 'E-commerce Platform';

    it('should identify and analyze stakeholders', async () => {
      const result = await agent.analyzeStakeholders(mockProject);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBeDefined();
      expect(result[0].influence).toBeDefined();
    });
  });

  describe('assessRisks', () => {
    const mockProjectContext = 'E-commerce platform with payment processing module';

    it('should assess risks for a project', async () => {
      const result = await agent.assessRisks(mockProjectContext);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].id).toBeDefined();
      expect(result[0].probability).toBeDefined();
      expect(result[0].impact).toBeDefined();
    });
  });

  describe('validateRequirements', () => {
    const mockFunctionalRequirements = [
      {
        id: 'FR001',
        title: 'User login',
        description: 'System shall allow users to log in',
        priority: 'high' as const,
        category: 'Authentication',
        acceptanceCriteria: ['User can log in with valid credentials'],
        dependencies: [],
        effort: 'medium' as const
      }
    ];

    it('should validate requirements successfully', async () => {
      const result = await agent.validateRequirements(mockFunctionalRequirements);

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it('should identify validation issues', async () => {
      const incompleteReqs = [
        {
          id: 'FR001',
          title: 'User login',
          description: 'System shall allow users to log in',
          priority: 'high' as const,
          category: 'Authentication',
          acceptanceCriteria: [],
          dependencies: [],
          effort: 'medium' as const
        }
      ];

      const result = await agent.validateRequirements(incompleteReqs);

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should return suggestions', async () => {
      const result = await agent.validateRequirements(mockFunctionalRequirements);

      expect(result.suggestions).toBeDefined();
    });
  });

  describe('generateRequirementsDocument', () => {
    const mockAnalysis = {
      projectName: 'Test Project',
      executiveSummary: 'Test summary',
      businessContext: 'Test context',
      stakeholders: [],
      functionalRequirements: [
        {
          id: 'FR001',
          title: 'User login',
          description: 'System shall allow users to log in',
          priority: 'high' as const,
          category: 'Authentication',
          acceptanceCriteria: [],
          dependencies: [],
          effort: 'medium' as const
        }
      ],
      nonFunctionalRequirements: [
        { category: 'security', requirements: ['Encrypt data'], metrics: [], priority: 'critical' as const }
      ],
      useCases: [],
      risks: [],
      assumptions: [],
      dependencies: [],
      successCriteria: [],
      recommendations: []
    };

    it('should export analysis to markdown format', async () => {
      mockTemplateSystem.renderTemplate.mockResolvedValue('# Requirements Analysis\n## Functional Requirements\nFR001\nUser login\n## Non-Functional Requirements\nNFR001' as never);

      const markdown = await agent.generateRequirementsDocument(mockAnalysis);

      expect(markdown).toBeDefined();
      expect(typeof markdown).toBe('string');
    });

    it('should handle template rendering', async () => {
      mockTemplateSystem.renderTemplate.mockResolvedValue('# Requirements Analysis' as never);

      const markdown = await agent.generateRequirementsDocument(mockAnalysis);

      expect(markdown).toContain('# Requirements Analysis');
    });
  });
});
