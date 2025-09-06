import { Tool } from '../types.js';
import { 
  ReadFileTool, 
  WriteFileTool, 
  EditFileTool, 
  ListDirectoryTool, 
  DeleteFileTool,
  SearchFilesTool 
} from './fileSystem.js';
import { ShellCommandTool, EnvironmentTool } from './shell.js';
import { WebFetchTool, WebSearchTool, APIRequestTool } from './web.js';
import { MemoryTool, RecallMemoryTool, ListMemoryTool } from './memory.js';
import { 
  ImageAnalysisTool,
  PDFProcessingTool,
  AudioTranscriptionTool,
  VideoAnalysisTool,
  DocumentProcessingTool,
  ScreenshotTool,
  QRCodeTool
} from './multimodal.js';
import {
  VSCodeWorkspaceTool,
  VSCodeSettingsTool,
  VSCodeExtensionsTool,
  VSCodeTasksTool,
  VSCodeLaunchTool,
  VSCodeSnippetsTool,
  VSCodeProjectContextTool,
  VSCodeAutoDetectTool
} from './vscode.js';
import {
  GitStatusTool,
  GitDiffTool,
  GitAddTool,
  GitCommitTool,
  GitPushTool,
  GitPullTool,
  GitBranchTool,
  GitLogTool,
  GitStashTool,
  GitCloneTool,
  GitMergeTool,
  GitResetTool,
  GitHubPRTool
} from './git.js';
import {
  WatchFilesTool,
  StopWatchingTool,
  ListWatchersTool,
  AutoReloadContextTool,
  FileChangeTrackerTool
} from './fileWatcher.js';
import { SmartContextTool } from './contextManager.js';
import { 
  ReadManyFilesTool, 
  GlobTool, 
  MultiEditTool, 
  FileCompareTool 
} from './multiFileOperations.js';
import { MCPTool } from './mcpIntegration.js';
import { 
  DynamicToolCreator, 
  ToolIntrospector, 
  SelfImprovementTool 
} from './dynamicToolCreator.js';
import { WebBuilderTool } from './webBuilder.js';
import { WebCrawlerTool } from './webCrawler.js';
import { KnowledgeSearchTool } from './knowledgeSearch.js';
import { NaturalExecutor } from './naturalExecutor.js';
import { cliIntegrations } from './cliIntegrations.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private enabledTools: Set<string> = new Set();
  private dynamicToolCreator!: DynamicToolCreator;

  constructor() {
    this.registerDefaultTools();
    this.registerSelfAwarenessTools();
  }

  private registerDefaultTools(): void {
    // File system tools
    this.register(new ReadFileTool());
    this.register(new WriteFileTool());
    this.register(new EditFileTool());
    this.register(new ListDirectoryTool());
    this.register(new DeleteFileTool());
    this.register(new SearchFilesTool());

    // Shell tools
    this.register(new ShellCommandTool());
    this.register(new EnvironmentTool());

    // Web tools
    this.register(new WebFetchTool());
    this.register(new WebSearchTool());
    this.register(new APIRequestTool());

    // Memory tools
    this.register(new MemoryTool());
    this.register(new RecallMemoryTool());
    this.register(new ListMemoryTool());

    // Multi-modal tools
    this.register(new ImageAnalysisTool());
    this.register(new PDFProcessingTool());
    this.register(new AudioTranscriptionTool());
    this.register(new VideoAnalysisTool());
    this.register(new DocumentProcessingTool());
    this.register(new ScreenshotTool());
    this.register(new QRCodeTool());

    // VSCode integration tools
    this.register(new VSCodeWorkspaceTool());
    this.register(new VSCodeSettingsTool());
    this.register(new VSCodeExtensionsTool());
    this.register(new VSCodeTasksTool());
    this.register(new VSCodeLaunchTool());
    this.register(new VSCodeSnippetsTool());
    this.register(new VSCodeProjectContextTool());
    this.register(new VSCodeAutoDetectTool());

    // Git integration tools
    this.register(new GitStatusTool());
    this.register(new GitDiffTool());
    this.register(new GitAddTool());
    this.register(new GitCommitTool());
    this.register(new GitPushTool());
    this.register(new GitPullTool());
    this.register(new GitBranchTool());
    this.register(new GitLogTool());
    this.register(new GitStashTool());
    this.register(new GitCloneTool());
    this.register(new GitMergeTool());
    this.register(new GitResetTool());
    this.register(new GitHubPRTool());

    // File watching tools
    this.register(new WatchFilesTool());
    this.register(new StopWatchingTool());
    this.register(new ListWatchersTool());
    this.register(new AutoReloadContextTool());
    this.register(new FileChangeTrackerTool());

    // Smart context management
    this.register(new SmartContextTool());

    // Multi-file operation tools
    this.register(new ReadManyFilesTool());
    this.register(new GlobTool());
    this.register(new MultiEditTool());
    this.register(new FileCompareTool());

    // MCP integration
    this.register(new MCPTool());

    // Web/App Builder tool
    this.register(new WebBuilderTool());

    // Knowledge management tools
    this.register(new WebCrawlerTool());
    this.register(new KnowledgeSearchTool());

    // Natural language execution
    this.register(new NaturalExecutor());
    
    // Register CLI integrations
    this.register(new cliIntegrations.fzf());
    this.register(new cliIntegrations.bpytop());
    this.register(new cliIntegrations.tmux());
    this.register(new cliIntegrations.lazygit());
    this.register(new cliIntegrations.gh());
    this.register(new cliIntegrations.entr());
    this.register(new cliIntegrations.just());
    this.register(new cliIntegrations.taskwarrior());
    this.register(new cliIntegrations.tldr());
    this.register(new cliIntegrations.pet());

    // Enable all tools by default
    this.tools.forEach((_, name) => this.enabledTools.add(name));
  }

  private registerSelfAwarenessTools(): void {
    // Self-awareness and dynamic capabilities
    this.dynamicToolCreator = new DynamicToolCreator(this);
    this.register(this.dynamicToolCreator);
    this.register(new ToolIntrospector(this));
    this.register(new SelfImprovementTool(this, this.dynamicToolCreator));
    
    console.log('🧠 Self-awareness tools initialized');
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
    this.enabledTools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listEnabled(): Tool[] {
    return Array.from(this.tools.values()).filter(tool => 
      this.enabledTools.has(tool.name)
    );
  }

  enable(name: string): void {
    if (this.tools.has(name)) {
      this.enabledTools.add(name);
    }
  }

  disable(name: string): void {
    this.enabledTools.delete(name);
  }

  isEnabled(name: string): boolean {
    return this.enabledTools.has(name);
  }

  async execute(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    
    if (!this.enabledTools.has(name)) {
      throw new Error(`Tool is disabled: ${name}`);
    }

    // Type assertion to access the run method
    return await (tool as any).run(params);
  }

  getToolDefinitions(): any[] {
    return this.listEnabled().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters || {},
          required: Object.keys(tool.parameters || {}).filter(key => 
            !tool.parameters?.[key]?.optional
          )
        }
      }
    }));
  }
}