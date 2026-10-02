import { createRouter, createWebHistory } from 'vue-router'
import PracView from '@/views/PracView.vue'
import LoginView from '@/views/LoginView.vue'
import BooksView from '@/views/BooksView.vue'
import WordsView from '@/views/WordsView.vue'
import { useBooksStore } from '@/stores/books'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: BooksView },
    { path: '/books', component: BooksView },
    { path: '/login', component: LoginView },
    { path: '/words', component: WordsView },
    { path: '/prac', component: PracView },
    { path: '/demo', component: WordsView },
    { path: '/demo/prac', component: PracView },
  ],
})


router.beforeEach((to, from) => {
  const booksStore = useBooksStore()
  console.log(from.path, to.path)
  
  if (!from.path.startsWith('/demo') && to.path == '/demo/prac') {
    return '/demo'
  } else if (!from.path.startsWith('/demo') && to.path.startsWith('/demo')) {
    booksStore.prepDemo()
  } else if (from.path.startsWith('/demo') && !to.path.startsWith('/demo')) {
    booksStore.reset()
  }
})

router.afterEach((to, from) => {
  console.log('AFTER', from.path, '->', to.path)
  console.log('URL:', window.location.pathname)  
})

// router.afterEach((to) => console.log('after', to.path, window.location.pathname))

export default router

