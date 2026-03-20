// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@vueuse/nuxt'
  ],
  ui: {
    global: true,
    icons: ['heroicons', 'simple-icons']
  },
  colorMode: {
    preference: 'dark'
  },
  app: {
    head: {
      title: 'Canvas CLI Dashboard',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Real-time monitoring and control for Canvas CLI' }
      ]
    }
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      // Empty string means "same origin" — override via env var for separate deployments
      apiBase: process.env.API_BASE || '',
      socketUrl: process.env.SOCKET_URL || ''
    }
  }
})