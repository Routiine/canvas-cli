<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">AI Assistant</h1>
        <p class="text-gray-600 dark:text-gray-400">Your virtual development companion with 3D avatar</p>
      </div>
      <div class="flex gap-2">
        <UButton 
          @click="toggleFullscreen"
          :icon="isFullscreen ? 'i-heroicons-arrows-pointing-in' : 'i-heroicons-arrows-pointing-out'"
          color="gray"
          variant="soft"
        >
          {{ isFullscreen ? 'Exit Fullscreen' : 'Fullscreen' }}
        </UButton>
        <UButton 
          @click="resetAvatar"
          icon="i-heroicons-arrow-path"
          color="gray"
          variant="soft"
        >
          Reset
        </UButton>
      </div>
    </div>

    <!-- Main Content -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- AI Avatar Section -->
      <div class="lg:col-span-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Canvas AI Assistant</h3>
              <div class="flex items-center gap-2">
                <UBadge :color="connectionStatus === 'connected' ? 'green' : 'red'" variant="soft">
                  <UIcon :name="connectionStatus === 'connected' ? 'i-heroicons-wifi' : 'i-heroicons-wifi-slash'" />
                  {{ connectionStatus }}
                </UBadge>
                <UBadge color="blue" variant="soft">
                  <UIcon name="i-heroicons-cpu-chip" />
                  {{ currentModel }}
                </UBadge>
              </div>
            </div>
          </template>

          <!-- 3D Avatar Component -->
          <ClientOnly>
            <AIAvatar ref="avatarRef" />
            <template #fallback>
              <div class="flex items-center justify-center h-96 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div class="text-center">
                  <UIcon name="i-heroicons-cube-transparent" class="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p class="text-gray-500">Loading 3D Avatar...</p>
                </div>
              </div>
            </template>
          </ClientOnly>
        </UCard>
      </div>

      <!-- Chat & Settings Panel -->
      <div class="space-y-6">
        <!-- Chat History -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold">Conversation</h3>
              <UButton 
                @click="clearChat"
                icon="i-heroicons-trash"
                size="xs"
                variant="ghost"
                color="red"
              />
            </div>
          </template>

          <div class="space-y-4 max-h-96 overflow-y-auto">
            <div 
              v-for="(message, index) in chatHistory" 
              :key="index"
              :class="[
                'p-3 rounded-lg',
                message.role === 'user' 
                  ? 'bg-blue-100 dark:bg-blue-900 ml-auto max-w-[80%]' 
                  : 'bg-gray-100 dark:bg-gray-800 mr-auto max-w-[80%]'
              ]"
            >
              <div class="flex items-start gap-2">
                <UAvatar 
                  :src="message.role === 'user' ? '' : ''"
                  :alt="message.role === 'user' ? 'User' : 'AI'"
                  size="xs"
                />
                <div class="flex-1">
                  <p class="text-sm font-medium mb-1">
                    {{ message.role === 'user' ? 'You' : 'Canvas AI' }}
                  </p>
                  <p class="text-sm">{{ message.content }}</p>
                  <p class="text-xs text-gray-500 mt-1">
                    {{ formatTime(message.timestamp) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex gap-2">
              <UInput 
                v-model="messageInput"
                placeholder="Type your message..."
                @keyup.enter="sendMessage"
                :disabled="isProcessing"
              />
              <UButton 
                @click="sendMessage"
                icon="i-heroicons-paper-airplane"
                :loading="isProcessing"
                :disabled="!messageInput.trim()"
              />
              <UButton 
                @click="toggleVoiceInput"
                :icon="isListening ? 'i-heroicons-microphone' : 'i-heroicons-microphone-slash'"
                :color="isListening ? 'red' : 'gray'"
                variant="soft"
              />
            </div>
          </template>
        </UCard>

        <!-- Quick Actions -->
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Quick Actions</h3>
          </template>

          <div class="grid grid-cols-2 gap-2">
            <UButton 
              v-for="action in quickActions"
              :key="action.label"
              @click="executeAction(action.command)"
              :icon="action.icon"
              size="sm"
              variant="soft"
              block
            >
              {{ action.label }}
            </UButton>
          </div>
        </UCard>

        <!-- Personality Settings -->
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Personality</h3>
          </template>

          <div class="space-y-4">
            <UFormGroup label="Assistant Name">
              <UInput v-model="assistantName" />
            </UFormGroup>

            <UFormGroup label="Personality Type">
              <USelect 
                v-model="personalityType"
                :options="personalityOptions"
              />
            </UFormGroup>

            <UFormGroup label="Response Style">
              <URadioGroup 
                v-model="responseStyle"
                :options="responseStyleOptions"
              />
            </UFormGroup>

            <UFormGroup label="Creativity Level">
              <URange 
                v-model="creativityLevel"
                :min="0"
                :max="100"
                :step="10"
              />
              <p class="text-xs text-gray-500 mt-1">{{ creativityLevel }}%</p>
            </UFormGroup>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Feature Showcase -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <UCard v-for="feature in features" :key="feature.title">
        <div class="text-center">
          <UIcon :name="feature.icon" class="w-12 h-12 mx-auto mb-3" :class="feature.color" />
          <h4 class="font-semibold mb-2">{{ feature.title }}</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">{{ feature.description }}</p>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDashboardStore } from '~/stores/dashboard'

const store = useDashboardStore()
const toast = useToast()
const { $socket } = useNuxtApp()

// State
const avatarRef = ref()
const isFullscreen = ref(false)
const connectionStatus = ref('connected')
const currentModel = ref('GPT-4')
const chatHistory = ref<Array<{role: string, content: string, timestamp: Date}>>([])
const messageInput = ref('')
const isProcessing = ref(false)
const isListening = ref(false)
const assistantName = ref('Canvas')
const personalityType = ref('professional')
const responseStyle = ref('balanced')
const creativityLevel = ref(70)

// Quick actions
const quickActions = [
  { label: 'Code Review', command: 'review', icon: 'i-heroicons-magnifying-glass' },
  { label: 'Debug', command: 'debug', icon: 'i-heroicons-bug-ant' },
  { label: 'Optimize', command: 'optimize', icon: 'i-heroicons-bolt' },
  { label: 'Document', command: 'document', icon: 'i-heroicons-document-text' },
  { label: 'Test', command: 'test', icon: 'i-heroicons-beaker' },
  { label: 'Deploy', command: 'deploy', icon: 'i-heroicons-rocket-launch' }
]

// Personality options
const personalityOptions = [
  { label: 'Professional', value: 'professional' },
  { label: 'Friendly', value: 'friendly' },
  { label: 'Casual', value: 'casual' },
  { label: 'Technical', value: 'technical' },
  { label: 'Creative', value: 'creative' }
]

const responseStyleOptions = [
  { label: 'Concise', value: 'concise' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'Detailed', value: 'detailed' }
]

// Features
const features = [
  {
    title: '3D Avatar',
    description: 'Interactive 3D assistant with emotions and animations',
    icon: 'i-heroicons-cube-transparent',
    color: 'text-blue-500'
  },
  {
    title: 'Voice Interaction',
    description: 'Natural voice input and text-to-speech responses',
    icon: 'i-heroicons-microphone',
    color: 'text-green-500'
  },
  {
    title: 'AI-Powered',
    description: 'Advanced language model for intelligent conversations',
    icon: 'i-heroicons-sparkles',
    color: 'text-purple-500'
  }
]

// Methods
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
  if (isFullscreen.value) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

const resetAvatar = () => {
  if (avatarRef.value) {
    avatarRef.value.reset()
  }
  toast.add({
    title: 'Avatar reset successfully',
    icon: 'i-heroicons-check'
  })
}

const clearChat = () => {
  chatHistory.value = []
  toast.add({
    title: 'Chat history cleared',
    icon: 'i-heroicons-trash'
  })
}

const sendMessage = async () => {
  if (!messageInput.value.trim() || isProcessing.value) return
  
  const userMessage = {
    role: 'user',
    content: messageInput.value,
    timestamp: new Date()
  }
  
  chatHistory.value.push(userMessage)
  const message = messageInput.value
  messageInput.value = ''
  isProcessing.value = true
  
  try {
    // Send message to backend API
    const { data } = await $fetch('/api/assistant/chat', {
      method: 'POST',
      body: {
        message,
        context: {
          previousTopic: chatHistory.value.length > 0 ? chatHistory.value[chatHistory.value.length - 1].content.substring(0, 50) : null,
          personality: personalityType.value,
          responseStyle: responseStyle.value,
          creativityLevel: creativityLevel.value
        },
        model: currentModel.value
      }
    })
    
    if (data.success) {
      const aiResponse = {
        role: 'assistant',
        content: data.response.content,
        timestamp: new Date(data.response.timestamp),
        tools: data.response.tools
      }
      
      chatHistory.value.push(aiResponse)
      
      // Update avatar emotion
      if (avatarRef.value) {
        avatarRef.value.setEmotion(data.response.emotion)
        avatarRef.value.speak(data.response.content)
      }
      
      // Emit WebSocket event for real-time updates
      if ($socket) {
        $socket.emit('assistant:message', {
          message: aiResponse,
          emotion: data.response.emotion
        })
      }
    } else {
      throw new Error(data.error || 'Failed to get response')
    }
  } catch (error) {
    toast.add({
      title: 'Error sending message',
      description: error.message,
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
    
    // Show error in chat
    chatHistory.value.push({
      role: 'system',
      content: `Error: ${error.message}`,
      timestamp: new Date()
    })
  } finally {
    isProcessing.value = false
  }
}

const toggleVoiceInput = () => {
  isListening.value = !isListening.value
  
  if (isListening.value && 'webkitSpeechRecognition' in window) {
    const recognition = new (window as any).webkitSpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      messageInput.value = transcript
      isListening.value = false
    }
    
    recognition.onerror = () => {
      isListening.value = false
      toast.add({
        title: 'Voice input error',
        color: 'red',
        icon: 'i-heroicons-exclamation-triangle'
      })
    }
    
    recognition.start()
  } else {
    toast.add({
      title: 'Voice input not supported',
      description: 'Your browser does not support voice input',
      color: 'orange',
      icon: 'i-heroicons-exclamation-triangle'
    })
  }
}

const executeAction = async (command: string) => {
  const actionMessages: Record<string, string> = {
    review: "Please review my code for best practices and improvements",
    debug: "Help me debug and fix issues in my code",
    optimize: "Optimize my code for better performance",
    document: "Create comprehensive documentation for my code",
    test: "Write tests for my code",
    deploy: "Guide me through the deployment process"
  }
  
  // Use the actual message for the command
  messageInput.value = actionMessages[command] || `Execute ${command} command`
  await sendMessage()
}

const generateAIResponse = (input: string): string => {
  const responses = [
    `I understand you're asking about "${input}". Let me help you with that!`,
    `Great question! Here's what I think about "${input}"...`,
    `Based on my analysis of "${input}", I recommend...`,
    `Let me process that request: "${input}". Here's my suggestion...`
  ]
  
  return responses[Math.floor(Math.random() * responses.length)]
}

const formatTime = (date: Date): string => {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Initialize
onMounted(() => {
  // Welcome message
  chatHistory.value.push({
    role: 'assistant',
    content: `Hello! I'm ${assistantName.value}, your AI development assistant. How can I help you today?`,
    timestamp: new Date()
  })
  
  // Setup WebSocket listeners
  if ($socket) {
    // Listen for real-time updates from other clients
    $socket.on('assistant:broadcast', (data) => {
      if (data.userId !== store.userId) {
        chatHistory.value.push(data.message)
      }
    })
    
    // Listen for system updates
    $socket.on('assistant:system', (data) => {
      toast.add({
        title: data.title,
        description: data.description,
        icon: data.icon || 'i-heroicons-information-circle'
      })
    })
    
    // Listen for connection status
    $socket.on('connect', () => {
      connectionStatus.value = 'connected'
    })
    
    $socket.on('disconnect', () => {
      connectionStatus.value = 'disconnected'
    })
  }
})

// Cleanup
onUnmounted(() => {
  if ($socket) {
    $socket.off('assistant:broadcast')
    $socket.off('assistant:system')
    $socket.off('connect')
    $socket.off('disconnect')
  }
})
</script>