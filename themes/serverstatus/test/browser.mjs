import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({ root, configFile: path.join(root, 'vite.config.js'), server: { host: '127.0.0.1', port: 5174, strictPort: true } })
await server.listen()
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
const origin = 'http://127.0.0.1:5174'
const artifacts = path.join(root, 'artifacts')
await fs.mkdir(artifacts, { recursive: true })
const names = ['Tokyo · Edge 01', 'Hong Kong · Core', 'Singapore · Transit', 'Frankfurt · Cloud', 'Los Angeles · West', 'Shanghai · Gateway']
const regions = ['JP', 'HK', 'SG', 'DE', 'US', 'CN']
const now = Date.now()
function nodes() {
  return names.map((name, i) => ({
    id: `server-${i}`, name, region: regions[i], server_group: i < 3 ? 'Asia Pacific' : 'Global', tags: 'production,edge', sort_order: i,
    cpu: 8.7 + i * 17, cpu_cores: 4, cpu_info: 'AMD EPYC 7B13', os: i % 2 ? 'Ubuntu 24.04' : 'Debian 12', arch: 'x86_64', kernel_version: '6.8.0',
    ram_total: 8192, ram_used: 2100 + i * 950, swap_total: 1024, swap_used: 20, disk_total: 102400, disk_used: 21400 + i * 10000,
    net_in_speed: 2400000 + i * 850000, net_out_speed: 700000 + i * 120000, net_rx_monthly: 1024 ** 3 * (67 + i * 30), net_tx_monthly: 1024 ** 3 * 15,
    net_rx: 1024 ** 4 * 1.2, net_tx: 1024 ** 3 * 345, traffic_limit: '500', traffic_calc_type: 'total', reset_day: 1,
    price: '5', currency: '$', billing_cycle: 'month', expire_date: '2027-04-30', boot_time: now - (i + 1) * 86400000 * 12,
    last_updated: now - (i === 5 ? 600000 : 1000), load_avg: '0.14 0.22 0.10', processes: 132, tcp_conn: 34, udp_conn: 6,
    ping_ct: 28, ping_cu: 35, ping_cm: null, loss_ct: 0, loss_cu: 0, loss_cm: null,
    disk: { read_bps: 1400000, write_bps: 2300000 }, gpu_info: '[{"id":"0","name":"NVIDIA RTX 3060","info":12}]',
    ping: Array.from({ length: 20 }, (_, n) => ({ ts: now - (20 - n) * 360000, ct: 25 + n % 5, cu: 36 + n % 7, cm: null })),
    loss: Array.from({ length: 20 }, (_, n) => ({ ts: now - (20 - n) * 360000, ct: 0, cu: n % 7 === 0 ? 2 : 0, cm: null }))
  }))
}
function history() {
  return Array.from({ length: 40 }, (_, i) => ({ ...nodes()[0], timestamp: now - (40 - i) * 15000, cpu: 20 + Math.sin(i / 3) * 15, ram_used: 3200 + Math.cos(i / 5) * 300, net_in_speed: 2400000 + Math.sin(i / 4) * 1500000, ping_ct: 25 + i % 6, ping_cu: 36 + i % 7, ping_cm: null }))
}
const switches = { show_price: true, show_expire: true, show_tf: true, show_three_net_details: true }
async function scenario({ isPublic = true, turnstile = false, jwt = false, timeout = 0, meta = '', deepLink = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const page = await context.newPage()
  const calls = [], subscriptions = [], sockets = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ jwt }) => { if (jwt) localStorage.setItem('jwt_token', 'test-jwt') }, { jwt })
  if (meta) await page.route(`${origin}/`, async route => {
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('</head>', `<meta name="apiBase" content="${meta}"></head>`) })
  })
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', route => route.fulfill({ contentType: 'application/javascript', body: `window.turnstile = { render(el, options) { el.textContent = 'Security check (test fixture)'; setTimeout(() => options.callback('test-challenge'), 10); return 1; }, remove() {}, reset() {} }` }))
  await page.route(`${origin}/admin`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Built-in admin login (fixture)</h1>' }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), headers = route.request().headers()
    calls.push({ url, headers })
    let data, status = 200
    if (url.pathname === '/api/config') data = { is_public: isPublic, authorization: jwt, turnstile_enabled: turnstile, turnstile_site_key: 'test-key', preferred_theme: 'light', default_language: 'zh', site_title: 'ServerStatus Monitor', custom_ct_name: 'China Telecom', version: '2.8.7', frontend_ws_timeout_minutes: timeout }
    else if (!isPublic && headers.authorization !== 'Bearer test-jwt') { status = 401; data = { error: 'Unauthorized' } }
    else if (turnstile && !headers['x-turnstile-token'] && !headers['x-turnstile-verified']) { status = 403; data = { error: 'Forbidden' } }
    else if (url.pathname === '/api/servers') data = { servers: nodes(), stats: { total: 6, online: 5, offline: 1 }, sysConfig: switches, ...(turnstile ? { turnstile_verified: 'test-credential' } : {}) }
    else if (url.pathname === '/api/server') data = { ...nodes().find(node => node.id === url.searchParams.get('id')), sysConfig: {}, ...(turnstile ? { turnstile_verified: 'test-credential' } : {}) }
    else if (url.pathname === '/api/history/all') data = history()
    else throw new Error(`Unexpected endpoint: ${url.pathname}`)
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.route('**/flags/*.svg', async route => { const name = path.basename(new URL(route.request().url()).pathname); await route.fulfill({ contentType: 'image/svg+xml', body: await fs.readFile(path.resolve(root, '../../public/flags', name)) }) })
  await page.route('**/os-icons/*', async route => { const name = path.basename(new URL(route.request().url()).pathname); await route.fulfill({ contentType: 'image/svg+xml', body: await fs.readFile(path.resolve(root, '../../public/os-icons', name)) }) })
  await page.routeWebSocket('**/api/ws*', ws => {
    sockets.push(ws)
    ws.onMessage(message => { subscriptions.push({ url: ws.url(), data: JSON.parse(message) }) })
    setTimeout(() => {
      try { ws.send(JSON.stringify({ type: 'batchUpdate', ts: Date.now(), updates: [{ serverId: 'server-0', samples: [{ ts: Date.now(), data: { cpu: 22.5, ram_used: 3456 } }] }] })) } catch { /* Socket may have been closed by navigation. */ }
    }, 50)
  })
  await page.goto(`${origin}/${deepLink ? '#/server/server-0?site=0' : '#/'}`)
  const count = pathname => calls.filter(call => call.url.pathname === pathname).length
  return { context, page, calls, subscriptions, sockets, errors, count }
}
try {
  const a = await scenario()
  try { await a.page.locator('.server-row').first().waitFor({ timeout: 10000 }) }
  catch (error) { console.log({ errors: a.errors, calls: a.calls.map(call => call.url.href), body: await a.page.locator('body').textContent() }); throw error }
  await a.page.waitForTimeout(1200)
  assert.equal(a.count('/api/config'), 1); assert.equal(a.count('/api/servers'), 1)
  assert.equal(await a.page.locator('.server-row').count(), 6)
  assert.match(await a.page.locator('.server-row').first().textContent(), /22\.5%/)
  assert.match(a.subscriptions[0].url, /subscribe=all/)
  assert.equal(a.subscriptions[0].data.ids.length, 6)
  assert.match(await a.page.locator('.admin').getAttribute('href'), /\/admin#\/admin$/)
  await a.page.screenshot({ path: path.join(artifacts, 'desktop-light.png'), fullPage: true })
  await a.page.locator('.server-row').first().click()
  await a.page.locator('.expanded-content canvas').first().waitFor()
  assert.equal(a.count('/api/history/all'), 0)
  await a.page.locator('.expanded-heading a').click()
  await a.page.locator('.detail-main canvas').first().waitFor()
  await a.page.waitForTimeout(300)
  assert.equal(a.count('/api/server'), 1); assert.equal(a.count('/api/history/all'), 1)
  assert.equal(a.calls.find(call => call.url.pathname === '/api/history/all').url.searchParams.get('hours'), '0.167')
  assert.match(a.subscriptions.at(-1).url, /subscribe=server-0/)
  await a.page.screenshot({ path: path.join(artifacts, 'detail-light.png'), fullPage: true })
  await a.page.locator('.ranges button').nth(2).click()
  await a.page.waitForTimeout(250); assert.equal(a.count('/api/history/all'), 2)
  await a.page.locator('.back-link').click()
  await a.page.locator('.server-row').first().waitFor(); assert.equal(a.count('/api/servers'), 1)
  await a.page.getByPlaceholder('搜索服务器').fill('Tokyo'); assert.equal(await a.page.locator('.server-row').count(), 1)
  await a.page.getByPlaceholder('搜索服务器').fill('')
  await a.page.locator('.toolbox button').click()
  await a.page.screenshot({ path: path.join(artifacts, 'desktop-dark.png'), fullPage: true })
  await a.page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await a.page.screenshot({ path: path.join(artifacts, 'mobile-dark.png'), fullPage: true })
  for (const width of [360, 320, 768]) {
    await a.page.setViewportSize({ width, height: 844 })
    assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}px`)
  }
  await a.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await a.page.waitForTimeout(300); const hiddenCount = a.calls.length
  await a.page.waitForTimeout(600); assert.equal(a.calls.length, hiddenCount)
  await a.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await a.page.waitForTimeout(500); assert.equal(a.count('/api/servers'), 2); assert.equal(a.count('/api/config'), 1)
  assert.deepEqual(a.errors, []); await a.context.close()
  console.log('PASS: desktop/mobile layout, charts, route lifecycle, per-server WS, no polling, visibility refresh')

  for (const isPublic of [true, false]) for (const turnstile of [true, false]) {
    const s = await scenario({ isPublic, turnstile, jwt: !isPublic })
    await s.page.locator('.server-row').first().waitFor()
    assert.equal(s.count('/api/config'), 1); assert.equal(s.count('/api/servers'), 1)
    await s.page.locator('.nav nav a').nth(1).click()
    await s.page.locator('.detail-main canvas').first().waitFor()
    assert.equal(s.count('/api/history/all'), 1)
    if (turnstile) {
      assert.equal(s.calls.find(call => call.url.pathname === '/api/servers').headers['x-turnstile-token'], 'test-challenge')
      assert.equal(s.calls.find(call => call.url.pathname === '/api/server').headers['x-turnstile-verified'], 'test-credential')
    }
    if (!isPublic) assert.equal(s.calls.find(call => call.url.pathname === '/api/servers').headers.authorization, 'Bearer test-jwt')
    assert.deepEqual(s.errors, []); await s.context.close()
    console.log(`PASS: public=${isPublic}, Turnstile=${turnstile} (mocked verifier)`)
  }

  const anonymous = await scenario({ isPublic: false })
  await anonymous.page.waitForURL('**/admin#/admin')
  assert.equal(anonymous.count('/api/servers'), 0)
  assert.equal(anonymous.count('/api/config'), 1)
  await anonymous.context.close(); console.log('PASS: private anonymous visitor redirects to built-in admin')

  const direct = await scenario({ deepLink: true })
  await direct.page.locator('.detail-main canvas').first().waitFor()
  await direct.page.setViewportSize({ width: 390, height: 844 })
  await direct.page.waitForTimeout(300)
  assert.equal(await direct.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await direct.page.screenshot({ path: path.join(artifacts, 'detail-mobile.png'), fullPage: true })
  assert.equal(direct.count('/api/servers'), 0)
  await direct.page.locator('.back-link').click()
  await direct.page.locator('.server-row').first().waitFor()
  assert.equal(direct.count('/api/servers'), 1); assert.deepEqual(direct.errors, [])
  await direct.context.close(); console.log('PASS: direct detail URL then list')

  const multi = await scenario({ isPublic: false, jwt: true, turnstile: true, meta: 'https://worker-a.example,https://worker-b.example' })
  await multi.page.locator('.server-row').first().waitFor()
  await multi.page.waitForTimeout(200)
  assert.equal(multi.count('/api/config'), 2); assert.equal(multi.count('/api/servers'), 2)
  assert.equal(multi.subscriptions.length, 2)
  assert(multi.subscriptions.every(sub => sub.data.ids.length === 6 && new URL(sub.url).searchParams.get('token') === 'test-jwt'))
  assert.deepEqual(multi.errors, []); await multi.context.close(); console.log('PASS: multi-site cross-origin JWT and scoped IDs')

  const timed = await scenario({ timeout: 0.002 })
  await timed.page.locator('[role="dialog"]').waitFor()
  const socketCount = timed.sockets.length
  await timed.page.waitForTimeout(400); assert.equal(timed.sockets.length, socketCount)
  await timed.page.getByRole('button', { name: '保持暂停' }).click()
  await timed.page.waitForTimeout(250); assert.equal(timed.sockets.length, socketCount)
  assert.deepEqual(timed.errors, []); await timed.context.close(); console.log('PASS: configured timeout stays paused')
} finally { await browser.close(); await server.close() }
