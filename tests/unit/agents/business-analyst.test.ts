/**
 * Unit Tests for Business Analyst Agent
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BusinessAnalystAgent } from '../../../src/agents/business-analyst';
import { AgentConfigurationSystem } from '../../../src/agents/config/agent-config';
import { PromptTemplateSystem } from '../../../src/agents/config/prompt-templates';
import { ModelManager } from '../../../src/models/model-manager';

// Mock dependencies
jest.mock('../../../src/agents/config/agent-config');
jest.mock('../../../src/agents/config/prompt-templates');
jest.mock('../../../src/models/model-manager');

describe('BusinessAnalystAgent', () => {
  let agent: BusinessAnalystAgent;
  let mockConfigSystem: jest.Mocked<AgentConfigurationSystem>;
  let mockTemplateSystem: jest.Mocked<PromptTemplateSystem>;
  let mockModelManager: jest.Mocked<ModelManager>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create agent instance
    agent = new BusinessAnalystAgent();
    
    // Setup mocks
    mockConfigSystem = agent['configSystem'] as jest.Mocked<AgentConfigurationSystem>;
    mockTemplateSystem = agent['templateSystem'] as jest.Mocked<PromptTemplateSystem>;
    mockModelManager = agent['modelManager'] as jest.Mocked<ModelManager>;
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
    
    beforeEach(() => {
      mockConfigSystem.getConfiguration.mockReturnValue({
        id: 'business-analyst',
        behavior: { temperature: 0.7, maxTokens: 4000 },
        prompts: { system: 'You are a Business Analyst' }
      } as any);
      
      mockConfigSystem.generatePrompt.mockReturnValue('Generated prompt');
    });

    it('should analyze requirements successfully', async () => {
      const mockResponse = JSON.stringify({
        functionalRequirements: [
          { id: 'FR001', description: 'User login', priority: 'high' }
        ],
        nonFunctionalRequirements: [
          { id: 'NFR001', category: 'security', description: 'Encrypt passwords' }
        ],
        assumptions: ['Users have email addresses'],
        constraints: ['Must comply with GDPR'],
        risks: [{ description: 'Data breach', probability: 'low', impact: 'high' }]
      });

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.analyzeRequirements(mockInput, mockContext);

      expect(result).toBeDefined();
      expect(result.functionalRequirements).toHaveLength(1);
      expect(result.functionalRequirements[0].id).toBe('FR001');
      expect(result.nonFunctionalRequirements).toHaveLength(1);
      expect(result.assumptions).toContain('Users have email addresses');
    });

    it('should handle invalid response format', async () => {
      mockModelManager.generateResponse.mockResolvedValue('Invalid JSON');

      const result = await agent.analyzeRequirements(mockInput, mockContext);

      expect(result).toBeDefined();
      expect(result.functionalRequirements).toEqual([]);
      expect(result.nonFunctionalRequirements).toEqual([]);
    });

    it('should emit event after analysis', async () => {
      const emitSpy = jest.spyOn(agent, 'emit');
      mockModelManager.generateResponse.mockResolvedValue('{}');

      await agent.analyzeRequirements(mockInput, mockContext);

      expect(emitSpy).toHaveBeenCalledWith('requirements-analyzed', expect.any(Object));
    });
  });

  describe('createUserStories', () => {
    const mockRequirements = {
      functionalRequirements: [
        { id: 'FR001', description: 'User login', priority: 'high' }
      ]
    };

    it('should create user stories from requirements', async () => {
      const mockResponse = JSON.stringify([
        {
          id: 'US001',
          title: 'User Login',
          asA: 'registered user',
          iWant: 'to log in to the system',
          soThat: 'I can access my account',
          acceptanceCriteria: ['Given user exists', 'When login', 'Then authenticated']
        }
      ]);

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.createUserStories(mockRequirements);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('US001');
      expect(result[0].asA).toBe('registered user');
    });

    it('should handle empty requirements', async () => {
      const result = await agent.createUserStories({});

      expect(result).toEqual([]);
    });
  });

  describe('performGapAnalysis', () => {
    const mockCurrent = { features: ['basic auth'] };
    const mockDesired = { features: ['OAuth2', 'MFA'] };

    it('should identify gaps between current and desired state', async () => {
      const mockResponse = JSON.stringify({
        gaps: [
          { area: 'Authentication', current: 'Basic', desired: 'OAuth2', priority: 'high' }
        ],
        recommendations: ['Implement OAuth2'],
        effortEstimate: { hours: 40, complexity: 'medium' }
      });

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.performGapAnalysis(mockCurrent, mockDesired);

      expect(result).toBeDefined();
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].area).toBe('Authentication');
      expect(result.recommendations).toContain('Implement OAuth2');
    });
  });

  describe('createProcessMap', () => {
    const mockProcess = 'User registration process';

    it('should create a process map', async () => {
      const mockResponse = JSON.stringify({
        process: {
          name: 'User Registration',
          steps: [
            { id: 'S1', name: 'Enter details', type: 'task' },
            { id: 'S2', name: 'Validate', type: 'decision' }
          ],
          flows: [{ from: 'S1', to: 'S2' }]
        }
      });

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.createProcessMap(mockProcess);

      expect(result).toBeDefined();
      expect(result.process.name).toBe('User Registration');
      expect(result.process.steps).toHaveLength(2);
    });
  });

  describe('analyzeStakeholders', () => {
    const mockProject = 'E-commerce Platform';

    it('should identify and analyze stakeholders', async () => {
      const mockResponse = JSON.stringify({
        stakeholders: [
          {
            name: 'End Users',
            type: 'external',
            influence: 'high',
            interest: 'high',
            needs: ['Easy to use'],
            communicationPlan: 'Regular surveys'
          }
        ]
      });

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.analyzeStakeholders(mockProject);

      expect(result).toBeDefined();
      expect(result.stakeholders).toHaveLength(1);
      expect(result.stakeholders[0].name).toBe('End Users');
      expect(result.stakeholders[0].influence).toBe('high');
    });
  });

  describe('generateAcceptanceCriteria', () => {
    const mockUserStory = {
      id: 'US001',
      asA: 'user',
      iWant: 'to login',
      soThat: 'I can access my account'
    };

    it('should generate acceptance criteria for a user story', async () => {
      const mockResponse = JSON.stringify([
        {
          given: 'I am on the login page',
          when: 'I enter valid credentials',
          then: 'I should be logged in'
        }
      ]);

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.generateAcceptanceCriteria(mockUserStory);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0].given).toBe('I am on the login page');
    });
  });

  describe('assessRisks', () => {
    const mockRequirements = {
      functionalRequirements: [{ id: 'FR001', description: 'Payment processing' }]
    };

    it('should assess risks for requirements', async () => {
      const mockResponse = JSON.stringify({
        risks: [
          {
            id: 'R001',
            description: 'Payment gateway failure',
            probability: 'medium',
            impact: 'high',
            mitigation: 'Implement fallback gateway'
          }
        ],
        overallRiskLevel: 'medium'
      });

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.assessRisks(mockRequirements);

      expect(result).toBeDefined();
      expect(result.risks).toHaveLength(1);
      expect(result.risks[0].id).toBe('R001');
      expect(result.overallRiskLevel).toBe('medium');
    });
  });

  describe('generateUseCases', () => {
    const mockRequirements = {
      functionalRequirements: [{ id: 'FR001', description: 'User authentication' }]
    };

    it('should generate use cases from requirements', async () => {
      const mockResponse = JSON.stringify([
        {
          id: 'UC001',
          name: 'Login',
          actor: 'User',
          description: 'User logs into the system',
          preconditions: ['User has account'],
          mainFlow: ['Enter credentials', 'Validate', 'Grant access'],
          alternativeFlows: ['Invalid credentials'],
          postconditions: ['User is authenticated']
        }
      ]);

      mockModelManager.generateResponse.mockResolvedValue(mockResponse);

      const result = await agent.generateUseCases(mockRequirements);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('UC001');
      expect(result[0].actor).toBe('User');
    });
  });

  describe('validateRequirements', () => {
    const mockRequirements = {
      functionalRequirements: [
        { id: 'FR001', description: 'User login', priority: 'high' }
      ],
      nonFunctionalRequirements: [
        { id: 'NFR001', category: 'performance', description: 'Response time < 2s' }
      ]
    };

    it('should validate requirements successfully', async () => {
      const result = await agent.validateRequirements(mockRequirements);

      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.completeness).toBeGreaterThan(0);
      expect(result.issues).toEqual([]);
    });

    it('should identify validation issues', async () => {
      const incompleteReqs = {
        functionalRequirements: [
          { id: '', description: '', priority: undefined }
        ]
      };

      const result = await agent.validateRequirements(incompleteReqs);

      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues).toContain('Functional requirement missing ID');
    });

    it('should calculate SMART score', async () => {
      const result = await agent.validateRequirements(mockRequirements);

      expect(result.smartScore).toBeDefined();
      expect(result.smartScore.specific).toBeGreaterThanOrEqual(0);
      expect(result.smartScore.measurable).toBeGreaterThanOrEqual(0);
      expect(result.smartScore.achievable).toBeGreaterThanOrEqual(0);
      expect(result.smartScore.relevant).toBeGreaterThanOrEqual(0);
      expect(result.smartScore.timeBound).toBeGreaterThanOrEqual(0);
    });
  });

  describe('exportToMarkdown', () => {
    const mockAnalysis = {
      functionalRequirements: [
        { id: 'FR001', description: 'User login', priority: 'high' }
      ],
      nonFunctionalRequirements: [
        { id: 'NFR001', category: 'security', description: 'Encrypt data' }
      ],
      userStories: [
        { id: 'US001', title: 'Login Story', asA: 'user', iWant: 'to login', soThat: 'access' }
      ]
    };

    it('should export analysis to markdown format', () => {
      const markdown = agent.exportToMarkdown(mockAnalysis);

      expect(markdown).toContain('# Requirements Analysis');
      expect(markdown).toContain('## Functional Requirements');
      expect(markdown).toContain('FR001');
      expect(markdown).toContain('User login');
      expect(markdown).toContain('## Non-Functional Requirements');
      expect(markdown).toContain('NFR001');
      expect(markdown).toContain('## User Stories');
      expect(markdown).toContain('US001');
    });

    it('should handle empty analysis', () => {
      const markdown = agent.exportToMarkdown({});

      expect(markdown).toContain('# Requirements Analysis');
      expect(markdown).not.toContain('undefined');
    });
  });
});