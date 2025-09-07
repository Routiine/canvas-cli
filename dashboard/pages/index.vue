<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Overview</h2>
        <p class="text-gray-600 dark:text-gray-400">System performance and real-time metrics</p>
      </div>
      <UButton icon="i-heroicons-arrow-path" color="gray" variant="soft" @click="refresh">
        Refresh
      </UButton>
    </div>

    <!-- Metrics Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <UCard v-for="metric in metricsCards" :key="metric.label">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-600 dark:text-gray-400">{{ metric.label }}</p>
            <p class="text-2xl font-bold mt-1">{{ metric.value }}</p>
          </div>
          <div :class="metric.iconClass">
            <UIcon :name="metric.icon" class="w-8 h-8" />
          </div>
        </div>
        <div class="mt-4">
          <UProgress :value="metric.progress" :color="metric.color" />
        </div>
      </UCard>
    </div>

    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Performance Chart -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">System Performance</h3>
        </template>
        <div class="h-64">
          <PerformanceChart :metrics="store.metrics" />
        </div>
      </UCard>

      <!-- Task Distribution -->
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Task Distribution</h3>
        </template>
        <div class="h-64">
          <TaskDistributionChart :tasks="store.tasks" />
        </div>
      </UCard>
    </div>

    <!-- Activity Feed & Agent Status -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Recent Activity -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Recent Activity</h3>
            <UBadge color="primary" variant="soft">Live</UBadge>
          </div>
        </template>
        
        <div class="space-y-3 max-h-96 overflow-y-auto">
          <div v-for="task in recentTasks" :key="task.id" class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <UBadge :color="getStatusColor(task.status)" variant="subtle">
              {{ task.status }}
            </UBadge>
            <div class="flex-1">
              <p class="font-medium">{{ task.type }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ formatTime(task.createdAt) }}
              </p>
            </div>
            <UButton size="xs" color="gray" variant="ghost" icon="i-heroicons-arrow-right" />
          </div>
        </div>
      </UCard>

      <!-- Agent Status -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">Agent Status</h3>
            <UBadge color="green" variant="soft">
              {{ store.activeAgents.length }} Active
            </UBadge>
          </div>
        </template>
        
        <div class="space-y-3 max-h-96 overflow-y-auto">
          <div v-for="agent in store.agents" :key="agent.id" class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <div class="relative">
              <UAvatar :alt="agent.name" :ui="{ rounded: 'rounded-lg' }">
                <UIcon name="i-heroicons-cpu-chip" class="w-5 h-5" />
              </UAvatar>
              <span 
                class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900"
                :class="getAgentStatusClass(agent.status)"
              />
            </div>
            <div class="flex-1">
              <p class="font-medium">{{ agent.name }}</p>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ agent.metrics.tasksCompleted }} tasks • {{ (agent.metrics.successRate * 100).toFixed(0) }}% success
              </p>
            </div>
            <UTooltip v-if="agent.currentTask" text="Currently working">
              <UIcon name="i-heroicons-cog" class="w-5 h-5 text-blue-500 animate-spin" />
            </UTooltip>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Queue Status -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Queue Status</h3>
          <div class="flex items-center gap-4">
            <UBadge color="blue" variant="soft">
              {{ store.metrics.queueDepth }} items
            </UBadge>
            <UBadge color="green" variant="soft">
              {{ store.metrics.tasksProcessed }} processed
            </UBadge>
          </div>
        </div>
      </template>
      
      <div class="grid grid-cols-4 gap-4">
        <div class="text-center p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
          <p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
            {{ store.pendingTasks.length }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Pending</p>
        </div>
        <div class="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <p class="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {{ store.runningTasks.length }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Running</p>
        </div>
        <div class="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
          <p class="text-2xl font-bold text-green-600 dark:text-green-400">
            {{ store.completedTasks.length }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Completed</p>
        </div>
        <div class="text-center p-4 rounded-lg bg-red-50 dark:bg-red-900/20">
          <p class="text-2xl font-bold text-red-600 dark:text-red-400">
            {{ store.failedTasks.length }}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Failed</p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useDashboardStore } from '~/stores/dashboard'

const store = useDashboardStore()

onMounted(() => {
  store.initializeSocket()
})

onUnmounted(() => {
  store.disconnectSocket()
})

const metricsCards = computed(() => [
  {
    label: 'CPU Usage',
    value: `${(store.metrics.cpu * 100).toFixed(1)}%`,
    icon: 'i-heroicons-cpu-chip',
    iconClass: 'text-blue-500',
    progress: store.metrics.cpu * 100,
    color: 'primary'
  },
  {
    label: 'Memory Usage',
    value: `${(store.metrics.memory * 100).toFixed(1)}%`,
    icon: 'i-heroicons-circle-stack',
    iconClass: 'text-green-500',
    progress: store.metrics.memory * 100,
    color: 'green'
  },
  {
    label: 'Active Agents',
    value: store.metrics.activeAgents,
    icon: 'i-heroicons-users',
    iconClass: 'text-purple-500',
    progress: (store.metrics.activeAgents / store.agents.length) * 100,
    color: 'purple'
  },
  {
    label: 'Success Rate',
    value: `${(store.metrics.successRate * 100).toFixed(1)}%`,
    icon: 'i-heroicons-check-circle',
    iconClass: 'text-emerald-500',
    progress: store.metrics.successRate * 100,
    color: 'emerald'
  }
])

const recentTasks = computed(() => {
  return [...store.tasks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'yellow',
    running: 'blue',
    completed: 'green',
    failed: 'red'
  }
  return colors[status] || 'gray'
}

const getAgentStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    idle: 'bg-gray-400',
    active: 'bg-green-500',
    error: 'bg-red-500',
    offline: 'bg-gray-600'
  }
  return classes[status] || 'bg-gray-400'
}

const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString()
}

const refresh = () => {
  store.fetchPlanningBoard()
}
</script>