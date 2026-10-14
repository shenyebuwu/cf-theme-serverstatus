import { reactive } from 'vue'
import { Client, LiveConnection, apiBases, enabled } from './client.js'
import { HOURS, mergeServer, online, timestamp } from './metrics.js'

export const state = reactive({ sites: [], loading: true, error: '', detail: null, rows: [], hours: 0.167, historyLoading: false, historyError: '', paused: false, now: Date.now() })
let clients = [], connections = [], epoch = 0, route = null, detailAbort = null, historyEpoch = 0
let resumeTimer = null
const pendingBySite = new Map()

export const serverKey = (server) => `${server.site}:${server.id}`
export const serverHref = (server) => `#/server/${encodeURIComponent(server.id)}?site=${server.site}`
export const allServers = () => state.sites.flatMap(site => site.servers || [])
export const clientAt = (index) => clients[index]
export const settings = () => state.sites[0]?.config || {}

function stop() {
  connections.forEach(connection => connection.close()); connections = []
  pendingBySite.clear()
}
function fail(error, site) {
  if (error.status === 401) { location.assign(clients[site.index].adminUrl()); return }
  site.error = error.message
  if (error.status === 403) site.challenge = true
}
function applyPatches(index, patches) {
  const site = state.sites[index]
  site.servers = site.servers.map(server => {
    const patch = patches.get(String(server.id))
    if (!patch) return server
    const next = mergeServer(server, patch, site.sysConfig.show_three_net_details === true)
    const was = online(server, state.now), is = online(next)
    if (was !== is) { site.stats.online += is ? 1 : -1; site.stats.offline += is ? -1 : 1 }
    return next
  })
  if (route && route.site === index && state.detail) {
    const patch = patches.get(route.id)
    if (patch) {
      state.detail = mergeServer(state.detail, patch)
      // Live points extend only the short, live window. Longer ranges stay snapshots.
      if (state.hours <= 1) {
        const last = state.rows.at(-1)
        const point = { ...last, ...state.detail, timestamp: patch.sample_timestamp }
        if (!last || timestamp(point.timestamp) > timestamp(last.timestamp)) {
          state.rows = [...state.rows, point].filter(row => timestamp(row.timestamp) >= Date.now() - state.hours * 3600000).slice(-500)
        }
      }
    }
  }
}
function connect(index, current) {
  const site = state.sites[index]
  if (document.hidden || state.paused || site.challenge || !site.ready || current !== epoch) return
  const scope = route ? route.id : 'all'
  if (route && route.site !== index) return
  const ids = route ? [route.id] : site.servers.map(server => String(server.id))
  if (!ids.length) { site.status = 'idle'; return }
  connections.push(new LiveConnection(clients[index], scope, ids, {
    collect: patches => {
      if (current !== epoch) return
      const pending = pendingBySite.get(index) || new Map()
      for (const [id, patch] of patches) pending.set(id, { ...pending.get(id), ...patch })
      pendingBySite.set(index, pending)
    },
    status: status => { if (current === epoch) site.status = status },
    timeout: () => { if (current === epoch) { state.paused = true; stop(); state.sites.forEach(s => { s.status = 'paused' }) } }
  }))
}
async function list(index, force = false, current = epoch) {
  const site = state.sites[index]
  if (!site.configLoaded) return
  if (site.listReady && !force) return
  if (site.challenge) return
  const data = await clients[index].request('/api/servers')
  if (current !== epoch) return
  site.servers = (data.servers || []).map(server => ({ ...server, site: index }))
  site.stats = { total: 0, online: 0, offline: 0, ...data.stats }
  site.sysConfig = data.sysConfig || {}
  site.ready = true; site.listReady = true; site.error = ''
}
export async function loadHistory(hours = state.hours) {
  if (!HOURS.includes(Number(hours)) || !route) return
  const current = epoch, selected = { ...route }
  const historyCurrent = ++historyEpoch
  state.hours = Number(hours); state.historyLoading = true; state.historyError = ''
  detailAbort?.abort(); const controller = new AbortController(); detailAbort = controller
  try {
    const rows = await clients[selected.site].request(`/api/history/all?id=${encodeURIComponent(selected.id)}&hours=${state.hours}`, { signal: controller.signal })
    if (current !== epoch || historyCurrent !== historyEpoch) return
    state.rows = Array.isArray(rows) ? rows : []
  } catch (error) {
    if (current !== epoch || historyCurrent !== historyEpoch || controller.signal.aborted) return
    if (error.status === 403) { fail(error, state.sites[selected.site]); stop() }
    else state.historyError = error.status === 401 ? 'historyAuth' : error.message
  } finally { if (current === epoch && historyCurrent === historyEpoch) state.historyLoading = false }
}
export async function activate(next = null, refresh = false) {
  route = next
  const current = ++epoch
  stop(); detailAbort?.abort()
  state.error = ''
  if (document.hidden || state.paused) return
  if (!refresh) { state.detail = null; state.rows = []; state.hours = 0.167; state.historyError = '' }
  if (next) {
    const site = state.sites[next.site]
    if (!site) { state.error = 'Invalid site'; return }
    if (site.challenge || !site.configLoaded) return
    try {
      const server = await clients[next.site].request(`/api/server?id=${encodeURIComponent(next.id)}`)
      if (current !== epoch) return
      state.detail = { ...server, site: next.site }; site.sysConfig = { ...site.sysConfig, ...server.sysConfig }; site.ready = true; site.error = ''
      connect(next.site, current)
      await loadHistory()
    } catch (error) { if (current === epoch) { state.error = error.message; fail(error, site) } }
  } else {
    await Promise.all(state.sites.map(async site => {
      try { await list(site.index, refresh, current); connect(site.index, current) }
      catch (error) { if (current === epoch) fail(error, site) }
    }))
  }
}
export async function verified(index, token) {
  clients[index].token = token
  state.sites[index].challenge = false
  if (route) { await activate(route, true); return }
  // Independent gates must not refetch or reconnect other sites.
  const current = epoch
  try { await list(index, true, current); connect(index, current) }
  catch (error) { if (current === epoch) fail(error, state.sites[index]) }
}
export function continueLive() {
  state.paused = false
  void activate(route, true)
}
export async function initialize() {
  try {
    clients = apiBases().map(base => new Client(base))
    state.sites = clients.map((client, index) => ({ index, base: client.base, config: {}, servers: [], stats: { total: 0, online: 0, offline: 0 }, sysConfig: {}, status: 'idle', error: '', challenge: false, ready: false }))
    await Promise.all(clients.map(async (client, index) => {
      const site = state.sites[index]
      try {
        site.config = await client.configOnce()
        if (!enabled(site.config.is_public) && !site.config.authorization) { location.assign(client.adminUrl()); return }
        site.configLoaded = true
        site.challenge = enabled(site.config.turnstile_enabled) && !client.verified
      } catch (error) { fail(error, site) }
    }))
  } catch (error) { state.error = error.message }
  state.loading = false
}
document.addEventListener('visibilitychange', () => {
  clearTimeout(resumeTimer)
  if (document.hidden) {
    ++epoch; stop(); detailAbort?.abort()
    state.sites.forEach(site => { site.status = 'hidden' })
  } else if (!state.paused) {
    // Coalesce rapid visibility flips; this is the only automatic REST refresh.
    resumeTimer = setTimeout(() => void activate(route, true), 200)
  }
})
function tick() {
  const now = Date.now()
  if (!document.hidden) {
    // Commit data and the offline clock in one render, at most once per second.
    for (const [index, patches] of pendingBySite) applyPatches(index, patches)
    pendingBySite.clear()
    for (const site of state.sites) {
      const expired = site.servers.filter(server => online(server, state.now) && !online(server, now)).length
      site.stats.online = Math.max(0, site.stats.online - expired)
      site.stats.offline += expired
    }
    state.now = now
  }
  setTimeout(tick, 1000)
}
setTimeout(tick, 1000)
