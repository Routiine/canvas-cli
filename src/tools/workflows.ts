import type { ToolRegistry } from './registry.js';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

interface WorkflowStep {
  tool: string;
  params: any;
  condition?: (previousResult: any) => boolean;
  transform?: (previousResult: any) => any;
  onError?: 'skip' | 'retry' | 'abort';
}

interface Workflow {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
    this.registerBuiltInWorkflows();
  }

  private registerBuiltInWorkflows() {
    // Create React Component workflow
    this.registerWorkflow({
      name: 'create_react_component',
      description: 'Create a new React component with test and styles',
      steps: [
        {
          tool: 'write_file',
          params: (input: any) => ({
            path: `${input.path}/${input.name}.tsx`,
            content: this.getReactComponentTemplate(input.name)
          })
        },
        {
          tool: 'write_file',
          params: (input: any) => ({
            path: `${input.path}/${input.name}.test.tsx`,
            content: this.getReactTestTemplate(input.name)
          })
        },
        {
          tool: 'write_file',
          params: (input: any) => ({
            path: `${input.path}/${input.name}.module.css`,
            content: this.getReactStyleTemplate(input.name)
          })
        }
      ]
    });

    // Git commit workflow
    this.registerWorkflow({
      name: 'smart_commit',
      description: 'Stage changes, generate commit message, and commit',
      steps: [
        {
          tool: 'git_status',
          params: { detailed: true }
        },
        {
          tool: 'git_add',
          params: { files: ['.'] },
          condition: (result) => result.modified.length > 0
        },
        {
          tool: 'git_commit',
          params: (input: any, results: any[]) => ({
            message: this.generateCommitMessage(results[0])
          })
        }
      ]
    });

    // Project setup workflow
    this.registerWorkflow({
      name: 'setup_project',
      description: 'Initialize a new project with common files',
      steps: [
        {
          tool: 'shell_command',
          params: { command: 'npm init -y' }
        },
        {
          tool: 'write_file',
          params: { 
            path: '.gitignore',
            content: 'node_modules/\n.env\ndist/\n*.log'
          }
        },
        {
          tool: 'write_file',
          params: {
            path: 'README.md',
            content: '# New Project\n\nCreated with Canvas CLI'
          }
        },
        {
          tool: 'git_init',
          params: {}
        },
        {
          tool: 'git_add',
          params: { files: ['.'] }
        },
        {
          tool: 'git_commit',
          params: { message: 'Initial commit' }
        }
      ]
    });

    // Code review workflow
    this.registerWorkflow({
      name: 'code_review',
      description: 'Analyze code quality and suggest improvements',
      steps: [
        {
          tool: 'list_directory',
          params: { path: 'src', recursive: true }
        },
        {
          tool: 'shell_command',
          params: { command: 'npm run lint' },
          onError: 'skip'
        },
        {
          tool: 'shell_command',
          params: { command: 'npm test' },
          onError: 'skip'
        }
      ]
    });
  }

  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.name, workflow);
  }

  async executeWorkflow(name: string, initialParams: any = {}): Promise<any[]> {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow '${name}' not found`);
    }

    console.log(chalk.cyan(`\n🔄 Executing workflow: ${workflow.name}`));
    console.log(chalk.dim(workflow.description));

    const results: any[] = [];
    const currentParams = initialParams;

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      console.log(chalk.yellow(`\nStep ${i + 1}/${workflow.steps.length}: ${step.tool}`));

      // Check condition
      if (step.condition && results.length > 0) {
        const shouldExecute = step.condition(results[results.length - 1]);
        if (!shouldExecute) {
          console.log(chalk.dim('  Skipped (condition not met)'));
          continue;
        }
      }

      // Prepare parameters
      let params = step.params;
      if (typeof params === 'function') {
        params = params(currentParams, results);
      }

      // Apply transformation from previous result
      if (step.transform && results.length > 0) {
        params = { ...params, ...step.transform(results[results.length - 1]) };
      }

      try {
        const result = await this.toolRegistry.execute(step.tool, params);
        results.push(result);
        console.log(chalk.green(`  ✓ Completed`));
      } catch (error: any) {
        console.log(chalk.red(`  ✗ Failed: ${error.message}`));
        
        switch (step.onError) {
          case 'skip':
            console.log(chalk.dim('  → Continuing...'));
            continue;
          case 'retry':
            console.log(chalk.dim('  → Retrying...'));
            i--; // Retry this step
            continue;
          case 'abort':
          default:
            throw error;
        }
      }
    }

    console.log(chalk.green(`\n✅ Workflow completed with ${results.length} successful steps`));
    return results;
  }

  listWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  private getReactComponentTemplate(name: string): string {
    return `import React from 'react';
import styles from './${name}.module.css';

interface ${name}Props {
  // Add props here
}

export const ${name}: React.FC<${name}Props> = (props) => {
  return (
    <div className={styles.container}>
      <h1>${name} Component</h1>
    </div>
  );
};`;
  }

  private getReactTestTemplate(name: string): string {
    return `import { render, screen } from '@testing-library/react';
import { ${name} } from './${name}';

describe('${name}', () => {
  it('renders correctly', () => {
    render(<${name} />);
    expect(screen.getByText('${name} Component')).toBeInTheDocument();
  });
});`;
  }

  private getReactStyleTemplate(name: string): string {
    return `.container {
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
}`;
  }

  private generateCommitMessage(status: any): string {
    const changes = [];
    if (status.created.length > 0) changes.push(`Added ${status.created.length} files`);
    if (status.modified.length > 0) changes.push(`Modified ${status.modified.length} files`);
    if (status.deleted.length > 0) changes.push(`Deleted ${status.deleted.length} files`);
    
    return changes.join(', ') || 'Update files';
  }
}