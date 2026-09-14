<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, reactive, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { PracEngine } from '@/lib/pracengine'
import { ThumbsUp, ThumbsDown, SkipForward, Music, Music2, Music3, RefreshCw } from '@lucide/vue'
import type { components } from '@/types/api'
import Navbar from '@/components/Navbar.vue'

const booksStore = useBooksStore()
const engine = reactive(new PracEngine(booksStore))
const exitDir = ref<'left' | 'right' | null>(null)
const prefersReducedMotion = ref(false)
const voices = ref<SpeechSynthesisVoice[]>([]) // for TTS

let mq: MediaQueryList | null = null
const onMqChange = (e: MediaQueryListEvent) => { prefersReducedMotion.value = e.matches }

const infoMem = computed(() => engine.infoMem)
const infoTried = computed(() => engine.infoTried)

const infoDue = computed(() => engine.getInfoDue())
const infoRemain = computed(() => engine.getInfoRemain())
const infoWithin3 = computed(() => engine.getInfoWithin3())

const currentWord = computed(() => {
  if (engine.pracIdx == null) return null
  const prac = booksStore.pracs[engine.pracIdx]
  if (!prac || prac.word_id == null) return null

  const idx = booksStore.id2ixWord(prac.word_id)
  if (idx == null) return null

  return booksStore.words[idx] ?? null
})

const currentPrac = computed(() => {
  if (engine.lw[0] == null) return null
  return booksStore.pracs[engine.lw[0]] ?? null
})

const flipCard = () => { engine.isFlipped = !engine.isFlipped }

async function manualSync() {
  engine.resetWindows()
  await booksStore.syncServer()
  await engine.doPrac()
}

// watch(() => engine.infoTried, () => {
//   engine.isFlipped = false
// })


// ====== animation ========================================

const EXIT_MS = 180

const exitStyle = computed(() => {
  const base: Record<string, string> = {
    transition:
      `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out, box-shadow 200ms ease, border-color 200ms ease`,
  }
  if (exitDir.value === 'right') {
    base.transform = 'translateX(140%) rotate(15deg)'
    base.opacity = '0'
  } else if (exitDir.value === 'left') {
    base.transform = 'translateX(-140%) rotate(-15deg)'
    base.opacity = '0'
  }
  return base
})

function onAction(action: 'onceMore' | 'okay') {
  if (exitDir.value !== null) return
  if (prefersReducedMotion.value) {
    if (action === 'onceMore') engine.onceMore()
    else engine.okay()
    return
  }
  exitDir.value = action === 'onceMore' ? 'left' : 'right'
  window.setTimeout(() => {
    exitDir.value = null
    if (action === 'onceMore') engine.onceMore()
    else engine.okay()
  }, EXIT_MS)
}

// ====== TTS ==============================================

const speakWord = () => {
  if (currentWord.value?.word) {
    speakTts(currentWord.value.word)
  }
}
const speakDef = () => {
  if (currentWord.value?.definition) {
    speakTts(currentWord.value.definition)
  }
}
const speakSmpl = () => {
  if (currentWord.value?.sample) {
    speakTts(currentWord.value.sample)
  }
}

const loadVoices = () => {
  if (!('speechSynthesis' in window)) return
  voices.value = window.speechSynthesis.getVoices()
}

const speakTts = (txt: string) => {
  if (!('speechSynthesis' in window) || !txt) return

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(txt)

  utterance.lang = 'en-US'
  utterance.rate = 1.1

  // Female voices explicitly matched from your system list
  const preferredFemaleVoices = [
    // macOS / iOS
    'Karen',  // US or neutral
    'Samantha', // US
    'Tessa', // UK
    //+++'Sandy (English (US))',
    //+++'Kathy', 
    //+++'Flo (English (US))',
    
    // Windows / Edge
    'Microsoft Zira',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Aria Online (Natural) - English (United States)',

    // Android / Chrome
    'Google US English'
  ]
  
  // Get current voices array dynamically
  const availableVoices = voices.value.length > 0 
					      ? voices.value 
					      : window.speechSynthesis.getVoices()

  // Match exact name string first
  const bestVoice = availableVoices.find(v => 
    preferredFemaleVoices.includes(v.name)
  ) || availableVoices.find(v => 
    preferredFemaleVoices.some(p => v.name.includes(p))
  )

  if (bestVoice) {
    utterance.voice = bestVoice
    //console.log('Using female voice:', bestVoice.name)
  } else {
    console.warn('No preferred female voice matched, using browser default.')
  }

  window.speechSynthesis.speak(utterance)
}

onBeforeRouteLeave(async () => {
  engine.isFlipped = false
  await booksStore.syncServer()
})

onMounted(async () => {
  engine.resetWindows()
  mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  prefersReducedMotion.value = mq.matches
  mq.addEventListener('change', onMqChange)
  loadVoices()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices
  }
  await booksStore.syncServer()
  await engine.doPrac()
})
onUnmounted(() => {
  mq?.removeEventListener('change', onMqChange)
})

</script>

<template>
  <Navbar>
    <li><div @click="manualSync"><RefreshCw />Sync</div></li>
    <div class="divider my-1"></div>
  </Navbar>
  
  <div>
    <!-- Title -->
    <div class="flex mt-4 mx-4 items-end">
      <h1 class="text-3xl font-semibold">Practice</h1>
      <div class="text-base-content/50 ml-4">{{ booksStore.pracDir == 'wd' ? 'Word to Definition' : 'Definiton to Word' }}</div>
    </div>

    <!-- info stat -->
    <div class="card card-lg bg-base-100 border border-base-300 rounded-xl shadow-sm mt-4 mx-3 sm:mx-8 md:mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200 " :class="booksStore.pracDir == 'wd' ? 'bg-success text-success-content' : 'bg-info text-info-content'">
      <div class="card-body py-3 sm:py-4">
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
	  <div>today: {{ infoMem }}/{{ infoTried }}</div>
	  <div>remaining: {{ infoRemain }}</div>
	  <div>due: {{ infoDue }}</div>
	  <div>due within 3 days: {{ infoWithin3 }}</div>
	</div>
      </div>
    </div>

    
    <!-- practice card -->
    <div class="relative flex items-center justify-center mt-6">

      <!-- ghost cards -->
      <div
	v-if="engine.lw.length > 2"
	      class="absolute inset-y-0 left-3 right-3 sm:left-8 sm:right-8 md:left-16 md:right-16 rounded-3xl border border-base-300 bg-base-200 pointer-events-none z-10"
	      style="transform-origin: top center; transform: translateY(-16px) scale(0.98); opacity: 0.4;"
      ></div>
      <div
	v-if="engine.lw.length > 1"
	class="absolute inset-y-0 left-3 right-3 sm:left-8 sm:right-8 md:left-16 md:right-16 rounded-3xl border border-base-300 bg-base-200 pointer-events-none z-20"
	style="transform-origin: top center; transform: translateY(-8px) scale(0.99); opacity: 0.7;"
      ></div>

      <div v-if="engine.lw.length > 0" :key="engine.pracIdx ?? -1" class="card card-lg bg-base-100 w-full min-h-[280px] sm:min-h-[300px] border border-base-300 rounded-3xl shadow-sm mx-3 sm:mx-8 md:mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200 relative z-30" :style="exitStyle">
	<!-- Card Header/Body Wrapper -->
	<div @click="engine.pracIdx !== null && (engine.isFlipped = !engine.isFlipped)" class="card-body flex flex-col justify-between h-full p-4 cursor-pointer">
    
	  <div 
	    class="flex-1 flex flex-col justify-center"
	  >
	    <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-95"
              mode="out-in"
	    >
              <!-- Front Content -->
              <div v-if="!engine.isFlipped" key="front" class="flex flex-col items-center justify-center space-y-4">
		<h1 v-if="booksStore.pracDir == 'wd'" class="text-2xl sm:text-4xl font-bold text-center">
		  {{ currentWord?.word }}
		</h1>
		<h1 v-else class="text-2xl sm:text-3xl font-bold text-center">
		  {{ currentWord?.definition }}
		</h1>
              </div>

              <!-- Back Content -->
              <div v-else key="back" class="flex flex-col items-center justify-center space-y-4 overflow-y-auto max-h-[220px] px-2">
		<h1 class="text-2xl sm:text-3xl font-bold text-center">{{ currentWord?.word }}</h1>
          
		<p class="text-lg opacity-80 text-center">
		  {{ currentWord?.definition }}
		</p>

		<p class="italic text-base-content/70 bg-base-100/50 rounded-xl text-center">
		  {{ currentWord?.sample }}
		</p>
              </div>
	    </Transition>
	  </div>

	  <!-- Static Action Buttons -->
	  <div class="flex flex-col items-center gap-3 pt-2">
	    <!-- TTS -->
	    <div class="flex justify-center gap-2 mb-3" @click.stop>
	      <button @click.stop="speakWord" class="btn btn-sm btn-success text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null || (!engine.isFlipped && booksStore.pracDir !== 'wd')"><Music2 />Word</button>
	      <button @click.stop="speakDef" class="btn btn-sm btn-error text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null || (!engine.isFlipped && booksStore.pracDir !== 'dw')"><Music3 />Definition</button>
	      <button @click.stop="speakSmpl" class="btn btn-sm btn-info text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null || !engine.isFlipped"><Music />Sample</button>
	    </div>
	    
	    <!-- Action buttons -->
	    <div class="card-actions grid grid-cols-3 gap-2 w-full">
	      <button @click.stop="onAction('onceMore')" class="btn btn-secondary rounded-3xl btn-outline btn-sm sm:btn-lg whitespace-nowrap" :disabled="engine.pracIdx === null"><ThumbsDown />Once More </button>
	      <button @click.stop="onAction('okay')" class="btn btn-success rounded-3xl btn-outline btn-sm sm:btn-lg" :disabled="engine.pracIdx === null"><ThumbsUp />Okay</button>
	      <button @click.stop="engine.memorized" class="btn btn-info rounded-3xl btn-outline btn-sm sm:btn-lg sm:ml-8"  :disabled="engine.pracIdx === null"><SkipForward />Memorized</button>
	    </div>
	  </div>

	</div>
      </div>

      <!-- Nothing to learn -->
<div v-else class="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
  <div class="text-5xl">🎉</div>
  <h3 class="text-xl font-semibold text-base-content">
    No items to practice today
  </h3>
  <p class="text-base-content/70">
    Way to go!
  </p>
</div>

    </div>


    
  </div>
</template>
