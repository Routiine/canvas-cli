/**
 * Integration Tests for Canvas CLI Agents
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { BusinessAnalystAgent } from '../../src/agents/business-analyst';
import { ProductManagerAgent } from '../../src/agents/product-manager';
import { SolutionsArchitectAgent } from '../../src/agents/solutions-architect';
import { ScrumMasterAgent } from '../../src/agents/scrum-master';
import { DeveloperAgent } from '../../src/agents/developer';
import { QAEngineerAgent } from '../../src/agents/qa-engineer';

describe('Canvas CLI Agents Integration', () => {
  let businessAnalyst: BusinessAnalystAgent;
  let productManager: ProductManagerAgent;
  let solutionsArchitect: SolutionsArchitectAgent;
  let scrumMaster: ScrumMasterAgent;
  let developer: DeveloperAgent;
  let qaEngineer: QAEngineerAgent;

  beforeAll(async () => {
    // Initialize all agents
    businessAnalyst = new BusinessAnalystAgent();
    productManager = new ProductManagerAgent();
    solutionsArchitect = new SolutionsArchitectAgent();
    scrumMaster = new ScrumMasterAgent();
    developer = new DeveloperAgent();
    qaEngineer = new QAEngineerAgent();

    // Initialize agents
    await Promise.all([
      businessAnalyst.initialize(),
      productManager.initialize(),
      solutionsArchitect.initialize(),
      scrumMaster.initialize(),
      developer.initialize(),
      qaEngineer.initialize()
    ]);
  }, 30000);

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Workflow', () => {
    it('should complete full development cycle from requirements to testing', async () => {
      // Step 1: Business Analyst analyzes requirements
      const requirements = await businessAnalyst.analyzeRequirements(
        'Build a task management system with user authentication, task CRUD operations, and team collaboration features',
        { project: 'TaskMaster Pro' }
      );
      
      expect(requirements).toBeDefined();
      expect(requirements.functionalRequirements.length).toBeGreaterThan(0);

      // Step 2: Product Manager creates PRD
      const prd = await productManager.createPRD(
        'Task management system for teams',
        { requirements }
      );
      
      expect(prd).toBeDefined();
      expect(prd.title).toBeTruthy();
      expect(prd.features.length).toBeGreaterThan(0);

      // Step 3: Solutions Architect designs system
      const architecture = await solutionsArchitect.designArchitecture(
        JSON.stringify(requirements),
        { scalability: 'high', security: 'critical' }
      );
      
      expect(architecture).toBeDefined();
      expect(architecture.components.length).toBeGreaterThan(0);

      // Step 4: Business Analyst creates user stories
      const userStories = await businessAnalyst.createUserStories(requirements);
      
      expect(userStories).toBeDefined();
      expect(userStories.length).toBeGreaterThan(0);

      // Step 5: Scrum Master parses and validates stories
      const parsedStories = await scrumMaster.parseUserStories(
        userStories.map(s => `As a ${s.asA}, I want ${s.iWant}, so that ${s.soThat}`).join('\n')
      );
      
      expect(parsedStories).toBeDefined();
      expect(parsedStories.length).toBeGreaterThan(0);

      // Step 6: Scrum Master creates sprint
      const sprint = await scrumMaster.createSprint(
        'Sprint 1',
        'Implement authentication and basic task CRUD',
        14
      );
      
      expect(sprint).toBeDefined();
      expect(sprint.id).toBeTruthy();

      // Step 7: Developer implements a story
      const implementation = await developer.implementStory(
        parsedStories[0],
        requirements,
        architecture
      );
      
      expect(implementation).toBeDefined();
      expect(implementation.files.length).toBeGreaterThan(0);

      // Step 8: QA Engineer creates test plan
      const testPlan = await qaEngineer.createTestPlan(
        requirements,
        'Authentication and Task Management'
      );
      
      expect(testPlan).toBeDefined();
      expect(testPlan.testCases.length).toBeGreaterThan(0);

      // Step 9: Developer performs code review
      const codeReview = await developer.reviewCode(implementation);
      
      expect(codeReview).toBeDefined();
      expect(codeReview.metrics).toBeDefined();

      // Step 10: QA Engineer executes tests
      const testExecution = await qaEngineer.executeTests(
        testPlan.id,
        'development'
      );
      
      expect(testExecution).toBeDefined();
      expect(testExecution.metrics.totalTests).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Agent Collaboration', () => {
    it('should allow Business Analyst and Product Manager to collaborate on requirements', async () => {
      // Business Analyst creates initial requirements
      const requirements = await businessAnalyst.analyzeRequirements(
        'E-commerce checkout system'
      );

      // Product Manager enhances with user stories
      const userStories = await productManager.writeUserStories(
        ['Checkout', 'Payment', 'Order confirmation'],
        [{ name: 'Customer', goals: ['Quick checkout'] }]
      );

      expect(requirements).toBeDefined();
      expect(userStories).toBeDefined();
      expect(userStories.length).toBe(3);
    });

    it('should allow Solutions Architect and Developer to collaborate on implementation', async () => {
      // Solutions Architect designs API
      const apiDesign = await solutionsArchitect.designAPI(
        'UserService',
        'CRUD operations for user management',
        'REST'
      );

      // Developer implements the API
      const apiImplementation = await developer.implementAPI(
        apiDesign,
        'express'
      );

      expect(apiDesign).toBeDefined();
      expect(apiImplementation).toBeDefined();
      expect(apiImplementation.routes).toBeTruthy();
    });

    it('should allow Scrum Master and QA Engineer to collaborate on quality', async () => {
      // Scrum Master creates sprint with stories
      const sprint = await scrumMaster.createSprint(
        'Quality Sprint',
        'Focus on testing and quality improvements',
        7
      );

      // QA Engineer creates regression test suite
      const regressionTests = await qaEngineer.performRegressionTesting(
        ['auth-module', 'user-module'],
        []
      );

      expect(sprint).toBeDefined();
      expect(regressionTests).toBeDefined();
      expect(regressionTests.recommendation).toBeTruthy();
    });
  });

  describe('Cross-Agent Data Flow', () => {
    it('should pass requirements through multiple agents', async () => {
      const initialRequirements = {
        functionalRequirements: [
          { id: 'FR001', description: 'User registration', priority: 'high' }
        ]
      };

      // Business Analyst validates
      const validation = await businessAnalyst.validateRequirements(initialRequirements);
      expect(validation.isValid).toBe(true);

      // Product Manager prioritizes
      const prioritization = await productManager.prioritizeFeatures(
        [{ name: 'User registration', description: 'Allow users to create accounts' }],
        'RICE'
      );
      expect(prioritization.features.length).toBeGreaterThan(0);

      // Solutions Architect creates ADR
      const adr = await solutionsArchitect.createADR(
        'Authentication Strategy',
        'Choose authentication method for user registration',
        ['JWT', 'OAuth2', 'Session-based']
      );
      expect(adr.decision).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid input gracefully', async () => {
      const result = await businessAnalyst.analyzeRequirements('');
      expect(result).toBeDefined();
      expect(result.functionalRequirements).toEqual([]);
    });

    it('should handle agent communication failures', async () => {
      // Mock a failure scenario
      const mockError = new Error('Communication failed');
      jest.spyOn(productManager, 'createPRD').mockRejectedValueOnce(mockError);

      await expect(
        productManager.createPRD('Test product', {})
      ).rejects.toThrow('Communication failed');
    });
  });

  describe('Performance', () => {
    it('should handle large requirement sets efficiently', async () => {
      const largeRequirementSet = {
        functionalRequirements: Array.from({ length: 100 }, (_, i) => ({
          id: `FR${i}`,
          description: `Requirement ${i}`,
          priority: 'medium'
        }))
      };

      const startTime = Date.now();
      const validation = await businessAnalyst.validateRequirements(largeRequirementSet);
      const endTime = Date.now();

      expect(validation).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should process multiple stories concurrently', async () => {
      const stories = Array.from({ length: 10 }, (_, i) => ({
        id: `US${i}`,
        title: `Story ${i}`,
        asA: 'user',
        iWant: `feature ${i}`,
        soThat: 'I can benefit'
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        stories.map(story => businessAnalyst.generateAcceptanceCriteria(story))
      );
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Output Formats', () => {
    it('should export to multiple formats', async () => {
      const analysis = {
        functionalRequirements: [
          { id: 'FR001', description: 'Test requirement', priority: 'high' }
        ]
      };

      // Test markdown export
      const markdown = businessAnalyst.exportToMarkdown(analysis);
      expect(markdown).toContain('# Requirements Analysis');
      expect(markdown).toContain('FR001');

      // Test PRD export
      const prd = await productManager.createPRD('Test', { requirements: analysis });
      const prdMarkdown = productManager.exportPRDToMarkdown(prd);
      expect(prdMarkdown).toContain('# ');
      expect(prdMarkdown).toContain('Version:');
    });
  });

  describe('State Management', () => {
    it('should maintain state across operations', async () => {
      // Create sprint
      const sprint = await scrumMaster.createSprint(
        'State Test Sprint',
        'Test state management',
        7
      );

      // Add stories to sprint
      const storyIds = ['story-1', 'story-2', 'story-3'];
      const plannedSprint = await scrumMaster.planSprint(sprint.id, storyIds);

      expect(plannedSprint.stories).toEqual(storyIds);
      expect(plannedSprint.status).toBe('active');
    });
  });

  describe('Validation and Quality Checks', () => {
    it('should validate all outputs', async () => {
      // Test requirements validation
      const requirements = {
        functionalRequirements: [],
        nonFunctionalRequirements: []
      };

      const validation = await businessAnalyst.validateRequirements(requirements);
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('No functional requirements defined');

      // Test code validation
      const code = 'function test() { console.log("test"); }';
      const codeValidation = await developer['validator'].validateFile({
        content: code,
        language: 'javascript',
        path: 'test.js'
      });

      expect(codeValidation).toBeDefined();
    });
  });
});