<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { activate, allServers, clientAt, continueLive, initialize, settings, state } from './store.js'
import { language, setLanguage, t } from './i18n.js'
import TurnstileGate from './components/TurnstileGate.vue'

const route = useRoute(), ready = ref(false), dark = ref(false), timeoutDismissed = ref(false)
const htmlTitle = document.title
const siteTitle = computed(() => settings().site_title || htmlTitle || 'CF-Server-Monitor')
const selectedSite = computed(() => Math.max(0, Number(route.query.site) || 0))
const admin = computed(() => clientAt(selectedSite.value)?.adminUrl() || '/admin#/admin')
const firstServer = computed(() => allServers()[0])
const media = matchMedia('(prefers-color-scheme: dark)')
let preference = ''
function applyTheme() {
  const selected = preference || settings().preferred_theme || 'auto'
  dark.value = selected === 'auto' ? media.matches : selected === 'dark'
  document.documentElement.classList.toggle('dark', dark.value)
}
function toggleTheme() {
  preference = dark.value ? 'light' : 'dark'
  try { localStorage.setItem('theme_preference', preference) } catch { /* Optional preference. */ }
  applyTheme()
}
media.addEventListener('change', applyTheme)
async function navigate() {
  if (!ready.value) return
  await activate(route.params.id ? { id: String(route.params.id), site: selectedSite.value } : null)
}
watch(() => route.fullPath, navigate)
watch(() => state.paused, paused => { if (paused) timeoutDismissed.value = false })
watch([siteTitle, () => state.detail?.name], ([title, name]) => { document.title = name ? `${name} · ${title}` : title })
onMounted(async () => {
  await initialize()
  try { preference = localStorage.getItem('theme_preference') || ''; setLanguage(localStorage.getItem('language_preference') || settings().default_language, false) }
  catch { setLanguage(settings().default_language, false) }
  applyTheme(); ready.value = true
  await navigate()
})
</script>
<template>
  <div class="app-shell">
    <header class="nav"><div class="nav-inner">
      <a href="#/" class="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v6H3zM3 14h18v6H3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 7h1m-1 10h1m9-10h2m-2 10h2" stroke="currentColor" stroke-width="1.8"/></svg><span>{{ siteTitle }}</span></a>
      <nav><a href="#/" :class="{ active: !route.params.id }">⌂ <span>{{ t('home') }}</span></a><a v-if="firstServer || route.params.id" :href="route.params.id ? route.fullPath && `#${route.fullPath}` : `#/server/${encodeURIComponent(firstServer.id)}?site=${firstServer.site}`" :class="{ active: !!route.params.id }">▥ <span>{{ t('monitor') }}</span></a></nav>
      <a class="admin" :href="admin">♙ <span>{{ t('admin') }}</span></a>
    </div></header>
    <main>
      <div v-if="state.loading" class="panel empty">{{ t('loading') }}</div>
      <p v-if="state.error" class="alert" role="alert">{{ state.error }}</p>
      <template v-for="site in state.sites" :key="site.index">
        <p v-if="site.error && !site.challenge" class="alert" role="alert">{{ site.config.site_title || site.base }}: {{ site.error }}</p>
        <TurnstileGate v-if="site.challenge && (!route.params.id || site.index === selectedSite)" :site="site" />
      </template>
      <div v-if="state.paused" class="pause-banner">{{ t('paused') }} <button @click="continueLive">{{ t('continue') }}</button></div>
      <RouterView v-if="ready" />
    </main>
    <footer>{{ siteTitle }} | ServerStatus | <a href="https://github.com/huilang-me/CF-Server-Monitor/" target="_blank" rel="noreferrer">Powered by CF-Server-Monitor</a> <span v-if="settings().version">v{{ settings().version }}</span></footer>
    <aside class="toolbox"><select :aria-label="t('language')" :value="language" @change="setLanguage($event.target.value)"><option value="zh">中文</option><option value="en">EN</option><option value="es">ES</option></select><button :title="t('theme')" :aria-label="t('theme')" @click="toggleTheme">{{ dark ? '☼' : '☾' }}</button></aside>
    <div v-if="state.paused && !timeoutDismissed" class="modal-backdrop"><section class="panel timeout-dialog" role="dialog" aria-modal="true" :aria-label="t('paused')"><h2>{{ t('paused') }}</h2><p>{{ t('timeout') }}</p><div class="dialog-actions"><button @click="timeoutDismissed = true">{{ t('keepPaused') }}</button><button class="primary" @click="continueLive">{{ t('continue') }}</button></div></section></div>
  </div>
</template>
