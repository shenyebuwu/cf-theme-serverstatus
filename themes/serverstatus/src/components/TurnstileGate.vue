<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { verified, clientAt } from '../store.js'
import { t } from '../i18n.js'
const props = defineProps({ site: Object })
const element = ref(null), error = ref('')
let widget, disposed = false
let scriptPromise
function load() {
  if (window.turnstile) return Promise.resolve()
  if (window.__cfsmTurnstile) return window.__cfsmTurnstile
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.onload = resolve
    script.onerror = () => { window.__cfsmTurnstile = null; reject(new Error(t('verifyError'))) }
    document.head.append(script)
  })
  return (window.__cfsmTurnstile = scriptPromise)
}
async function render() {
  error.value = ''
  try {
    if (!props.site.config.turnstile_site_key) throw new Error('Missing Turnstile site key')
    await load()
    if (disposed) return
    if (widget !== undefined) window.turnstile.remove(widget)
    widget = window.turnstile.render(element.value, {
      sitekey: props.site.config.turnstile_site_key,
      callback: token => void verified(props.site.index, token),
      'error-callback': () => { error.value = t('verifyError') },
      'expired-callback': () => { clientAt(props.site.index).token = ''; window.turnstile.reset(widget) }
    })
  } catch (e) { error.value = e.message }
}
onMounted(render)
onBeforeUnmount(() => { disposed = true; if (widget !== undefined) window.turnstile?.remove(widget) })
</script>
<template>
  <section class="panel gate">
    <h2>{{ t('verify') }}</h2><p class="muted">{{ site.config.site_title || site.base }}</p>
    <div ref="element"></div>
    <p v-if="error" role="alert" class="error">{{ error }} <button @click="render">{{ t('retry') }}</button></p>
  </section>
</template>
