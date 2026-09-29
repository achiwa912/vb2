import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import router from '@/router/index.ts'
import { useUserStore } from '@/stores/user'
import { getCsrf } from '@/utils/utils'

export const client = createClient<paths>({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  credentials: "include",
})

const authMiddleware: Middleware = {
  onRequest({ request }) {
    if (!['PUT', 'POST', 'PATCH', 'DELETE'].includes(request.method)) return request
    const csrf = getCsrf()
    if (csrf) {
      request.headers.set('X-CSRF-TOKEN', csrf)
      // csrf is added for /logout, too, but will do no harm.
    } else {
      request.headers.delete('X-CSRF-TOKEN')
    }
    return request
  },
  
  async onResponse({ response }) {
    if (response.status === 401) {
      const userStore = useUserStore()
      userStore.unsetUser()
      router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
    }
    return response
  },
}

client.use(authMiddleware)
