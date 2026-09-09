<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const router = useRouter()
const route = useRoute()
const googleButtonRef = ref(null)

const handleCredentialResponse = async (response: { credential: string }) => {
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
      if (route.query.redirect) {
	router.push(route.query.redirect as string)
      } else {
	router.push('/books')
      }
    } else {
      console.error('Backend verification failed:', data)
    }
  } catch (err) {
    console.error('Network error during login:', err)
  }
}

function loadGoogleScript() {
  return new Promise<void>((resolve) => {
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
  <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
    <!-- Background decorative elements -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl"></div>
      <div class="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/10 rounded-full blur-3xl"></div>
    </div>

    <div class="relative w-full max-w-md">
      <!-- Logo / Brand -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-content shadow-lg mb-4">
          <!-- Simple bull + book style icon (replace with your logo if you have one) -->
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h1 class="text-3xl font-bold tracking-tight">vocaBull</h1>
        <p class="text-base-content/60 mt-1">Build your vocabulary, one word at a time</p>
      </div>

      <!-- Login Card -->
      <div class="card bg-base-100 shadow-xl border border-base-300">
        <div class="card-body items-center text-center gap-6">
          <div>
            <h2 class="card-title text-2xl justify-center">Sign in</h2>
            <p class="text-sm text-base-content/70 mt-1">
              Continue with your Google account to sync progress across devices
            </p>
          </div>

          <!-- Google Sign-In Button container -->
          <div
            ref="googleButtonRef"
            class="w-full flex justify-center min-h-[44px]"
          ></div>

          <!-- Optional subtle divider / note -->
          <div class="w-full">
            <div class="divider text-xs text-base-content/40 my-0">secure sign-in</div>
            <p class="text-xs text-base-content/50 mt-2">
              By continuing you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <p class="text-center text-sm text-base-content/50 mt-6">
        New here? Just sign in — an account is created automatically.
      </p>
    </div>
  </div>
</template>
