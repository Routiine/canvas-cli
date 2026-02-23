/**
 * Quick Start Agent
 * Rapid project initialization and environment setup
 * Repository Integration: https://github.com/HugoRCD/canvas.git
 */

import { BaseAgent } from '../base-agent.js';
import { AgentConfig, AgentResult } from '../agent-types.js';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora, { Ora } from 'ora';

export interface ProjectConfig {
  name: string;
  type: 'react' | 'vue' | 'node' | 'python' | 'go' | 'rust' | 'next' | 'nuxt';
  packageManager: 'npm' | 'yarn' | 'pnpm';
  features: {
    typescript?: boolean;
    testing?: boolean;
    docker?: boolean;
    ci?: boolean;
    linting?: boolean;
    preCommitHooks?: boolean;
  };
  dependencies?: string[];
  devDependencies?: string[];
}

export interface SetupResult {
  projectPath: string;
  initialized: boolean;
  gitRepo: boolean;
  dependencies: boolean;
  docker?: boolean;
  ci?: boolean;
  tests?: boolean;
  documentation: boolean;
}

export class QuickStartAgent extends BaseAgent {
  private templates: Map<string, string> = new Map();
  private spinner: Ora | null = null;

  constructor() {
    super({
      name: 'Quick Start Agent',
      role: 'quick-start',
      model: 'claude-3-opus',
      temperature: 0.5,
      maxTokens: 4000,
      systemPrompt: `You are a project initialization expert specializing in rapid setup and configuration.
      You create production-ready project structures with best practices, testing, and CI/CD.
      You ensure proper development environment configuration and dependency management.`
    });

    this.initializeTemplates();
  }

  /**
   * Initialize project templates
   */
  private initializeTemplates(): void {
    this.templates.set('react', 'https://github.com/HugoRCD/canvas.git');
    this.templates.set('vue', 'https://github.com/nuxt/starter.git');
    this.templates.set('node', 'https://github.com/nodejs/node-addon-examples.git');
    this.templates.set('next', 'https://github.com/vercel/next.js.git');
    this.templates.set('nuxt', 'https://github.com/nuxt/nuxt.git');
  }

  /**
   * Execute quick start setup
   */
  async execute(input: any): Promise<AgentResult> {
    const startTime = Date.now();
    try {
      const inputStr = typeof input === 'string' ? input : input.description || JSON.stringify(input);
      const config = await this.gatherProjectConfig(inputStr);
      const result = await this.setupProject(config);
      const report = this.generateSetupReport(config, result);

      return {
        success: true,
        output: report,
        metadata: {
          duration: Date.now() - startTime,
          agent: this.config.name
        }
      };
    } catch (error: any) {
      return {
        success: false,
        output: '',
        error: error.message,
        metadata: {
          duration: Date.now() - startTime,
          agent: this.config.name
        }
      };
    }
  }

  /**
   * Gather project configuration
   */
  private async gatherProjectConfig(input: string): Promise<ProjectConfig> {
    // Parse input for configuration hints
    const config: ProjectConfig = {
      name: 'my-project',
      type: 'node',
      packageManager: 'npm',
      features: {}
    };

    // Extract project name if provided
    const nameMatch = input.match(/project[:\s]+(\S+)/i);
    if (nameMatch) {
      config.name = nameMatch[1];
    }

    // Detect project type
    if (input.includes('react')) config.type = 'react';
    else if (input.includes('vue')) config.type = 'vue';
    else if (input.includes('python')) config.type = 'python';
    else if (input.includes('go')) config.type = 'go';
    else if (input.includes('rust')) config.type = 'rust';
    else if (input.includes('next')) config.type = 'next';
    else if (input.includes('nuxt')) config.type = 'nuxt';

    // Detect features
    config.features = {
      typescript: input.includes('typescript') || input.includes('ts'),
      testing: input.includes('test') || input.includes('jest'),
      docker: input.includes('docker'),
      ci: input.includes('ci') || input.includes('github actions'),
      linting: input.includes('lint') || input.includes('eslint'),
      preCommitHooks: input.includes('hooks') || input.includes('husky')
    };

    return config;
  }

  /**
   * Setup the project
   */
  private async setupProject(config: ProjectConfig): Promise<SetupResult> {
    const result: SetupResult = {
      projectPath: path.resolve(config.name),
      initialized: false,
      gitRepo: false,
      dependencies: false,
      documentation: false
    };

    try {
      // 1. Create project directory
      this.spinner = ora('Creating project structure...').start();
      await this.createProjectStructure(config, result.projectPath);
      result.initialized = true;
      this.spinner.succeed('Project structure created');

      // 2. Initialize git repository
      this.spinner = ora('Initializing git repository...').start();
      await this.initializeGit(result.projectPath);
      result.gitRepo = true;
      this.spinner.succeed('Git repository initialized');

      // 3. Setup package.json and dependencies
      this.spinner = ora('Installing dependencies...').start();
      await this.setupDependencies(config, result.projectPath);
      result.dependencies = true;
      this.spinner.succeed('Dependencies installed');

      // 4. Setup testing framework
      if (config.features.testing) {
        this.spinner = ora('Setting up testing framework...').start();
        await this.setupTesting(config, result.projectPath);
        result.tests = true;
        this.spinner.succeed('Testing framework configured');
      }

      // 5. Setup Docker
      if (config.features.docker) {
        this.spinner = ora('Creating Docker configuration...').start();
        await this.setupDocker(config, result.projectPath);
        result.docker = true;
        this.spinner.succeed('Docker configuration created');
      }

      // 6. Setup CI/CD
      if (config.features.ci) {
        this.spinner = ora('Setting up CI/CD pipeline...').start();
        await this.setupCI(config, result.projectPath);
        result.ci = true;
        this.spinner.succeed('CI/CD pipeline configured');
      }

      // 7. Setup linting and formatting
      if (config.features.linting) {
        this.spinner = ora('Configuring linting and formatting...').start();
        await this.setupLinting(config, result.projectPath);
        this.spinner.succeed('Linting and formatting configured');
      }

      // 8. Setup pre-commit hooks
      if (config.features.preCommitHooks) {
        this.spinner = ora('Setting up pre-commit hooks...').start();
        await this.setupPreCommitHooks(config, result.projectPath);
        this.spinner.succeed('Pre-commit hooks configured');
      }

      // 9. Create documentation
      this.spinner = ora('Creating documentation...').start();
      await this.createDocumentation(config, result.projectPath);
      result.documentation = true;
      this.spinner.succeed('Documentation created');

      // 10. Configure VS Code workspace
      this.spinner = ora('Configuring VS Code workspace...').start();
      await this.setupVSCodeWorkspace(config, result.projectPath);
      this.spinner.succeed('VS Code workspace configured');

    } catch (error: any) {
      if (this.spinner) this.spinner.fail(`Setup failed: ${error.message}`);
      throw error;
    }

    return result;
  }

  /**
   * Create project structure
   */
  private async createProjectStructure(config: ProjectConfig, projectPath: string): Promise<void> {
    await fs.ensureDir(projectPath);

    // Create standard directories
    const directories = [
      'src',
      'tests',
      'docs',
      'scripts',
      '.github/workflows',
      'config'
    ];

    if (config.type === 'react' || config.type === 'vue' || config.type === 'next' || config.type === 'nuxt') {
      directories.push('public', 'src/components', 'src/pages', 'src/styles', 'src/utils');
    }

    if (config.type === 'node') {
      directories.push('src/routes', 'src/controllers', 'src/models', 'src/services', 'src/middleware');
    }

    for (const dir of directories) {
      await fs.ensureDir(path.join(projectPath, dir));
    }

    // Create initial files
    await this.createInitialFiles(config, projectPath);
  }

  /**
   * Create initial project files
   */
  private async createInitialFiles(config: ProjectConfig, projectPath: string): Promise<void> {
    // .gitignore
    const gitignore = `# Dependencies
node_modules/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build
dist/
build/
*.tsbuildinfo
.next/
.nuxt/
out/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
.DS_Store

# Testing
coverage/
.nyc_output/

# Misc
*.pid
*.seed
*.pid.lock`;

    await fs.writeFile(path.join(projectPath, '.gitignore'), gitignore);

    // README.md
    const readme = `# ${config.name}

## Description
Project created with Canvas CLI Quick Start Agent.

## Features
${Object.entries(config.features)
  .filter(([_, enabled]) => enabled)
  .map(([feature]) => `- ${feature}`)
  .join('\n')}

## Getting Started

### Prerequisites
- Node.js ${config.type === 'node' ? '18+' : '16+'}
- ${config.packageManager}

### Installation
\`\`\`bash
${config.packageManager} install
\`\`\`

### Development
\`\`\`bash
${config.packageManager} run dev
\`\`\`

### Testing
\`\`\`bash
${config.packageManager} test
\`\`\`

### Building
\`\`\`bash
${config.packageManager} run build
\`\`\`

## License
MIT`;

    await fs.writeFile(path.join(projectPath, 'README.md'), readme);
  }

  /**
   * Initialize git repository
   */
  private async initializeGit(projectPath: string): Promise<void> {
    await this.runCommand('git', ['init'], projectPath);
    await this.runCommand('git', ['add', '.'], projectPath);
    await this.runCommand('git', ['commit', '-m', 'Initial commit'], projectPath);
  }

  /**
   * Setup dependencies
   */
  private async setupDependencies(config: ProjectConfig, projectPath: string): Promise<void> {
    const packageJson = {
      name: config.name,
      version: '1.0.0',
      description: `${config.name} project`,
      main: 'dist/index.js',
      scripts: {
        dev: config.type === 'react' ? 'vite' : 'nodemon src/index.js',
        build: config.type === 'react' ? 'vite build' : 'tsc',
        test: 'jest',
        lint: 'eslint src --ext .ts,.tsx,.js,.jsx',
        format: 'prettier --write "src/**/*.{ts,tsx,js,jsx,json,css,md}"'
      },
      dependencies: {},
      devDependencies: {}
    };

    // Add type-specific dependencies
    if (config.type === 'react') {
      packageJson.dependencies = {
        'react': '^18.2.0',
        'react-dom': '^18.2.0'
      };
      packageJson.devDependencies = {
        '@vitejs/plugin-react': '^4.0.0',
        'vite': '^4.4.0'
      };
    } else if (config.type === 'vue') {
      packageJson.dependencies = {
        'vue': '^3.3.0'
      };
      packageJson.devDependencies = {
        '@vitejs/plugin-vue': '^4.0.0',
        'vite': '^4.4.0'
      };
    } else if (config.type === 'node') {
      packageJson.dependencies = {
        'express': '^4.18.0',
        'cors': '^2.8.5',
        'dotenv': '^16.0.0'
      };
      packageJson.devDependencies = {
        'nodemon': '^3.0.0'
      };
    }

    // Add TypeScript if enabled
    if (config.features.typescript) {
      Object.assign(packageJson.devDependencies, {
        'typescript': '^5.0.0',
        '@types/node': '^20.0.0'
      });

      if (config.type === 'react') {
        Object.assign(packageJson.devDependencies, {
          '@types/react': '^18.2.0',
          '@types/react-dom': '^18.2.0'
        });
      }
    }

    // Add testing dependencies
    if (config.features.testing) {
      Object.assign(packageJson.devDependencies, {
        'jest': '^29.0.0',
        '@types/jest': '^29.0.0',
        'ts-jest': '^29.0.0'
      });
    }

    // Add linting dependencies
    if (config.features.linting) {
      Object.assign(packageJson.devDependencies, {
        'eslint': '^8.0.0',
        'prettier': '^3.0.0',
        '@typescript-eslint/parser': '^6.0.0',
        '@typescript-eslint/eslint-plugin': '^6.0.0'
      });
    }

    await fs.writeJSON(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });
    
    // Install dependencies
    await this.runCommand(config.packageManager, ['install'], projectPath);
  }

  /**
   * Setup testing framework
   */
  private async setupTesting(config: ProjectConfig, projectPath: string): Promise<void> {
    const jestConfig = {
      preset: config.features.typescript ? 'ts-jest' : undefined,
      testEnvironment: config.type === 'react' || config.type === 'vue' ? 'jsdom' : 'node',
      coverageDirectory: 'coverage',
      collectCoverageFrom: [
        'src/**/*.{js,jsx,ts,tsx}',
        '!src/**/*.d.ts',
        '!src/index.{js,ts}'
      ],
      testMatch: [
        '**/__tests__/**/*.{js,jsx,ts,tsx}',
        '**/*.{spec,test}.{js,jsx,ts,tsx}'
      ]
    };

    await fs.writeJSON(path.join(projectPath, 'jest.config.json'), jestConfig, { spaces: 2 });

    // Create sample test
    const testDir = path.join(projectPath, 'tests');
    await fs.ensureDir(testDir);
    
    const sampleTest = `describe('Sample Test', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });
});`;

    await fs.writeFile(
      path.join(testDir, `sample.test.${config.features.typescript ? 'ts' : 'js'}`),
      sampleTest
    );
  }

  /**
   * Setup Docker configuration
   */
  private async setupDocker(config: ProjectConfig, projectPath: string): Promise<void> {
    const dockerfile = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN ${config.packageManager} install

COPY . .

RUN ${config.packageManager} run build

EXPOSE 3000

CMD ["${config.packageManager}", "start"]`;

    await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfile);

    const dockerCompose = `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - .:/app
      - /app/node_modules`;

    await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), dockerCompose);

    const dockerignore = `node_modules
npm-debug.log
.git
.gitignore
README.md
.env
coverage`;

    await fs.writeFile(path.join(projectPath, '.dockerignore'), dockerignore);
  }

  /**
   * Setup CI/CD pipeline
   */
  private async setupCI(config: ProjectConfig, projectPath: string): Promise<void> {
    const githubWorkflow = `name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [16.x, 18.x, 20.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        cache: '${config.packageManager}'
    
    - run: ${config.packageManager} install
    - run: ${config.packageManager} run lint
    - run: ${config.packageManager} test
    - run: ${config.packageManager} run build
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      if: matrix.node-version == '18.x'

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to production
      run: echo "Deploy to production server"`;

    await fs.writeFile(
      path.join(projectPath, '.github/workflows/ci.yml'),
      githubWorkflow
    );
  }

  /**
   * Setup linting and formatting
   */
  private async setupLinting(config: ProjectConfig, projectPath: string): Promise<void> {
    const eslintConfig = {
      extends: [
        'eslint:recommended',
        config.features.typescript ? 'plugin:@typescript-eslint/recommended' : null
      ].filter(Boolean),
      parser: config.features.typescript ? '@typescript-eslint/parser' : undefined,
      plugins: config.features.typescript ? ['@typescript-eslint'] : [],
      env: {
        node: true,
        es2021: true,
        jest: config.features.testing
      },
      rules: {
        'no-console': 'warn',
        'no-unused-vars': 'error'
      }
    };

    await fs.writeJSON(path.join(projectPath, '.eslintrc.json'), eslintConfig, { spaces: 2 });

    const prettierConfig = {
      semi: true,
      trailingComma: 'es5',
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2
    };

    await fs.writeJSON(path.join(projectPath, '.prettierrc'), prettierConfig, { spaces: 2 });
  }

  /**
   * Setup pre-commit hooks
   */
  private async setupPreCommitHooks(config: ProjectConfig, projectPath: string): Promise<void> {
    await this.runCommand(config.packageManager, ['add', '-D', 'husky', 'lint-staged'], projectPath);
    await this.runCommand('npx', ['husky', 'install'], projectPath);
    await this.runCommand('npx', ['husky', 'add', '.husky/pre-commit', 'npx lint-staged'], projectPath);

    const lintStaged = {
      '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
      '*.{json,md,yml,yaml}': ['prettier --write']
    };

    // Update package.json with lint-staged config
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = await fs.readJSON(packageJsonPath);
    packageJson['lint-staged'] = lintStaged;
    await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
  }

  /**
   * Create documentation
   */
  private async createDocumentation(config: ProjectConfig, projectPath: string): Promise<void> {
    const contributing = `# Contributing to ${config.name}

## Development Setup
1. Fork the repository
2. Clone your fork
3. Install dependencies: \`${config.packageManager} install\`
4. Create a feature branch
5. Make your changes
6. Run tests: \`${config.packageManager} test\`
7. Submit a pull request

## Code Style
- Follow the existing code style
- Use meaningful variable names
- Write tests for new features
- Update documentation as needed`;

    await fs.writeFile(path.join(projectPath, 'CONTRIBUTING.md'), contributing);

    const license = `MIT License

Copyright (c) ${new Date().getFullYear()} ${config.name}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

    await fs.writeFile(path.join(projectPath, 'LICENSE'), license);
  }

  /**
   * Setup VS Code workspace
   */
  private async setupVSCodeWorkspace(config: ProjectConfig, projectPath: string): Promise<void> {
    const vscodeDir = path.join(projectPath, '.vscode');
    await fs.ensureDir(vscodeDir);

    const settings = {
      'editor.formatOnSave': true,
      'editor.codeActionsOnSave': {
        'source.fixAll.eslint': true
      },
      'eslint.validate': ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'],
      'files.exclude': {
        'node_modules': true,
        'dist': true,
        'coverage': true
      }
    };

    await fs.writeJSON(path.join(vscodeDir, 'settings.json'), settings, { spaces: 2 });

    const extensions = {
      recommendations: [
        'dbaeumer.vscode-eslint',
        'esbenp.prettier-vscode',
        config.features.docker ? 'ms-azuretools.vscode-docker' : null,
        config.features.typescript ? 'ms-vscode.vscode-typescript-next' : null
      ].filter(Boolean)
    };

    await fs.writeJSON(path.join(vscodeDir, 'extensions.json'), extensions, { spaces: 2 });
  }

  /**
   * Run shell command
   */
  private runCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, { cwd, shell: true });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed: ${command} ${args.join(' ')}`));
        }
      });

      process.on('error', reject);
    });
  }

  /**
   * Generate setup report
   */
  private generateSetupReport(config: ProjectConfig, result: SetupResult): string {
    const report = `
${chalk.green('✅ Project Setup Complete!')}

${chalk.blue('Project Details:')}
• Name: ${config.name}
• Type: ${config.type}
• Path: ${result.projectPath}

${chalk.blue('Features Configured:')}
${result.initialized ? '✅' : '❌'} Project structure
${result.gitRepo ? '✅' : '❌'} Git repository
${result.dependencies ? '✅' : '❌'} Dependencies
${config.features.typescript ? '✅' : '❌'} TypeScript
${result.tests ? '✅' : '❌'} Testing framework
${result.docker ? '✅' : '❌'} Docker configuration
${result.ci ? '✅' : '❌'} CI/CD pipeline
${config.features.linting ? '✅' : '❌'} Linting & formatting
${config.features.preCommitHooks ? '✅' : '❌'} Pre-commit hooks
${result.documentation ? '✅' : '❌'} Documentation

${chalk.blue('Next Steps:')}
1. cd ${config.name}
2. ${config.packageManager} run dev
3. Open http://localhost:3000

${chalk.gray('Happy coding! 🚀')}
`;

    return report;
  }
}

// Export singleton instance
export const quickStartAgent = new QuickStartAgent();