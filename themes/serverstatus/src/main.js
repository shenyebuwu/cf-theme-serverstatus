import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import './style.css'

const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: Dashboard },
  { path: '/server/:id', component: () => import('./views/ServerDetail.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' }
] })
const app = createApp(App).use(router)
router.isReady().then(() => app.mount('#app'))
