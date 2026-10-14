export const HOURS = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168]
export const PROBES = ['ct', 'cu', 'cm', 'bd', 'node_1', 'node_2', 'node_3', 'node_4']
export const timestamp = (value, fallback = 0) => {
  if (value == null || value === '') return fallback
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e10 ? numeric * 1000 : numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
export const online = (server, now = Date.now()) => {
  const last = timestamp(server?.last_updated)
  return last > 0 && now - last < 300000
}
export const number = (value) => Math.max(0, Number(value) || 0)
export const percent = (used, total) => number(total) ? number(used) / number(total) * 100 : null
export const bytes = (value) => {
  const n = number(value)
  const i = n ? Math.min(4, Math.max(0, Math.floor(Math.log(n) / Math.log(1024)))) : 0
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][i]}`
}
export const duration = (seconds) => {
  const n = number(seconds)
  return n >= 86400 ? `${Math.floor(n / 86400)}d` : n >= 3600 ? `${Math.floor(n / 3600)}h` : `${Math.floor(n / 60)}m`
}
export const uptime = (server, now = Date.now()) => duration((now - timestamp(server.boot_time, now)) / 1000)
export const traffic = (server) => {
  const rx = number(server.net_rx_monthly), tx = number(server.net_tx_monthly)
  return server.traffic_calc_type === 'dl' ? rx : server.traffic_calc_type === 'ul' ? tx : server.traffic_calc_type === 'max' ? Math.max(rx, tx) : rx + tx
}
// CFSM stores traffic quotas in GB, not bytes (unlike monitor-probe).
export const quota = (server) => number(parseFloat(server.traffic_limit)) * 1024 ** 3
export const gpu = (value) => {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object') : []
  } catch { return [] }
}
export const probeValue = (value) => value === false || value === 'false' || value === undefined || value === '' ? undefined : value === null ? null : Number.isFinite(Number(value)) ? Number(value) : undefined

const LIVE_FIELDS = new Set([
  'cpu', 'ram_total', 'ram_used', 'swap_total', 'swap_used', 'disk_total', 'disk_used', 'disk',
  'net_in_speed', 'net_out_speed', 'net_rx', 'net_tx', 'net_rx_monthly', 'net_tx_monthly',
  'load_avg', 'processes', 'tcp_conn', 'udp_conn', 'boot_time', 'gpu_info', 'cpu_cores',
  'cpu_info', 'arch', 'os', 'kernel_version', 'region', 'ip_v4', 'ip_v6', 'agent_version',
  ...PROBES.flatMap(key => [`ping_${key}`, `loss_${key}`])
])

export function batchPatches(message) {
  const patches = new Map()
  if (message?.type !== 'batchUpdate') return patches
  for (const update of message.updates || []) {
    if (!update?.serverId || !Array.isArray(update.samples)) continue
    const patch = patches.get(String(update.serverId)) || {}
    const samples = [...update.samples].sort((a, b) => timestamp(a?.ts ?? a?.timestamp) - timestamp(b?.ts ?? b?.timestamp))
    for (const sample of samples) {
      const data = sample?.data || sample?.payload || sample?.metrics
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue
      for (const [key, value] of Object.entries(data)) {
        if (LIVE_FIELDS.has(key) && value !== undefined) patch[key] = value
      }
      patch.sample_timestamp = timestamp(sample.ts ?? sample.timestamp ?? data.timestamp ?? message.ts, Date.now())
      patch.last_updated = Date.now()
    }
    if (patch.last_updated) patches.set(String(update.serverId), patch)
  }
  return patches
}

export function mergeServer(server, patch, windowEnabled = false) {
  const merged = { ...server, ...patch }
  if (windowEnabled) {
    for (const kind of ['ping', 'loss']) {
      if (!PROBES.some(key => Object.hasOwn(patch, `${kind}_${key}`))) continue
      const point = { ts: patch.sample_timestamp }
      for (const key of PROBES) point[key] = merged[`${kind}_${key}`]
      // Keep REST's real window points; WS points require no history queries.
      merged[kind] = [...(server[kind] || []), point].filter(row => timestamp(row.ts) >= Date.now() - 7200000).slice(-20)
    }
  }
  return merged
}
