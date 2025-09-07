<template>
  <div class="flex items-center gap-3">
    <!-- Canvas CLI Logo SVG -->
    <div class="relative">
      <svg 
        width="40" 
        height="40" 
        viewBox="0 0 40 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        class="drop-shadow-sm"
      >
        <!-- Canvas Background -->
        <rect 
          x="2" 
          y="2" 
          width="36" 
          height="36" 
          rx="8" 
          fill="url(#canvasGradient)"
          stroke="url(#borderGradient)" 
          stroke-width="2"
        />
        
        <!-- AI Neural Network Pattern -->
        <g opacity="0.9">
          <!-- Nodes -->
          <circle cx="12" cy="12" r="2" fill="white" opacity="0.8"/>
          <circle cx="28" cy="12" r="2" fill="white" opacity="0.8"/>
          <circle cx="12" cy="28" r="2" fill="white" opacity="0.8"/>
          <circle cx="28" cy="28" r="2" fill="white" opacity="0.8"/>
          <circle cx="20" cy="20" r="3" fill="white" opacity="1"/>
          
          <!-- Connections -->
          <path 
            d="M12 12 L20 20 L28 12 M12 28 L20 20 L28 28" 
            stroke="white" 
            stroke-width="1.5" 
            opacity="0.6"
            stroke-linecap="round"
          />
        </g>
        
        <!-- CLI Terminal Icon -->
        <g transform="translate(6, 6)">
          <rect 
            width="28" 
            height="20" 
            rx="3" 
            fill="rgba(0,0,0,0.1)"
          />
          <path 
            d="M10 14 L14 10 L10 6" 
            stroke="white" 
            stroke-width="2" 
            fill="none" 
            stroke-linecap="round" 
            stroke-linejoin="round"
          />
          <line 
            x1="18" 
            y1="14" 
            x2="22" 
            y2="14" 
            stroke="white" 
            stroke-width="2" 
            stroke-linecap="round"
          />
        </g>
        
        <!-- Gradients -->
        <defs>
          <linearGradient id="canvasGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#764ba2;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#f093fb;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="borderGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#4f46e5;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
          </linearGradient>
        </defs>
      </svg>
      
      <!-- Animated pulse for active status -->
      <div 
        v-if="showPulse" 
        class="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg opacity-75 animate-ping"
      ></div>
    </div>
    
    <!-- Brand Text -->
    <div>
      <h1 class="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
        Canvas CLI
      </h1>
      <p class="text-xs text-gray-500 dark:text-gray-400 -mt-0.5">
        AI Development Dashboard
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  showPulse?: boolean
}>()
</script>