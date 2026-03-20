# canvas-cli

A multi-provider AI coding agent for the terminal. Supports interactive chat with an agentic execution loop, file editing, shell execution, semantic codebase search, and more.

![Version](https://img.shields.io/npm/v/canvas-cli.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## What it is

canvas-cli is a Node.js CLI that wraps multiple AI providers (Ollama, Claude, OpenAI, and others) into a single terminal interface. It can read and write files, run shell commands, search your codebase semantically, and iterate on tasks over a multi-step agentic loop — all from the command line.

## Installation

```bash
npm install -g canvas-cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Start interactive chat (defaults to Ollama if configured)
canvas

# Configure a provider
canvas config

# Chat with a specific model
canvas chat --model claude-3-5-sonnet-20241022

# AI-powered file edit with diff preview
canvas edit src/app.ts "add input validation to the createUser function"

# Semantic search across the codebase
canvas ask "where is the authentication middleware defined"

# Natural language to shell command
canvas shell "find all TypeScript files modified in the last week"

# Generate and iterate tests for a file
canvas test src/services/auth.ts

# AI code review for a pull request
canvas review-pr 42
```

## Supported Providers

canvas-cli supports 11 providers through a unified interface:

| Provider | Notes |
|----------|-------|
| Ollama | Local models, no API key required |
| Anthropic (Claude) | Requires `ANTHROPIC_API_KEY` |
| OpenAI | Requires `OPENAI_API_KEY` |
| Google Gemini | Requires `GOOGLE_API_KEY` |
| DeepSeek | Requires `DEEPSEEK_API_KEY` |
| AWS Bedrock | Requires AWS credentials |
| Azure OpenAI | Requires Azure credentials |
| OpenRouter | Requires `OPENROUTER_API_KEY` |
| Groq | Requires `GROQ_API_KEY` |
| Together AI | Requires `TOGETHER_API_KEY` |
| OpenAI-compatible | Any endpoint with `OPENAI_BASE_URL` |

## Features

### Interactive chat with agentic loop

`canvas chat` opens an interactive session. Type naturally; the agent executes up to 20 steps per request, chaining file reads, writes, and shell commands to complete the task. A loop guard and LLM-as-judge evaluation prevent runaway execution.

Slash commands available in chat:
- `/help` — list all slash commands
- `/clear` — clear the screen
- `/model` — switch models mid-session
- `/memory` — manage persistent memory
- `/stats` — session duration, token usage, model
- `/compact` — compress context to last 10 messages
- `/export` — export conversation
- `/quit` — exit

### File editing

```bash
canvas edit <file> "<instruction>"
```

Applies AI-generated patches with fuzzy fallback if exact context is missing. Shows a diff before writing and creates a snapshot for `canvas undo`.

### Shell execution

The shell tool runs commands with PTY support for interactive prompts (e.g., `npx create-*` scaffolders). Safety patterns block destructive commands (e.g., `rm -rf /`, `sudo rm -rf`, fork bombs, pipe-to-shell). Warning patterns flag elevated-risk operations.

### Semantic codebase search

```bash
# Build the index first
canvas index build

# Then search
canvas ask "how does the retry logic work"
```

Uses local embeddings (stored in SQLite) for semantic search. `canvas index query <symbol>` queries the AST symbol graph.

### MCP client and server

```bash
canvas mcp list          # list configured MCP servers
canvas mcp add <server>  # add a server
canvas mcp tools         # list tools from all connected servers
canvas mcp serve         # start canvas as an MCP server
```

### Persistent memory

```bash
canvas memory add "prefer functional patterns over classes"
canvas memory show
canvas memory search "functional"
```

Memory is stored in SQLite and injected into the system prompt at session start.

### Background daemon

```bash
canvas daemon start    # start commit-watcher, dependency monitor, performance monitor
canvas daemon status   # view recent findings
canvas daemon stop
```

### AI test generation

```bash
canvas test src/services/payment.ts
```

Generates a test file, runs the tests, and iterates on failures up to a configurable limit.

### AI PR review

```bash
canvas review-pr 42
```

Fetches the diff from GitHub and posts a structured review comment.

### Skill system

Skills are cross-tool prompt/behavior bundles that can be installed from files and toggled on/off:

```bash
canvas skills list
canvas skills install ./my-skill.json
canvas skills enable my-skill
```

## Commands Reference

```
canvas                   Interactive chat (default)
canvas chat              Interactive chat
canvas edit <f> <instr>  AI file edit with diff preview
canvas undo <file>       Restore file from pre-edit snapshot
canvas test <file>       Generate and iterate tests
canvas review-pr <num>   AI PR review posted to GitHub
canvas shell "<prompt>"  Natural language to shell command
canvas ask "<query>"     Semantic codebase search
canvas index build       Build AST + embedding index
canvas index query <sym> Query symbol graph
canvas models            List and manage AI models
canvas config            Configure providers and settings
canvas init              Initialize canvas in current project
canvas mcp               MCP server management
canvas memory            Persistent memory management
canvas daemon            Background analysis daemon
canvas skills            Skill system management
canvas audit             Show audit log
canvas watch             Watch files for AI comment triggers (// AI!)
canvas finetune          Fine-tuning data pipeline
canvas plugins           List installed plugins
```

## Configuration

Run `canvas config` for an interactive setup wizard, or edit `~/.canvas-cli/config.json` directly.

Key settings:

```json
{
  "defaultModel": "claude-3-5-sonnet-20241022",
  "ollamaUrl": "http://localhost:11434",
  "tools": true,
  "sandbox": {
    "enabled": true
  }
}
```

Environment variables for provider API keys are read at startup. See `.env.example` for the full list.

## Headless / scripted use

```bash
# Single prompt, no interactive session
canvas -p "summarize the changes in the last 5 commits"

# JSON output for scripting
canvas -p "list all exported functions in src/utils.ts" --output-format json

# Auto-approve all tool confirmations
canvas -p "refactor the auth module to use async/await" --auto-approve
```

## Plugin system

Drop a plugin file in `~/.canvas/plugins/` and it will be loaded automatically. Use `canvas plugins` to list what is loaded.

## License

MIT
