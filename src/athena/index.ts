/**
 * Athena AI module — public exports
 * Importing this module registers the Athena provider extensions automatically.
 */

export { BusinessMemory } from './BusinessMemory.js';
export type { BusinessCategory } from './BusinessMemory.js';
export { AthenaApiClient } from './AthenaApiClient.js';
export type { ExecutionEvent } from './AthenaApiClient.js';
export { AthenaAgent } from './AthenaAgent.js';
export type { AthenaAgentOptions, AthenaEvent } from './AthenaAgent.js';
export { extendProviderRegistry, getProviderStatus } from './AthenaProviderBridge.js';
export { getBuiltInRecipes } from './recipes.js';
export type { CanvasRecipe } from './recipes.js';
export { registerAthenaCommands } from './commands/athena-command.js';

// Extend providers on module load
import { extendProviderRegistry } from './AthenaProviderBridge.js';
extendProviderRegistry();
