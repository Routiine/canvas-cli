/**
 * Code Generation Pipeline
 * Generates code components, APIs, schemas, and tests
 */

import { EventEmitter } from 'events';
import chalk from 'chalk';
import { getModelManager, ModelManagerSingleton } from '../../models/model-manager.js';

export interface GenerationOptions {
  language: string;
  framework?: string;
  style?: 'functional' | 'object-oriented' | 'mixed';
  patterns?: string[];
  conventions?: Record<string, any>;
}

export interface ComponentSpec {
  name: string;
  type: 'controller' | 'service' | 'repository' | 'model' | 'utility' | 'component';
  methods?: Array<{
    name: string;
    parameters: Array<{ name: string; type: string }>;
    returnType: string;
    description?: string;
  }>;
  properties?: Array<{
    name: string;
    type: string;
    access?: 'public' | 'private' | 'protected';
  }>;
  dependencies?: string[];
}

/**
 * Code Generator Implementation
 */
export class CodeGenerator extends EventEmitter {
  private modelManager: ModelManagerSingleton;
  private templates: Map<string, string> = new Map();
  
  constructor() {
    super();
    this.modelManager = getModelManager();
    this.initializeTemplates();
  }
  
  /**
   * Generate a component based on specification
   */
  async generateComponent(
    spec: ComponentSpec,
    language: string,
    framework?: string
  ): Promise<string> {
    console.log(chalk.dim(`    🔨 Generating ${spec.type}: ${spec.name}...`));
    
    const template = this.getTemplate(spec.type, language, framework);
    const code = await this.fillTemplate(template, spec, language);
    
    this.emit('component-generated', { name: spec.name, type: spec.type });
    
    return code;
  }
  
  /**
   * Generate API implementation
   */
  async generateAPI(
    specification: any,
    framework: string = 'express'
  ): Promise<any> {
    console.log(chalk.dim('    🔌 Generating API implementation...'));
    
    const files = {
      routes: await this.generateRoutes(specification, framework),
      controllers: await this.generateControllers(specification, framework),
      middleware: await this.generateMiddleware(specification, framework),
      models: await this.generateModels(specification),
      validators: await this.generateValidators(specification)
    };
    
    this.emit('api-generated', { framework, endpoints: specification.endpoints?.length || 0 });
    
    return files;
  }
  
  /**
   * Generate database schema
   */
  async generateDatabaseSchema(
    dataModel: any,
    database: 'postgres' | 'mysql' | 'mongodb'
  ): Promise<any> {
    console.log(chalk.dim(`    🗄️ Generating ${database} schema...`));
    
    let schema = '';
    
    switch (database) {
      case 'postgres':
        schema = this.generatePostgresSchema(dataModel);
        break;
      case 'mysql':
        schema = this.generateMySQLSchema(dataModel);
        break;
      case 'mongodb':
        schema = this.generateMongoSchema(dataModel);
        break;
    }
    
    this.emit('schema-generated', { database });
    
    return {
      schema,
      migrations: this.generateMigrations(dataModel, database),
      seeds: this.generateSeedData(dataModel)
    };
  }
  
  /**
   * Generate unit tests
   */
  async generateTests(
    code: string,
    language: string,
    framework: string = 'jest'
  ): Promise<string> {
    console.log(chalk.dim(`    🧪 Generating ${framework} tests...`));
    
    const prompt = `Generate comprehensive unit tests for the following ${language} code using ${framework}:

\`\`\`${language}
${code}
\`\`\`

Include:
1. Setup and teardown
2. Positive test cases
3. Negative test cases
4. Edge cases
5. Mocking where appropriate

Use modern ${framework} syntax and best practices.`;
    
    const tests = await this.modelManager.generateResponse(prompt, {
      temperature: 0.4,
      maxTokens: 3000,
      format: 'code'
    });
    
    this.emit('tests-generated', { framework });
    
    return tests;
  }
  
  /**
   * Initialize code templates
   */
  private initializeTemplates(): void {
    // TypeScript Controller Template
    this.templates.set('controller-typescript-express', `
import { Request, Response, NextFunction } from 'express';
import { {{serviceName}} } from '../services/{{serviceName}}';

export class {{className}} {
  private {{serviceInstance}}: {{serviceName}};
  
  constructor() {
    this.{{serviceInstance}} = new {{serviceName}}();
  }
  
  {{methods}}
}

export const {{instanceName}} = new {{className}}();
`);
    
    // TypeScript Service Template
    this.templates.set('service-typescript', `
import { {{repositoryName}} } from '../repositories/{{repositoryName}}';

export class {{className}} {
  private {{repositoryInstance}}: {{repositoryName}};
  
  constructor() {
    this.{{repositoryInstance}} = new {{repositoryName}}();
  }
  
  {{methods}}
}
`);
    
    // TypeScript Repository Template
    this.templates.set('repository-typescript', `
import { Database } from '../database';

export class {{className}} {
  private db: Database;
  
  constructor() {
    this.db = Database.getInstance();
  }
  
  {{methods}}
}
`);
    
    // Python Class Template
    this.templates.set('class-python', `
class {{className}}:
    """{{description}}"""
    
    def __init__(self{{constructorParams}}):
        {{constructorBody}}
    
    {{methods}}
`);
    
    // JavaScript Function Template
    this.templates.set('function-javascript', `
/**
 * {{description}}
 {{paramDocs}}
 * @returns {{returnType}} {{returnDescription}}
 */
function {{functionName}}({{parameters}}) {
  {{body}}
}

module.exports = { {{functionName}} };
`);
  }
  
  /**
   * Get template for component type
   */
  private getTemplate(type: string, language: string, framework?: string): string {
    const key = framework ? `${type}-${language}-${framework}` : `${type}-${language}`;
    
    if (this.templates.has(key)) {
      return this.templates.get(key)!;
    }
    
    // Return generic template if specific not found
    return this.getGenericTemplate(type, language);
  }
  
  /**
   * Get generic template
   */
  private getGenericTemplate(type: string, language: string): string {
    if (language === 'typescript' || language === 'javascript') {
      return `
export class {{className}} {
  constructor({{constructorParams}}) {
    {{constructorBody}}
  }
  
  {{methods}}
}
`;
    } else if (language === 'python') {
      return this.templates.get('class-python') || '';
    } else {
      return '// Generated code\n{{body}}';
    }
  }
  
  /**
   * Fill template with values
   */
  private async fillTemplate(template: string, spec: ComponentSpec, language: string): Promise<string> {
    let filled = template;
    
    // Replace class name
    filled = filled.replace(/{{className}}/g, spec.name);
    filled = filled.replace(/{{instanceName}}/g, this.camelCase(spec.name));
    
    // Replace service/repository names
    const serviceName = spec.name.replace('Controller', 'Service');
    const repositoryName = spec.name.replace('Service', 'Repository');
    
    filled = filled.replace(/{{serviceName}}/g, serviceName);
    filled = filled.replace(/{{serviceInstance}}/g, this.camelCase(serviceName));
    filled = filled.replace(/{{repositoryName}}/g, repositoryName);
    filled = filled.replace(/{{repositoryInstance}}/g, this.camelCase(repositoryName));
    
    // Generate methods
    if (spec.methods) {
      const methods = await this.generateMethods(spec.methods, language, spec.type);
      filled = filled.replace(/{{methods}}/g, methods);
    }
    
    // Generate constructor
    if (spec.properties) {
      const constructor = this.generateConstructor(spec.properties, language);
      filled = filled.replace(/{{constructorParams}}/g, constructor.params);
      filled = filled.replace(/{{constructorBody}}/g, constructor.body);
    }
    
    // Clean up unused placeholders
    filled = filled.replace(/{{[^}]+}}/g, '');
    
    return filled;
  }
  
  /**
   * Generate methods code
   */
  private async generateMethods(methods: any[], language: string, componentType: string): Promise<string> {
    const methodsCode = [];
    
    for (const method of methods) {
      const methodCode = await this.generateMethod(method, language, componentType);
      methodsCode.push(methodCode);
    }
    
    return methodsCode.join('\n\n  ');
  }
  
  /**
   * Generate single method
   */
  private async generateMethod(method: any, language: string, componentType: string): Promise<string> {
    if (language === 'typescript' || language === 'javascript') {
      const isAsync = componentType !== 'model' && componentType !== 'utility';
      const params = method.parameters?.map((p: any) => `${p.name}: ${p.type}`).join(', ') || '';
      
      return `${isAsync ? 'async ' : ''}${method.name}(${params}): ${isAsync ? 'Promise<' : ''}${method.returnType}${isAsync ? '>' : ''} {
    ${method.description ? `// ${method.description}` : ''}
    // TODO: Implement ${method.name}
    throw new Error('Method not implemented');
  }`;
    } else if (language === 'python') {
      const params = method.parameters?.map((p: any) => p.name).join(', ') || '';
      
      return `def ${method.name}(self${params ? ', ' + params : ''}):
        """${method.description || 'TODO: Add description'}"""
        # TODO: Implement ${method.name}
        raise NotImplementedError()`;
    }
    
    return '';
  }
  
  /**
   * Generate constructor
   */
  private generateConstructor(properties: any[], language: string): any {
    if (language === 'typescript' || language === 'javascript') {
      const params = properties
        .filter(p => p.access !== 'private')
        .map(p => `${p.name}?: ${p.type}`)
        .join(', ');
      
      const body = properties
        .map(p => `this.${p.name} = ${p.name};`)
        .join('\n    ');
      
      return { params, body };
    } else if (language === 'python') {
      const params = properties
        .filter(p => p.access !== 'private')
        .map(p => `, ${p.name}=None`)
        .join('');
      
      const body = properties
        .map(p => `self.${p.name} = ${p.name}`)
        .join('\n        ');
      
      return { params, body };
    }
    
    return { params: '', body: '' };
  }
  
  /**
   * Generate API routes
   */
  private async generateRoutes(spec: any, framework: string): Promise<string> {
    if (framework === 'express') {
      return this.generateExpressRoutes(spec);
    } else if (framework === 'fastapi') {
      return this.generateFastAPIRoutes(spec);
    }
    
    return '// Routes not generated';
  }
  
  /**
   * Generate Express routes
   */
  private generateExpressRoutes(spec: any): string {
    let routes = `import { Router } from 'express';
import { validate } from '../middleware/validator';
import { authenticate } from '../middleware/auth';

const router = Router();

`;
    
    for (const endpoint of spec.endpoints || []) {
      const method = endpoint.method?.toLowerCase() || 'get';
      const middleware = endpoint.authentication ? 'authenticate, ' : '';
      
      routes += `router.${method}('${endpoint.path}', ${middleware}async (req, res) => {
  try {
    // TODO: Implement ${endpoint.description || endpoint.path}
    res.json({ message: 'Not implemented' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

`;
    }
    
    routes += 'export default router;';
    
    return routes;
  }
  
  /**
   * Generate FastAPI routes
   */
  private generateFastAPIRoutes(spec: any): string {
    let routes = `from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional

router = APIRouter()

`;
    
    for (const endpoint of spec.endpoints || []) {
      const method = endpoint.method?.toLowerCase() || 'get';
      
      routes += `@router.${method}("${endpoint.path}")
async def ${this.pythonFunctionName(endpoint.path)}():
    """${endpoint.description || 'TODO: Add description'}"""
    # TODO: Implement
    raise HTTPException(status_code=501, detail="Not implemented")

`;
    }
    
    return routes;
  }
  
  /**
   * Generate controllers
   */
  private async generateControllers(spec: any, framework: string): Promise<string> {
    const controllers: string[] = [];
    
    // Group endpoints by resource
    const resources = this.groupEndpointsByResource(spec.endpoints || []);
    
    for (const [resource, endpoints] of Object.entries(resources)) {
      const controllerCode = await this.generateController(resource, endpoints as any, framework);
      controllers.push(controllerCode);
    }
    
    return controllers.join('\n\n');
  }
  
  /**
   * Generate single controller
   */
  private async generateController(resource: string, endpoints: any[], framework: string): Promise<string> {
    const className = this.pascalCase(resource) + 'Controller';
    const methods = endpoints.map(e => ({
      name: this.methodNameFromEndpoint(e),
      parameters: [{ name: 'req', type: 'Request' }, { name: 'res', type: 'Response' }],
      returnType: 'void',
      description: e.description
    }));
    
    const spec: ComponentSpec = {
      name: className,
      type: 'controller',
      methods
    };
    
    return this.generateComponent(spec, 'typescript', framework);
  }
  
  /**
   * Generate middleware
   */
  private async generateMiddleware(spec: any, framework: string): Promise<string> {
    return `import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
};

export const logger = (req: Request, res: Response, next: NextFunction) => {
  console.log(\`\${req.method} \${req.path}\`);
  next();
};

export const cors = (req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
};`;
  }
  
  /**
   * Generate data models
   */
  private async generateModels(spec: any): Promise<string> {
    const models: string[] = [];
    
    for (const model of spec.dataModels || []) {
      const modelCode = this.generateModel(model);
      models.push(modelCode);
    }
    
    return models.join('\n\n');
  }
  
  /**
   * Generate single model
   */
  private generateModel(model: any): string {
    return `export interface ${model.name} {
${Object.entries(model.fields || {}).map(([name, field]: [string, any]) => 
  `  ${name}${field.required ? '' : '?'}: ${field.type};`
).join('\n')}
}

export class ${model.name}Model implements ${model.name} {
${Object.entries(model.fields || {}).map(([name, field]: [string, any]) => 
  `  ${name}${field.required ? '!' : '?'}: ${field.type};`
).join('\n')}
  
  constructor(data: Partial<${model.name}>) {
    Object.assign(this, data);
  }
}`;
  }
  
  /**
   * Generate validators
   */
  private async generateValidators(spec: any): Promise<string> {
    return `import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Add specific validators for each endpoint
${(spec.endpoints || []).map((e: any) => this.generateEndpointValidator(e)).join('\n\n')}`;
  }
  
  /**
   * Generate endpoint validator
   */
  private generateEndpointValidator(endpoint: any): string {
    const validatorName = this.camelCase(endpoint.path.replace(/[^a-zA-Z]/g, '')) + 'Validator';
    
    return `export const ${validatorName} = [
  // TODO: Add validation rules
  body('*').optional(),
  validate
];`;
  }
  
  /**
   * Generate PostgreSQL schema
   */
  private generatePostgresSchema(dataModel: any): string {
    let schema = '-- PostgreSQL Schema\n\n';
    
    for (const table of dataModel.tables || []) {
      schema += `CREATE TABLE ${table.name} (\n`;
      
      const columns = [];
      for (const column of table.columns || []) {
        columns.push(`  ${column.name} ${this.postgresType(column.type)}${column.required ? ' NOT NULL' : ''}${column.primary ? ' PRIMARY KEY' : ''}`);
      }
      
      schema += columns.join(',\n');
      schema += '\n);\n\n';
    }
    
    return schema;
  }
  
  /**
   * Generate MySQL schema
   */
  private generateMySQLSchema(dataModel: any): string {
    let schema = '-- MySQL Schema\n\n';
    
    for (const table of dataModel.tables || []) {
      schema += `CREATE TABLE \`${table.name}\` (\n`;
      
      const columns = [];
      for (const column of table.columns || []) {
        columns.push(`  \`${column.name}\` ${this.mysqlType(column.type)}${column.required ? ' NOT NULL' : ''}${column.primary ? ' PRIMARY KEY' : ''}`);
      }
      
      schema += columns.join(',\n');
      schema += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n';
    }
    
    return schema;
  }
  
  /**
   * Generate MongoDB schema
   */
  private generateMongoSchema(dataModel: any): string {
    let schema = '// MongoDB Schema (Mongoose)\n\n';
    schema += "const mongoose = require('mongoose');\n\n";
    
    for (const collection of dataModel.collections || dataModel.tables || []) {
      schema += `const ${collection.name}Schema = new mongoose.Schema({\n`;
      
      const fields = [];
      for (const field of collection.fields || collection.columns || []) {
        fields.push(`  ${field.name}: {
    type: ${this.mongooseType(field.type)},
    required: ${field.required || false}
  }`);
      }
      
      schema += fields.join(',\n');
      schema += '\n}, { timestamps: true });\n\n';
      
      schema += `module.exports = mongoose.model('${collection.name}', ${collection.name}Schema);\n\n`;
    }
    
    return schema;
  }
  
  /**
   * Generate migrations
   */
  private generateMigrations(dataModel: any, database: string): string {
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    
    return `// Migration: ${timestamp}_create_tables.js

exports.up = function(knex) {
  return knex.schema
${(dataModel.tables || []).map((table: any) => `    .createTable('${table.name}', table => {
      table.increments('id').primary();
      // TODO: Add columns
      table.timestamps(true, true);
    })`).join('\n')};
};

exports.down = function(knex) {
  return knex.schema
${(dataModel.tables || []).map((table: any) => `    .dropTable('${table.name}')`).join('\n')};
};`;
  }
  
  /**
   * Generate seed data
   */
  private generateSeedData(dataModel: any): string {
    return `// Seed data

exports.seed = async function(knex) {
  // Clear existing data
${(dataModel.tables || []).map((table: any) => `  await knex('${table.name}').del();`).join('\n')}
  
  // Insert seed data
  // TODO: Add seed data for each table
};`;
  }
  
  /**
   * Type mappings
   */
  
  private postgresType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'VARCHAR(255)',
      'text': 'TEXT',
      'number': 'INTEGER',
      'float': 'DECIMAL(10,2)',
      'boolean': 'BOOLEAN',
      'date': 'DATE',
      'datetime': 'TIMESTAMP',
      'json': 'JSONB'
    };
    return typeMap[type] || 'VARCHAR(255)';
  }
  
  private mysqlType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'VARCHAR(255)',
      'text': 'TEXT',
      'number': 'INT',
      'float': 'DECIMAL(10,2)',
      'boolean': 'TINYINT(1)',
      'date': 'DATE',
      'datetime': 'DATETIME',
      'json': 'JSON'
    };
    return typeMap[type] || 'VARCHAR(255)';
  }
  
  private mongooseType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'String',
      'text': 'String',
      'number': 'Number',
      'float': 'Number',
      'boolean': 'Boolean',
      'date': 'Date',
      'datetime': 'Date',
      'json': 'Object',
      'array': '[String]'
    };
    return typeMap[type] || 'String';
  }
  
  /**
   * Helper methods
   */
  
  private camelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
  
  private pascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  private pythonFunctionName(path: string): string {
    return path.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }
  
  private groupEndpointsByResource(endpoints: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const endpoint of endpoints) {
      const resource = endpoint.path.split('/')[1] || 'default';
      if (!groups[resource]) {
        groups[resource] = [];
      }
      groups[resource].push(endpoint);
    }
    
    return groups;
  }
  
  private methodNameFromEndpoint(endpoint: any): string {
    const method = endpoint.method?.toLowerCase() || 'get';
    const resource = endpoint.path.split('/').pop() || '';
    return method + this.pascalCase(resource);
  }
}

// Lazy singleton getter — avoids ~200ms+ startup cost when unused
let _codeGenerator: CodeGenerator | null = null;
export function getCodeGenerator(): CodeGenerator {
  if (!_codeGenerator) _codeGenerator = new CodeGenerator();
  return _codeGenerator;
}