import { ToolRegistry } from './registry.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

// Pattern matching for common requests that should trigger tools
export async function forceToolExecution(
  prompt: string,
  response: string,
  toolRegistry: ToolRegistry
): Promise<boolean> {
  console.log(chalk.yellow('\n🔍 Analyzing request for tool execution...'));
  console.log(chalk.dim(`   User asked: "${prompt}"`));
  console.log(chalk.dim(`   AI response length: ${response.length} chars`));
  
  const lowerPrompt = prompt.toLowerCase();
  const lowerResponse = response.toLowerCase();
  
  // Check for PRD writing specifically
  if ((lowerPrompt.includes('write') || lowerPrompt.includes('save') || lowerPrompt.includes('create')) && 
      (lowerPrompt.includes('prd') || lowerPrompt.includes('prd.md'))) {
    
    console.log(chalk.green('✓ Detected PRD writing request'));
    
    // Extract PRD content from the response (the AI's generated PRD)
    if (response.length > 100) { // Assume response contains the PRD content
      console.log(chalk.yellow('📝 Writing PRD.md file with generated content...'));
      try {
        await toolRegistry.execute('write_file', { 
          path: 'prd.md', 
          content: response 
        });
        console.log(chalk.green('✓ Successfully wrote PRD to prd.md'));
        return true;
      } catch (error: any) {
        console.log(chalk.red(`✗ Failed to write PRD: ${error.message}`));
      }
    }
  }
  
  // Check for write/create file requests - be more aggressive
  if ((lowerPrompt.includes('write') || lowerPrompt.includes('create') || lowerPrompt.includes('make') || lowerPrompt.includes('save')) && 
      (lowerPrompt.includes('file') || lowerPrompt.includes('.md') || lowerPrompt.includes('.txt'))) {
    
    console.log(chalk.green('✓ Detected file creation request'));
    
    // Extract filename from prompt - prioritize extension matches
    const extensionMatch = prompt.match(/([a-zA-Z0-9_-]+\.(md|txt|js|ts|json|html|css|py|java|cpp|c|h|go|rs|yaml|yml|xml))/i);
    const fileMatch = extensionMatch;
    
    // Extract path/folder from prompt (only for explicit folder references)
    const folderMatch = prompt.match(/(?:in\s+folder\s+|in\s+directory\s+)([^\s]+)/i) ||
                       prompt.match(/([\.\/][^\s]+)\/[^\s]+/i);
    
    if (fileMatch) {
      let fileName = fileMatch[1];
      let filePath = fileName;
      
      // Debug folder matching
      if (folderMatch) {
        console.log(chalk.dim(`   Folder match found: "${folderMatch[0]}", extracted: "${folderMatch[1]}"`));
      }
      
      // Only add folder if it's a real folder path
      if (folderMatch && !folderMatch[1].includes('make')) {
        const folder = folderMatch[1];
        filePath = path.join(folder, fileName);
      }
      
      // Extract content from prompt or use default
      const contentMatch = prompt.match(/(?:content|containing|with text|saying)[\s:]+["']([^"']+)["']/i) ||
                          prompt.match(/(?:content|containing|with text|saying)\s+([^\.]+)/i);
      
      // Try to extract content from AI response if available
      let content = contentMatch ? contentMatch[1] : '';
      
      // Check if AI provided actual file content in response
      if (!content && response.includes('PARAMS:')) {
        const paramsMatch = response.match(/PARAMS:\s*({[^}]+})/);
        if (paramsMatch) {
          try {
            const params = JSON.parse(paramsMatch[1]);
            if (params.content) {
              content = params.content;
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      }
      
      // Use default only if no content found
      if (!content) {
        content = `# ${fileName}\n\nFile created by Canvas CLI`;
      }
      
      console.log(chalk.yellow('\n📝 Force-executing write_file tool...'));
      console.log(chalk.dim(`  Path: ${filePath}`));
      console.log(chalk.dim(`  Content preview: ${content.substring(0, 50)}...`));
      
      try {
        await toolRegistry.execute('write_file', { path: filePath, content });
        console.log(chalk.green(`✓ File written successfully: ${filePath}`));
        return true;
      } catch (error: any) {
        console.log(chalk.red(`✗ Failed to write file: ${error.message}`));
      }
    }
  }
  
  // Check for read file/directory requests
  if ((lowerPrompt.includes('read') || lowerPrompt.includes('show') || lowerPrompt.includes('list')) && 
      (lowerPrompt.includes('file') || lowerPrompt.includes('folder') || lowerPrompt.includes('directory') || lowerPrompt.includes('structure'))) {
    
    // Check for specific file
    const fileMatch = prompt.match(/(?:read|show)\s+([^\s]+\.[a-z]+)/i);
    if (fileMatch) {
      console.log(chalk.yellow('\n📖 Auto-executing read_file tool...'));
      try {
        const result = await toolRegistry.execute('read_file', { path: fileMatch[1] });
        console.log(chalk.green(`✓ File content:`));
        console.log(result);
        return true;
      } catch (error: any) {
        console.log(chalk.red(`✗ Failed to read file: ${error.message}`));
      }
    }
    
    // Otherwise list directory
    console.log(chalk.yellow('\n📁 Auto-executing list_directory tool...'));
    try {
      const result = await toolRegistry.execute('list_directory', { path: '.', recursive: false });
      console.log(chalk.green(`✓ Directory contents:`));
      console.log(result);
      return true;
    } catch (error: any) {
      console.log(chalk.red(`✗ Failed to list directory: ${error.message}`));
    }
  }
  
  // Check for git operations
  if (lowerPrompt.includes('git ')) {
    if (lowerPrompt.includes('status')) {
      console.log(chalk.yellow('\n🔍 Auto-executing git_status tool...'));
      try {
        const result = await toolRegistry.execute('git_status', { detailed: true });
        console.log(result);
        return true;
      } catch (error: any) {
        console.log(chalk.red(`✗ Git status failed: ${error.message}`));
      }
    }
    
    if (lowerPrompt.includes('commit')) {
      const messageMatch = prompt.match(/(?:message|with)\s+["']([^"']+)["']/i);
      if (messageMatch) {
        console.log(chalk.yellow('\n💾 Auto-executing git_commit tool...'));
        try {
          await toolRegistry.execute('git_add', { files: ['.'] });
          const result = await toolRegistry.execute('git_commit', { message: messageMatch[1] });
          console.log(chalk.green('✓ Committed successfully'));
          return true;
        } catch (error: any) {
          console.log(chalk.red(`✗ Git commit failed: ${error.message}`));
        }
      }
    }
  }
  
  // Check if response indicates the model is just explaining instead of doing
  if (lowerResponse.includes('to write') || lowerResponse.includes('to create') || 
      lowerResponse.includes('you can') || lowerResponse.includes('you should') ||
      lowerResponse.includes('would create') || lowerResponse.includes('would write')) {
    
    console.log(chalk.yellow('\n⚠️  The AI is explaining instead of executing. Attempting to force execution...'));
    
    // Try to extract intent and force execution
    if ((lowerPrompt.includes('make') || lowerPrompt.includes('create') || lowerPrompt.includes('write')) && 
        lowerPrompt.includes('.md')) {
      console.log(chalk.cyan('Detected request to create .md file'));
      
      // Extract filename or use default
      const fileMatch = prompt.match(/([^\s]+\.md)/i);
      const fileName = fileMatch ? fileMatch[1] : 'test.md';
      
      // Force creation of the markdown file
      try {
        await toolRegistry.execute('write_file', { 
          path: fileName, 
          content: `# ${fileName.replace('.md', '')}\n\nThis file was created by Canvas CLI\n\nCreated on: ${new Date().toISOString()}` 
        });
        console.log(chalk.green(`✓ Forced execution: Created ${fileName}`));
        return true;
      } catch (error: any) {
        console.log(chalk.red(`✗ Force execution failed: ${error.message}`));
      }
    }
  }
  
  console.log(chalk.dim('ℹ️ No tool execution needed for this request'));
  return false;
}

// Simplified system prompt that works better with open source models
export function getSimpleToolPrompt(userPrompt: string): string {
  return `You are Canvas CLI. You have tools to read, write, and manipulate files.

When the user asks you to DO something, you MUST execute it using tools.

IMPORTANT RULES:
1. If asked to write a file, USE write_file tool
2. If asked to read a file, USE read_file tool
3. If asked to list files, USE list_directory tool
4. DO NOT explain how to do it, ACTUALLY DO IT
5. You can use MULTIPLE tools in one response to complete complex tasks

To use a tool, write exactly:
TOOL: tool_name
PARAMS: {"key": "value"}

Example - to write multiple files:
TOOL: write_file  
PARAMS: {"path": "index.html", "content": "<html>...</html>"}

TOOL: write_file
PARAMS: {"path": "styles.css", "content": "body { ... }"}

TOOL: write_file
PARAMS: {"path": "app.js", "content": "function app() { ... }"}

USER REQUEST: ${userPrompt}

EXECUTE THE REQUEST NOW (use multiple tools if needed):`;
}