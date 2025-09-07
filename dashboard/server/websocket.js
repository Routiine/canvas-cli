import { Server } from 'socket.io'
import { createServer } from 'http'

let io = null

export function initWebSocket(app) {
  const httpServer = createServer(app)
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3002',
      methods: ['GET', 'POST']
    }
  })

  // Track connected clients
  const clients = new Map()

  io.on('connection', (socket) => {
    console.log('🔌 New WebSocket connection:', socket.id)
    
    // Store client info
    clients.set(socket.id, {
      id: socket.id,
      connectedAt: new Date(),
      userId: null
    })

    // Handle user identification
    socket.on('identify', (userId) => {
      const client = clients.get(socket.id)
      if (client) {
        client.userId = userId
        console.log(`👤 User ${userId} identified on socket ${socket.id}`)
      }
    })

    // Handle assistant messages
    socket.on('assistant:message', (data) => {
      console.log('💬 Assistant message:', data)
      
      // Broadcast to other clients
      socket.broadcast.emit('assistant:broadcast', {
        ...data,
        userId: clients.get(socket.id)?.userId
      })
      
      // Log activity
      io.emit('assistant:activity', {
        type: 'message',
        userId: clients.get(socket.id)?.userId,
        timestamp: new Date()
      })
    })

    // Handle assistant commands
    socket.on('assistant:command', async (data) => {
      console.log('🎮 Assistant command:', data)
      
      // Emit thinking state
      socket.emit('assistant:thinking', {
        command: data.command,
        status: 'processing'
      })
      
      try {
        // Process command (integrate with Canvas CLI)
        const result = await processCommand(data.command, data.args)
        
        // Send result back
        socket.emit('assistant:response', {
          command: data.command,
          result: result,
          status: 'completed'
        })
        
        // Update emotion based on result
        socket.emit('assistant:emotion', determineEmotionFromResult(result))
        
      } catch (error) {
        socket.emit('assistant:response', {
          command: data.command,
          error: error.message,
          status: 'failed'
        })
        
        socket.emit('assistant:emotion', 'confused')
      }
    })

    // Handle tool usage
    socket.on('assistant:tool', (tool) => {
      console.log('🔧 Tool usage:', tool)
      
      // Broadcast tool usage to all clients
      io.emit('assistant:tool', {
        tool: tool.name,
        status: tool.status,
        userId: clients.get(socket.id)?.userId,
        timestamp: new Date()
      })
    })

    // Handle voice data
    socket.on('assistant:voice', (audioData) => {
      console.log('🎤 Voice data received')
      
      // Process voice data (could integrate with speech recognition)
      // For now, just broadcast to other clients
      socket.broadcast.emit('assistant:voice:broadcast', audioData)
    })

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected:', socket.id)
      clients.delete(socket.id)
      
      // Notify other clients
      io.emit('assistant:activity', {
        type: 'disconnect',
        userId: clients.get(socket.id)?.userId,
        timestamp: new Date()
      })
    })
  })

  // System broadcast functions
  const broadcastSystemMessage = (title, description, icon) => {
    io.emit('assistant:system', {
      title,
      description,
      icon,
      timestamp: new Date()
    })
  }

  const broadcastTaskUpdate = (task) => {
    io.emit('task:update', task)
  }

  const broadcastAgentUpdate = (agent) => {
    io.emit('agent:update', agent)
  }

  return {
    io,
    broadcastSystemMessage,
    broadcastTaskUpdate,
    broadcastAgentUpdate
  }
}

// Helper function to process commands
async function processCommand(command, args) {
  // This would integrate with the actual Canvas CLI
  const commands = {
    'create': () => ({ message: 'Created new component', files: ['component.tsx'] }),
    'build': () => ({ message: 'Build completed successfully', time: '2.5s' }),
    'test': () => ({ message: 'All tests passed', passed: 42, failed: 0 }),
    'deploy': () => ({ message: 'Deployed to production', url: 'https://app.example.com' }),
    'analyze': () => ({ message: 'Code analysis complete', issues: 3, suggestions: 7 })
  }
  
  const handler = commands[command]
  if (handler) {
    // Simulate async processing
    await new Promise(resolve => setTimeout(resolve, 1000))
    return handler()
  }
  
  throw new Error(`Unknown command: ${command}`)
}

// Helper function to determine emotion from result
function determineEmotionFromResult(result) {
  if (result.failed > 0 || result.issues > 5) {
    return 'confused'
  }
  if (result.passed > 0 || result.message?.includes('success')) {
    return 'happy'
  }
  if (result.suggestions > 0) {
    return 'thinking'
  }
  return 'neutral'
}

export { io }