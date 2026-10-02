<!-- eslint-disable vue/multi-word-component-names -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { useUserStore } from '@/stores/user'
import { client } from '@/api/client'

const router = useRouter()
const route = useRoute()
const booksStore = useBooksStore()
const userStore = useUserStore()

const activeBook = computed(() => {
  const ix = booksStore.id2ixBook(booksStore.activeBookId)
  return ix === null ? undefined : booksStore.books[ix]
})


function quitDemo() {
  //booksStore.reset()
  router.push('/')
}

async function logout() {
  await client.POST('/logout')
  userStore.unsetUser()
  router.push('/login')
}

async function goHome() {
  console.log(route.path)
  if (route.path.startsWith('/demo')) {
    router.push('/demo')
    return
  }
  if (route.path == '/prac') {
      await booksStore.syncServer()
  }
  booksStore.activeBookId = null
  router.push('/')
}

function goWords() {
  if (route.path.startsWith('/demo')) {
    router.push('/demo')
  } else {
    router.push('/words')
  }
}

</script>

<template>
  <!-- Navbar -->
  <nav class="navbar bg-base-200 backdrop-blur-lg border-b border-base-300 sticky top-0 z-50">
    <div class="max-w-7xl mx-auto w-full px-6 py-3">
      <div class="flex items-center justify-between w-full">
        
        <div class="flex items-center gap-3 group">

          <!-- Logo -->
	  <div class="relative w-12 h-8">
	    <div @click="goHome"
       class="w-12 h-8 bg-primary rounded-2xl hidden sm:flex items-center justify-center transition-all group-hover:rotate-12 cursor-pointer">
	      <span class="text-white font-bold text-xl">vB</span>
	    </div>

	    <span v-if="route.path.startsWith('/demo')" class="absolute -top-3 -right-14 text-[18px] font-bold text-error bg-error/5 border border-error/60 px-1.5 py-0.5 rounded-full whitespace-nowrap italic">
		  Demo mode
	    </span>
	  </div>

	  <span @click="goHome" class="text-2xl font-semibold tracking-tight cursor-pointer">vocaBull</span>
	  
	  <!-- Breadcrumbs -->
	  <div v-if="route.path.includes('/prac')" class="flex items-center text-sm mx-6">
	    <div>
	      <span class="text-base-content/30">></span>
	      <span @click="goWords" class="cursor-pointer ml-2">{{ activeBook?.name }}</span>
	    </div>
	  </div>
	
        </div>

	
	
        <!-- User Menu -->
        <div class="dropdown dropdown-end">
          <label 
            tabindex="0" 
            class="flex items-center gap-3 cursor-pointer py-2 px-3 rounded-3xl hover:bg-base-200 transition-colors"
          >
            <!-- Optional Avatar -->
            <div class="w-8 h-8 bg-base-300 rounded-2xl flex items-center justify-center text-sm font-medium ring-2 ring-base-200">
              {{ userStore.name?.[0] }}
            </div>
            
            <div class="text-left hidden sm:inline">
              <p class="font-medium text-sm leading-none">{{ userStore.name }}</p>
              <p class="text-[10px] text-base-content/60 mt-0.5">{{ userStore.email }}</p>
            </div>

            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </label>

          <ul 
            tabindex="0" 
            class="dropdown-content menu bg-base-100 rounded-3xl shadow-xl w-56 p-2 mt-2 border border-base-200 z-[60]"
          >
            <slot></slot>
            
            <li>
              <button 
                v-if="!route.path.startsWith('/demo')" @click="logout"
                class="rounded-2xl py-3 text-error hover:bg-error/10 flex items-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4V7" />
                </svg>
                Logout
              </button>
              <button 
                v-else @click="quitDemo"
                class="rounded-2xl py-3 text-error hover:bg-error/10 flex items-center gap-3"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4V7" />
                </svg>
                Quit Demo
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </nav>
</template>
