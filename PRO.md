# Canvas Pro

Canvas CLI is free and open source. **Canvas Pro** is an optional $15/month
subscription that unlocks advanced features for power users and teams.

## Pricing

| Plan | Price | Features |
|------|-------|----------|
| **Free** | $0 | Basic chat, file operations, shell execution, semantic search |
| **Pro** | $15/month | All free features + persistent memory, multi-project context, Nerve Core integration, team sharing, custom agents, advanced analytics |

## Pro Features

### 🧠 Persistent Memory
Cross-session memory that remembers your preferences, project context, coding
conventions, and past decisions. Your AI assistant gets smarter over time
without re-explaining your codebase.

### 📂 Multi-Project Context
Work across multiple projects simultaneously with shared context. Switch
between repos without losing conversation state or project-specific knowledge.

### ⚡ Nerve Core Integration
Connect to a [Nerve Core](https://github.com/canvas-cli/nerve) instance for
centralized agent orchestration, event publishing, and cross-agent
communication.

### 👥 Team Sharing
Share agents, recipes, skills, and configurations with your team. Collaborate
on prompt templates and workflow automations.

### 🤖 Custom Agents
Create and run custom autonomous agents with specialized system prompts, tool
access, and persistent state.

### 📊 Advanced Analytics
Token usage breakdowns, cost tracking, performance insights, and conversation
analytics across all your sessions.

## Subscribing

### Quick start

```bash
canvas pro subscribe
```

This opens a Stripe checkout page in your browser. After completing payment,
your Pro features are activated automatically.

### Prerequisites (for self-hosted billing)

If you're running your own billing backend, set these environment variables:

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID_PRO=price_...
APP_URL=https://your-app.com
```

1. **STRIPE_SECRET_KEY** — Your Stripe API secret key from the
   [Stripe Dashboard](https://dashboard.stripe.com/apikeys).
2. **STRIPE_PRICE_ID_PRO** — Create a recurring product in Stripe priced at
   $15/month and copy its `price_...` ID.
3. **APP_URL** — The URL where users return after checkout
   (e.g. `https://your-app.com`).

### Checking your status

```bash
canvas pro status
```

Shows your current subscription status, billing email, and which features are
available to you.

## Activating a License Key

If you received a license key (e.g. from a team admin or offline purchase),
activate it with:

```bash
canvas pro activate CVPRO-xxxxxxxxxxxxxxxx-xxxxxxxx
```

License keys are validated offline using an embedded checksum, so they work
without an internet connection.

## Canceling

```bash
canvas pro cancel
```

Cancels your subscription and reverts to the free tier. Pro features stop
working immediately.

## Feature Reference

### Free Features
- `basic_chat` — AI chat with any supported model
- `file_ops` — Read, write, and edit files
- `shell_exec` — Execute shell commands
- `semantic_search` — Semantic codebase search with embeddings

### Pro Features
- `persistent_memory` — Cross-session memory and context retention
- `multi_project_context` — Context spanning multiple projects
- `nerve_core_integration` — Nerve Core event bus and orchestration
- `team_sharing` — Share agents, recipes, and configs with a team
- `custom_agents` — Create and run custom autonomous agents
- `advanced_analytics` — Token, cost, and performance analytics

## Programmatic Usage

If you're extending Canvas CLI or writing a plugin, you can check feature
availability in code:

```typescript
import { isProUser, checkFeature, promptUpgrade } from './pro/index.js';

// Check if user is Pro
if (isProUser()) {
  // enable Pro-only behavior
}

// Check a specific feature
if (checkFeature('persistent_memory')) {
  // load persistent memory
} else {
  promptUpgrade('persistent_memory');
}
```

## Configuration

Pro status is stored in `~/.canvas-cli/config.json`:

```json
{
  "pro_status": "active",
  "pro_license_key": "CVPRO-xxxxxxxxxxxxxxxx-xxxxxxxx",
  "pro_email": "user@example.com"
}
```

- **pro_status** — `active`, `pending`, `inactive`, `canceled`, or `free`
- **pro_license_key** — Offline license key (optional)
- **pro_email** — Email associated with the subscription

## FAQ

**Is Canvas CLI still free?**
Yes. The core CLI with chat, file operations, shell execution, and semantic
search is and will remain free. Pro adds advanced features on top.

**Can I use Pro features offline?**
Yes. License keys are validated offline with a checksum. You only need an
internet connection to subscribe or cancel via Stripe.

**Do I need Stripe to use Pro?**
Only to subscribe online. If you have a license key, you can activate it
without any Stripe configuration.

**Can I get a refund?**
Contact support with your subscription email and we'll help you out.

## Support

- 📧 Support: [GitHub Issues](https://github.com/canvas-cli/canvas-cli/issues)
- 📖 Docs: [README](./README.md)
- 💳 Subscribe: `canvas pro subscribe`