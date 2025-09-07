<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Planning Board</h1>
        <p class="text-gray-600 dark:text-gray-400">Organize and track your development tasks</p>
      </div>
      <UButton 
        icon="i-heroicons-plus" 
        @click="isNewItemModalOpen = true"
        color="primary"
        size="lg"
      >
        Add Task
      </UButton>
    </div>

    <!-- Planning Board -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      <!-- Column for each status -->
      <div 
        v-for="column in columns" 
        :key="column.id"
        class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-gray-900 dark:text-white">
            {{ column.title }}
          </h3>
          <UBadge :color="getColumnColor(column.id)" variant="soft">
            {{ column.items?.length || 0 }}
          </UBadge>
        </div>

        <!-- Items in column -->
        <div class="space-y-3">
          <div
            v-for="item in column.items || []"
            :key="item.id"
            class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border cursor-pointer hover:shadow-md transition-shadow"
            @click="selectItem(item)"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <UBadge 
                  :color="getTypeColor(item.type)" 
                  variant="soft" 
                  size="xs"
                >
                  {{ item.type }}
                </UBadge>
                <UBadge 
                  v-if="item.priority" 
                  :color="getPriorityColor(item.priority)" 
                  variant="soft" 
                  size="xs"
                >
                  P{{ item.priority }}
                </UBadge>
              </div>
              <UDropdown :items="getItemActions(item, column.id)">
                <UButton icon="i-heroicons-ellipsis-vertical" variant="ghost" size="sm" />
              </UDropdown>
            </div>
            
            <h4 class="font-medium text-gray-900 dark:text-white text-sm mb-1">
              {{ item.title }}
            </h4>
            
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-2">
              {{ item.description }}
            </p>
            
            <div class="flex items-center justify-between">
              <div v-if="item.assignee" class="flex items-center gap-1">
                <UIcon name="i-heroicons-user" class="w-3 h-3 text-gray-400" />
                <span class="text-xs text-gray-500">{{ item.assignee }}</span>
              </div>
              <div v-if="item.tags" class="flex gap-1">
                <span
                  v-for="tag in item.tags?.slice(0, 2)"
                  :key="tag"
                  class="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- Empty state -->
          <div 
            v-if="!column.items?.length"
            class="text-center py-8 text-gray-500 dark:text-gray-400"
          >
            <UIcon name="i-heroicons-inbox" class="w-8 h-8 mx-auto mb-2" />
            <p class="text-sm">No items</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Item Details Modal -->
    <UModal v-model="isItemModalOpen">
      <UCard v-if="selectedItem">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">{{ selectedItem.title }}</h3>
            <UButton icon="i-heroicons-x-mark" variant="ghost" @click="isItemModalOpen = false" />
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <p class="text-gray-600 dark:text-gray-400">{{ selectedItem.description }}</p>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Type</label>
              <UBadge :color="getTypeColor(selectedItem.type)">{{ selectedItem.type }}</UBadge>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Priority</label>
              <UBadge :color="getPriorityColor(selectedItem.priority)">P{{ selectedItem.priority }}</UBadge>
            </div>
          </div>
          
          <div v-if="selectedItem.assignee">
            <label class="block text-sm font-medium mb-1">Assignee</label>
            <p class="text-gray-600 dark:text-gray-400">{{ selectedItem.assignee }}</p>
          </div>
          
          <div v-if="selectedItem.tags">
            <label class="block text-sm font-medium mb-1">Tags</label>
            <div class="flex gap-2">
              <UBadge v-for="tag in selectedItem.tags" :key="tag" color="blue">{{ tag }}</UBadge>
            </div>
          </div>

          <div class="flex gap-2 pt-4">
            <USelect 
              v-model="selectedStatus"
              :options="statusOptions" 
              placeholder="Move to..."
            />
            <UButton 
              @click="moveItem" 
              :disabled="selectedStatus === currentStatus"
              color="primary"
            >
              Move
            </UButton>
          </div>
        </div>
      </UCard>
    </UModal>

    <!-- New Item Modal -->
    <UModal v-model="isNewItemModalOpen">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Create New Task</h3>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Title" required>
            <UInput v-model="newItem.title" placeholder="Task title..." autofocus tabindex="1" />
          </UFormGroup>

          <UFormGroup label="Description">
            <UTextarea v-model="newItem.description" placeholder="Task description..." rows="3" />
          </UFormGroup>

          <UFormGroup label="Assignee">
            <UInput v-model="newItem.assignee" placeholder="Assign to..." />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Type">
              <USelect v-model="newItem.type" :options="typeOptions" />
            </UFormGroup>

            <UFormGroup label="Priority">
              <USelect v-model="newItem.priority" :options="priorityOptions" />
            </UFormGroup>
          </div>

          <UFormGroup label="Tags">
            <UInput v-model="newItem.tagsInput" placeholder="tag1, tag2, tag3..." />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="isNewItemModalOpen = false">
              Cancel
            </UButton>
            <UButton @click="createNewItem" color="primary">
              Create Task
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useDashboardStore } from '~/stores/dashboard'

const store = useDashboardStore()
const toast = useToast()

const isNewItemModalOpen = ref(false)
const isItemModalOpen = ref(false)
const selectedItem = ref<any>(null)
const selectedStatus = ref('')
const currentStatus = ref('')

// Form data
const newItem = ref({
  title: '',
  description: '',
  type: 'task',
  priority: 3,
  assignee: '',
  tagsInput: ''
})

// Static data for demonstration (in production, this would come from the store/API)
const columns = ref([
  {
    id: 'backlog',
    title: 'Backlog',
    items: [
      {
        id: '4',
        type: 'feature',
        title: 'Add Dark Mode Support',
        description: 'Implement theme switching functionality',
        priority: 3,
        tags: ['ui', 'enhancement']
      },
      {
        id: '6',
        type: 'task',
        title: 'API Rate Limiting',
        description: 'Implement rate limiting for API endpoints',
        priority: 2,
        tags: ['api', 'security']
      }
    ]
  },
  {
    id: 'todo',
    title: 'To Do',
    items: [
      {
        id: '2',
        type: 'task',
        title: 'Setup Database Models',
        description: 'Create user and session models',
        priority: 2,
        assignee: 'Jane Smith',
        tags: ['backend']
      }
    ]
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    items: [
      {
        id: '1',
        type: 'story',
        title: 'User Authentication System',
        description: 'Implement complete authentication with JWT tokens',
        priority: 1,
        assignee: 'John Doe',
        tags: ['auth', 'security']
      }
    ]
  },
  {
    id: 'review',
    title: 'Review',
    items: [
      {
        id: '3',
        type: 'bug',
        title: 'Fix Memory Leak in Agent System',
        description: 'Agents consuming too much memory over time',
        priority: 1,
        assignee: 'Bob Wilson',
        tags: ['bug', 'performance']
      }
    ]
  },
  {
    id: 'done',
    title: 'Done',
    items: [
      {
        id: '5',
        type: 'task',
        title: 'Write API Documentation',
        description: 'Document all REST endpoints',
        priority: 4,
        tags: ['docs']
      }
    ]
  }
])

// Options
const statusOptions = [
  { label: 'Backlog', value: 'backlog' },
  { label: 'To Do', value: 'todo' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Review', value: 'review' },
  { label: 'Done', value: 'done' }
]

const typeOptions = [
  { label: 'Task', value: 'task' },
  { label: 'Story', value: 'story' },
  { label: 'Bug', value: 'bug' },
  { label: 'Feature', value: 'feature' }
]

const priorityOptions = [
  { label: 'P1 - Critical', value: 1 },
  { label: 'P2 - High', value: 2 },
  { label: 'P3 - Medium', value: 3 },
  { label: 'P4 - Low', value: 4 }
]

// Helper functions
const getColumnColor = (columnId: string) => {
  const colors: Record<string, string> = {
    'backlog': 'gray',
    'todo': 'blue',
    'in-progress': 'yellow',
    'review': 'orange',
    'done': 'green'
  }
  return colors[columnId] || 'gray'
}

const getTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    'task': 'blue',
    'story': 'green',
    'bug': 'red',
    'feature': 'purple'
  }
  return colors[type] || 'gray'
}

const getPriorityColor = (priority: number) => {
  const colors: Record<number, string> = {
    1: 'red',
    2: 'orange',
    3: 'yellow',
    4: 'gray'
  }
  return colors[priority] || 'gray'
}

const selectItem = (item: any) => {
  selectedItem.value = item
  currentStatus.value = findItemColumn(item.id)
  selectedStatus.value = currentStatus.value
  isItemModalOpen.value = true
}

const findItemColumn = (itemId: string): string => {
  for (const column of columns.value) {
    if (column.items?.find(item => item.id === itemId)) {
      return column.id
    }
  }
  return ''
}

const getItemActions = (item: any, columnId: string) => {
  return [
    [
      {
        label: 'Edit',
        icon: 'i-heroicons-pencil',
        click: () => selectItem(item)
      },
      {
        label: 'Delete',
        icon: 'i-heroicons-trash',
        click: () => deleteItem(item.id)
      }
    ]
  ]
}

const moveItem = () => {
  if (selectedItem.value && selectedStatus.value !== currentStatus.value) {
    // Remove from current column
    const currentColumn = columns.value.find(col => col.id === currentStatus.value)
    if (currentColumn?.items) {
      const itemIndex = currentColumn.items.findIndex(item => item.id === selectedItem.value.id)
      if (itemIndex > -1) {
        currentColumn.items.splice(itemIndex, 1)
      }
    }
    
    // Add to new column
    const newColumn = columns.value.find(col => col.id === selectedStatus.value)
    if (newColumn) {
      if (!newColumn.items) newColumn.items = []
      newColumn.items.push(selectedItem.value)
    }
    
    toast.add({
      title: 'Task moved successfully',
      icon: 'i-heroicons-check'
    })
    
    isItemModalOpen.value = false
  }
}

const createNewItem = () => {
  if (!newItem.value.title) {
    toast.add({
      title: 'Title is required',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
    return
  }

  const item = {
    id: Date.now().toString(),
    ...newItem.value,
    tags: newItem.value.tagsInput.split(',').map(tag => tag.trim()).filter(Boolean)
  }
  
  // Add to backlog by default
  const backlogColumn = columns.value.find(col => col.id === 'backlog')
  if (backlogColumn) {
    if (!backlogColumn.items) backlogColumn.items = []
    backlogColumn.items.push(item)
  }
  
  // Reset form
  newItem.value = {
    title: '',
    description: '',
    type: 'task',
    priority: 3,
    assignee: '',
    tagsInput: ''
  }
  
  isNewItemModalOpen.value = false
  
  toast.add({
    title: 'Task created successfully',
    icon: 'i-heroicons-check'
  })
}

const deleteItem = (itemId: string) => {
  for (const column of columns.value) {
    if (column.items) {
      const itemIndex = column.items.findIndex(item => item.id === itemId)
      if (itemIndex > -1) {
        column.items.splice(itemIndex, 1)
        toast.add({
          title: 'Task deleted successfully',
          icon: 'i-heroicons-check'
        })
        return
      }
    }
  }
}
</script>