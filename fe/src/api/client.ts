import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from '@/types/api'
import router from '@/router/index.ts'
import { useUserStore } from '@/stores/user'

export const client = createClient<paths>({ baseUrl: import.meta.env.VITE_API_BASE_URL})

const authMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.status === 401) {
      const userStore = useUserStore()
      userStore.unsetUser()
      router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
    }
    return response
  }
}

client.use(authMiddleware)
