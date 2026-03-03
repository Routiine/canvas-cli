# canvas-cli — Build Checklist
> Derived from FORGE Masterlist · Audit date: 2026-03-03
> Project type: Node.js CLI Tool + Express Dashboard API + Nuxt 3 Dashboard UI
> Stack: Node.js 20 + TypeScript + Express 5 + Socket.IO + better-sqlite3 + Nuxt 3 (dashboard/)
> Legend: `[x]` done · `[ ]` todo · `[N/A]` not applicable to this project type

---

## Phase 1 · Architecture & Planning

### Technical Architecture
- [x] Git repository on GitHub (`canvas-cli/canvas-cli`)
- [x] Branch strategy defined (main + feature branches)
- [x] TypeScript strict mode enabled in `tsconfig.json`
- [x] `package.json` defines engines: Node.js >=20.0.0
- [x] `docker-compose.yml` covers CLI + Ollama + optional PostgreSQL + Redis
- [x] `Dockerfile` present for containerized usage
- [x] `k8s/` directory present for Kubernetes deployment
- [ ] Branch protection on `main` — verify GitHub settings (require PR review before merge)
- [ ] Staging environment defined and documented
- [ ] API contract / OpenAPI spec drafted for the dashboard REST API

---

## Phase 3 · Frontend Development (Dashboard — Nuxt 3)

### Project Setup
- [x] Nuxt 3 scaffolded in `dashboard/`
- [x] Nuxt UI component library installed (`@nuxt/ui ^2.11.0`)
- [x] Pinia state management (`@pinia/nuxt`)
- [x] VueUse utilities (`@vueuse/core`, `@vueuse/nuxt`)
- [x] Chart.js + vue-chartjs for analytics views
- [x] Socket.IO client for real-time metrics
- [ ] ESLint + Prettier configured in dashboard — no `eslint.config.*` found in `dashboard/`
- [ ] TypeScript strict mode in dashboard — no `tsconfig.json` found in `dashboard/`
- [ ] `.env.example` for dashboard — document `NUXT_PUBLIC_API_BASE`, websocket URL
- [ ] Husky + lint-staged git hooks — not configured
- [ ] Error boundary / error page (`error.vue`) — not confirmed

### Pages Built
- [x] Dashboard home (`index.vue`)
- [x] Tasks view (`tasks.vue`)
- [x] Stories view (`stories.vue`)
- [x] Agents view (`agents.vue`)
- [x] Workflows view (`workflows.vue`)
- [x] Planning board (`planning.vue`)
- [x] AI assistant view (`assistant.vue`)
- [ ] 404 page — not confirmed
- [ ] Loading / skeleton states — not confirmed

### Accessibility (Dashboard)
- [ ] Semantic HTML used throughout dashboard Vue components — not audited
- [ ] ARIA labels on icon-only buttons — check icon buttons in `dashboard/components/`
- [ ] All form inputs have associated `<label>` elements — check task/story forms
- [ ] Keyboard navigation: all interactive elements reachable without mouse
- [ ] Focus indicator visible on all interactive elements (Nuxt UI default may handle this)
- [ ] Color contrast ratio >= 4.5:1 — not verified
- [ ] `prefers-reduced-motion` respected for animations (framer-motion is a dependency)
- [ ] axe DevTools scan run — 0 critical violations
- [ ] Skip-to-content link present

---

## Phase 4 · Backend Development (Express Dashboard Server)

### Project Setup
- [x] Express 5 server in `src/dashboard/production-server.ts`
- [x] Zod validation schemas for `TaskSchema` and `AgentSchema`
- [x] CORS configured with explicit origin list (`ALLOWED_ORIGINS` env var)
- [x] Body parsing with size limit (`10mb`) via `express.json`
- [x] Rate limiting: 100 req/min per IP (in-memory, class-level `requestCounts`)
- [x] Health check endpoint (`GET /health`)
- [x] Structured error handler middleware (returns `{ error, code, requestId }`)
- [x] Audit logging (in-memory `auditLog` array)
- [x] Metrics collection via real `os.cpus()` / `os.freemem()` (not fake data)
- [x] SQLite database (`~/.canvas/canvas.db`) for daemon findings, routing log, graph nodes
- [x] `unhandledRejection` handler at process level
- [ ] **TODO: Add `helmet` middleware** — production-server.ts has no security headers set.
  Security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.) are absent.
  Install `helmet` and add `this.app.use(helmet())` in `setupMiddleware()`.
- [ ] Rate limiting: current implementation is in-memory only — resets on server restart.
  For production use, consider `express-rate-limit` with a persistent store.
- [ ] Rate limiting missing on dashboard server port binding: binds to `0.0.0.0:3001` —
  ensure firewall rules prevent public access if running on a VPS.
- [ ] CORS wildcard risk: `ALLOWED_ORIGINS` env var is optional with safe defaults,
  but if left unset in production the defaults include `localhost` only — document this.
- [ ] Request body limit `10mb` is generous for a dashboard API — reduce if not needed for file uploads.
- [ ] Several route handlers return `501 Not Implemented` (tasks, stories, workflows, planning,
  analytics, reports) — these are documented stubs. Track completion in a GitHub milestone.
- [ ] `handleResolveDaemonFinding` uses `require('fs')` (CommonJS) inside an ESM module — this
  should be replaced with `import * as fs from 'fs'` (already available at module scope).

### Authentication & Authorization
- [N/A] User registration / login — CLI tool; dashboard is local-only, no multi-user auth
- [N/A] JWT / session management — local dashboard, no remote users
- [ ] Dashboard server has no authentication gate — if exposed beyond localhost, all API
  endpoints are publicly accessible. Add API key check or restrict to loopback only.

### Core API
- [x] RESTful routes defined: agents, tasks, stories, workflows, planning, analytics, reports
- [x] WebSocket (Socket.IO) for real-time metrics broadcast
- [x] Daemon findings CRUD (GET with filters, PUT resolve)
- [x] Graph stats and data flow analysis endpoints
- [x] Routing stats endpoint (reads from SQLite `routing_log` table)
- [ ] Consistent response envelope (`{ data, error, meta }`) — not enforced; some endpoints
  return raw arrays, others return `{ findings, summary }`. Standardize.
- [ ] Pagination on list endpoints — `/api/agents`, `/api/tasks` have no pagination params
- [ ] OpenAPI / route documentation — no spec file found

---

## Phase 5 · CLI Documentation & Content

- [x] `README.md` present
- [x] `CHANGELOG.md` present
- [x] `docs/` directory present
- [x] `recipes/` directory with workflow examples
- [x] `--help` flag outputs command list (fast path in `main()`)
- [ ] `docs/` — verify API reference is up-to-date with current command set
- [ ] Man page or shell completion docs — `canvas completion bash|zsh|fish` exists but not
  documented in README install section
- [ ] `CONTRIBUTING.md` — not found

---

## Phase 8 · Security

### Transport & Headers
- [ ] **CRITICAL: No security headers on Express dashboard server** — `production-server.ts`
  does not set `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, or `Permissions-Policy`. Add `helmet`.
- [ ] HTTPS enforcement — dashboard server listens on plain HTTP (`http.createServer`).
  For production deployments, place behind a reverse proxy (nginx/Caddy) with TLS.
- [N/A] HSTS — not applicable for a local dev tool dashboard; required if deployed publicly

### Application Security (OWASP Top 10)
- [ ] **A03 Injection — SQLite queries in `handleGetDaemonFindings`**: parameterized via
  `db.prepare(...).all(...params)` — correctly uses prepared statements. PASS.
- [ ] **A03 Injection — `handleGetDataFlow`**: accepts `req.query.file` and passes it directly to
  `analyzeFileDataFlow(file)`. Validate that `file` is a safe path (no path traversal `../`).
  **TODO: Add path sanitization / allowlist check on the `file` query param.**
- [ ] **A06 Vulnerable Components**: `npm audit` reports 1 HIGH vulnerability:
  - `minimatch` 10.0.0–10.2.2: ReDoS via multiple non-adjacent GLOBSTAR segments
    (GHSA-7r86-cg39-jmmj, CVSS 7.5) and nested `*()` extglobs (GHSA-23c5-xmqv-rm74)
  - Fix available: `npm audit fix` — run and verify no regressions
- [x] **A09 Logging**: requests, audit events, and errors are logged; no PII sent to logs
- [ ] **A10 SSRF**: CLI includes a `crawl` command and `webBuilder.ts` tool that fetch URLs.
  Validate and restrict user-supplied URLs; block private IP ranges (169.254.x.x, 10.x.x.x, etc.)
- [ ] No secrets / API keys in source code — confirmed by `.gitignore` (verify `.env` is ignored)
- [ ] `CANVAS_SESSION_CONTEXT` env var is set from session memory and truncated to 2000 chars —
  ensure no sensitive content is inadvertently stored in env var space

### Data Protection
- [x] `.env.example` documents all required API keys
- [ ] **`.env.example` is missing several env vars that appear in source code:**
  - `OLLAMA_BASE_URL` (referenced in `ollama-provider.ts`, `ollama-service.ts`, `app-config.ts`)
  - `OLLAMA_TIMEOUT` (referenced in `ollama-provider.ts`, `ollama-service.ts`)
  - `OLLAMA_MODEL` (referenced in `ollama-service.ts`)
  - `CANVAS_PORT` (referenced in `app-config.ts`)
  - `GITHUB_TOKEN` / `GH_TOKEN` (referenced in `github.ts`, `review-pr-command.ts`, `finetune-commands.ts`)
  - `ALLOWED_ORIGINS` (referenced in `dashboard/server.ts` and `production-server.ts`)
  - `NODE_ENV` (referenced in multiple files)
  - `POSTGRES_PASSWORD` (referenced in `docker-compose.yml` for optional `with-db` profile)
  - `GOOGLE_API_KEY` (referenced in `docker-compose.yml`)
  **TODO: Update `.env.example` with all variables above.**
- [ ] `bcryptjs` is listed as a dependency — verify password hashing uses cost factor >= 12
- [ ] `jsonwebtoken` is listed as a dependency — verify tokens are signed with strong secrets
  and have expiry (`expiresIn`) set; confirm secret is not hardcoded
- [ ] `crypto-js` is listed as a dependency — audit usage; prefer Node.js native `crypto`

### Rate Limiting
- [x] Dashboard server has basic rate limiting (100 req/min per IP, in-memory)
- [ ] Rate limiting does not persist across restarts — in-memory only
- [ ] No rate limiting on CLI commands that call external AI APIs — could incur unexpected costs

---

## Phase 9 · Accessibility (Dashboard)

> The dashboard (`dashboard/`) is a Nuxt 3 app with Nuxt UI, framer-motion, @react-three/fiber,
> and three.js. Accessibility audit is required since it has interactive task/agent management UI.

- [ ] Run axe DevTools on all dashboard pages — 0 critical violations target
- [ ] Run WAVE audit on all dashboard pages
- [ ] Verify all buttons have text labels or `aria-label` (especially toolbar/icon buttons)
- [ ] Verify drag-and-drop in planning board (`vue-draggable-next`) is keyboard-accessible
- [ ] Verify three.js / WebGL canvas has an accessible fallback for non-GPU environments
- [ ] Verify `framer-motion` animations respect `prefers-reduced-motion`
- [ ] Form inputs in task creation / story creation have proper labels
- [ ] Socket.IO real-time updates announced via `aria-live` regions where appropriate

---

## Phase 10 · Testing

### Current Test Structure
- [x] Jest configured (`jest.config.js`) with `ts-jest` ESM preset
- [x] `tests/unit/config.test.ts` — config module unit tests
- [x] `tests/unit/types.test.ts` — type utility tests
- [x] `tests/unit/security/secretRedaction.test.ts` — secret redaction tests
- [x] `tests/unit/utils/error-handler.test.ts` — error handler tests
- [x] `tests/unit/agents/` — agent unit tests
- [x] `tests/unit/tools/` — tool unit tests
- [x] `tests/integration/agents.integration.test.ts` — integration tests
- [x] `tests/beta/` — beta feature tests

### Gaps
- [ ] No tests for `production-server.ts` route handlers — the Express dashboard API has 0 test coverage
- [ ] No tests for CLI command handlers in `src/commands/`
- [ ] No tests for `src/dashboard/production-server.ts` rate limiter logic
- [ ] No tests for WebSocket (Socket.IO) event handling
- [ ] Test coverage target not enforced in CI (no coverage threshold in `jest.config.js`)
  **TODO: Add `coverageThreshold: { global: { lines: 60 } }` to `jest.config.js`**
- [ ] No Playwright E2E tests for dashboard UI pages
- [ ] Integration test (`agents.integration.test.ts`) — verify it runs against live Ollama or is properly mocked
- [ ] `test-integrations.js` in root — appears to be an ad-hoc script; convert to proper test suite or remove

### CI
- [ ] No `.github/workflows/` CI pipeline found — tests are not run automatically on push/PR
  **TODO: Add GitHub Actions workflow: install → lint → typecheck → test**

---

## Phase 11 · Infrastructure & Deployment

### Docker
- [x] `Dockerfile` present
- [x] `docker-compose.yml` with profiles (`with-db`, `with-cache`)
- [x] Ollama service with memory limits (16G limit / 8G reservation)
- [x] Named volumes for persistence (`canvas-config`, `ollama-models`, `postgres-data`, `redis-data`)
- [x] SSH and gitconfig mounted read-only into container
- [ ] Dockerfile does not use a non-root user — **TODO: add `USER` directive** to reduce container privilege
- [ ] No `docker-compose.override.yml` pattern for local developer overrides
- [ ] No healthcheck on the `canvas-cli` service itself (only Ollama has one)

### Kubernetes
- [x] `k8s/` directory present
- [ ] Verify `k8s/` manifests are up-to-date with current image tags and env var names

### Build Pipeline
- [x] `npm run build` — `tsc` compiles to `dist/`
- [x] `npm run lint` — ESLint on `src/`
- [x] `npm run typecheck` — `tsc --noEmit`
- [x] `npm run test` — Jest with ESM experimental VM modules
- [ ] Build not gated by tests in CI (no CI configured)
- [ ] `dist/` is in `files` array in `package.json` — correct for npm publish
- [ ] `src/` is also in `files` — consider removing to reduce publish size; only `dist/` is needed

### Dependency Management
- [ ] **HIGH: `minimatch` ReDoS vulnerability** — run `npm audit fix` (fix is available)
- [ ] `npm-check-updates` not configured — periodically run `ncu` to keep deps current
- [ ] `@xenova/transformers ^2.17.2` is a large dependency (ML models) — document why it is
  a prod dependency vs. optional/peer
- [ ] `gpt-3-encoder` is a legacy package — consider replacing with `tiktoken` (already listed)
- [ ] `inquirer ^12.9.4` and `enquirer ^2.4.1` both listed — consolidate to one prompt library

---

## Summary: Priority TODOs

### Critical / Security
1. **Run `npm audit fix`** — resolve `minimatch` ReDoS HIGH vulnerability
2. **Add `helmet` to Express dashboard server** — missing all security headers
3. **Sanitize `file` query param** in `handleGetDataFlow` — path traversal risk
4. **Update `.env.example`** — add 9 undocumented env vars (OLLAMA_BASE_URL, CANVAS_PORT, GITHUB_TOKEN, ALLOWED_ORIGINS, etc.)
5. **Add `USER` directive to Dockerfile** — avoid running as root

### High Priority
6. **Add GitHub Actions CI workflow** — lint + typecheck + test on every push
7. **Add dashboard server tests** — Express routes and rate limiter have 0 test coverage
8. **Add Jest coverage threshold** — enforce minimum coverage to prevent regression
9. **Fix `require('fs')` in `handleResolveDaemonFinding`** — CommonJS require in ESM module
10. **Add ESLint config to `dashboard/`** — Nuxt dashboard has no linting configured

### Medium Priority
11. Add `tsconfig.json` to `dashboard/` for TypeScript strict mode
12. Add GitHub Actions CI workflow for dashboard (`nuxt build`)
13. Document `canvas completion` in README install section
14. Add `CONTRIBUTING.md`
15. Standardize API response envelope across all dashboard endpoints
16. Add `coverageThreshold` to `jest.config.js`
17. Add pagination to list endpoints (`/api/agents`, `/api/tasks`)
18. Remove `src/` from `package.json` `files` array (only `dist/` needed for publish)
19. Consolidate `inquirer` + `enquirer` to a single prompt library
20. Implement stub endpoints (tasks CRUD, stories, workflows, planning, analytics)
