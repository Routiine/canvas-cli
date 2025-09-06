import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';

const execAsync = promisify(exec);

export function createUpdateCommand(): Command {
  const command = new Command('update')
    .description('Check for updates and update the CLI')
    .action(async () => {
      const spinner = ora('Checking for updates...').start();
      try {
        const { stdout: localVersion } = await execAsync('canvas --version');
        const { stdout: remoteVersion } = await execAsync('npm view canvas-cli version');

        spinner.stop();

        if (localVersion.trim() === remoteVersion.trim()) {
          console.log(chalk.green('You are already using the latest version of Canvas CLI.'));
        } else {
          console.log(chalk.yellow(`A new version (${remoteVersion.trim()}) is available.`));
          const updateSpinner = ora('Updating Canvas CLI...').start();
          try {
            await execAsync('npm install -g canvas-cli@latest');
            updateSpinner.succeed('Canvas CLI has been updated successfully!');
          } catch (error) {
            updateSpinner.fail('Failed to update Canvas CLI.');
            console.error(error);
          }
        }
      } catch (error) {
        spinner.fail('Failed to check for updates.');
        console.error(error);
      }
    });

  return command;
}