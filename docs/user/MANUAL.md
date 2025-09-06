# Canvas CLI User Manual

Welcome to the official manual for Canvas CLI. This document provides a detailed reference for all commands and concepts.

---

## Core Concepts

### Interactive Chat Mode
This is the primary way to interact with Canvas CLI. Running `canvas` or `canvas chat` drops you into a rich, interactive terminal session where you can converse with the AI and use slash commands. It's designed for conversation, exploration, and complex, multi-step tasks.

### CLI Commands vs. Slash Commands
- **CLI Commands** (e.g., `canvas models`): Standard command-line commands run directly from your shell. They are ideal for scripting, automation, or performing a single, specific action.
- **Slash Commands** (e.g., `/plan`): Special commands used *inside* the interactive chat. They give you direct control over the AI and the application's advanced features during a conversation.

### Execution Mode vs. Planning Mode
This is a critical safety and control feature within the interactive chat.
- **Planning Mode (Default)**: In this mode, the AI is a conversational partner. It can generate ideas, write code, create plans, and draft documents, but it **cannot** make any changes to your system. It will not run tools that write files or execute shell commands.
- **Execution Mode**: Activated by typing `/execute`, this mode gives the AI permission to use its tools to perform actions. It can write files, run commands, analyze your code, and more. You will see clear indicators when the AI is performing an action.

--- 

## Main CLI Commands

These commands are run directly from your shell (e.g., `bash`, `PowerShell`).

### `canvas chat` (Default Command)
**Action**: Starts the interactive chat session or runs a single prompt.

- **Usage**:
  ```bash
  # Start interactive session
  canvas

  # Run a single prompt and exit
  canvas chat "What is the capital of France?"
  ```
- **Options**:
  - `-m, --model <model>`: Specifies a model to use for the session, overriding the default.

### `canvas models`
**Action**: Lists all AI models available on your connected Ollama server.

- **Usage**:
  ```bash
  canvas models
  ```
- **Details**: This command communicates with your Ollama instance to fetch and display a list of all downloaded models. It's useful for seeing which models you have at your disposal.

### `canvas config`
**Action**: Sets the global configuration for the CLI.

- **Usage**:
  ```bash
  canvas config --url http://localhost:11435 --model llama3.2
  ```
- **Options**:
  - `--url <url>`: Sets the URL for your Ollama server.
  - `--model <model>`: Sets the default model to use for all sessions.

### `canvas agent`
**Action**: Manages the powerful multi-agent orchestration system.

- **Usage**: `canvas agent <action> [target]`
- **Actions**:
  - `status`: Shows the current status of all agents and the task queue.
  - `workflow <name>`: Executes a named, pre-defined workflow (e.g., `development`).
  - `coordinate -g <goal>`: Provides a high-level goal for the agent system to autonomously plan and execute.
- **Example**:
  ```bash
  canvas agent coordinate -g "Build a complete CI/CD pipeline for my project."
  ```

### `canvas crawl`
**Action**: Crawls a website to create a local, searchable knowledge base for the AI.

- **Usage**: `canvas crawl <url>`
- **Details**: This powerful feature lets you "teach" the AI about a specific topic by feeding it documentation. The AI will then use this knowledge in its responses, providing more accurate and context-specific answers.
- **Example**:
  ```bash
  canvas crawl https://react.dev/ --depth 3
  ```

### `canvas search`
**Action**: Performs a semantic search through the local knowledge base.

- **Usage**: `canvas search <query>`
- **Details**: After crawling a site, use this command to find relevant information. It's a great way to find answers in documentation without leaving your terminal.

### `canvas update`
**Action**: Checks for new versions of the CLI and updates it if necessary.

- **Usage**: `canvas update`
- **Details**: This command will check the npm registry for the latest version of `canvas-cli` and, if a new version is available, it will automatically download and install it.

### `canvas install`
**Action**: Runs the initial setup and configuration for Canvas CLI.

- **Usage**: `canvas install`
- **Details**: This command will guide you through the initial setup process, including configuring the Ollama URL and setting a default model.

---

## Interactive Slash Commands

These commands are used *inside* the interactive chat session.

### Session & Control
- `/execute` (or `/exec`): Toggles between Planning and Execution modes.
- `/help`: Displays the detailed help screen with all available commands.
- `/clear` (or `/cls`): Clears the terminal screen.
- `/quit` (or `/exit`, `/q`): Exits the Canvas CLI application.
- `/copy`: Copies the last complete AI response to your system clipboard.

### AI & Model Management
- `/model list`: Shows all available Ollama models.
- `/model switch <name>`: Switches the AI model for the current session. (e.g., `/model switch codellama`)
- `/orchestrator auto <prompt>`: Sends the prompt to an orchestrator agent that automatically selects the best model for the job.
- `/orchestrator benchmark`: Runs a performance test on all your models to see which ones are fastest.

### Planning & Execution System
- `/plan create <name>`: Starts a new, named execution plan.
- `/plan add <type> <path>`: Adds a task to the current plan. Types can be `file` or `command`.
- `/plan execute`: Executes all steps in the current plan sequentially or in parallel.
- `/plan status`: Shows the current status and steps of the active plan.

### Sentient: AI-Powered Code Intelligence
- `/sentient analyze`: The AI performs a high-level analysis of your entire codebase, identifying languages, frameworks, and potential issues.
- `/sentient optimize`: Ask the AI to find and suggest specific code optimizations for performance or readability.
- `/sentient audit`: The AI performs a security and code quality audit, looking for vulnerabilities or bad practices.
- `/sentient ship`: Runs a pre-deployment checklist to ensure your project is ready to be shipped.

### File System Operations
- `/read <path>`: Reads the entire content of a file and injects it into the chat context.
- `/write <path>`: Instructs the AI to write content to a specified file. Requires Execution Mode.
- `/edit <path>`: Performs an AI-assisted "smart edit" on a file. Requires Execution Mode.
- `/glob <pattern>`: Finds all files matching a specific glob pattern (e.g., `src/**/*.js`) and shows them to the AI.

### Memory & Context
- `/memory add <text>`: Manually adds a piece of text to the AI's long-term memory.
- `/memory show`: Displays the current contents of the AI's long-term memory.
- `/memory search <query>`: Performs a semantic search on the AI's memory.
- `/chat save <tag>`: Saves the entire current conversation history under a memorable tag.
- `/chat resume <tag>`: Loads a previously saved conversation, restoring the full context.
- `/chat list`: Lists all saved conversations.

### UI & Settings
- `/settings`: Displays the current application settings (read-only).
- `/theme <name>`: Changes the visual theme of the UI in real-time. Use `/theme --list` to see available themes.
- `/stats`: Shows a detailed dashboard of statistics for the current session, including token usage and performance metrics.
- `/about`: Displays detailed information about the Canvas CLI version, system, and dependencies.
