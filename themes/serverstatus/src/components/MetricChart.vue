<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler } from 'chart.js'
import { locale, t } from '../i18n.js'
import { timestamp } from '../metrics.js'
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler)
const props = defineProps({ rows: Array, series: Array, title: String, unit: { type: String, default: '' }, max: Number, compact: Boolean })
const canvas = ref(null)
const colors = ['#568ac0', '#60a783', '#d3a254', '#ba739a', '#62a5b5', '#8784b7', '#ac865f', '#b3a456']
let chart, observer
const hasData = computed(() => props.series.some(series => props.rows.some(row => series.value(row) !== undefined)))
function draw() {
  if (!canvas.value) return
  const css = getComputedStyle(document.documentElement)
  const text = css.getPropertyValue('--muted-foreground').trim(), grid = css.getPropertyValue('--border').trim()
  const datasets = props.series.map((series, index) => ({
    label: series.name,
    data: props.rows.map(row => series.value(row) ?? null),
    borderColor: colors[index % colors.length], backgroundColor: `${colors[index % colors.length]}16`,
    borderWidth: props.compact ? 1.4 : 1.8, pointRadius: 0, pointHitRadius: 12, tension: 0.15, fill: !props.compact && props.series.length <= 2, spanGaps: false
  }))
  const labels = props.rows.map(row => new Date(timestamp(row.timestamp ?? row.ts)).toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit', second: props.compact ? undefined : '2-digit' }))
  const options = {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: text, usePointStyle: true, boxWidth: 7, boxHeight: 7, font: { size: 11 } } },
      tooltip: { callbacks: { label: ctx => {
        const value = props.series[ctx.datasetIndex].value(props.rows[ctx.dataIndex])
        return `${ctx.dataset.label}: ${value === null ? t('timeoutValue') : value === undefined ? '—' : `${Number(value).toFixed(1)} ${props.unit}`}`
      } } }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: text, maxTicksLimit: props.compact ? 4 : 6, maxRotation: 0, font: { size: 10 } } },
      y: { min: 0, suggestedMax: props.max, grid: { color: grid }, ticks: { color: text, maxTicksLimit: 4, font: { size: 10 }, callback: value => `${value}${props.unit}` } }
    }
  }
  if (chart) { chart.data = { labels, datasets }; chart.options = options; chart.update('none') }
  else chart = new Chart(canvas.value, { type: 'line', data: { labels, datasets }, options })
}
watch([() => props.rows, () => props.series, locale], draw, { deep: true, flush: 'post' })
onMounted(() => { draw(); observer = new MutationObserver(draw); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }) })
onBeforeUnmount(() => { observer?.disconnect(); chart?.destroy() })
</script>
<template>
  <section class="chart-box" :class="{ compact }"><h3>{{ title }} <small v-if="unit">{{ unit }}</small></h3><div class="chart-canvas"><canvas ref="canvas" :aria-label="title" role="img"></canvas><span v-if="!hasData" class="chart-empty">{{ t('noData') }}</span></div></section>
</template>
