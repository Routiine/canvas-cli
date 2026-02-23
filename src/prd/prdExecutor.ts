import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { loadConfig } from '../config.js';
import { parseToolCalls } from '../toolPrompt.js';
import type { ToolRegistry } from '../tools/registry.js';

export interface TodoItem {
  task: string;
  status: 'pending' | 'in_progress' | 'completed';
  details?: string;
}

export class PRDExecutor {
  private toolRegistry: ToolRegistry;
  private todoList: TodoItem[] = [];
  private config = loadConfig();
  
  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }
  
  /**
   * Execute a PRD file
   */
  async execute(prdPath: string): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 PRD Executor'));
    console.log(chalk.gray('═'.repeat(60)));
    
    // Step 1: Read the PRD file
    if (!fs.existsSync(prdPath)) {
      // If no extension, try adding .md
      if (!path.extname(prdPath)) {
        prdPath = prdPath + '.md';
      }
      
      if (!fs.existsSync(prdPath)) {
        console.log(chalk.red(`❌ PRD file not found: ${prdPath}`));
        return;
      }
    }
    
    const prdContent = fs.readFileSync(prdPath, 'utf-8');
    console.log(chalk.green(`✓ Read PRD file: ${prdPath}`));
    console.log(chalk.dim(`  Size: ${prdContent.length} characters`));
    
    // Step 2: Generate todo list from PRD
    console.log(chalk.yellow('\n📋 Analyzing PRD and creating todo list...'));
    await this.generateTodoList(prdContent);
    
    // Step 3: Display the todo list
    this.displayTodoList();
    
    // Step 4: Execute each todo item
    console.log(chalk.cyan('\n🔧 Executing tasks...'));
    console.log(chalk.gray('─'.repeat(60)));
    
    for (let i = 0; i < this.todoList.length; i++) {
      const todo = this.todoList[i];
      
      // Update status to in_progress
      todo.status = 'in_progress';
      this.displayProgress(i + 1, this.todoList.length, todo.task);
      
      // Execute the task
      const success = await this.executeTask(todo, prdContent);
      
      // Update status based on result
      todo.status = success ? 'completed' : 'pending';
      
      if (success) {
        console.log(chalk.green(`  ✓ Completed: ${todo.task}`));
      } else {
        console.log(chalk.red(`  ✗ Failed: ${todo.task}`));
      }
      
      // Small delay between tasks
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 5: Final summary
    this.displaySummary();
  }
  
  /**
   * Generate a todo list from PRD content using AI
   */
  private async generateTodoList(prdContent: string): Promise<void> {
    // First, parse PRD directly for file names
    this.parseDirectTodoList(prdContent);
    
    // If we found files, use them
    if (this.todoList.length > 0) {
      console.log(chalk.green(`  ✓ Found ${this.todoList.length} files to create from PRD`));
      return;
    }
    
    // Otherwise, use AI to generate todo list
    const prompt = `Analyze this PRD and list ONLY the files mentioned that need to be created.
Format: One file per line, just the filename.

PRD:
${prdContent}

List files to create:`;
    
    try {
      const request: any = {
        model: this.config.defaultModel,
        prompt,
        stream: false
      };
      
      const response = await axios.post(`${this.config.ollamaUrl}/api/generate`, request);
      const aiResponse = response.data.response;
      
      // Parse the response for filenames
      const fileMatches = aiResponse.match(/([a-zA-Z0-9_-]+\.(html|css|js|md|json|txt))/gi) || [];
      
      for (const filename of fileMatches) {
        if (!this.todoList.find(t => t.task.includes(filename))) {
          this.todoList.push({
            task: `Create ${filename}`,
            status: 'pending'
          });
        }
      }
      
    } catch (error) {
      console.log(chalk.yellow('⚠️  Using fallback todo generation'));
    }
    
    // If still no items found, create default tasks
    if (this.todoList.length === 0) {
      this.createDefaultTodoList(prdContent);
    }
  }
  
  /**
   * Parse PRD directly for file definitions
   */
  private parseDirectTodoList(prdContent: string): void {
    const lines = prdContent.split('\n');
    const files: Set<string> = new Set();
    
    for (const line of lines) {
      // Look for patterns like "### 1. index.html" or "## index.html" or "- index.html"
      // Include more extensions for modern frameworks
      const patterns = [
        /^###?\s*\d*\.?\s*([a-zA-Z0-9_\/-]+\.(html|css|js|vue|jsx|ts|tsx|md|json|txt))/i,
        /^[-*]\s*([a-zA-Z0-9_\/-]+\.(html|css|js|vue|jsx|ts|tsx|md|json|txt))/i,
        /\*\*([a-zA-Z0-9_\/-]+\.(html|css|js|vue|jsx|ts|tsx|md|json|txt))\*\*/i,
        /`([a-zA-Z0-9_\/-]+\.(html|css|js|vue|jsx|ts|tsx|md|json|txt))`/i,
        // Also look for component paths like components/FishingMap.vue
        /(?:components?|pages?|layouts?|store|utils?|api)\/([a-zA-Z0-9_-]+\.(vue|js|ts|jsx|tsx))/i
      ];
      
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          files.add(match[1].toLowerCase());
        }
      }
    }
    
    // Create todo items for each unique file
    for (const filename of files) {
      this.todoList.push({
        task: `Create ${filename}`,
        status: 'pending'
      });
    }
  }
  
  /**
   * Create a default todo list based on common patterns
   */
  private createDefaultTodoList(prdContent: string): void {
    const lower = prdContent.toLowerCase();
    
    if (lower.includes('index.html') || lower.includes('html')) {
      this.todoList.push({
        task: 'Create index.html',
        status: 'pending'
      });
    }
    
    if (lower.includes('styles.css') || lower.includes('css')) {
      this.todoList.push({
        task: 'Create styles.css',
        status: 'pending'
      });
    }
    
    if (lower.includes('app.js') || lower.includes('javascript')) {
      this.todoList.push({
        task: 'Create app.js',
        status: 'pending'
      });
    }
  }
  
  /**
   * Execute a single task
   */
  private async executeTask(todo: TodoItem, prdContent: string): Promise<boolean> {
    try {
      // Extract filename from task
      const filenameMatch = todo.task.match(/([a-zA-Z0-9_.-]+\.(html|css|js|vue|jsx|ts|tsx|md|json|txt))/i);
      if (!filenameMatch) {
        console.log(chalk.yellow(`  ⚠️  No filename found in task: ${todo.task}`));
        return false;
      }
      
      const filename = filenameMatch[1];
      console.log(chalk.dim(`  → Creating ${filename}...`));
      console.log(chalk.dim(`  → PRD size: ${prdContent.length} chars`));
      
      // Extract relevant content from PRD for this specific file
      const prdSection = this.extractPRDSection(prdContent, filename);
      
      // First, try to use the AI with tool calls for better results
      const toolCallContent = await this.generateWithAITools(filename, prdContent);
      if (toolCallContent) {
        try {
          await this.toolRegistry.execute('write_file', { path: filename, content: toolCallContent });
          return true;
        } catch (error: any) {
          console.log(chalk.yellow(`  ⚠️  Tool execution failed, trying direct generation`));
        }
      }
      
      // Generate content based on PRD
      const content = await this.generateFileContent(filename, prdSection, prdContent);
      
      // Write the file
      try {
        await this.toolRegistry.execute('write_file', { path: filename, content });
        return true;
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Failed to write ${filename}: ${error.message}`));
        return false;
      }
      
    } catch (error: any) {
      console.log(chalk.red(`  ✗ Task failed: ${error.message}`));
      return false;
    }
  }
  
  /**
   * Try to generate content using AI with tool calls
   */
  private async generateWithAITools(filename: string, prdContent: string): Promise<string | null> {
    try {
      const prompt = `You are implementing a project based on this PRD.

PRD DOCUMENT:
================
${prdContent}
================

Your task: Create the file "${filename}" with content that EXACTLY matches what the PRD specifies.

IMPORTANT:
- Read the ENTIRE PRD above
- Use the EXACT technology mentioned (Nuxt.js, React, Vue, etc.)
- Include ALL features/components mentioned for this file
- If it's a fishing app, include fishing-related components
- If it mentions specific frameworks or libraries, use them

Use this EXACT format:
TOOL: write_file
PARAMS: {"path": "${filename}", "content": "[PUT THE ACTUAL CODE HERE]"}

Generate the file NOW based on the PRD:`;
      
      const request: any = {
        model: this.config.defaultModel,
        prompt,
        stream: false,
        temperature: 0.7
      };
      
      console.log(chalk.dim(`  → Requesting AI to analyze PRD and generate ${filename}...`));
      const response = await axios.post(`${this.config.ollamaUrl}/api/generate`, request);
      const aiResponse = response.data.response;
      
      // Parse tool calls
      const toolCalls = parseToolCalls(aiResponse);
      if (toolCalls.length > 0 && toolCalls[0].name === 'write_file') {
        console.log(chalk.green(`  ✓ AI generated content using tool call`));
        return toolCalls[0].parameters.content;
      }
      
      // Try to extract content from PARAMS
      const paramsMatch = aiResponse.match(/PARAMS:\s*\{[^}]*"content":\s*"([^"]+(?:\\.[^"]+)*)"/s);
      if (paramsMatch) {
        let content = paramsMatch[1];
        content = content.replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .replace(/\\"/g, '"');
        return content;
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  AI tool generation failed`));
    }
    
    return null;
  }
  
  /**
   * Extract relevant PRD section for a specific file
   */
  private extractPRDSection(prdContent: string, filename: string): string {
    const lines = prdContent.split('\n');
    const fileBase = filename.split('.')[0].toLowerCase();
    
    let capturing = false;
    let section = '';
    let sectionDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();
      
      // Check if this line mentions our file
      if (lineLower.includes(filename.toLowerCase()) || 
          (lineLower.includes(fileBase) && lineLower.match(/^#+/))) {
        capturing = true;
        sectionDepth = (line.match(/^#+/) || [''])[0].length;
        section = line + '\n';
      } else if (capturing) {
        // Stop if we hit another section at same or higher level
        const currentDepth = (line.match(/^#+/) || [''])[0].length;
        if (currentDepth > 0 && currentDepth <= sectionDepth) {
          break;
        }
        section += line + '\n';
      }
    }
    
    // If no specific section found, look for bullet points
    if (!section) {
      for (const line of lines) {
        if (line.toLowerCase().includes(filename.toLowerCase())) {
          // Get surrounding context
          const idx = lines.indexOf(line);
          section = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 5)).join('\n');
          break;
        }
      }
    }
    
    return section || prdContent;
  }
  
  /**
   * Generate file content based on PRD requirements
   */
  private async generateFileContent(filename: string, prdSection: string, fullPRD: string): Promise<string> {
    const fileExt = filename.split('.').pop()?.toLowerCase();
    
    // Try to get AI to generate the content with very specific prompt
    try {
      // Much more specific prompt that forces the AI to read and use the PRD
      const prompt = `You are a code generator. Read this PRD carefully and generate the EXACT file requested.

FULL PRD DOCUMENT:
${fullPRD}

SPECIFIC SECTION FOR ${filename}:
${prdSection}

IMPORTANT INSTRUCTIONS:
1. Generate ONLY the code for ${filename}
2. Use the EXACT technology stack mentioned in the PRD
3. Include ALL components/features specified for this file
4. NO explanations, NO markdown blocks, JUST the raw code
5. If the PRD mentions Nuxt.js, use Nuxt.js syntax
6. If the PRD mentions specific components (like fishing app components), include them

Generate the complete content for ${filename} now:`;
      
      const request: any = {
        model: this.config.defaultModel,
        prompt,
        stream: false,
        temperature: 0.5 // Slightly higher for creativity but still consistent
      };
      
      console.log(chalk.dim(`  → Asking AI to generate ${filename} based on PRD...`));
      const response = await axios.post(`${this.config.ollamaUrl}/api/generate`, request);
      let content = response.data.response;
      
      // Clean up the response
      content = this.cleanAIResponse(content, fileExt || '');
      
      if (content && content.length > 10) {
        console.log(chalk.dim(`  → Generated ${content.length} characters of content`));
        return content;
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  AI generation failed, will try with stronger prompt`));
    }
    
    // Try again with even stronger prompt using tool format
    return this.generateWithToolPrompt(filename, fullPRD);
  }
  
  /**
   * Generate content using tool-style prompt
   */
  private async generateWithToolPrompt(filename: string, fullPRD: string): Promise<string> {
    const fileExt = filename.split('.').pop()?.toLowerCase();
    
    try {
      const prompt = `Based on this PRD, create ${filename}.

PRD CONTENT:
${fullPRD}

You MUST use write_file tool to create this file.
Read the PRD and understand what technology stack to use (Nuxt.js, React, etc.)
Include all features mentioned in the PRD for this file.

TOOL: write_file
PARAMS: {"path": "${filename}", "content": "[GENERATE THE ACTUAL FILE CONTENT BASED ON THE PRD ABOVE]"}

Generate the tool call now:`;
      
      const request: any = {
        model: this.config.defaultModel,
        prompt,
        stream: false,
        temperature: 0.5
      };
      
      console.log(chalk.dim(`  → Using tool prompt to generate ${filename}...`));
      const response = await axios.post(`${this.config.ollamaUrl}/api/generate`, request);
      const aiResponse = response.data.response;
      
      // Parse the tool call to extract content
      const contentMatch = aiResponse.match(/"content"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/s);
      if (contentMatch) {
        let content = contentMatch[1];
        // Unescape the content
        content = content.replace(/\\n/g, '\n')
                        .replace(/\\t/g, '\t')
                        .replace(/\\"/g, '"')
                        .replace(/\\\\/g, '\\');
        return content;
      }
      
      // Try to extract from the response anyway
      const cleaned = this.cleanAIResponse(aiResponse, fileExt || '');
      if (cleaned && cleaned.length > 10) {
        return cleaned;
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠️  Tool prompt also failed`));
    }
    
    // Last resort - use defaults but warn the user
    console.log(chalk.red(`  ⚠️  Could not generate proper content from PRD, using minimal template`));
    return this.generateMinimalContent(filename, fullPRD);
  }
  
  /**
   * Clean AI response to get just the code
   */
  private cleanAIResponse(content: string, fileExt: string): string {
    // Remove markdown code blocks
    const codeBlockRegex = new RegExp('```(?:' + fileExt + ')?\\s*\\n([\\s\\S]*?)```', 'i');
    const match = content.match(codeBlockRegex);
    if (match) {
      return match[1].trim();
    }
    
    // Remove common prefixes
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => {
      const lower = line.toLowerCase();
      return !lower.includes('here is') && 
             !lower.includes('here\'s') &&
             !lower.includes('this is') &&
             !lower.includes('content:') &&
             !lower.includes('file:');
    });
    
    return filteredLines.join('\n').trim();
  }
  
  /**
   * Generate minimal content when AI fails
   */
  private generateMinimalContent(filename: string, prdContent: string): string {
    const fileExt = filename.split('.').pop()?.toLowerCase();
    const isNuxt = prdContent.toLowerCase().includes('nuxt');
    const isReact = prdContent.toLowerCase().includes('react');
    const isVue = prdContent.toLowerCase().includes('vue') || isNuxt;
    
    switch(fileExt) {
      case 'vue':
        return `<template>
  <div>
    <!-- Component generated from PRD -->
    <h1>{{ title }}</h1>
  </div>
</template>

<script>
export default {
  name: '${filename.replace('.vue', '')}',
  data() {
    return {
      title: '${filename.replace('.vue', '')}'
    }
  }
}
</script>`;
        
      case 'js':
        if (isNuxt || isVue) {
          return `// Nuxt.js/Vue.js component logic
export default {
  // Generated from PRD - please implement based on requirements
  mounted() {
    console.log('Component mounted: ${filename}')
  }
}`;
        } else if (isReact) {
          return `import React from 'react';

// React component generated from PRD
function Component() {
  return (
    <div>
      <h1>${filename.replace('.js', '')}</h1>
    </div>
  );
}

export default Component;`;
        } else {
          return `// JavaScript file generated from PRD
// Please implement based on PRD requirements
console.log('File: ${filename}');`;
        }
        
      case 'html':
        return `<!DOCTYPE html>
<html>
<head>
    <title>Generated from PRD</title>
</head>
<body>
    <h1>Please implement based on PRD requirements</h1>
</body>
</html>`;
        
      case 'css':
        return `/* CSS file generated from PRD */
/* Please implement styles based on PRD requirements */
body {
  margin: 0;
  padding: 0;
}`;
        
      default:
        return `# ${filename}\n\nFile generated from PRD - please implement based on requirements`;
    }
  }
  
  /**
   * Generate default content based on file type and PRD
   */
  private generateDefaultContent(filename: string, prdSection: string): string {
    const fileExt = filename.split('.').pop()?.toLowerCase();
    const requirements = prdSection.toLowerCase();
    
    switch(fileExt) {
      case 'html':
        const title = this.extractValue(prdSection, 'title') || 'Todo App';
        const hasInput = requirements.includes('input');
        const hasButton = requirements.includes('button');
        const hasList = requirements.includes('list') || requirements.includes('container');
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <h1>${title}</h1>${hasInput ? '\n        <input type="text" id="taskInput" placeholder="Enter new task...">' : ''}${hasButton ? '\n        <button id="addButton" onclick="addTask()">Add Task</button>' : ''}${hasList ? '\n        <ul id="taskList"></ul>' : ''}
    </div>
    <script src="app.js"></script>
</body>
</html>`;
        
      case 'css':
        const hasGradient = requirements.includes('gradient');
        const hasModern = requirements.includes('modern');
        
        return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;${hasGradient || hasModern ? '\n    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);' : '\n    background: #f5f5f5;'}
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
}

.container {
    max-width: 600px;
    width: 90%;
    background: white;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    padding: 2rem;
}

h1 {
    color: #333;
    margin-bottom: 1.5rem;
    text-align: center;
}

#taskInput {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e0e0e0;
    border-radius: 5px;
    font-size: 1rem;
    margin-bottom: 1rem;
}

#addButton {
    width: 100%;
    padding: 0.75rem;
    background: #667eea;
    color: white;
    border: none;
    border-radius: 5px;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.3s;
}

#addButton:hover {
    background: #5a67d8;
}

#taskList {
    list-style: none;
    margin-top: 1.5rem;
}

.task-item {
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: #f8f9fa;
    border-radius: 5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.task-item.completed {
    opacity: 0.6;
    text-decoration: line-through;
}`;
        
      case 'js':
        const hasLocalStorage = requirements.includes('localstorage') || requirements.includes('persist');
        const hasAdd = requirements.includes('add');
        const hasDelete = requirements.includes('delete') || requirements.includes('remove');
        const hasComplete = requirements.includes('complete') || requirements.includes('mark');
        
        return `// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('taskInput');
    const addButton = document.getElementById('addButton');
    const taskList = document.getElementById('taskList');
    
    // Load tasks from localStorage
    let tasks = ${hasLocalStorage ? 'JSON.parse(localStorage.getItem(\'tasks\') || \'[]\')' : '[]'};
    
    // Render tasks
    function renderTasks() {
        taskList.innerHTML = '';
        tasks.forEach((task, index) => {
            const li = document.createElement('li');
            li.className = 'task-item' + (task.completed ? ' completed' : '');
            
            const taskText = document.createElement('span');
            taskText.textContent = task.text;
            li.appendChild(taskText);
            
            const buttons = document.createElement('div');${hasComplete ? '\n            \n            const completeBtn = document.createElement(\'button\');\n            completeBtn.textContent = task.completed ? \'Undo\' : \'Complete\';\n            completeBtn.onclick = () => toggleTask(index);\n            buttons.appendChild(completeBtn);' : ''}${hasDelete ? '\n            \n            const deleteBtn = document.createElement(\'button\');\n            deleteBtn.textContent = \'Delete\';\n            deleteBtn.onclick = () => deleteTask(index);\n            buttons.appendChild(deleteBtn);' : ''}
            
            li.appendChild(buttons);
            taskList.appendChild(li);
        });${hasLocalStorage ? '\n        \n        // Save to localStorage\n        localStorage.setItem(\'tasks\', JSON.stringify(tasks));' : ''}
    }
    
    // Add new task
    function addTask() {
        const text = taskInput.value.trim();
        if (text) {
            tasks.push({ text, completed: false });
            taskInput.value = '';
            renderTasks();
        }
    }${hasComplete ? '\n    \n    // Toggle task completion\n    function toggleTask(index) {\n        tasks[index].completed = !tasks[index].completed;\n        renderTasks();\n    }' : ''}${hasDelete ? '\n    \n    // Delete task\n    function deleteTask(index) {\n        tasks.splice(index, 1);\n        renderTasks();\n    }' : ''}
    
    // Event listeners
    addButton.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
    
    // Make functions global
    window.addTask = addTask;${hasComplete ? '\n    window.toggleTask = toggleTask;' : ''}${hasDelete ? '\n    window.deleteTask = deleteTask;' : ''}
    
    // Initial render
    renderTasks();
});`;
        
      default:
        return `# ${filename}\n\nFile created by Canvas CLI based on PRD`;
    }
  }
  
  /**
   * Extract a value from PRD text
   */
  private extractValue(text: string, key: string): string | null {
    const patterns = [
      new RegExp(`${key}:\\s*["']?([^"'\\n]+)`, 'i'),
      new RegExp(`${key}\\s*(?:is|=)\\s*["']?([^"'\\n]+)`, 'i')
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return null;
  }
  
  /**
   * Display the todo list
   */
  private displayTodoList(): void {
    console.log(chalk.cyan('\n📝 Todo List:'));
    console.log(chalk.gray('─'.repeat(60)));
    
    this.todoList.forEach((todo, index) => {
      const statusIcon = todo.status === 'completed' ? '✓' :
                        todo.status === 'in_progress' ? '🔄' : '○';
      const statusColor = todo.status === 'completed' ? chalk.green :
                         todo.status === 'in_progress' ? chalk.yellow : chalk.gray;
      
      console.log(statusColor(`  ${statusIcon} ${index + 1}. ${todo.task}`));
    });
    
    console.log(chalk.gray('─'.repeat(60)));
  }
  
  /**
   * Display progress for current task
   */
  private displayProgress(current: number, total: number, task: string): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = '█'.repeat(Math.floor(percentage / 5)) + 
                       '░'.repeat(20 - Math.floor(percentage / 5));
    
    console.log(chalk.cyan(`\n[${progressBar}] ${percentage}%`));
    console.log(chalk.yellow(`📍 Task ${current}/${total}: ${task}`));
  }
  
  /**
   * Display final summary
   */
  private displaySummary(): void {
    const completed = this.todoList.filter(t => t.status === 'completed').length;
    const failed = this.todoList.filter(t => t.status === 'pending').length;
    
    console.log(chalk.cyan('\n📊 Execution Summary'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(chalk.green(`  ✓ Completed: ${completed} tasks`));
    if (failed > 0) {
      console.log(chalk.red(`  ✗ Failed: ${failed} tasks`));
    }
    console.log(chalk.gray('═'.repeat(60)));
    
    // List created files
    const files = fs.readdirSync('.')
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        const stats = fs.statSync(f);
        return ['.html', '.css', '.js', '.json', '.md'].includes(ext) &&
               stats.mtime.getTime() > Date.now() - 300000; // Created in last 5 minutes
      });
    
    if (files.length > 0) {
      console.log(chalk.cyan('\n📁 Created Files:'));
      files.forEach(file => {
        const stats = fs.statSync(file);
        console.log(chalk.gray(`  ✓ ${file} (${stats.size} bytes)`));
      });
    }
    
    console.log(chalk.green('\n✨ PRD execution complete!\n'));
  }
}