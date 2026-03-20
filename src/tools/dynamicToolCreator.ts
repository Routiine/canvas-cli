import { BaseTool } from './base.js';
import type { ToolRegistry } from './registry.js';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import * as vm from 'vm';

// ---------------------------------------------------------------------------
// Tool definition validation
// ---------------------------------------------------------------------------

const GENERIC_NAMES = new Set([
  'tool', 'tool1', 'tool2', 'new_tool', 'my_tool', 'custom_tool', 'test_tool',
  'helper', 'util', 'utility', 'function', 'action', 'handler', 'task',
  'do_thing', 'do_stuff', 'process', 'run', 'execute',
]);

const GENERIC_DESCRIPTIONS = [
  /^(a\s+)?(tool|helper|utility)\s+(for|that)\s+(things|stuff|tasks|work)\.?$/i,
  /^does\s+stuff\.?$/i,
  /^handles\s+requests?\.?$/i,
  /^processes?\s+(input|data|things)\.?$/i,
  /^executes?\s+(commands?|actions?)\.?$/i,
  /^(a\s+)?custom\s+tool\.?$/i,
  /^tool\s+implementation\.?$/i,
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateToolDefinition(
  name: string,
  description: string,
  code: string,
  purpose: string,
): ValidationResult {
  const errors: string[] = [];

  // --- Name validation ---
  if (!name || name.trim().length === 0) {
    errors.push('Tool name is required.');
  } else {
    const n = name.trim();
    if (!/^[a-z][a-z0-9_-]{3,39}$/.test(n)) {
      errors.push(`Tool name "${n}" must be snake_case/kebab-case, start with a letter, 4–40 chars (e.g. "compress_folder", "fetch-rss-feed").`);
    }
    if (GENERIC_NAMES.has(n.replace(/-/g, '_'))) {
      errors.push(`Tool name "${n}" is too generic. Use a descriptive name that reflects what the tool does (e.g. "backup_project_files" not "backup_tool").`);
    }
  }

  // --- Description validation ---
  if (!description || description.trim().length < 20) {
    errors.push('Description must be at least 20 characters and explain what the tool does.');
  } else {
    const d = description.trim();
    if (GENERIC_DESCRIPTIONS.some(p => p.test(d))) {
      errors.push(`Description "${d}" is too generic. Describe the specific action and context (e.g. "Recursively compress a project folder into a timestamped .tar.gz archive").`);
    }
    // Must contain at least one action verb
    if (!/\b(create|read|write|fetch|send|convert|compress|extract|analyze|search|generate|delete|update|list|run|execute|monitor|parse|validate|scan|build|deploy|backup|restore|format|sort|filter|merge|split|compare|check|report|log|cache|queue|notify|download|upload|sync|watch|index)\b/i.test(d)) {
      errors.push('Description must contain at least one action verb describing what the tool does.');
    }
  }

  // --- Code validation ---
  if (!code || code.trim().length < 30) {
    errors.push('Tool code is too short to be meaningful — must contain a real implementation.');
  } else {
    const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (/^return\s+(null|undefined|true|false|['"`][^'"`]*['"`]|0);\s*$/.test(stripped)) {
      errors.push('Tool code is a placeholder. Provide a real implementation that accomplishes the stated purpose.');
    }
  }

  // --- Purpose validation ---
  if (!purpose || purpose.trim().length < 10) {
    errors.push('A purpose (the user request that triggered this tool) is required — min 10 characters.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Dynamic Tool Creator
 * Allows Canvas CLI to create new tools on-the-fly based on user needs.
 * All tools must have a meaningful name, real description, working code, and a stated purpose.
 */
export class DynamicToolCreator extends BaseTool {
  name = 'create_tool';
  description = 'Create a new tool dynamically. Requires: a descriptive snake_case name, a clear description of what it does (≥20 chars with an action verb), real implementation code, and the user purpose that triggered it.';
  parameters = {
    name:        { type: 'string',  description: 'snake_case or kebab-case tool name (e.g. "compress_project_files")' },
    description: { type: 'string',  description: 'What the tool does — min 20 chars, must include an action verb' },
    purpose:     { type: 'string',  description: 'The user request that triggered this tool (why it was created)' },
    code:        { type: 'string',  description: 'JavaScript implementation — must be a real, working function body' },
    parameters:  { type: 'object',  description: 'Parameters the tool accepts' },
    save:        { type: 'boolean', description: 'Save tool for future use', default: true },
  };

  private toolsDir = path.join(process.cwd(), '.canvas-cli', 'custom-tools');

  constructor(private registry: ToolRegistry) {
    super();
    fs.ensureDirSync(this.toolsDir);
    void this.loadCustomTools();
  }

  async execute(params: {
    name: string;
    description: string;
    purpose: string;
    code: string;
    parameters: Record<string, any>;
    save?: boolean;
  }): Promise<string> {
    const { name, description, purpose = '', code, parameters, save = true } = params;

    // Validate before creating anything
    const validation = validateToolDefinition(name, description, code, purpose);
    if (!validation.valid) {
      const msg = [
        chalk.red(`✗ Cannot create tool "${name || '(unnamed)'}": validation failed`),
        ...validation.errors.map(e => chalk.yellow(`  • ${e}`)),
        chalk.dim('  Fix the issues above and try again.'),
      ].join('\n');
      console.log(msg);
      return `Tool creation rejected:\n${validation.errors.map(e => `• ${e}`).join('\n')}`;
    }

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
      await this.saveToolDefinition(name, description, purpose, code, parameters);
    }

    console.log(chalk.green(`✓ Tool "${name}" created and registered`));
    return `Successfully created tool: ${name}`;
  }

  private async saveToolDefinition(
    name: string,
    description: string,
    purpose: string,
    code: string,
    parameters: Record<string, any>
  ): Promise<void> {
    const toolPath = path.join(this.toolsDir, `${name}.json`);
    const toolDef = {
      name,
      description,
      purpose,       // why the tool was created — the user's original request
      code,
      parameters,
      created: new Date().toISOString(),
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
 * Self-Improvement Tool — understands natural language requests and generates
 * real tools using the local LLM. No hardcoded templates or pattern matching.
 */
export class SelfImprovementTool extends BaseTool {
  name = 'self_improve';
  description = 'Analyze a natural language user request, determine if a new tool is needed, and create one with a real name, description, and working implementation.';
  parameters = {
    request: { type: 'string', description: 'The user request in natural language' },
    context: { type: 'string', description: 'Recent conversation context', optional: true },
  };

  constructor(
    private registry: ToolRegistry,
    private toolCreator: DynamicToolCreator
  ) {
    super();
  }

  async execute(params: { request: string; context?: string }): Promise<any> {
    const { request, context } = params;

    if (!request?.trim()) {
      return { action: 'error', message: 'No request provided.' };
    }

    // Check existing tools before creating anything new
    const existing = this.registry.list();
    const existingNames = existing.map(t => `${t.name}: ${t.description}`).join('\n');

    console.log(chalk.cyan('🧠 Analyzing request — checking existing tools first...'));

    // Ask the LLM whether a new tool is needed and if so, design it
    const decision = await this.askLLM(request, context || '', existingNames);

    if (!decision.needsNewTool) {
      console.log(chalk.dim(`  existing tool sufficient: ${decision.suggestedTool || 'none needed'}`));
      return {
        action: 'no_improvement_needed',
        message: decision.reason || 'Current capabilities are sufficient for this request.',
        suggestedTool: decision.suggestedTool,
      };
    }

    // Validate what the LLM designed before creating
    const { name, description, purpose, code, parameters: toolParams } = decision;
    const validation = validateToolDefinition(name, description, code, purpose);

    if (!validation.valid) {
      console.log(chalk.yellow('⚠ LLM produced an invalid tool definition — skipping creation:'));
      validation.errors.forEach(e => console.log(chalk.dim(`  • ${e}`)));
      return {
        action: 'validation_failed',
        errors: validation.errors,
        message: 'Could not create a valid tool from this request. Try being more specific.',
      };
    }

    console.log(chalk.yellow(`📝 Creating tool: ${name}`));

    await this.toolCreator.execute({
      name,
      description,
      purpose,
      code,
      parameters: toolParams,
      save: true,
    });

    return {
      action: 'created_tool',
      tool: name,
      message: `Created tool "${name}" — ${description}`,
    };
  }

  /**
   * Ask the local Ollama LLM to analyse the request and design a tool (or decide
   * an existing one is sufficient). Returns a structured decision object.
   */
  private async askLLM(
    request: string,
    context: string,
    existingTools: string,
  ): Promise<{
    needsNewTool: boolean;
    reason?: string;
    suggestedTool?: string;
    name: string;
    description: string;
    purpose: string;
    code: string;
    parameters: Record<string, unknown>;
  }> {
    const { loadConfig } = await import('../config.js');
    const config = loadConfig();
    const baseUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
    const model = config.defaultModel || config.ollama?.defaultModel || 'qwen2.5:14b';

    const prompt = `You are a tool designer for a CLI assistant. A user made a request. Decide if a new tool is needed, and if so, design one.

EXISTING TOOLS (do not recreate these):
${existingTools || '(none)'}

USER REQUEST: ${request}
${context ? `\nCONTEXT: ${context}` : ''}

Rules for tool design:
- name: snake_case, 4–40 chars, descriptive (e.g. "compress_project_files", NOT "tool1" or "backup_tool")
- description: ≥20 chars, includes an action verb, explains exactly what it does
- purpose: copy the user's original request
- code: real JavaScript that uses fs-extra, path, chalk. Must actually implement the logic.
- parameters: object of { paramName: { type, description } }

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "needsNewTool": true or false,
  "reason": "why or why not",
  "suggestedTool": "existing tool name if needsNewTool=false, else null",
  "name": "snake_case_tool_name",
  "description": "What this tool does — action verb + specifics",
  "purpose": "The user's original request",
  "code": "// real JS implementation\\nconst fs = require('fs-extra');\\n...",
  "parameters": { "param1": { "type": "string", "description": "..." } }
}`;

    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.2, num_predict: 800 },
        }),
      });

      if (!res.ok) throw new Error(`Ollama returned ${res.status}`);

      const data = await res.json() as { response?: string };
      const raw = (data.response || '').trim();

      // Extract JSON from response (model may wrap in backticks)
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in LLM response');

      return JSON.parse(jsonMatch[0]);
    } catch (err: any) {
      console.log(chalk.dim(`  LLM design failed: ${err.message} — skipping tool creation`));
      return {
        needsNewTool: false,
        reason: 'LLM could not design a valid tool.',
        name: '', description: '', purpose: '', code: '', parameters: {},
      };
    }
  }
}