import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import router from '@/router/index.ts'
import { useUserStore } from '@/stores/user'

export const client = createClient<paths>({ baseUrl: import.meta.env.VITE_API_BASE_URL})

const authMiddleware: Middleware = {
  onRequest({ request }) {
    const userStore = useUserStore()
    if (userStore.access_token) {
      request.headers.set('Authorization', `Bearer ${userStore.access_token}`)
    } else {
      request.headers.delete('Authorization')
    }
    return request
  },
  
  async onResponse({ response }) {
    if (response.status === 401 || response.status === 422) {
      const userStore = useUserStore()
      userStore.unsetUser()
      router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
    }
    return response
  },
}

client.use(authMiddleware)
