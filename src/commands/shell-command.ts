/**
 * Shell Assistant Command
 * Translates natural language descriptions to shell commands.
 * Usage: canvas shell "find all node_modules folders larger than 1GB"
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';

export function createShellCommand(): Command {
  return new Command('shell')
    .description('Translate natural language to shell commands')
    .argument('<description>', 'What you want to do in plain English')
    .option('-y, --yes', 'Execute immediately without confirmation')
    .option('-e, --explain', 'Show detailed explanation of the command')
    .action(async (description: string, options: { yes?: boolean; explain?: boolean }) => {
      await runShellAssistant(description, options);
    });
}

async function runShellAssistant(
  description: string,
  options: { yes?: boolean; explain?: boolean }
): Promise<void> {
  const config = loadConfig();

  // Build the prompt asking for a shell command
  const systemPrompt = `You are a shell command expert. Given a natural language description, respond with:
1. The exact shell command to run (on a line starting with CMD:)
2. A brief explanation of what it does (on a line starting with EXPLAIN:)
3. Any safety warnings if applicable (on a line starting with WARN:)

Respond ONLY with these labeled lines. No markdown, no prose.

Example:
CMD: find . -name "node_modules" -type d -exec du -sh {} \\; 2>/dev/null | sort -rh | head -20
EXPLAIN: Finds all node_modules directories, measures their disk usage, sorts by size descending, shows top 20
WARN: May be slow on large codebases`;

  console.log(chalk.dim(`  Translating: "${description}"`));

  try {
    let response = '';

    // Try Claude first, then OpenAI, then Ollama
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (anthropicKey) {
      const { Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: anthropicKey });
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: description }],
      });
      response = (msg.content[0] as any).text || '';
    } else if (openaiKey) {
      const { OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: openaiKey });
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: description },
        ],
        max_tokens: 512,
      });
      response = completion.choices[0]?.message?.content || '';
    } else {
      // Try unified provider (Gemini, Azure, DeepSeek, Groq, etc.)
      const { getUnifiedProvider } = await import('../intelligence/unified-provider.js');
      const unifiedProvider = getUnifiedProvider();
      if (unifiedProvider) {
        response = await unifiedProvider.complete([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: description },
        ], { maxTokens: 512 });
      } else {
        // Fall back to Ollama
        const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
        const model = config.defaultModel || config.ollama?.defaultModel || 'llama3.2';
        const { default: axios } = await import('axios');
        const res = await axios.post(
          `${ollamaUrl}/api/generate`,
          {
            model,
            prompt: `${systemPrompt}\n\nUser request: ${description}`,
            stream: false,
          },
          { timeout: 30000 }
        );
        response = res.data.response || '';
      }
    }

    // Parse the response
    const cmdMatch = response.match(/^CMD:\s*(.+)$/m);
    const explainMatch = response.match(/^EXPLAIN:\s*(.+)$/m);
    const warnMatch = response.match(/^WARN:\s*(.+)$/m);

    if (!cmdMatch) {
      console.error(chalk.red('  Could not generate a command for that description.'));
      process.exit(1);
    }

    const command = cmdMatch[1].trim();
    const explanation = explainMatch?.[1]?.trim();
    const warning = warnMatch?.[1]?.trim();

    // Display
    console.log('');
    console.log(chalk.cyan('  Command:'));
    console.log(chalk.white(`    ${command}`));

    if (explanation && options.explain !== false) {
      console.log('');
      console.log(chalk.dim(`  What it does: ${explanation}`));
    }

    if (warning) {
      console.log('');
      console.log(chalk.yellow(`  Warning: ${warning}`));
    }

    // Confirm before executing
    if (!options.yes) {
      console.log('');
      const { default: inquirer } = await import('inquirer');
      const { execute } = await inquirer.prompt([{
        type: 'confirm',
        name: 'execute',
        message: 'Execute this command?',
        default: false,
      }]);
      if (!execute) {
        console.log(chalk.dim('  Cancelled.'));
        return;
      }
    }

    // Validate the LLM-generated command against shell safety rules before execution
    const { ShellCommandTool } = await import('../tools/shell.js');
    const shellTool = new ShellCommandTool();
    const safety = shellTool.validateCommand(command);
    if (safety.blocked) {
      console.error(chalk.red(`  Blocked: ${safety.reason}`));
      console.error(chalk.dim('  The AI suggested a dangerous command — aborting.'));
      process.exit(1);
    }
    if (safety.warning) {
      console.log(chalk.yellow(`  Safety warning: ${safety.warning}`));
    }

    // Execute
    console.log('');
    const { spawn } = await import('child_process');
    const child = spawn(command, { shell: true, stdio: 'inherit' });
    await new Promise<void>((resolve, reject) => {
      child.on('close', (code) => {
        if (code !== 0) reject(new Error(`Command exited with code ${code}`));
        else resolve();
      });
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`  Error: ${message}`));
    process.exit(1);
  }
}
