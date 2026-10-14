<script setup>
import { computed } from 'vue'
const props = defineProps({ value: { default: null }, label: String })
const safe = computed(() => Math.min(100, Math.max(0, Number(props.value) || 0)))
const tone = computed(() => safe.value >= 90 ? 'danger' : safe.value >= 80 ? 'warn' : 'ok')
</script>
<template>
  <div class="progress" :title="label || (value == null ? '—' : `${Number(value).toFixed(1)}%`)">
    <div class="progress-fill" :class="tone" :style="{ width: `${safe}%` }"></div>
    <span>{{ label || (value == null ? '—' : `${Math.max(0, Number(value) || 0).toFixed(1)}%`) }}</span>
  </div>
</template>
