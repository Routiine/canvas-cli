import { Tool, ToolParameterDefinition } from '../types.js';

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameterDefinition>;
      required: string[];
    };
  };
}
import {
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  ListDirectoryTool,
  DeleteFileTool,
  SearchFilesTool,
  GrepTool
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
import {
  GitLabMRTool,
  GitLabPipelineTool,
  GitLabIssueTool,
  JiraIssueTool,
  JiraSprintTool,
  JiraReportTool,
  SlackMessageTool,
  SlackNotificationTool,
  SlackChannelTool,
  IntegrationAuthTool
} from './integrations.js';
import { TaskTool, TaskOutputTool, ListTasksTool } from './taskTool.js';
import { CORE_TOOLS, getAllExtraTools } from './categories.js';
import { ThemeManager } from '../themes.js';

// New Kilo-style tools
import {
  BrowserLaunchTool,
  BrowserNavigateTool,
  BrowserClickTool,
  BrowserTypeTool,
  BrowserScreenshotTool,
  BrowserGetContentTool,
  BrowserEvaluateTool,
  BrowserWaitTool,
  BrowserScrollTool,
  BrowserCloseTool
} from './browser.js';
import {
  RunTestsTool,
  TypeCheckTool,
  LintTool,
  BuildTool,
  VerifyChangesTool
} from './verification.js';
import {
  IndexCodebaseTool,
  SearchCodebaseTool,
  FindSymbolTool,
  IndexStatsTool
} from './codebaseIndex.js';
import {
  CloudAgentLaunchTool,
  CloudAgentStatusTool,
  CloudAgentListTool,
  CloudAgentLogsTool,
  CloudAgentStopTool
} from './cloudAgents.js';
import {
  AutoRecoverTool,
  RetryWithRecoveryTool,
  WatchAndRecoverTool,
  RecoveryHistoryTool
} from './failureRecovery.js';
import {
  CodeReviewTool,
  ReviewDiffTool,
  ReviewPRTool
} from './codeReview.js';
import {
  VoiceInputTool,
  VoiceCommandTool,
  TextToSpeechTool,
  TranscribeFileTool,
  VoiceConfigTool
} from './voice.js';
import {
  WorktreeCreateTool,
  WorktreeListTool,
  WorktreeRemoveTool,
  ParallelAgentTool,
  ParallelAgentsStatusTool,
  MergeWorktreeTool,
  CleanupWorktreesTool
} from './worktreeAgents.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private enabledTools: Set<string> = new Set();
  private dynamicToolCreator!: DynamicToolCreator;
  private theme: ThemeManager;

  constructor(theme?: ThemeManager) {
    this.theme = theme || new ThemeManager('slate');
    this.registerDefaultTools();
    this.registerAgentTools();
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
    this.register(new GrepTool());

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

    // Register third-party integrations
    this.register(new IntegrationAuthTool());
    this.register(new GitLabMRTool());
    this.register(new GitLabPipelineTool());
    this.register(new GitLabIssueTool());
    this.register(new JiraIssueTool());
    this.register(new JiraSprintTool());
    this.register(new JiraReportTool());
    this.register(new SlackMessageTool());
    this.register(new SlackNotificationTool());
    this.register(new SlackChannelTool());

    // Browser automation tools (Puppeteer)
    this.register(new BrowserLaunchTool());
    this.register(new BrowserNavigateTool());
    this.register(new BrowserClickTool());
    this.register(new BrowserTypeTool());
    this.register(new BrowserScreenshotTool());
    this.register(new BrowserGetContentTool());
    this.register(new BrowserEvaluateTool());
    this.register(new BrowserWaitTool());
    this.register(new BrowserScrollTool());
    this.register(new BrowserCloseTool());

    // Self-verification tools
    this.register(new RunTestsTool());
    this.register(new TypeCheckTool());
    this.register(new LintTool());
    this.register(new BuildTool());
    this.register(new VerifyChangesTool());

    // Codebase indexing tools
    this.register(new IndexCodebaseTool());
    this.register(new SearchCodebaseTool());
    this.register(new FindSymbolTool());
    this.register(new IndexStatsTool());

    // Cloud agent tools
    this.register(new CloudAgentLaunchTool());
    this.register(new CloudAgentStatusTool());
    this.register(new CloudAgentListTool());
    this.register(new CloudAgentLogsTool());
    this.register(new CloudAgentStopTool());

    // Automatic failure recovery tools
    this.register(new AutoRecoverTool());
    this.register(new RetryWithRecoveryTool());
    this.register(new WatchAndRecoverTool());
    this.register(new RecoveryHistoryTool());

    // Code review tools
    this.register(new CodeReviewTool());
    this.register(new ReviewDiffTool());
    this.register(new ReviewPRTool());

    // Voice prompting tools
    this.register(new VoiceInputTool());
    this.register(new VoiceCommandTool());
    this.register(new TextToSpeechTool());
    this.register(new TranscribeFileTool());
    this.register(new VoiceConfigTool());

    // Git worktree parallel agent tools
    this.register(new WorktreeCreateTool());
    this.register(new WorktreeListTool());
    this.register(new WorktreeRemoveTool());
    this.register(new ParallelAgentTool());
    this.register(new ParallelAgentsStatusTool());
    this.register(new MergeWorktreeTool());
    this.register(new CleanupWorktreesTool());

    // Enable all tools by default
    this.tools.forEach((_, name) => this.enabledTools.add(name));
  }

  private registerAgentTools(): void {
    // Task/Agent tools (like Claude Code's Task tool)
    this.register(new TaskTool(this.theme, this));
    this.register(new TaskOutputTool(this.theme, this));
    this.register(new ListTasksTool(this.theme, this));

    this.enabledTools.add('task');
    this.enabledTools.add('task_output');
    this.enabledTools.add('list_tasks');
  }

  private registerSelfAwarenessTools(): void {
    // Self-awareness and dynamic capabilities
    this.dynamicToolCreator = new DynamicToolCreator(this);
    this.register(this.dynamicToolCreator);
    this.register(new ToolIntrospector(this));
    this.register(new SelfImprovementTool(this, this.dynamicToolCreator));

    // Enable these tools (they were registered after the default enable loop)
    this.enabledTools.add('create_tool');
    this.enabledTools.add('introspect_tools');
    this.enabledTools.add('self_improve');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async execute(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    if (!this.enabledTools.has(name)) {
      throw new Error(`Tool is disabled: ${name}`);
    }

    // Check if tool has a run method (BaseTool), otherwise use execute directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolWithRun = tool as Tool & { run?: (params: any) => Promise<any> };
    if (typeof toolWithRun.run === 'function') {
      return await toolWithRun.run(params);
    }
    return await tool.execute(params);
  }

  getToolDefinitions(): ToolDefinition[] {
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

  /**
   * List core tools only
   */
  listCore(): Tool[] {
    return this.list().filter(tool =>
      (CORE_TOOLS as readonly string[]).includes(tool.name)
    );
  }

  /**
   * List extra tools only
   */
  listExtra(): Tool[] {
    const extraTools = getAllExtraTools();
    return this.list().filter(tool => extraTools.includes(tool.name));
  }

  /**
   * Get tool count summary
   */
  getToolSummary(): { core: number; extra: number; total: number } {
    return {
      core: this.listCore().length,
      extra: this.listExtra().length,
      total: this.list().length
    };
  }
}