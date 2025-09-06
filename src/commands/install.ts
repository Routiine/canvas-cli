import { Command } from 'commander';
import inquirer from 'inquirer';
import { saveConfig } from '../config.js';
import { DoctorCommand } from './doctor.js';

export function createInstallCommand(): Command {
  const command = new Command('install')
    .description('Run the initial setup and configuration for Canvas CLI')
    .action(async () => {
      console.log('Welcome to Canvas CLI setup!');

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'ollamaUrl',
          message: 'Please enter the URL of your Ollama instance (e.g., http://localhost:11434):',
          validate: (input: string) => {
            if (input.startsWith('http://') || input.startsWith('https://')) {
              return true;
            }
            return 'Please enter a valid URL.';
          }
        },
        {
          type: 'input',
          name: 'defaultModel',
          message: 'Please enter the default model you want to use (e.g., llama3.2:latest):'
        }
      ]);

      saveConfig({ ollamaUrl: answers.ollamaUrl, defaultModel: answers.defaultModel });

      console.log('Configuration saved!');

      const doctor = new DoctorCommand();
      await doctor.execute({});
    });

  return command;
}