/**
 * Canvas CLI Doctor Command
 * System diagnostics and health check
 */

import { loadConfig } from '../config.js';
import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { homedir, platform, arch, totalmem, freemem, cpus } from 'os';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

const execAsync = promisify(exec);

interface DiagnosticResult {
  category: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warning' | 'info';
    message: string;
    details?: string;
  }>;
}

export class DoctorCommand {
  private results: DiagnosticResult[] = [];

  async execute(options: { verbose?: boolean; fix?: boolean }) {
    console.log(chalk.cyan.bold('\n🏥 Canvas CLI Doctor\n'));
    console.log(chalk.gray('Running system diagnostics...\n'));

    await this.checkSystem();
    await this.checkRuntime();
    await this.checkProviders();
    await this.checkPerformance();
    await this.checkSecurity();
    
    if (options.fix) {
      await this.attemptFixes();
    }
    
    this.printReport(options.verbose);
  }

  private async checkSystem() {
    const spinner = ora('Checking system...').start();
    const checks: any[] = [];

    // Platform check
    const currentPlatform = platform();
    const supportedPlatforms = ['darwin', 'linux', 'win32'];
    checks.push({
      name: 'Operating System',
      status: supportedPlatforms.includes(currentPlatform) ? 'pass' : 'warning',
      message: `${currentPlatform} (${arch()})`,
      details: supportedPlatforms.includes(currentPlatform) 
        ? 'Fully supported platform'
        : 'Platform may have limited support'
    });

    // Memory check
    const totalMem = totalmem() / (1024 * 1024 * 1024);
    const freeMem = freemem() / (1024 * 1024 * 1024);
    checks.push({
      name: 'Memory',
      status: totalMem >= 8 ? 'pass' : totalMem >= 4 ? 'warning' : 'fail',
      message: `${totalMem.toFixed(1)}GB total, ${freeMem.toFixed(1)}GB free`,
      details: totalMem < 8 ? 'Consider upgrading RAM for optimal performance' : undefined
    });

    // CPU check
    const cpuInfo = cpus();
    checks.push({
      name: 'CPU',
      status: cpuInfo.length >= 4 ? 'pass' : 'warning',
      message: `${cpuInfo.length} cores (${cpuInfo[0].model})`,
      details: cpuInfo.length < 4 ? 'More CPU cores recommended for better performance' : undefined
    });

    this.results.push({ category: 'System', checks });
    spinner.succeed('System check complete');
  }

  private async checkRuntime() {
    const spinner = ora('Checking runtime dependencies...').start();
    const checks: any[] = [];

    // Node.js version
    try {
      const { stdout } = await execAsync('node --version');
      const version = stdout.trim();
      const major = parseInt(version.substring(1).split('.')[0]);
      checks.push({
        name: 'Node.js',
        status: major >= 20 ? 'pass' : 'fail',
        message: version,
        details: major < 20 ? 'Update to Node.js 20.0.0 or later' : undefined
      });
    } catch (error) {
      checks.push({
        name: 'Node.js',
        status: 'fail',
        message: 'Not found',
        details: 'Install Node.js 20.0.0 or later'
      });
    }

    // npm version
    try {
      const { stdout } = await execAsync('npm --version');
      checks.push({
        name: 'npm',
        status: 'pass',
        message: `v${stdout.trim()}`
      });
    } catch (error) {
      checks.push({
        name: 'npm',
        status: 'warning',
        message: 'Not found',
        details: 'npm is recommended for package management'
      });
    }

    // Git
    try {
      const { stdout } = await execAsync('git --version');
      checks.push({
        name: 'Git',
        status: 'pass',
        message: stdout.trim().replace('git version ', '')
      });
    } catch (error) {
      checks.push({
        name: 'Git',
        status: 'warning',
        message: 'Not found',
        details: 'Git is required for version control features'
      });
    }

    // Python (optional)
    try {
      const { stdout } = await execAsync('python3 --version || python --version');
      checks.push({
        name: 'Python',
        status: 'info',
        message: stdout.trim().replace('Python ', ''),
        details: 'Optional, enhances certain features'
      });
    } catch (error) {
      checks.push({
        name: 'Python',
        status: 'info',
        message: 'Not installed',
        details: 'Optional, install for enhanced features'
      });
    }

    this.results.push({ category: 'Runtime', checks });
    spinner.succeed('Runtime check complete');
  }

  private async checkProviders() {
    const spinner = ora('Checking AI providers...').start();
    const checks: any[] = [];

    // Ollama
    try {
      const { stdout } = await execAsync('ollama --version');
      let status: 'pass' | 'warning' = 'pass';
      let details: string | undefined;
      
      // Check if running
      try {
        await execAsync('curl -s http://localhost:11434/api/tags');
      } catch (e) {
        status = 'warning';
        details = 'Ollama installed but not running. Run "ollama serve"';
      }
      
      checks.push({
        name: 'Ollama',
        status,
        message: 'Installed',
        details
      });
    } catch (error) {
      checks.push({
        name: 'Ollama',
        status: 'info',
        message: 'Not installed',
        details: 'Install from https://ollama.ai for local AI'
      });
    }

    // API Keys
    checks.push({
      name: 'OpenAI API',
      status: process.env.OPENAI_API_KEY ? 'pass' : 'info',
      message: process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured',
      details: !process.env.OPENAI_API_KEY ? 'Set OPENAI_API_KEY to use OpenAI models' : undefined
    });

    checks.push({
      name: 'Anthropic API',
      status: process.env.ANTHROPIC_API_KEY ? 'pass' : 'info',
      message: process.env.ANTHROPIC_API_KEY ? 'Configured' : 'Not configured',
      details: !process.env.ANTHROPIC_API_KEY ? 'Set ANTHROPIC_API_KEY to use Claude models' : undefined
    });

    this.results.push({ category: 'AI Providers', checks });
    spinner.succeed('Provider check complete');
  }

  private async checkPerformance() {
    const spinner = ora('Checking performance...').start();
    const checks: any[] = [];

    // Disk I/O test
    const startTime = Date.now();
    try {
      const testFile = path.join(homedir(), '.canvas-cli', 'test.tmp');
      await execAsync(`echo "test" > "${testFile}" && rm "${testFile}"`);
      const ioTime = Date.now() - startTime;
      
      checks.push({
        name: 'Disk I/O',
        status: ioTime < 100 ? 'pass' : ioTime < 500 ? 'warning' : 'fail',
        message: `${ioTime}ms response time`,
        details: ioTime > 100 ? 'Slow disk I/O detected' : undefined
      });
    } catch (error) {
      checks.push({
        name: 'Disk I/O',
        status: 'warning',
        message: 'Could not test',
        details: 'Unable to perform disk I/O test'
      });
    }

    // Network latency
    try {
      const pingStart = Date.now();
      await execAsync('ping -c 1 github.com 2>/dev/null || ping -n 1 github.com');
      const latency = Date.now() - pingStart;
      
      checks.push({
        name: 'Network',
        status: latency < 100 ? 'pass' : latency < 500 ? 'warning' : 'fail',
        message: `${latency}ms to github.com`,
        details: latency > 100 ? 'High network latency detected' : undefined
      });
    } catch (error) {
      checks.push({
        name: 'Network',
        status: 'warning',
        message: 'Connectivity issues',
        details: 'Check internet connection'
      });
    }

    this.results.push({ category: 'Performance', checks });
    spinner.succeed('Performance check complete');
  }

  private async checkSecurity() {
    const spinner = ora('Checking security...').start();
    const checks: any[] = [];

    // Check for exposed API keys in config
    const configPath = path.join(homedir(), '.canvas-cli', 'config.json');
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        const hasApiKeys = Object.values(config).some((v: any) => 
          typeof v === 'string' && (v.includes('sk-') || v.includes('key'))
        );
        
        checks.push({
          name: 'Config Security',
          status: hasApiKeys ? 'warning' : 'pass',
          message: hasApiKeys ? 'API keys in config' : 'Secure',
          details: hasApiKeys ? 'Consider using environment variables for API keys' : undefined
        });
      } catch (error) {
        checks.push({
          name: 'Config Security',
          status: 'info',
          message: 'Could not check',
          details: 'Unable to read configuration'
        });
      }
    }

    // File permissions
    if (platform() !== 'win32') {
      try {
        const { stdout } = await execAsync(`ls -la "${configPath}" 2>/dev/null`);
        const perms = stdout.split(' ')[0];
        const isSecure = !perms.includes('rw-rw-rw-');
        
        checks.push({
          name: 'File Permissions',
          status: isSecure ? 'pass' : 'warning',
          message: isSecure ? 'Secure' : 'Too permissive',
          details: !isSecure ? 'Config file has overly permissive permissions' : undefined
        });
      } catch (error) {
        // File doesn't exist or can't check
      }
    }

    this.results.push({ category: 'Security', checks });
    spinner.succeed('Security check complete');
  }

  private async attemptFixes() {
    console.log(chalk.yellow('\n🔧 Attempting automatic fixes...\n'));
    
    for (const result of this.results) {
      for (const check of result.checks) {
        if (check.status === 'fail' || check.status === 'warning') {
          await this.tryFix(check);
        }
      }
    }
  }

  private async tryFix(check: any) {
    const spinner = ora(`Fixing ${check.name}...`).start();
    
    try {
      switch (check.name) {
        case 'Ollama':
          if (check.message === 'Not installed') {
            spinner.info('Please install Ollama from https://ollama.ai');
          } else if (check.details?.includes('not running')) {
            await execAsync('ollama serve &');
            spinner.succeed('Started Ollama server');
          }
          break;
          
        case 'File Permissions':
          const configPath = path.join(homedir(), '.canvas-cli', 'config.json');
          await execAsync(`chmod 600 "${configPath}"`);
          spinner.succeed('Fixed file permissions');
          break;
          
        default:
          spinner.info(`Manual fix required for ${check.name}`);
      }
    } catch (error) {
      spinner.fail(`Could not fix ${check.name}`);
    }
  }

  private printReport(verbose: boolean = false) {
    console.log('\n' + chalk.cyan.bold('📋 Diagnostic Report'));
    console.log(chalk.gray('=' .repeat(50)));

    let totalChecks = 0;
    let passedChecks = 0;
    let warnings = 0;
    let failures = 0;

    for (const result of this.results) {
      console.log('\n' + chalk.yellow.bold(result.category));
      
      for (const check of result.checks) {
        totalChecks++;
        
        let icon = '';
        let color = chalk.white;
        
        switch (check.status) {
          case 'pass':
            icon = '✅';
            color = chalk.green;
            passedChecks++;
            break;
          case 'warning':
            icon = '⚠️ ';
            color = chalk.yellow;
            warnings++;
            break;
          case 'fail':
            icon = '❌';
            color = chalk.red;
            failures++;
            break;
          case 'info':
            icon = 'ℹ️ ';
            color = chalk.blue;
            break;
        }
        
        console.log(`  ${icon} ${chalk.gray(check.name)}: ${color(check.message)}`);
        
        if (verbose && check.details) {
          console.log(`     ${chalk.gray(check.details)}`);
        }
      }
    }

    // Summary
    console.log('\n' + chalk.gray('=' .repeat(50)));
    console.log(chalk.cyan.bold('Summary:'));
    console.log(`  Total checks: ${totalChecks}`);
    console.log(`  ${chalk.green('Passed')}: ${passedChecks}`);
    console.log(`  ${chalk.yellow('Warnings')}: ${warnings}`);
    console.log(`  ${chalk.red('Failed')}: ${failures}`);

    if (failures === 0) {
      console.log(chalk.green.bold('\n✅ System is healthy!'));
    } else {
      console.log(chalk.red.bold('\n❌ Issues detected. Run with --fix to attempt automatic fixes.'));
    }
  }
}

export function createDoctorCommand(): Command {
  const command = new Command('doctor')
    .description('Check system health and diagnose issues')
    .option('-v, --verbose', 'Show detailed information')
    .option('-f, --fix', 'Attempt to fix issues automatically')
    .action(async (options) => {
      const doctor = new DoctorCommand();
      await doctor.execute(options);
    });

  return command;
}