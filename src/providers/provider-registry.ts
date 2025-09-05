/**
 * Provider registry for managing multiple AI providers
 */

import { Provider, ProviderMetadata, ProviderConfig } from './base-provider.js';
import { OllamaProvider } from './ollama-provider.js';

export type ProviderType = 'ollama' | 'openai' | 'anthropic' | 'google';

export interface RegisteredProvider {
  type: ProviderType;
  instance: Provider;
  config: ProviderConfig;
  enabled: boolean;
  metadata: ProviderMetadata;
}

/**
 * Registry for managing AI providers
 */
export class ProviderRegistry {
  private providers: Map<ProviderType, RegisteredProvider> = new Map();
  private activeProvider: ProviderType | null = null;
  private defaultProvider: ProviderType = 'ollama';

  constructor() {
    // Register built-in providers
    this.registerBuiltInProviders();
  }

  /**
   * Register a provider
   */
  async registerProvider(
    type: ProviderType, 
    provider: Provider, 
    config: ProviderConfig = {},
    enabled = true
  ): Promise<void> {
    try {
      // Initialize the provider
      await provider.initialize(config);
      
      const metadata = provider.getMetadata();
      
      const registered: RegisteredProvider = {
        type,
        instance: provider,
        config,
        enabled: enabled && provider.isConfigured(),
        metadata
      };

      this.providers.set(type, registered);
      
      console.log(`Registered provider: ${metadata.displayName} (${type})`);
      
      // Set as active if first provider or if no active provider
      if (!this.activeProvider && registered.enabled) {
        this.activeProvider = type;
        console.log(`Set ${type} as active provider`);
      }
    } catch (error) {
      console.warn(`Failed to register provider ${type}:`, error);
      
      // Still register but mark as disabled
      const registered: RegisteredProvider = {
        type,
        instance: provider,
        config,
        enabled: false,
        metadata: provider.getMetadata()
      };
      this.providers.set(type, registered);
    }
  }

  /**
   * Get a provider by type
   */
  getProvider(type: ProviderType): RegisteredProvider | null {
    return this.providers.get(type) || null;
  }

  /**
   * Get the active provider
   */
  getActiveProvider(): RegisteredProvider | null {
    if (!this.activeProvider) {
      return null;
    }
    return this.getProvider(this.activeProvider);
  }

  /**
   * Set the active provider
   */
  setActiveProvider(type: ProviderType): boolean {
    const provider = this.getProvider(type);
    if (!provider) {
      console.error(`Provider ${type} not found`);
      return false;
    }
    
    if (!provider.enabled) {
      console.error(`Provider ${type} is not enabled`);
      return false;
    }
    
    this.activeProvider = type;
    console.log(`Switched to provider: ${provider.metadata.displayName} (${type})`);
    return true;
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): Map<ProviderType, RegisteredProvider> {
    return new Map(this.providers);
  }

  /**
   * Get enabled providers
   */
  getEnabledProviders(): Array<RegisteredProvider> {
    return Array.from(this.providers.values()).filter(p => p.enabled);
  }

  /**
   * Enable a provider
   */
  async enableProvider(type: ProviderType): Promise<boolean> {
    const provider = this.getProvider(type);
    if (!provider) {
      console.error(`Provider ${type} not found`);
      return false;
    }

    try {
      // Test the connection
      const connected = await provider.instance.testConnection();
      if (connected) {
        provider.enabled = true;
        console.log(`Enabled provider: ${provider.metadata.displayName} (${type})`);
        
        // Set as active if no active provider
        if (!this.activeProvider) {
          this.activeProvider = type;
        }
        
        return true;
      } else {
        console.error(`Failed to connect to provider ${type}`);
        return false;
      }
    } catch (error) {
      console.error(`Error enabling provider ${type}:`, error);
      return false;
    }
  }

  /**
   * Disable a provider
   */
  disableProvider(type: ProviderType): void {
    const provider = this.getProvider(type);
    if (!provider) {
      console.error(`Provider ${type} not found`);
      return;
    }

    provider.enabled = false;
    console.log(`Disabled provider: ${provider.metadata.displayName} (${type})`);

    // Switch to another provider if this was active
    if (this.activeProvider === type) {
      const enabledProviders = this.getEnabledProviders();
      if (enabledProviders.length > 0) {
        this.activeProvider = enabledProviders[0].type;
        console.log(`Switched to provider: ${enabledProviders[0].metadata.displayName} (${this.activeProvider})`);
      } else {
        this.activeProvider = null;
        console.log('No enabled providers remaining');
      }
    }
  }

  /**
   * Update provider configuration
   */
  async updateProviderConfig(type: ProviderType, config: ProviderConfig): Promise<boolean> {
    const provider = this.getProvider(type);
    if (!provider) {
      console.error(`Provider ${type} not found`);
      return false;
    }

    try {
      provider.config = { ...provider.config, ...config };
      await provider.instance.initialize(provider.config);
      
      const wasEnabled = provider.enabled;
      provider.enabled = provider.instance.isConfigured();
      
      if (!wasEnabled && provider.enabled) {
        console.log(`Provider ${type} is now enabled after configuration update`);
      } else if (wasEnabled && !provider.enabled) {
        console.log(`Provider ${type} is now disabled after configuration update`);
        
        // Switch away if this was active
        if (this.activeProvider === type) {
          const enabledProviders = this.getEnabledProviders();
          this.activeProvider = enabledProviders.length > 0 ? enabledProviders[0].type : null;
        }
      }

      return true;
    } catch (error) {
      console.error(`Error updating provider ${type} configuration:`, error);
      return false;
    }
  }

  /**
   * Test all providers
   */
  async testAllProviders(): Promise<Map<ProviderType, boolean>> {
    const results = new Map<ProviderType, boolean>();
    
    for (const [type, provider] of this.providers) {
      try {
        const connected = await provider.instance.testConnection();
        results.set(type, connected);
        
        if (connected && !provider.enabled) {
          provider.enabled = true;
          console.log(`Auto-enabled provider: ${provider.metadata.displayName} (${type})`);
        } else if (!connected && provider.enabled) {
          provider.enabled = false;
          console.log(`Auto-disabled provider: ${provider.metadata.displayName} (${type})`);
        }
      } catch (error) {
        results.set(type, false);
        if (provider.enabled) {
          provider.enabled = false;
          console.log(`Auto-disabled provider: ${provider.metadata.displayName} (${type}) - ${error}`);
        }
      }
    }

    // Update active provider if needed
    if (this.activeProvider && !this.getProvider(this.activeProvider)?.enabled) {
      const enabledProviders = this.getEnabledProviders();
      this.activeProvider = enabledProviders.length > 0 ? enabledProviders[0].type : null;
    }

    return results;
  }

  /**
   * Get provider status summary
   */
  getStatusSummary(): {
    totalProviders: number;
    enabledProviders: number;
    activeProvider: string | null;
    providers: Array<{
      type: ProviderType;
      name: string;
      enabled: boolean;
      configured: boolean;
      status: string;
    }>;
  } {
    const providers = Array.from(this.providers.entries()).map(([type, provider]) => ({
      type,
      name: provider.metadata.displayName,
      enabled: provider.enabled,
      configured: provider.instance.isConfigured(),
      status: provider.instance.getProviderInfo().status
    }));

    return {
      totalProviders: this.providers.size,
      enabledProviders: providers.filter(p => p.enabled).length,
      activeProvider: this.activeProvider 
        ? this.getProvider(this.activeProvider)?.metadata.displayName || null
        : null,
      providers
    };
  }

  /**
   * Export registry configuration
   */
  exportConfig(): any {
    const config: any = {};
    
    for (const [type, provider] of this.providers) {
      config[type] = {
        enabled: provider.enabled,
        config: provider.config
      };
    }
    
    config._activeProvider = this.activeProvider;
    config._defaultProvider = this.defaultProvider;
    
    return config;
  }

  /**
   * Import registry configuration
   */
  async importConfig(config: any): Promise<void> {
    if (config._defaultProvider) {
      this.defaultProvider = config._defaultProvider;
    }
    
    for (const [type, providerConfig] of Object.entries(config)) {
      if (type.startsWith('_')) continue; // Skip metadata keys
      
      const typedType = type as ProviderType;
      const provider = this.getProvider(typedType);
      
      if (provider && providerConfig && typeof providerConfig === 'object') {
        const cfg = providerConfig as any;
        if (cfg.config) {
          await this.updateProviderConfig(typedType, cfg.config);
        }
        if (typeof cfg.enabled === 'boolean') {
          if (cfg.enabled) {
            await this.enableProvider(typedType);
          } else {
            this.disableProvider(typedType);
          }
        }
      }
    }
    
    if (config._activeProvider && this.getProvider(config._activeProvider)?.enabled) {
      this.setActiveProvider(config._activeProvider);
    }
  }

  // Private methods

  private registerBuiltInProviders(): void {
    // Register Ollama provider by default
    const ollamaProvider = new OllamaProvider();
    this.registerProvider('ollama', ollamaProvider, {}, true).catch(error => {
      console.warn('Failed to register Ollama provider:', error);
    });
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();