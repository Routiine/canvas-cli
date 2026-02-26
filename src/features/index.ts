/**
 * Canvas CLI Features - Main Integration File
 * Exports all Canvas CLI advanced features (lazy-loaded for fast startup)
 */

/**
 * Feature Manager - Manages lifecycle of all features (fully lazy)
 */
export class FeatureManager {
  private initialized: boolean = false;
  private _features: Record<string, any> | null = null;

  private async loadFeatures() {
    if (this._features) return this._features;

    const [
      { getBlockSystem },
      { getNotebookSystem },
      { getSessionSharing },
      { getWorkflowSystem },
      { getAIAutofillSystem },
      { getProjectLevelAIRules },
      { getActiveAIRecommendations },
      { getAIModelSelection },
      { getTeamKnowledgeBase },
      { getPerformanceDashboard },
      { getSecretRedactionSystem },
      { getIncidentResponseMode },
      { getCommandPalette },
      { getVoiceCommands },
      { getWebInterface },
      { getMultimodalContext },
      { getCommandDiffing },
      { getPersistentWorkspaceState },
      { getMCP }
    ] = await Promise.all([
      import('./blocks/blockSystem.js'),
      import('./notebooks/notebookSystem.js'),
      import('./collaboration/sessionSharing.js'),
      import('./workflows/workflowSystem.js'),
      import('./ai/aiAutofill.js'),
      import('./ai/projectRules.js'),
      import('./ai/activeRecommendations.js'),
      import('./ai/modelSelection.js'),
      import('./team/knowledgeBase.js'),
      import('./monitoring/performanceDashboard.js'),
      import('./security/secretRedaction.js'),
      import('./incident/incidentResponse.js'),
      import('./palette/commandPalette.js'),
      import('./voice/voiceCommand.js'),
      import('./web/webInterface.js'),
      import('./attachments/multimodalContext.js'),
      import('./tools/commandDiff.js'),
      import('./workspace/workspaceState.js'),
      import('./mcp/modelContextProtocol.js')
    ]);

    this._features = {
      blocks: getBlockSystem(),
      notebooks: getNotebookSystem(),
      sessionSharing: getSessionSharing(),
      workflows: getWorkflowSystem(),
      aiAutofill: getAIAutofillSystem(),
      projectRules: getProjectLevelAIRules(),
      recommendations: getActiveAIRecommendations(),
      modelSelection: getAIModelSelection(),
      knowledgeBase: getTeamKnowledgeBase(),
      performanceMonitor: getPerformanceDashboard(),
      secretRedaction: getSecretRedactionSystem(),
      incidentResponse: getIncidentResponseMode(),
      commandPalette: getCommandPalette(),
      voiceCommands: getVoiceCommands(),
      webInterface: getWebInterface(),
      multimodalContext: getMultimodalContext(),
      commandDiff: getCommandDiffing(),
      workspaceState: getPersistentWorkspaceState(),
      mcp: getMCP()
    };
    return this._features;
  }

  /**
   * Initialize all features
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('! Initializing Canvas CLI Features...');

    try {
      const features = await this.loadFeatures();

      // Start voice system if available
      if (features.voiceCommands) {
        await features.voiceCommands.initialize().catch(() => {
          // Voice commands not available on this platform
        });
      }

      // Discover MCP servers
      if (features.mcp) {
        await features.mcp.discoverServers();
      }

      // Load workspace state
      if (features.workspaceState) {
        const workspaces = await features.workspaceState.listWorkspaces();
        if (workspaces.length > 0) {
          await features.workspaceState.loadWorkspace(workspaces[0].id);
        }
      }

      this.initialized = true;
    } catch (error: any) {
      console.error('Failed to initialize features:', error);
      throw error;
    }
  }

  /**
   * Get all features organized by category
   */
  getFeatures() {
    const f = this._features;
    if (!f) return null;

    return {
      ai: {
        autofill: f.aiAutofill,
        projectRules: f.projectRules,
        recommendations: f.recommendations,
        modelSelection: f.modelSelection
      },
      collaboration: {
        sessionSharing: f.sessionSharing,
        knowledgeBase: f.knowledgeBase
      },
      productivity: {
        commandPalette: f.commandPalette,
        blocks: f.blocks,
        workflows: f.workflows,
        workspaceState: f.workspaceState,
        notebooks: f.notebooks
      },
      security: {
        secretRedaction: f.secretRedaction,
        incidentResponse: f.incidentResponse,
        performanceMonitor: f.performanceMonitor
      },
      interfaces: {
        webInterface: f.webInterface,
        voiceCommand: f.voiceCommands,
        multimodalContext: f.multimodalContext
      },
      tools: {
        commandDiff: f.commandDiff,
        mcp: f.mcp
      }
    };
  }

  /**
   * Shutdown all features gracefully
   */
  async shutdown(): Promise<void> {
    const f = this._features;
    if (!f) return;

    if (f.performanceMonitor) await f.performanceMonitor.stop();
    if (f.voiceCommands) await f.voiceCommands.stopListening();
    if (f.webInterface) await f.webInterface.stop();
    if (f.incidentResponse) f.incidentResponse.deactivate();
  }
}

// Singleton instance
let featureManager: FeatureManager | null = null;

/**
 * Initialize and get the feature manager
 */
export async function initializeCanvasFeatures(): Promise<FeatureManager> {
  if (!featureManager) {
    featureManager = new FeatureManager();
    await featureManager.initialize();
  }
  return featureManager;
}

/**
 * Get feature manager without initialization
 */
export function getFeatureManager(): FeatureManager {
  if (!featureManager) {
    featureManager = new FeatureManager();
  }
  return featureManager;
}

/**
 * Convenience namespace for accessing features (lazy)
 */
export const CanvasFeatures = {
  getAI: () => getFeatureManager().getFeatures()?.ai,
  getCollaboration: () => getFeatureManager().getFeatures()?.collaboration,
  getProductivity: () => getFeatureManager().getFeatures()?.productivity,
  getSecurity: () => getFeatureManager().getFeatures()?.security,
  getInterfaces: () => getFeatureManager().getFeatures()?.interfaces,
  getTools: () => getFeatureManager().getFeatures()?.tools,

  // Direct feature access via dynamic imports
  features: {
    blocks: async () => (await import('./blocks/blockSystem.js')).getBlockSystem,
    notebooks: async () => (await import('./notebooks/notebookSystem.js')).getNotebookSystem,
    sessionSharing: async () => (await import('./collaboration/sessionSharing.js')).getSessionSharing,
    workflows: async () => (await import('./workflows/workflowSystem.js')).getWorkflowSystem,
    aiAutofill: async () => (await import('./ai/aiAutofill.js')).getAIAutofillSystem,
    projectRules: async () => (await import('./ai/projectRules.js')).getProjectLevelAIRules,
    recommendations: async () => (await import('./ai/activeRecommendations.js')).getActiveAIRecommendations,
    modelSelection: async () => (await import('./ai/modelSelection.js')).getAIModelSelection,
    knowledgeBase: async () => (await import('./team/knowledgeBase.js')).getTeamKnowledgeBase,
    performanceMonitor: async () => (await import('./monitoring/performanceDashboard.js')).getPerformanceDashboard,
    secretRedaction: async () => (await import('./security/secretRedaction.js')).getSecretRedactionSystem,
    incidentResponse: async () => (await import('./incident/incidentResponse.js')).getIncidentResponseMode,
    commandPalette: async () => (await import('./palette/commandPalette.js')).getCommandPalette,
    voiceCommands: async () => (await import('./voice/voiceCommand.js')).getVoiceCommands,
    webInterface: async () => (await import('./web/webInterface.js')).getWebInterface,
    multimodalContext: async () => (await import('./attachments/multimodalContext.js')).getMultimodalContext,
    commandDiff: async () => (await import('./tools/commandDiff.js')).getCommandDiffing,
    workspaceState: async () => (await import('./workspace/workspaceState.js')).getPersistentWorkspaceState,
    mcp: async () => (await import('./mcp/modelContextProtocol.js')).getMCP
  }
};
