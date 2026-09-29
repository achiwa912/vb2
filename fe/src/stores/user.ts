import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { components } from '@/types/api'

type GglAuthResp = components['schemas']['GglAuthResp']

export const useUserStore = defineStore('user', () => {
  const user_id = ref<number | null>(null)
  const email = ref<string | null>(null)
  const name = ref<string | null>(null)

  function setUser(user: GglAuthResp) {
    user_id.value = user.user_id
    email.value = user.email
    name.value = user.name
    localStorage.setItem('user', JSON.stringify(user))
  }

  function unsetUser() {
    user_id.value = null
    email.value = null
    name.value = null
    localStorage.removeItem('user')
  }
  
  function loadUser() {
    const saved = localStorage.getItem('user')
    if (saved) {
      const user = JSON.parse(saved)
      user_id.value = user.user_id
      email.value = user.email
      name.value = user.name
    }
  }
  
  return { user_id, email, name, setUser, unsetUser, loadUser }
})
