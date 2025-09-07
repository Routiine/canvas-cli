<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white">Tasks</h2>
        <p class="text-gray-600 dark:text-gray-400">Monitor task execution and performance</p>
      </div>
      <UButton icon="i-heroicons-plus" color="primary">
        New Task
      </UButton>
    </div>

    <UCard>
      <UTable :rows="demoTasks" :columns="taskColumns">
        <template #id-data="{ row }">
          <span class="font-mono text-xs">{{ row.id.substring(0, 8) }}...</span>
        </template>
        
        <template #status-data="{ row }">
          <UBadge :color="getStatusColor(row.status)" variant="subtle">
            {{ row.status }}
          </UBadge>
        </template>
        
        <template #createdAt-data="{ row }">
          {{ formatDate(row.createdAt) }}
        </template>
        
        <template #assignee-data="{ row }">
          <div v-if="row.assignee" class="flex items-center gap-2">
            <UAvatar size="xs" :alt="row.assignee" />
            <span class="text-sm">{{ row.assignee }}</span>
          </div>
          <span v-else class="text-gray-400">-</span>
        </template>
        
        <template #actions-data="{ row }">
          <UDropdown :items="getTaskActions(row)">
            <UButton icon="i-heroicons-ellipsis-horizontal" size="xs" color="gray" variant="ghost" />
          </UDropdown>
        </template>
      </UTable>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const taskColumns = [
  { key: 'id', label: 'ID' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Created' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'actions', label: '' }
]

const demoTasks = [
  {
    id: 'task_1703691234567_abc123',
    type: 'Code Generation',
    status: 'running',
    createdAt: new Date().toISOString(),
    assignee: 'Developer Agent'
  },
  {
    id: 'task_1703691234568_def456',
    type: 'Requirements Analysis',
    status: 'completed',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    assignee: 'Business Analyst'
  },
  {
    id: 'task_1703691234569_ghi789',
    type: 'Testing',
    status: 'pending',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    assignee: 'QA Engineer'
  },
  {
    id: 'task_1703691234570_jkl012',
    type: 'Architecture Design',
    status: 'failed',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    assignee: 'Solutions Architect'
  }
]

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'yellow',
    running: 'blue',
    completed: 'green',
    failed: 'red'
  }
  return colors[status] || 'gray'
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString()
}

const getTaskActions = (task: any) => [
  [{
    label: 'View Details',
    icon: 'i-heroicons-eye',
    click: () => console.log('View', task)
  }],
  [{
    label: 'Retry',
    icon: 'i-heroicons-arrow-path',
    click: () => console.log('Retry', task),
    disabled: task.status !== 'failed'
  }],
  [{
    label: 'Cancel',
    icon: 'i-heroicons-x-circle',
    click: () => console.log('Cancel', task),
    disabled: !['pending', 'running'].includes(task.status)
  }]
]
</script>