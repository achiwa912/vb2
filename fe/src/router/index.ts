import { createRouter, createWebHistory } from 'vue-router'
import PracView from '@/views/PracView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: PracView },
  ],
})

export default router
