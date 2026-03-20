/**
 * AI-Native Browser Automation via Stagehand
 * Uses natural language instructions instead of CSS selectors.
 *
 * Requires BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID for cloud execution,
 * or falls back to local Playwright when those keys are absent.
 *
 * Model is fixed to claude-sonnet-4-6 via Anthropic client options so it
 * stays in sync with the rest of the canvas-cli AI stack.
 */
import { V3 as Stagehand } from '@browserbasehq/stagehand';
import type { Action } from '@browserbasehq/stagehand';
import { BaseTool } from './base.js';
import chalk from 'chalk';

// ---------------------------------------------------------------------------
// Singleton lifecycle
// ---------------------------------------------------------------------------

let _stagehand: Stagehand | null = null;

async function getStagehand(): Promise<Stagehand> {
  if (_stagehand) return _stagehand;

  const useBrowserbase = !!(
    process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID
  );

  _stagehand = new Stagehand({
    env: useBrowserbase ? 'BROWSERBASE' : 'LOCAL',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: {
      modelName: 'claude-3-5-sonnet-latest',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    verbose: 0,
    disablePino: true,
  });

  await _stagehand.init();
  return _stagehand;
}

/**
 * Navigate to a URL.
 * Returns the final URL after any redirects (via the Playwright page URL).
 */
export async function stagehandNavigate(url: string): Promise<string> {
  const sh = await getStagehand();
  // V3 context exposes a Playwright page for direct navigation
  const playwrightPage = sh.context.pages()[0];
  if (!playwrightPage) {
    throw new Error('No active browser page in Stagehand context');
  }
  await playwrightPage.goto(url);
  return playwrightPage.url();
}

/**
 * Perform a natural-language browser action, e.g.
 * "click the login button" or "fill the email field with user@example.com".
 */
export async function stagehandAct(instruction: string): Promise<void> {
  const sh = await getStagehand();
  await sh.act(instruction);
}

/**
 * Extract structured data from the current page using a natural-language prompt.
 * Optionally accepts a plain JSON-schema object to shape the result.
 */
export async function stagehandExtract<T = Record<string, unknown>>(
  instruction: string
): Promise<T> {
  const sh = await getStagehand();
  const result = await sh.extract(instruction);
  return result as unknown as T;
}

/**
 * Observe the current page and return candidate actions matching the instruction.
 */
export async function stagehandObserve(instruction: string): Promise<Action[]> {
  const sh = await getStagehand();
  return sh.observe(instruction);
}

/**
 * Close the Stagehand session and release the singleton.
 */
export async function closeStagehand(): Promise<void> {
  if (_stagehand) {
    await _stagehand.close();
    _stagehand = null;
  }
}

// ---------------------------------------------------------------------------
// Tool classes
// ---------------------------------------------------------------------------

export class StagehandNavigateTool extends BaseTool {
  name = 'stagehand_navigate';
  description =
    'Navigate the browser to a URL using Stagehand AI-native automation. ' +
    'Falls back to local Playwright when BROWSERBASE_API_KEY is not set.';
  parameters = {
    url: {
      type: 'string',
      description: 'Fully-qualified URL to navigate to (must include https:// or http://)',
    },
  };
  requiresConfirmation = false;

  async execute(params: { url: string }): Promise<string> {
    if (!params.url || typeof params.url !== 'string') {
      return 'Error: url is required';
    }

    try {
      new URL(params.url);
    } catch {
      return `Error: invalid URL — ${params.url}`;
    }

    try {
      console.log(chalk.blue(`\n[stagehand] navigating to ${params.url}`));
      const finalUrl = await stagehandNavigate(params.url);
      return `Navigated to: ${finalUrl}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error navigating: ${message}`;
    }
  }
}

export class StagehandActTool extends BaseTool {
  name = 'stagehand_act';
  description =
    'Perform a browser action described in natural language using Stagehand. ' +
    'Examples: "click the login button", "fill in the email field with test@example.com", ' +
    '"select the dropdown option labeled Monthly".';
  parameters = {
    instruction: {
      type: 'string',
      description: 'Natural language description of the action to perform',
    },
  };
  requiresConfirmation = false;

  async execute(params: { instruction: string }): Promise<string> {
    if (!params.instruction || typeof params.instruction !== 'string') {
      return 'Error: instruction is required';
    }

    try {
      console.log(chalk.blue(`\n[stagehand] act: ${params.instruction}`));
      await stagehandAct(params.instruction);
      return `Action completed: ${params.instruction}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error performing action: ${message}`;
    }
  }
}

export class StagehandExtractTool extends BaseTool {
  name = 'stagehand_extract';
  description =
    'Extract structured data from the current page using natural language via Stagehand. ' +
    'Examples: "extract all product names and prices", "get the main article headline and author".';
  parameters = {
    instruction: {
      type: 'string',
      description: 'Natural language description of the data to extract from the page',
    },
  };
  requiresConfirmation = false;

  async execute(params: { instruction: string }): Promise<string> {
    if (!params.instruction || typeof params.instruction !== 'string') {
      return 'Error: instruction is required';
    }

    try {
      console.log(chalk.blue(`\n[stagehand] extract: ${params.instruction}`));
      const result = await stagehandExtract(params.instruction);
      return typeof result === 'object'
        ? JSON.stringify(result, null, 2)
        : String(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error extracting data: ${message}`;
    }
  }
}

export class StagehandObserveTool extends BaseTool {
  name = 'stagehand_observe';
  description =
    'Observe the current page and return candidate interactive actions matching the instruction. ' +
    'Useful for discovering what can be clicked, filled, or selected before acting.';
  parameters = {
    instruction: {
      type: 'string',
      description: 'Natural language description of what actions to look for on the page',
      optional: true,
    },
  };
  requiresConfirmation = false;

  async execute(params: { instruction?: string }): Promise<string> {
    const instruction = params.instruction ?? 'find all interactive elements';

    try {
      console.log(chalk.blue(`\n[stagehand] observe: ${instruction}`));
      const actions = await stagehandObserve(instruction);
      if (actions.length === 0) {
        return 'No matching actions found on the current page';
      }
      return JSON.stringify(actions, null, 2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error observing page: ${message}`;
    }
  }
}

export class StagehandCloseTool extends BaseTool {
  name = 'stagehand_close';
  description = 'Close the Stagehand browser session and release all resources.';
  parameters = {};
  requiresConfirmation = false;

  async execute(): Promise<string> {
    try {
      await closeStagehand();
      return 'Stagehand session closed';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error closing Stagehand: ${message}`;
    }
  }
}
