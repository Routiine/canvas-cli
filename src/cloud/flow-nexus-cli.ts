/**
 * Flow Nexus CLI Integration
 * Command-line interface for managing Flow Nexus cloud resources
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import type { 
  FlowNexusConfig} from './flow-nexus-platform';
import { 
  FlowNexusPlatform,
  Sandbox,
  SwarmDeployment,
  DataPipeline,
  FlowNexusHelpers
} from './flow-nexus-platform';

export class FlowNexusCLI {
  private platform?: FlowNexusPlatform;
  private program: Command;

  constructor() {
    this.program = new Command('flow-nexus')
      .version('1.0.0')
      .description('Flow Nexus Cloud Platform CLI');

    this.setupCommands();
  }

  private setupCommands(): void {
    // Authentication
    this.program
      .command('auth')
      .description('Authenticate with Flow Nexus')
      .option('-k, --api-key <key>', 'API key')
      .option('-s, --api-secret <secret>', 'API secret')
      .option('-r, --region <region>', 'Region', 'us-east')
      .option('-e, --environment <env>', 'Environment', 'production')
      .action(async (options) => {
        await this.authenticate(options);
      });

    // Sandbox commands
    const sandbox = this.program
      .command('sandbox')
      .description('Manage sandboxes');

    sandbox
      .command('create <name>')
      .description('Create a new sandbox')
      .option('-t, --type <type>', 'Sandbox type', 'standard')
      .option('-c, --cpu <cpu>', 'Number of vCPUs', parseInt, 2)
      .option('-m, --memory <memory>', 'Memory in GB', parseInt, 4)
      .option('-s, --storage <storage>', 'Storage in GB', parseInt, 20)
      .option('--gpu', 'Enable GPU')
      .option('--ttl <hours>', 'Time to live in hours', parseInt)
      .action(async (name, options) => {
        await this.createSandbox(name, options);
      });

    sandbox
      .command('list')
      .description('List all sandboxes')
      .option('-s, --status <status>', 'Filter by status')
      .action(async (options) => {
        await this.listSandboxes(options);
      });

    sandbox
      .command('start <id>')
      .description('Start a sandbox')
      .action(async (id) => {
        await this.startSandbox(id);
      });

    sandbox
      .command('stop <id>')
      .description('Stop a sandbox')
      .action(async (id) => {
        await this.stopSandbox(id);
      });

    sandbox
      .command('terminate <id>')
      .description('Terminate a sandbox')
      .option('-f, --force', 'Force termination')
      .action(async (id, options) => {
        await this.terminateSandbox(id, options);
      });

    sandbox
      .command('exec <id> <command>')
      .description('Execute command in sandbox')
      .option('-t, --timeout <ms>', 'Timeout in milliseconds', parseInt, 30000)
      .action(async (id, command, options) => {
        await this.executeInSandbox(id, command, options);
      });

    // Swarm deployment commands
    const deploy = this.program
      .command('deploy')
      .description('Manage swarm deployments');

    deploy
      .command('create <name>')
      .description('Deploy a new swarm')
      .option('-a, --agents <spec>', 'Agent specification (type:count)', (val: string, acc: { type: string; count: number }[]) => {
        acc = acc || [];
        const [type, count] = val.split(':');
        acc.push({ type, count: parseInt(count) || 1 });
        return acc;
      }, [] as { type: string; count: number }[])
      .option('-o, --orchestrator <type>', 'Orchestrator type', 'kubernetes')
      .option('--auto-scale', 'Enable auto-scaling')
      .option('--min-replicas <n>', 'Minimum replicas', parseInt, 1)
      .option('--max-replicas <n>', 'Maximum replicas', parseInt, 10)
      .action(async (name, options) => {
        await this.deploySwarm(name, options);
      });

    deploy
      .command('list')
      .description('List all deployments')
      .option('-s, --status <status>', 'Filter by status')
      .action(async (options) => {
        await this.listDeployments(options);
      });

    deploy
      .command('scale <id> <replicas>')
      .description('Scale a deployment')
      .action(async (id, replicas) => {
        await this.scaleDeployment(id, parseInt(replicas));
      });

    deploy
      .command('rollback <id>')
      .description('Rollback a deployment')
      .option('-v, --version <version>', 'Target version', parseInt)
      .action(async (id, options) => {
        await this.rollbackDeployment(id, options);
      });

    deploy
      .command('terminate <id>')
      .description('Terminate a deployment')
      .option('-f, --force', 'Force termination')
      .action(async (id, options) => {
        await this.terminateDeployment(id, options);
      });

    // Pipeline commands
    const pipeline = this.program
      .command('pipeline')
      .description('Manage data pipelines');

    pipeline
      .command('create')
      .description('Create a new pipeline (interactive)')
      .action(async () => {
        await this.createPipelineInteractive();
      });

    pipeline
      .command('list')
      .description('List all pipelines')
      .option('-s, --status <status>', 'Filter by status')
      .action(async (options) => {
        await this.listPipelines(options);
      });

    pipeline
      .command('start <id>')
      .description('Start a pipeline')
      .action(async (id) => {
        await this.startPipeline(id);
      });

    pipeline
      .command('pause <id>')
      .description('Pause a pipeline')
      .action(async (id) => {
        await this.pausePipeline(id);
      });

    // Monitoring commands
    const monitor = this.program
      .command('monitor')
      .description('Monitoring and metrics');

    monitor
      .command('system')
      .description('Show system metrics')
      .action(async () => {
        await this.showSystemMetrics();
      });

    monitor
      .command('deployment <id>')
      .description('Show deployment metrics')
      .option('-r, --resolution <res>', 'Time resolution', '5m')
      .action(async (id, options) => {
        await this.showDeploymentMetrics(id, options);
      });

    monitor
      .command('logs <deploymentId> <agentId>')
      .description('Show agent logs')
      .option('-n, --lines <n>', 'Number of lines', parseInt, 100)
      .option('-f, --follow', 'Follow log output')
      .option('-l, --level <level>', 'Log level filter')
      .action(async (deploymentId, agentId, options) => {
        await this.showAgentLogs(deploymentId, agentId, options);
      });

    // Cost management
    const cost = this.program
      .command('cost')
      .description('Cost management');

    cost
      .command('estimate')
      .description('Estimate costs (interactive)')
      .action(async () => {
        await this.estimateCostInteractive();
      });

    cost
      .command('billing')
      .description('Show billing information')
      .action(async () => {
        await this.showBillingInfo();
      });

    cost
      .command('alert <threshold>')
      .description('Set cost alert threshold')
      .option('-e, --email <email>', 'Email for alerts')
      .action(async (threshold, options) => {
        await this.setCostAlert(parseFloat(threshold), options);
      });

    // Security commands
    const security = this.program
      .command('security')
      .description('Security and compliance');

    security
      .command('scan <type> <id>')
      .description('Run security scan')
      .action(async (type, id) => {
        await this.runSecurityScan(type, id);
      });

    security
      .command('compliance <standard>')
      .description('Get compliance report')
      .action(async (standard) => {
        await this.getComplianceReport(standard);
      });
  }

  private async ensurePlatform(): Promise<FlowNexusPlatform> {
    if (!this.platform) {
      console.error(chalk.red('Not authenticated. Please run "flow-nexus auth" first.'));
      process.exit(1);
    }
    return this.platform;
  }

  private async authenticate(options: any): Promise<void> {
    const spinner = ora('Authenticating...').start();

    try {
      const config: FlowNexusConfig = {
        apiKey: options.apiKey || process.env.FLOW_NEXUS_API_KEY || '',
        apiSecret: options.apiSecret || process.env.FLOW_NEXUS_API_SECRET,
        region: options.region,
        environment: options.environment
      };

      if (!config.apiKey) {
        spinner.fail('API key required');
        return;
      }

      this.platform = new FlowNexusPlatform(config);
      
      // Test connection
      await this.platform.getSystemMetrics();
      
      spinner.succeed('Authentication successful');
      console.log(chalk.green(`Connected to Flow Nexus ${config.region} (${config.environment})`));
    } catch (error: any) {
      spinner.fail(`Authentication failed: ${error.message}`);
    }
  }

  private async createSandbox(name: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Creating sandbox...').start();

    try {
      const resources: any = {
        cpu: options.cpu,
        memory: options.memory,
        storage: options.storage
      };

      if (options.gpu) {
        resources.gpuEnabled = true;
        resources.gpuType = 'T4';
        resources.gpuCount = 1;
      }

      const sandbox = await platform.createSandbox({
        name,
        type: options.type,
        resources,
        ttl: options.ttl
      });

      spinner.succeed(`Sandbox created: ${sandbox.id}`);
      
      const table = new Table({
        head: ['Property', 'Value']
      });

      table.push(['ID', sandbox.id]);
      table.push(['Name', sandbox.name]);
      table.push(['Status', sandbox.status]);
      table.push(['Type', sandbox.type]);
      table.push(['CPU', `${sandbox.resources.cpu} vCPUs`]);
      table.push(['Memory', `${sandbox.resources.memory} GB`]);
      table.push(['Storage', `${sandbox.resources.storage} GB`]);
      table.push(['Created', sandbox.createdAt.toString()]);

      console.log(table.toString());
    } catch (error: any) {
      spinner.fail(`Failed to create sandbox: ${error.message}`);
    }
  }

  private async listSandboxes(options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Fetching sandboxes...').start();

    try {
      const sandboxes = await platform.listSandboxes({
        status: options.status
      });

      spinner.stop();

      if (sandboxes.length === 0) {
        console.log(chalk.yellow('No sandboxes found'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Name', 'Status', 'Type', 'Resources', 'Created']
      });

      sandboxes.forEach(sandbox => {
        table.push([
          sandbox.id.substring(0, 8),
          sandbox.name,
          this.formatStatus(sandbox.status),
          sandbox.type,
          `${sandbox.resources.cpu}C/${sandbox.resources.memory}G`,
          new Date(sandbox.createdAt).toLocaleString()
        ]);
      });

      console.log(table.toString());
    } catch (error: any) {
      spinner.fail(`Failed to list sandboxes: ${error.message}`);
    }
  }

  private async startSandbox(id: string): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Starting sandbox...').start();

    try {
      await platform.startSandbox(id);
      spinner.succeed('Sandbox started successfully');
    } catch (error: any) {
      spinner.fail(`Failed to start sandbox: ${error.message}`);
    }
  }

  private async stopSandbox(id: string): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Stopping sandbox...').start();

    try {
      await platform.stopSandbox(id);
      spinner.succeed('Sandbox stopped successfully');
    } catch (error: any) {
      spinner.fail(`Failed to stop sandbox: ${error.message}`);
    }
  }

  private async terminateSandbox(id: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();

    if (!options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to terminate this sandbox?',
        default: false
      }]);

      if (!confirm) return;
    }

    const spinner = ora('Terminating sandbox...').start();

    try {
      await platform.terminateSandbox(id);
      spinner.succeed('Sandbox terminated successfully');
    } catch (error: any) {
      spinner.fail(`Failed to terminate sandbox: ${error.message}`);
    }
  }

  private async executeInSandbox(id: string, command: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Executing command...').start();

    try {
      const result = await platform.executInSandbox(id, {
        type: 'shell',
        content: command,
        timeout: options.timeout
      });

      spinner.stop();

      console.log(chalk.bold('Exit Code:'), result.exitCode);
      console.log(chalk.bold('Duration:'), `${result.duration}ms`);
      
      if (result.stdout) {
        console.log(chalk.bold('\nStdout:'));
        console.log(result.stdout);
      }

      if (result.stderr) {
        console.log(chalk.bold('\nStderr:'));
        console.log(chalk.red(result.stderr));
      }
    } catch (error: any) {
      spinner.fail(`Command execution failed: ${error.message}`);
    }
  }

  private async deploySwarm(name: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Deploying swarm...').start();

    try {
      const swarmConfig: any = {
        orchestrator: options.orchestrator,
        replicas: options.agents.reduce((sum: number, a: any) => sum + a.count, 0)
      };

      if (options.autoScale) {
        swarmConfig.autoScaling = {
          enabled: true,
          minReplicas: options.minReplicas || 1,
          maxReplicas: options.maxReplicas || 10,
          targetCPU: 70
        };
      }

      const deployment = await platform.deploySwarm({
        name,
        agents: options.agents,
        orchestration: swarmConfig
      });

      spinner.succeed(`Swarm deployed: ${deployment.id}`);
      
      const table = new Table({
        head: ['Property', 'Value']
      });

      table.push(['ID', deployment.id]);
      table.push(['Name', deployment.name]);
      table.push(['Status', deployment.status]);
      table.push(['Orchestrator', deployment.swarmConfig.orchestrator]);
      table.push(['Replicas', String(deployment.swarmConfig.replicas)]);
      table.push(['Auto-scaling', swarmConfig.autoScaling ? 'Enabled' : 'Disabled']);
      table.push(['Created', deployment.createdAt.toString()]);

      console.log(table.toString());
    } catch (error: any) {
      spinner.fail(`Failed to deploy swarm: ${error.message}`);
    }
  }

  private async listDeployments(options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Fetching deployments...').start();

    try {
      const deployments = await platform.listDeployments({
        status: options.status
      });

      spinner.stop();

      if (deployments.length === 0) {
        console.log(chalk.yellow('No deployments found'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Name', 'Status', 'Agents', 'Success Rate', 'Created']
      });

      deployments.forEach(deployment => {
        table.push([
          deployment.id.substring(0, 8),
          deployment.name,
          this.formatStatus(deployment.status),
          `${deployment.agents.length}/${deployment.swarmConfig.replicas}`,
          `${deployment.metrics.successRate.toFixed(1)}%`,
          new Date(deployment.createdAt).toLocaleString()
        ]);
      });

      console.log(table.toString());
    } catch (error: any) {
      spinner.fail(`Failed to list deployments: ${error.message}`);
    }
  }

  private async scaleDeployment(id: string, replicas: number): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora(`Scaling deployment to ${replicas} replicas...`).start();

    try {
      await platform.scaleDeployment(id, replicas);
      spinner.succeed('Deployment scaled successfully');
    } catch (error: any) {
      spinner.fail(`Failed to scale deployment: ${error.message}`);
    }
  }

  private async rollbackDeployment(id: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Rolling back deployment...').start();

    try {
      await platform.rollbackDeployment(id, options.version);
      spinner.succeed('Deployment rolled back successfully');
    } catch (error: any) {
      spinner.fail(`Failed to rollback deployment: ${error.message}`);
    }
  }

  private async terminateDeployment(id: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();

    if (!options.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to terminate this deployment?',
        default: false
      }]);

      if (!confirm) return;
    }

    const spinner = ora('Terminating deployment...').start();

    try {
      await platform.terminateDeployment(id);
      spinner.succeed('Deployment terminated successfully');
    } catch (error: any) {
      spinner.fail(`Failed to terminate deployment: ${error.message}`);
    }
  }

  private async createPipelineInteractive(): Promise<void> {
    const platform = await this.ensurePlatform();

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Pipeline name:',
        validate: (input) => input.length > 0
      },
      {
        type: 'list',
        name: 'sourceType',
        message: 'Source type:',
        choices: ['stream', 'batch', 'database', 'api', 'file']
      },
      {
        type: 'list',
        name: 'destinationType',
        message: 'Destination type:',
        choices: ['storage', 'database', 'stream', 'webhook']
      },
      {
        type: 'input',
        name: 'schedule',
        message: 'Schedule (cron expression, optional):',
        default: ''
      }
    ]);

    const spinner = ora('Creating pipeline...').start();

    try {
      const pipeline = await platform.createPipeline({
        name: answers.name,
        source: {
          type: answers.sourceType,
          config: {}
        },
        destination: {
          type: answers.destinationType,
          config: {}
        },
        schedule: answers.schedule || undefined
      });

      spinner.succeed(`Pipeline created: ${pipeline.id}`);
    } catch (error: any) {
      spinner.fail(`Failed to create pipeline: ${error.message}`);
    }
  }

  private async listPipelines(options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Fetching pipelines...').start();

    try {
      const pipelines = await platform.listPipelines({
        status: options.status
      });

      spinner.stop();

      if (pipelines.length === 0) {
        console.log(chalk.yellow('No pipelines found'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Name', 'Status', 'Source', 'Destination', 'Processed']
      });

      pipelines.forEach(pipeline => {
        table.push([
          pipeline.id.substring(0, 8),
          pipeline.name,
          this.formatStatus(pipeline.status),
          pipeline.source.type,
          pipeline.destination.type,
          pipeline.metrics.recordsProcessed.toLocaleString()
        ]);
      });

      console.log(table.toString());
    } catch (error: any) {
      spinner.fail(`Failed to list pipelines: ${error.message}`);
    }
  }

  private async startPipeline(id: string): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Starting pipeline...').start();

    try {
      await platform.startPipeline(id);
      spinner.succeed('Pipeline started successfully');
    } catch (error: any) {
      spinner.fail(`Failed to start pipeline: ${error.message}`);
    }
  }

  private async pausePipeline(id: string): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Pausing pipeline...').start();

    try {
      await platform.pausePipeline(id);
      spinner.succeed('Pipeline paused successfully');
    } catch (error: any) {
      spinner.fail(`Failed to pause pipeline: ${error.message}`);
    }
  }

  private async showSystemMetrics(): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Fetching system metrics...').start();

    try {
      const metrics = await platform.getSystemMetrics();
      
      spinner.stop();

      console.log(chalk.bold('\n System Metrics'));
      console.log(chalk.bold('================\n'));

      console.log(chalk.cyan('Sandboxes:'));
      console.log(`  Total: ${metrics.sandboxes.total}`);
      console.log(`  Running: ${chalk.green(metrics.sandboxes.running)}`);
      console.log(`  Stopped: ${chalk.yellow(metrics.sandboxes.stopped)}`);

      console.log(chalk.cyan('\nDeployments:'));
      console.log(`  Total: ${metrics.deployments.total}`);
      console.log(`  Active: ${chalk.green(metrics.deployments.active)}`);
      console.log(`  Failed: ${chalk.red(metrics.deployments.failed)}`);

      console.log(chalk.cyan('\nResources:'));
      console.log(`  CPU Usage: ${this.formatPercentage(metrics.resources.cpuUsage)}`);
      console.log(`  Memory Usage: ${this.formatPercentage(metrics.resources.memoryUsage)}`);
      console.log(`  Storage Usage: ${this.formatPercentage(metrics.resources.storageUsage)}`);
      console.log(`  Network: ${(metrics.resources.networkBandwidth / 1024 / 1024).toFixed(2)} MB/s`);

      console.log(chalk.cyan('\nCosts:'));
      console.log(`  Current: $${metrics.costs.current.toFixed(2)}`);
      console.log(`  Projected: $${metrics.costs.projected.toFixed(2)}`);
    } catch (error: any) {
      spinner.fail(`Failed to fetch metrics: ${error.message}`);
    }
  }

  private async showDeploymentMetrics(id: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Fetching deployment metrics...').start();

    try {
      const metrics = await platform.getDeploymentMetrics(id, {
        resolution: options.resolution
      });

      spinner.stop();

      if (metrics.length === 0) {
        console.log(chalk.yellow('No metrics available'));
        return;
      }

      const latest = metrics[metrics.length - 1];

      console.log(chalk.bold(`\nDeployment Metrics (${id.substring(0, 8)})`));
      console.log(chalk.bold('=========================\n'));

      console.log(`Total Requests: ${latest.totalRequests.toLocaleString()}`);
      console.log(`Success Rate: ${this.formatPercentage(latest.successRate)}`);
      console.log(`Error Rate: ${this.formatPercentage(latest.errorRate)}`);
      console.log(`Average Latency: ${latest.averageLatency.toFixed(2)}ms`);
      console.log(`P95 Latency: ${latest.p95Latency.toFixed(2)}ms`);
      console.log(`P99 Latency: ${latest.p99Latency.toFixed(2)}ms`);
      console.log(`Active Agents: ${latest.activeAgents}`);
      console.log(`Queued Tasks: ${latest.queuedTasks}`);
    } catch (error: any) {
      spinner.fail(`Failed to fetch metrics: ${error.message}`);
    }
  }

  private async showAgentLogs(deploymentId: string, agentId: string, options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Fetching logs...').start();

    try {
      const logs = await platform.getAgentLogs(deploymentId, agentId, {
        lines: options.lines,
        level: options.level
      });

      spinner.stop();

      if (logs.length === 0) {
        console.log(chalk.yellow('No logs found'));
        return;
      }

      logs.forEach(log => console.log(log));

      if (options.follow) {
        // TODO: Implement real-time log following
        console.log(chalk.yellow('\nReal-time log following not yet implemented'));
      }
    } catch (error: any) {
      spinner.fail(`Failed to fetch logs: ${error.message}`);
    }
  }

  private async estimateCostInteractive(): Promise<void> {
    const platform = await this.ensurePlatform();

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'sandboxType',
        message: 'Sandbox type:',
        choices: ['basic', 'standard', 'premium', 'enterprise']
      },
      {
        type: 'number',
        name: 'cpu',
        message: 'Number of vCPUs:',
        default: 2
      },
      {
        type: 'number',
        name: 'memory',
        message: 'Memory (GB):',
        default: 4
      },
      {
        type: 'number',
        name: 'storage',
        message: 'Storage (GB):',
        default: 20
      },
      {
        type: 'confirm',
        name: 'gpu',
        message: 'Include GPU?',
        default: false
      },
      {
        type: 'number',
        name: 'duration',
        message: 'Duration (hours):',
        default: 24
      }
    ]);

    const spinner = ora('Calculating cost estimate...').start();

    try {
      const resources: any = {
        cpu: answers.cpu,
        memory: answers.memory,
        storage: answers.storage
      };

      if (answers.gpu) {
        resources.gpuEnabled = true;
        resources.gpuType = 'T4';
        resources.gpuCount = 1;
      }

      const estimate = await platform.getCostEstimate({
        sandboxType: answers.sandboxType,
        resources,
        duration: answers.duration
      });

      spinner.stop();

      console.log(chalk.bold('\nCost Estimate'));
      console.log(chalk.bold('=============\n'));

      console.log(`Total: ${chalk.green(`$${estimate.estimated.toFixed(2)}`)}`);
      console.log('\nBreakdown:');
      console.log(`  Compute: $${estimate.breakdown.compute.toFixed(2)}`);
      console.log(`  Storage: $${estimate.breakdown.storage.toFixed(2)}`);
      console.log(`  Network: $${estimate.breakdown.network.toFixed(2)}`);
      if (estimate.breakdown.agents > 0) {
        console.log(`  Agents: $${estimate.breakdown.agents.toFixed(2)}`);
      }
    } catch (error: any) {
      spinner.fail(`Failed to estimate cost: ${error.message}`);
    }
  }

  private async showBillingInfo(): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Fetching billing information...').start();

    try {
      const billing = await platform.getBillingInfo();
      
      spinner.stop();

      console.log(chalk.bold('\nBilling Information'));
      console.log(chalk.bold('==================\n'));

      const usage = (billing.currentUsage / billing.limit) * 100;
      console.log(`Current Usage: $${billing.currentUsage.toFixed(2)} / $${billing.limit.toFixed(2)} (${usage.toFixed(1)}%)`);
      console.log(`Billing Cycle: ${new Date(billing.billingCycle.start).toLocaleDateString()} - ${new Date(billing.billingCycle.end).toLocaleDateString()}`);
      console.log(`Payment Method: ${billing.paymentMethod}`);

      if (billing.invoices.length > 0) {
        console.log('\nRecent Invoices:');
        const table = new Table({
          head: ['ID', 'Amount', 'Date', 'Status']
        });

        billing.invoices.slice(0, 5).forEach(invoice => {
          table.push([
            invoice.id.substring(0, 8),
            `$${invoice.amount.toFixed(2)}`,
            new Date(invoice.date).toLocaleDateString(),
            this.formatInvoiceStatus(invoice.status)
          ]);
        });

        console.log(table.toString());
      }
    } catch (error: any) {
      spinner.fail(`Failed to fetch billing info: ${error.message}`);
    }
  }

  private async setCostAlert(threshold: number, options: any): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora(`Setting cost alert at $${threshold}...`).start();

    try {
      await platform.setCostAlert(threshold, options.email);
      spinner.succeed('Cost alert set successfully');
    } catch (error: any) {
      spinner.fail(`Failed to set cost alert: ${error.message}`);
    }
  }

  private async runSecurityScan(type: string, id: string): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora('Running security scan...').start();

    try {
      const scan = await platform.runSecurityScan(type as any, id);
      
      spinner.stop();

      console.log(chalk.bold('\nSecurity Scan Results'));
      console.log(chalk.bold('====================\n'));

      console.log(`Scan ID: ${scan.id}`);
      console.log(`Status: ${scan.status}`);

      if (scan.findings.length > 0) {
        console.log('\nFindings:');
        
        const grouped = scan.findings.reduce((acc: any, finding) => {
          acc[finding.severity] = acc[finding.severity] || [];
          acc[finding.severity].push(finding);
          return acc;
        }, {});

        ['critical', 'high', 'medium', 'low'].forEach(severity => {
          if (grouped[severity]) {
            const color = severity === 'critical' ? chalk.red :
                         severity === 'high' ? chalk.yellow :
                         severity === 'medium' ? chalk.blue :
                         chalk.gray;
            
            console.log(color(`\n${severity.toUpperCase()} (${grouped[severity].length}):`));
            grouped[severity].forEach((finding: any) => {
              console.log(`  - ${finding.type}: ${finding.description}`);
              if (finding.remediation) {
                console.log(`    Remediation: ${finding.remediation}`);
              }
            });
          }
        });
      } else {
        console.log(chalk.green('No security issues found'));
      }

      if (scan.complianceStatus.length > 0) {
        console.log('\nCompliance Status:');
        scan.complianceStatus.forEach((status: any) => {
          const icon = status.compliant ? chalk.green('✓') : chalk.red('✗');
          console.log(`  ${icon} ${status.standard}: ${status.compliant ? 'Compliant' : `${status.violations.length} violations`}`);
        });
      }
    } catch (error: any) {
      spinner.fail(`Security scan failed: ${error.message}`);
    }
  }

  private async getComplianceReport(standard: string): Promise<void> {
    const platform = await this.ensurePlatform();
    const spinner = ora(`Fetching ${standard} compliance report...`).start();

    try {
      const report = await platform.getComplianceReport(standard as any);
      
      spinner.stop();

      console.log(chalk.bold(`\n${report.standard} Compliance Report`));
      console.log(chalk.bold('========================\n'));

      const statusColor = report.status === 'compliant' ? chalk.green :
                         report.status === 'partial' ? chalk.yellow :
                         chalk.red;

      console.log(`Status: ${statusColor(report.status.toUpperCase())}`);
      console.log(`Last Audit: ${new Date(report.lastAudit).toLocaleDateString()}`);

      if (report.findings.length > 0) {
        console.log(`\nFindings: ${report.findings.length}`);
      }

      if (report.recommendations.length > 0) {
        console.log('\nRecommendations:');
        report.recommendations.forEach((rec, i) => {
          console.log(`  ${i + 1}. ${rec}`);
        });
      }
    } catch (error: any) {
      spinner.fail(`Failed to fetch compliance report: ${error.message}`);
    }
  }

  // Helper methods
  private formatStatus(status: string): string {
    const colors: Record<string, any> = {
      running: chalk.green,
      active: chalk.green,
      completed: chalk.green,
      pending: chalk.yellow,
      initializing: chalk.yellow,
      deploying: chalk.yellow,
      paused: chalk.yellow,
      stopped: chalk.gray,
      terminated: chalk.gray,
      failed: chalk.red,
      error: chalk.red
    };

    const color = colors[status] || chalk.white;
    return color(status.toUpperCase());
  }

  private formatPercentage(value: number): string {
    const color = value > 80 ? chalk.red :
                  value > 60 ? chalk.yellow :
                  chalk.green;
    return color(`${value.toFixed(1)}%`);
  }

  private formatInvoiceStatus(status: string): string {
    const colors: Record<string, any> = {
      paid: chalk.green,
      pending: chalk.yellow,
      overdue: chalk.red
    };

    const color = colors[status] || chalk.white;
    return color(status.toUpperCase());
  }

  public run(): void {
    this.program.parse(process.argv);
  }
}

// Export CLI runner
export function runFlowNexusCLI(): void {
  const cli = new FlowNexusCLI();
  cli.run();
}