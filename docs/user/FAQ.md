# Canvas CLI v2.0 - Frequently Asked Questions (FAQ)

## Getting Started

### What is Canvas CLI?

Canvas CLI is a production-ready AI command-line interface that provides an intelligent assistant for software development tasks. It features multi-model support, advanced tool capabilities, and defaults to dev mode with full execution capabilities.

### What's the default mode?

Canvas CLI defaults to **dev mode** with execution capabilities enabled. This means the AI can immediately help you with coding tasks, run commands, and make changes to files. You don't need to switch modes to get started with productive work.

## Commands and Modes

### What is the difference between CLI commands and slash commands?

- **CLI Commands** (e.g., `canvas`, `canvas --model`, `canvas --help`):
  - Run directly from your shell (bash, PowerShell, etc.)
  - Used to start Canvas CLI or configure settings
  - Ideal for scripting and automation
  - Example: `canvas` starts the interactive session

- **Slash Commands** (e.g., `/help`, `/tools`, `/settings`):
  - Used within the interactive Canvas CLI session
  - Provide control over the AI assistant and session features
  - Example: `/tools` lists available AI tools

### How do execution modes work?

Canvas CLI operates in **dev mode by default**, which intelligently switches between planning and execution based on context:

- **Dev Mode (Default)**: Full capabilities with smart context awareness
  - Automatically executes when appropriate
  - Can read/write files, run commands, and use all tools
  - Intelligently determines when to plan vs. execute

- **Planning Mode**: Discussion and design without execution
  - Useful for architecture discussions
  - No file system changes

The AI will clearly indicate what actions it's taking.

### How do I provide multi-line input or paste code?

Canvas CLI offers multiple input methods:

1. **Text Box Mode**: Type `/textbox` or `/text` to open a full-screen editor
   - Perfect for pasting large code blocks
   - Supports multi-line input
   - Syntax highlighting for code

2. **Direct Input**: Just paste directly into the prompt
   - The CLI handles multi-line content automatically

3. **File References**: Use `@filename` to reference files
   - Example: "Review the code in @src/main.ts"

## File Access and Security

### How does the AI access my files?

Canvas CLI uses a permission-based approach for file access:

1. **Explicit Commands**: The AI can read/write files when you ask it to
   - "Read the config.json file"
   - "Update the README.md"

2. **@ Mentions**: Reference files with `@` symbol
   - Example: "@package.json needs updating"
   - The file content is included as context

3. **Project Awareness**: Canvas CLI understands your project structure
   - Can suggest files to read or modify
   - Always asks before making changes (unless in auto-execute mode)

**Security Note**: All processing happens locally. No file content is sent to external servers beyond your configured AI provider.

### Is it safe to use execution mode?

Yes, with these built-in safeguards:

1. **Transparency**: All actions are logged and visible
2. **Local Execution**: Commands run on your machine only
3. **Version Control**: Use git to track and revert changes
4. **Backup System**: Canvas CLI can backup files before modification

Best practices:
- Work in a git repository
- Review the AI's planned actions
- Start with non-critical projects while learning

## Features and Tools

### What tools are available?

Canvas CLI includes numerous built-in tools:

- **File Operations**: read, write, edit, search files
- **Code Tools**: syntax checking, formatting, refactoring
- **Git Integration**: commits, branches, history
- **Web Development**: create websites, APIs, components  
- **System Tools**: run shell commands, manage processes
- **AI Features**: multi-model support, context management

Type `/tools` in a session to see the complete list with descriptions.

### How do I switch AI models?

Several ways to change models:

1. **At startup**: `canvas --model gpt-4`
2. **In session**: Use the configuration commands
3. **Config file**: Edit `~/.canvas-cli/config.json`

Supported providers:
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- Google (Gemini)
- Ollama (local models)
- Groq (fast inference)

### What's the checkpoint system?

The checkpoint system saves your conversation state:

- **Auto-save**: Conversations are automatically saved
- **Manual saves**: Create named checkpoints for important states
- **Resume**: Return to any checkpoint to continue work
- **Branching**: Create different paths from a checkpoint

Commands:
- `/checkpoint save <name>` - Save current state
- `/checkpoint list` - Show all checkpoints
- `/checkpoint resume <name>` - Restore a checkpoint

## Advanced Features

### What are Canvas CLI agents?

Agents are specialized AI assistants for specific tasks:

- **Automation Agent**: Handles repetitive tasks
- **Git Workflow Agent**: Manages version control
- **Knowledge Agent**: Searches and organizes information
- **Resource Monitor**: Tracks system resources
- **Task Management Agent**: Organizes project tasks

The dev mode automatically coordinates these agents based on your needs.

### How does the workflow system work?

Canvas CLI can create and execute complex workflows:

1. **Create a workflow**: Describe your process
2. **AI generates steps**: Automatic task breakdown
3. **Execute**: Run the workflow with progress tracking
4. **Reuse**: Save workflows for repeated use

Example: "Create a workflow for setting up a new React project with TypeScript, ESLint, and testing"

### Can I extend Canvas CLI?

Yes, Canvas CLI is extensible:

1. **Custom Commands**: Add your own slash commands
2. **Tool Plugins**: Create new AI tools
3. **Workflow Templates**: Build reusable workflows
4. **Integration Scripts**: Connect to external services

## Troubleshooting

### The dev server won't start

1. Check dependencies: `npm install`
2. Verify TypeScript: `npx tsc --noEmit`
3. Clear node_modules: `rm -rf node_modules && npm install`
4. Check for port conflicts

### AI responses are slow

1. Check your internet connection
2. Verify API keys are valid
3. Consider using a faster model (e.g., GPT-3.5 instead of GPT-4)
4. Try a local model with Ollama

### File operations aren't working

1. Verify file permissions
2. Check the path is correct (use absolute paths if needed)
3. Ensure you're in the right directory
4. Look for error messages in the output

## Getting Help

- **In-session help**: Type `/help` for command list
- **Documentation**: Check the docs folder
- **Issues**: Report bugs on GitHub
- **Community**: Join discussions in the repository

## Best Practices

1. **Start Small**: Test on non-critical projects first
2. **Use Version Control**: Always work in a git repository
3. **Review Actions**: Check what the AI plans to do
4. **Create Checkpoints**: Save state before major changes
5. **Learn the Tools**: Explore `/tools` to understand capabilities
6. **Provide Context**: Give the AI clear, detailed instructions
7. **Iterate**: Refine your prompts based on results

---

*Canvas CLI v2.0 - Your intelligent development assistant*