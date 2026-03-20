/**
 * Recipe command for Canvas CLI
 * Manages recipe execution, creation, and marketplace operations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { RecipeManager } from '../recipes/recipe-manager.js';
import type { Recipe, RecipeParameter} from '../recipes/recipe-types.js';
import { RecipeParameterInputType, RecipeParameterRequirement } from '../recipes/recipe-types.js';

export function createRecipeCommand(): Command {
  const recipeCommand = new Command('recipe')
    .description('Manage and execute Canvas CLI recipes')
    .alias('r');

  // List recipes
  recipeCommand
    .command('list')
    .alias('ls')
    .description('List all available recipes')
    .option('-c, --category <category>', 'Filter by category (built-in, community, custom)')
    .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
    .action(async (options) => {
      const spinner = ora('Loading recipes...').start();
      
      try {
        const manager = new RecipeManager();
        await manager.loadLibraries();
        const recipes = await manager.listRecipes(options.category);
        
        spinner.succeed(`Found ${recipes.length} recipes`);
        
        if (recipes.length === 0) {
          console.log(chalk.yellow('No recipes found. Create one with: canvas recipe create'));
          return;
        }
        
        // Filter by tags if specified
        let filteredRecipes = recipes;
        if (options.tags) {
          const tags = options.tags.split(',').map((t: string) => t.trim().toLowerCase());
          filteredRecipes = recipes.filter((r: any) => 
            r.recipe.tags?.some((tag: string) => tags.includes(tag.toLowerCase()))
          );
        }
        
        // Group by category
        const grouped = filteredRecipes.reduce((acc: any, item: any) => {
          const category = item.path.includes('built-in') ? 'Built-in' :
                          item.path.includes('community') ? 'Community' : 'Custom';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        
        // Display recipes
        Object.entries(grouped).forEach(([category, items]: [string, any]) => {
          console.log(chalk.blue(`\n${category} Recipes:`));
          items.forEach((item: any) => {
            console.log(chalk.green(`  • ${item.name}`));
            console.log(chalk.gray(`    ${item.recipe.description}`));
            if (item.recipe.tags?.length > 0) {
              console.log(chalk.dim(`    Tags: ${item.recipe.tags.join(', ')}`));
            }
          });
        });
        
      } catch (error: any) {
        spinner.fail(`Failed to list recipes: ${error.message}`);
        process.exit(1);
      }
    });

  // Run a recipe
  recipeCommand
    .command('run <recipe-name>')
    .alias('exec')
    .description('Execute a recipe')
    .option('-p, --params <params>', 'JSON string of parameters')
    .option('-f, --params-file <file>', 'Path to parameters file (JSON or YAML)')
    .option('-i, --interactive', 'Interactive parameter input', true)
    .option('-d, --dry-run', 'Show what would be executed without running')
    .action(async (recipeName, options) => {
      const spinner = ora('Loading recipe...').start();
      
      try {
        const manager = new RecipeManager();
        await manager.loadLibraries();
        
        // Find the recipe
        const recipe = await manager.findRecipe(recipeName);
        if (!recipe) {
          spinner.fail(`Recipe '${recipeName}' not found`);
          console.log(chalk.yellow('Use "canvas recipe list" to see available recipes'));
          process.exit(1);
        }
        
        spinner.succeed(`Loaded recipe: ${recipe.title}`);
        console.log(chalk.gray(recipe.description));
        
        // Collect parameters
        let parameters: Record<string, string> = {};
        
        // Load from file if specified
        if (options.paramsFile) {
          const fileContent = await fs.readFile(options.paramsFile, 'utf-8');
          if (options.paramsFile.endsWith('.yaml') || options.paramsFile.endsWith('.yml')) {
            parameters = yaml.load(fileContent) as Record<string, string>;
          } else {
            parameters = JSON.parse(fileContent);
          }
        }
        
        // Parse JSON parameters if provided
        if (options.params) {
          const jsonParams = JSON.parse(options.params);
          parameters = { ...parameters, ...jsonParams };
        }
        
        // Interactive parameter collection
        if (options.interactive && recipe.parameters) {
          console.log(chalk.blue('\nRecipe Parameters:'));
          
          for (const param of recipe.parameters) {
            // Skip if already provided
            if (parameters[param.key]) continue;
            
            // Skip optional parameters that aren't required
            if (param.requirement === RecipeParameterRequirement.Optional && !options.interactive) {
              if (param.default) {
                parameters[param.key] = param.default;
              }
              continue;
            }
            
            const answer = await promptForParameter(param);
            if (answer !== undefined) {
              parameters[param.key] = answer;
            }
          }
        }
        
        // Validate parameters
        const validation = await manager.validateRecipe(recipe, Object.keys(parameters));
        if (!validation.valid) {
          console.log(chalk.red('\nValidation errors:'));
          validation.errors.forEach(err => console.log(chalk.red(`  • ${err}`)));
          process.exit(1);
        }
        
        if (validation.warnings.length > 0) {
          console.log(chalk.yellow('\nWarnings:'));
          validation.warnings.forEach(warn => console.log(chalk.yellow(`  • ${warn}`)));
        }
        
        // Dry run mode
        if (options.dryRun) {
          console.log(chalk.blue('\n=== DRY RUN MODE ==='));
          console.log(chalk.gray('\nRendered Prompt:'));
          const context = { ...parameters, recipe_dir: path.dirname(recipeName) };
          const renderedPrompt = await manager.renderTemplate(recipe.prompt || '', context);
          console.log(renderedPrompt);
          console.log(chalk.blue('\n=== END DRY RUN ==='));
          return;
        }
        
        // Execute the recipe
        console.log(chalk.green('\nExecuting recipe...'));
        const executionSpinner = ora('Running...').start();
        
        const result = await manager.executeRecipe(recipeName, parameters);
        
        if (result.success) {
          executionSpinner.succeed('Recipe executed successfully!');
          console.log(chalk.green('\nOutput:'));
          console.log(result.output);
          
          if (result.duration) {
            console.log(chalk.gray(`\nExecution time: ${(result.duration / 1000).toFixed(2)}s`));
          }
          if (result.tokensUsed) {
            console.log(chalk.gray(`Tokens used: ${result.tokensUsed}`));
          }
        } else {
          executionSpinner.fail('Recipe execution failed');
          console.log(chalk.red(`\nError: ${result.error}`));
          process.exit(1);
        }
        
      } catch (error: any) {
        spinner.fail(`Failed to run recipe: ${error.message}`);
        process.exit(1);
      }
    });

  // Create a new recipe
  recipeCommand
    .command('create [recipe-name]')
    .alias('new')
    .description('Create a new recipe interactively')
    .action(async (recipeName) => {
      console.log(chalk.blue('🍳 Canvas Recipe Builder\n'));
      
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Recipe name:',
          default: recipeName,
          validate: (input) => input.length > 0 || 'Recipe name is required'
        },
        {
          type: 'input',
          name: 'title',
          message: 'Recipe title:',
          validate: (input) => input.length > 0 || 'Title is required'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Recipe description:',
          validate: (input) => input.length > 0 || 'Description is required'
        },
        {
          type: 'input',
          name: 'author',
          message: 'Author name:',
          default: process.env.USER || 'Anonymous'
        },
        {
          type: 'input',
          name: 'tags',
          message: 'Tags (comma-separated):',
          filter: (input: string) => input.split(',').map((t: string) => t.trim()).filter(Boolean)
        },
        {
          type: 'confirm',
          name: 'addParameters',
          message: 'Add parameters to the recipe?',
          default: true
        }
      ]);
      
      const recipe: Recipe = {
        version: '1.0.0',
        title: answers.title,
        description: answers.description,
        author: answers.author,
        tags: answers.tags,
        parameters: [],
        prompt: '',
        system_prompt: '',
        tools: ['shell', 'file'],
        model_preferences: {
          preferred_models: ['claude-3-opus', 'gpt-4'],
          min_context_length: 8192,
          requires_tools: true
        },
        execution: {
          max_iterations: 10,
          timeout: 300,
          parallel: false
        }
      };
      
      // Add parameters interactively
      if (answers.addParameters) {
        let addMore = true;
        while (addMore) {
          console.log(chalk.gray('\nDefine a parameter:'));
          const paramAnswers = await inquirer.prompt([
            {
              type: 'input',
              name: 'key',
              message: 'Parameter key:',
              validate: (input) => /^[a-z_][a-z0-9_]*$/i.test(input) || 'Invalid parameter key'
            },
            {
              type: 'list',
              name: 'input_type',
              message: 'Input type:',
              choices: Object.values(RecipeParameterInputType)
            },
            {
              type: 'list',
              name: 'requirement',
              message: 'Requirement:',
              choices: Object.values(RecipeParameterRequirement)
            },
            {
              type: 'input',
              name: 'description',
              message: 'Description:'
            },
            {
              type: 'input',
              name: 'default',
              message: 'Default value (optional):'
            },
            {
              type: 'confirm',
              name: 'addMore',
              message: 'Add another parameter?',
              default: false
            }
          ]);
          
          const param: RecipeParameter = {
            key: paramAnswers.key,
            input_type: paramAnswers.input_type,
            requirement: paramAnswers.requirement,
            description: paramAnswers.description
          };
          
          if (paramAnswers.default) {
            param.default = paramAnswers.default;
          }
          
          recipe.parameters!.push(param);
          addMore = paramAnswers.addMore;
        }
      }
      
      // Add prompt template
      const promptAnswer = await inquirer.prompt([
        {
          type: 'editor',
          name: 'prompt',
          message: 'Enter the prompt template (use {{ parameter_key }} for variables):'
        },
        {
          type: 'editor',
          name: 'system_prompt',
          message: 'Enter the system prompt (optional):'
        }
      ]);
      
      recipe.prompt = promptAnswer.prompt;
      if (promptAnswer.system_prompt) {
        recipe.system_prompt = promptAnswer.system_prompt;
      }
      
      // Save location
      const saveAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'location',
          message: 'Where to save the recipe?',
          choices: [
            { name: 'Custom recipes folder', value: 'custom' },
            { name: 'Current directory', value: 'current' },
            { name: 'Specify path', value: 'specify' }
          ]
        }
      ]);
      
      let savePath: string;
      if (saveAnswer.location === 'custom') {
        savePath = path.join(process.cwd(), 'recipes', 'custom', `${answers.name}.yaml`);
      } else if (saveAnswer.location === 'current') {
        savePath = path.join(process.cwd(), `${answers.name}.yaml`);
      } else {
        const pathAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'path',
            message: 'Enter save path:',
            default: `${answers.name}.yaml`
          }
        ]);
        savePath = pathAnswer.path;
      }
      
      // Save the recipe
      await fs.ensureDir(path.dirname(savePath));
      await fs.writeFile(savePath, yaml.dump(recipe, { lineWidth: 120 }));
      
      console.log(chalk.green(`\n✅ Recipe created successfully!`));
      console.log(chalk.gray(`Saved to: ${savePath}`));
      console.log(chalk.blue(`\nRun with: canvas recipe run ${answers.name}`));
    });

  // Browse marketplace
  recipeCommand
    .command('browse')
    .alias('search')
    .description('Browse the recipe marketplace (GitHub topic: canvas-cli-recipe)')
    .option('-q, --query <query>', 'Search query')
    .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
    .action(async (options) => {
      const spinner = ora('Searching GitHub for recipes...').start();
      try {
        const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];
        const query = [
          'topic:canvas-cli-recipe',
          options.query || '',
          ...tags.map((t: string) => `topic:${t}`)
        ].filter(Boolean).join('+');

        const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=20`;
        const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'canvas-cli' };
        const token = process.env.GITHUB_TOKEN;
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const resp = await fetch(apiUrl, { headers });
        if (!resp.ok) throw new Error(`GitHub API ${resp.status}: ${resp.statusText}`);
        const data = await resp.json() as any;

        spinner.stop();
        console.log(chalk.blue(`\n🛒 Recipe Marketplace — ${data.total_count} recipes found\n`));

        if (data.items.length === 0) {
          console.log(chalk.dim('  No recipes found. Try a different query.'));
          return;
        }

        for (const repo of data.items) {
          console.log(`  ${chalk.bold(repo.full_name)} ${chalk.dim(`★ ${repo.stargazers_count}`)}`);
          if (repo.description) console.log(`    ${chalk.dim(repo.description)}`);
          console.log(`    ${chalk.cyan(`canvas recipe install ${repo.full_name}`)}\n`);
        }
      } catch (err: any) {
        spinner.fail(`Search failed: ${err.message}`);
      }
    });

  // Install from marketplace (GitHub repo)
  recipeCommand
    .command('install <recipe-name>')
    .alias('i')
    .description('Install a recipe from GitHub (owner/repo or short name)')
    .action(async (recipeName) => {
      const spinner = ora(`Installing recipe: ${recipeName}...`).start();
      try {
        const recipeManager = new RecipeManager();
        await recipeManager.loadLibraries();

        // Resolve short name → owner/repo via GitHub search
        let repoFullName = recipeName;
        if (!recipeName.includes('/')) {
          const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent('topic:canvas-cli-recipe ' + recipeName)}&per_page=1`;
          const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'canvas-cli' };
          const token = process.env.GITHUB_TOKEN;
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const resp = await fetch(apiUrl, { headers });
          const data = await resp.json() as any;
          if (!data.items || data.items.length === 0) throw new Error(`Recipe "${recipeName}" not found on GitHub`);
          repoFullName = data.items[0].full_name;
        }

        // Download raw recipe YAML from GitHub
        const tryUrls = [
          `https://raw.githubusercontent.com/${repoFullName}/main/recipe.yaml`,
          `https://raw.githubusercontent.com/${repoFullName}/main/recipe.yml`,
          `https://raw.githubusercontent.com/${repoFullName}/master/recipe.yaml`,
          `https://raw.githubusercontent.com/${repoFullName}/master/recipe.yml`
        ];

        let recipeContent: string | null = null;
        for (const url of tryUrls) {
          const r = await fetch(url, { headers: { 'User-Agent': 'canvas-cli' } });
          if (r.ok) { recipeContent = await r.text(); break; }
        }
        if (!recipeContent) throw new Error(`No recipe.yaml found in ${repoFullName}`);

        const recipe = yaml.load(recipeContent) as any;
        const recipeName2 = recipe.name || repoFullName.split('/').pop() || recipeName;
        await recipeManager.saveRecipe(recipeName2, recipe, 'user', 'yaml');

        spinner.succeed(`Recipe installed: ${repoFullName}`);
        console.log(chalk.dim(`  Run with: canvas recipe run ${recipeName.split('/').pop()}`));
      } catch (err: any) {
        spinner.fail(`Install failed: ${err.message}`);
      }
    });

  // Publish to marketplace (guides user through GitHub topic setup)
  recipeCommand
    .command('publish <recipe-name>')
    .description('Publish a recipe to the marketplace via GitHub')
    .action(async (recipeName) => {
      const recipeManager = new RecipeManager();
      await recipeManager.loadLibraries();
      const recipe = await recipeManager.loadRecipe(recipeName);

      if (!recipe) {
        console.log(chalk.red(`Recipe "${recipeName}" not found. Create it first with: canvas recipe create ${recipeName}`));
        return;
      }

      console.log(chalk.blue(`\n📦 Publishing "${recipeName}" to marketplace\n`));
      console.log(chalk.bold('Steps to publish:'));
      console.log(`  1. Create a GitHub repo (e.g. github.com/you/${recipeName}-recipe)`);
      console.log(`  2. Add ${chalk.cyan('recipe.yaml')} with your recipe content`);
      console.log(`  3. Add topic ${chalk.cyan('canvas-cli-recipe')} to the repo settings`);
      console.log(`  4. Your recipe will appear in ${chalk.cyan('canvas recipe browse')}\n`);
      console.log(chalk.dim('Exporting recipe.yaml to current directory...'));

      const exportPath = path.join(process.cwd(), 'recipe.yaml');
      await fs.writeFile(exportPath, yaml.dump(recipe));
      console.log(chalk.green(`  ✓ Written to ${exportPath}`));
    });

  return recipeCommand;
}

/**
 * Recipe command wrapper for slash command usage
 */
class RecipeCommandWrapper {
  async execute(args: string): Promise<string> {
    const parts = args.trim().split(/\s+/);
    const subCommand = parts[0] || 'list';
    const recipeName = parts[1];
    const params = parts.slice(2).join(' ');

    const manager = new RecipeManager();
    await manager.loadLibraries();

    switch (subCommand) {
      case 'list':
      case 'ls':
        const recipes = await manager.listRecipes();
        if (recipes.length === 0) {
          return chalk.yellow('No recipes found. Create one with: /recipe create');
        }
        let output = chalk.blue('Available Recipes:\n\n');
        const grouped = recipes.reduce((acc: any, item: any) => {
          const category = item.path.includes('built-in') ? 'Built-in' :
                          item.path.includes('community') ? 'Community' : 'Custom';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        Object.entries(grouped).forEach(([category, items]: [string, any]) => {
          output += chalk.cyan(`${category}:\n`);
          items.forEach((item: any) => {
            output += chalk.green(`  • ${item.name}\n`);
            output += chalk.gray(`    ${item.recipe.description}\n`);
          });
        });
        return output;

      case 'run':
      case 'exec':
        if (!recipeName) {
          return chalk.red('Usage: /recipe run <recipe-name> [params]');
        }
        try {
          const parameters: Record<string, string> = {};
          if (params) {
            const pairs = params.match(/(\w+)=([^\s]+)/g);
            if (pairs) {
              pairs.forEach(pair => {
                const [key, value] = pair.split('=');
                parameters[key] = value;
              });
            }
          }
          const result = await manager.executeRecipe(recipeName, parameters);
          if (result.success) {
            return chalk.green(`Recipe executed!\n\n${result.output}`);
          } else {
            return chalk.red(`Recipe failed: ${result.error}`);
          }
        } catch (error: any) {
          return chalk.red(`Failed to run recipe: ${error.message}`);
        }

      case 'help':
      case '?':
        return chalk.blue('Recipe Commands:\n\n') +
          chalk.cyan('  /recipe list') + chalk.gray('     - List available recipes\n') +
          chalk.cyan('  /recipe run') + chalk.gray('      - Execute a recipe\n') +
          chalk.cyan('  /recipe create') + chalk.gray('   - Create a new recipe\n') +
          chalk.cyan('  /recipe help') + chalk.gray('     - Show this help\n\n') +
          chalk.gray('Example: /recipe run quick-start project_name=my-app');

      default:
        return chalk.red(`Unknown recipe command: ${subCommand}\n` +
          'Use /recipe help for available commands');
    }
  }
}

// Lazy singleton getter (avoids instantiation at import time)
let _recipeCommand: RecipeCommandWrapper | null = null;
export function getRecipeCommand(): RecipeCommandWrapper {
  if (!_recipeCommand) _recipeCommand = new RecipeCommandWrapper();
  return _recipeCommand;
}

/**
 * Prompt for a parameter value
 */
async function promptForParameter(param: RecipeParameter): Promise<string | undefined> {
  const baseConfig: any = {
    name: 'value',
    message: `${param.description}${param.default ? ` (default: ${param.default})` : ''}:`,
    default: param.default
  };
  
  switch (param.input_type) {
    case RecipeParameterInputType.Boolean:
      baseConfig.type = 'confirm';
      baseConfig.default = param.default === 'true';
      break;
      
    case RecipeParameterInputType.Number:
      baseConfig.type = 'number';
      if (param.validation?.min !== undefined) {
        baseConfig.validate = (input: number) => 
          input >= param.validation!.min! || `Must be >= ${param.validation!.min}`;
      }
      break;
      
    case RecipeParameterInputType.Select:
      baseConfig.type = 'list';
      baseConfig.choices = param.options || [];
      break;
      
    case RecipeParameterInputType.MultiSelect:
      baseConfig.type = 'checkbox';
      baseConfig.choices = param.options || [];
      break;
      
    case RecipeParameterInputType.File:
    case RecipeParameterInputType.Directory:
      baseConfig.type = 'input';
      baseConfig.validate = async (input: string) => {
        if (!input && param.requirement === RecipeParameterRequirement.Optional) return true;
        const exists = await fs.pathExists(input);
        return exists || `Path does not exist: ${input}`;
      };
      break;
      
    default:
      baseConfig.type = 'input';
      if (param.validation?.pattern) {
        const regex = new RegExp(param.validation.pattern);
        baseConfig.validate = (input: string) => 
          regex.test(input) || 'Invalid format';
      }
  }
  
  if (param.requirement === RecipeParameterRequirement.Optional) {
    baseConfig.default = baseConfig.default || '';
  }
  
  const answer = await inquirer.prompt([baseConfig]);
  
  if (param.input_type === RecipeParameterInputType.MultiSelect) {
    return answer.value.join(',');
  }
  
  return answer.value?.toString();
}