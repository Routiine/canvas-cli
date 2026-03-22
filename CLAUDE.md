# canvas-cli — Project Context

> FORGE product. Priority tier: 3 (alongside devproject + devproject-2).
> Global FORGE standards apply (~/Company/CLAUDE.md).
> Project learnings: `~/Company/learnings/canvas-cli-learnings.md`

---

## What This Is

**canvas-cli** — A production-ready AI CLI tool with advanced features, inspired by goose-cli.
Gives developers an intelligent command-line interface powered by Claude for code generation,
file operations, browser automation, and code execution.

**Core concept:** A terminal-native AI assistant that can reason, browse, execute code,
and interact with the filesystem — all from the command line.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| AI | `@anthropic-ai/sdk` (claude-sonnet-4-6) |
| CLI UI | `ink` + `@inkjs/ui` (React for terminal) |
| Browser automation | `@browserbasehq/stagehand` |
| Code execution | `@e2b/code-interpreter` (sandboxed) |
| AST manipulation | `@babel/core`, `@babel/parser`, `@babel/traverse` |
| Distribution | Homebrew tap (`homebrew/`) + installers |

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `dist/` | Build output |
| `docs/` | Documentation |
| `homebrew/` | Homebrew tap formula |
| `installers/` | Platform-specific installers |
| `recipes/` | Predefined AI task templates |
| `dashboard/` | Optional web dashboard |
| `k8s/` | Kubernetes deployment config |
| `assets/` | Static assets |

---

## Agent Instructions

1. **Terminal-first UX** — all UI is ink/terminal based; no web assumptions
2. **Safety by default** — destructive operations (file delete, shell exec) require confirmation
3. **Anthropic SDK directly** — no wrapper libs; use `@anthropic-ai/sdk` with streaming
4. **Sandboxed execution** — use E2B for any code the user wants run; never exec untrusted code locally
5. **Stagehand for browser** — use stagehand for browser automation tasks, not raw playwright
6. **Recipes are reusable workflows** — new capabilities should be added as recipes when possible

---

## Running Locally

```bash
pnpm install
pnpm dev        # development mode
pnpm build      # compile to dist/
pnpm test       # run tests
```

---

## Distribution

Distributed via Homebrew tap. When updating, bump version in:
- `package.json`
- `homebrew/` formula
- `installers/` scripts as needed
