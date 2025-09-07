<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Workflows</h2>
        <p class="text-gray-600 dark:text-gray-400">Manage and monitor automated workflows</p>
      </div>
      <UButton icon="i-heroicons-plus" color="primary">
        New Workflow
      </UButton>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <UCard
        v-for="workflow in demoWorkflows"
        :key="workflow.id"
        class="hover:shadow-lg transition-shadow"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ workflow.name }}
          </h3>
          <UBadge :color="getWorkflowStatusColor(workflow.status)">
            {{ workflow.status }}
          </UBadge>
        </div>

        <p class="text-gray-600 dark:text-gray-400 mb-4">{{ workflow.description }}</p>

        <!-- Progress Bar -->
        <div class="mb-4">
          <div class="flex justify-between text-sm mb-2">
            <span>Progress</span>
            <span>{{ workflow.currentStage + 1 }}/{{ workflow.stages.length }}</span>
          </div>
          <UProgress 
            :value="((workflow.currentStage + 1) / workflow.stages.length) * 100" 
            :color="getWorkflowStatusColor(workflow.status)"
          />
        </div>

        <!-- Stages -->
        <div class="space-y-2 mb-4">
          <div
            v-for="(stage, index) in workflow.stages"
            :key="index"
            class="flex items-center gap-3 p-2 rounded-lg"
            :class="getStageClass(index, workflow.currentStage)"
          >
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              :class="getStageIconClass(index, workflow.currentStage)"
            >
              <UIcon
                v-if="index < workflow.currentStage"
                name="i-heroicons-check"
                class="w-4 h-4"
              />
              <UIcon
                v-else-if="index === workflow.currentStage"
                name="i-heroicons-play"
                class="w-3 h-3"
              />
              <span v-else>{{ index + 1 }}</span>
            </div>
            <div class="flex-1">
              <p class="font-medium text-sm">{{ stage.name }}</p>
              <p class="text-xs text-gray-500">{{ stage.description }}</p>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-between items-center">
            <div class="text-xs text-gray-500">
              Started {{ formatRelativeTime(workflow.startedAt) }}
            </div>
            <div class="flex gap-2">
              <UButton
                v-if="workflow.status === 'running'"
                icon="i-heroicons-pause"
                size="xs"
                color="yellow"
                variant="soft"
              >
                Pause
              </UButton>
              <UButton
                v-if="workflow.status === 'paused'"
                icon="i-heroicons-play"
                size="xs"
                color="green"
                variant="soft"
              >
                Resume
              </UButton>
              <UButton
                icon="i-heroicons-eye"
                size="xs"
                color="gray"
                variant="soft"
              >
                Details
              </UButton>
            </div>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const demoWorkflows = [
  {
    id: '1',
    name: 'Feature Development',
    description: 'Complete workflow for developing a new feature',
    status: 'running',
    currentStage: 2,
    stages: [
      { name: 'Analysis', description: 'Requirements analysis' },
      { name: 'Design', description: 'System architecture design' },
      { name: 'Development', description: 'Code implementation' },
      { name: 'Testing', description: 'Quality assurance' },
      { name: 'Deployment', description: 'Production release' }
    ],
    startedAt: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: '2',
    name: 'Bug Fix Pipeline',
    description: 'Automated bug fixing and validation',
    status: 'completed',
    currentStage: 2,
    stages: [
      { name: 'Investigation', description: 'Bug analysis' },
      { name: 'Fix', description: 'Code correction' },
      { name: 'Validation', description: 'Fix verification' }
    ],
    startedAt: new Date(Date.now() - 7200000).toISOString()
  },
  {
    id: '3',
    name: 'Code Review',
    description: 'Multi-agent code review process',
    status: 'paused',
    currentStage: 0,
    stages: [
      { name: 'Security Review', description: 'Security analysis' },
      { name: 'Quality Review', description: 'Code quality check' },
      { name: 'Architecture Review', description: 'Design validation' }
    ],
    startedAt: new Date(Date.now() - 1800000).toISOString()
  },
  {
    id: '4',
    name: 'Documentation Update',
    description: 'Automated documentation generation',
    status: 'failed',
    currentStage: 1,
    stages: [
      { name: 'Code Analysis', description: 'Analyze codebase' },
      { name: 'Doc Generation', description: 'Generate documentation' },
      { name: 'Review', description: 'Human review' }
    ],
    startedAt: new Date(Date.now() - 5400000).toISOString()
  }
]

const getWorkflowStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    running: 'blue',
    completed: 'green',
    paused: 'yellow',
    failed: 'red'
  }
  return colors[status] || 'gray'
}

const getStageClass = (stageIndex: number, currentStage: number) => {
  if (stageIndex < currentStage) {
    return 'bg-green-50 dark:bg-green-900/20'
  } else if (stageIndex === currentStage) {
    return 'bg-blue-50 dark:bg-blue-900/20'
  } else {
    return 'bg-gray-50 dark:bg-gray-800'
  }
}

const getStageIconClass = (stageIndex: number, currentStage: number) => {
  if (stageIndex < currentStage) {
    return 'bg-green-500 text-white'
  } else if (stageIndex === currentStage) {
    return 'bg-blue-500 text-white'
  } else {
    return 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
  }
}

const formatRelativeTime = (dateString: string) => {
  const now = Date.now()
  const date = new Date(dateString).getTime()
  const diff = now - date
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  return 'Just now'
}
</script>