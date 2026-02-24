/**
 * MCP Configuration Loader
 * Loads and merges MCP server configs from multiple sources:
 * - User-level: ~/.canvas/mcp.json
 * - Project-level: .mcp.json (in project root)
 * - Legacy: .canvas-cli/mcp-config.json
 */

import fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import type { MCPServer, MCPConfig } from './mcp-manager.js';

export interface MCPConfigSource {
  path: string;
  scope: 'user' | 'project' | 'legacy';
  config: MCPConfig;
}

const USER_CONFIG_PATH = path.join(os.homedir(), '.canvas', 'mcp.json');
const PROJECT_CONFIG_NAME = '.mcp.json';
const LEGACY_CONFIG_NAME = path.join('.canvas-cli', 'mcp-config.json');

/**
 * Load a single MCP config file
 */
function loadConfigFile(filePath: string): MCPConfig | null {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readJsonSync(filePath);
      // Support both { servers: [...] } and { mcpServers: { name: {...} } } formats
      if (raw.servers && Array.isArray(raw.servers)) {
        return raw as MCPConfig;
      }
      if (raw.mcpServers && typeof raw.mcpServers === 'object') {
        // Convert Claude Desktop / Gemini CLI format to our format
        const servers: MCPServer[] = Object.entries(raw.mcpServers).map(
          ([name, serverConfig]: [string, any]) => ({
            name,
            command: serverConfig.command || '',
            args: serverConfig.args || [],
            env: serverConfig.env || {},
            enabled: serverConfig.enabled !== false,
            description: serverConfig.description || '',
            transport: serverConfig.transport || 'stdio',
            url: serverConfig.url,
          })
        );
        return { servers };
      }
      return { servers: [] };
    }
  } catch (error) {
    // Silently skip invalid configs
  }
  return null;
}

/**
 * Load MCP configs from all sources and merge them.
 * Project-level configs override user-level for same-named servers.
 */
export function loadMCPConfigs(projectRoot?: string): {
  merged: MCPConfig;
  sources: MCPConfigSource[];
} {
  const sources: MCPConfigSource[] = [];
  const serverMap = new Map<string, MCPServer>();
  const root = projectRoot || process.cwd();

  // 1. User-level config (lowest priority)
  const userConfig = loadConfigFile(USER_CONFIG_PATH);
  if (userConfig) {
    sources.push({ path: USER_CONFIG_PATH, scope: 'user', config: userConfig });
    for (const server of userConfig.servers) {
      serverMap.set(server.name, server);
    }
  }

  // 2. Legacy config
  const legacyPath = path.join(root, LEGACY_CONFIG_NAME);
  const legacyConfig = loadConfigFile(legacyPath);
  if (legacyConfig) {
    sources.push({ path: legacyPath, scope: 'legacy', config: legacyConfig });
    for (const server of legacyConfig.servers) {
      serverMap.set(server.name, server);
    }
  }

  // 3. Project-level config (highest priority)
  const projectPath = path.join(root, PROJECT_CONFIG_NAME);
  const projectConfig = loadConfigFile(projectPath);
  if (projectConfig) {
    sources.push({ path: projectPath, scope: 'project', config: projectConfig });
    for (const server of projectConfig.servers) {
      serverMap.set(server.name, server);
    }
  }

  return {
    merged: { servers: Array.from(serverMap.values()) },
    sources,
  };
}

/**
 * Save MCP config to a specific scope
 */
export function saveMCPConfig(
  config: MCPConfig,
  scope: 'user' | 'project' = 'project',
  projectRoot?: string
): void {
  const filePath =
    scope === 'user'
      ? USER_CONFIG_PATH
      : path.join(projectRoot || process.cwd(), PROJECT_CONFIG_NAME);

  fs.ensureDirSync(path.dirname(filePath));
  fs.writeJsonSync(filePath, config, { spaces: 2 });
}

/**
 * Get the path where config would be saved for a given scope
 */
export function getConfigPath(
  scope: 'user' | 'project',
  projectRoot?: string
): string {
  return scope === 'user'
    ? USER_CONFIG_PATH
    : path.join(projectRoot || process.cwd(), PROJECT_CONFIG_NAME);
}
