# TODO

---

## Strategic Roadmap — Making Canvas CLI Extraordinary

### Priority 1 — Hybrid Model Router
The single highest-leverage improvement. Route tasks by complexity rather than always
using one model. Local handles cheap/fast/private work; frontier API handles hard reasoning.

- [ ] Build task complexity classifier (heuristics + lightweight model scoring)
- [ ] Integrate Claude API / OpenAI as fallback providers in `ModelManager`
- [ ] Add cost-per-query tracking and budget controls per session
- [ ] Add `--local-only` flag for fully air-gapped operation
- [ ] Log which tasks were elevated and why (feedback loop for tuning classifier)
- [ ] Expose routing decisions in dashboard metrics

### Priority 2 — Persistent Codebase Semantic Graph
Move from "reads files on request" to "understands the project continuously".
A local model with this context outperforms frontier models operating blind.

- [ ] Build AST-level call graph indexer (TypeScript Compiler API or tree-sitter)
- [ ] Map data flow: trace variables from input boundaries to output/storage
- [ ] Index git history — commit messages + diffs as semantic context per file
- [ ] Build incremental updater (watch mode — update graph on file save)
- [ ] Expose graph as a tool agents can query: `getCallers(fn)`, `getDataFlow(symbol)`
- [ ] Store graph in SQLite alongside existing canvas.db schema
- [ ] Surface "why is this here" context from blame + PR descriptions

### Priority 3 — Session-Surviving Memory
Every conversation currently starts with amnesia. Fix the learning loop.

- [ ] Persist conversation summaries to SQLite between sessions
- [ ] Build memory consolidation agent (runs on session end, extracts durable facts)
- [ ] Tag memories by project/file/decision so retrieval is scoped
- [ ] Add explicit "remember this" and "forget this" commands
- [ ] Surface relevant past decisions at session start ("Last time you worked on
      auth.ts you decided X — context: [summary]")
- [ ] Implement memory decay scoring so stale facts don't pollute context

### Priority 4 — Background Agents (Proactive Intelligence)
Shift from reactive (you ask → it answers) to proactive (it notices → it tells you).

- [ ] Commit watcher agent — analyses each commit for issues before tests run
- [ ] Dependency monitor — watches package.json, flags CVEs and breaking upgrades
- [ ] Style drift detector — compares new code against established patterns
- [ ] Dead code tracker — flags symbols that haven't been called in N days
- [ ] Performance regression spotter — tracks bundle size and complexity trends
- [ ] Background agents should run as optional daemon (`canvas daemon start`)
- [ ] All background findings surface in dashboard and as CLI notifications

### Priority 5 — Fine-Tuning Pipeline
Turn your own codebase history into a model that knows your work.

- [ ] Training data extractor: git log + diffs → instruction/completion pairs
- [ ] PR review extractor: comments + resolutions → preference pairs
- [ ] LoRA fine-tuning runner (Ollama custom model workflow or llama.cpp)
- [ ] Automated eval suite to measure improvement over base model
- [ ] Scheduled re-tune trigger (weekly, or after N new commits)
- [ ] Store generated datasets in `.canvas/training/` (gitignored)

---

## Technical Debt (from Audit)

### QUAL-002 — `any` annotations (~1,100 remaining)
Addressed core files. Remaining spread across 168 files.
- [ ] Enable `@typescript-eslint/no-explicit-any: error` in `eslint.config.mjs`
- [ ] Fix violations incrementally, file by file, starting with public API surfaces

### QUAL-007 — Two command registration systems
`src/commands.ts` (CommandHandler) still used by `ollama/response-generator.ts`
and `src/web/server.ts`. Cannot delete without refactoring those consumers.
- [ ] Migrate `web/server.ts` to use Commander-based command system
- [ ] Migrate `ollama/response-generator.ts` away from CommandHandler dependency
- [ ] Delete `src/commands.ts` once consumers are migrated

---

## Completed

- [x] All 38 security/quality/architecture findings from audit report fixed
- [x] SEC-015 Zod validation on dashboard mutation routes
- [x] ESLint setup with TypeScript rules
- [x] 82 floating-promise errors fixed
- [x] 140/140 tests passing
- [x] Multi-stage Dockerfile, SQLite persistence, JWT auth, SSRF/path-traversal guards
