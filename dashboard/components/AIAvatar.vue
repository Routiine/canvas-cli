<template>
  <div class="ai-avatar-container">
    <div ref="canvasContainer" class="canvas-wrapper"></div>
    
    <!-- Controls Panel -->
    <div class="controls-panel">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">AI Assistant Controls</h3>
        </template>
        
        <div class="space-y-4">
          <!-- Emotion Controls -->
          <div>
            <label class="block text-sm font-medium mb-2">Emotion</label>
            <UButtonGroup size="sm">
              <UButton
                v-for="emotion in emotions"
                :key="emotion"
                @click="setEmotion(emotion)"
                :variant="currentEmotion === emotion ? 'solid' : 'outline'"
                :color="getEmotionColor(emotion)"
              >
                {{ emotion }}
              </UButton>
            </UButtonGroup>
          </div>

          <!-- Animation Controls -->
          <div>
            <label class="block text-sm font-medium mb-2">Animation</label>
            <USelect 
              v-model="currentAnimation"
              :options="animationOptions"
              @change="playAnimation"
            />
          </div>

          <!-- Voice Settings -->
          <div>
            <label class="block text-sm font-medium mb-2">Voice</label>
            <div class="flex gap-2">
              <UButton
                @click="toggleVoice"
                :icon="voiceEnabled ? 'i-heroicons-microphone' : 'i-heroicons-microphone-slash'"
                :color="voiceEnabled ? 'green' : 'gray'"
              >
                {{ voiceEnabled ? 'Voice On' : 'Voice Off' }}
              </UButton>
              <USelect 
                v-model="voiceType"
                :options="voiceOptions"
                :disabled="!voiceEnabled"
              />
            </div>
          </div>

          <!-- Chat Input -->
          <div>
            <label class="block text-sm font-medium mb-2">Chat with Assistant</label>
            <div class="flex gap-2">
              <UInput 
                v-model="chatInput"
                placeholder="Type your message..."
                @keyup.enter="sendMessage"
              />
              <UButton 
                @click="sendMessage"
                icon="i-heroicons-paper-airplane"
                :disabled="!chatInput.trim()"
              >
                Send
              </UButton>
            </div>
          </div>

          <!-- Response Display -->
          <div v-if="assistantResponse" class="mt-4">
            <UAlert
              :title="assistantName"
              :description="assistantResponse"
              icon="i-heroicons-chat-bubble-left-ellipsis"
              color="primary"
            />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

// Reactive state
const canvasContainer = ref<HTMLElement>()
const currentEmotion = ref('happy')
const currentAnimation = ref('idle')
const voiceEnabled = ref(false)
const voiceType = ref('female')
const chatInput = ref('')
const assistantResponse = ref('')
const assistantName = ref('Canvas AI Assistant')

// Three.js variables
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let avatar: THREE.Object3D
let mixer: THREE.AnimationMixer
let clock: THREE.Clock
let animations: Map<string, THREE.AnimationClip> = new Map()

// Configuration
const emotions = ['happy', 'neutral', 'thinking', 'excited', 'confused']
const animationOptions = [
  { label: 'Idle', value: 'idle' },
  { label: 'Wave', value: 'wave' },
  { label: 'Talk', value: 'talk' },
  { label: 'Think', value: 'think' },
  { label: 'Nod', value: 'nod' }
]
const voiceOptions = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Robotic', value: 'robotic' }
]

// Initialize Three.js scene
const initThreeJS = () => {
  if (!canvasContainer.value) return

  // Scene setup
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111827)
  scene.fog = new THREE.Fog(0x111827, 10, 50)

  // Camera setup
  camera = new THREE.PerspectiveCamera(
    45,
    canvasContainer.value.clientWidth / canvasContainer.value.clientHeight,
    0.1,
    1000
  )
  camera.position.set(0, 1.5, 5)

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(canvasContainer.value.clientWidth, canvasContainer.value.clientHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  canvasContainer.value.appendChild(renderer.domElement)

  // Controls
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 3
  controls.maxDistance = 10
  controls.maxPolarAngle = Math.PI / 2

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(5, 10, 5)
  directionalLight.castShadow = true
  directionalLight.shadow.camera.far = 50
  directionalLight.shadow.mapSize.set(2048, 2048)
  scene.add(directionalLight)

  const pointLight = new THREE.PointLight(0x4f46e5, 0.5)
  pointLight.position.set(-5, 5, 0)
  scene.add(pointLight)

  // Add a simple avatar placeholder (sphere with face)
  createSimpleAvatar()

  // Clock for animations
  clock = new THREE.Clock()

  // Start animation loop
  animate()

  // Handle window resize
  window.addEventListener('resize', handleResize)
}

// Create a simple avatar using primitives
const createSimpleAvatar = () => {
  const avatarGroup = new THREE.Group()

  // Body
  const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1, 4, 8)
  const bodyMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x4f46e5,
    emissive: 0x4f46e5,
    emissiveIntensity: 0.1
  })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.position.y = 0
  avatarGroup.add(body)

  // Head
  const headGeometry = new THREE.SphereGeometry(0.4, 32, 32)
  const headMaterial = new THREE.MeshPhongMaterial({ 
    color: 0xfdbcb4,
    emissive: 0xfdbcb4,
    emissiveIntensity: 0.05
  })
  const head = new THREE.Mesh(headGeometry, headMaterial)
  head.position.y = 1.2
  avatarGroup.add(head)

  // Eyes
  const eyeGeometry = new THREE.SphereGeometry(0.05, 16, 16)
  const eyeMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 })
  
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
  leftEye.position.set(-0.15, 1.25, 0.35)
  avatarGroup.add(leftEye)

  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial)
  rightEye.position.set(0.15, 1.25, 0.35)
  avatarGroup.add(rightEye)

  // Mouth (simple curve)
  const curve = new THREE.EllipseCurve(
    0, 0,
    0.15, 0.1,
    0, Math.PI,
    false,
    0
  )
  const points = curve.getPoints(50)
  const mouthGeometry = new THREE.BufferGeometry().setFromPoints(points)
  const mouthMaterial = new THREE.LineBasicMaterial({ color: 0x000000 })
  const mouth = new THREE.Line(mouthGeometry, mouthMaterial)
  mouth.position.set(0, 1.1, 0.38)
  mouth.rotation.x = -Math.PI / 6
  avatarGroup.add(mouth)

  // Add glow effect
  const glowGeometry = new THREE.SphereGeometry(1.5, 32, 32)
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x4f46e5,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide
  })
  const glow = new THREE.Mesh(glowGeometry, glowMaterial)
  avatarGroup.add(glow)

  avatarGroup.position.y = -0.5
  scene.add(avatarGroup)
  avatar = avatarGroup

  // Add idle animation
  animateIdle()
}

// Idle animation
const animateIdle = () => {
  if (!avatar) return
  
  const time = clock.getElapsedTime()
  avatar.rotation.y = Math.sin(time * 0.5) * 0.1
  avatar.position.y = -0.5 + Math.sin(time * 2) * 0.05
}

// Animation loop
const animate = () => {
  requestAnimationFrame(animate)
  
  if (controls) controls.update()
  if (avatar) animateIdle()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

// Handle window resize
const handleResize = () => {
  if (!canvasContainer.value || !camera || !renderer) return
  
  camera.aspect = canvasContainer.value.clientWidth / canvasContainer.value.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(canvasContainer.value.clientWidth, canvasContainer.value.clientHeight)
}

// Set avatar emotion
const setEmotion = (emotion: string) => {
  currentEmotion.value = emotion
  
  // Update avatar appearance based on emotion
  if (avatar) {
    const head = avatar.children.find(child => child.position.y === 1.2) as THREE.Mesh
    if (head && head.material) {
      const material = head.material as THREE.MeshPhongMaterial
      switch (emotion) {
        case 'happy':
          material.emissive = new THREE.Color(0xffff00)
          material.emissiveIntensity = 0.2
          break
        case 'excited':
          material.emissive = new THREE.Color(0xff00ff)
          material.emissiveIntensity = 0.3
          break
        case 'thinking':
          material.emissive = new THREE.Color(0x00ffff)
          material.emissiveIntensity = 0.15
          break
        case 'confused':
          material.emissive = new THREE.Color(0xff8800)
          material.emissiveIntensity = 0.1
          break
        default:
          material.emissive = new THREE.Color(0xfdbcb4)
          material.emissiveIntensity = 0.05
      }
    }
  }
}

// Play animation
const playAnimation = () => {
  if (!avatar) return
  
  // Simple animation based on type
  switch (currentAnimation.value) {
    case 'wave':
      // Rotate avatar for wave
      avatar.rotation.z = Math.sin(clock.getElapsedTime() * 5) * 0.3
      break
    case 'talk':
      // Bobbing motion for talking
      avatar.position.y = -0.5 + Math.sin(clock.getElapsedTime() * 10) * 0.1
      break
    case 'think':
      // Slow rotation for thinking
      avatar.rotation.y += 0.01
      break
    case 'nod':
      // Nodding motion
      avatar.rotation.x = Math.sin(clock.getElapsedTime() * 4) * 0.2
      break
  }
}

// Toggle voice
const toggleVoice = () => {
  voiceEnabled.value = !voiceEnabled.value
  
  if (voiceEnabled.value && 'speechSynthesis' in window) {
    // Enable text-to-speech
    const utterance = new SpeechSynthesisUtterance('Voice assistant activated')
    utterance.voice = speechSynthesis.getVoices().find(voice => 
      voice.name.includes(voiceType.value === 'female' ? 'Female' : 'Male')
    ) || null
    speechSynthesis.speak(utterance)
  }
}

// Send message to assistant
const sendMessage = async () => {
  if (!chatInput.value.trim()) return
  
  const message = chatInput.value
  chatInput.value = ''
  
  // Simulate assistant thinking
  setEmotion('thinking')
  currentAnimation.value = 'think'
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1500))
  
  // Generate response
  assistantResponse.value = generateResponse(message)
  
  // Update emotion based on response
  setEmotion('happy')
  currentAnimation.value = 'talk'
  
  // Speak response if voice is enabled
  if (voiceEnabled.value && 'speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(assistantResponse.value)
    utterance.voice = speechSynthesis.getVoices().find(voice => 
      voice.name.includes(voiceType.value === 'female' ? 'Female' : 'Male')
    ) || null
    speechSynthesis.speak(utterance)
  }
}

// Generate response based on input
const generateResponse = (input: string): string => {
  const responses = {
    hello: "Hello! I'm your Canvas AI assistant. How can I help you today?",
    help: "I can help you with coding, planning, and managing your projects. Just ask!",
    status: "All systems are operational. Your dashboard is running smoothly.",
    code: "I'd be happy to help you with coding! What language or framework are you working with?",
    default: `I understand you said: "${input}". Let me help you with that!`
  }
  
  const lowerInput = input.toLowerCase()
  for (const [key, response] of Object.entries(responses)) {
    if (lowerInput.includes(key)) {
      return response
    }
  }
  
  return responses.default
}

// Get emotion color
const getEmotionColor = (emotion: string): string => {
  const colors: Record<string, string> = {
    happy: 'green',
    neutral: 'gray',
    thinking: 'blue',
    excited: 'purple',
    confused: 'orange'
  }
  return colors[emotion] || 'gray'
}

// Expose methods for parent component
defineExpose({
  setEmotion,
  speak: (text: string) => {
    // Trigger talk animation
    currentAnimation.value = 'talk'
    playAnimation()
    
    // Use text-to-speech if voice is enabled
    if (voiceEnabled.value && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = speechSynthesis.getVoices().find(voice => 
        voice.name.includes(voiceType.value === 'female' ? 'Female' : 'Male')
      ) || null
      speechSynthesis.speak(utterance)
      
      // Reset animation when speech ends
      utterance.onend = () => {
        currentAnimation.value = 'idle'
      }
    }
  },
  reset: () => {
    // Reset avatar to default state
    currentEmotion.value = 'happy'
    currentAnimation.value = 'idle'
    if (avatar) {
      avatar.rotation.set(0, 0, 0)
      avatar.position.set(0, -0.5, 0)
    }
  }
})

// Lifecycle hooks
onMounted(() => {
  initThreeJS()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (renderer) {
    renderer.dispose()
  }
})
</script>

<style scoped>
.ai-avatar-container {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 1rem;
  height: 600px;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 0.5rem;
  overflow: hidden;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.controls-panel {
  height: 100%;
  overflow-y: auto;
}

@media (max-width: 1024px) {
  .ai-avatar-container {
    grid-template-columns: 1fr;
    grid-template-rows: 400px auto;
  }
}
</style>