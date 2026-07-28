import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { components } from '@/types/api'

type GglAuthResp = components['schemas']['GglAuthResp']

export const useUserStore = defineStore('user', () => {
  const user_id = ref<number | null>(null)
  const email = ref<string | null>(null)
  const name = ref<string | null>(null)
  const access_token = ref<string | null>(null)

  function setUser(user: GglAuthResp) {
    user_id.value = user.user_id
    email.value = user.email
    name.value = user.name
    access_token.value = user.access_token
    localStorage.setItem('user', JSON.stringify(user))
  }

  function loadUser() {
    const saved = localStorage.getItem('user')
    if (saved) {
      const user = JSON.parse(saved)
      user_id.value = user.user_id
      email.value = user.email
      name.value = user.name
      access_token.value = user.access_token
    }
  }
  
  return { user_id, email, name, access_token, setUser, loadUser }
})
