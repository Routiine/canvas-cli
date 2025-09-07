<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-gray-900/95 dark:border-gray-800">
      <div class="container mx-auto px-4">
        <div class="flex h-16 items-center justify-between">
          <div class="flex items-center gap-4">
            <NuxtLink to="/" class="flex items-center">
              <CanvasLogo :show-pulse="store.connected" />
            </NuxtLink>
          </div>
          
          <div class="flex items-center gap-4">
            <UButton icon="i-heroicons-plus" color="primary" variant="solid">
              New Task
            </UButton>
            <UDropdown :items="userMenuItems" :popper="{ placement: 'bottom-end' }">
              <UAvatar src="" alt="User" />
            </UDropdown>
            <UButton
              icon="i-heroicons-moon"
              color="gray"
              variant="ghost"
              @click="toggleColorMode"
            />
          </div>
        </div>
      </div>
    </header>

    <!-- Navigation -->
    <nav class="border-b bg-white dark:bg-gray-900 dark:border-gray-800">
      <div class="container mx-auto px-4">
        <div class="flex gap-1 py-2">
          <UButton
            v-for="item in navigationItems"
            :key="item.to"
            :to="item.to"
            :icon="item.icon"
            color="gray"
            :variant="isActive(item.to) ? 'soft' : 'ghost'"
            class="justify-start"
          >
            {{ item.label }}
          </UButton>
        </div>
      </div>
    </nav>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-6">
      <slot />
    </main>

    <!-- Notifications -->
    <UNotifications />
  </div>
</template>

<script setup lang="ts">
import { useDashboardStore } from '~/stores/dashboard'

const store = useDashboardStore()
const colorMode = useColorMode()
const route = useRoute()

const toggleColorMode = () => {
  colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark'
}

const navigationItems = [
  { to: '/', label: 'Overview', icon: 'i-heroicons-chart-pie' },
  { to: '/agents', label: 'Agents', icon: 'i-heroicons-cpu-chip' },
  { to: '/tasks', label: 'Tasks', icon: 'i-heroicons-clipboard-document-list' },
  { to: '/planning', label: 'Planning Board', icon: 'i-heroicons-view-columns' },
  { to: '/workflows', label: 'Workflows', icon: 'i-heroicons-arrow-path' },
  { to: '/stories', label: 'Story Map', icon: 'i-heroicons-map' },
  { to: '/assistant', label: 'AI Assistant', icon: 'i-heroicons-sparkles' }
]

const userMenuItems = [
  [{
    label: 'Profile',
    icon: 'i-heroicons-user-circle',
    click: () => console.log('Profile')
  }],
  [{
    label: 'Settings',
    icon: 'i-heroicons-cog-6-tooth',
    click: () => console.log('Settings')
  }],
  [{
    label: 'Logout',
    icon: 'i-heroicons-arrow-left-on-rectangle',
    click: () => console.log('Logout')
  }]
]

const isActive = (path: string) => {
  return route.path === path
}
</script>