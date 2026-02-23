# TODO

## Completed from Audit Report (canvas-cli-audit-report.pdf)

All 38 findings addressed. Three items with residual notes:

### QUAL-002 — `any` annotations (partial)
Core files fixed: `orchestrator.ts` (AgentTask, AgentInterface, return types) and
`dashboard/server.ts` (Zod schemas, broadcast methods, TaskInfo, WorkflowState).
~1,100 remaining `any` annotations exist across 168 other files — safe to address
incrementally with `@typescript-eslint/no-explicit-any` rule at `warn` level.

### QUAL-007 — Two command registration systems (deferred)
`src/commands.ts` (CommandHandler) is still actively used by:
- `src/ollama/response-generator.ts`
- `src/web/server.ts`
Cannot be deleted without refactoring those consumers. CommandHandler handles
interactive `/slash` commands in chat mode; `src/commands/index.ts` handles CLI
subcommands — they serve different purposes despite the naming overlap.
Full resolution requires migrating CommandHandler consumers to the new architecture.

### SEC-015 — Dashboard task API validation (FIXED)
Zod schemas added to `server.ts` for POST /api/tasks, /api/stories, /api/workflows,
and PUT /api/planning/board/:itemId/move.
