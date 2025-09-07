/**
 * QA Engineer Agent
 * Manages testing strategies, test automation, and quality assurance
 */

import { EventEmitter } from 'events';
import { z } from 'zod';
import chalk from 'chalk';
import { AgentConfigurationSystem } from './config/agent-config.js';
import { PromptTemplateSystem } from './config/prompt-templates.js';
import { ModelManager } from '../models/model-manager.js';

// Test Plan Schema
export const TestPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  scope: z.string(),
  objectives: z.array(z.string()),
  
  strategy: z.object({
    approach: z.enum(['risk-based', 'requirement-based', 'exploratory', 'hybrid']),
    levels: z.array(z.enum(['unit', 'integration', 'system', 'acceptance', 'performance', 'security'])),
    types: z.array(z.enum(['functional', 'non-functional', 'regression', 'smoke', 'sanity'])),
    techniques: z.array(z.string())
  }),
  
  testCases: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    type: z.enum(['functional', 'integration', 'e2e', 'performance', 'security', 'usability']),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    preconditions: z.array(z.string()),
    steps: z.array(z.object({
      action: z.string(),
      expectedResult: z.string(),
      data: z.any().optional()
    })),
    postconditions: z.array(z.string()).optional(),
    testData: z.any().optional(),
    automatable: z.boolean(),
    estimatedDuration: z.string().optional()
  })),
  
  coverage: z.object({
    requirements: z.array(z.object({
      requirementId: z.string(),
      testCases: z.array(z.string()),
      covered: z.boolean()
    })),
    targetCoverage: z.number(),
    currentCoverage: z.number().optional()
  }),
  
  environments: z.array(z.object({
    name: z.string(),
    type: z.enum(['development', 'staging', 'production', 'test']),
    configuration: z.record(z.any()),
    browsers: z.array(z.string()).optional(),
    devices: z.array(z.string()).optional()
  })),
  
  resources: z.object({
    team: z.array(z.object({
      role: z.string(),
      count: z.number(),
      skills: z.array(z.string())
    })),
    tools: z.array(z.object({
      name: z.string(),
      purpose: z.string(),
      license: z.string().optional()
    })),
    timeline: z.object({
      startDate: z.string(),
      endDate: z.string(),
      milestones: z.array(z.object({
        name: z.string(),
        date: z.string(),
        deliverables: z.array(z.string())
      }))
    })
  }),
  
  risks: z.array(z.object({
    description: z.string(),
    probability: z.enum(['low', 'medium', 'high']),
    impact: z.enum(['low', 'medium', 'high', 'critical']),
    mitigation: z.string()
  })),
  
  exitCriteria: z.array(z.string()),
  deliverables: z.array(z.string())
});

export type TestPlan = z.infer<typeof TestPlanSchema>;

// Test Execution Schema
export const TestExecutionSchema = z.object({
  id: z.string(),
  testPlanId: z.string(),
  executionDate: z.string(),
  environment: z.string(),
  
  results: z.array(z.object({
    testCaseId: z.string(),
    status: z.enum(['passed', 'failed', 'blocked', 'skipped', 'in-progress']),
    actualResult: z.string().optional(),
    executionTime: z.number(),
    screenshots: z.array(z.string()).optional(),
    logs: z.array(z.string()).optional(),
    defects: z.array(z.object({
      id: z.string(),
      severity: z.enum(['critical', 'major', 'minor', 'trivial']),
      description: z.string()
    })).optional()
  })),
  
  metrics: z.object({
    totalTests: z.number(),
    passed: z.number(),
    failed: z.number(),
    blocked: z.number(),
    skipped: z.number(),
    passRate: z.number(),
    executionTime: z.number(),
    defectsFound: z.number()
  }),
  
  summary: z.string(),
  recommendations: z.array(z.string())
});

export type TestExecution = z.infer<typeof TestExecutionSchema>;

// Bug Report Schema
export const BugReportSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['critical', 'major', 'minor', 'trivial']),
  priority: z.enum(['urgent', 'high', 'medium', 'low']),
  status: z.enum(['new', 'open', 'in-progress', 'resolved', 'closed', 'rejected']),
  
  environment: z.object({
    os: z.string(),
    browser: z.string().optional(),
    version: z.string(),
    device: z.string().optional()
  }),
  
  stepsToReproduce: z.array(z.string()),
  expectedBehavior: z.string(),
  actualBehavior: z.string(),
  
  attachments: z.array(z.object({
    type: z.enum(['screenshot', 'video', 'log', 'other']),
    url: z.string(),
    description: z.string().optional()
  })).optional(),
  
  metadata: z.object({
    reportedBy: z.string(),
    reportedDate: z.string(),
    assignedTo: z.string().optional(),
    resolvedDate: z.string().optional(),
    testCaseId: z.string().optional(),
    affectedComponent: z.string().optional(),
    affectedVersion: z.string(),
    fixVersion: z.string().optional()
  })
});

export type BugReport = z.infer<typeof BugReportSchema>;

/**
 * QA Engineer Agent Implementation
 */
export class QAEngineerAgent extends EventEmitter {
  private configSystem: AgentConfigurationSystem;
  private templateSystem: PromptTemplateSystem;
  private modelManager: ModelManager;
  private agentId = 'qa-engineer';
  
  private testPlans: Map<string, TestPlan> = new Map();
  private executions: Map<string, TestExecution> = new Map();
  private bugs: Map<string, BugReport> = new Map();
  
  constructor() {
    super();
    this.configSystem = new AgentConfigurationSystem();
    this.templateSystem = new PromptTemplateSystem();
    this.modelManager = new ModelManager();
  }
  
  async initialize(): Promise<void> {
    await this.configSystem.initialize();
    await this.templateSystem.initialize();
    await this.ensureQAConfig();
    
    this.emit('initialized', { agent: this.agentId });
  }
  
  /**
   * Create test plan from requirements
   */
  async createTestPlan(
    requirements: any,
    scope: string,
    strategy?: any
  ): Promise<TestPlan> {
    console.log(chalk.cyan('📋 Creating test plan...'));
    
    // Generate test cases
    const testCases = await this.generateTestCases(requirements);
    
    // Analyze coverage
    const coverage = this.analyzeCoverage(requirements, testCases);
    
    // Identify risks
    const risks = await this.identifyRisks(requirements, scope);
    
    const testPlan: TestPlan = {
      id: `test-plan-${Date.now()}`,
      title: `Test Plan for ${scope}`,
      scope,
      objectives: [
        'Verify all functional requirements are met',
        'Ensure system stability and performance',
        'Validate user experience and usability',
        'Identify and document defects'
      ],
      strategy: strategy || {
        approach: 'hybrid',
        levels: ['unit', 'integration', 'system', 'acceptance'],
        types: ['functional', 'regression', 'smoke'],
        techniques: ['boundary-value', 'equivalence-partitioning', 'decision-table']
      },
      testCases,
      coverage,
      environments: await this.defineEnvironments(requirements),
      resources: await this.planResources(testCases.length),
      risks,
      exitCriteria: [
        'All critical test cases pass',
        'No critical defects remain open',
        'Test coverage meets target (>80%)',
        'Performance metrics meet requirements'
      ],
      deliverables: [
        'Test execution report',
        'Defect reports',
        'Test metrics dashboard',
        'Quality assessment report'
      ]
    };
    
    this.testPlans.set(testPlan.id, testPlan);
    this.emit('test-plan-created', { testPlan });
    
    return testPlan;
  }
  
  /**
   * Generate test cases from requirements
   */
  async generateTestCases(requirements: any): Promise<any[]> {
    console.log(chalk.cyan('🧪 Generating test cases...'));
    
    const prompt = this.buildTestCasePrompt(requirements);
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.5,
      maxTokens: 4000,
      format: 'json'
    });
    
    try {
      const cases = JSON.parse(response);
      return Array.isArray(cases) ? cases : [];
    } catch {
      return this.generateDefaultTestCases(requirements);
    }
  }
  
  /**
   * Generate automation scripts
   */
  async generateAutomation(
    testCase: any,
    framework: 'playwright' | 'cypress' | 'selenium' | 'jest' = 'playwright'
  ): Promise<string> {
    console.log(chalk.cyan('🤖 Generating automation script...'));
    
    const prompt = this.buildAutomationPrompt(testCase, framework);
    
    const script = await this.modelManager.generateResponse(prompt, {
      temperature: 0.3,
      maxTokens: 3000,
      format: 'code'
    });
    
    this.emit('automation-generated', { testCase: testCase.id, framework });
    
    return script;
  }
  
  /**
   * Execute test plan
   */
  async executeTests(
    testPlanId: string,
    environment: string,
    testCaseIds?: string[]
  ): Promise<TestExecution> {
    console.log(chalk.cyan('▶️ Executing tests...'));
    
    const testPlan = this.testPlans.get(testPlanId);
    if (!testPlan) {
      throw new Error(`Test plan not found: ${testPlanId}`);
    }
    
    const testCases = testCaseIds 
      ? testPlan.testCases.filter(tc => testCaseIds.includes(tc.id))
      : testPlan.testCases;
    
    const results = await this.runTestCases(testCases, environment);
    
    const metrics = this.calculateMetrics(results);
    
    const execution: TestExecution = {
      id: `exec-${Date.now()}`,
      testPlanId,
      executionDate: new Date().toISOString(),
      environment,
      results,
      metrics,
      summary: this.generateExecutionSummary(metrics),
      recommendations: await this.generateRecommendations(results, metrics)
    };
    
    this.executions.set(execution.id, execution);
    this.emit('tests-executed', { execution });
    
    return execution;
  }
  
  /**
   * Report bug
   */
  async reportBug(
    title: string,
    description: string,
    stepsToReproduce: string[],
    severity: BugReport['severity'] = 'major'
  ): Promise<BugReport> {
    console.log(chalk.cyan('🐛 Reporting bug...'));
    
    const bugReport: BugReport = {
      id: `bug-${Date.now()}`,
      title,
      description,
      severity,
      priority: this.calculatePriority(severity),
      status: 'new',
      environment: {
        os: 'Unknown',
        version: '1.0.0'
      },
      stepsToReproduce,
      expectedBehavior: 'System should work as expected',
      actualBehavior: description,
      metadata: {
        reportedBy: this.agentId,
        reportedDate: new Date().toISOString(),
        affectedVersion: '1.0.0'
      }
    };
    
    this.bugs.set(bugReport.id, bugReport);
    this.emit('bug-reported', { bugReport });
    
    return bugReport;
  }
  
  /**
   * Perform regression testing
   */
  async performRegressionTesting(
    changedComponents: string[],
    testSuite: any[]
  ): Promise<any> {
    console.log(chalk.cyan('🔄 Performing regression testing...'));
    
    // Identify affected test cases
    const affectedTests = await this.identifyAffectedTests(changedComponents, testSuite);
    
    // Prioritize test cases
    const prioritizedTests = this.prioritizeTests(affectedTests);
    
    // Execute regression tests
    const results = await this.runTestCases(prioritizedTests, 'regression');
    
    const analysis = {
      totalTests: prioritizedTests.length,
      passed: results.filter(r => r.status === 'passed').length,
      failed: results.filter(r => r.status === 'failed').length,
      newDefects: results.filter(r => r.defects && r.defects.length > 0).length,
      recommendation: this.generateRegressionRecommendation(results)
    };
    
    this.emit('regression-completed', { analysis });
    
    return analysis;
  }
  
  /**
   * Analyze test coverage
   */
  analyzeCoverage(requirements: any, testCases: any[]): any {
    const coverage = {
      requirements: [] as any[],
      targetCoverage: 80,
      currentCoverage: 0
    };
    
    // Map requirements to test cases
    const reqArray = Array.isArray(requirements) ? requirements : [requirements];
    
    for (const req of reqArray) {
      const coveredTests = testCases.filter(tc => 
        tc.description?.includes(req.id || req.title || '')
      );
      
      coverage.requirements.push({
        requirementId: req.id || req.title || 'unknown',
        testCases: coveredTests.map(tc => tc.id),
        covered: coveredTests.length > 0
      });
    }
    
    // Calculate coverage percentage
    const coveredCount = coverage.requirements.filter(r => r.covered).length;
    coverage.currentCoverage = (coveredCount / Math.max(coverage.requirements.length, 1)) * 100;
    
    return coverage;
  }
  
  /**
   * Generate performance tests
   */
  async generatePerformanceTests(
    scenario: string,
    targetMetrics: any
  ): Promise<any> {
    console.log(chalk.cyan('⚡ Generating performance tests...'));
    
    const prompt = `Generate performance test scenarios for: ${scenario}
Target metrics: ${JSON.stringify(targetMetrics, null, 2)}

Include:
1. Load testing scenarios
2. Stress testing scenarios
3. Spike testing scenarios
4. Endurance testing scenarios
5. Volume testing scenarios

Format as structured test cases.`;
    
    const response = await this.modelManager.generateResponse(prompt, {
      temperature: 0.5,
      maxTokens: 3000
    });
    
    this.emit('performance-tests-generated', { scenario });
    
    return response;
  }
  
  /**
   * Generate security tests
   */
  async generateSecurityTests(
    application: string,
    scope: string[]
  ): Promise<any> {
    console.log(chalk.cyan('🔒 Generating security tests...'));
    
    const securityTests = {
      authentication: [
        'Test invalid credentials',
        'Test SQL injection in login',
        'Test session timeout',
        'Test password complexity requirements'
      ],
      authorization: [
        'Test role-based access control',
        'Test privilege escalation',
        'Test direct object references'
      ],
      dataValidation: [
        'Test XSS attacks',
        'Test input validation',
        'Test file upload vulnerabilities'
      ],
      configuration: [
        'Test secure headers',
        'Test HTTPS enforcement',
        'Test error message disclosure'
      ]
    };
    
    this.emit('security-tests-generated', { application });
    
    return securityTests;
  }
  
  /**
   * Build test case generation prompt
   */
  private buildTestCasePrompt(requirements: any): string {
    return `Generate comprehensive test cases for the following requirements:

${JSON.stringify(requirements, null, 2)}

For each test case, provide:
1. Unique ID
2. Title
3. Description
4. Type (functional, integration, e2e, etc.)
5. Priority (critical, high, medium, low)
6. Preconditions
7. Test steps with expected results
8. Whether it's automatable

Format as JSON array of test cases.`;
  }
  
  /**
   * Build automation script prompt
   */
  private buildAutomationPrompt(testCase: any, framework: string): string {
    return `Generate a ${framework} automation script for the following test case:

${JSON.stringify(testCase, null, 2)}

The script should:
1. Set up necessary preconditions
2. Execute all test steps
3. Verify expected results
4. Clean up after execution
5. Include proper error handling
6. Add meaningful assertions

Use ${framework} best practices and modern async/await syntax.`;
  }
  
  /**
   * Generate default test cases
   */
  private generateDefaultTestCases(requirements: any): any[] {
    const testCases = [];
    const types = ['functional', 'integration', 'e2e'];
    const priorities = ['critical', 'high', 'medium', 'low'];
    
    // Generate basic test cases
    for (let i = 0; i < 5; i++) {
      testCases.push({
        id: `tc-${Date.now()}-${i}`,
        title: `Test Case ${i + 1}`,
        description: `Verify requirement ${i + 1}`,
        type: types[i % types.length],
        priority: priorities[i % priorities.length],
        preconditions: ['System is accessible', 'User is logged in'],
        steps: [
          {
            action: 'Navigate to feature',
            expectedResult: 'Feature loads successfully'
          },
          {
            action: 'Perform action',
            expectedResult: 'Action completes without errors'
          }
        ],
        automatable: true
      });
    }
    
    return testCases;
  }
  
  /**
   * Define test environments
   */
  private async defineEnvironments(requirements: any): Promise<any[]> {
    return [
      {
        name: 'Development',
        type: 'development',
        configuration: {
          url: 'http://localhost:3000',
          database: 'dev_db',
          apiUrl: 'http://localhost:3001'
        },
        browsers: ['Chrome', 'Firefox']
      },
      {
        name: 'Staging',
        type: 'staging',
        configuration: {
          url: 'https://staging.example.com',
          database: 'staging_db',
          apiUrl: 'https://api-staging.example.com'
        },
        browsers: ['Chrome', 'Firefox', 'Safari', 'Edge']
      }
    ];
  }
  
  /**
   * Plan resources for testing
   */
  private async planResources(testCount: number): Promise<any> {
    const daysNeeded = Math.ceil(testCount / 20); // 20 tests per day
    
    return {
      team: [
        {
          role: 'QA Lead',
          count: 1,
          skills: ['Test planning', 'Risk analysis', 'Team management']
        },
        {
          role: 'QA Engineer',
          count: Math.ceil(testCount / 50),
          skills: ['Manual testing', 'Test automation', 'Bug reporting']
        }
      ],
      tools: [
        {
          name: 'Test Management Tool',
          purpose: 'Test case management and execution tracking'
        },
        {
          name: 'Automation Framework',
          purpose: 'Automated test execution'
        },
        {
          name: 'Bug Tracking System',
          purpose: 'Defect management'
        }
      ],
      timeline: {
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + daysNeeded * 24 * 60 * 60 * 1000).toISOString(),
        milestones: [
          {
            name: 'Test Plan Approval',
            date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            deliverables: ['Approved test plan']
          },
          {
            name: 'Test Execution Complete',
            date: new Date(Date.now() + (daysNeeded - 1) * 24 * 60 * 60 * 1000).toISOString(),
            deliverables: ['Test execution report']
          }
        ]
      }
    };
  }
  
  /**
   * Identify risks in testing
   */
  private async identifyRisks(requirements: any, scope: string): Promise<any[]> {
    return [
      {
        description: 'Incomplete requirements may lead to missing test coverage',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Regular requirement reviews and clarification sessions'
      },
      {
        description: 'Limited time for testing may affect quality',
        probability: 'high',
        impact: 'high',
        mitigation: 'Prioritize critical test cases and automate regression tests'
      },
      {
        description: 'Environment instability may block testing',
        probability: 'low',
        impact: 'critical',
        mitigation: 'Maintain backup environments and have rollback procedures'
      }
    ];
  }
  
  /**
   * Run test cases (simulated)
   */
  private async runTestCases(testCases: any[], environment: string): Promise<any[]> {
    const results = [];
    
    for (const testCase of testCases) {
      // Simulate test execution
      const passed = Math.random() > 0.2; // 80% pass rate
      
      results.push({
        testCaseId: testCase.id,
        status: passed ? 'passed' : 'failed',
        actualResult: passed ? 'Test passed successfully' : 'Test failed with errors',
        executionTime: Math.floor(Math.random() * 5000) + 1000, // 1-6 seconds
        defects: passed ? undefined : [{
          id: `defect-${Date.now()}`,
          severity: 'major',
          description: 'Functionality not working as expected'
        }]
      });
    }
    
    return results;
  }
  
  /**
   * Calculate test execution metrics
   */
  private calculateMetrics(results: any[]): any {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const blocked = results.filter(r => r.status === 'blocked').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    
    return {
      totalTests: total,
      passed,
      failed,
      blocked,
      skipped,
      passRate: (passed / Math.max(total, 1)) * 100,
      executionTime: results.reduce((sum, r) => sum + (r.executionTime || 0), 0),
      defectsFound: results.filter(r => r.defects && r.defects.length > 0).length
    };
  }
  
  /**
   * Generate execution summary
   */
  private generateExecutionSummary(metrics: any): string {
    return `Test execution completed with ${metrics.passRate.toFixed(1)}% pass rate. ` +
           `${metrics.passed} tests passed, ${metrics.failed} failed. ` +
           `${metrics.defectsFound} defects identified. ` +
           `Total execution time: ${(metrics.executionTime / 1000).toFixed(1)} seconds.`;
  }
  
  /**
   * Generate recommendations based on results
   */
  private async generateRecommendations(results: any[], metrics: any): Promise<string[]> {
    const recommendations = [];
    
    if (metrics.passRate < 80) {
      recommendations.push('Investigate failing tests and fix critical issues before release');
    }
    
    if (metrics.defectsFound > 5) {
      recommendations.push('High defect count indicates quality issues - consider additional development time');
    }
    
    const criticalFailures = results.filter(r => 
      r.status === 'failed' && r.defects?.some((d: any) => d.severity === 'critical')
    );
    
    if (criticalFailures.length > 0) {
      recommendations.push(`Address ${criticalFailures.length} critical defects immediately`);
    }
    
    return recommendations;
  }
  
  /**
   * Calculate bug priority based on severity
   */
  private calculatePriority(severity: BugReport['severity']): BugReport['priority'] {
    const priorityMap = {
      'critical': 'urgent',
      'major': 'high',
      'minor': 'medium',
      'trivial': 'low'
    };
    return priorityMap[severity] as BugReport['priority'];
  }
  
  /**
   * Identify affected tests from code changes
   */
  private async identifyAffectedTests(components: string[], testSuite: any[]): Promise<any[]> {
    // Simple implementation - in reality would use impact analysis
    return testSuite.filter(test => 
      components.some(component => 
        test.description?.includes(component) || 
        test.title?.includes(component)
      )
    );
  }
  
  /**
   * Prioritize test cases
   */
  private prioritizeTests(tests: any[]): any[] {
    // Sort by priority
    const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
    
    return tests.sort((a, b) => {
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] || 4;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] || 4;
      return aPriority - bPriority;
    });
  }
  
  /**
   * Generate regression testing recommendation
   */
  private generateRegressionRecommendation(results: any[]): string {
    const failureRate = results.filter(r => r.status === 'failed').length / results.length;
    
    if (failureRate > 0.2) {
      return 'High failure rate detected - recommend full regression cycle';
    } else if (failureRate > 0.1) {
      return 'Moderate issues found - fix and retest failed areas';
    } else {
      return 'Regression testing passed - safe to proceed';
    }
  }
  
  /**
   * Ensure QA configuration exists
   */
  private async ensureQAConfig(): Promise<void> {
    const config = this.configSystem.getConfiguration(this.agentId);
    if (!config) {
      await this.configSystem.createConfiguration({
        id: 'qa-engineer',
        name: 'QA Engineer Agent',
        description: 'Manages testing strategies, test automation, and quality assurance',
        version: '1.0.0',
        enabled: true,
        role: {
          title: 'Senior QA Engineer',
          department: 'Quality Assurance',
          level: 'senior',
          expertise: [
            'Test Planning',
            'Test Automation',
            'Manual Testing',
            'Performance Testing',
            'Security Testing',
            'Defect Management'
          ]
        },
        behavior: {
          temperature: 0.5,
          maxTokens: 4000,
          topP: 0.9,
          frequencyPenalty: 0,
          presencePenalty: 0,
          responseStyle: 'detailed',
          personality: {
            traits: ['detail-oriented', 'systematic', 'thorough', 'quality-focused'],
            communicationStyle: 'Clear and precise with focus on quality metrics',
            decisionMaking: 'Risk-based with emphasis on coverage and quality'
          }
        },
        prompts: {
          system: `You are a Senior QA Engineer with expertise in comprehensive testing strategies.
Your role is to:
1. Create detailed test plans and test cases
2. Design and implement test automation
3. Perform thorough testing across all levels
4. Identify and document defects clearly
5. Ensure quality standards are met
6. Provide quality metrics and recommendations

Focus on risk-based testing, comprehensive coverage, and continuous quality improvement.`,
          taskPrefix: 'As a Senior QA Engineer, I will:',
          taskSuffix: 'Ensuring comprehensive quality assurance and defect prevention.'
        },
        capabilities: {
          actions: [
            'test_planning',
            'test_case_design',
            'test_automation',
            'defect_management',
            'performance_testing',
            'security_testing',
            'regression_testing'
          ],
          tools: ['selenium', 'playwright', 'cypress', 'jest', 'jmeter', 'postman'],
          outputFormats: ['json', 'markdown', 'html', 'xml'],
          maxIterations: 3
        },
        integrations: {
          requiresApproval: false,
          canCallOtherAgents: true,
          allowedAgents: ['developer', 'product-manager', 'scrum-master']
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
  
  /**
   * Export test results
   */
  exportResults(executionId: string, format: 'json' | 'html' | 'junit' = 'json'): string {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    
    switch (format) {
      case 'html':
        return this.exportToHTML(execution);
      case 'junit':
        return this.exportToJUnit(execution);
      case 'json':
      default:
        return JSON.stringify(execution, null, 2);
    }
  }
  
  /**
   * Export to HTML format
   */
  private exportToHTML(execution: TestExecution): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>Test Execution Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f0f0f0; padding: 15px; border-radius: 5px; }
    .passed { color: green; }
    .failed { color: red; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Test Execution Report</h1>
  <div class="summary">
    <h2>Summary</h2>
    <p>${execution.summary}</p>
    <p>Pass Rate: <span class="${execution.metrics.passRate >= 80 ? 'passed' : 'failed'}">${execution.metrics.passRate.toFixed(1)}%</span></p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Test Case</th>
        <th>Status</th>
        <th>Execution Time</th>
      </tr>
    </thead>
    <tbody>
      ${execution.results.map(r => `
        <tr>
          <td>${r.testCaseId}</td>
          <td class="${r.status}">${r.status}</td>
          <td>${r.executionTime}ms</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;
  }
  
  /**
   * Export to JUnit XML format
   */
  private exportToJUnit(execution: TestExecution): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Test Execution" tests="${execution.metrics.totalTests}" failures="${execution.metrics.failed}" time="${execution.metrics.executionTime}">
  <testsuite name="Test Suite" tests="${execution.metrics.totalTests}" failures="${execution.metrics.failed}">
    ${execution.results.map(r => `
    <testcase name="${r.testCaseId}" time="${r.executionTime}">
      ${r.status === 'failed' ? `<failure message="${r.actualResult || 'Test failed'}"/>` : ''}
    </testcase>`).join('')}
  </testsuite>
</testsuites>`;
  }
}

// Export singleton instance
export const qaEngineerAgent = new QAEngineerAgent();