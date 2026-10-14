<script setup>
import { computed } from 'vue'
import { bytes, gpu, number, timestamp, uptime } from '../metrics.js'
import { state } from '../store.js'
import { language, locale, t } from '../i18n.js'
import { formatBillingPrice } from '../../../../src/frontend/utils/server.js'
const props = defineProps({ server: Object, switches: { type: Object, default: () => ({}) } })
const facts = computed(() => {
  const s = props.server
  return [
    [t('os'), s.os || '—'], [t('arch'), s.arch || '—'], [t('kernel'), s.kernel_version || '—'],
    [t('model'), `${s.cpu_info || '—'} × ${number(s.cpu_cores)}`],
    [t('ram'), `${bytes(number(s.ram_used) * 1048576)} / ${bytes(number(s.ram_total) * 1048576)}`],
    [t('swap'), `${bytes(number(s.swap_used) * 1048576)} / ${bytes(number(s.swap_total) * 1048576)}`],
    [t('disk'), `${bytes(number(s.disk_used) * 1048576)} / ${bytes(number(s.disk_total) * 1048576)}`],
    [t('load'), s.load_avg || '—'], [t('processes'), `${number(s.processes)} · TCP ${number(s.tcp_conn)} · UDP ${number(s.udp_conn)}`],
    [t('uptime'), uptime(s, state.now)], [t('lastUpdated'), timestamp(s.last_updated) ? new Date(timestamp(s.last_updated)).toLocaleString(locale.value) : '—'],
    [t('tags'), s.tags || '—'],
    ...(props.switches.show_tf === false ? [] : [[t('monthly'), `↓ ${bytes(s.net_rx_monthly)} · ↑ ${bytes(s.net_tx_monthly)}`], [t('totalTraffic'), `↓ ${bytes(s.net_rx)} · ↑ ${bytes(s.net_tx)}`], [t('reset'), String(s.reset_day || 1)]]),
    ...(props.switches.show_price === false ? [] : [[t('price'), formatBillingPrice(s, language.value) || '—']]),
    ...(props.switches.show_expire === false ? [] : [[t('expiry'), s.expire_date || t('expireNone')]]),
    ...gpu(s.gpu_info).map(item => [item.name || t('gpu'), item.info == null ? '—' : `${number(item.info).toFixed(1)}%`])
  ]
})
</script>
<template><dl class="facts"><div v-for="([label, value], i) in facts" :key="i"><dt>{{ label }}</dt><dd>{{ value }}</dd></div></dl></template>
