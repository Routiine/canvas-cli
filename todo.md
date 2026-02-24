# TODO

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

### Competitive Features (Round 2)
- [x] `canvas edit <file> "instruction"` — AI edit with colored unified diff, accept/reject all or hunk-by-hunk, auto-snapshot → `src/commands/edit-command.ts`
- [x] `canvas undo <file>` — restore from pre-edit snapshot in `~/.canvas/snapshots/`
- [x] `canvas ask "query"` — RAG semantic search over codebase via embeddings (HybridEmbeddingService + SQLite `file_embeddings`) → `src/intelligence/semantic-search.ts`
- [x] `canvas index build` now also embeds all files for semantic search (pass `--no-embeddings` to skip)
- [x] `canvas test <file>` — AI-generates unit tests, runs them via Jest, iterates to fix failures (up to 5 rounds) → `src/commands/test-command.ts`
- [x] `canvas review-pr <number>` — reads GitHub PR diff via Octokit, posts inline AI review comments → `src/commands/review-pr-command.ts`
- [x] Plugin system — drop `.js` files in `~/.canvas/plugins/`, auto-registered as `canvas <name>` commands → `src/plugins/plugin-loader.ts`
- [x] `canvas plugins` — list installed plugins with template

### Strategic Roadmap — Making Canvas CLI Extraordinary

#### Priority 1 — Hybrid Model Router
- [x] Build task complexity classifier (heuristics + lightweight model scoring) → `src/intelligence/complexity-classifier.ts`
- [x] Integrate Claude API / OpenAI as fallback providers → `src/intelligence/provider-registry.ts`
- [x] Add cost-per-query tracking and budget controls per session → `src/intelligence/cost-tracker.ts`
- [x] Add `--local-only` flag for fully air-gapped operation (also: `CANVAS_LOCAL_ONLY=1`)
- [x] Log which tasks were elevated and why → `routing_log` SQLite table
- [x] Expose routing decisions in dashboard metrics → `/api/routing/stats` endpoint

#### Priority 2 — Persistent Codebase Semantic Graph
- [x] Build AST-level call graph indexer (TypeScript Compiler API) → `src/graph/ast-walker.ts`
- [x] Map data flow: trace variables from input boundaries to output/storage → `src/graph/data-flow-analyzer.ts`, `canvas index dataflow <file>`, `/api/graph/dataflow`
- [x] Index git history — commit messages + diffs as semantic context per file → `src/graph/git-enricher.ts`
- [x] Build incremental updater (watch mode — update graph on file save) → `src/graph/graph-watcher.ts`
- [x] Expose graph as a tool agents can query: `getCallers(fn)` → `src/graph/graph-storage.ts`
- [x] Store graph in SQLite alongside existing canvas.db schema → `graph_nodes`/`graph_edges` tables
- [x] `canvas index build`, `canvas index query <symbol>`, `canvas index dataflow <file>` CLI commands

#### Priority 3 — Session-Surviving Memory
- [x] Persist conversation summaries to SQLite between sessions → `src/memory/persistent-memory.ts`
- [x] Build memory consolidation agent (runs on session end) → `src/memory/memory-consolidator.ts`
- [x] Tag memories by project/file/decision so retrieval is scoped
- [x] Add explicit "forget this" command → `canvas memory forget <id>`
- [x] Surface relevant past decisions at session start → `src/memory/session-bridge.ts`
- [x] Implement memory decay scoring (5%/day importance decay)
- [x] `canvas memory show|forget|search|sessions` CLI commands

#### Priority 4 — Background Agents (Proactive Intelligence)
- [x] Commit watcher agent — analyses each commit for issues → `src/daemon/commit-watcher.ts`
- [x] Dependency monitor — watches package.json, flags CVEs → `src/daemon/dependency-monitor.ts`
- [x] Style drift detector — compares new code against established patterns → `src/daemon/style-drift-detector.ts`
- [x] Dead code tracker — flags symbols not touched in 30+ days → `src/daemon/dead-code-tracker.ts`
- [x] Performance regression spotter — tracks bundle size and complexity trends → `src/daemon/perf-monitor.ts`
- [x] Background agents run as daemon (`canvas daemon start|stop|status`)
- [x] All background findings surface in dashboard → `/api/daemon/findings`, `/api/daemon/status` endpoints

#### Priority 5 — Fine-Tuning Pipeline
- [x] Training data extractor: git log + diffs → Alpaca JSONL → `src/finetune/training-extractor.ts`
- [x] PR review extractor: comments → DPO pairs → `src/finetune/pr-extractor.ts` (needs `GITHUB_TOKEN`)
- [x] LoRA fine-tuning runner (Ollama create workflow) → `src/finetune/finetune-runner.ts`
- [x] Automated eval suite to measure improvement over base model → `src/finetune/eval-suite.ts`
- [x] Scheduled re-tune trigger (weekly check: flags when ≥50 commits since last run) → daemon-worker.ts
- [x] Store generated datasets in `.canvas/training/` (gitignored)
- [x] `canvas finetune extract|run|eval|status` CLI commands

### Prior Audit Fixes
- [x] All 38 security/quality/architecture findings from audit report fixed
- [x] SEC-015 Zod validation on dashboard mutation routes
- [x] ESLint setup with TypeScript rules
- [x] 82 floating-promise errors fixed
- [x] 140/140 tests passing
- [x] Multi-stage Dockerfile, SQLite persistence, JWT auth, SSRF/path-traversal guards
