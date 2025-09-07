import { io } from 'socket.io-client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  
  // Create socket connection
  const socket = io(config.public.socketUrl || 'http://localhost:3001', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  })
  
  // Connection event handlers
  socket.on('connect', () => {
    console.log('🔌 WebSocket connected:', socket.id)
  })
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 WebSocket disconnected:', reason)
  })
  
  socket.on('connect_error', (error) => {
    console.error('🔌 WebSocket connection error:', error.message)
  })
  
  // AI Assistant specific events
  socket.on('assistant:thinking', (data) => {
    console.log('🤔 Assistant is thinking...', data)
  })
  
  socket.on('assistant:response', (data) => {
    console.log('💬 Assistant response:', data)
  })
  
  socket.on('assistant:emotion', (emotion) => {
    console.log('😊 Assistant emotion:', emotion)
  })
  
  socket.on('assistant:tool', (tool) => {
    console.log('🔧 Assistant using tool:', tool)
  })
  
  // Provide socket to the app
  return {
    provide: {
      socket
    }
  }
})