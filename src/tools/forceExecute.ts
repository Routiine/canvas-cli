import type { ToolRegistry } from './registry.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

// Pattern matching for common requests that should trigger tools
export async function forceToolExecution(
  prompt: string,
  response: string,
  toolRegistry: ToolRegistry
): Promise<boolean> {
  // Validate inputs
  if (!prompt || !response) {
    return false;
  }

  // Extract just the user's actual request (strip wrapper text)
  const userRequest = prompt.includes("User's current request:")
    ? prompt.split("User's current request:")[1]?.split('\n')[0]?.trim() || prompt
    : prompt;

  const lowerPrompt = (userRequest || '').toLowerCase().trim();

  // FIRST: Check for shell commands (mkdir, rm, mv, cp, etc.) - highest priority
  const shellCommandMatch = userRequest.match(/^(mkdir|rm|mv|cp|touch|cat|ls|pwd|cd|echo|chmod|chown|git|npm|yarn|pnpm|docker|kubectl)\s/i);
  if (shellCommandMatch) {
    console.log(chalk.dim(`  $ ${userRequest}`));

    try {
      const result = await toolRegistry.execute('run_shell_command', { command: userRequest });
      if (result) console.log(chalk.dim(String(result)));
      return true;
    } catch (error: any) {
      console.log(chalk.red(`  error: ${error.message}`));
      return true;
    }
  }

  // Check for shell-like commands in prompt
  const shellCommands = ['mkdir', 'rm', 'mv', 'cp', 'touch', 'ls', 'pwd', 'cat', 'echo', 'chmod', 'chown'];
  for (const cmd of shellCommands) {
    if (lowerPrompt.startsWith(cmd + ' ') || lowerPrompt === cmd) {
      console.log(chalk.dim(`  $ ${userRequest}`));
      try {
        const result = await toolRegistry.execute('run_shell_command', { command: userRequest });
        if (result) console.log(chalk.dim(String(result)));
        return true;
      } catch (error: any) {
        console.log(chalk.red(`  error: ${error.message}`));
        return true;
      }
    }
  }

  const lowerResponse = response.toLowerCase();

  // Check for PRD writing specifically (only if user explicitly mentions PRD)
  if ((lowerPrompt.includes('write') || lowerPrompt.includes('save')) &&
      (lowerPrompt.includes('prd') || lowerPrompt.includes('prd.md'))) {
    if (response.length > 100) {
      try {
        await toolRegistry.execute('write_file', { path: 'prd.md', content: response });
        console.log(chalk.dim('  wrote prd.md'));
        return true;
      } catch (error: any) {
        console.log(chalk.red(`  error: ${error.message}`));
      }
    }
  }
  
  // Check for write/create file requests
  if ((lowerPrompt.includes('write') || lowerPrompt.includes('create') || lowerPrompt.includes('make') || lowerPrompt.includes('save')) &&
      (lowerPrompt.includes('file') || lowerPrompt.includes('.md') || lowerPrompt.includes('.txt'))) {

    const extensionMatch = prompt.match(/([a-zA-Z0-9_-]+\.(md|txt|js|ts|json|html|css|py|java|cpp|c|h|go|rs|yaml|yml|xml))/i);
    const fileMatch = extensionMatch;
    const folderMatch = prompt.match(/(?:in\s+folder\s+|in\s+directory\s+)([^\s]+)/i) ||
                       prompt.match(/([\.\/][^\s]+)\/[^\s]+/i);

    if (fileMatch) {
      const fileName = fileMatch[1];
      let filePath = fileName;

      if (folderMatch && folderMatch[1] && !folderMatch[1].includes('make')) {
        filePath = path.join(folderMatch[1], fileName);
      }

      const contentMatch = prompt.match(/(?:content|containing|with text|saying)[\s:]+["']([^"']+)["']/i) ||
                          prompt.match(/(?:content|containing|with text|saying)\s+([^\.]+)/i);
      let content = contentMatch ? contentMatch[1] : '';

      if (!content && response && response.includes('PARAMS:')) {
        const paramsMatch = response.match(/PARAMS:\s*({[^}]+})/);
        if (paramsMatch) {
          try {
            const params = JSON.parse(paramsMatch[1]);
            if (params.content) content = params.content;
          } catch { /* JSON parse failed, use default content */ }
        }
      }

      if (!content) content = `# ${fileName}\n\nFile created by Canvas CLI`;

      try {
        await toolRegistry.execute('write_file', { path: filePath, content });
        console.log(chalk.dim(`  wrote ${filePath}`));
        return true;
      } catch (error: any) {
        console.log(chalk.red(`  error: ${error.message}`));
      }
    }
  }
  
  // Check for read file/directory requests
  if ((lowerPrompt.includes('read') || lowerPrompt.includes('show') || lowerPrompt.includes('list')) &&
      (lowerPrompt.includes('file') || lowerPrompt.includes('folder') || lowerPrompt.includes('directory') || lowerPrompt.includes('structure'))) {

    const fileMatch = prompt.match(/(?:read|show)\s+([^\s]+\.[a-z]+)/i);
    if (fileMatch) {
      try {
        const result = await toolRegistry.execute('read_file', { path: fileMatch[1] });
        console.log(result);
        return true;
      } catch (error: any) {
        console.log(chalk.red(`  error: ${error.message}`));
      }
    }

    try {
      const result = await toolRegistry.execute('list_directory', { path: '.', recursive: false });
      console.log(result);
      return true;
    } catch (error: any) {
      console.log(chalk.red(`  error: ${error.message}`));
    }
  }

  // Check for git operations
  if (lowerPrompt.includes('git ')) {
    if (lowerPrompt.includes('status')) {
      try {
        const result = await toolRegistry.execute('git_status', { detailed: true });
        console.log(result);
        return true;
      } catch (error: any) {
        console.log(chalk.red(`  error: ${error.message}`));
      }
    }

    if (lowerPrompt.includes('commit')) {
      const messageMatch = prompt.match(/(?:message|with)\s+["']([^"']+)["']/i);
      if (messageMatch) {
        try {
          await toolRegistry.execute('git_add', { files: ['.'] });
          await toolRegistry.execute('git_commit', { message: messageMatch[1] });
          console.log(chalk.dim('  committed'));
          return true;
        } catch (error: any) {
          console.log(chalk.red(`  error: ${error.message}`));
        }
      }
    }
  }
  
  // Check if response indicates the model is just explaining instead of doing
  if (lowerResponse.includes('to write') || lowerResponse.includes('to create') ||
      lowerResponse.includes('you can') || lowerResponse.includes('you should') ||
      lowerResponse.includes('would create') || lowerResponse.includes('would write')) {

    if ((lowerPrompt.includes('make') || lowerPrompt.includes('create') || lowerPrompt.includes('write')) &&
        lowerPrompt.includes('.md')) {
      const fileMatch = prompt.match(/([^\s]+\.md)/i);
      const fileName = fileMatch ? fileMatch[1] : 'test.md';

      try {
        await toolRegistry.execute('write_file', {
          path: fileName,
          content: `# ${fileName.replace('.md', '')}\n\nThis file was created by Canvas CLI\n\nCreated on: ${new Date().toISOString()}`
        });
        console.log(chalk.dim(`  wrote ${fileName}`));
        return true;
      } catch (error: any) {
        console.log(chalk.red(`  error: ${error.message}`));
      }
    }
  }

  return false;
}

// Simplified system prompt that works better with open source models
export function getSimpleToolPrompt(userPrompt: string): string {
  return `You are a CLI assistant. Break complex tasks into small steps and execute ONE step at a time.

For each step, output ONLY:
1. A shell command (can chain with && if needed)
2. Or file content in format:
   FILE: path/to/file
   ---
   (content)
   ---

IMPORTANT:
- Use FULL PATHS or chain cd with commands: cd ~/Documents && npx nuxi init myapp
- After long-running commands (like npm install), just say what you did
- When creating files, include the full content

Task: ${userPrompt}

Step 1:`;
}

/**
 * Detect package manager from command output or project context
 */
function detectPackageManager(output: string, workingDir?: string): string | null {
  // Check output for package manager hints
  if (output.includes('pnpm run') || output.includes('pnpm install') || output.includes('pnpm-lock')) {
    return 'pnpm';
  }
  if (output.includes('yarn run') || output.includes('yarn install') || output.includes('yarn.lock')) {
    return 'yarn';
  }

  // Check for lock files in working directory
  if (workingDir) {
    try {
      if (fs.existsSync(path.join(workingDir, 'pnpm-lock.yaml'))) return 'pnpm';
      if (fs.existsSync(path.join(workingDir, 'yarn.lock'))) return 'yarn';
      if (fs.existsSync(path.join(workingDir, 'package-lock.json'))) return 'npm';
    } catch {}
  }

  return null;
}

export function getNextStepPrompt(originalTask: string, completedSteps: string[], lastResult: string, workingDir?: string): string {
  const stepsText = completedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const cwdInfo = workingDir ? `\nCurrent directory: ${workingDir}` : '';

  // Detect package manager from output
  const pkgManager = detectPackageManager(lastResult, workingDir);
  const pkgManagerHint = pkgManager ? `\nIMPORTANT: Use ${pkgManager} (not npm) for this project.` : '';

  return `Task: ${originalTask}

Completed:
${stepsText}

Last result: ${lastResult}${cwdInfo}${pkgManagerHint}

What's the next command? Output ONLY a shell command or file content. Say "DONE" if finished.

Next:`;
}