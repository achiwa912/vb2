<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const router = useRouter()
const googleButtonRef = ref(null)

const handleCredentialResponse = async (response) => {
  // response.credential is the raw JWT ID Token sent by Google
  const idToken = response.credential

  try {
    // Send token to your Flask backend for verification
    const res = await fetch('/auth/ggl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: idToken })
    })

    const data = await res.json()
    if (res.ok) {
      console.log('Successfully logged in!', data)
      userStore.setUser(data)
      router.push('/books')
    } else {
      console.error('Backend verification failed:', data)
    }
  } catch (err) {
    console.error('Network error during login:', err)
  }
}

function loadGoogleScript() {
  return new Promise((resolve) => {
    if (window.google?.accounts) return resolve()

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
}


onMounted(async () => {
  await loadGoogleScript()
  if (window.google?.accounts?.id) {
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    window.google.accounts.id.renderButton(
      googleButtonRef.value,
      { theme: 'outline', size: 'large', type: 'standard' }
    )
  }
})
</script>


<template>
  <div class="login-container">
    <h2>Sign In</h2>
    <div ref="googleButtonRef"></div>
  </div>
</template>
