<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Story Map</h1>
        <p class="text-gray-600 dark:text-gray-400">Visualize user journeys and feature development</p>
      </div>
      <div class="flex gap-3">
        <UButton 
          icon="i-heroicons-plus" 
          @click="isNewStoryModalOpen = true"
          color="primary"
          size="lg"
        >
          Add Story
        </UButton>
        <UButtonGroup size="sm">
          <UButton 
            @click="viewMode = 'map'" 
            :variant="viewMode === 'map' ? 'solid' : 'outline'"
            icon="i-heroicons-squares-2x2"
          >
            Map
          </UButton>
          <UButton 
            @click="viewMode = 'timeline'" 
            :variant="viewMode === 'timeline' ? 'solid' : 'outline'"
            icon="i-heroicons-calendar-days"
          >
            Timeline
          </UButton>
          <UButton 
            @click="viewMode = 'list'" 
            :variant="viewMode === 'list' ? 'solid' : 'outline'"
            icon="i-heroicons-list-bullet"
          >
            List
          </UButton>
        </UButtonGroup>
      </div>
    </div>

    <!-- Story Map View -->
    <div v-if="viewMode === 'map'" class="space-y-6">
      <!-- User Journey Steps -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div 
          v-for="journey in userJourneys" 
          :key="journey.id"
          class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-900 dark:text-white">
              {{ journey.title }}
            </h3>
            <UBadge :color="getJourneyColor(journey.priority)" variant="soft">
              {{ journey.priority }}
            </UBadge>
          </div>

          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ journey.description }}
          </p>

          <!-- Stories in this journey -->
          <div class="space-y-2">
            <div
              v-for="story in journey.stories"
              :key="story.id"
              class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg cursor-pointer hover:shadow-sm transition-shadow"
              @click="selectStory(story)"
            >
              <div class="flex items-start justify-between mb-2">
                <UBadge 
                  :color="getStatusColor(story.status)" 
                  variant="soft" 
                  size="xs"
                >
                  {{ story.status }}
                </UBadge>
                <UDropdown :items="getStoryActions(story)">
                  <UButton icon="i-heroicons-ellipsis-vertical" variant="ghost" size="sm" />
                </UDropdown>
              </div>
              
              <h4 class="font-medium text-sm mb-1">{{ story.title }}</h4>
              <p class="text-xs text-gray-600 dark:text-gray-400 mb-2">{{ story.description }}</p>
              
              <div class="flex items-center justify-between">
                <div v-if="story.assignee" class="flex items-center gap-1">
                  <UIcon name="i-heroicons-user" class="w-3 h-3 text-gray-400" />
                  <span class="text-xs text-gray-500">{{ story.assignee }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <UIcon name="i-heroicons-clock" class="w-3 h-3 text-gray-400" />
                  <span class="text-xs text-gray-500">{{ story.points }}pt</span>
                </div>
              </div>
            </div>
            
            <!-- Empty state -->
            <div 
              v-if="!journey.stories?.length"
              class="text-center py-4 text-gray-500 dark:text-gray-400"
            >
              <UIcon name="i-heroicons-plus-circle" class="w-6 h-6 mx-auto mb-1" />
              <p class="text-xs">Add story</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline View -->
    <div v-if="viewMode === 'timeline'" class="space-y-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div class="space-y-6">
          <div 
            v-for="sprint in sprints" 
            :key="sprint.id"
            class="border-l-4 border-blue-500 pl-4"
          >
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-semibold">{{ sprint.name }}</h3>
              <div class="flex items-center gap-2">
                <UBadge color="blue" variant="soft">{{ sprint.stories.length }} stories</UBadge>
                <UBadge :color="getSprintStatusColor(sprint.status)">{{ sprint.status }}</UBadge>
              </div>
            </div>
            
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {{ new Date(sprint.startDate).toLocaleDateString() }} - 
              {{ new Date(sprint.endDate).toLocaleDateString() }}
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="story in sprint.stories"
                :key="story.id"
                class="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg"
              >
                <div class="flex items-start justify-between mb-2">
                  <UBadge :color="getStatusColor(story.status)" variant="soft" size="xs">
                    {{ story.status }}
                  </UBadge>
                  <span class="text-xs text-gray-500">{{ story.points }}pt</span>
                </div>
                <h4 class="font-medium text-sm">{{ story.title }}</h4>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-if="viewMode === 'list'" class="space-y-4">
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">All Stories</h3>
            <div class="flex gap-2">
              <USelect v-model="filterStatus" :options="statusFilterOptions" />
              <USelect v-model="filterJourney" :options="journeyFilterOptions" />
            </div>
          </div>
        </div>
        
        <div class="divide-y divide-gray-200 dark:divide-gray-700">
          <div
            v-for="story in filteredStories"
            :key="story.id"
            class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            @click="selectStory(story)"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <h4 class="font-medium">{{ story.title }}</h4>
                  <UBadge :color="getStatusColor(story.status)" variant="soft" size="xs">
                    {{ story.status }}
                  </UBadge>
                  <UBadge color="gray" variant="soft" size="xs">
                    {{ story.journey }}
                  </UBadge>
                </div>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">{{ story.description }}</p>
                <div class="flex items-center gap-4 text-xs text-gray-500">
                  <span v-if="story.assignee">{{ story.assignee }}</span>
                  <span>{{ story.points }} points</span>
                  <span v-if="story.createdAt">{{ new Date(story.createdAt).toLocaleDateString() }}</span>
                </div>
              </div>
              <UDropdown :items="getStoryActions(story)">
                <UButton icon="i-heroicons-ellipsis-vertical" variant="ghost" size="sm" />
              </UDropdown>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Story Details Modal -->
    <UModal v-model="isStoryModalOpen">
      <UCard v-if="selectedStory">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold">{{ selectedStory.title }}</h3>
            <UButton icon="i-heroicons-x-mark" variant="ghost" @click="isStoryModalOpen = false" />
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <p class="text-gray-600 dark:text-gray-400">{{ selectedStory.description }}</p>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Status</label>
              <UBadge :color="getStatusColor(selectedStory.status)">{{ selectedStory.status }}</UBadge>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Story Points</label>
              <UBadge color="gray">{{ selectedStory.points }} points</UBadge>
            </div>
          </div>
          
          <div v-if="selectedStory.assignee">
            <label class="block text-sm font-medium mb-1">Assignee</label>
            <p class="text-gray-600 dark:text-gray-400">{{ selectedStory.assignee }}</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-1">User Journey</label>
            <p class="text-gray-600 dark:text-gray-400">{{ selectedStory.journey }}</p>
          </div>

          <div v-if="selectedStory.acceptanceCriteria?.length">
            <label class="block text-sm font-medium mb-1">Acceptance Criteria</label>
            <ul class="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <li v-for="criteria in selectedStory.acceptanceCriteria" :key="criteria">
                {{ criteria }}
              </li>
            </ul>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="isStoryModalOpen = false">
              Close
            </UButton>
            <UButton color="primary" @click="editStory">
              Edit Story
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- New Story Modal -->
    <UModal v-model="isNewStoryModalOpen">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">Create New Story</h3>
        </template>

        <div class="space-y-4">
          <UFormGroup label="Title" required>
            <UInput v-model="newStory.title" placeholder="Story title..." autofocus />
          </UFormGroup>

          <UFormGroup label="Description">
            <UTextarea v-model="newStory.description" placeholder="As a [user], I want [goal] so that [reason]..." rows="3" />
          </UFormGroup>

          <UFormGroup label="User Journey">
            <USelect v-model="newStory.journey" :options="journeyOptions" />
          </UFormGroup>

          <UFormGroup label="Assignee">
            <UInput v-model="newStory.assignee" placeholder="Assign to..." />
          </UFormGroup>

          <div class="grid grid-cols-2 gap-4">
            <UFormGroup label="Story Points">
              <USelect v-model="newStory.points" :options="pointsOptions" />
            </UFormGroup>

            <UFormGroup label="Priority">
              <USelect v-model="newStory.priority" :options="priorityOptions" />
            </UFormGroup>
          </div>

          <UFormGroup label="Acceptance Criteria">
            <UTextarea v-model="newStory.criteriaInput" placeholder="Enter each criterion on a new line..." rows="4" />
          </UFormGroup>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="isNewStoryModalOpen = false">
              Cancel
            </UButton>
            <UButton @click="createNewStory" color="primary">
              Create Story
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

const viewMode = ref<'map' | 'list' | 'timeline'>('map')
const isNewStoryModalOpen = ref(false)
const isStoryModalOpen = ref(false)
const selectedStory = ref<any>(null)
const filterStatus = ref('')
const filterJourney = ref('')

// Form data
const newStory = ref({
  title: '',
  description: '',
  journey: 'authentication',
  points: 3,
  priority: 'medium',
  assignee: '',
  criteriaInput: ''
})

// Static data for demonstration
const userJourneys = ref([
  {
    id: 'authentication',
    title: 'User Authentication',
    description: 'User sign-up, login, and account management',
    priority: 'high',
    stories: [
      {
        id: 's1',
        title: 'User Registration',
        description: 'As a new user, I want to create an account',
        status: 'completed',
        assignee: 'John Doe',
        points: 5,
        journey: 'authentication',
        acceptanceCriteria: ['Email validation', 'Password requirements', 'Email confirmation']
      },
      {
        id: 's2',
        title: 'User Login',
        description: 'As a user, I want to login to my account',
        status: 'in-progress',
        assignee: 'Jane Smith',
        points: 3,
        journey: 'authentication'
      }
    ]
  },
  {
    id: 'dashboard',
    title: 'User Dashboard',
    description: 'Main user interface and navigation',
    priority: 'high',
    stories: [
      {
        id: 's3',
        title: 'Dashboard Overview',
        description: 'As a user, I want to see my account overview',
        status: 'pending',
        points: 8,
        journey: 'dashboard'
      }
    ]
  },
  {
    id: 'settings',
    title: 'Account Settings',
    description: 'User preferences and account management',
    priority: 'medium',
    stories: [
      {
        id: 's4',
        title: 'Profile Management',
        description: 'As a user, I want to update my profile',
        status: 'pending',
        points: 5,
        journey: 'settings'
      }
    ]
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'System and user notifications',
    priority: 'low',
    stories: []
  }
])

const sprints = ref([
  {
    id: 'sprint1',
    name: 'Sprint 1 - Authentication MVP',
    status: 'completed',
    startDate: '2024-01-01',
    endDate: '2024-01-14',
    stories: [
      {
        id: 's1',
        title: 'User Registration',
        status: 'completed',
        points: 5
      },
      {
        id: 's2',
        title: 'User Login',
        status: 'completed',
        points: 3
      }
    ]
  },
  {
    id: 'sprint2',
    name: 'Sprint 2 - Dashboard & Settings',
    status: 'active',
    startDate: '2024-01-15',
    endDate: '2024-01-28',
    stories: [
      {
        id: 's3',
        title: 'Dashboard Overview',
        status: 'in-progress',
        points: 8
      },
      {
        id: 's4',
        title: 'Profile Management',
        status: 'pending',
        points: 5
      }
    ]
  }
])

// Options
const statusFilterOptions = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed', value: 'completed' }
]

const journeyFilterOptions = [
  { label: 'All Journeys', value: '' },
  { label: 'Authentication', value: 'authentication' },
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Settings', value: 'settings' },
  { label: 'Notifications', value: 'notifications' }
]

const journeyOptions = [
  { label: 'Authentication', value: 'authentication' },
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Settings', value: 'settings' },
  { label: 'Notifications', value: 'notifications' }
]

const pointsOptions = [
  { label: '1 point', value: 1 },
  { label: '2 points', value: 2 },
  { label: '3 points', value: 3 },
  { label: '5 points', value: 5 },
  { label: '8 points', value: 8 },
  { label: '13 points', value: 13 }
]

const priorityOptions = [
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
]

// Computed
const filteredStories = computed(() => {
  let stories: any[] = []
  
  // Collect all stories from journeys
  userJourneys.value.forEach(journey => {
    if (journey.stories) {
      stories = [...stories, ...journey.stories]
    }
  })
  
  // Apply filters
  if (filterStatus.value) {
    stories = stories.filter(story => story.status === filterStatus.value)
  }
  
  if (filterJourney.value) {
    stories = stories.filter(story => story.journey === filterJourney.value)
  }
  
  return stories
})

// Helper functions
const getJourneyColor = (priority: string) => {
  const colors: Record<string, string> = {
    'high': 'red',
    'medium': 'yellow',
    'low': 'green'
  }
  return colors[priority] || 'gray'
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    'pending': 'gray',
    'in-progress': 'yellow',
    'completed': 'green'
  }
  return colors[status] || 'gray'
}

const getSprintStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    'planned': 'gray',
    'active': 'blue',
    'completed': 'green'
  }
  return colors[status] || 'gray'
}

const selectStory = (story: any) => {
  selectedStory.value = story
  isStoryModalOpen.value = true
}

const getStoryActions = (story: any) => {
  return [
    [
      {
        label: 'Edit',
        icon: 'i-heroicons-pencil',
        click: () => selectStory(story)
      },
      {
        label: 'Delete',
        icon: 'i-heroicons-trash',
        click: () => deleteStory(story.id)
      }
    ]
  ]
}

const editStory = () => {
  // Implementation for editing story
  toast.add({
    title: 'Edit functionality coming soon',
    icon: 'i-heroicons-information-circle'
  })
}

const createNewStory = () => {
  if (!newStory.value.title) {
    toast.add({
      title: 'Title is required',
      color: 'red',
      icon: 'i-heroicons-exclamation-triangle'
    })
    return
  }

  const story = {
    id: 's' + Date.now(),
    ...newStory.value,
    status: 'pending',
    createdAt: new Date().toISOString(),
    acceptanceCriteria: newStory.value.criteriaInput
      .split('\n')
      .map(c => c.trim())
      .filter(Boolean)
  }
  
  // Add to the selected journey
  const journey = userJourneys.value.find(j => j.id === story.journey)
  if (journey) {
    if (!journey.stories) journey.stories = []
    journey.stories.push(story)
  }
  
  // Reset form
  newStory.value = {
    title: '',
    description: '',
    journey: 'authentication',
    points: 3,
    priority: 'medium',
    assignee: '',
    criteriaInput: ''
  }
  
  isNewStoryModalOpen.value = false
  
  toast.add({
    title: 'Story created successfully',
    icon: 'i-heroicons-check'
  })
}

const deleteStory = (storyId: string) => {
  for (const journey of userJourneys.value) {
    if (journey.stories) {
      const storyIndex = journey.stories.findIndex(story => story.id === storyId)
      if (storyIndex > -1) {
        journey.stories.splice(storyIndex, 1)
        toast.add({
          title: 'Story deleted successfully',
          icon: 'i-heroicons-check'
        })
        return
      }
    }
  }
}
</script>