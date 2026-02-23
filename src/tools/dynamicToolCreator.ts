import { BaseTool } from './base.js';
import { ToolRegistry } from './registry.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import * as vm from 'vm';

/**
 * Dynamic Tool Creator
 * Allows Canvas CLI to create new tools on-the-fly based on user needs
 */
export class DynamicToolCreator extends BaseTool {
  name = 'create_tool';
  description = 'Create a new tool dynamically based on requirements';
  parameters = {
    name: { type: 'string', description: 'Name of the new tool' },
    description: { type: 'string', description: 'What the tool does' },
    code: { type: 'string', description: 'JavaScript code for the tool execution' },
    parameters: { type: 'object', description: 'Parameters the tool accepts' },
    save: { type: 'boolean', description: 'Save tool for future use', default: true }
  };

  private toolsDir = path.join(process.cwd(), '.canvas-cli', 'custom-tools');

  constructor(private registry: ToolRegistry) {
    super();
    fs.ensureDirSync(this.toolsDir);
    this.loadCustomTools();
  }

  async execute(params: {
    name: string;
    description: string;
    code: string;
    parameters: Record<string, any>;
    save?: boolean;
  }): Promise<string> {
    const { name, description, code, parameters, save = true } = params;

    console.log(chalk.cyan(`🔧 Creating new tool: ${name}`));

    // Create dynamic tool class
    const DynamicTool = class extends BaseTool {
      name = name;
      description = description;
      parameters = parameters;

      async execute(toolParams: any): Promise<any> {
        // Create safe sandbox for execution
        const sandbox = {
          console,
          fs: fs,
          path: path,
          chalk: chalk,
          params: toolParams,
          require: (module: string) => {
            // Allow only safe modules
            const allowedModules = ['fs-extra', 'path', 'chalk', 'axios'];
            if (allowedModules.includes(module)) {
              return require(module);
            }
            throw new Error(`Module ${module} not allowed in dynamic tools`);
          },
          result: null
        };

        try {
          // Wrap code in async function if not already
          const wrappedCode = `
            (async () => {
              ${code}
            })().then(r => result = r).catch(e => { throw e; });
          `;
          
          // Create context with sandbox
          const context = vm.createContext(sandbox);
          
          // Run with timeout
          const script = new vm.Script(wrappedCode);
          await script.runInContext(context, { timeout: 10000 });
          
          // Wait for async completion
          await new Promise(resolve => setTimeout(resolve, 100));
          
          console.log(chalk.green(`✓ Tool ${name} executed successfully`));
          return sandbox.result;
        } catch (error: any) {
          console.log(chalk.red(`✗ Tool ${name} failed: ${error.message}`));
          throw error;
        }
      }
    };

    // Register the new tool
    const toolInstance = new DynamicTool();
    this.registry.register(toolInstance);
    this.registry.enable(name);

    // Save tool for persistence if requested
    if (save) {
      await this.saveToolDefinition(name, description, code, parameters);
    }

    console.log(chalk.green(`✓ Tool "${name}" created and registered`));
    return `Successfully created tool: ${name}`;
  }

  private async saveToolDefinition(
    name: string,
    description: string,
    code: string,
    parameters: Record<string, any>
  ): Promise<void> {
    const toolPath = path.join(this.toolsDir, `${name}.json`);
    const toolDef = {
      name,
      description,
      code,
      parameters,
      created: new Date().toISOString()
    };
    
    await fs.writeJSON(toolPath, toolDef, { spaces: 2 });
    console.log(chalk.dim(`💾 Tool saved to: ${toolPath}`));
  }

  private async loadCustomTools(): Promise<void> {
    try {
      const files = await fs.readdir(this.toolsDir);
      const toolFiles = files.filter(f => f.endsWith('.json'));

      for (const file of toolFiles) {
        const toolPath = path.join(this.toolsDir, file);
        const toolDef = await fs.readJSON(toolPath);
        
        // Re-create and register the tool
        await this.execute({
          ...toolDef,
          save: false // Don't re-save
        });
      }

      if (toolFiles.length > 0) {
        console.log(chalk.dim(`📦 Loaded ${toolFiles.length} custom tools`));
      }
    } catch (error) {
      // Silently fail if no custom tools directory
    }
  }
}

/**
 * Tool Introspection - Allows Canvas CLI to understand its own capabilities
 */
export class ToolIntrospector extends BaseTool {
  name = 'introspect_tools';
  description = 'Analyze and understand current tool capabilities';
  parameters = {
    query: { type: 'string', description: 'What capability to check for', optional: true }
  };

  constructor(private registry: ToolRegistry) {
    super();
  }

  async execute(params: { query?: string }): Promise<any> {
    const tools = this.registry.list();
    
    if (params.query) {
      // Check if we have a tool for the requested capability
      const query = params.query.toLowerCase();
      const matchingTools = tools.filter(tool => 
        tool.name.includes(query) || 
        tool.description.toLowerCase().includes(query)
      );

      if (matchingTools.length > 0) {
        return {
          hasCapability: true,
          tools: matchingTools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }))
        };
      } else {
        return {
          hasCapability: false,
          suggestion: `No tool found for "${params.query}". You can create one using the create_tool command.`,
          relatedTools: tools
            .filter(t => this.calculateSimilarity(query, t.description) > 0.3)
            .map(t => t.name)
        };
      }
    }

    // Return all capabilities
    return {
      totalTools: tools.length,
      categories: this.categorizeTools(tools),
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        enabled: this.registry.isEnabled(t.name)
      }))
    };
  }

  private calculateSimilarity(query: string, text: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const textWords = text.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const qWord of queryWords) {
      if (textWords.some(tWord => tWord.includes(qWord) || qWord.includes(tWord))) {
        matches++;
      }
    }
    
    return matches / queryWords.length;
  }

  private categorizeTools(tools: any[]): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      file: [],
      web: [],
      git: [],
      system: [],
      memory: [],
      custom: [],
      other: []
    };

    for (const tool of tools) {
      const name = tool.name.toLowerCase();
      if (name.includes('file') || name.includes('read') || name.includes('write')) {
        categories.file.push(tool.name);
      } else if (name.includes('web') || name.includes('fetch') || name.includes('api')) {
        categories.web.push(tool.name);
      } else if (name.includes('git')) {
        categories.git.push(tool.name);
      } else if (name.includes('shell') || name.includes('env')) {
        categories.system.push(tool.name);
      } else if (name.includes('memory') || name.includes('recall')) {
        categories.memory.push(tool.name);
      } else if (tool.name.startsWith('custom_')) {
        categories.custom.push(tool.name);
      } else {
        categories.other.push(tool.name);
      }
    }

    return categories;
  }
}

/**
 * Self-Improvement Tool - Allows Canvas CLI to enhance itself
 */
export class SelfImprovementTool extends BaseTool {
  name = 'self_improve';
  description = 'Analyze user request and create necessary tools or capabilities';
  parameters = {
    request: { type: 'string', description: 'What the user needs' },
    context: { type: 'string', description: 'Current conversation context', optional: true }
  };

  constructor(
    private registry: ToolRegistry,
    private toolCreator: DynamicToolCreator
  ) {
    super();
  }

  async execute(params: { request: string; context?: string }): Promise<any> {
    const { request, context } = params;

    // Validate request is provided
    if (!request) {
      return {
        action: 'error',
        message: 'No request provided for self-improvement analysis.'
      };
    }

    console.log(chalk.cyan('🧠 Analyzing request for self-improvement...'));

    // Analyze what's needed
    const analysis = this.analyzeRequest(request);
    
    if (analysis.needsNewTool) {
      console.log(chalk.yellow(`📝 Creating new tool: ${analysis.toolName}`));
      
      // Generate tool code based on requirements
      const toolCode = this.generateToolCode(analysis);
      
      // Create the new tool
      await this.toolCreator.execute({
        name: analysis.toolName,
        description: analysis.toolDescription,
        code: toolCode,
        parameters: analysis.toolParameters,
        save: true
      });

      return {
        action: 'created_tool',
        tool: analysis.toolName,
        message: `I've created a new tool "${analysis.toolName}" to handle this request.`
      };
    }

    return {
      action: 'no_improvement_needed',
      message: 'Current capabilities are sufficient for this request.'
    };
  }

  private analyzeRequest(request: string): any {
    const lower = request.toLowerCase();
    
    // Check for common patterns that might need new tools
    const patterns = [
      {
        match: /convert|transform|change.*format/i,
        toolName: 'format_converter',
        toolDescription: 'Convert between different file formats',
        needsNewTool: true,
        toolParameters: {
          input: { type: 'string', description: 'Input file path' },
          output: { type: 'string', description: 'Output file path' },
          format: { type: 'string', description: 'Target format' }
        }
      },
      {
        match: /analyze|inspect|examine.*code/i,
        toolName: 'code_analyzer',
        toolDescription: 'Analyze code for patterns, issues, or metrics',
        needsNewTool: true,
        toolParameters: {
          path: { type: 'string', description: 'File or directory to analyze' },
          type: { type: 'string', description: 'Type of analysis' }
        }
      },
      {
        match: /backup|archive|compress/i,
        toolName: 'backup_tool',
        toolDescription: 'Create backups or archives of files',
        needsNewTool: true,
        toolParameters: {
          source: { type: 'string', description: 'Source path' },
          destination: { type: 'string', description: 'Backup destination' }
        }
      }
    ];

    for (const pattern of patterns) {
      if (pattern.match.test(request)) {
        return pattern;
      }
    }

    return { needsNewTool: false };
  }

  private generateToolCode(analysis: any): string {
    // Generate appropriate code based on tool type
    const codeTemplates: Record<string, string> = {
      format_converter: `
        const fs = require('fs-extra');
        const path = require('path');
        
        const input = await fs.readFile(params.input, 'utf-8');
        let output = input;
        
        // Perform conversion based on format
        if (params.format === 'json') {
          output = JSON.stringify(JSON.parse(input), null, 2);
        } else if (params.format === 'yaml') {
          // Basic conversion logic
          output = input.replace(/:/g, ': ');
        }
        
        await fs.writeFile(params.output, output);
        return 'Conversion complete';
      `,
      code_analyzer: `
        const fs = require('fs-extra');
        const path = require('path');
        
        const code = await fs.readFile(params.path, 'utf-8');
        const lines = code.split('\\n');
        
        const analysis = {
          lines: lines.length,
          functions: (code.match(/function|=>|async/g) || []).length,
          comments: (code.match(/\\/\\/|\\/\\*/g) || []).length
        };
        
        return analysis;
      `,
      backup_tool: `
        const fs = require('fs-extra');
        const path = require('path');
        
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupPath = params.destination || params.source + '.backup-' + timestamp;
        
        await fs.copy(params.source, backupPath);
        return 'Backup created at: ' + backupPath;
      `
    };

    return codeTemplates[analysis.toolName] || `
      // Custom tool implementation
      return 'Tool executed for: ' + params.toString();
    `;
  }
}