#!/usr/bin/env node

/**
 * Canvas CLI Installation Verification Script
 * Checks system requirements and validates installation
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir, platform, arch, totalmem, freemem } from 'os';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

class InstallationVerifier {
  constructor() {
    this.results = {
      system: {},
      runtime: {},
      providers: {},
      features: {},
      errors: [],
      warnings: []
    };
  }

  async verify() {
    console.log(chalk.cyan.bold('\n🎨 Canvas CLI Installation Verification\n'));
    console.log(chalk.gray('=' .repeat(50)));

    await this.checkSystemRequirements();
    await this.checkRuntimeDependencies();
    await this.checkProviders();
    await this.checkFeatures();
    await this.checkConfiguration();
    await this.runDiagnostics();
    
    this.printReport();
    return this.results.errors.length === 0;
  }

  async checkSystemRequirements() {
    const spinner = ora('Checking system requirements...').start();
    
    try {
      // Platform
      this.results.system.platform = platform();
      this.results.system.arch = arch();
      
      // Memory
      const totalMem = Math.round(totalmem() / (1024 * 1024 * 1024));
      const freeMem = Math.round(freemem() / (1024 * 1024 * 1024));
      this.results.system.totalMemory = `${totalMem}GB`;
      this.results.system.freeMemory = `${freeMem}GB`;
      
      if (totalMem < 4) {
        this.results.warnings.push('System has less than 4GB RAM. Performance may be limited.');
      } else if (totalMem < 8) {
        this.results.warnings.push('System has less than 8GB RAM. Large models may not run optimally.');
      }
      
      // Disk space (approximate)
      if (platform() === 'win32') {
        try {
          const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
          this.results.system.diskSpace = 'See details below';
          // Parse Windows disk info
        } catch (e) {
          this.results.system.diskSpace = 'Unable to determine';
        }
      } else {
        try {
          const { stdout } = await execAsync('df -h /');
          const lines = stdout.trim().split('\n');
          if (lines.length > 1) {
            const parts = lines[1].split(/\s+/);
            this.results.system.diskSpace = `${parts[3]} free of ${parts[1]}`;
          }
        } catch (e) {
          this.results.system.diskSpace = 'Unable to determine';
        }
      }
      
      spinner.succeed('System requirements checked');
    } catch (error) {
      spinner.fail('Failed to check system requirements');
      this.results.errors.push(`System check failed: ${error.message}`);
    }
  }

  async checkRuntimeDependencies() {
    const spinner = ora('Checking runtime dependencies...').start();
    
    // Node.js
    try {
      const { stdout } = await execAsync('node --version');
      const version = stdout.trim();
      this.results.runtime.nodejs = version;
      
      const major = parseInt(version.substring(1).split('.')[0]);
      if (major < 20) {
        this.results.errors.push(`Node.js version ${version} is too old. Required: v20.0.0 or later`);
      }
    } catch (error) {
      this.results.errors.push('Node.js not found. Please install Node.js 20.0.0 or later');
    }
    
    // npm
    try {
      const { stdout } = await execAsync('npm --version');
      this.results.runtime.npm = `v${stdout.trim()}`;
    } catch (error) {
      this.results.warnings.push('npm not found');
    }
    
    // Python (optional)
    try {
      const { stdout } = await execAsync('python3 --version || python --version');
      this.results.runtime.python = stdout.trim().replace('Python ', 'v');
    } catch (error) {
      this.results.runtime.python = 'Not installed (optional)';
    }
    
    // Git
    try {
      const { stdout } = await execAsync('git --version');
      this.results.runtime.git = stdout.trim().replace('git version ', 'v');
    } catch (error) {
      this.results.warnings.push('Git not found. Git integration features will be limited');
    }
    
    // Canvas CLI
    try {
      const packagePath = path.join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
      this.results.runtime.canvasCli = `v${packageJson.version}`;
    } catch (error) {
      this.results.errors.push('Canvas CLI package.json not found');
    }
    
    spinner.succeed('Runtime dependencies checked');
  }

  async checkProviders() {
    const spinner = ora('Checking AI providers...').start();
    
    // Ollama
    try {
      const { stdout } = await execAsync('ollama --version');
      this.results.providers.ollama = {
        installed: true,
        version: stdout.trim(),
        status: 'Available'
      };
      
      // Check if Ollama is running
      try {
        await execAsync('curl -s http://localhost:11434/api/tags');
        this.results.providers.ollama.running = true;
      } catch (e) {
        this.results.providers.ollama.running = false;
        this.results.warnings.push('Ollama is installed but not running. Run "ollama serve" to start');
      }
    } catch (error) {
      this.results.providers.ollama = {
        installed: false,
        status: 'Not installed'
      };
      this.results.warnings.push('Ollama not installed. Install from https://ollama.ai for local AI');
    }
    
    // OpenAI
    this.results.providers.openai = {
      configured: !!process.env.OPENAI_API_KEY,
      status: process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'
    };
    
    // Anthropic
    this.results.providers.anthropic = {
      configured: !!process.env.ANTHROPIC_API_KEY,
      status: process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not configured'
    };
    
    // Google
    this.results.providers.google = {
      configured: !!process.env.GOOGLE_API_KEY,
      status: process.env.GOOGLE_API_KEY ? 'Configured' : 'Not configured'
    };
    
    spinner.succeed('AI providers checked');
  }

  async checkFeatures() {
    const spinner = ora('Checking features...').start();
    
    // GitHub CLI
    try {
      const { stdout } = await execAsync('gh --version');
      this.results.features.githubCli = stdout.split('\n')[0].trim();
    } catch (error) {
      this.results.features.githubCli = 'Not installed (optional)';
    }
    
    // Docker
    try {
      const { stdout } = await execAsync('docker --version');
      this.results.features.docker = stdout.trim().replace('Docker version ', 'v');
    } catch (error) {
      this.results.features.docker = 'Not installed (optional)';
    }
    
    // VS Code
    try {
      const { stdout } = await execAsync('code --version');
      this.results.features.vscode = `v${stdout.split('\n')[0].trim()}`;
    } catch (error) {
      this.results.features.vscode = 'Not installed (optional)';
    }
    
    spinner.succeed('Features checked');
  }

  async checkConfiguration() {
    const spinner = ora('Checking configuration...').start();
    
    const configPath = path.join(homedir(), '.canvas-cli', 'config.json');
    
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        this.results.configuration = {
          exists: true,
          path: configPath,
          provider: config.defaultProvider || 'Not set',
          model: config.defaultModel || 'Not set'
        };
      } catch (error) {
        this.results.warnings.push('Configuration file exists but is invalid');
      }
    } else {
      // Create default configuration
      const configDir = path.dirname(configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }
      
      const defaultConfig = {
        defaultProvider: 'ollama',
        defaultModel: 'llama3.2',
        providers: {
          ollama: {
            enabled: true
          }
        }
      };
      
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      this.results.configuration = {
        exists: true,
        path: configPath,
        provider: 'ollama',
        model: 'llama3.2',
        created: true
      };
    }
    
    spinner.succeed('Configuration checked');
  }

  async runDiagnostics() {
    const spinner = ora('Running diagnostics...').start();
    
    try {
      // Test Canvas CLI command
      const { stdout } = await execAsync('canvas --version');
      this.results.diagnostics = {
        cliCommand: 'Working',
        version: stdout.trim()
      };
    } catch (error) {
      this.results.errors.push('Canvas CLI command not working. Check PATH configuration');
    }
    
    // Network connectivity
    try {
      await execAsync('ping -c 1 github.com 2>/dev/null || ping -n 1 github.com');
      this.results.diagnostics.network = 'Connected';
    } catch (error) {
      this.results.warnings.push('Network connectivity issues detected');
    }
    
    spinner.succeed('Diagnostics complete');
  }

  printReport() {
    console.log('\n' + chalk.cyan.bold('📊 Installation Report'));
    console.log(chalk.gray('=' .repeat(50)));
    
    // System
    console.log('\n' + chalk.yellow('System Information:'));
    Object.entries(this.results.system).forEach(([key, value]) => {
      console.log(`  ${chalk.gray('•')} ${key}: ${chalk.white(value)}`);
    });
    
    // Runtime
    console.log('\n' + chalk.yellow('Runtime Dependencies:'));
    Object.entries(this.results.runtime).forEach(([key, value]) => {
      const status = value.includes('Not') ? chalk.gray(value) : chalk.green(value);
      console.log(`  ${chalk.gray('•')} ${key}: ${status}`);
    });
    
    // Providers
    console.log('\n' + chalk.yellow('AI Providers:'));
    Object.entries(this.results.providers).forEach(([key, value]) => {
      const status = value.status || value;
      const color = status.includes('Not') ? chalk.gray : chalk.green;
      console.log(`  ${chalk.gray('•')} ${key}: ${color(status)}`);
    });
    
    // Features
    console.log('\n' + chalk.yellow('Optional Features:'));
    Object.entries(this.results.features).forEach(([key, value]) => {
      const color = value.includes('Not') ? chalk.gray : chalk.green;
      console.log(`  ${chalk.gray('•')} ${key}: ${color(value)}`);
    });
    
    // Configuration
    if (this.results.configuration) {
      console.log('\n' + chalk.yellow('Configuration:'));
      console.log(`  ${chalk.gray('•')} Config file: ${chalk.green(this.results.configuration.path)}`);
      console.log(`  ${chalk.gray('•')} Default provider: ${chalk.white(this.results.configuration.provider)}`);
      console.log(`  ${chalk.gray('•')} Default model: ${chalk.white(this.results.configuration.model)}`);
      if (this.results.configuration.created) {
        console.log(`  ${chalk.green('✓')} Default configuration created`);
      }
    }
    
    // Warnings
    if (this.results.warnings.length > 0) {
      console.log('\n' + chalk.yellow('⚠ Warnings:'));
      this.results.warnings.forEach(warning => {
        console.log(`  ${chalk.yellow('•')} ${warning}`);
      });
    }
    
    // Errors
    if (this.results.errors.length > 0) {
      console.log('\n' + chalk.red('❌ Errors:'));
      this.results.errors.forEach(error => {
        console.log(`  ${chalk.red('•')} ${error}`);
      });
    }
    
    // Summary
    console.log('\n' + chalk.gray('=' .repeat(50)));
    if (this.results.errors.length === 0) {
      console.log(chalk.green.bold('✅ Installation verified successfully!'));
      console.log(chalk.gray('\nRun "canvas" to start using Canvas CLI'));
    } else {
      console.log(chalk.red.bold('❌ Installation verification failed'));
      console.log(chalk.gray('\nPlease fix the errors above and run verification again'));
    }
  }
}

// Run verification
const verifier = new InstallationVerifier();
verifier.verify().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error(chalk.red('Verification failed:'), error);
  process.exit(1);
});