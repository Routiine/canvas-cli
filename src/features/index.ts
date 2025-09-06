/**
 * Canvas CLI Features - Main Integration File
 * Exports all Canvas CLI advanced features
 */

// Import all feature systems
import { getBlockSystem } from './blocks/blockSystem.js';
import { getNotebookSystem } from './notebooks/notebookSystem.js';
import { getSessionSharing } from './collaboration/sessionSharing.js';
import { getWorkflowSystem } from './workflows/workflowSystem.js';
import { getMultimodalContext } from './attachments/multimodalContext.js';
import { getMCP } from './mcp/modelContextProtocol.js';
import { getVoiceCommands } from './voice/voiceCommand.js';
import { getCommandPalette } from './palette/commandPalette.js';
import { getPerformanceDashboard } from './monitoring/performanceDashboard.js';
import { getSecretRedactionSystem } from './security/secretRedaction.js';
import { getWebInterface } from './web/webInterface.js';
import { getAIAutofillSystem } from './ai/aiAutofill.js';
import { getProjectLevelAIRules } from './ai/projectRules.js';
import { getActiveAIRecommendations } from './ai/activeRecommendations.js';
import { getCommandDiffing } from './tools/commandDiff.js';
import { getPersistentWorkspaceState } from './workspace/workspaceState.js';
import { getAIModelSelection } from './ai/modelSelection.js';
import { getTeamKnowledgeBase } from './team/knowledgeBase.js';
import { getIncidentResponseMode } from './incident/incidentResponse.js';

// Export types from features

/**
 * Feature Manager - Manages lifecycle of all features
 */
export class FeatureManager {
  private initialized: boolean = false;
  
  // Feature instances
  private features = {
    // Core Systems
    blocks: getBlockSystem(),
    notebooks: getNotebookSystem(),
    sessionSharing: getSessionSharing(),
    workflows: getWorkflowSystem(),
    
    // AI & Intelligence
    aiAutofill: getAIAutofillSystem(),
    projectRules: getProjectLevelAIRules(),
    recommendations: getActiveAIRecommendations(),
    modelSelection: getAIModelSelection(),
    
    // Collaboration
    knowledgeBase: getTeamKnowledgeBase(),
    
    // Security & Monitoring
    performanceMonitor: getPerformanceDashboard(),
    secretRedaction: getSecretRedactionSystem(),
    incidentResponse: getIncidentResponseMode(),
    
    // Interfaces
    commandPalette: getCommandPalette(),
    voiceCommands: getVoiceCommands(),
    webInterface: getWebInterface(),
    multimodalContext: getMultimodalContext(),
    
    // Tools
    commandDiff: getCommandDiffing(),
    workspaceState: getPersistentWorkspaceState(),
    mcp: getMCP()
  };
  
  /**
   * Initialize all features
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    console.log('🚀 Initializing Canvas CLI Features...');
    
    // Initialize features that need setup
    try {
      // Start voice system if available
      if (this.features.voiceCommands) {
        await this.features.voiceCommands.initialize().catch(() => {
          console.log('Voice commands not available on this platform');
        });
      }
      
      // Discover MCP servers
      if (this.features.mcp) {
        await this.features.mcp.discoverServers();
      }
      
      // Load workspace state
      if (this.features.workspaceState) {
        const workspaces = await this.features.workspaceState.listWorkspaces();
        if (workspaces.length > 0) {
          await this.features.workspaceState.loadWorkspace(workspaces[0].id);
        }
      }
      
      this.initialized = true;
      console.log('✅ Canvas CLI Features initialized');
    } catch (error: any) {
      console.error('Failed to initialize features:', error);
      throw error;
    }
  }
  
  /**
   * Get all features organized by category
   */
  getFeatures() {
    return {
      ai: {
        autofill: this.features.aiAutofill,
        projectRules: this.features.projectRules,
        recommendations: this.features.recommendations,
        modelSelection: this.features.modelSelection
      },
      collaboration: {
        sessionSharing: this.features.sessionSharing,
        knowledgeBase: this.features.knowledgeBase
      },
      productivity: {
        commandPalette: this.features.commandPalette,
        blocks: this.features.blocks,
        workflows: this.features.workflows,
        workspaceState: this.features.workspaceState,
        notebooks: this.features.notebooks
      },
      security: {
        secretRedaction: this.features.secretRedaction,
        incidentResponse: this.features.incidentResponse,
        performanceMonitor: this.features.performanceMonitor
      },
      interfaces: {
        webInterface: this.features.webInterface,
        voiceCommand: this.features.voiceCommands,
        multimodalContext: this.features.multimodalContext
      },
      tools: {
        commandDiff: this.features.commandDiff,
        mcp: this.features.mcp
      }
    };
  }
  
  /**
   * Shutdown all features gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down Canvas CLI Features...');
    
    // Stop monitoring
    if (this.features.performanceMonitor) {
      await this.features.performanceMonitor.stop();
    }
    
    // Stop voice
    if (this.features.voiceCommands) {
      await this.features.voiceCommands.stopListening();
    }
    
    // Stop web interface
    if (this.features.webInterface) {
      await this.features.webInterface.stop();
    }
    
    // Deactivate incident mode
    if (this.features.incidentResponse) {
      this.features.incidentResponse.deactivate();
    }
    
    console.log('Canvas CLI Features shut down');
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
 * Convenience namespace for accessing features
 */
export const CanvasFeatures = {
  // Get feature categories
  getAI: () => getFeatureManager().getFeatures().ai,
  getCollaboration: () => getFeatureManager().getFeatures().collaboration,
  getProductivity: () => getFeatureManager().getFeatures().productivity,
  getSecurity: () => getFeatureManager().getFeatures().security,
  getInterfaces: () => getFeatureManager().getFeatures().interfaces,
  getTools: () => getFeatureManager().getFeatures().tools,
  
  // Direct feature access
  features: {
    blocks: getBlockSystem,
    notebooks: getNotebookSystem,
    sessionSharing: getSessionSharing,
    workflows: getWorkflowSystem,
    aiAutofill: getAIAutofillSystem,
    projectRules: getProjectLevelAIRules,
    recommendations: getActiveAIRecommendations,
    modelSelection: getAIModelSelection,
    knowledgeBase: getTeamKnowledgeBase,
    performanceMonitor: getPerformanceDashboard,
    secretRedaction: getSecretRedactionSystem,
    incidentResponse: getIncidentResponseMode,
    commandPalette: getCommandPalette,
    voiceCommands: getVoiceCommands,
    webInterface: getWebInterface,
    multimodalContext: getMultimodalContext,
    commandDiff: getCommandDiffing,
    workspaceState: getPersistentWorkspaceState,
    mcp: getMCP
  }
};

// Export everything for convenience
export * from './blocks/blockSystem.js';
export * from './notebooks/notebookSystem.js';
export * from './collaboration/sessionSharing.js';
export * from './workflows/workflowSystem.js';
export * from './attachments/multimodalContext.js';
export * from './mcp/modelContextProtocol.js';
export * from './voice/voiceCommand.js';
export * from './palette/commandPalette.js';
export * from './monitoring/performanceDashboard.js';
export * from './security/secretRedaction.js';
export * from './web/webInterface.js';
export * from './ai/aiAutofill.js';
export * from './ai/projectRules.js';
export * from './ai/activeRecommendations.js';
export * from './tools/commandDiff.js';
export * from './workspace/workspaceState.js';
export * from './ai/modelSelection.js';
export * from './team/knowledgeBase.js';
export * from './incident/incidentResponse.js';