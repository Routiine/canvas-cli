<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Agents</h2>
        <p class="text-gray-600 dark:text-gray-400">Monitor and manage AI agents</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <UCard
        v-for="agent in demoAgents"
        :key="agent.id"
        :class="[
          'transition-all hover:shadow-lg',
          getAgentCardClass(agent.status)
        ]"
      >
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <div class="relative">
              <UAvatar size="md" :ui="{ rounded: 'rounded-lg' }">
                <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6" />
              </UAvatar>
              <span 
                class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800"
                :class="getStatusIndicatorClass(agent.status)"
              />
            </div>
            <div>
              <h3 class="font-semibold text-gray-900 dark:text-white">{{ agent.name }}</h3>
              <p class="text-sm text-gray-500">{{ agent.type }}</p>
            </div>
          </div>
          <UBadge :color="getStatusColor(agent.status)" variant="soft">
            {{ agent.status }}
          </UBadge>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-gray-600 dark:text-gray-400">Tasks Completed</span>
            <span class="font-medium">{{ agent.metrics.tasksCompleted }}</span>
          </div>
          
          <div class="flex justify-between text-sm">
            <span class="text-gray-600 dark:text-gray-400">Success Rate</span>
            <span class="font-medium">{{ (agent.metrics.successRate * 100).toFixed(0) }}%</span>
          </div>
          
          <div class="flex justify-between text-sm">
            <span class="text-gray-600 dark:text-gray-400">Avg Response</span>
            <span class="font-medium">{{ agent.metrics.averageTime }}ms</span>
          </div>
        </div>

        <div v-if="agent.currentTask" class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p class="text-sm text-blue-800 dark:text-blue-200">
            <UIcon name="i-heroicons-cog" class="w-4 h-4 inline mr-1 animate-spin" />
            Currently: {{ agent.currentTask }}
          </p>
        </div>

        <template #footer>
          <div class="flex gap-2">
            <UButton size="xs" color="gray" variant="soft" block>
              View Details
            </UButton>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const demoAgents = [
  {
    id: '1',
    name: 'Business Analyst',
    type: 'Planning Agent',
    status: 'active',
    currentTask: 'Analyzing requirements for user auth',
    metrics: {
      tasksCompleted: 45,
      successRate: 0.95,
      averageTime: 3200
    }
  },
  {
    id: '2',
    name: 'Solutions Architect',
    type: 'Design Agent',
    status: 'idle',
    metrics: {
      tasksCompleted: 32,
      successRate: 0.98,
      averageTime: 5400
    }
  },
  {
    id: '3',
    name: 'Developer Agent',
    type: 'Implementation Agent',
    status: 'active',
    currentTask: 'Generating React components',
    metrics: {
      tasksCompleted: 128,
      successRate: 0.92,
      averageTime: 2800
    }
  },
  {
    id: '4',
    name: 'QA Engineer',
    type: 'Testing Agent',
    status: 'idle',
    metrics: {
      tasksCompleted: 67,
      successRate: 0.97,
      averageTime: 4100
    }
  },
  {
    id: '5',
    name: 'DevOps Engineer',
    type: 'Deployment Agent',
    status: 'error',
    metrics: {
      tasksCompleted: 23,
      successRate: 0.89,
      averageTime: 6200
    }
  }
]

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    active: 'green',
    idle: 'gray',
    error: 'red',
    offline: 'orange'
  }
  return colors[status] || 'gray'
}

const getStatusIndicatorClass = (status: string) => {
  const classes: Record<string, string> = {
    active: 'bg-green-500',
    idle: 'bg-gray-400',
    error: 'bg-red-500',
    offline: 'bg-orange-500'
  }
  return classes[status] || 'bg-gray-400'
}

const getAgentCardClass = (status: string) => {
  const classes: Record<string, string> = {
    active: 'ring-1 ring-green-200 dark:ring-green-800',
    error: 'ring-1 ring-red-200 dark:ring-red-800',
    offline: 'opacity-75'
  }
  return classes[status] || ''
}
</script>