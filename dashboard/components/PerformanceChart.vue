<template>
  <canvas ref="chartRef"></canvas>
</template>

<script setup lang="ts">
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const props = defineProps<{
  metrics: {
    cpu: number
    memory: number
  }
}>()

const chartRef = ref<HTMLCanvasElement>()
let chartInstance: Chart | null = null

// Store history
const cpuHistory = ref<number[]>([])
const memoryHistory = ref<number[]>([])
const labels = ref<string[]>([])

watch(() => props.metrics, (newMetrics) => {
  // Add to history
  cpuHistory.value.push(newMetrics.cpu * 100)
  memoryHistory.value.push(newMetrics.memory * 100)
  labels.value.push(new Date().toLocaleTimeString())
  
  // Keep only last 20 points
  if (cpuHistory.value.length > 20) {
    cpuHistory.value.shift()
    memoryHistory.value.shift()
    labels.value.shift()
  }
  
  updateChart()
})

onMounted(() => {
  if (chartRef.value) {
    const ctx = chartRef.value.getContext('2d')
    if (ctx) {
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels.value,
          datasets: [
            {
              label: 'CPU Usage (%)',
              data: cpuHistory.value,
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.4
            },
            {
              label: 'Memory Usage (%)',
              data: memoryHistory.value,
              borderColor: 'rgb(16, 185, 129)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: (value) => `${value}%`
              }
            }
          }
        }
      })
    }
  }
})

const updateChart = () => {
  if (chartInstance) {
    chartInstance.data.labels = labels.value
    chartInstance.data.datasets[0].data = cpuHistory.value
    chartInstance.data.datasets[1].data = memoryHistory.value
    chartInstance.update('none')
  }
}

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
})
</script>