<template>
  <canvas ref="chartRef"></canvas>
</template>

<script setup lang="ts">
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const props = defineProps<{
  tasks: Array<{
    status: string
    type: string
  }>
}>()

const chartRef = ref<HTMLCanvasElement>()
let chartInstance: Chart | null = null

const taskDistribution = computed(() => {
  const distribution = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0
  }
  
  props.tasks.forEach(task => {
    if (distribution.hasOwnProperty(task.status)) {
      distribution[task.status as keyof typeof distribution]++
    }
  })
  
  return distribution
})

watch(() => props.tasks, () => {
  updateChart()
}, { deep: true })

onMounted(() => {
  if (chartRef.value) {
    const ctx = chartRef.value.getContext('2d')
    if (ctx) {
      chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Pending', 'Running', 'Completed', 'Failed'],
          datasets: [{
            data: Object.values(taskDistribution.value),
            backgroundColor: [
              'rgb(251, 191, 36)',
              'rgb(59, 130, 246)',
              'rgb(16, 185, 129)',
              'rgb(239, 68, 68)'
            ],
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      })
    }
  }
})

const updateChart = () => {
  if (chartInstance) {
    chartInstance.data.datasets[0].data = Object.values(taskDistribution.value)
    chartInstance.update()
  }
}

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>