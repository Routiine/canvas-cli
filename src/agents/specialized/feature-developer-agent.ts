import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

interface FeatureRequirement {
  id: string;
  title: string;
  description: string;
  type: 'functional' | 'non-functional' | 'technical';
  priority: 'critical' | 'high' | 'medium' | 'low';
  acceptanceCriteria: string[];
  dependencies?: string[];
  estimatedEffort?: string;
  tags?: string[];
}

interface FeatureDesign {
  architecture: {
    components: ComponentDesign[];
    dataFlow: DataFlow[];
    apis: APIDesign[];
    database?: DatabaseDesign;
  };
  technicalDecisions: TechnicalDecision[];
  designPatterns: string[];
  securityConsiderations: string[];
  performanceTargets: PerformanceTarget[];
}

interface ComponentDesign {
  name: string;
  type: 'frontend' | 'backend' | 'service' | 'library' | 'database';
  description: string;
  responsibilities: string[];
  interfaces: InterfaceDesign[];
  dependencies: string[];
  location: string;
}

interface DataFlow {
  source: string;
  destination: string;
  dataType: string;
  protocol?: string;
  transformation?: string;
}

interface APIDesign {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description: string;
  requestBody?: any;
  responseBody?: any;
  authentication?: boolean;
  rateLimit?: string;
}

interface DatabaseDesign {
  type: 'sql' | 'nosql' | 'graph' | 'timeseries';
  schemas: SchemaDesign[];
  indexes: string[];
  relationships: string[];
}

interface SchemaDesign {
  name: string;
  fields: FieldDesign[];
  indexes?: string[];
  constraints?: string[];
}

interface FieldDesign {
  name: string;
  type: string;
  required: boolean;
  unique?: boolean;
  default?: any;
  validation?: string;
}

interface InterfaceDesign {
  name: string;
  methods: MethodDesign[];
  events?: string[];
}

interface MethodDesign {
  name: string;
  parameters: ParameterDesign[];
  returnType: string;
  description: string;
}

interface ParameterDesign {
  name: string;
  type: string;
  required: boolean;
  default?: any;
  description?: string;
}

interface TechnicalDecision {
  area: string;
  decision: string;
  rationale: string;
  alternatives?: string[];
  tradeoffs?: string[];
}

interface PerformanceTarget {
  metric: string;
  target: string;
  measurement: string;
}

interface FeatureImplementation {
  files: FileImplementation[];
  tests: TestImplementation[];
  documentation: DocumentationItem[];
  migrations?: MigrationScript[];
  configuration?: ConfigurationChange[];
}

interface FileImplementation {
  path: string;
  type: 'create' | 'modify' | 'delete';
  content?: string;
  language?: string;
  purpose: string;
}

interface TestImplementation {
  path: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance';
  framework: string;
  coverage: number;
  cases: TestCase[];
}

interface TestCase {
  name: string;
  description: string;
  type: 'positive' | 'negative' | 'edge';
  input?: any;
  expectedOutput?: any;
  assertions: string[];
}

interface DocumentationItem {
  type: 'api' | 'user' | 'developer' | 'architecture';
  path: string;
  content: string;
  format: 'markdown' | 'html' | 'jsdoc';
}

interface MigrationScript {
  version: string;
  description: string;
  up: string;
  down: string;
}

interface ConfigurationChange {
  file: string;
  key: string;
  value: any;
  environment?: string;
}

interface FeatureResult {
  id: string;
  status: 'success' | 'partial' | 'failed';
  requirements: FeatureRequirement;
  design: FeatureDesign;
  implementation: FeatureImplementation;
  metrics: {
    filesCreated: number;
    filesModified: number;
    linesOfCode: number;
    testCoverage: number;
    duration: number;
  };
  issues?: string[];
  nextSteps?: string[];
}

export class FeatureDeveloperAgent extends EventEmitter {
  private features: Map<string, FeatureResult> = new Map();
  private templates: Map<string, string> = new Map();
  private patterns: Map<string, string> = new Map();
  
  constructor() {
    super();
    this.initializeTemplates();
    this.initializePatterns();
  }
  
  private initializeTemplates(): void {
    // React component template
    this.templates.set('react-component', `import React from 'react';
import { {{imports}} } from '{{importSource}}';
{{additionalImports}}

interface {{componentName}}Props {
  {{props}}
}

export const {{componentName}}: React.FC<{{componentName}}Props> = ({
  {{propsDestructure}}
}) => {
  {{hooks}}
  
  {{methods}}
  
  return (
    {{jsx}}
  );
};

export default {{componentName}};`);
    
    // Express API endpoint template
    this.templates.set('express-endpoint', `import { Request, Response, NextFunction } from 'express';
{{imports}}

/**
 * {{description}}
 */
export const {{handlerName}} = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    {{validation}}
    
    {{businessLogic}}
    
    res.status({{statusCode}}).json({
      success: true,
      {{responseBody}}
    });
  } catch (error) {
    next(error);
  }
};`);
    
    // Test template
    this.templates.set('jest-test', `import { {{imports}} } from '{{importPath}}';
{{additionalImports}}

describe('{{suiteName}}', () => {
  {{setup}}
  
  {{teardown}}
  
  {{testCases}}
});`);
    
    // Service class template
    this.templates.set('service-class', `{{imports}}

export class {{className}} {
  {{properties}}
  
  constructor({{constructorParams}}) {
    {{constructorBody}}
  }
  
  {{methods}}
}`);
  }
  
  private initializePatterns(): void {
    // Common design patterns
    this.patterns.set('singleton', 'Singleton pattern for global instance management');
    this.patterns.set('factory', 'Factory pattern for object creation');
    this.patterns.set('observer', 'Observer pattern for event-driven architecture');
    this.patterns.set('strategy', 'Strategy pattern for algorithm selection');
    this.patterns.set('adapter', 'Adapter pattern for interface compatibility');
    this.patterns.set('decorator', 'Decorator pattern for extending functionality');
    this.patterns.set('facade', 'Facade pattern for simplified interface');
    this.patterns.set('proxy', 'Proxy pattern for controlled access');
    this.patterns.set('repository', 'Repository pattern for data access abstraction');
    this.patterns.set('mvc', 'Model-View-Controller for separation of concerns');
  }
  
  async develop(requirements: FeatureRequirement, options: {
    autoImplement?: boolean;
    testFirst?: boolean;
    documentationFirst?: boolean;
    framework?: string;
    language?: 'typescript' | 'javascript' | 'python' | 'java';
    style?: 'functional' | 'object-oriented' | 'hybrid';
  } = {}): Promise<FeatureResult> {
    const startTime = Date.now();
    const featureId = requirements.id || crypto.randomUUID();
    
    this.emit('develop:start', { featureId, requirements, options });
    
    try {
      // Phase 1: Analysis and Design
      const design = await this.designFeature(requirements, options);
      this.emit('develop:design-complete', { featureId, design });
      
      // Phase 2: Implementation Planning
      const implementation = await this.planImplementation(requirements, design, options);
      this.emit('develop:plan-complete', { featureId, implementation });
      
      // Phase 3: Code Generation
      if (options.autoImplement !== false) {
        await this.implementFeature(requirements, design, implementation, options);
        this.emit('develop:implementation-complete', { featureId });
      }
      
      // Phase 4: Testing
      if (options.testFirst) {
        await this.implementTests(requirements, design, implementation);
        this.emit('develop:tests-complete', { featureId });
      }
      
      // Phase 5: Documentation
      if (options.documentationFirst || options.autoImplement) {
        await this.generateDocumentation(requirements, design, implementation);
        this.emit('develop:documentation-complete', { featureId });
      }
      
      // Calculate metrics
      const metrics = await this.calculateMetrics(implementation, startTime);
      
      // Create result
      const result: FeatureResult = {
        id: featureId,
        status: 'success',
        requirements,
        design,
        implementation,
        metrics,
        nextSteps: this.generateNextSteps(requirements, design)
      };
      
      // Store result
      this.features.set(featureId, result);
      
      this.emit('develop:complete', result);
      return result;
      
    } catch (error) {
      this.emit('develop:error', { featureId, error });
      throw error;
    }
  }
  
  private async designFeature(requirements: FeatureRequirement, options: any): Promise<FeatureDesign> {
    const design: FeatureDesign = {
      architecture: {
        components: [],
        dataFlow: [],
        apis: [],
        database: undefined
      },
      technicalDecisions: [],
      designPatterns: [],
      securityConsiderations: [],
      performanceTargets: []
    };
    
    // Analyze requirements to determine architecture
    const needsDatabase = this.requiresDatabase(requirements);
    const needsAPI = this.requiresAPI(requirements);
    const needsFrontend = this.requiresFrontend(requirements);
    
    // Design components based on requirements
    if (needsFrontend) {
      design.architecture.components.push({
        name: `${this.camelCase(requirements.title)}Component`,
        type: 'frontend',
        description: `Frontend component for ${requirements.title}`,
        responsibilities: [
          'User interface rendering',
          'User interaction handling',
          'State management',
          'API communication'
        ],
        interfaces: [{
          name: 'Props',
          methods: []
        }],
        dependencies: this.determineFrontendDependencies(options.framework),
        location: `src/components/${this.kebabCase(requirements.title)}`
      });
    }
    
    if (needsAPI) {
      design.architecture.components.push({
        name: `${this.camelCase(requirements.title)}Controller`,
        type: 'backend',
        description: `API controller for ${requirements.title}`,
        responsibilities: [
          'Request validation',
          'Business logic orchestration',
          'Response formatting',
          'Error handling'
        ],
        interfaces: [{
          name: 'Controller',
          methods: this.generateControllerMethods(requirements)
        }],
        dependencies: ['express', 'validation', 'service'],
        location: `src/controllers/${this.kebabCase(requirements.title)}`
      });
      
      // Add service layer
      design.architecture.components.push({
        name: `${this.camelCase(requirements.title)}Service`,
        type: 'service',
        description: `Business logic service for ${requirements.title}`,
        responsibilities: [
          'Business logic implementation',
          'Data transformation',
          'External service integration',
          'Transaction management'
        ],
        interfaces: [{
          name: 'Service',
          methods: this.generateServiceMethods(requirements)
        }],
        dependencies: ['repository', 'utils'],
        location: `src/services/${this.kebabCase(requirements.title)}`
      });
      
      // Design APIs
      design.architecture.apis = this.designAPIs(requirements);
    }
    
    if (needsDatabase) {
      design.architecture.database = {
        type: this.determineDatabaseType(requirements),
        schemas: this.designSchemas(requirements),
        indexes: this.designIndexes(requirements),
        relationships: this.designRelationships(requirements)
      };
      
      // Add repository layer
      design.architecture.components.push({
        name: `${this.camelCase(requirements.title)}Repository`,
        type: 'backend',
        description: `Data access repository for ${requirements.title}`,
        responsibilities: [
          'Database operations',
          'Query optimization',
          'Data mapping',
          'Cache management'
        ],
        interfaces: [{
          name: 'Repository',
          methods: this.generateRepositoryMethods(requirements)
        }],
        dependencies: ['database', 'models'],
        location: `src/repositories/${this.kebabCase(requirements.title)}`
      });
    }
    
    // Design data flow
    design.architecture.dataFlow = this.designDataFlow(design.architecture.components);
    
    // Select design patterns
    design.designPatterns = this.selectDesignPatterns(requirements, design);
    
    // Add technical decisions
    design.technicalDecisions = this.makeTechnicalDecisions(requirements, options);
    
    // Security considerations
    design.securityConsiderations = this.identifySecurityConsiderations(requirements);
    
    // Performance targets
    design.performanceTargets = this.definePerformanceTargets(requirements);
    
    return design;
  }
  
  private async planImplementation(
    requirements: FeatureRequirement,
    design: FeatureDesign,
    options: any
  ): Promise<FeatureImplementation> {
    const implementation: FeatureImplementation = {
      files: [],
      tests: [],
      documentation: [],
      migrations: [],
      configuration: []
    };
    
    // Plan file implementations
    for (const component of design.architecture.components) {
      const filePath = this.getFilePath(component, options.language || 'typescript');
      
      implementation.files.push({
        path: filePath,
        type: 'create',
        content: await this.generateComponentCode(component, design, options),
        language: options.language || 'typescript',
        purpose: component.description
      });
      
      // Add interface files if needed
      if (component.interfaces.length > 0) {
        implementation.files.push({
          path: filePath.replace(/\.(ts|js)$/, '.types.$1'),
          type: 'create',
          content: this.generateInterfaceCode(component.interfaces, options),
          language: options.language || 'typescript',
          purpose: `Type definitions for ${component.name}`
        });
      }
    }
    
    // Plan test implementations
    for (const component of design.architecture.components) {
      const testPath = this.getTestPath(component, options.language || 'typescript');
      
      implementation.tests.push({
        path: testPath,
        type: 'unit',
        framework: options.framework === 'react' ? 'jest' : 'mocha',
        coverage: 80,
        cases: this.generateTestCases(component, requirements)
      });
    }
    
    // Plan API tests
    if (design.architecture.apis.length > 0) {
      implementation.tests.push({
        path: `tests/integration/${this.kebabCase(requirements.title)}.test.ts`,
        type: 'integration',
        framework: 'supertest',
        coverage: 90,
        cases: this.generateAPITestCases(design.architecture.apis)
      });
    }
    
    // Plan documentation
    implementation.documentation.push({
      type: 'developer',
      path: `docs/features/${this.kebabCase(requirements.title)}.md`,
      content: this.generateDeveloperDocumentation(requirements, design),
      format: 'markdown'
    });
    
    if (design.architecture.apis.length > 0) {
      implementation.documentation.push({
        type: 'api',
        path: `docs/api/${this.kebabCase(requirements.title)}.md`,
        content: this.generateAPIDocumentation(design.architecture.apis),
        format: 'markdown'
      });
    }
    
    // Plan database migrations if needed
    if (design.architecture.database) {
      for (const schema of design.architecture.database.schemas) {
        implementation.migrations?.push({
          version: `${Date.now()}_create_${this.snakeCase(schema.name)}`,
          description: `Create ${schema.name} table`,
          up: this.generateMigrationUp(schema),
          down: this.generateMigrationDown(schema)
        });
      }
    }
    
    // Plan configuration changes
    if (needsConfiguration(requirements)) {
      implementation.configuration = this.planConfigurationChanges(requirements, design);
    }
    
    return implementation;
  }
  
  private async implementFeature(
    requirements: FeatureRequirement,
    design: FeatureDesign,
    implementation: FeatureImplementation,
    options: any
  ): Promise<void> {
    // Create directories
    const directories = new Set<string>();
    for (const file of implementation.files) {
      directories.add(path.dirname(file.path));
    }
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    // Write implementation files
    for (const file of implementation.files) {
      if (file.type === 'create' && file.content) {
        await fs.writeFile(file.path, file.content, 'utf-8');
        this.emit('develop:file-created', { path: file.path });
      } else if (file.type === 'modify' && file.content) {
        const existing = await fs.readFile(file.path, 'utf-8');
        const modified = this.mergeCode(existing, file.content);
        await fs.writeFile(file.path, modified, 'utf-8');
        this.emit('develop:file-modified', { path: file.path });
      }
    }
    
    // Write test files
    for (const test of implementation.tests) {
      const testContent = this.generateTestCode(test, options);
      await fs.mkdir(path.dirname(test.path), { recursive: true });
      await fs.writeFile(test.path, testContent, 'utf-8');
      this.emit('develop:test-created', { path: test.path });
    }
    
    // Write documentation
    for (const doc of implementation.documentation) {
      await fs.mkdir(path.dirname(doc.path), { recursive: true });
      await fs.writeFile(doc.path, doc.content, 'utf-8');
      this.emit('develop:documentation-created', { path: doc.path });
    }
    
    // Apply migrations
    if (implementation.migrations && implementation.migrations.length > 0) {
      for (const migration of implementation.migrations) {
        await this.applyMigration(migration);
      }
    }
    
    // Apply configuration changes
    if (implementation.configuration && implementation.configuration.length > 0) {
      for (const config of implementation.configuration) {
        await this.applyConfiguration(config);
      }
    }
  }
  
  private async generateComponentCode(component: ComponentDesign, design: FeatureDesign, options: any): Promise<string> {
    const template = this.getTemplate(component.type, options.framework);
    
    if (component.type === 'frontend' && options.framework === 'react') {
      return this.fillReactComponentTemplate(template, component, design);
    } else if (component.type === 'backend') {
      return this.fillBackendComponentTemplate(template, component, design);
    } else if (component.type === 'service') {
      return this.fillServiceTemplate(template, component, design);
    }
    
    return '';
  }
  
  private fillReactComponentTemplate(template: string, component: ComponentDesign, design: FeatureDesign): string {
    const props = component.interfaces[0]?.methods.map(m => 
      `${m.name}${m.parameters[0]?.required ? '' : '?'}: ${m.returnType};`
    ).join('\n  ');
    
    const propsDestructure = component.interfaces[0]?.methods.map(m => m.name).join(',\n  ');
    
    return template
      .replace('{{componentName}}', component.name)
      .replace('{{imports}}', 'useState, useEffect')
      .replace('{{importSource}}', 'react')
      .replace('{{additionalImports}}', '')
      .replace('{{props}}', props)
      .replace('{{propsDestructure}}', propsDestructure)
      .replace('{{hooks}}', 'const [state, setState] = useState(null);')
      .replace('{{methods}}', '')
      .replace('{{jsx}}', '<div>Component implementation</div>');
  }
  
  private fillBackendComponentTemplate(template: string, component: ComponentDesign, design: FeatureDesign): string {
    return `import { Request, Response, NextFunction } from 'express';
import { ${component.name.replace('Controller', 'Service')} } from '../services';

export class ${component.name} {
  private service: ${component.name.replace('Controller', 'Service')};
  
  constructor() {
    this.service = new ${component.name.replace('Controller', 'Service')}();
  }
  
  ${component.interfaces[0]?.methods.map(method => `
  async ${method.name}(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.service.${method.name}(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }`).join('\n')}
}`;
  }
  
  private fillServiceTemplate(template: string, component: ComponentDesign, design: FeatureDesign): string {
    return `export class ${component.name} {
  ${component.interfaces[0]?.methods.map(method => `
  async ${method.name}(${method.parameters.map(p => `${p.name}: ${p.type}`).join(', ')}): Promise<${method.returnType}> {
    // Implementation
    throw new Error('Not implemented');
  }`).join('\n')}
}`;
  }
  
  private generateInterfaceCode(interfaces: InterfaceDesign[], options: any): string {
    return interfaces.map(iface => `
export interface ${iface.name} {
  ${iface.methods.map(method => 
    `${method.name}(${method.parameters.map(p => 
      `${p.name}${p.required ? '' : '?'}: ${p.type}`
    ).join(', ')}): ${method.returnType};`
  ).join('\n  ')}
}`).join('\n\n');
  }
  
  private generateTestCode(test: TestImplementation, options: any): string {
    const template = this.templates.get('jest-test') || '';
    
    const testCases = test.cases.map(testCase => `
  it('${testCase.name}', async () => {
    ${testCase.assertions.map(assertion => `expect(${assertion}).toBeTruthy();`).join('\n    ')}
  });`).join('\n');
    
    return template
      .replace('{{imports}}', '*')
      .replace('{{importPath}}', test.path.replace('.test.ts', '').replace('tests/', '../src/'))
      .replace('{{additionalImports}}', '')
      .replace('{{suiteName}}', path.basename(test.path, '.test.ts'))
      .replace('{{setup}}', 'beforeEach(() => {});')
      .replace('{{teardown}}', 'afterEach(() => {});')
      .replace('{{testCases}}', testCases);
  }
  
  private async implementTests(
    requirements: FeatureRequirement,
    design: FeatureDesign,
    implementation: FeatureImplementation
  ): Promise<void> {
    for (const test of implementation.tests) {
      const testCode = this.generateTestCode(test, {});
      await fs.mkdir(path.dirname(test.path), { recursive: true });
      await fs.writeFile(test.path, testCode, 'utf-8');
    }
  }
  
  private async generateDocumentation(
    requirements: FeatureRequirement,
    design: FeatureDesign,
    implementation: FeatureImplementation
  ): Promise<void> {
    for (const doc of implementation.documentation) {
      await fs.mkdir(path.dirname(doc.path), { recursive: true });
      await fs.writeFile(doc.path, doc.content, 'utf-8');
    }
  }
  
  private generateDeveloperDocumentation(requirements: FeatureRequirement, design: FeatureDesign): string {
    return `# ${requirements.title}

## Overview
${requirements.description}

## Architecture
${design.architecture.components.map(c => `- **${c.name}**: ${c.description}`).join('\n')}

## Design Patterns
${design.designPatterns.join(', ')}

## API Endpoints
${design.architecture.apis.map(api => `- \`${api.method} ${api.endpoint}\`: ${api.description}`).join('\n')}

## Implementation Details
...

## Testing
...

## Deployment
...`;
  }
  
  private generateAPIDocumentation(apis: APIDesign[]): string {
    return `# API Documentation

${apis.map(api => `## ${api.method} ${api.endpoint}

**Description:** ${api.description}

**Authentication:** ${api.authentication ? 'Required' : 'Not required'}

**Rate Limit:** ${api.rateLimit || 'Default'}

### Request
\`\`\`json
${JSON.stringify(api.requestBody || {}, null, 2)}
\`\`\`

### Response
\`\`\`json
${JSON.stringify(api.responseBody || {}, null, 2)}
\`\`\`
`).join('\n---\n')}`;
  }
  
  private async calculateMetrics(implementation: FeatureImplementation, startTime: number): Promise<any> {
    const filesCreated = implementation.files.filter(f => f.type === 'create').length;
    const filesModified = implementation.files.filter(f => f.type === 'modify').length;
    
    let linesOfCode = 0;
    for (const file of implementation.files) {
      if (file.content) {
        linesOfCode += file.content.split('\n').length;
      }
    }
    
    const testCoverage = implementation.tests.reduce((sum, test) => sum + test.coverage, 0) / implementation.tests.length;
    
    return {
      filesCreated,
      filesModified,
      linesOfCode,
      testCoverage,
      duration: Date.now() - startTime
    };
  }
  
  private generateNextSteps(requirements: FeatureRequirement, design: FeatureDesign): string[] {
    const steps = [];
    
    steps.push('Run tests to ensure implementation correctness');
    steps.push('Review code for quality and standards compliance');
    
    if (design.architecture.apis.length > 0) {
      steps.push('Test API endpoints with Postman or similar tool');
      steps.push('Set up monitoring for API performance');
    }
    
    if (design.architecture.database) {
      steps.push('Run database migrations');
      steps.push('Verify database indexes and performance');
    }
    
    steps.push('Deploy to staging environment');
    steps.push('Perform user acceptance testing');
    steps.push('Update documentation if needed');
    steps.push('Plan production deployment');
    
    return steps;
  }
  
  // Helper methods
  private requiresDatabase(requirements: FeatureRequirement): boolean {
    const keywords = ['store', 'save', 'persist', 'database', 'crud', 'repository'];
    return keywords.some(k => requirements.description.toLowerCase().includes(k));
  }
  
  private requiresAPI(requirements: FeatureRequirement): boolean {
    const keywords = ['api', 'endpoint', 'rest', 'graphql', 'service', 'backend'];
    return keywords.some(k => requirements.description.toLowerCase().includes(k));
  }
  
  private requiresFrontend(requirements: FeatureRequirement): boolean {
    const keywords = ['ui', 'frontend', 'component', 'page', 'view', 'react', 'angular', 'vue'];
    return keywords.some(k => requirements.description.toLowerCase().includes(k));
  }
  
  private determineDatabaseType(requirements: FeatureRequirement): 'sql' | 'nosql' | 'graph' | 'timeseries' {
    if (requirements.description.includes('graph') || requirements.description.includes('relationship')) {
      return 'graph';
    }
    if (requirements.description.includes('time') || requirements.description.includes('metrics')) {
      return 'timeseries';
    }
    if (requirements.description.includes('document') || requirements.description.includes('flexible')) {
      return 'nosql';
    }
    return 'sql';
  }
  
  private designSchemas(requirements: FeatureRequirement): SchemaDesign[] {
    // This would be more sophisticated in a real implementation
    const entityName = this.extractEntityName(requirements.title);
    
    return [{
      name: entityName,
      fields: [
        { name: 'id', type: 'uuid', required: true, unique: true },
        { name: 'createdAt', type: 'timestamp', required: true },
        { name: 'updatedAt', type: 'timestamp', required: true }
      ]
    }];
  }
  
  private designIndexes(requirements: FeatureRequirement): string[] {
    return ['id_index', 'created_at_index'];
  }
  
  private designRelationships(requirements: FeatureRequirement): string[] {
    return [];
  }
  
  private designAPIs(requirements: FeatureRequirement): APIDesign[] {
    const entityName = this.extractEntityName(requirements.title);
    const basePath = `/api/${this.kebabCase(entityName)}`;
    
    return [
      {
        endpoint: basePath,
        method: 'GET',
        description: `Get all ${entityName}s`,
        authentication: true,
        responseBody: { items: [], total: 0 }
      },
      {
        endpoint: `${basePath}/:id`,
        method: 'GET',
        description: `Get ${entityName} by ID`,
        authentication: true,
        responseBody: {}
      },
      {
        endpoint: basePath,
        method: 'POST',
        description: `Create new ${entityName}`,
        authentication: true,
        requestBody: {},
        responseBody: { id: 'string' }
      },
      {
        endpoint: `${basePath}/:id`,
        method: 'PUT',
        description: `Update ${entityName}`,
        authentication: true,
        requestBody: {},
        responseBody: { success: true }
      },
      {
        endpoint: `${basePath}/:id`,
        method: 'DELETE',
        description: `Delete ${entityName}`,
        authentication: true,
        responseBody: { success: true }
      }
    ];
  }
  
  private designDataFlow(components: ComponentDesign[]): DataFlow[] {
    const flows: DataFlow[] = [];
    
    // Create data flows between components
    const frontend = components.find(c => c.type === 'frontend');
    const controller = components.find(c => c.type === 'backend');
    const service = components.find(c => c.type === 'service');
    const repository = components.find(c => c.name.includes('Repository'));
    
    if (frontend && controller) {
      flows.push({
        source: frontend.name,
        destination: controller.name,
        dataType: 'HTTP Request',
        protocol: 'REST'
      });
    }
    
    if (controller && service) {
      flows.push({
        source: controller.name,
        destination: service.name,
        dataType: 'Method Call',
        transformation: 'DTO to Domain Model'
      });
    }
    
    if (service && repository) {
      flows.push({
        source: service.name,
        destination: repository.name,
        dataType: 'Query',
        transformation: 'Domain Model to Entity'
      });
    }
    
    return flows;
  }
  
  private selectDesignPatterns(requirements: FeatureRequirement, design: FeatureDesign): string[] {
    const patterns: string[] = [];
    
    if (design.architecture.components.some(c => c.type === 'service')) {
      patterns.push('Service Layer');
    }
    
    if (design.architecture.components.some(c => c.name.includes('Repository'))) {
      patterns.push('Repository Pattern');
    }
    
    if (design.architecture.components.length > 3) {
      patterns.push('Dependency Injection');
    }
    
    if (requirements.description.includes('factory') || requirements.description.includes('create')) {
      patterns.push('Factory Pattern');
    }
    
    if (requirements.description.includes('observer') || requirements.description.includes('event')) {
      patterns.push('Observer Pattern');
    }
    
    return patterns;
  }
  
  private makeTechnicalDecisions(requirements: FeatureRequirement, options: any): TechnicalDecision[] {
    const decisions: TechnicalDecision[] = [];
    
    decisions.push({
      area: 'Framework',
      decision: options.framework || 'Express.js',
      rationale: 'Mature, well-supported, large ecosystem',
      alternatives: ['Fastify', 'Koa', 'NestJS'],
      tradeoffs: ['Performance vs ecosystem size']
    });
    
    if (this.requiresDatabase(requirements)) {
      decisions.push({
        area: 'Database',
        decision: 'PostgreSQL',
        rationale: 'ACID compliance, strong consistency, JSON support',
        alternatives: ['MySQL', 'MongoDB', 'DynamoDB'],
        tradeoffs: ['Consistency vs scalability']
      });
    }
    
    return decisions;
  }
  
  private identifySecurityConsiderations(requirements: FeatureRequirement): string[] {
    const considerations: string[] = [];
    
    if (this.requiresAPI(requirements)) {
      considerations.push('Implement authentication and authorization');
      considerations.push('Validate all input data');
      considerations.push('Use HTTPS for all communications');
      considerations.push('Implement rate limiting');
    }
    
    if (this.requiresDatabase(requirements)) {
      considerations.push('Use parameterized queries to prevent SQL injection');
      considerations.push('Encrypt sensitive data at rest');
      considerations.push('Implement proper access controls');
    }
    
    considerations.push('Follow OWASP security guidelines');
    considerations.push('Implement logging and monitoring');
    
    return considerations;
  }
  
  private definePerformanceTargets(requirements: FeatureRequirement): PerformanceTarget[] {
    const targets: PerformanceTarget[] = [];
    
    if (this.requiresAPI(requirements)) {
      targets.push({
        metric: 'API Response Time',
        target: '< 200ms',
        measurement: 'p95 latency'
      });
      
      targets.push({
        metric: 'Throughput',
        target: '> 1000 req/s',
        measurement: 'requests per second'
      });
    }
    
    if (this.requiresDatabase(requirements)) {
      targets.push({
        metric: 'Query Performance',
        target: '< 50ms',
        measurement: 'average query time'
      });
    }
    
    if (this.requiresFrontend(requirements)) {
      targets.push({
        metric: 'First Contentful Paint',
        target: '< 1.8s',
        measurement: 'Lighthouse score'
      });
      
      targets.push({
        metric: 'Time to Interactive',
        target: '< 3.8s',
        measurement: 'Lighthouse score'
      });
    }
    
    return targets;
  }
  
  private determineFrontendDependencies(framework?: string): string[] {
    if (framework === 'react') {
      return ['react', 'react-dom', 'axios', 'react-router'];
    } else if (framework === 'vue') {
      return ['vue', 'vue-router', 'vuex', 'axios'];
    } else if (framework === 'angular') {
      return ['@angular/core', '@angular/common', '@angular/router'];
    }
    return [];
  }
  
  private generateControllerMethods(requirements: FeatureRequirement): MethodDesign[] {
    const entityName = this.extractEntityName(requirements.title);
    
    return [
      {
        name: `get${entityName}s`,
        parameters: [{ name: 'req', type: 'Request', required: true, description: 'Express request' }],
        returnType: 'Promise<Response>',
        description: `Get all ${entityName}s`
      },
      {
        name: `get${entityName}ById`,
        parameters: [{ name: 'req', type: 'Request', required: true, description: 'Express request' }],
        returnType: 'Promise<Response>',
        description: `Get ${entityName} by ID`
      },
      {
        name: `create${entityName}`,
        parameters: [{ name: 'req', type: 'Request', required: true, description: 'Express request' }],
        returnType: 'Promise<Response>',
        description: `Create new ${entityName}`
      },
      {
        name: `update${entityName}`,
        parameters: [{ name: 'req', type: 'Request', required: true, description: 'Express request' }],
        returnType: 'Promise<Response>',
        description: `Update ${entityName}`
      },
      {
        name: `delete${entityName}`,
        parameters: [{ name: 'req', type: 'Request', required: true, description: 'Express request' }],
        returnType: 'Promise<Response>',
        description: `Delete ${entityName}`
      }
    ];
  }
  
  private generateServiceMethods(requirements: FeatureRequirement): MethodDesign[] {
    const entityName = this.extractEntityName(requirements.title);
    
    return [
      {
        name: `findAll${entityName}s`,
        parameters: [{ name: 'filters', type: 'object', required: false }],
        returnType: `Promise<${entityName}[]>`,
        description: `Find all ${entityName}s`
      },
      {
        name: `findById`,
        parameters: [{ name: 'id', type: 'string', required: true }],
        returnType: `Promise<${entityName}>`,
        description: `Find ${entityName} by ID`
      },
      {
        name: `create`,
        parameters: [{ name: 'data', type: entityName, required: true }],
        returnType: `Promise<${entityName}>`,
        description: `Create new ${entityName}`
      },
      {
        name: `update`,
        parameters: [
          { name: 'id', type: 'string', required: true },
          { name: 'data', type: `Partial<${entityName}>`, required: true }
        ],
        returnType: `Promise<${entityName}>`,
        description: `Update ${entityName}`
      },
      {
        name: `delete`,
        parameters: [{ name: 'id', type: 'string', required: true }],
        returnType: 'Promise<boolean>',
        description: `Delete ${entityName}`
      }
    ];
  }
  
  private generateRepositoryMethods(requirements: FeatureRequirement): MethodDesign[] {
    return this.generateServiceMethods(requirements); // Similar structure
  }
  
  private generateTestCases(component: ComponentDesign, requirements: FeatureRequirement): TestCase[] {
    const cases: TestCase[] = [];
    
    // Generate test cases based on component type
    if (component.type === 'frontend') {
      cases.push({
        name: 'should render without crashing',
        description: 'Component renders successfully',
        type: 'positive',
        assertions: ['component.exists()']
      });
      
      cases.push({
        name: 'should handle user interaction',
        description: 'Component responds to user input',
        type: 'positive',
        assertions: ['mockFunction.toHaveBeenCalled()']
      });
    } else if (component.type === 'backend' || component.type === 'service') {
      cases.push({
        name: 'should handle valid input',
        description: 'Function processes valid input correctly',
        type: 'positive',
        input: { valid: true },
        expectedOutput: { success: true },
        assertions: ['result.success === true']
      });
      
      cases.push({
        name: 'should reject invalid input',
        description: 'Function validates input',
        type: 'negative',
        input: { valid: false },
        assertions: ['error.message.includes("validation")']
      });
      
      cases.push({
        name: 'should handle edge cases',
        description: 'Function handles boundary conditions',
        type: 'edge',
        input: null,
        assertions: ['result !== undefined']
      });
    }
    
    return cases;
  }
  
  private generateAPITestCases(apis: APIDesign[]): TestCase[] {
    const cases: TestCase[] = [];
    
    for (const api of apis) {
      cases.push({
        name: `${api.method} ${api.endpoint} - success`,
        description: `API returns success for valid request`,
        type: 'positive',
        assertions: ['response.status === 200', 'response.body.success === true']
      });
      
      if (api.authentication) {
        cases.push({
          name: `${api.method} ${api.endpoint} - unauthorized`,
          description: `API rejects unauthenticated request`,
          type: 'negative',
          assertions: ['response.status === 401']
        });
      }
    }
    
    return cases;
  }
  
  private getTemplate(type: string, framework?: string): string {
    if (type === 'frontend' && framework === 'react') {
      return this.templates.get('react-component') || '';
    } else if (type === 'backend') {
      return this.templates.get('express-endpoint') || '';
    } else if (type === 'service') {
      return this.templates.get('service-class') || '';
    }
    return '';
  }
  
  private getFilePath(component: ComponentDesign, language: string): string {
    const ext = language === 'typescript' ? 'ts' : 'js';
    return `${component.location}/${this.kebabCase(component.name)}.${ext}`;
  }
  
  private getTestPath(component: ComponentDesign, language: string): string {
    const ext = language === 'typescript' ? 'ts' : 'js';
    const basePath = component.location.replace('src/', 'tests/');
    return `${basePath}/${this.kebabCase(component.name)}.test.${ext}`;
  }
  
  private generateMigrationUp(schema: SchemaDesign): string {
    const fields = schema.fields.map(f => 
      `${f.name} ${f.type}${f.required ? ' NOT NULL' : ''}${f.unique ? ' UNIQUE' : ''}`
    ).join(',\n  ');
    
    return `CREATE TABLE ${this.snakeCase(schema.name)} (\n  ${fields}\n);`;
  }
  
  private generateMigrationDown(schema: SchemaDesign): string {
    return `DROP TABLE IF EXISTS ${this.snakeCase(schema.name)};`;
  }
  
  private planConfigurationChanges(requirements: FeatureRequirement, design: FeatureDesign): ConfigurationChange[] {
    const changes: ConfigurationChange[] = [];
    
    if (design.architecture.apis.length > 0) {
      changes.push({
        file: '.env',
        key: `${this.constantCase(requirements.title)}_API_KEY`,
        value: 'your-api-key-here',
        environment: 'development'
      });
    }
    
    return changes;
  }
  
  private async applyMigration(migration: MigrationScript): Promise<void> {
    // This would run the actual migration
    this.emit('develop:migration-applied', { version: migration.version });
  }
  
  private async applyConfiguration(config: ConfigurationChange): Promise<void> {
    // This would update configuration files
    this.emit('develop:configuration-applied', { file: config.file, key: config.key });
  }
  
  private mergeCode(existing: string, newCode: string): string {
    // Simple merge strategy - in reality would be more sophisticated
    return existing + '\n\n' + newCode;
  }
  
  // String transformation utilities
  private camelCase(str: string): string {
    return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
  }
  
  private kebabCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[\s_]+/g, '-');
  }
  
  private snakeCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[\s-]+/g, '_');
  }
  
  private constantCase(str: string): string {
    return this.snakeCase(str).toUpperCase();
  }
  
  private extractEntityName(title: string): string {
    // Extract main entity name from title
    const words = title.split(/\s+/);
    return words[words.length - 1];
  }
}

// Utility function
function needsConfiguration(requirements: FeatureRequirement): boolean {
  return requirements.description.includes('config') || 
         requirements.description.includes('environment') ||
         requirements.description.includes('settings');
}

// Export singleton instance
export const featureDeveloper = new FeatureDeveloperAgent();