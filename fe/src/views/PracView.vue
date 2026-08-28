<script setup lang="ts">
import { ref, onMounted, computed, reactive, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { PracEngine } from '@/lib/pracengine'
import { ThumbsUp, ThumbsDown, SkipForward, Music, Music2, Music3, RefreshCw } from '@lucide/vue'
import type { components } from '@/types/api'
import Navbar from '@/components/Navbar.vue'

const booksStore = useBooksStore()
const engine = reactive(new PracEngine(booksStore))
const isFlipped = ref<boolean>(false)
const voices = ref<SpeechSynthesisVoice[]>([]) // for TTS

const infoMem = computed(() => engine.infoMem)
const infoTried = computed(() => engine.infoTried)

const infoDue = computed(() => engine.getInfoDue())
const infoRemain = computed(() => engine.getInfoRemain())
const infoWithin3 = computed(() => engine.getInfoWithin3())

const flipCard = () => { isFlipped.value = !isFlipped.value }

async function manualSync() {
  engine.resetWindows()
  await booksStore.syncServer()
  await engine.doPrac()
}

watch(() => engine.pracIdx, () => {
  isFlipped.value = false
})


// ====== TTS ==============================================

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
  isFlipped.value = false
  await booksStore.syncServer()
})

onMounted(async () => {
  engine.resetWindows()
  //lw.value = []
  //ww.value = []
  loadVoices()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices
  }
  await booksStore.syncServer()
  await engine.doPrac()
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
    <div class="card card-lg bg-base-100 border border-base-300 rounded-xl shadow-sm mt-4 mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200 " :class="booksStore.pracDir == 'wd' ? 'bg-success text-success-content' : 'bg-info text-info-content'">
      <div class="card-body py-4">
	<div class="grid grid-cols-4 gap-4">
	  <div>today: {{ infoMem }}/{{ infoTried }}</div>
	  <div>remaining: {{ infoRemain }}</div>
	  <div>due: {{ infoDue }}</div>
	  <div>due within 3 days: {{ infoWithin3 }}</div>
	</div>
      </div>
    </div>

    
    <!-- practice card -->
    <div class="flex items-center justify-center">

      <div v-if="engine.lw.length > 0" class="card card-lg bg-base-100 w-full h-[300px] border border-base-300 rounded-3xl shadow-sm mt-4 mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200">
	<!-- Card Header/Body Wrapper -->
	<div @click="engine.pracIdx !== null && (isFlipped = !isFlipped)" class="card-body flex flex-col justify-between h-full p-4 cursor-pointer">
    
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
              <div v-if="!isFlipped" key="front" class="flex flex-col items-center justify-center space-y-4">
		<h1 v-if="booksStore.pracDir == 'wd'" class="text-4xl font-bold text-center">
		  {{ booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.word }}
		</h1>
		<h1 v-else class="text-4xl font-bold text-center">
		  {{ booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.definition }}
		</h1>
              </div>

              <!-- Back Content -->
              <div v-else key="back" class="flex flex-col items-center justify-center space-y-4 overflow-y-auto max-h-[220px] px-2">
		<h1 class="text-3xl font-bold text-center">{{ booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.word }}</h1>
          
		<p class="text-lg opacity-80 text-center">
		  {{ booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.definition }}
		</p>

		<p class="italic text-base-content/70 bg-base-100/50 rounded-xl text-center">
		  {{ booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.sample }}
		</p>
              </div>
	    </Transition>
	  </div>

	  <!-- Static Action Buttons -->
	  <div class="flex flex-col items-center gap-3 pt-2">
	    <!-- TTS -->
	    <div class="flex justify-center gap-2 mb-3" @click.stop>
	      <button @click.stop="speakTts(booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.word)" class="btn btn-sm btn-success text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null || (!isFlipped && booksStore.pracDir !== 'wd')"><Music2 />Word</button>
	      <button @click.stop="speakTts(booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.definition)" class="btn btn-sm btn-error text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null || (!isFlipped && booksStore.pracDir !== 'dw')"><Music3 />Definition</button>
	      <button @click.stop="speakTts(booksStore.words[booksStore.id2ixWord(booksStore.pracs[engine.pracIdx]?.word_id)]?.sample)" class="btn btn-sm btn-info text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null || !isFlipped"><Music />Sample</button>
	    </div>
	    <!-- Action buttons -->
	    <div class="card-actions justify-center gap-2">
	      <button @click.stop="engine.onceMore" class="btn btn-secondary rounded-3xl btn-outline btn-lg" :disabled="engine.pracIdx === null"><ThumbsDown />Once More </button>
	      <button @click.stop="engine.okay" class="btn btn-success rounded-3xl btn-outline btn-lg" :disabled="engine.pracIdx === null"><ThumbsUp />Okay</button>
	      <button @click.stop="engine.memorized" class="btn btn-info rounded-3xl btn-outline btn-lg ml-8"  :disabled="engine.pracIdx === null"><SkipForward />Memorized</button>
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
  <p>This - {{ booksStore.pracs[engine.lw[0]] }}</p>
  <p>LW: {{ engine.lw }}</p>
  <p>WW: {{ engine.ww }}</p>
  <p>wordsNoPrac: {{ booksStore.wordsNoPrac }}</p>
  <p>isFlipped: {{ isFlipped }}</p>
</template>
