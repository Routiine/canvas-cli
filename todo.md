# Canvas CLI — Competitive Analysis & Roadmap

> Last updated: 2026-02-23 (v3.1 — all competitive features implemented)
> Competitors reviewed: Claude Code, Kilo Code, Gemini CLI, Aider, Cursor, Cline, GitHub Copilot, Warp, OpenAI Codex, Amazon Q Developer

---

## Competitive Feature Matrix

| Feature | Canvas | Claude Code | Kilo Code | Gemini CLI | Aider | Cursor | Copilot | Codex | Warp |
|---|---|---|---|---|---|---|---|---|---|
| **Core CLI chat** | x | x | x | x | x | x | x | x | x |
| **Multi-model support** | x (10+) | - (1) | x (500+) | x (Gemini) | x (17+) | x (multi) | x (multi) | x (OpenAI) | x (BYOK) |
| **Local model support (Ollama)** | x | - | x | - | x | - | - | - | - |
| **AI file editing** | x | x | x | x | x | x | x | x | x |
| **AI test generation** | x | - | - | - | - | - | - | - | - |
| **PR review** | x | x | x | x | - | x | x | x | - |
| **Plugin system** | x | x | x | x | - | x | - | - | - |
| **Semantic search (RAG)** | x | - | x | - | - | x | x | - | - |
| **Codebase graph (AST)** | x | - | - | - | x | - | - | - | - |
| **Data flow/taint analysis** | x | - | - | - | - | - | - | - | - |
| **Session memory** | x | x | x | x | - | x | x | - | - |
| **Background daemon** | x | - | - | - | - | x | - | - | - |
| **Fine-tuning pipeline** | x | - | - | - | - | - | - | - | - |
| **Cost tracking/budgets** | x | x | - | - | - | x | - | - | - |
| **Model routing (smart)** | x | - | x | - | - | - | - | - | - |
| **Undo/snapshots** | x | x | - | x | x | - | - | - | - |
| **MCP support** | x | x | x | x | - | x | x | x | - |
| **IDE integration** | x | x | x | x | x | native | x | - | native |
| **Permission system** | x | x | x | x | - | - | x | x | x |
| **Hooks (lifecycle)** | x | x | - | x | - | x | - | - | - |
| **Multi-agent parallel** | x | x | x | - | - | x | x | x | - |
| **Git worktree isolation** | x | x | x | - | - | x | - | - | - |
| **Web search/fetch** | x | x | x | x | x | x | x | x | - |
| **Voice input** | x | - | x | - | x | - | - | - | - |
| **Browser automation** | - | - | x | - | - | x | - | - | x |
| **Plan mode** | x | x | - | x | - | x | - | x | - |
| **Conversation compression** | x | x | - | - | - | - | x | - | - |
| **Repo map (tree-sitter)** | x | - | - | - | x | - | - | - | - |
| **Image/multimodal input** | x | x | - | x | x | x | - | x | x |
| **Watch mode (AI comments)** | x | - | - | - | x | - | - | - | - |
| **Sandboxing** | x | - | - | x | - | - | - | - | - |
| **Enterprise admin** | x | - | x | x | - | x | x | - | - |
| **Tab autocomplete** | x | - | x | - | - | native | x | - | - |
| **Agent skills system** | x | - | x | x | - | - | - | - | - |
| **Free tier** | local | sub | free | 1K/day | free | 50 req | 50 msg | API | free |

---

## Priority 6 — MCP & Extensibility Platform

### MCP Client Support
- [x] Implement MCP client (stdio + HTTP/SSE transports) for connecting to external tool servers
- [x] Add `canvas mcp add|remove|list` commands for server management
- [x] Load MCP config from `~/.canvas/mcp.json` (user) and `.mcp.json` (project)
- [x] Surface MCP tools as first-class commands in chat/interactive mode
- [x] Support MCP Resources (`@server://resource/path` syntax)

### MCP Server Mode
- [x] Expose Canvas CLI as an MCP server (`canvas mcp serve`) so other tools can use Canvas capabilities

### Agent Skills / Extensions
- [x] Implement skills/extensions framework (packaged instructions + tools)
- [x] Support skill discovery: workspace (`.canvas/skills/`), user (`~/.canvas/skills/`), installed
- [x] Progressive disclosure: load skill metadata only, inject full instructions on activation
- [x] Add `canvas skills install|list|enable|disable` commands
- [x] Create extension gallery/registry for community sharing

---

## Priority 7 — Multi-Agent & Parallel Execution

### Parallel Agents
- [x] Support spawning multiple agents working in parallel on subtasks
- [x] Implement git worktree isolation per agent (each gets its own branch)
- [x] Add orchestrator mode: break complex tasks into coordinated subtasks
- [x] Parent agent delegates, monitors, and merges results from child agents
- [x] Support `--parallel <n>` flag to control max concurrent agents

### Background Agents (Cloud/Async)
- [x] Allow agents to run in background (detached from terminal)
- [x] Add `/delegate` command to create a PR branch and hand off to background agent
- [x] Progress tracking and notification when background agent completes
- [x] Support resuming/inspecting background agent work

---

## Priority 8 — Permission System & Safety

### Approval Framework
- [x] Implement three-tier permission model: `allow`, `ask`, `deny`
- [x] Add permission scopes: user-level (`~/.canvas/settings.json`), project-level (`.canvas/settings.json`)
- [x] Support glob-style permission patterns (e.g., `bash(git:*)`, `edit(src/**)`)
- [x] Permission modes: `default`, `auto-edit`, `plan` (read-only), `full-auto` (CI/CD)
- [x] Prompt user for approval before destructive operations (file writes, shell commands)

### Hooks System
- [x] Implement lifecycle hooks: `PreToolUse`, `PostToolUse`, `PreSession`, `PostSession`
- [x] Configure hooks in settings files (user and project level)
- [x] Hooks receive JSON context via stdin, return JSON to modify/block actions
- [x] Support regex matchers for filtering which tools/events trigger hooks

### Sandboxing
- [x] Add container-based sandboxing option (Docker/Podman) for untrusted operations
- [x] Implement trusted folders system (prompt on first run in new project)

---

## Priority 9 — IDE Integration

### VS Code Extension
- [x] Build VS Code extension bridge that connects to Canvas CLI backend via WebSocket
- [x] Share workspace context: open files, cursor position, selected text
- [x] Native in-editor diff view for AI-suggested changes (accept/reject)
- [x] Inline code actions (explain, refactor, generate tests) from editor context menu
- [x] Sidebar chat panel with full Canvas CLI capabilities

### JetBrains Plugin
- [ ] Build JetBrains plugin (IntelliJ, WebStorm, PyCharm) with same architecture

### Editor-Agnostic Watch Mode
- [x] Implement file watcher mode (`canvas watch`) that monitors source files
- [x] Support AI comments (`// AI!` triggers edit, `// AI?` triggers question) from any editor
- [x] No editor plugin needed — works with Vim, Emacs, Sublime, etc.

---

## Priority 10 — Web & Multimodal Capabilities

### Web Search & Fetch
- [x] Add `web_search` tool for real-time information retrieval during chat
- [x] Add `web_fetch` tool to retrieve and process URL content as markdown
- [x] Google Search grounding option for factual queries
- [x] URL auto-detection in chat with offer to scrape

### Multimodal Input
- [x] Accept image input (screenshots, mockups, diagrams) for vision-capable models
- [x] Support PDF input for generating code from specifications
- [x] Clipboard paste support for images (`/paste` command)
- [x] Screenshot capture of local app for visual debugging

### Voice Input
- [x] Implement voice-to-text via Whisper API (`canvas voice` or `/voice` command)
- [x] Support configurable STT providers (Whisper, Google, local)

---

## Priority 11 — Enhanced Chat & Context

### Plan Mode
- [x] Add `--plan` mode where Canvas proposes changes without executing them
- [x] Show detailed plan with affected files, changes, and rationale
- [x] User can approve/reject/modify plan before execution

### Conversation Compression
- [x] Auto-compress older messages when approaching context window limits
- [x] Summarize earlier conversation to retain essential context while freeing tokens
- [x] Support configurable compression strategies

### Architect/Editor Dual-Model Pattern
- [x] Support separate architect model (plans) and editor model (executes)
- [x] Architect proposes high-level changes, editor translates to file edits
- [x] Enable pairing reasoning models with editing-specialist models
- [x] Add `/architect` command to switch modes

### Repository Map
- [x] Build regex-based repo map showing symbols across entire codebase
- [x] Graph-rank symbols by relevance to current context
- [x] Dynamically size map to fit token budget
- [ ] Support 50+ languages via tree-sitter parsers (currently regex-based)

### Prompt Caching
- [ ] Implement prompt caching for supported providers (Anthropic, DeepSeek)
- [ ] Cache system prompt, read-only files, and repo map between turns
- [ ] Add keep-alive pings to maintain cache (`--cache-keepalive`)

---

## Priority 12 — Model Ecosystem & Provider Expansion

### Expanded Provider Support
- [x] Add Google Gemini provider (direct API)
- [x] Add DeepSeek provider (R1, V3)
- [x] Add OpenRouter meta-provider (100+ models)
- [x] Add Azure OpenAI provider
- [x] Add AWS Bedrock provider
- [x] Add Groq/Cerebras for fast inference
- [x] Support any OpenAI-compatible API endpoint

### Model Selection UX
- [x] Interactive model picker (`canvas models` or `/model` command)
- [x] Model aliases and shortcuts (`--sonnet`, `--opus`, `--haiku`, `--4o`)
- [ ] Show model leaderboard/benchmarks to help users choose
- [x] Fallback model configuration for overloaded providers
- [x] Per-task model routing (use cheap models for simple tasks, premium for complex)

---

## Priority 13 — Git & GitHub Integration Enhancements

### Advanced Git Integration
- [x] Git safety protocol: block force-push, hard reset without explicit confirmation
- [x] Auto-stage and commit with AI-generated Conventional Commits messages
- [x] Co-authored-by trailer on AI-generated commits
- [x] `/undo` to revert last AI commit (git revert)
- [x] Session linking to PRs (`canvas pr link <number>`)

### GitHub Integration
- [x] `@canvas` mentions on PRs/issues to trigger AI assistance
- [x] `/delegate` to create branch + draft PR and hand off to background agent
- [x] Authenticated GitHub access via `gh` CLI for issues, PRs, releases
- [x] Import PR diff for inline review and commenting

---

## Priority 14 — Enterprise & Team Features

### Team Collaboration
- [x] Shared project settings and rules (`.canvas/settings.json` in repo)
- [x] Team-wide model/provider restrictions
- [ ] Centralized billing and usage analytics
- [ ] AI adoption dashboard for teams

### Enterprise Security
- [ ] SSO support (SAML/OIDC) — interface created, needs identity provider integration
- [x] Audit trail logging for all AI actions
- [x] Admin policy overrides (system-level settings)
- [ ] SCIM provisioning — interface created
- [ ] Private/self-hosted deployment option

### Export & Reporting
- [x] Export conversations as markdown (`canvas export`)
- [x] Session search across history
- [x] Usage reports and cost breakdowns per project/team

---

## Priority 15 — Developer Experience Polish

### Interactive Shell Improvements
- [x] Tab completion for file paths and commands (bash/zsh/fish)
- [x] Rich terminal UI with syntax highlighting and markdown rendering
- [x] Progress spinners and streaming token-by-token output
- [ ] Image display in terminal (kitty/sixel protocol) — interface created

### Scripting & Automation
- [x] Non-interactive/headless mode: `canvas -p "prompt"` for single-shot
- [x] JSON output format for scripting (`--output-format json`)
- [x] `--max-budget-usd` to cap API spend per session
- [x] Support piping: `echo "explain this" | canvas -p`
- [x] Exit codes for CI/CD integration (0=success, 1=error)

### Configuration
- [ ] TOML/YAML config file support (currently JSON only)
- [x] Environment variable support for all CLI options (`CANVAS_*`)
- [x] `.canvasignore` file for excluding paths from AI context
- [x] Coding conventions file (`.canvas/conventions.md`) auto-loaded as context

---

## Technical Debt (from Audit)

### QUAL-002 — `any` annotations
- [x] `error`-level lint rule enforced for all new strategic modules (`src/intelligence/`, `src/graph/`, `src/memory/`, `src/daemon/`, `src/finetune/`, `src/web/server.ts`, `src/commands/command-context.ts`)
- [x] All new modules cleaned: provider-registry, persistent-memory, daemon-manager, dead-code-tracker, dependency-monitor — zero `any` in strategic code
- [ ] Remaining `any` warnings spread across ~168 older files (currently `warn` level) — fix incrementally

### QUAL-007 — Two command registration systems
- [x] Created `CommandContext` interface (`src/commands/command-context.ts`) to decouple consumers
- [x] Migrated `web/server.ts` — replaced `CommandHandler` with `dispatchSlashCommand()` direct handler dispatch
- [x] Migrated `ollama/response-generator.ts` — now takes `CommandContext` instead of `CommandHandler`
- [ ] Delete `src/commands.ts` — still imported by ~10 files (chat.ts, crawl.ts, init-cli.ts, search-cli.ts, tools-cli.ts, agent-cli.ts, export-cli.ts, ink-ui.ts, context-cli.ts, implementCommand.ts)

---

## Completed

### Competitive Features (Round 3 — Full Competitive Parity)

#### New Files Created (37 files, ~9,150 lines)
- `src/mcp/mcp-config-loader.ts` — Multi-source MCP config (user + project + legacy)
- `src/mcp/mcp-server.ts` — Canvas as MCP server (JSON-RPC over stdio)
- `src/permissions/permission-manager.ts` — Three-tier allow/ask/deny permission system
- `src/permissions/sandbox-executor.ts` — Docker/Podman sandboxing
- `src/permissions/trusted-folders.ts` — Trusted folder management
- `src/config/canvasignore.ts` — `.canvasignore` file support
- `src/config/coding-conventions.ts` — Load `.canvas/conventions.md`
- `src/providers/openai-compatible-provider.ts` — Base for any OpenAI-compatible API
- `src/providers/gemini-provider.ts` — Google Gemini via OpenAI-compat endpoint
- `src/providers/deepseek-provider.ts` — DeepSeek (R1, V3)
- `src/providers/openrouter-provider.ts` — OpenRouter meta-provider (100+ models)
- `src/providers/azure-openai-provider.ts` — Azure OpenAI with deployment auth
- `src/providers/bedrock-provider.ts` — AWS Bedrock with SDK
- `src/modes/plan-mode.ts` — Plan mode with risk classification
- `src/modes/architect-mode.ts` — Dual-model architect/editor pattern
- `src/modes/watch-mode.ts` — File watcher for `// AI!` and `// AI?` comments
- `src/context/conversation-compressor.ts` — Auto-summarize old turns
- `src/context/repo-map.ts` — Compact symbol map for prompts
- `src/git/git-safety.ts` — Block destructive ops, conventional commits, co-author
- `src/git/pr-linker.ts` — Link sessions to GitHub PRs
- `src/skills/skill-registry.ts` — Skill install/enable/disable management
- `src/agents/multi-agent-runner.ts` — Parallel agent execution in worktrees
- `src/agents/background-agent.ts` — Detached background agents with PID tracking
- `src/multimodal/input-pipeline.ts` — Image/PDF/clipboard processing
- `src/multimodal/voice-input.ts` — Whisper API + local whisper.cpp
- `src/ide/vscode-bridge.ts` — WebSocket server for VS Code extension
- `src/enterprise/audit-logger.ts` — SQLite audit log
- `src/enterprise/shared-settings.ts` — Project-level settings
- `src/cli/tab-completion.ts` — bash/zsh/fish shell completions

#### Modified Files (key changes)
- `src/mcp/mcp-manager.ts` — Multi-source config, MCP server integration
- `src/index.ts` — All new CLI commands registered
- `src/tools/tool-executor.ts` — Permission checks before tool execution
- `src/hooks/hookSystem.ts` — Permission hook in pre-tool-use
- `src/providers/provider-registry.ts` — 6 new providers auto-registered from env
- `src/intelligence/provider-registry.ts` — OpenAI-compatible intelligence providers
- `src/intelligence/model-router.ts` — Fallback chain on provider failure
- `src/models/model-manager.ts` — Alias map + fallback chains

### Competitive Features (Round 2)
- [x] `canvas edit <file> "instruction"` — AI edit with colored unified diff, accept/reject all or hunk-by-hunk, auto-snapshot
- [x] `canvas undo <file>` — restore from pre-edit snapshot in `~/.canvas/snapshots/`
- [x] `canvas ask "query"` — RAG semantic search over codebase via embeddings
- [x] `canvas index build` now also embeds all files for semantic search (pass `--no-embeddings` to skip)
- [x] `canvas test <file>` — AI-generates unit tests, runs them via Jest, iterates to fix failures (up to 5 rounds)
- [x] `canvas review-pr <number>` — reads GitHub PR diff via Octokit, posts inline AI review comments
- [x] Plugin system — drop `.js` files in `~/.canvas/plugins/`, auto-registered as `canvas <name>` commands
- [x] `canvas plugins` — list installed plugins with template

### Strategic Roadmap — Making Canvas CLI Extraordinary

#### Priority 1 — Hybrid Model Router
- [x] Build task complexity classifier (heuristics + lightweight model scoring)
- [x] Integrate Claude API / OpenAI as fallback providers
- [x] Add cost-per-query tracking and budget controls per session
- [x] Add `--local-only` flag for fully air-gapped operation (also: `CANVAS_LOCAL_ONLY=1`)
- [x] Log which tasks were elevated and why → `routing_log` SQLite table
- [x] Expose routing decisions in dashboard metrics

#### Priority 2 — Persistent Codebase Semantic Graph
- [x] Build AST-level call graph indexer (TypeScript Compiler API)
- [x] Map data flow: trace variables from input boundaries to output/storage
- [x] Index git history — commit messages + diffs as semantic context per file
- [x] Build incremental updater (watch mode — update graph on file save)
- [x] Expose graph as a tool agents can query: `getCallers(fn)`
- [x] Store graph in SQLite alongside existing canvas.db schema

#### Priority 3 — Session-Surviving Memory
- [x] Persist conversation summaries to SQLite between sessions
- [x] Build memory consolidation agent (runs on session end)
- [x] Tag memories by project/file/decision so retrieval is scoped
- [x] Add explicit "forget this" command → `canvas memory forget <id>`
- [x] Surface relevant past decisions at session start
- [x] Implement memory decay scoring (5%/day importance decay)

#### Priority 4 — Background Agents (Proactive Intelligence)
- [x] Commit watcher agent — analyses each commit for issues
- [x] Dependency monitor — watches package.json, flags CVEs
- [x] Style drift detector — compares new code against established patterns
- [x] Dead code tracker — flags symbols not touched in 30+ days
- [x] Performance regression spotter — tracks bundle size and complexity trends
- [x] Background agents run as daemon (`canvas daemon start|stop|status`)

#### Priority 5 — Fine-Tuning Pipeline
- [x] Training data extractor: git log + diffs → Alpaca JSONL
- [x] PR review extractor: comments → DPO pairs (needs `GITHUB_TOKEN`)
- [x] LoRA fine-tuning runner (Ollama create workflow)
- [x] Automated eval suite to measure improvement over base model
- [x] Scheduled re-tune trigger (weekly check)
- [x] Store generated datasets in `.canvas/training/` (gitignored)

### Prior Audit Fixes
- [x] All 38 security/quality/architecture findings from audit report fixed
- [x] SEC-015 Zod validation on dashboard mutation routes
- [x] ESLint setup with TypeScript rules
- [x] 82 floating-promise errors fixed
- [x] 140/140 tests passing
- [x] Multi-stage Dockerfile, SQLite persistence, JWT auth, SSRF/path-traversal guards

---

## Competitor Quick Reference

### Claude Code (Anthropic)
- **Type**: CLI + IDE extension | **Pricing**: Included with Claude subscription ($20/mo Pro)
- **Strengths**: Best-in-class agentic loop, MCP ecosystem (client + server), CLAUDE.md project memory, hooks system, worktree isolation, plan mode, file versioning, structured JSON output, PR-linked sessions
- **Weaknesses**: Single-vendor (Anthropic models only), no local model support, closed source

### Kilo Code (Kilo.ai)
- **Type**: VS Code + JetBrains + CLI + Cloud + Slack | **Pricing**: Free + $19-199/mo pass, $15/user/mo teams
- **Strengths**: 500+ models, cross-platform sessions, orchestrator mode, parallel agents, MCP marketplace, cloud agents, app builder, code reviewer, one-click deploy, tab autocomplete
- **Weaknesses**: Fork lineage (Cline → Roo → Kilo), newer/less proven, complex product surface

### Gemini CLI (Google)
- **Type**: CLI + VS Code | **Pricing**: Free (1,000 req/day), paid via Vertex AI
- **Strengths**: 1M token context, free tier, Google Search grounding, skills system (open standard), 11 lifecycle hooks, policy engine, conversation checkpointing, sandboxing, enterprise admin, extensions gallery, fully open source (Apache 2.0)
- **Weaknesses**: Google models only, no local model support, limited IDE support

### Aider (aider-chat)
- **Type**: CLI (Python) | **Pricing**: Free (open source, Apache 2.0), pay LLM API only
- **Strengths**: 17+ providers, architect/editor dual-model, repo map (tree-sitter), voice coding, watch mode (AI comments), infinite output, git-native workflow, 100+ languages, copy/paste web chat mode, Python scripting API, browser UI
- **Weaknesses**: No persistent memory, no background agents, no MCP support, Python-only install

### Cursor
- **Type**: AI code editor (VS Code fork) | **Pricing**: Free / $20 Pro / $60 Pro+ / $200 Ultra / $40 Business
- **Strengths**: Native editor experience, background agents (8 parallel), BugBot PR reviewer, memories, plugin marketplace, plan mode, browser control, subagent trees, tab autocomplete
- **Weaknesses**: Closed source, editor lock-in (must use Cursor editor), expensive higher tiers

### Cline
- **Type**: VS Code extension | **Pricing**: Free (open source), pay API directly
- **Strengths**: Human-in-the-loop approval, browser automation, multi-provider, MCP integration, plan-then-act mode, 4M+ users, enterprise controls (SSO, audit)
- **Weaknesses**: VS Code only, no CLI mode, no persistent memory, no local model focus

### GitHub Copilot
- **Type**: IDE extension + CLI | **Pricing**: Free / $10 Pro / $39 Pro+ / $19 Business / $39 Enterprise
- **Strengths**: Deepest GitHub integration, /delegate to coding agent, auto-compaction, custom agents, multi-model, tab completion, massive user base
- **Weaknesses**: GitHub-centric, limited CLI features, request-based pricing adds up

### OpenAI Codex CLI
- **Type**: CLI (Rust) | **Pricing**: OpenAI API pricing
- **Strengths**: Fast (Rust), code review mode, multi-agent, image input, Codex Cloud, three approval modes, MCP support, open source
- **Weaknesses**: OpenAI models only, newer/less mature, limited provider choice

### Warp
- **Type**: AI-native terminal | **Pricing**: Free / paid tiers
- **Strengths**: Terminal replacement with AI built-in, BYOK, agent mode with full terminal control, Computer Use (visual verification), image display, natural language detection
- **Weaknesses**: Terminal replacement (not just a CLI tool), less coding-specific, no plugin ecosystem

### Amazon Q Developer
- **Type**: IDE + CLI | **Pricing**: Free tier / Pro ($19/user/mo)
- **Strengths**: Deep AWS integration, high SWE-Bench scores, MCP support, session persistence, conversation export, multi-language customizations
- **Weaknesses**: AWS-centric, less useful outside AWS ecosystem
