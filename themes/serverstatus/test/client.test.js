import test from 'node:test'
import assert from 'node:assert/strict'
import { Client, LiveConnection, apiBases } from '../src/client.js'
import { batchPatches, compact, distro, gpu, mergeServer, online, probeValue, quota, tableUptime, traffic } from '../src/metrics.js'

globalThis.location = { origin: 'https://theme.example' }
const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

test('API origins are deduplicated and invalid origins are rejected', () => {
  assert.deepEqual(apiBases({ querySelector: () => ({ content: 'https://a.example/, https://b.example,https://a.example' }) }), ['https://a.example', 'https://b.example'])
  assert.throws(() => apiBases({ querySelector: () => ({ content: 'https://a.example/path' }) }))
})
test('config is fetched once and disabled Turnstile never sends cached headers', async () => {
  let count = 0
  const cache = storage(); cache.setItem('jwt_token', 'jwt'); cache.setItem('turnstile_verified', 'old')
  const client = new Client(location.origin, { storage: cache, fetcher: async (url, options) => {
    ++count
    assert.equal(options.headers.Authorization, 'Bearer jwt')
    assert.equal(options.headers['X-Turnstile-Verified'], undefined)
    return Response.json({ is_public: true, turnstile_enabled: false })
  } })
  await Promise.all([client.configOnce(), client.configOnce()])
  assert.equal(count, 1)
  await client.request('/api/servers')
  assert.equal(count, 2)
})
for (const isPublic of [true, false]) for (const turnstile of [true, false]) {
  test(`auth headers: public=${isPublic}, Turnstile=${turnstile}`, async () => {
    const cache = storage()
    if (!isPublic) cache.setItem('jwt_token', 'jwt')
    const calls = []
    const client = new Client('https://worker.example', { storage: cache, fetcher: async (url, options) => {
      calls.push(options.headers)
      return Response.json(url.endsWith('/api/config') ? { is_public: isPublic, turnstile_enabled: turnstile } : { servers: [], turnstile_verified: turnstile ? 'credential' : null })
    } })
    await client.configOnce(); client.token = 'challenge-token'
    await client.request('/api/servers'); await client.request('/api/server?id=one')
    assert.equal(calls[0]['X-Turnstile-Token'], undefined)
    assert.equal(calls[1]['X-Turnstile-Token'], turnstile ? 'challenge-token' : undefined)
    assert.equal(calls[2]['X-Turnstile-Verified'], turnstile ? 'credential' : undefined)
    assert.equal(calls[1].Authorization, isPublic ? undefined : 'Bearer jwt')
  })
}
test('401 clears JWT, 403 clears only the affected site credential', async () => {
  const cache = storage(); cache.setItem('jwt_token', 'jwt'); cache.setItem('cfsm_turnstile_verified:https://other.example', 'other')
  const client = new Client('https://worker.example', { storage: cache, fetcher: async () => Response.json({ error: 'Forbidden' }, { status: 403 }) })
  client.config = { turnstile_enabled: true }; client.set(client.verifiedKey, 'old'); client.token = 'old'
  await assert.rejects(client.request('/api/servers'), error => error.status === 403)
  assert.equal(client.verified, ''); assert.equal(client.token, '')
  assert.equal(cache.getItem('cfsm_turnstile_verified:https://other.example'), 'other')
  client.fetcher = async () => Response.json({ error: 'Unauthorized' }, { status: 401 })
  await assert.rejects(client.request('/api/servers'), error => error.status === 401)
  assert.equal(cache.getItem('jwt_token'), undefined)
  assert.equal(client.adminUrl(), 'https://worker.example/admin#/admin')
})
test('incremental samples retain report fields and accept all payload aliases', () => {
  const now = Date.now()
  const patches = batchPatches({ type: 'batchUpdate', updates: [{ serverId: 'one', samples: [
    { ts: now, payload: { disk_used: 42, ping_ct: null, loss_ct: 0, name: 'injected' } },
    { ts: now + 1, metrics: { cpu: 9 } }, { ts: now + 2, data: { cpu: 12, ram_used: 30 } }
  ] }] })
  const merged = mergeServer({ id: 'one', name: 'safe', disk_total: 100, gpu_info: [{ id: '0', info: 5 }], ping: [] }, patches.get('one'), true)
  assert.equal(merged.name, 'safe'); assert.equal(merged.cpu, 12); assert.equal(merged.disk_used, 42); assert.equal(merged.disk_total, 100)
  assert.equal(merged.gpu_info[0].info, 5); assert.equal(merged.ping[0].ct, null)
})
test('CFSM units, probe tri-state and GPU JSON are preserved', () => {
  assert.equal(probeValue(false), undefined); assert.equal(probeValue(null), null); assert.equal(probeValue(0), 0)
  assert.equal(quota({ traffic_limit: '1000' }), 1000 * 1024 ** 3)
  assert.equal(traffic({ net_rx_monthly: 7, net_tx_monthly: 5, traffic_calc_type: 'max' }), 7)
  assert.equal(traffic({ net_rx_monthly: 7, net_tx_monthly: 5, traffic_calc_type: 'ul' }), 5)
  assert.equal(online({ last_updated: Date.now() - 300001 }), false)
  assert.deepEqual(gpu('{"id":0}'), []); assert.deepEqual(gpu('[{"id":"0","info":0}]'), [{ id: '0', info: 0 }])
})
test('classic table formatting keeps units compact and OS versions visible', () => {
  assert.equal(compact(1024 * 5.27), '5.27K')
  assert.equal(compact(1024 ** 4 * 1.53), '1.53T')
  assert.equal(compact(0), '0B')
  assert.equal(distro('Debian GNU/Linux 13 (trixie)'), 'Debian 13')
  const now = Date.now()
  assert.equal(tableUptime({ boot_time: now - 76 * 86400000 }, now, '天'), '76 天')
  assert.equal(tableUptime({ boot_time: now - 3594000 }, now, '天'), '0:59:54')
  assert.equal(tableUptime({}, now, '天'), '—')
})

function harness() {
  let time = 0, serial = 0
  const tasks = new Map(), sockets = []
  const clock = { setTimeout(fn, delay) { const id = ++serial; tasks.set(id, { fn, at: time + delay }); return id }, clearTimeout(id) { tasks.delete(id) } }
  const advance = ms => {
    const until = time + ms
    while (true) {
      const entry = [...tasks.entries()].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!entry) break
      time = entry[1].at; tasks.delete(entry[0]); entry[1].fn()
    }
    time = until
  }
  class Socket {
    constructor(url) { this.url = url; this.sent = []; sockets.push(this) }
    send(value) { this.sent.push(JSON.parse(value)) }
    close() { this.closed = true; this.onclose?.() }
  }
  return { clock, Socket, advance, tasks, sockets }
}
test('socket uses per-site IDs, JWT for cross-origin, one-second merge throttle, clean shutdown', () => {
  const h = harness(), cache = storage(); cache.setItem('jwt_token', 'jwt')
  const client = new Client('https://worker.example', { storage: cache }); client.config = {}
  const updates = []
  const live = new LiveConnection(client, 'all', ['one'], { update: patches => updates.push(patches) }, h)
  const socket = h.sockets[0]; socket.onopen()
  assert.equal(new URL(socket.url).searchParams.get('token'), 'jwt')
  assert.deepEqual(socket.sent[0], { type: 'subscribe', scope: 'all', ids: ['one'] })
  const send = data => socket.onmessage({ data: JSON.stringify({ type: 'batchUpdate', updates: [{ serverId: 'one', samples: [{ data }] }, { serverId: 'wrong-site', samples: [{ data: { cpu: 100 } }] }] }) })
  send({ cpu: 1, disk_used: 8 }); send({ cpu: 2 }); h.advance(999)
  assert.equal(updates.length, 0); h.advance(1)
  assert.equal(updates.length, 1); assert.equal(updates[0].get('one').cpu, 2); assert.equal(updates[0].get('one').disk_used, 8); assert.equal(updates[0].size, 1)
  socket.close(); live.close(); h.advance(100000)
  assert.equal(h.sockets.length, 1); assert.equal(h.tasks.size, 0)
})
test('single-server subscription and same-origin cookie authentication', () => {
  const h = harness(), cache = storage(); cache.setItem('jwt_token', 'jwt')
  const client = new Client(location.origin, { storage: cache }); client.config = {}
  const live = new LiveConnection(client, 'server-uuid', ['server-uuid'], {}, h)
  assert.equal(new URL(h.sockets[0].url).searchParams.get('subscribe'), 'server-uuid')
  assert.equal(new URL(h.sockets[0].url).searchParams.has('token'), false)
  live.close()
})
test('reconnect backoff is exponential and stops after ten attempts', () => {
  const h = harness(), client = new Client(location.origin, { storage: storage() }); client.config = {}
  const live = new LiveConnection(client, 'all', ['one'], {}, h)
  h.sockets[0].close(); h.advance(999); assert.equal(h.sockets.length, 1)
  h.advance(1); assert.equal(h.sockets.length, 2)
  h.sockets[1].close(); h.advance(1999); assert.equal(h.sockets.length, 2)
  h.advance(1); assert.equal(h.sockets.length, 3)
  for (let i = 2; i < 11; i++) { h.sockets[i].onopen(); h.sockets[i].close(); h.advance(30000) }
  h.advance(100000); assert.equal(h.sockets.length, 11); assert.equal(h.tasks.size, 0)
  live.close()
})
test('configured lifetime stops the socket and requires explicit continuation', () => {
  const h = harness(), client = new Client(location.origin, { storage: storage() }); client.config = { frontend_ws_timeout_minutes: 1 }
  let timedOut = false
  const live = new LiveConnection(client, 'all', ['one'], { timeout: () => { timedOut = true } }, h)
  h.sockets[0].onopen(); h.advance(60000)
  assert.equal(timedOut, true); assert.equal(live.stopped, true); assert.equal(h.sockets[0].closed, true)
  h.advance(300000); assert.equal(h.sockets.length, 1)
})
