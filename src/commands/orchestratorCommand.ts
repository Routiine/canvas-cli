import chalk from 'chalk';
import inquirer from 'inquirer';
import { ModelOrchestrator, ContentAnalysis, ModelRecommendation } from '../orchestrator/modelOrchestrator.js';
import { showTextBox } from '../ui/textBox.js';
import { loadConfig, saveConfig } from '../config.js';
import axios from 'axios';

/**
 * Advanced Orchestrator Command for Canvas CLI
 * Intelligently selects and manages models based on content analysis
 */
export class OrchestratorCommand {
  private orchestrator: ModelOrchestrator;
  private config = loadConfig();

  constructor() {
    this.orchestrator = new ModelOrchestrator();
  }

  /**
   * Main orchestrator command handler
   */
  async execute(args: string[]): Promise<string> {
    if (args.length === 0) {
      return this.showMainMenu();
    }

    const subcommand = args[0].toLowerCase();

    switch (subcommand) {
      case 'analyze':
        return this.analyzeContent(args.slice(1));
      case 'recommend':
        return this.analyzeContent(args.slice(1));
      case 'auto':
        return this.autoSelectAndRun(args.slice(1));
      case 'models':
        return this.showAvailableModels();
      case 'compare':
        return this.compareModels(args.slice(1));
      case 'benchmark':
        return this.benchmarkModels();
      case 'switch':
        return this.switchModel(args.slice(1));
      case 'interactive':
        return this.showMainMenu();
      default:
        return this.showHelp();
    }
  }

  /**
   * Show main orchestrator menu
   */
  private async showMainMenu(): Promise<string> {
    console.log(chalk.cyan.bold('\n🎼 Canvas CLI Model Orchestrator'));
    console.log(chalk.gray('═'.repeat(50)));

    const choice = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          name: '🤖 Analyze content and recommend model',
          value: 'analyze',
          short: 'Analyze & Recommend'
        },
        {
          name: '🚀 Auto-select model and chat',
          value: 'auto',
          short: 'Auto Chat'
        },
        {
          name: '📊 Compare available models',
          value: 'compare',
          short: 'Compare Models'
        },
        {
          name: '⚡ Benchmark model performance',
          value: 'benchmark',
          short: 'Benchmark'
        },
        {
          name: '🔄 Switch default model',
          value: 'switch',
          short: 'Switch Model'
        },
        {
          name: '📋 Show available models',
          value: 'models',
          short: 'List Models'
        }
      ]
    });

    switch (choice.action) {
      case 'analyze':
        return this.interactiveAnalysis();
      case 'auto':
        return this.interactiveAutoRun();
      case 'compare':
        return this.interactiveCompare();
      case 'benchmark':
        return this.benchmarkModels();
      case 'switch':
        return this.interactiveSwitchModel();
      case 'models':
        return this.showAvailableModels();
      default:
        return this.showHelp();
    }
  }

  /**
   * Interactive content analysis
   */
  private async interactiveAnalysis(): Promise<string> {
    console.log(chalk.blue('\n📝 Content Analysis Mode'));
    
    const textBoxResult = await showTextBox({
      title: '🎼 Orchestrator - Content Analysis',
      placeholder: 'Enter the content you want to analyze for optimal model selection...'
    });

    if (!textBoxResult.content.trim()) {
      return chalk.yellow('❌ No content provided for analysis.');
    }

    const recommendation = await this.orchestrator.recommendModel(textBoxResult.content);
    return this.formatRecommendation(recommendation, textBoxResult.content);
  }

  /**
   * Interactive auto-run mode
   */
  private async interactiveAutoRun(): Promise<string> {
    console.log(chalk.green('\n🚀 Auto-Select and Chat Mode'));
    
    const textBoxResult = await showTextBox({
      title: '🎼 Orchestrator - Auto Chat',
      placeholder: 'Enter your message. I\'ll automatically select the best model and respond...'
    });

    if (!textBoxResult.content.trim()) {
      return chalk.yellow('❌ No content provided.');
    }

    return this.executeWithBestModel(textBoxResult.content);
  }

  /**
   * Analyze content and recommend model
   */
  private async analyzeContent(args: string[]): Promise<string> {
    let content = args.join(' ');
    
    if (!content) {
      const textBoxResult = await showTextBox({
        title: '🎼 Content Analysis',
        placeholder: 'Enter content to analyze...'
      });
      content = textBoxResult.content;
    }

    if (!content.trim()) {
      return chalk.yellow('❌ No content provided for analysis.');
    }

    const recommendation = await this.orchestrator.recommendModel(content);
    return this.formatRecommendation(recommendation, content);
  }

  /**
   * Auto-select model and execute
   */
  private async autoSelectAndRun(args: string[]): Promise<string> {
    let content = args.join(' ');
    
    if (!content) {
      return chalk.yellow('❌ Please provide content after "orchestrator auto"');
    }

    return this.executeWithBestModel(content);
  }

  /**
   * Execute with automatically selected best model
   */
  private async executeWithBestModel(content: string): Promise<string> {
    console.log(chalk.blue('🔍 Analyzing content...'));
    
    const recommendation = await this.orchestrator.recommendModel(content);
    const modelInfo = this.orchestrator.getModelInfo(recommendation.primary);
    
    console.log(chalk.green(`✅ Selected Model: ${recommendation.primary}`));
    console.log(chalk.gray(`   Confidence: ${Math.round(recommendation.confidence * 100)}%`));
    console.log(chalk.gray(`   Expected: ${recommendation.expectedPerformance.quality} quality, ${recommendation.expectedPerformance.speed} speed`));
    
    if (modelInfo) {
      console.log(chalk.gray(`   Optimal for: ${modelInfo.optimalFor.slice(0, 2).join(', ')}`));
    }
    
    console.log(chalk.dim(`\n💡 Reasoning: ${recommendation.reasoning}\n`));

    // Switch to recommended model temporarily
    const originalModel = this.config.defaultModel;
    
    try {
      // Generate response with recommended model
      console.log(chalk.cyan(`🎼 ${recommendation.primary} is thinking...`));
      
      const response = await this.generateResponse(content, recommendation.primary);
      
      console.log(chalk.green('\n📝 Response:'));
      console.log(chalk.white(response));
      
      // Show performance summary
      const performanceMsg = this.formatPerformanceSummary(recommendation.primary, modelInfo);
      
      return `${performanceMsg}\n\n${response}`;
      
    } catch (error) {
      console.error(chalk.red(`❌ Error with ${recommendation.primary}:`), error);
      
      // Fallback to alternatives
      if (recommendation.alternatives.length > 0) {
        console.log(chalk.yellow(`🔄 Trying fallback model: ${recommendation.alternatives[0]}`));
        try {
          const response = await this.generateResponse(content, recommendation.alternatives[0]);
          return `Fallback to ${recommendation.alternatives[0]}:\n\n${response}`;
        } catch (fallbackError) {
          return chalk.red(`❌ All recommended models failed. Please check your Ollama connection.`);
        }
      }
      
      return chalk.red(`❌ Error executing with recommended model: ${error}`);
    }
  }

  /**
   * Generate response with specified model
   */
  private async generateResponse(content: string, modelName: string): Promise<string> {
    const response = await axios.post(`${this.config.ollamaUrl}/api/generate`, {
      model: modelName,
      prompt: content,
      stream: false
    });

    return response.data.response || 'No response received';
  }

  /**
   * Show available models with capabilities
   */
  private async showAvailableModels(): Promise<string> {
    const availableModels = await this.orchestrator.getAvailableModels();
    
    let output = chalk.cyan.bold('\n🤖 Available Models & Capabilities\n');
    output += chalk.gray('═'.repeat(60)) + '\n';

    for (const modelName of availableModels) {
      const info = this.orchestrator.getModelInfo(modelName);
      const isDefault = modelName === this.config.defaultModel;
      
      output += chalk.blue.bold(`\n${modelName}${isDefault ? ' (default)' : ''}`);
      
      if (info) {
        output += chalk.gray(` - ${info.size} parameters\n`);
        output += chalk.gray(`   Speed: ${info.performance.speed}/10  `);
        output += chalk.gray(`Quality: ${info.performance.quality}/10  `);
        output += chalk.gray(`Coding: ${info.performance.coding}/10\n`);
        output += chalk.gray(`   Memory: ${info.resourceUsage.memory}\n`);
        output += chalk.green(`   Best for: ${info.optimalFor.slice(0, 3).join(', ')}\n`);
        output += chalk.yellow(`   Strengths: ${info.strengths.slice(0, 2).join(', ')}\n`);
      } else {
        output += chalk.gray(' - No detailed info available\n');
      }
    }

    output += chalk.blue('\n💡 Use "/orchestrator recommend" to find the best model for your task');
    
    return output;
  }

  /**
   * Compare models side by side
   */
  private async compareModels(args: string[]): Promise<string> {
    const availableModels = await this.orchestrator.getAvailableModels();
    let modelsToCompare = args.length > 0 ? args : [];

    if (modelsToCompare.length === 0) {
      // Interactive model selection
      const choices = await inquirer.prompt({
        type: 'checkbox',
        name: 'models',
        message: 'Select models to compare (use space to select):',
        choices: availableModels.map(model => ({
          name: model,
          value: model,
          checked: availableModels.slice(0, 3).includes(model) // Pre-select first 3
        })),
        validate: (answer) => {
          if (answer.length < 2) return 'Please select at least 2 models to compare';
          if (answer.length > 5) return 'Please select no more than 5 models to compare';
          return true;
        }
      });
      modelsToCompare = choices.models;
    }

    const { comparison, recommendation } = this.orchestrator.compareModels(modelsToCompare);

    let output = chalk.cyan.bold('\n📊 Model Comparison\n');
    output += chalk.gray('═'.repeat(80)) + '\n';

    // Header
    output += chalk.blue.bold('Model'.padEnd(20));
    output += chalk.blue.bold('Size'.padEnd(8));
    output += chalk.blue.bold('Speed'.padEnd(8));
    output += chalk.blue.bold('Quality'.padEnd(9));
    output += chalk.blue.bold('Coding'.padEnd(8));
    output += chalk.blue.bold('Memory'.padEnd(10)) + '\n';
    output += chalk.gray('─'.repeat(80)) + '\n';

    // Data rows
    for (const model of comparison) {
      output += chalk.white(model.name.padEnd(20));
      output += chalk.gray(model.size.padEnd(8));
      output += this.colorizeScore(model.speed, 8);
      output += this.colorizeScore(model.quality, 9);
      output += this.colorizeScore(model.coding, 8);
      output += chalk.gray(model.memory.padEnd(10)) + '\n';
    }

    output += chalk.gray('\n' + '─'.repeat(80));
    output += chalk.green.bold(`\n🏆 ${recommendation}`);
    output += chalk.blue('\n\n💡 Use "/orchestrator auto <your content>" for intelligent model selection');

    return output;
  }

  /**
   * Interactive model comparison
   */
  private async interactiveCompare(): Promise<string> {
    const availableModels = await this.orchestrator.getAvailableModels();
    
    const choices = await inquirer.prompt({
      type: 'checkbox',
      name: 'models',
      message: 'Select models to compare (use space to select):',
      choices: availableModels.map(model => ({
        name: model,
        value: model,
        checked: availableModels.slice(0, 3).includes(model)
      })),
      validate: (answer) => {
        if (answer.length < 2) return 'Please select at least 2 models to compare';
        if (answer.length > 5) return 'Please select no more than 5 models to compare';
        return true;
      }
    });

    return this.compareModels(choices.models);
  }

  /**
   * Benchmark models performance
   */
  private async benchmarkModels(): Promise<string> {
    console.log(chalk.blue('⚡ Starting Model Performance Benchmark...'));
    
    const availableModels = await this.orchestrator.getAvailableModels();
    const testPrompts = [
      'Hello, how are you?', // Simple greeting
      'Write a Python function to calculate fibonacci numbers', // Coding task
      'Explain quantum computing in simple terms' // Technical explanation
    ];

    let output = chalk.cyan.bold('\n⚡ Model Performance Benchmark\n');
    output += chalk.gray('═'.repeat(70)) + '\n';

    for (const modelName of availableModels.slice(0, 4)) { // Limit to 4 models
      output += chalk.blue.bold(`\n🤖 Testing ${modelName}...\n`);
      
      let totalTime = 0;
      let successCount = 0;

      for (let i = 0; i < testPrompts.length; i++) {
        const prompt = testPrompts[i];
        console.log(chalk.dim(`   Test ${i + 1}/3: ${prompt.slice(0, 50)}...`));
        
        try {
          const startTime = Date.now();
          await this.generateResponse(prompt, modelName);
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          
          totalTime += responseTime;
          successCount++;
          
          output += chalk.green(`   ✅ Test ${i + 1}: ${responseTime}ms\n`);
        } catch (error) {
          output += chalk.red(`   ❌ Test ${i + 1}: Failed\n`);
        }
      }

      const avgTime = successCount > 0 ? Math.round(totalTime / successCount) : 0;
      const successRate = Math.round((successCount / testPrompts.length) * 100);
      
      output += chalk.yellow(`   📊 Average: ${avgTime}ms, Success: ${successRate}%\n`);
    }

    output += chalk.green('\n✅ Benchmark completed!');
    output += chalk.blue('\n💡 Faster models are better for interactive use, while slower models may provide higher quality');
    
    return output;
  }

  /**
   * Switch default model
   */
  private async switchModel(args: string[]): Promise<string> {
    const availableModels = await this.orchestrator.getAvailableModels();
    let targetModel = args[0];

    if (!targetModel) {
      const choice = await inquirer.prompt({
        type: 'list',
        name: 'model',
        message: 'Select new default model:',
        choices: availableModels.map(model => ({
          name: model === this.config.defaultModel ? `${model} (current)` : model,
          value: model
        }))
      });
      targetModel = choice.model;
    }

    if (!availableModels.includes(targetModel)) {
      return chalk.red(`❌ Model "${targetModel}" is not available. Use "/orchestrator models" to see available models.`);
    }

    // Update config
    saveConfig({ defaultModel: targetModel });
    this.config = loadConfig();

    const modelInfo = this.orchestrator.getModelInfo(targetModel);
    let output = chalk.green(`✅ Default model switched to: ${targetModel}\n`);
    
    if (modelInfo) {
      output += chalk.gray(`   Performance: Speed ${modelInfo.performance.speed}/10, Quality ${modelInfo.performance.quality}/10\n`);
      output += chalk.gray(`   Best for: ${modelInfo.optimalFor.slice(0, 3).join(', ')}\n`);
      output += chalk.blue(`   Memory usage: ${modelInfo.resourceUsage.memory}`);
    }

    return output;
  }

  /**
   * Interactive model switching
   */
  private async interactiveSwitchModel(): Promise<string> {
    return this.switchModel([]);
  }

  /**
   * Show help information
   */
  private showHelp(): string {
    return chalk.cyan.bold('\n🎼 Canvas CLI Model Orchestrator Commands\n') +
           chalk.gray('═'.repeat(50)) + '\n' +
           chalk.blue('/orchestrator') + chalk.gray(' - Show main menu\n') +
           chalk.blue('/orchestrator analyze') + chalk.gray(' - Analyze content and recommend model\n') +
           chalk.blue('/orchestrator recommend <text>') + chalk.gray(' - Get model recommendation\n') +
           chalk.blue('/orchestrator auto <text>') + chalk.gray(' - Auto-select model and respond\n') +
           chalk.blue('/orchestrator models') + chalk.gray(' - Show available models\n') +
           chalk.blue('/orchestrator compare') + chalk.gray(' - Compare model capabilities\n') +
           chalk.blue('/orchestrator benchmark') + chalk.gray(' - Benchmark model performance\n') +
           chalk.blue('/orchestrator switch [model]') + chalk.gray(' - Switch default model\n') +
           chalk.blue('/orchestrator interactive') + chalk.gray(' - Interactive model selection\n') +
           chalk.yellow('\n💡 The orchestrator intelligently selects the best model based on your content type, complexity, and requirements.');
  }

  /**
   * Format model recommendation output
   */
  private formatRecommendation(recommendation: ModelRecommendation, content: string): string {
    const modelInfo = this.orchestrator.getModelInfo(recommendation.primary);
    const contentPreview = content.slice(0, 100) + (content.length > 100 ? '...' : '');

    let output = chalk.cyan.bold('\n🎯 Model Recommendation\n');
    output += chalk.gray('═'.repeat(50)) + '\n';
    
    output += chalk.blue('Content Preview: ') + chalk.gray(`"${contentPreview}"\n\n`);
    
    output += chalk.green.bold(`🏆 Recommended Model: ${recommendation.primary}\n`);
    output += chalk.gray(`   Confidence: ${Math.round(recommendation.confidence * 100)}%\n`);
    output += chalk.gray(`   Expected Performance: ${recommendation.expectedPerformance.quality} quality, ${recommendation.expectedPerformance.speed} speed\n`);
    
    if (modelInfo) {
      output += chalk.gray(`   Memory Usage: ${modelInfo.resourceUsage.memory}\n`);
      output += chalk.blue(`   Optimal For: ${modelInfo.optimalFor.slice(0, 3).join(', ')}\n`);
    }
    
    output += chalk.yellow(`\n💡 Reasoning: ${recommendation.reasoning}\n`);
    
    if (recommendation.alternatives.length > 0) {
      output += chalk.cyan(`\n🔄 Alternatives: ${recommendation.alternatives.slice(0, 2).join(', ')}\n`);
    }
    
    output += chalk.blue('\n🚀 Use "/orchestrator auto <your content>" to automatically use the recommended model');
    
    return output;
  }

  /**
   * Format performance summary
   */
  private formatPerformanceSummary(modelName: string, modelInfo: any): string {
    if (!modelInfo) return '';
    
    let summary = chalk.blue.bold(`\n📊 ${modelName} Performance:\n`);
    summary += chalk.gray(`   Quality: ${modelInfo.performance.quality}/10  `);
    summary += chalk.gray(`Speed: ${modelInfo.performance.speed}/10  `);
    summary += chalk.gray(`Coding: ${modelInfo.performance.coding}/10\n`);
    summary += chalk.gray(`   Memory: ${modelInfo.resourceUsage.memory}`);
    
    return summary;
  }

  /**
   * Colorize score based on value
   */
  private colorizeScore(score: string, width: number): string {
    const numScore = parseInt(score.split('/')[0]);
    const color = numScore >= 8 ? chalk.green : numScore >= 6 ? chalk.yellow : chalk.red;
    return color(score.padEnd(width));
  }
}