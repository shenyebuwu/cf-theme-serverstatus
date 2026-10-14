<script setup>
defineProps({ name: String })
const paths = {
  home: ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-8h6v8'],
  chart: ['M3 3v18h18', 'm7 14 4-5 4 3 5-7'],
  user: ['M20 21v-2a7 7 0 0 0-14 0v2'],
  moon: ['M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z'],
  sun: ['M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4'],
  search: ['m21 21-4.4-4.4'],
  more: []
}
</script>
<template><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(d, i) in paths[name]" :key="i" :d="d" /><circle v-if="name === 'user'" cx="13" cy="7" r="4" /><circle v-if="name === 'sun'" cx="12" cy="12" r="4" /><circle v-if="name === 'search'" cx="10.5" cy="10.5" r="7.5" /><template v-if="name === 'more'"><circle v-for="x in [5, 12, 19]" :key="x" :cx="x" cy="12" r="1" /></template></svg></template>
