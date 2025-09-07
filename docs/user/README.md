# Canvas CLI User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Getting Started](#getting-started)
4. [Core Features](#core-features)
5. [Intelligent Agents](#intelligent-agents)
6. [Commands Reference](#commands-reference)
7. [Configuration](#configuration)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

## Introduction

Canvas CLI is a next-generation command-line interface that combines AI-powered agents with comprehensive development tools to streamline your software development workflow. From requirements analysis to code generation and testing, Canvas CLI provides an integrated environment for modern software development.

### Key Features
- 🤖 **13 Specialized AI Agents** - Expert agents for every phase of development
- 🛠️ **50+ Built-in Tools** - Complete toolkit for development tasks
- 🎨 **Customizable Themes** - Personalize your CLI experience
- 🔄 **Multi-Provider Support** - Works with OpenAI, Anthropic, Google, and Ollama
- 📊 **Real-time Collaboration** - Team features and shared sessions
- 🚀 **Automation Ready** - Scriptable and extensible

## Installation

### Prerequisites
- Node.js 18.0 or higher
- npm or yarn package manager
- Git (for version control features)

### Quick Install

```bash
# Using npm
npm install -g canvas-cli

# Using yarn
yarn global add canvas-cli

# Using Homebrew (macOS/Linux)
brew install canvas-cli
```

### Docker Installation

```bash
# Pull the official image
docker pull canvascli/canvas:latest

# Run with mounted workspace
docker run -it -v $(pwd):/workspace canvascli/canvas
```

### Building from Source

```bash
# Clone the repository
git clone https://github.com/canvas-cli/canvas.git
cd canvas

# Install dependencies
npm install

# Build the project
npm run build

# Link globally
npm link
```

## Getting Started

### First Run

When you run Canvas CLI for the first time, it will guide you through the initial setup:

```bash
canvas

# Welcome wizard will:
# 1. Create configuration directory
# 2. Set up API keys
# 3. Configure default model
# 4. Select theme
# 5. Initialize workspace
```

### Basic Usage

```bash
# Start interactive session
canvas

# Get help
canvas --help

# Check version
canvas --version

# Run specific command
canvas analyze "Build a task management app"
```

### Quick Examples

```bash
# Analyze requirements
canvas analyze "E-commerce platform with payment integration"

# Generate code
canvas generate "REST API for user management"

# Create tests
canvas test "UserService.ts"

# Start planning session
canvas plan "Migrate to microservices"
```

## Core Features

### 1. Interactive Mode

The default interactive mode provides a rich CLI experience:

```bash
canvas

# Features:
# - Syntax highlighting
# - Auto-completion
# - Command history
# - Multi-line input
# - Real-time feedback
```

### 2. Planning Mode

Plan complex projects with AI assistance:

```bash
canvas plan

# Or directly:
canvas plan "Build a SaaS application"

# Planning mode provides:
# - Requirements analysis
# - Architecture design
# - Sprint planning
# - Risk assessment
```

### 3. Development Mode

Execute development tasks efficiently:

```bash
canvas dev

# Development features:
# - Code generation
# - Refactoring
# - Bug fixes
# - Performance optimization
# - Documentation generation
```

### 4. Configuration Management

Interactive configuration system:

```bash
canvas config

# Opens menu for:
# - API key management
# - Model selection
# - Theme customization
# - Tool preferences
# - Agent settings
```

## Intelligent Agents

Canvas CLI includes 13 specialized agents, each expert in their domain:

### Business & Planning Agents

#### 1. Business Analyst Agent
Analyzes requirements and creates specifications:

```bash
canvas analyze requirements "Online learning platform"

# Outputs:
# - Functional requirements
# - Non-functional requirements
# - User stories
# - Acceptance criteria
# - Risk assessment
```

#### 2. Product Manager Agent
Creates product documentation and roadmaps:

```bash
canvas create prd "Mobile banking app"

# Outputs:
# - Product Requirements Document
# - Feature prioritization
# - Go-to-market strategy
# - Success metrics
```

#### 3. Scrum Master Agent
Manages agile processes:

```bash
canvas sprint create "Sprint 1" --duration 14

# Features:
# - Sprint planning
# - Story estimation
# - Burndown tracking
# - Retrospectives
```

### Technical Agents

#### 4. Solutions Architect Agent
Designs system architecture:

```bash
canvas design architecture "Microservices migration"

# Outputs:
# - System architecture
# - Technology selection
# - API specifications
# - Deployment strategy
```

#### 5. Developer Agent
Implements code solutions:

```bash
canvas implement "User authentication module"

# Features:
# - Code generation
# - Multiple languages
# - Framework support
# - Best practices
```

#### 6. QA Engineer Agent
Creates and executes test plans:

```bash
canvas test create-plan "Payment module"

# Features:
# - Test case generation
# - Automation scripts
# - Performance tests
# - Security tests
```

### Specialized Agents

#### 7. DevOps Engineer Agent
Manages deployment and infrastructure:

```bash
canvas deploy setup "production environment"

# Features:
# - CI/CD pipelines
# - Infrastructure as Code
# - Monitoring setup
# - Container orchestration
```

#### 8. Security Analyst Agent
Performs security assessments:

```bash
canvas security scan "./src"

# Features:
# - Vulnerability scanning
# - Security recommendations
# - Compliance checks
# - Threat modeling
```

#### 9. UX Designer Agent
Creates user experience designs:

```bash
canvas design ux "Customer dashboard"

# Features:
# - User flow design
# - Wireframe generation
# - Usability analysis
# - A/B test planning
```

#### 10. Data Analyst Agent
Analyzes data and metrics:

```bash
canvas analyze data "user-engagement.csv"

# Features:
# - Data visualization
# - Statistical analysis
# - Trend identification
# - Report generation
```

#### 11. Technical Writer Agent
Creates documentation:

```bash
canvas document "./src/api"

# Features:
# - API documentation
# - User guides
# - README generation
# - Tutorial creation
```

#### 12. Support Engineer Agent
Handles troubleshooting:

```bash
canvas troubleshoot "Application crash on startup"

# Features:
# - Error analysis
# - Solution suggestions
# - Debug strategies
# - Knowledge base search
```

#### 13. Project Manager Agent
Manages project lifecycle:

```bash
canvas project status

# Features:
# - Timeline tracking
# - Resource allocation
# - Risk management
# - Stakeholder reports
```

## Commands Reference

### Core Commands

| Command | Description | Example |
|---------|-------------|---------|
| `canvas` | Start interactive session | `canvas` |
| `canvas chat` | Chat with AI assistant | `canvas chat "How do I optimize this?"` |
| `canvas analyze` | Analyze requirements | `canvas analyze "E-commerce site"` |
| `canvas generate` | Generate code | `canvas generate "REST API"` |
| `canvas test` | Create/run tests | `canvas test "./src"` |
| `canvas config` | Open configuration | `canvas config` |
| `canvas plan` | Planning mode | `canvas plan` |
| `canvas dev` | Development mode | `canvas dev` |

### File Operations

```bash
# Read file with AI analysis
canvas read "package.json" --analyze

# Write file with AI assistance
canvas write "README.md" --template "project"

# Edit file with suggestions
canvas edit "config.js" --optimize
```

### Project Management

```bash
# Initialize project
canvas init

# Create project structure
canvas scaffold "express-app"

# Analyze project
canvas audit

# Generate reports
canvas report --format html
```

### Collaboration

```bash
# Start shared session
canvas share

# Join session
canvas join <session-id>

# Export conversation
canvas export --format markdown
```

## Configuration

### Configuration File

Canvas CLI uses a JSON configuration file located at `~/.canvas-cli/config.json`:

```json
{
  "defaultModel": "gpt-4",
  "theme": "aurora",
  "apiKeys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "google": "..."
  },
  "preferences": {
    "autoSave": true,
    "executionMode": true,
    "telemetry": false
  },
  "tools": {
    "enabled": ["fileSystem", "terminal", "git"],
    "disabled": []
  }
}
```

### Environment Variables

```bash
# API Keys
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GOOGLE_API_KEY="..."

# Ollama Configuration
export OLLAMA_BASE_URL="http://localhost:11434"

# Canvas Settings
export CANVAS_DEFAULT_MODEL="gpt-4"
export CANVAS_THEME="aurora"
export CANVAS_LOG_LEVEL="info"
```

### Model Configuration

Configure AI models for different tasks:

```bash
# Set default model
canvas config model --default gpt-4

# Configure model for specific agent
canvas config agent developer --model claude-3-opus

# Set model parameters
canvas config model gpt-4 --temperature 0.7 --max-tokens 4000
```

## Best Practices

### 1. Effective Prompting

```bash
# Be specific and provide context
✅ canvas analyze "E-commerce platform for handmade crafts with Stripe integration"
❌ canvas analyze "shopping site"

# Include constraints and requirements
✅ canvas generate "REST API using Express.js with JWT auth and rate limiting"
❌ canvas generate "API"
```

### 2. Project Organization

```bash
# Use Canvas for project initialization
canvas init --template full-stack

# Maintain consistent structure
canvas scaffold
├── src/
├── tests/
├── docs/
└── config/
```

### 3. Testing Strategy

```bash
# Generate comprehensive tests
canvas test generate --coverage 80

# Run tests regularly
canvas test run --watch

# Create test plans before implementation
canvas test plan "Feature: User Authentication"
```

### 4. Documentation

```bash
# Document as you code
canvas document --inline

# Generate API docs
canvas document api --format openapi

# Create user guides
canvas document guide --audience "end-users"
```

### 5. Security

```bash
# Regular security scans
canvas security scan --deep

# Review dependencies
canvas audit dependencies

# Check for secrets
canvas security secrets --fix
```

## Troubleshooting

### Common Issues

#### 1. API Key Issues
```bash
# Check API key configuration
canvas doctor --check-keys

# Reset API keys
canvas config reset-keys

# Test connection
canvas test-connection
```

#### 2. Model Errors
```bash
# Switch to different model
canvas config model --fallback gpt-3.5-turbo

# Use local model with Ollama
canvas config model --local llama2
```

#### 3. Performance Issues
```bash
# Clear cache
canvas cache clear

# Optimize configuration
canvas optimize

# Check system resources
canvas doctor --performance
```

#### 4. File Access Problems
```bash
# Check permissions
canvas doctor --check-permissions

# Reset workspace
canvas workspace reset

# Verify file paths
canvas validate paths
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Enable debug mode
canvas --debug

# Set log level
export CANVAS_LOG_LEVEL=debug

# View logs
canvas logs --tail 100
```

### Getting Help

```bash
# Built-in help
canvas help
canvas help <command>

# Interactive tutorial
canvas tutorial

# Check documentation
canvas docs

# Report issues
canvas feedback
```

## Advanced Features

### Custom Agents

Create custom agents for specific needs:

```javascript
// custom-agent.js
module.exports = {
  name: 'Custom Agent',
  description: 'Specialized agent for specific tasks',
  capabilities: ['analysis', 'generation'],
  execute: async (task, context) => {
    // Custom logic
  }
};
```

Register custom agent:
```bash
canvas agent register ./custom-agent.js
```

### Plugins

Extend Canvas CLI with plugins:

```bash
# Install plugin
canvas plugin install canvas-plugin-aws

# List plugins
canvas plugin list

# Configure plugin
canvas plugin config aws --region us-east-1
```

### Automation

Create automation scripts:

```bash
# Create automation
canvas automate create "daily-standup"

# Schedule automation
canvas automate schedule "daily-standup" --cron "0 9 * * *"

# Run automation
canvas automate run "daily-standup"
```

### Webhooks

Integrate with external services:

```bash
# Add webhook
canvas webhook add --url "https://api.example.com/canvas" --events "task.complete"

# List webhooks
canvas webhook list

# Test webhook
canvas webhook test <webhook-id>
```

## Tips & Tricks

### Productivity Shortcuts

```bash
# Quick planning
canvas p "New feature"  # Alias for plan

# Fast generation
canvas g "UserService"  # Alias for generate

# Rapid testing
canvas t              # Alias for test
```

### Command Chaining

```bash
# Analyze, generate, and test in sequence
canvas analyze "Auth system" && canvas generate && canvas test

# Plan sprint and create tasks
canvas sprint create "Sprint 1" && canvas task generate
```

### Templates

```bash
# Save custom templates
canvas template save "my-api" --from "./src/api"

# Use templates
canvas generate --template "my-api"

# Share templates
canvas template export "my-api" --share
```

## Support

### Resources
- 📚 [Full Documentation](https://docs.canvas-cli.com)
- 💬 [Discord Community](https://discord.gg/canvas-cli)
- 🐛 [Issue Tracker](https://github.com/canvas-cli/canvas/issues)
- 📧 [Email Support](mailto:support@canvas-cli.com)

### Contributing
We welcome contributions! See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### License
Canvas CLI is licensed under the MIT License. See [LICENSE](../../LICENSE.md) for details.

---

*Canvas CLI - Empowering developers with intelligent automation*