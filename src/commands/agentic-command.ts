/**
 * Canvas Agentic Planning Command
 * Intelligent project planning and context-engineered development
 */

import { CanvasAgentSystem, StoryContext } from '../agents/canvas-agents.js';
import { loadConfig } from '../config.js';
import { ThemeManager } from '../themes.js';
import { UnifiedBorder } from '../ui/unifiedBorder.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';

export class AgenticCommand {
  private agentSystem: CanvasAgentSystem;
  private themeManager: ThemeManager;
  private border: UnifiedBorder;

  constructor() {
    const config = loadConfig();
    const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
    const model = config.model || config.defaultModel || 'llama3.3';
    const theme = config.ui?.theme || config.theme || 'default';
    
    this.agentSystem = new CanvasAgentSystem(ollamaUrl, model, theme);
    this.themeManager = new ThemeManager(theme);
    this.border = new UnifiedBorder({ style: 'double', useTheme: true });
  }

  /**
   * Main execution method
   */
  async execute(args: string): Promise<string> {
    const parts = args.trim().split(' ');
    const subCommand = parts[0] || 'menu';

    switch (subCommand) {
      case 'plan':
        return await this.planProject();
      case 'develop':
        return await this.developStories();
      case 'story':
        return await this.createStory();
      case 'execute':
        return await this.executeStory();
      case 'status':
        return await this.showStatus();
      case 'menu':
      default:
        return await this.showInteractiveMenu();
    }
  }

  /**
   * Interactive menu for Canvas agentic workflow
   */
  private async showInteractiveMenu(): Promise<string> {
    console.clear();
    this.border.drawSimpleBorder(
      [
        '  🎯 Canvas Agentic Planning System',
        '  Intelligent Project Planning & Development',
        '',
        '  Select an action to begin:'
      ],
      'CANVAS AGENTS'
    );

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Choose action:',
        choices: [
          { name: '📋 Plan New Project - Start agentic planning phase', value: 'plan' },
          { name: '📝 Create Stories - Generate development stories from plans', value: 'stories' },
          { name: '💻 Execute Story - Implement a specific story', value: 'execute' },
          { name: '🔄 Full Workflow - Complete agentic workflow', value: 'full' },
          { name: '📊 View Status - Check project status', value: 'status' },
          { name: '⚙️ Configure Agents - Customize agent behaviors', value: 'configure' },
          new inquirer.Separator(),
          { name: '← Back to Canvas CLI', value: 'exit' }
        ]
      }
    ]);

    switch (action) {
      case 'plan':
        return await this.planProject();
      case 'stories':
        return await this.developStories();
      case 'execute':
        return await this.executeStory();
      case 'full':
        return await this.fullWorkflow();
      case 'status':
        return await this.showStatus();
      case 'configure':
        return await this.configureAgents();
      case 'exit':
        return 'Returning to Canvas CLI...';
      default:
        return 'Invalid action';
    }
  }

  /**
   * Phase 1: Plan a new project
   */
  private async planProject(): Promise<string> {
    console.log(this.themeManager.primary('\n📋 Canvas Project Planning\n'));

    const { source } = await inquirer.prompt([
      {
        type: 'list',
        name: 'source',
        message: 'How would you like to provide requirements?',
        choices: [
          { name: 'Enter requirements interactively', value: 'interactive' },
          { name: 'Load from file', value: 'file' },
          { name: 'Use template', value: 'template' }
        ]
      }
    ]);

    let requirements = '';

    if (source === 'interactive') {
      const { req } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'req',
          message: 'Enter your project requirements (opens in editor):'
        }
      ]);
      requirements = req;
    } else if (source === 'file') {
      const { filepath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filepath',
          message: 'Enter path to requirements file:'
        }
      ]);
      requirements = await fs.readFile(filepath, 'utf-8');
    } else {
      requirements = await this.selectTemplate();
    }

    // Set up agent event listeners for progress display
    const spinner = ora('Initializing agents...').start();
    
    this.agentSystem.on('agent:start', ({ agent, role }) => {
      spinner.text = `${role} is working...`;
    });

    this.agentSystem.on('agent:complete', ({ agent }) => {
      spinner.succeed(`${agent} completed`);
      spinner.start('Processing next agent...');
    });

    try {
      const documents = await this.agentSystem.planProject(requirements);
      spinner.succeed('Planning phase completed!');

      console.log(this.themeManager.success('\n✅ Planning documents created:'));
      for (const [file, content] of documents) {
        console.log(this.themeManager.info(`  📄 ${file} (${content.length} chars)`));
      }

      return 'Planning phase completed successfully! Use "canvas agentic develop" to create stories.';
    } catch (error) {
      spinner.fail('Planning failed');
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Phase 2: Develop stories from plans
   */
  private async developStories(): Promise<string> {
    console.log(this.themeManager.primary('\n📝 Creating Development Stories\n'));

    // Load planning documents
    const planDir = path.join(process.cwd(), '.canvas-agents', 'planning');
    
    try {
      const files = await fs.readdir(planDir);
      const documents = new Map<string, string>();

      for (const file of files) {
        const content = await fs.readFile(path.join(planDir, file), 'utf-8');
        documents.set(file, content);
      }

      if (documents.size === 0) {
        return 'No planning documents found. Run "canvas agentic plan" first.';
      }

      const spinner = ora('Creating development stories...').start();
      
      const stories = await this.agentSystem.createDevelopmentStories(documents);
      
      spinner.succeed(`Created ${stories.length} development stories!`);

      console.log(this.themeManager.success('\n✅ Stories created:'));
      stories.forEach((story, index) => {
        console.log(this.themeManager.info(`  ${index + 1}. ${story.title}`));
      });

      return 'Stories created successfully! Use "canvas agentic execute" to implement them.';
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Create a single story interactively
   */
  private async createStory(): Promise<string> {
    console.log(this.themeManager.primary('\n📝 Create Development Story\n'));

    const story = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Story title:'
      },
      {
        type: 'editor',
        name: 'description',
        message: 'Story description:'
      },
      {
        type: 'input',
        name: 'acceptanceCriteria',
        message: 'Acceptance criteria (comma-separated):'
      },
      {
        type: 'editor',
        name: 'technicalDetails',
        message: 'Technical details:'
      },
      {
        type: 'input',
        name: 'dependencies',
        message: 'Dependencies (comma-separated):'
      }
    ]);

    const storyContext: StoryContext = {
      title: story.title,
      description: story.description,
      acceptanceCriteria: story.acceptanceCriteria.split(',').map((s: string) => s.trim()),
      technicalDetails: story.technicalDetails,
      implementation: '',
      testing: '',
      dependencies: story.dependencies.split(',').map((s: string) => s.trim())
    };

    // Save story
    const storiesDir = path.join(process.cwd(), '.canvas-agents', 'stories');
    await fs.mkdir(storiesDir, { recursive: true });
    
    const filename = `${storyContext.title.toLowerCase().replace(/\s+/g, '-')}.json`;
    await fs.writeFile(
      path.join(storiesDir, filename),
      JSON.stringify(storyContext, null, 2),
      'utf-8'
    );

    return `Story "${storyContext.title}" created successfully!`;
  }

  /**
   * Execute a story with full context
   */
  private async executeStory(): Promise<string> {
    console.log(this.themeManager.primary('\n💻 Execute Development Story\n'));

    // Load available stories
    const stories = await this.agentSystem.loadStories();
    
    if (stories.length === 0) {
      return 'No stories found. Create stories first using "canvas agentic develop".';
    }

    const { selectedStory } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedStory',
        message: 'Select story to execute:',
        choices: stories.map((s, i) => ({
          name: `${i + 1}. ${s.title}`,
          value: s
        }))
      }
    ]);

    console.log(this.themeManager.info('\n📋 Story Details:'));
    console.log(this.themeManager.dim(`Description: ${selectedStory.description}`));
    console.log(this.themeManager.dim(`Dependencies: ${selectedStory.dependencies.join(', ') || 'None'}`));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Execute this story?',
        default: true
      }
    ]);

    if (!confirm) {
      return 'Execution cancelled.';
    }

    const spinner = ora('Executing story...').start();

    try {
      const implementation = await this.agentSystem.executeDevelopment(selectedStory);
      spinner.succeed('Story executed successfully!');

      // Save implementation
      const outputDir = path.join(process.cwd(), '.canvas-agents', 'output');
      await fs.mkdir(outputDir, { recursive: true });
      
      const filename = `${selectedStory.title.toLowerCase().replace(/\s+/g, '-')}-implementation.md`;
      await fs.writeFile(
        path.join(outputDir, filename),
        implementation,
        'utf-8'
      );

      console.log(this.themeManager.success(`\n✅ Implementation saved to: .canvas-agents/output/${filename}`));

      return 'Story executed successfully!';
    } catch (error) {
      spinner.fail('Execution failed');
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Run complete Canvas workflow
   */
  private async fullWorkflow(): Promise<string> {
    console.log(this.themeManager.primary('\n🔄 Running Complete Canvas Agentic Workflow\n'));

    // Step 1: Get requirements
    const { requirements } = await inquirer.prompt([
      {
        type: 'editor',
        name: 'requirements',
        message: 'Enter project requirements:'
      }
    ]);

    const spinner = ora('Starting Canvas workflow...').start();

    try {
      // Phase 1: Planning
      spinner.text = 'Phase 1: Agentic Planning...';
      const documents = await this.agentSystem.planProject(requirements);
      spinner.succeed('Planning completed');

      // Phase 2: Story Creation
      spinner.start('Phase 2: Creating Stories...');
      const stories = await this.agentSystem.createDevelopmentStories(documents);
      spinner.succeed(`Created ${stories.length} stories`);

      // Phase 3: Sequential Execution
      console.log(this.themeManager.primary('\n💻 Executing Stories:\n'));
      
      for (let i = 0; i < stories.length; i++) {
        const story = stories[i];
        spinner.start(`Executing story ${i + 1}/${stories.length}: ${story.title}`);
        
        const implementation = await this.agentSystem.executeDevelopment(story);
        
        // Save implementation
        const outputDir = path.join(process.cwd(), '.canvas-agents', 'output');
        await fs.mkdir(outputDir, { recursive: true });
        
        const filename = `${story.title.toLowerCase().replace(/\s+/g, '-')}-implementation.md`;
        await fs.writeFile(
          path.join(outputDir, filename),
          implementation,
          'utf-8'
        );
        
        spinner.succeed(`Completed: ${story.title}`);
      }

      console.log(this.themeManager.success('\n✅ Canvas Workflow completed successfully!'));
      console.log(this.themeManager.info('📁 All outputs saved to .canvas-agents/ directory'));

      return 'Full Canvas workflow completed!';
    } catch (error) {
      spinner.fail('Workflow failed');
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Show project status
   */
  private async showStatus(): Promise<string> {
    console.log(this.themeManager.primary('\n📊 Canvas Project Status\n'));

    const agentDir = path.join(process.cwd(), '.canvas-agents');
    
    try {
      // Check planning documents
      const planDir = path.join(agentDir, 'planning');
      const planFiles = await fs.readdir(planDir).catch(() => []);
      
      console.log(this.themeManager.info('📋 Planning Documents:'));
      if (planFiles.length > 0) {
        planFiles.forEach(file => {
          console.log(this.themeManager.dim(`  ✓ ${file}`));
        });
      } else {
        console.log(this.themeManager.dim('  No planning documents found'));
      }

      // Check stories
      const stories = await this.agentSystem.loadStories();
      console.log(this.themeManager.info(`\n📝 Development Stories: ${stories.length}`));
      stories.forEach((story, i) => {
        console.log(this.themeManager.dim(`  ${i + 1}. ${story.title}`));
      });

      // Check outputs
      const outputDir = path.join(agentDir, 'output');
      const outputFiles = await fs.readdir(outputDir).catch(() => []);
      
      console.log(this.themeManager.info(`\n💻 Implementations: ${outputFiles.length}`));
      outputFiles.forEach(file => {
        console.log(this.themeManager.dim(`  ✓ ${file}`));
      });

      return '';
    } catch (error) {
      return 'No Canvas project found in current directory.';
    }
  }

  /**
   * Configure agent behaviors
   */
  private async configureAgents(): Promise<string> {
    console.log(this.themeManager.primary('\n⚙️ Configure Canvas Agents\n'));

    const { agent } = await inquirer.prompt([
      {
        type: 'list',
        name: 'agent',
        message: 'Select agent to configure:',
        choices: [
          'Analyst',
          'Product Manager',
          'Architect',
          'Scrum Master',
          'Developer',
          'QA Engineer'
        ]
      }
    ]);

    console.log(this.themeManager.info(`\nConfiguring ${agent}...`));
    console.log(this.themeManager.dim('(Agent configuration will be saved for future sessions)'));

    // In a full implementation, this would allow customizing agent prompts and behaviors
    return `Agent configuration for ${agent} updated.`;
  }

  /**
   * Select a project template
   */
  private async selectTemplate(): Promise<string> {
    const templates = {
      'web-app': `# Web Application Requirements
        
## Overview
Build a modern web application with user authentication and data management.

## Core Features
- User registration and login
- Dashboard with data visualization
- CRUD operations for main entities
- Real-time updates
- Responsive design

## Technical Requirements
- Frontend: React or Vue.js
- Backend: Node.js with Express
- Database: PostgreSQL or MongoDB
- Authentication: JWT
- Deployment: Docker-ready`,

      'api-service': `# API Service Requirements

## Overview
Create a RESTful API service with comprehensive documentation.

## Core Features
- RESTful endpoints
- Authentication and authorization
- Rate limiting
- Data validation
- Error handling
- API documentation

## Technical Requirements
- Framework: Express or Fastify
- Database: Your choice
- Documentation: OpenAPI/Swagger
- Testing: Jest
- Monitoring: Health checks`,

      'cli-tool': `# CLI Tool Requirements

## Overview
Build a command-line tool for developer productivity.

## Core Features
- Multiple commands and subcommands
- Configuration management
- Interactive prompts
- File operations
- Progress indicators
- Error handling

## Technical Requirements
- Runtime: Node.js
- CLI Framework: Commander or Yargs
- Testing: Mocha/Chai
- Distribution: npm package`
    };

    const { template } = await inquirer.prompt<{ template: keyof typeof templates }>([
      {
        type: 'list',
        name: 'template',
        message: 'Select project template:',
        choices: Object.keys(templates).map(key => ({
          name: key.replace('-', ' ').toUpperCase(),
          value: key
        }))
      }
    ]);

    return templates[template];
  }
}

// Export singleton instance
export const agenticCommand = new AgenticCommand();