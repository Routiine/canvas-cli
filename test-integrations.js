/**
 * Integration Test Script for Canvas CLI
 * Tests the availability of GitLab, Jira, and Slack integrations
 */

import { ToolRegistry } from './dist/tools/registry.js';
import chalk from 'chalk';

console.log(chalk.cyan('\n🧪 Canvas CLI Integration Test\n'));

// Initialize tool registry
const registry = new ToolRegistry();

// List of integration tools to check
const integrationTools = [
  'integration_auth',
  'gitlab_merge_request',
  'gitlab_pipeline',
  'gitlab_issue',
  'jira_issue',
  'jira_sprint',
  'jira_report',
  'slack_message',
  'slack_notification',
  'slack_channel'
];

console.log(chalk.yellow('Checking integration tools...\n'));

let foundCount = 0;
let missingCount = 0;

integrationTools.forEach(toolName => {
  const tool = registry.get(toolName);
  if (tool) {
    console.log(chalk.green(`✅ ${toolName}: Found`));
    console.log(chalk.gray(`   Description: ${tool.description}`));
    foundCount++;
  } else {
    console.log(chalk.red(`❌ ${toolName}: Not found`));
    missingCount++;
  }
});

console.log(chalk.cyan('\n📊 Summary:'));
console.log(chalk.green(`   Found: ${foundCount} tools`));
if (missingCount > 0) {
  console.log(chalk.red(`   Missing: ${missingCount} tools`));
} else {
  console.log(chalk.green('   All integration tools are properly registered!'));
}

// Test authentication parameters
console.log(chalk.cyan('\n🔐 Authentication Tool Details:'));
const authTool = registry.get('integration_auth');
if (authTool) {
  console.log(chalk.yellow('   Parameters:'));
  Object.entries(authTool.parameters || {}).forEach(([key, param]) => {
    console.log(chalk.gray(`     - ${key}: ${param.description || 'No description'}`));
  });
}

// List all available tools
console.log(chalk.cyan('\n📋 Total Available Tools:'));
const allTools = registry.list();
console.log(chalk.white(`   ${allTools.length} tools registered in total`));

// Show categories
const categories = {
  'File System': ['read_file', 'write_file', 'edit_file', 'list_directory'],
  'Git': ['git_status', 'git_commit', 'git_push', 'github_pr'],
  'Web': ['web_fetch', 'web_search', 'api_request'],
  'Integrations': integrationTools,
  'VSCode': ['vscode_workspace', 'vscode_settings', 'vscode_extensions']
};

console.log(chalk.cyan('\n📂 Tool Categories:'));
Object.entries(categories).forEach(([category, tools]) => {
  const availableInCategory = tools.filter(t => registry.get(t)).length;
  console.log(chalk.yellow(`   ${category}: ${availableInCategory}/${tools.length} tools`));
});

console.log(chalk.cyan('\n✨ Integration test complete!\n'));