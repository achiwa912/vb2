import { createRouter, createWebHistory } from 'vue-router'
import PracView from '@/views/PracView.vue'
import LoginView from '@/views/LoginView.vue'
import BooksView from '@/views/BooksView.vue'
import WordsView from '@/views/WordsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: BooksView },
    { path: '/books', component: BooksView },
    { path: '/login', component: LoginView },
    { path: '/words', component: WordsView },
    { path: '/prac', component: PracView },
  ],
})

export default router
