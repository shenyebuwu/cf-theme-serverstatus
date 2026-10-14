import { batchPatches } from './metrics.js'

export class ApiError extends Error {
  constructor(message, status = 0) { super(message); this.status = status }
}
const enabled = (value) => value === true || value === 'true'
export { enabled }

export function apiBases(doc = document, loc = location) {
  const raw = doc.querySelector('meta[name="apiBase"]')?.content
  const bases = [...new Set((raw || loc.origin).split(',').map(v => v.trim().replace(/\/+$/, '')).filter(Boolean))]
  return bases.map(base => {
    const url = new URL(base)
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Invalid API_BASE origin')
    return url.origin
  })
}

export class Client {
  constructor(base, { fetcher = fetch, storage = localStorage } = {}) {
    this.base = base; this.fetcher = (...args) => fetcher(...args); this.storage = storage
    this.configPromise = null; this.config = null; this.token = ''
  }
  get(key) { try { return this.storage.getItem(key) || '' } catch { return '' } }
  set(key, value) { try { value ? this.storage.setItem(key, value) : this.storage.removeItem(key) } catch { /* Memory tokens still work without storage. */ } }
  get verifiedKey() { return `cfsm_turnstile_verified:${this.base}` }
  get verified() { return this.get(this.verifiedKey) || (this.base === location.origin ? this.get('turnstile_verified') : '') }
  adminUrl() { return `${this.base}/admin#/admin` }
  configOnce() {
    this.configPromise ??= this.request('/api/config', { config: true }).then(data => (this.config = data))
    return this.configPromise
  }
  async request(path, { config = false, signal } = {}) {
    const headers = {}
    const jwt = this.get('jwt_token')
    if (jwt) headers.Authorization = `Bearer ${jwt}`
    if (!config && enabled(this.config?.turnstile_enabled)) {
      if (this.verified) headers['X-Turnstile-Verified'] = this.verified
      else if (this.token) headers['X-Turnstile-Token'] = this.token
    }
    let res
    try { res = await this.fetcher(`${this.base}${path}`, { headers, credentials: 'include', signal: signal || AbortSignal.timeout(20000) }) }
    catch (error) { throw new ApiError(error.message || 'Network error') }
    if (res.status === 401) this.set('jwt_token', '')
    if (res.status === 403) { this.set(this.verifiedKey, ''); if (this.base === location.origin) this.set('turnstile_verified', ''); this.token = '' }
    let data
    try { data = await res.json() } catch { throw new ApiError(`Invalid JSON (HTTP ${res.status})`, res.status) }
    if (!res.ok) throw new ApiError(data.error || data.message || `HTTP ${res.status}`, res.status)
    if (data?.turnstile_verified) {
      this.set(this.verifiedKey, data.turnstile_verified)
      if (this.base === location.origin) this.set('turnstile_verified', data.turnstile_verified)
      this.token = ''
    }
    return data
  }
}

export class LiveConnection {
  constructor(client, scope, ids, handlers, { Socket = WebSocket, clock = globalThis } = {}) {
    this.client = client; this.scope = scope; this.ids = ids; this.handlers = handlers
    this.Socket = Socket; this.clock = clock; this.attempts = 0; this.stopped = false
    this.pending = new Map(); this.timers = new Set(); this.socket = null; this.flushTimer = null
    this.connect()
  }
  later(fn, delay) {
    const id = this.clock.setTimeout(() => { this.timers.delete(id); fn() }, delay)
    this.timers.add(id); return id
  }
  connect() {
    if (this.stopped) return
    const url = new URL('/api/ws', this.client.base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('subscribe', this.scope)
    const jwt = this.client.get('jwt_token')
    if (jwt && new URL(this.client.base).origin !== location.origin) url.searchParams.set('token', jwt)
    let socket
    try { socket = new this.Socket(url.href) } catch { this.retry(); return }
    this.socket = socket
    socket.onopen = () => {
      if (this.stopped || this.socket !== socket) return
      socket.send(JSON.stringify({ type: 'subscribe', scope: this.scope, ids: this.ids }))
      this.handlers.status?.('live')
      // Do not reset attempts on open: an immediately closing socket must stay bounded.
      const minutes = Number(this.client.config?.frontend_ws_timeout_minutes)
      if (Number.isFinite(minutes) && minutes > 0) {
        this.lifetime = this.later(() => { this.close(); this.handlers.timeout?.() }, Math.min(1440, minutes) * 60000)
      }
    }
    socket.onmessage = event => {
      if (this.stopped || this.socket !== socket) return
      try {
        const patches = batchPatches(JSON.parse(event.data))
        for (const [id, patch] of patches) {
          if (this.scope !== 'all' && id !== this.scope) continue
          if (this.scope === 'all' && !this.ids.includes(id)) continue
          this.pending.set(id, { ...this.pending.get(id), ...patch })
        }
        if (this.pending.size) {
          this.attempts = 0
          if (this.handlers.collect) {
            this.handlers.collect(this.pending)
            this.pending = new Map()
            return
          }
          if (!this.flushTimer) this.flushTimer = this.later(() => {
            this.flushTimer = null
            const pending = this.pending; this.pending = new Map()
            if (!this.stopped) this.handlers.update?.(pending)
          }, 1000)
        }
      } catch { this.handlers.status?.('invalid') }
    }
    socket.onerror = () => socket.close()
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped) return
      this.socket = null
      if (this.lifetime) { this.clock.clearTimeout(this.lifetime); this.timers.delete(this.lifetime); this.lifetime = null }
      this.retry()
    }
  }
  retry() {
    if (this.stopped) return
    this.handlers.status?.(this.attempts >= 10 ? 'stopped' : 'reconnecting')
    if (this.attempts >= 10) return
    this.later(() => this.connect(), Math.min(30000, 1000 * 2 ** this.attempts++))
  }
  close() {
    this.stopped = true
    for (const id of this.timers) this.clock.clearTimeout(id)
    this.timers.clear(); this.pending.clear()
    if (this.socket) {
      this.socket.onopen = this.socket.onmessage = this.socket.onclose = this.socket.onerror = null
      this.socket.close(); this.socket = null
    }
  }
}
