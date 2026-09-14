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
const dragX = ref(0)
const dragY = ref(0)
const dragging = ref(false)

let pointerId: number | null = null
let startX = 0
let startY = 0
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
const SWIPE_THRESHOLD = 100
const TAP_THRESHOLD = 8
const ROTATION_DIVISOR = 20

const cardStyle = computed(() => {
  const base: Record<string, string> = {
    'touch-action': 'pan-y',
    'will-change': 'transform',
  }
  const restTransition =
    `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out, ` +
    'box-shadow 200ms ease, border-color 200ms ease'

  if (exitDir.value) {
    return {
      ...base,
      transition: restTransition,
      transform: exitDir.value === 'right'
        ? 'translateX(140%) rotate(15deg)'
        : 'translateX(-140%) rotate(-15deg)',
      opacity: '0',
    }
  }
  if (dragging.value) {
    return {
      ...base,
      transition: 'none',
      transform:
        `translateX(${dragX.value}px)` +
        `rotate(${dragX.value / ROTATION_DIVISOR}deg)`,
    }
  }
  return { ...base, transition: restTransition }
})

function onPointerDown(e: PointerEvent) {
  if (exitDir.value !== null) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  
  const target = e.target as HTMLElement | null
  if (target?.closest('button, [data-no-flip]')) return

  const container = e.currentTarget as HTMLElement
  pointerId = e.pointerId
  startX = e.clientX
  startY = e.clientY
  dragX.value = 0
  dragY.value = 0
  dragging.value = false

  if (container.setPointerCapture) {
    container.setPointerCapture(e.pointerId)
  }
}

function onPointerMove(e: PointerEvent) {
  if (pointerId !== e.pointerId) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (!dragging.value && Math.hypot(dx, dy) > TAP_THRESHOLD) {
    dragging.value = true
  }
  if (dragging.value) {
    dragX.value = dx
    dragY.value = dy
  }
}

function onPointerUp(e: PointerEvent) {
  if (pointerId !== e.pointerId) return
  const wasDragging = dragging.value
  const dx = dragX.value
  const el = e.currentTarget as HTMLElement

  pointerId = null
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
  dragging.value = false
  dragX.value = 0
  dragY.value = 0

  if (wasDragging) {
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      onAction(dx > 0 ? 'okay' : 'onceMore')
    }
    // else: card springs back to center (transition from cardStyle's rest branch)
  } else {
    if (engine.pracIdx !== null) engine.isFlipped = !engine.isFlipped
  }
}

function onPointerCancel(e: PointerEvent) {
  if (pointerId !== e.pointerId) return
  pointerId = null
  dragging.value = false
  dragX.value = 0
  dragY.value = 0
}

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

const ghostEnter = computed(() => prefersReducedMotion.value ? {} : {
  'enter-active-class': 'transition-opacity duration-200 ease-out',
  'enter-from-class': 'opacity-0',
})

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
      <Transition v-bind="ghostEnter"
		  enter-active-class="transition-opacity duration-200 ease-out"
		  enter-from-class="opacity-0"
		  enter-to-class="opacity-40"
		  leave-active-class="transition-opacity duration-200 ease-in"
		  leave-from-class="opacity-40"
		  leave-to-class="opacity-0"
      >
	<div
	  v-if="engine.lw.length > 2"
	  class="absolute inset-y-0 left-3 right-3 sm:left-8 sm:right-8 md:left-16 md:right-16 rounded-3xl border border-base-300 bg-base-200 pointer-events-none z-10 opacity-40"
	  style="transform-origin: top center; transform: translateY(-16px) scale(0.98);"
	></div>
      </Transition>

      <Transition v-bind="ghostEnter"
		  enter-active-class="transition-opacity duration-200 ease-out"
		  enter-from-class="opacity-0"
		  enter-to-class="opacity-70"
		  leave-active-class="transition-opacity duration-200 ease-in"
		  leave-from-class="opacity-70"
		  leave-to-class="opacity-0"
      >
	<div
	  v-if="engine.lw.length > 1"
	  class="absolute inset-y-0 left-3 right-3 sm:left-8 sm:right-8 md:left-16 md:right-16 rounded-3xl border border-base-300 bg-base-200 pointer-events-none z-20 opacity-70"
	  style="transform-origin: top center; transform: translateY(-8px) scale(0.99);"
	></div>
      </Transition>

      <!-- active card -->
      <div v-if="engine.lw.length > 0" :key="engine.pracIdx ?? -1" class="card card-lg bg-base-100 w-full min-h-[280px] sm:min-h-[300px] border border-base-300 rounded-3xl shadow-sm mx-3 sm:mx-8 md:mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200 relative z-30" :style="cardStyle" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerCancel">
	<!-- Card Header/Body Wrapper -->
	<div class="card-body flex flex-col justify-between h-full p-4 cursor-pointer">
    
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
	    <div class="flex justify-center gap-2 mb-3" data-no-flip>
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
