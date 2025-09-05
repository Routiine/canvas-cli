# 🎨 Canvas CLI

> **Production-ready AI CLI with advanced features inspired by goose-cli**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/canvas-cli/canvas-cli)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Canvas CLI is an enterprise-grade AI command-line interface that combines the best features from leading AI tools with production-ready architecture. Built with TypeScript and featuring advanced tokenization, tool monitoring, context management, and workflow automation.

## ✨ Key Features

### 🧠 **Self-Aware AI Assistant**
- **Dynamic Tool Creation** - Creates new tools on-demand based on needs
- **Self-Improvement** - Analyzes requests and builds missing capabilities
- **Tool Introspection** - Understands its own capabilities and limitations
- **Natural Language Understanding** - Interprets commands without specific syntax

### 🚀 **Advanced AI Integration**
- **Multi-Provider Support** - Ollama, OpenAI, Anthropic, Google
- **Smart Context Management** - Automatic compression and optimization
- **HuggingFace Tokenization** - Accurate token counting with model-specific limits
- **Streaming Responses** - Real-time AI interactions
- **Dual Mode Operation** - Planning mode for design, Execution mode for implementation

### 🛡️ **Production-Ready Reliability**
- **Structured Error Handling** - Comprehensive recovery strategies
- **Tool Monitoring** - Prevents infinite loops and tracks usage
- **Global Model Management** - Centralized state with aliases and capabilities
- **Configuration Validation** - Schema-based settings with environment variables
- **HTML Filtering** - Ensures clean CLI output without HTML artifacts

### 🔧 **Developer Experience**
- **Recipe System** - Reusable workflow automation
- **TypeScript APIs** - Full type safety and IntelliSense support
- **Comprehensive Logging** - Detailed monitoring and debugging
- **Extensible Architecture** - Plugin-ready design
- **50+ Built-in Tools** - File ops, Git, Web, VSCode integration, and more

### 🎯 **Enterprise Features**
- **Multi-Model Support** - Switch between AI providers seamlessly
- **Context Limits** - Automatic handling of token limits (128k, 200k, 1M+)
- **Usage Analytics** - Track costs and performance metrics
- **Security** - Safe execution with monitoring and limits
- **Session Management** - Auto-save and export conversations

## 📦 Installation

```bash
# Install globally via npm
npm install -g canvas-cli

# Or install locally
npm install canvas-cli

# Verify installation
canvas --version
```

## 🚀 Quick Start

```bash
# Start chat mode (default command)
canvas

# Direct chat with prompt
canvas chat "Explain machine learning"

# Initialize a new project
canvas init webapp --name my-app

# Run a workflow recipe
canvas recipe test-suite

# List available tools
canvas tools list

# Export conversation
canvas export --format md --output session.md
```

## 📖 Core Commands

### 💬 Chat (Default Command)
```bash
canvas                      # Start interactive chat (default)
canvas chat [prompt]        # Chat with optional direct prompt
canvas chat -m MODEL        # Use specific model
```
Interactive chat with dual modes:
- **Planning Mode** (default): Design and plan without execution
- **Execution Mode** (`/execute`): Run tools and commands

**Chat Features:**
- Multi-line text box input
- File inclusion with `@filename`
- Shell commands with `!command`
- Conversation history tracking
- Auto-save sessions

### 🚀 Init - Project Initialization
```bash
canvas init [type]          # Initialize new project (webapp/api/cli/library)
canvas init api --name my-service
canvas init webapp --template react
```
Generate complete project structures with boilerplate code.

### 📋 Recipe - Workflow Automation
```bash
canvas recipe --list        # List available recipes
canvas recipe test-suite    # Run test workflow
canvas recipe deploy-app --variables '{"env": "prod"}'
```
**Built-in Recipes:**
- `test-suite` - Run complete test suite
- `deploy-app` - Deploy to production
- `code-review` - Automated code review
- `refactor` - Code refactoring
- `docs` - Generate documentation

### 🛠️ Tools - Manage AI Tools
```bash
canvas tools               # List all tools (default: list)
canvas tools list          # Show available tools with status
canvas tools enable tool   # Enable specific tool
canvas tools disable tool  # Disable specific tool
canvas tools create        # Guide for creating custom tools
```
Manage 50+ built-in tools including file operations, git, web, VSCode integration, and more.

### 📚 Context - Memory Management
```bash
canvas context             # Show current context (default: show)
canvas context show        # Display current context
canvas context clear       # Clear all context
canvas context save -f file.json   # Save context to file
canvas context load -f file.json   # Load context from file
```
Manage conversation context and persistent memory.

### 📄 Export - Session Export
```bash
canvas export              # Export to markdown (default)
canvas export --format json --output session.json
canvas export --format html --output report.html
```
Export conversations in multiple formats for documentation or sharing.

### 📊 Models - AI Model Management
```bash
canvas models              # List available models
```
View all AI models available on your configured provider.

### ⚙️ Config - Configuration
```bash
canvas config              # View configuration
canvas config --url URL    # Set Ollama server URL
canvas config --model MODEL # Set default model
```
Configure Canvas CLI settings and providers.

## 🎯 Recipe System

Recipes are reusable workflow templates that automate common AI tasks:

### Example Recipe (`docs/recipes/code-review.yaml`)
```yaml
version: "1.0.0"
title: "Code Review Assistant"
description: "Review code for best practices and improvements"
parameters:
  - key: "language"
    type: "select"
    options: ["JavaScript", "TypeScript", "Python", "Java"]
    required: true
  - key: "code"
    type: "string" 
    required: true
system_prompt: "You are an expert code reviewer."
prompt: |
  Review this {{ language }} code:
  
  ```{{ language }}
  {{ code }}
  ```
  
  Provide feedback on:
  1. Code quality and readability
  2. Potential bugs or issues  
  3. Performance improvements
  4. Best practices
```

### Using Recipes
```bash
# Run the code review recipe
canvas recipe run code-review \
  --language typescript \
  --code "$(cat src/app.ts)"
```

## ⚙️ Configuration

Canvas CLI supports flexible configuration through:

### Environment Variables
```bash
export CANVAS_CLI_DEFAULT_MODEL="llama3.2"
export CANVAS_CLI_DEFAULT_PROVIDER="ollama" 
export CANVAS_CLI_TEMPERATURE="0.7"
export CANVAS_CLI_CONTEXT_STRATEGY="smart_trim"
```

### Configuration File (`~/.canvas-cli/config.json`)
```json
{
  "defaultModel": "llama3.2",
  "defaultProvider": "ollama",
  "providers": {
    "ollama": {
      "enabled": true,
      "baseUrl": "http://localhost:11434",
      "timeout": 30000
    }
  },
  "context": {
    "compressionEnabled": true,
    "strategy": "smart_trim",
    "targetUtilization": 0.8
  }
}
```

## 🔌 Providers

### Ollama (Default)
```bash
# Ensure Ollama is running
ollama serve

# Configure Canvas CLI
canvas config --provider ollama --url http://localhost:11434
```

### OpenAI
```bash
export OPENAI_API_KEY="your-api-key"
canvas config --provider openai
```

### Anthropic Claude
```bash
export ANTHROPIC_API_KEY="your-api-key"
canvas config --provider anthropic
```

## 📊 Advanced Features

### Context Management
Canvas CLI automatically manages conversation context:
- **Smart Trimming** - Removes less important messages
- **Token Counting** - Accurate tracking with HuggingFace tokenizers
- **Compression** - Multiple strategies (drop_oldest, smart_trim, summarize)
- **Overflow Protection** - Prevents context limit exceeded errors

### Tool Monitoring
Built-in safety features prevent common issues:
- **Repetition Detection** - Blocks infinite tool loops
- **Usage Statistics** - Track tool performance and reliability
- **Cooldown Periods** - Temporary blocks for failing tools
- **Recovery Strategies** - Automatic error handling

### Model Management
Centralized model handling:
- **Alias Resolution** - Use friendly names for complex models
- **Capability Detection** - Automatic feature discovery
- **Usage Tracking** - Monitor costs and performance
- **Recommendations** - Suggest optimal models for tasks

## 🛠️ Development

### Building from Source
```bash
# Clone repository
git clone https://github.com/canvas-cli/canvas-cli.git
cd canvas-cli

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run development version
npm run dev
```

### Project Structure
```
canvas-cli/
├── src/                    # TypeScript source code
│   ├── tokenization/      # HuggingFace tokenizers
│   ├── monitoring/        # Tool monitoring & safety
│   ├── models/           # Model management
│   ├── providers/        # AI provider abstractions
│   ├── recipes/          # Workflow automation
│   ├── context/          # Context management
│   ├── errors/           # Structured error handling
│   └── config/           # Configuration management
├── dist/                  # Compiled JavaScript
├── docs/                  # Documentation
└── README.md             # This file
```

## 📚 Documentation

- **[API Documentation](docs/api.md)** - Complete API reference
- **[Recipe Guide](docs/recipes.md)** - Creating and using recipes
- **[Provider Setup](docs/providers.md)** - Configuring AI providers
- **[Configuration](docs/configuration.md)** - Settings and options
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run the build: `npm run build`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **goose-cli** - Inspiration for advanced tokenization and tool monitoring
- **Ollama** - Local AI model serving
- **HuggingFace** - Tokenizer implementations
- **The AI Community** - Continuous innovation and collaboration

---

**Canvas CLI** - Where AI meets production-ready tooling. Built for developers, by developers. 🎨✨