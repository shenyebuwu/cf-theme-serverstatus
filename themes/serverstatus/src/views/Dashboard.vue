<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import ProgressBar from '../components/ProgressBar.vue'
import ServerFacts from '../components/ServerFacts.vue'
import { allServers, serverHref, serverKey, settings, state } from '../store.js'
import { bytes, compact, distro, number, online, percent, quota, tableUptime, traffic } from '../metrics.js'
import { probeSeries } from '../probes.js'
import { t } from '../i18n.js'
import { getOSImage } from '../../../../src/frontend/utils/osIcon.js'
import Icon from '../components/Icon.vue'
const MetricChart = defineAsyncComponent(() => import('../components/MetricChart.vue'))
const group = ref(null), search = ref(''), searchOpen = ref(false), expanded = ref(new Set())
const servers = computed(() => allServers().sort((a, b) => a.site - b.site || number(a.sort_order) - number(b.sort_order)))
const groups = computed(() => [...new Set(servers.value.map(server => server.server_group || '').filter(Boolean))])
const shown = computed(() => servers.value.filter(server => (group.value === null || (server.server_group || '') === group.value) && `${server.name} ${server.region} ${server.tags} ${server.server_group}`.toLowerCase().includes(search.value.toLowerCase())))
const stats = computed(() => state.sites.reduce((sum, site) => ({ total: sum.total + number(site.stats.total), online: sum.online + number(site.stats.online), offline: sum.offline + number(site.stats.offline) }), { total: 0, online: 0, offline: 0 }))
const speed = computed(() => servers.value.filter(server => online(server, state.now)).reduce((sum, server) => ({ rx: sum.rx + number(server.net_in_speed), tx: sum.tx + number(server.net_out_speed) }), { rx: 0, tx: 0 }))
const totals = computed(() => servers.value.reduce((sum, server) => ({ rx: sum.rx + number(server.net_rx), tx: sum.tx + number(server.net_tx) }), { rx: 0, tx: 0 }))
const connectionWarning = computed(() => state.sites.filter(site => ['reconnecting', 'stopped', 'invalid'].includes(site.status)))
const show = (field) => state.sites.some(site => site.ready && site.sysConfig[field] !== false)
const isOnline = server => online(server, state.now)
const siteFor = server => state.sites[server.site]
const asset = (server, path) => `${siteFor(server).base}/${path.replace(/^\//, '')}`
function toggle(server) {
  const key = serverKey(server), next = new Set(expanded.value)
  next.has(key) ? next.delete(key) : next.add(key)
  expanded.value = next
}
function expiry(server) {
  if (!server.expire_date) return '∞'
  const days = Math.ceil((new Date(`${server.expire_date}T23:59:59`).getTime() - state.now) / 86400000)
  return Number.isFinite(days) ? days < 0 ? t('expired') : `${days} ${t('days')}` : server.expire_date
}
</script>
<template>
  <section v-if="state.sites.some(site => site.listReady)" class="panel server-panel">
    <div class="table-toolbar" :class="{ 'has-groups': groups.length }">
      <div class="groups" role="group" :aria-label="t('servers')"><h2 v-if="!groups.length">{{ t('servers') }}</h2><template v-else><button :class="{ primary: group === null }" @click="group = null">{{ t('all') }} <small>{{ servers.length }}</small></button><button v-for="g in groups" :key="g" :class="{ primary: group === g }" @click="group = g">{{ g }}</button><button v-if="servers.some(s => !s.server_group)" :class="{ primary: group === '' }" @click="group = ''">{{ t('ungrouped') }}</button></template></div>
      <div class="summary"><span>{{ t('online') }} {{ stats.online }} / {{ stats.total }} · ↓ {{ compact(speed.rx) }}/s · ↑ {{ compact(speed.tx) }}/s</span><span v-if="show('show_tf')">{{ t('totalTraffic') }} ↓ {{ bytes(totals.rx) }} · ↑ {{ bytes(totals.tx) }}</span></div>
      <button class="search-toggle" :aria-label="t('search')" :aria-expanded="searchOpen" @click="searchOpen = !searchOpen; if (!searchOpen) search = ''"><Icon name="search" /></button>
    </div>
    <div v-if="searchOpen" class="search-field"><input v-model="search" type="search" :placeholder="t('search')" :aria-label="t('search')"></div>
    <table class="server-table"><thead><tr>
      <th class="col-status">{{ t('status') }}</th><th class="col-name">{{ t('name') }}</th><th class="col-region">{{ t('region') }}</th><th class="col-os">{{ t('os') }}</th><th class="col-uptime">{{ t('uptime') }}</th><th v-if="show('show_expire')" class="col-expiry">{{ t('expiry') }}</th><th class="col-load">{{ t('load') }}</th><th class="col-speed">{{ t('speed') }}</th><th class="col-bar">CPU</th><th class="col-bar">{{ t('ram') }}</th><th class="col-bar">{{ t('disk') }}</th><th v-if="show('show_tf')" class="col-traffic">{{ t('traffic') }}</th>
    </tr></thead><tbody>
      <template v-for="(server, i) in shown" :key="serverKey(server)">
        <tr class="server-row" :class="{ stripe: i % 2 }" tabindex="0" :aria-expanded="expanded.has(serverKey(server))" @click="toggle(server)" @keydown.enter="toggle(server)" @keydown.space.prevent="toggle(server)">
          <td class="col-status"><span class="dot" :class="{ online: isOnline(server), offline: !isOnline(server), pending: !server.last_updated }" :title="isOnline(server) ? t('online') : t('offline')" :aria-label="isOnline(server) ? t('online') : t('offline')"></span></td>
          <td class="col-name" :title="server.name"><span class="server-name">{{ server.name }}</span></td>
          <td class="col-region"><span v-if="server.region" class="region"><img :src="asset(server, `flags/${server.region.toLowerCase()}.svg`)" alt=""><span>{{ server.region }}</span></span><span v-else>—</span></td>
          <td class="col-os"><span v-if="server.os" class="os"><img :src="asset(server, getOSImage(server.os))" alt="">{{ distro(server.os) }}</span><span v-else>—</span></td>
          <td class="col-uptime">{{ isOnline(server) ? tableUptime(server, state.now, t('day')) : '—' }}</td>
          <td v-if="show('show_expire')" class="col-expiry">{{ siteFor(server).sysConfig.show_expire === false ? '—' : expiry(server) }}</td>
          <td class="col-load">{{ isOnline(server) ? (Number(String(server.load_avg || '0').split(/[ ,]+/)[0]) || 0).toFixed(2) : '—' }}</td>
          <td class="col-speed">{{ isOnline(server) ? `${compact(server.net_in_speed)} | ${compact(server.net_out_speed)}` : '— | —' }}</td>
          <td class="col-bar"><ProgressBar :value="isOnline(server) ? server.cpu ?? null : null" /></td>
          <td class="col-bar"><ProgressBar :value="isOnline(server) ? percent(server.ram_used, server.ram_total) : null" /></td>
          <td class="col-bar"><ProgressBar :value="isOnline(server) ? percent(server.disk_used, server.disk_total) : null" /></td>
          <td v-if="show('show_tf')" class="col-traffic"><ProgressBar v-if="siteFor(server).sysConfig.show_tf !== false" :value="percent(traffic(server), quota(server))" :label="`${compact(traffic(server))} / ${quota(server) ? compact(quota(server)) : '∞'}`" /><span v-else>—</span></td>
        </tr>
        <tr v-if="expanded.has(serverKey(server))" class="expanded-row" :class="{ stripe: i % 2 }"><td :colspan="10 + Number(show('show_expire')) + Number(show('show_tf'))"><div class="expanded-content"><ServerFacts :server="server" :switches="siteFor(server).sysConfig" /><div class="expanded-heading"><span>{{ t('latency') }}</span><a :href="serverHref(server)">{{ t('details') }}</a></div><template v-if="siteFor(server).sysConfig.show_three_net_details === true"><MetricChart v-if="server.ping?.length && probeSeries(server.ping, 'ping', siteFor(server).config, true).length" :rows="server.ping" :series="probeSeries(server.ping, 'ping', siteFor(server).config, true)" :title="t('latency')" unit="ms" compact /><MetricChart v-if="server.loss?.length && probeSeries(server.loss, 'loss', siteFor(server).config, true).length" :rows="server.loss" :series="probeSeries(server.loss, 'loss', siteFor(server).config, true)" :title="t('loss')" unit="%" :max="100" compact /></template></div></td></tr>
      </template>
      <tr v-if="!shown.length"><td colspan="12" class="empty">{{ t('empty') }}</td></tr>
    </tbody></table>
    <div v-if="connectionWarning.length || settings().theme_options?.show_connection_status === true" class="table-footer"><span v-for="site in connectionWarning.length ? connectionWarning : state.sites" :key="site.index" class="connection"><span class="connection-dot" :class="{ connected: site.status === 'live' }"></span>{{ state.sites.length > 1 ? `${site.config.site_title || site.base} · ` : '' }}{{ t(site.status) }}</span></div>
  </section>
</template>
