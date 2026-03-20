# Canvas CLI — QA Report

**Date:** 2026-03-15
**Auditor:** QA Agent (FORGE Dev Shop)
**Version:** 3.0.0
**Scope:** Full codebase audit — build, typecheck, lint, tests, coverage, stubs, wiring

---

## Gate Summary

| Gate | Status | Detail |
|------|--------|--------|
| Build (`npm run build`) | PASS | Compiles cleanly, zero tsc errors |
| Typecheck (`npm run typecheck`) | PASS | Zero TypeScript errors |
| Lint (`npm run lint`) | FAIL | 5 errors, 2051 warnings |
| Tests (`npm test`) | PASS | 153/153 passing, 14 suites |
| Coverage | FAIL | 5.24% overall (threshold: 80%) |
| Open Handles | WARN | 1 leaked worker process at teardown |

**Overall verdict: FAIL — Do not ship until lint errors and coverage gaps are resolved.**

---

## 1. Test Results

All 153 tests pass across 14 suites.

```
Test Suites: 14 passed, 14 total
Tests:       153 passed, 153 total
Time:        9.25s
```

**Open handles warning:** A worker process fails to exit gracefully after the test run, triggering Jest's force-exit warning. The most likely cause is a `better-sqlite3` instance, a `chokidar` watcher, or a `setInterval` not being torn down in the agent communication test suite. Run `jest --detectOpenHandles` to pinpoint the leak.

---

## 2. Lint Gate Failures (FAIL — 5 errors)

Lint reports `✖ 2056 problems (5 errors, 2051 warnings)`.

### Lint Errors (blocking)

| File | Line | Rule | Issue |
|------|------|------|-------|
| `src/daemon/commit-watcher.ts` | 78 | `no-floating-promises` | `watcher.close()` returns `Promise<FSWatcher>` — not awaited |
| `src/graph/graph-watcher.ts` | 58 | `no-floating-promises` | Same: `watcher.close()` not awaited |
| `src/modes/watch-mode.ts` | 99 | `no-floating-promises` | `this.scanFile(filePath)` called inside `setTimeout` callback — `scanFile` is `async` but the result is discarded |
| `src/intelligence/model-router.ts` | 149 | `no-explicit-any` | `catch (error: any)` — use `unknown` and narrow |
| `src/intelligence/provider-registry.ts` | 86 | `no-explicit-any` | `const systemParam: any` — use typed union |

### Lint Warnings (non-blocking, high volume)

- **2051 warnings** dominated by `no-explicit-any` and `no-unused-vars` across the entire codebase. Per the FORGE coding standard ("No `any` types — use `unknown`"), these are a technical debt priority. They do not block CI but indicate systematic type discipline issues across 60+ files.

---

## 3. Coverage Report (FAIL)

```
Statements : 5.24%  (2010 / 38290)
Branches   : 1.91%  (372  / 19390)
Functions  : 4.91%  (333  / 6782)
Lines      : 5.41%  (1969 / 36332)
```

Target is 80% on critical paths. Current coverage is critically below threshold.

### Directories with 0% coverage (zero tests)

The following entire source directories have no test coverage at all:

- `src/ab/`
- `src/athena/`
- `src/checkpoint.ts`
- `src/cli/`
- `src/cloud/`
- `src/commands/` (all 24 command files)
- `src/context/context-manager.ts`
- `src/daemon/`
- `src/dashboard/`
- `src/enterprise/`
- `src/errors/`
- `src/features/` (all 18 subdirectories)
- `src/finetune/`
- `src/git/`
- `src/graph/`
- `src/handlers/`
- `src/hooks/`
- `src/ide/`
- `src/integrations/`
- `src/mcp/` (mcp-manager.ts, mcp-config-loader.ts, mcp-server.ts)
- `src/memory/`
- `src/modes/`
- `src/monitoring/`
- `src/multimodal/`
- `src/ollama/`
- `src/orchestrator/`
- `src/permissions/`
- `src/plugins/`
- `src/prd/`
- `src/providers/`
- `src/recipes/` (recipe-manager.ts — 688 lines, zero coverage)
- `src/skills/`
- `src/tokenization/`
- `src/ui/`
- `src/web/`

### Files with partial coverage (needs expansion)

| File | Stmt% | Branch% | Notes |
|------|-------|---------|-------|
| `src/tools/mcpIntegration.ts` | 10.45% | 4.27% | HTTP/SSE transport paths untested |
| `src/intelligence/` | 6.22% | 4.3% | Only loop-guard tested |
| `src/agents/` | 23.53% | 12.31% | Only communication and business-analyst covered |
| `src/models/` | 16.04% | 1.98% | Most model manager paths untested |

---

## 4. Critical Path Smoke Tests

### `canvas shell` (`src/commands/shell-command.ts`)

**Status: WIRED, FUNCTIONAL**

The command correctly tries Claude → OpenAI → unified provider → Ollama in cascade. It parses `CMD:`, `EXPLAIN:`, `WARN:` lines from the LLM response. Confirmation prompt before execution is present.

**Issue — Security (Critical):** The LLM-generated command string is executed via `spawn(command, { shell: true })` with no sanitization. An adversarial prompt injection or a misbehaving model could generate a destructive shell command that passes confirmation. There is no allowlist, no command pattern validation, and no sandboxing before execution.

**Missing test coverage:** Zero tests for shell-command.ts. No tests for: response parsing logic, the cascade fallback chain, confirmation bypass with `--yes`, or error path when no provider is configured.

---

### Agent loop (`src/agents/index.ts`)

**Status: FULLY IMPLEMENTED — not a stub**

The `executeAgentLoop` method implements a proper multi-turn LLM tool-use loop: up to 10 iterations, calls `parseToolCalls`, executes tools via `toolRegistry.execute`, feeds results back as user messages, and breaks when the LLM emits no tool calls. The Ollama fallback path is wired through `generateResponseWithTools`.

**Issue — Logic (Low):** The singleton pattern (`agentManager`) is never reset between calls in long-running sessions, meaning a stale `ThemeManager` or `ToolRegistry` reference could persist after reinitialisation. `resetAgentManager()` exists but nothing calls it automatically.

**Missing test coverage:** The `AgentManager` class (`runTask`, `executeAgentLoop`, `buildAgentPrompt`) has zero unit tests. The only agent test is for communication, not for task execution.

---

### `/copy` command (`src/commands/index.ts`)

**Status: WIRED BUT BROKEN**

The `copyCommand` action signature is `async (_, context) => { const lastOutput = context?.lastOutput ?? '' }`. When registered with Commander via `command.action(cmd.action)`, the second argument Commander passes is the `Command` instance itself, not a context object with a `lastOutput` property. `Command` has no `lastOutput` property, so `context?.lastOutput` always evaluates to `undefined`. The command will always print "nothing to copy — no previous output in this session" regardless of session state.

The separate implementation in `src/commands.ts` (line 592, `CommandHandler.copyLastOutput`) correctly walks `this.messages` for the last assistant message and uses `pbcopy`/`clip`/`xclip`. That implementation works. The `commands/index.ts` version does not.

**Missing test coverage:** Zero tests for copy command in either implementation.

---

### Recipe marketplace browse/install (`src/commands/recipe-command.ts`)

**Status: WIRED, FUNCTIONAL — security issue on install**

Browse hits the GitHub search API with optional GITHUB_TOKEN auth. The UI is fully wired. Install downloads `recipe.yaml` from the remote repo, parses it via `yaml.load` (js-yaml v4, safe by default), then calls `recipeManager.saveRecipe`.

**Issue — Security (High):** `getRecipeFileName(name)` does not sanitize the recipe name for path traversal. If a GitHub repo's `recipe.yaml` contains `name: "../../.bashrc"`, the filename becomes `../../.bashrc.yaml` and the resolved path will be outside `~/.canvas-cli/recipes/`. There is no `path.normalize` + containment check after `path.join(library.path, fileName)` in `saveRecipe`. The `RecipeSchema.safeParse` validates structure but not the `name` field for path safety.

**Missing test coverage:** Zero tests for recipe-command.ts (663 lines). No tests for browse, install, create, or dry-run paths.

---

### MCP HTTP/SSE transports (`src/tools/mcpIntegration.ts`)

**Status: IMPLEMENTED**

Both HTTP and SSE transports are fully implemented:
- HTTP: overrides `sendRequest` to use `fetch` with `AbortController` timeout
- SSE: subscribes to `serverUrl/sse` stream in a non-blocking async loop, sends outbound via `serverUrl/message`
- OAuth config is accepted in `MCPServerConfig` but the OAuth handshake itself is not implemented in the transport layer — the oauth config is declared but never consumed anywhere in `mcpIntegration.ts`

**Issue — Stub (Medium):** OAuth fields (`clientId`, `clientSecret`, `authUrl`, `tokenUrl`, `scopes`) are defined in `MCPServerConfig` but no OAuth token exchange or bearer token injection occurs during HTTP/SSE connect. This is a silent no-op.

**Missing test coverage:** HTTP/SSE transport paths are untested (10.45% on the file overall, covering only the class constructor and status enum paths).

---

### Context summarization (`src/context/context-manager.ts`)

**Status: IMPLEMENTED — logic bug present**

The `analyzeContext` method has an unreachable branch:

```typescript
} else if (utilizationPercent > 90) {
  recommendedAction = 'summarize';
} else if (utilizationPercent > 95) {   // UNREACHABLE: 95 > 90, but we already matched
  recommendedAction = 'split';
}
```

Any utilization above 95% will be categorised as `'summarize'` instead of `'split'`. The `'split'` action is never returned from `analyzeContext`.

The summarization strategy itself is properly implemented: collects messages to summarise, calls the unified provider with a summary prompt, and falls back to `dropOldestMessages` if no provider is available.

**Missing test coverage:** `context-manager.ts` has 0% coverage (518 lines).

---

## 5. Remaining Stubs Inventory

| File | Stub | Severity |
|------|------|----------|
| `src/tools/vscode.ts:590` | `return { message: 'Syncing to VSCode not yet implemented' }` — one-directional sync only | Medium |
| `src/tools/multimodal.ts:299` | `result.note = 'Support for DOCX, XLSX, PPTX coming soon'` — these formats return a placeholder string instead of parsed content | Medium |
| `src/commands/index.ts:370-375` | `vimCommand` action just logs "vim mode not available in this terminal mode" — advertised feature is a no-op | Low |
| `src/tools/mcpIntegration.ts` | OAuth config fields accepted but never executed | Medium |

The `code-generator.ts` lines mentioning `TODO: Implement` are inside template strings (scaffold code generated for users), not application stubs.

---

## 6. Broken Wiring

### `/copy` command context binding (High)

As described in section 4: `copyCommand` registered via Commander receives a `Command` instance as its second argument, not a `{ lastOutput }` context object. The `lastOutput` will always be `undefined`. This means the `/copy` command is silently non-functional.

### `recommendedAction: 'split'` unreachable (Medium)

Described in section 4 under context-manager. Any code path consuming `ContextAnalysis.recommendedAction === 'split'` will never trigger.

### `programs.lastOutput` never set (High)

There is no location in the codebase where `.lastOutput` is assigned to a Commander `Command` instance or any object that flows into `copyCommand`'s action callback. The property does not exist on `Command`. No test would catch this because there are zero tests for the copy command.

---

## 7. Recommendations (Priority Order)

### Critical

1. **Fix `/copy` command wiring** — The `copyCommand` in `src/commands/index.ts` needs access to session state (last assistant output). Either: (a) use the working implementation from `src/commands.ts`, or (b) inject session state through a shared module rather than relying on Commander's callback arguments. Add a unit test that verifies clipboard content matches the last assistant message.

2. **Fix `recommendedAction` branch ordering in `context-manager.ts`** — Swap the `> 90` and `> 95` checks so the 95% threshold is evaluated first. Add unit tests for each threshold boundary (80%, 85%, 90%, 95%, 100%+).

3. **Sanitize recipe name for path traversal in `recipe-manager.ts`** — After computing `filePath = path.join(library.path, fileName)`, verify the resolved path starts with `library.path` using `path.resolve` and `String.startsWith`. Reject names containing `..` or absolute path components. Add a security test for a recipe named `../../.bashrc`.

### High

4. **Fix floating promise lint errors (3 files)** — `watcher.close()` in `commit-watcher.ts` and `graph-watcher.ts` returns a Promise; prepend `void` or `await`. `this.scanFile()` in `watch-mode.ts` is async; inside the `setTimeout` callback, prepend `void this.scanFile(filePath)`. These are lint errors, not just warnings.

5. **Fix `no-explicit-any` lint errors (2 files)** — `model-router.ts:149` and `provider-registry.ts:86` use `any` in ways the linter flags as errors. Use `unknown` + narrowing.

6. **Add shell-command security guard** — Before executing an LLM-generated shell command, validate it against a basic allowlist of safe patterns or at minimum strip any `sudo`, `rm -rf /`, pipe-to-shell patterns. The current flow executes arbitrary LLM output as a privileged shell command.

7. **Add tests for agent loop** — `AgentManager.runTask` and `executeAgentLoop` are core runtime paths with zero test coverage. At minimum, write unit tests for: task creation, tool call parsing, iteration limit enforcement, error propagation from tool execution.

### Medium

8. **Add tests for recipe command** — `recipe-command.ts` is 663 lines with 0% coverage. Priority test cases: recipe list, recipe run with missing params, recipe install with valid/invalid GitHub repo, dry-run rendering, parameter validation.

9. **Add tests for context-manager** — 518 lines, 0% coverage. Priority: `analyzeContext` token counting, each trim strategy, `manageContext` no-op fast path, summarize fallback to drop_oldest when no provider.

10. **Add tests for MCP HTTP/SSE transports** — `mcpIntegration.ts` HTTP and SSE connect paths are fully implemented but untested. Use `nock` or `msw` to mock fetch calls. Test: successful initialization, timeout handling, tool discovery, disconnection.

11. **Implement or remove OAuth fields in `MCPServerConfig`** — Silent acceptance of OAuth config that is never used is a foot-gun. Either implement the OAuth handshake or remove the fields and document they are reserved for a future release.

12. **Investigate and fix open handles warning** — Run `jest --detectOpenHandles` to find the leaking resource. Likely candidates: `better-sqlite3` connection in `agent-memory.ts`, `setInterval` in `performance monitor`, or a `chokidar` watcher not closed in `afterAll`.

### Low

13. **Implement or clearly document `vimCommand` stub** — The `vim` CLI command is advertised in help but is a no-op. Either remove it from `builtinCommands` or implement basic readline vim mode.

14. **Implement VSCode sync (bidirectional)** — `src/tools/vscode.ts` only syncs from VSCode to Canvas CLI, returning a stub for the reverse direction.

15. **Address `any` warnings systematically** — 2051 warnings is unsustainable. The FORGE standard requires `unknown` + narrowing. Recommend a sprint focused on eliminating `any` from the 20 most critical files (providers, agents, tools).

16. **Resolve unused variable warnings** — Multiple `'error' is defined but never used` patterns in catch blocks indicate swallowed errors. Each should be converted to `catch (_error)` or logged appropriately.

---

## 8. Test Plan: Critical Paths Needing New Tests

### Test Plan: `/copy` Command

**Happy Path**
- [ ] Session has prior assistant output; copy succeeds and clipboard contains the output

**Edge Cases**
- [ ] Empty session (no messages) — shows "nothing to copy" message
- [ ] Session has only user messages, no assistant messages — shows warning

**Error Cases**
- [ ] Clipboard tool not installed on Linux — shows install guidance, does not throw

---

### Test Plan: Agent Loop (`AgentManager`)

**Happy Path**
- [ ] Task completes in 1 iteration (no tool calls in response)
- [ ] Task completes after tool call (1 iteration with tool, 1 without)

**Edge Cases**
- [ ] MAX_ITERATIONS (10) reached before completion — loop exits, returns last response
- [ ] Tool name in response not found in registry — user message injected, loop continues

**Error Cases**
- [ ] Tool execution throws — error message injected as user message, loop continues
- [ ] Provider unavailable — falls back to Ollama path

---

### Test Plan: Recipe Marketplace Install

**Happy Path**
- [ ] Install by `owner/repo` — downloads recipe.yaml, validates schema, saves to user library

**Edge Cases**
- [ ] Install by short name — GitHub search resolves to full repo name
- [ ] recipe.yaml not in main branch — falls through to master branch

**Error Cases**
- [ ] Repo not found on GitHub — clear error message
- [ ] No recipe.yaml in any expected location — error message with repo name

**Security Cases**
- [ ] Recipe name contains `../` path traversal — rejected before file write
- [ ] Recipe name is an absolute path — rejected

---

### Test Plan: Context Manager

**Happy Path**
- [ ] Context under 85% utilization — no-op, returns window unchanged
- [ ] Context over 80% target, strategy=drop_oldest — removes oldest messages

**Edge Cases**
- [ ] utilizationPercent = 91% — recommendedAction should be `'summarize'`
- [ ] utilizationPercent = 96% — recommendedAction should be `'split'` (after bug fix)
- [ ] preserveRecent > message count — no messages removed

**Error Cases**
- [ ] Summarize strategy with no provider available — falls back to drop_oldest

---

*Report generated by QA Agent — FORGE Dev Shop*
