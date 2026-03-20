import { Server } from 'socket.io'

export default defineNitroPlugin((nitroApp) => {
  // Nitro exposes the Node.js HTTP server via the 'listen' hook.
  // The plugin itself runs before the server starts listening, so we
  // register a one-time hook that fires once Nitro binds to a port.
  // @ts-expect-error — Nitro's hook types vary by version
  nitroApp.hooks.hook('listen', (_address: unknown, listener: { server: import('http').Server }) => {
    const io = new Server(listener.server, {
      cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST']
      }
    })

    const clients = new Map<string, { id: string; connectedAt: Date; userId: string | null }>()

    io.on('connection', (socket) => {
      console.log('[Canvas] WebSocket connection:', socket.id)

      clients.set(socket.id, { id: socket.id, connectedAt: new Date(), userId: null })

      socket.on('identify', (userId: string) => {
        const client = clients.get(socket.id)
        if (client) client.userId = userId
      })

      socket.on('assistant:message', (data: Record<string, unknown>) => {
        socket.broadcast.emit('assistant:broadcast', {
          ...data,
          userId: clients.get(socket.id)?.userId
        })
        io.emit('assistant:activity', {
          type: 'message',
          userId: clients.get(socket.id)?.userId,
          timestamp: new Date()
        })
      })

      socket.on('assistant:command', async (data: { command: string; args?: unknown }) => {
        socket.emit('assistant:thinking', { command: data.command, status: 'processing' })

        try {
          const result = await processCommand(data.command)
          socket.emit('assistant:response', { command: data.command, result, status: 'completed' })
          socket.emit('assistant:emotion', determineEmotionFromResult(result))
        } catch (error) {
          socket.emit('assistant:response', {
            command: data.command,
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          })
          socket.emit('assistant:emotion', 'confused')
        }
      })

      socket.on('assistant:tool', (tool: { name: string; status: string }) => {
        io.emit('assistant:tool', {
          tool: tool.name,
          status: tool.status,
          userId: clients.get(socket.id)?.userId,
          timestamp: new Date()
        })
      })

      socket.on('assistant:voice', (audioData: unknown) => {
        socket.broadcast.emit('assistant:voice:broadcast', audioData)
      })

      socket.on('disconnect', () => {
        const disconnectedUserId = clients.get(socket.id)?.userId
        clients.delete(socket.id)
        io.emit('assistant:activity', {
          type: 'disconnect',
          userId: disconnectedUserId,
          timestamp: new Date()
        })
      })
    })

    // Attach helpers to nitroApp so server-side routes can broadcast
    // @ts-expect-error — extending NitroApp with runtime properties
    nitroApp.io = io
    // @ts-expect-error
    nitroApp.broadcastSystemMessage = (title: string, description: string, icon: string) => {
      io.emit('assistant:system', { title, description, icon, timestamp: new Date() })
    }
    // @ts-expect-error
    nitroApp.broadcastTaskUpdate = (task: unknown) => { io.emit('task:update', task) }
    // @ts-expect-error
    nitroApp.broadcastAgentUpdate = (agent: unknown) => { io.emit('agent:update', agent) }

    console.log('[Canvas] Socket.IO server attached')
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

type CommandResult = {
  message?: string
  files?: string[]
  time?: string
  passed?: number
  failed?: number
  url?: string
  issues?: number
  suggestions?: number
}

async function processCommand(command: string): Promise<CommandResult> {
  const commands: Record<string, () => CommandResult> = {
    create: () => ({ message: 'Created new component', files: ['component.tsx'] }),
    build: () => ({ message: 'Build completed successfully', time: '2.5s' }),
    test: () => ({ message: 'All tests passed', passed: 42, failed: 0 }),
    deploy: () => ({ message: 'Deployed to production', url: 'https://app.example.com' }),
    analyze: () => ({ message: 'Code analysis complete', issues: 3, suggestions: 7 })
  }

  const handler = commands[command]
  if (!handler) throw new Error(`Unknown command: ${command}`)

  await new Promise((resolve) => setTimeout(resolve, 1000))
  return handler()
}

function determineEmotionFromResult(result: CommandResult): string {
  if ((result.failed ?? 0) > 0 || (result.issues ?? 0) > 5) return 'confused'
  if ((result.passed ?? 0) > 0 || result.message?.includes('success')) return 'happy'
  if ((result.suggestions ?? 0) > 0) return 'thinking'
  return 'neutral'
}
