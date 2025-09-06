# Architecture Overview

Canvas CLI is a sophisticated, multi-faceted AI assistant built with TypeScript and Node.js. Its architecture is designed for modularity, extensibility, and high performance, allowing for complex interactions and powerful AI capabilities to run entirely on a local machine.

---

## Core Components

### `src/index.ts` - The Entry Point
This is the main entry point for the CLI application. Its primary responsibilities are:
- **CLI Command Parsing**: It uses the `commander` library to define, parse, and manage the top-level CLI commands (e.g., `canvas chat`, `canvas agent`, `canvas crawl`).
- **Initialization**: It initializes global services, loads the main configuration, and kicks off the requested command. For the default `chat` command, it hands control over to the `Interactive Mode` manager.

### `src/interactiveMode.ts` - The Session Manager
This component manages the main interactive chat loop. It is the stateful core of a user session.
- **Input Handling**: It presents the user with input choices (single-line vs. textbox) and captures their prompts.
- **Conversation Flow**: It orchestrates the back-and-forth between the user and the AI, maintaining the session's state.
- **Command Dispatch**: It is responsible for identifying whether user input is a prompt for the AI or a "slash command" to be handled internally.

### `src/commands/index.ts` - Slash Command Definitions
This file acts as a router for all the slash commands (e.g., `/plan`, `/sentient`) available within the interactive chat. 
- **Command Registration**: It maps each slash command to a specific function or module that contains its execution logic.
- **Action Execution**: When a slash command is detected by the `Interactive Mode` manager, the corresponding action from this file is triggered.

### `src/agents/` - The AI's Brain
This directory contains the logic for autonomous and specialized AI agents.
- **`orchestrator.ts`**: The master agent. When a high-level goal is provided via `canvas agent coordinate`, the orchestrator analyzes the goal, breaks it down into a multi-step plan, and delegates the individual steps to the most appropriate specialized agents.
- **`cliAgents.ts`**: Defines the specialized agents. This might include a `CoderAgent` (specialized in writing code), a `SecurityAgent` (specialized in auditing for vulnerabilities), and a `PlannerAgent` (specialized in creating detailed execution plans).

### `src/tools/` - The AI's Hands
This is a critical system that gives the AI the ability to interact with the world outside of the chat.
- **`registry.ts`**: A central service that holds a reference to all available tools. It is responsible for validating tool calls and executing them.
- **Tool Modules** (e.g., `fileSystem.ts`, `git.ts`, `web.ts`): Each module is a self-contained capability. For example, `fileSystem.ts` provides functions like `readFile` and `writeFile`. These are the functions the AI can call when it's in Execution Mode.

### `src/features/` - High-Level Feature Bundles
This directory organizes the application's major functionalities into logical, self-contained units.
- **Purpose**: Each subdirectory (e.g., `ai/`, `collaboration/`, `productivity/`) bundles together all the related logic, UI components, and services for a major feature.
- **Example**: The `productivity/` feature might contain the `commandPalette`, `notebookSystem`, and `workspaceState` components, providing a cohesive set of productivity tools.

### `src/ui/` - The User Interface
This directory contains all the code responsible for what the user sees.
- **`ink/`**: This subdirectory uses the Ink framework to build the rich, interactive terminal UI with React. Components like `ChatHistory`, `CommandInput`, and `StatusBar` are defined here.
- **UI Elements**: Other files like `spinner.ts` and `textBox.ts` define custom, standalone UI elements that provide a polished and consistent user experience across the application.

### `src/hooks/` - The Event System
This directory implements an event-driven architecture that allows for decoupling and extensibility.
- **`hookSystem.ts`**: The central manager for the hook system.
- **Lifecycle Events**: It emits events at key points in the application's lifecycle, such as `pre-command` (before a command is run) and `post-command` (after it completes). Other parts of the application can subscribe to these events to trigger custom actions, such as notifications or logging.

---

## Data Flow: The Lifecycle of a Prompt

Here is how a typical user prompt flows through the system in interactive mode:

1.  **Input**: The user types a prompt (e.g., "Generate a function to sort an array") into the Ink-based UI.
2.  **Pre-Command Hook**: The `Hook System` fires a `pre-command` event. A logging service might listen to this to record the incoming command.
3.  **Command vs. Prompt**: The `Interactive Mode` manager checks if the input starts with `/`. Since it doesn't, the input is classified as a prompt for the AI.
4.  **Mode Check**: The system checks the current mode. Let's assume it's **Planning Mode**.
5.  **AI Request**: The prompt is sent to the configured AI model via the Ollama provider. Because it's Planning Mode, the list of available tools is **not** included in the request.
6.  **AI Response**: The AI model generates the code for the sorting function and streams the response back.
7.  **UI Update**: The `Ink` UI receives the streamed response and renders it in real-time in the chat history panel.
8.  **User Follow-up**: The user is happy with the code and types `/write src/sort.js`.
9.  **Command Detection**: The `Interactive Mode` manager detects the `/` and sends the command to the `Slash Command` router.
10. **Action Execution**: The router triggers the `write` command logic. The logic prompts the user to switch to Execution Mode.
11. **Mode Switch**: The user types `/execute`.
12. **Tool-Enabled AI Request**: The user re-issues the command: "Save the function you just generated to `src/sort.js`." This time, the request to the AI **includes** the definitions of the available tools (like `writeFile`).
13. **AI Tool Call**: The AI responds not with conversational text, but with a special syntax indicating a tool call: `[TOOL: writeFile] { "path": "src/sort.js", "content": "... a long string with the code ..." }`.
14. **Tool Execution**: The `Tool Registry` parses this syntax, validates the `writeFile` tool call, and executes it, saving the file to disk.
15. **UI Feedback**: The UI displays a message like "✅ Successfully wrote `src/sort.js`."
16. **Post-Command Hook**: The `Hook System` fires a `post-command` event, and the session continues.
