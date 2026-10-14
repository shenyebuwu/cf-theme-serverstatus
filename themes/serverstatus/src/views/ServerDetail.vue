<script setup>
import { computed } from 'vue'
import MetricChart from '../components/MetricChart.vue'
import ProgressBar from '../components/ProgressBar.vue'
import ServerFacts from '../components/ServerFacts.vue'
import { allServers, clientAt, loadHistory, serverHref, state } from '../store.js'
import { gpu, HOURS, number, online, percent, probeValue } from '../metrics.js'
import { probeSeries } from '../probes.js'
import { t } from '../i18n.js'
const server = computed(() => state.detail)
const config = computed(() => state.sites[server.value?.site]?.config || {})
const switches = computed(() => ({ ...state.sites[server.value?.site]?.sysConfig, ...server.value?.sysConfig }))
const resources = computed(() => [
  { name: 'CPU', value: row => probeValue(row.cpu) },
  { name: t('ram'), value: row => row.ram_used == null ? undefined : percent(row.ram_used, row.ram_total ?? server.value.ram_total) },
  ...(number(server.value?.swap_total) ? [{ name: t('swap'), value: row => row.swap_used == null ? undefined : percent(row.swap_used, row.swap_total ?? server.value.swap_total) }] : [])
])
const network = computed(() => [{ name: '↓', value: row => row.net_in_speed == null ? undefined : number(row.net_in_speed) / 1048576 }, { name: '↑', value: row => row.net_out_speed == null ? undefined : number(row.net_out_speed) / 1048576 }])
const ping = computed(() => probeSeries(state.rows, 'ping', config.value))
const loss = computed(() => probeSeries(state.rows, 'loss', config.value))
const io = computed(() => state.rows.some(row => row.disk && Object.values(row.disk).some(value => number(value) > 0)))
const ioSeries = computed(() => [{ name: t('read'), value: row => row.disk ? number(row.disk.read_bps) / 1048576 : undefined }, { name: t('write'), value: row => row.disk ? number(row.disk.write_bps) / 1048576 : undefined }])
const gpus = computed(() => {
  const devices = new Map()
  for (const row of state.rows) for (const device of gpu(row.gpu_info)) devices.set(String(device.id), device.name)
  return [...devices].map(([id, name]) => ({ name: name || `GPU ${id}`, value: row => probeValue(gpu(row.gpu_info).find(device => String(device.id) === id)?.info) }))
})
const rangeLabel = hours => hours === 0.167 ? `10 ${t('minute')}` : hours === 0.5 ? `30 ${t('minute')}` : hours < 24 ? `${hours} ${t('hour')}` : `${hours / 24} ${t('day')}`
</script>
<template>
  <div v-if="server" class="panel detail-layout">
    <aside class="node-picker"><a href="#/" class="back-link">← {{ t('back') }}</a><h2>{{ t('servers') }}</h2><a v-for="node in allServers()" :key="`${node.site}:${node.id}`" :href="serverHref(node)" :class="{ selected: node.id === server.id && node.site === server.site }"><span class="dot" :class="{ online: online(node, state.now), offline: !online(node, state.now) }"></span><span>{{ node.name }}</span></a></aside>
    <section class="detail-main">
      <div class="detail-heading"><h1><span class="dot" :class="{ online: online(server, state.now), offline: !online(server, state.now) }"></span>{{ server.name }}</h1><span class="muted">{{ t(state.sites[server.site]?.status || 'idle') }}</span></div>
      <div class="detail-bars"><div><span>CPU</span><ProgressBar :value="server.cpu ?? null" /></div><div><span>{{ t('ram') }}</span><ProgressBar :value="percent(server.ram_used, server.ram_total)" /></div><div><span>{{ t('disk') }}</span><ProgressBar :value="percent(server.disk_used, server.disk_total)" /></div></div>
      <ServerFacts :server="server" :switches="switches" />
      <div class="range-toolbar"><div class="ranges" role="group" :aria-label="t('monitor')"><button v-for="hours in HOURS" :key="hours" :class="{ primary: state.hours === hours }" :aria-pressed="state.hours === hours" :disabled="state.historyLoading" @click="state.hours !== hours && loadHistory(hours)">{{ rangeLabel(hours) }}</button></div><small class="muted">{{ state.historyLoading ? t('loading') : t('chartHint') }}</small></div>
      <p v-if="state.historyError" role="alert" class="alert">{{ t(state.historyError) }} <a v-if="state.historyError === 'historyAuth'" :href="clientAt(server.site).adminUrl()">{{ t('login') }}</a></p>
      <div class="charts-grid"><MetricChart :rows="state.rows" :series="resources" :title="t('resources')" unit="%" :max="100" /><MetricChart :rows="state.rows" :series="network" :title="t('network')" unit="MB/s" /><MetricChart v-if="ping.length" :rows="state.rows" :series="ping" :title="t('latency')" unit="ms" /><MetricChart v-if="loss.length" :rows="state.rows" :series="loss" :title="t('loss')" unit="%" :max="100" /><MetricChart v-if="io" :rows="state.rows" :series="ioSeries" :title="t('io')" unit="MB/s" /><MetricChart v-if="gpus.length" :rows="state.rows" :series="gpus" :title="t('gpu')" unit="%" :max="100" /></div>
    </section>
  </div>
  <div v-else-if="!state.error && !state.sites.some(site => site.challenge)" class="panel empty">{{ t('loading') }}</div>
</template>
