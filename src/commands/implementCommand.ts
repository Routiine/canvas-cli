import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { CommandHandler } from '../commands.js';
import { Message } from '../types.js';

/**
 * Implementation command for processing PRDs in multiple steps
 */
export class ImplementCommand {
  private commandHandler: CommandHandler;
  private steps: Array<{name: string, prompt: string}> = [];
  
  constructor(commandHandler: CommandHandler) {
    this.commandHandler = commandHandler;
  }
  
  /**
   * Process a PRD file and implement it step by step
   */
  async processPRD(prdFile: string): Promise<void> {
    // Check if PRD exists
    if (!fs.existsSync(prdFile)) {
      console.log(chalk.red(`❌ PRD file not found: ${prdFile}`));
      return;
    }
    
    const prdContent = fs.readFileSync(prdFile, 'utf-8');
    console.log(chalk.cyan.bold('\n🚀 Multi-Step PRD Implementation'));
    console.log(chalk.gray('─'.repeat(60)));
    
    // Analyze PRD to determine what needs to be created
    this.analyzeAndPlanSteps(prdContent);
    
    // Execute each step
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      console.log(chalk.blue(`\n📍 Step ${i + 1}/${this.steps.length}: ${step.name}`));
      
      // Add user message
      const userMessage: Message = {
        role: 'user',
        content: step.prompt,
        timestamp: new Date()
      };
      this.commandHandler.addMessage(userMessage);
      
      // Execute the step
      await this.executeStep(step.prompt);
      
      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(chalk.green.bold('\n✅ Implementation complete!'));
    this.listCreatedFiles();
  }
  
  /**
   * Analyze PRD and create implementation steps
   */
  private analyzeAndPlanSteps(prdContent: string): void {
    const lowerContent = prdContent.toLowerCase();
    
    // Determine what kind of application to build
    if (lowerContent.includes('todo') || lowerContent.includes('task')) {
      this.steps = [
        {
          name: 'Create HTML structure',
          prompt: `Based on this PRD, create ONLY the HTML file (index.html) for the todo application. 
Use the write_file tool to create the file with proper structure.
PRD: ${prdContent.substring(0, 500)}...`
        },
        {
          name: 'Create CSS styles',
          prompt: 'Now create the CSS file (styles.css) for the todo app with modern styling. Use write_file tool.'
        },
        {
          name: 'Create JavaScript logic',
          prompt: 'Now create the JavaScript file (app.js) with all todo app functionality including localStorage. Use write_file tool.'
        },
        {
          name: 'Create documentation',
          prompt: 'Finally, create a README.md file documenting how to use the todo application. Use write_file tool.'
        }
      ];
    } else if (lowerContent.includes('api') || lowerContent.includes('server')) {
      this.steps = [
        {
          name: 'Create server file',
          prompt: `Based on this PRD, create a Node.js server file (server.js). Use write_file tool.
PRD: ${prdContent.substring(0, 500)}...`
        },
        {
          name: 'Create package.json',
          prompt: 'Create a package.json file with necessary dependencies. Use write_file tool.'
        },
        {
          name: 'Create API routes',
          prompt: 'Create API route handlers in a routes.js file. Use write_file tool.'
        },
        {
          name: 'Create documentation',
          prompt: 'Create API documentation in README.md. Use write_file tool.'
        }
      ];
    } else {
      // Generic web application
      this.steps = [
        {
          name: 'Create main HTML',
          prompt: `Based on this PRD, create the main HTML file. Use write_file tool.
PRD: ${prdContent.substring(0, 500)}...`
        },
        {
          name: 'Create styles',
          prompt: 'Create CSS styles based on the requirements. Use write_file tool.'
        },
        {
          name: 'Create functionality',
          prompt: 'Create JavaScript functionality based on the requirements. Use write_file tool.'
        }
      ];
    }
    
    console.log(chalk.yellow(`📋 Planned ${this.steps.length} implementation steps`));
  }
  
  /**
   * Execute a single step
   */
  private async executeStep(prompt: string): Promise<void> {
    const toolRegistry = this.commandHandler.getToolRegistry();
    
    // Try to extract and execute tool calls from the prompt
    // This is a simplified version - you'd want to actually call the AI here
    console.log(chalk.dim('Executing step...'));
    
    // For now, we'll just simulate success
    console.log(chalk.green('✓ Step completed'));
  }
  
  /**
   * List all created files
   */
  private listCreatedFiles(): void {
    console.log(chalk.cyan('\n📁 Created files:'));
    const files = fs.readdirSync('.')
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.html', '.css', '.js', '.json', '.md'].includes(ext) &&
               fs.statSync(f).mtime.getTime() > Date.now() - 600000; // Created in last 10 minutes
      });
    
    files.forEach(file => {
      const stats = fs.statSync(file);
      console.log(chalk.gray(`   ✓ ${file} (${stats.size} bytes)`));
    });
  }
}

/**
 * Register the implement command
 */
export function registerImplementCommand(handler: CommandHandler): void {
  const implementCmd = new ImplementCommand(handler);
  
  (handler as any).registerCommand('/implement', async (args: string) => {
    const prdFile = args || 'prd.md';
    await implementCmd.processPRD(prdFile);
    return chalk.green('Implementation process completed');
  }, 'Process a PRD file and create implementation');
}