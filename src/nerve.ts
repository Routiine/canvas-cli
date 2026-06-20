/**
 * canvas-cli → Nerve Core Connector
 *
 * Publishes canvas-cli events to the central Nerve Core event bus.
 */

const NERVE_API = process.env.NERVE_API || 'http://localhost:4000'
const NERVE_ENABLED = process.env.NERVE_ENABLED !== 'false'

const SOURCE = 'canvas-cli'
const CHANNEL = 'events.agents'

async function publish(type: string, payload: Record<string, unknown>): Promise<void> {
  if (!NERVE_ENABLED) return
  try {
    await fetch(`${NERVE_API}/api/events/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: CHANNEL, type, source: SOURCE, payload }),
    })
  } catch (err) {
    console.warn(`[nerve] publish failed: ${err}`)
  }
}

async function recordMetric(metric: string, value: number, period: string = 'daily'): Promise<void> {
  if (!NERVE_ENABLED) return
  try {
    const res = await fetch(`${NERVE_API}/api/units`)
    const units: Array<{ id: string; name: string }> = await res.json()
    const unit = units.find((u) => u.name === SOURCE)
    if (!unit) return
    await fetch(`${NERVE_API}/api/units/${unit.id}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric, value, period }),
    })
  } catch (err) {
    console.warn(`[nerve] recordMetric failed: ${err}`)
  }
}

async function logDecision(decision: {
  type: string
  title: string
  description: string
  rationale?: Record<string, unknown>
}): Promise<void> {
  if (!NERVE_ENABLED) return
  try {
    await fetch(`${NERVE_API}/api/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: SOURCE, ...decision }),
    })
  } catch (err) {
    console.warn(`[nerve] logDecision failed: ${err}`)
  }
}

async function registerAgents(): Promise<void> {
  if (!NERVE_ENABLED) return
  try {
    await fetch(`${NERVE_API}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'canvas-cli-code-agent',
        type: 'code',
        businessUnit: SOURCE,
        capabilities: ["code_analysis", "refactoring", "debugging", "semantic_search", "file_editing"],
        subscribesTo: ["events.os", "events.ops"],
        provides: [CHANNEL],
        config: {},
      }),
    })
  } catch (err) {
    console.warn(`[nerve] registerAgents failed: ${err}`)
  }
}

export const nerve = {
  publish,
  recordMetric,
  logDecision,
  registerAgents,
  isEnabled: NERVE_ENABLED,
}
