# canvas-cli Architecture Audit

**Date:** 2026-03-19
**Auditor:** Systems architecture review (Claude Sonnet 4.6)
**Method:** Full codebase exploration + verified grep/read confirmation of all findings

---

## CRITICAL

### 1. `featureManager` is completely dead

`initializeSystems()` runs at startup, imports 18 feature modules, initializes workspaces, discovers MCP servers — then assigns the result to a local variable that is **never passed to any command** and never read again. `registerCoreCommands(program, config)` doesn't even take a `featureManager` parameter. All that startup work is a no-op.

**Files:** `src/index.ts:247-265, 853`
**Fix:** Delete the `initializeSystems()` call and the entire `src/features/` dependency tree from startup, or wire it in.

---

### 2. Two competing auto-execute state variables

`/autoexec` command (`commands.ts:641`) toggles `getInteractiveMode().autoExecute`. But the chat loop (`chat.ts:248,332`) only checks `BaseTool.autoConfirmMode`. These are two completely separate booleans controlling the same concept. `/autoexec` effectively does nothing to the actual tool execution path.

**Files:** `src/commands.ts:641`, `src/commands/chat.ts:248,332`, `src/tools/base.ts:12,22`
**Fix:** One state variable. Wire `BaseTool.autoConfirmMode = getInteractiveMode().autoExecute` or eliminate one of them.

---

## HIGH

### 3. Config has two separate model keys that diverge

The schema has **both** `config.model` and `config.defaultModel`. `DEFAULT_CONFIG` only sets `defaultModel`. When the user sets a model via `/config`, both are written (`commands.ts:446-448`). But read sites are inconsistent:

- `response-generator.ts` reads `config.defaultModel || config.model || config.ollama?.defaultModel`
- `agents/base-agent.ts` reads `config.model || appConfig.defaultModel || appConfig.ollama?.defaultModel`
- `commands.ts:801` reads `getCurrentModel() || config.defaultModel`
- `commands/chat.ts:147` reads `config.defaultModel || config.model`

If `config.model` is set but `config.defaultModel` isn't (e.g., old config file), some paths use the right model and others don't.

**Files:** `src/config.ts:77-78`, `src/commands.ts:435-448`, plus ~35 other read sites
**Fix:** Pick one — `defaultModel`. Delete `config.model` from the schema. Add a migration in `loadConfig()` that promotes `model → defaultModel` if `defaultModel` is absent.

---

### 4. `CANVAS_SESSION_CONTEXT` is set but never read by AI

`SessionBridge.loadContext()` runs at startup, writes the result to `process.env.CANVAS_SESSION_CONTEXT`. This env var is only ever read in one place: `commands/index.ts:209` — a status display that prints "context loaded" or "no session context". The context string **never gets injected into any system prompt**. The feature is architecturally complete but functionally disconnected.

**Files:** `src/index.ts:884-892`, `src/commands/index.ts:209`, `src/ollama/response-generator.ts`
**Fix:** Read `process.env.CANVAS_SESSION_CONTEXT` in `buildSystemPrompt()` in `response-generator.ts` and append it to system content if present.

---

### 5. Dead state in `CommandHandler` (~50 lines)

`showHelpOld()` at `commands.ts:359` is never called — `showHelp()` (line 293) is the active one.

Additionally, these `CommandHandler` fields are initialized but never meaningfully used:
- `todos: TodoItem[]` — populated by `/todo` but never persisted
- `backgroundTasks: BackgroundTask[]` — initialized, never populated from actual background processes
- `conversationHistory` (line 67) — declared but never used (the real history is `this.messages`)
- `customCommands` — loaded but interpolation logic is missing; content is passed raw to AI

**Files:** `src/commands.ts:57-67, 359-390`
**Fix:** Delete dead state and the `showHelpOld()` method.

---

## MEDIUM

### 6. `loadCustomCommands()` async race in constructor

`CommandHandler` constructor fires `loadCustomCommands()` as fire-and-forget (`void`). If any code reads `this.customCommands` before the async load finishes, it gets an empty map. The REPL loop gives it time in practice, but the `-p` headless flag can hit this race.

**Files:** `src/commands.ts:97`
**Fix:** Lazy-load on first use instead of eager async in constructor.

---

### 7. `InteractiveMode.promptForConfirmation()` is a dead path

`InteractiveMode.promptForConfirmation()` was clearly intended as the confirmation gate before tool execution. But `BaseTool.confirmAction()` in `src/tools/base.ts:22` is what actually fires — and it checks `BaseTool.autoConfirmMode`, not `getInteractiveMode()`. The entire `InteractiveMode` confirmation flow is unreachable from the main execution path.

**Files:** `src/interactiveMode.ts:11-35`, `src/tools/base.ts:22`
**Fix:** Either consolidate confirmation logic into `BaseTool`, or make `BaseTool.confirmAction()` delegate to `getInteractiveMode().promptForConfirmation()`.

---

### 8. `SessionBridge` failure is completely silent

```ts
bridge.loadContext().then(...).catch(() => { /* Non-critical */ });
```

No logging at all. If session loading fails (file corruption, permission error, OOM), the user and operator get zero diagnostic output.

**Files:** `src/index.ts:891-892`
**Fix:** `catch((e) => console.debug('[session-bridge] load failed:', e.message))`

---

## LOW

### 9. `/compact` is destructive truncation, not compression

`/compact` is documented as "compress context" but it hard-truncates to the last 10 messages — irreversibly destroying conversation history. The `compactHistoryIfNeeded()` function in `context-manager.ts` does proper summarization via `/api/generate`. The `/compact` command should use that instead.

**Files:** `src/commands.ts:585-590`

---

### 10. Help text describes broken behavior

`showHelp()` lists `/autoexec` without noting it toggles a state variable that doesn't affect actual tool execution (see issue #2 above). This will confuse users who try to toggle auto-execution and see no effect.

**Files:** `src/commands.ts:293-358`

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | FeatureManager dead at startup | CRITICAL | ✅ Fixed — removed dead call in `index.ts` |
| 2 | Two competing autoExecute variables | CRITICAL | ✅ Fixed — `setAutoExecute()` now syncs `BaseTool.autoConfirmMode` |
| 3 | `config.model` vs `config.defaultModel` | HIGH | ✅ Fixed — migration in `loadConfig()` promotes `model→defaultModel` |
| 4 | CANVAS_SESSION_CONTEXT never injected | HIGH | ✅ Fixed — injected into `buildSystemPrompt()` in `response-generator.ts` |
| 5 | Dead state/methods in CommandHandler | HIGH | ✅ Fixed — removed dead interfaces/fields; hollow methods stubbed |
| 6 | `loadCustomCommands` async race | MEDIUM | ✅ Fixed — converted to lazy `ensureCustomCommandsLoaded()` |
| 7 | InteractiveMode confirm path dead | MEDIUM | ✅ Fixed — dead confirmation methods removed; `setAutoExecute` wired |
| 8 | Silent SessionBridge failure | MEDIUM | ✅ Fixed — `catch` now logs via `console.debug` |
| 9 | `/compact` truncates instead of summarizes | LOW | ✅ Fixed — `/compact` routes to `compressContext()` (LLM summarization) |
| 10 | Help text describes broken `/autoexec` | LOW | ✅ Fixed — behavior is now correct; help text already accurate |

**Status:** All 10 findings resolved as of 2026-03-19. Build passes (`tsc --noEmit` exit 0).
