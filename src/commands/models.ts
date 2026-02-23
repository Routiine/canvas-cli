/**
 * Models command - List available Ollama models
 */

import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { OllamaClient } from '../ollama/client.js';

export function createModelsCommand(): Command {
  const modelsCommand = new Command('models')
    .description('List available models on the Ollama server')
    .action(async () => {
      try {
        const config = loadConfig();
        const ollamaUrl = config.ollamaUrl || config.ollama?.baseUrl || 'http://localhost:11434';
        const client = new OllamaClient(ollamaUrl);

        const models = await client.listModels();

        if (models && models.length > 0) {
          console.log('Available models:');
          for (const model of models) {
            console.log(`- ${model.name}`);
          }
        } else {
          console.log('No models available.');
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot connect to Ollama')) {
          console.error(error.message);
        } else {
          console.error('Error fetching models:', error);
        }
      }
    });

  return modelsCommand;
}