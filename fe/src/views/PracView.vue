<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, reactive, watch, nextTick } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useBooksStore } from '@/stores/books'
import { PracEngine } from '@/lib/pracengine'
import { ThumbsUp, ThumbsDown, SkipForward, Music, Music2, Music3, RefreshCw, Check, X, SquarePen } from '@lucide/vue'
import type { components } from '@/types/api'
import Navbar from '@/components/Navbar.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const booksStore = useBooksStore()
const toastRef = ref<InstanceType<typeof ToastContainer> | null>(null)
const modalRef = ref<HTMLDialogElement | null>(null)
const editWord = ref<string>('')
const editDef = ref<string>('')
const editSample = ref<string>('')
const engine = reactive(new PracEngine(booksStore))
const exitDir = ref<'left' | 'right' | null>(null)
const prefersReducedMotion = ref(false)
const dragX = ref(0)
const dragY = ref(0)
const dragging = ref(false)

let pointerId: number | null = null
let startX = 0
let startY = 0
const isAutoplay = ref(false)
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

const flipCard = () => {
  engine.isFlipped = !engine.isFlipped
  if (!isAutoplay.value) return
  engine.isFlipped ? speakRest() : speakFront()
}

async function manualSync() {
  engine.resetWindows()
  await booksStore.syncServer()
  await engine.doPrac()
}

// watch(() => engine.infoTried, () => {
//   engine.isFlipped = false
// })

// ====== edit word ========================================

const openModal = () => {
  console.log('!')
  editWord.value = currentWord.value?.word ?? ''
  editDef.value = currentWord.value?.definition ?? ''
  editSample.value = currentWord.value?.sample ?? ''
  modalRef.value?.showModal()
}

const closeModal = () => {
  modalRef.value?.close()
}

const updateWord = async () => {
  const resp = await booksStore.editWord(editWord.value, editDef.value, editSample.value, currentWord.value?.book_id ?? 0, currentWord.value?.id ?? 0)
  if (resp.status == 200) {
    toastRef.value?.showAlert(`Updated word: ${editWord.value} (id: ${currentWord.value?.id})`, 'success')
  } else {
    toastRef.value?.showAlert(`Failed updating word: ${currentWord.value?.word}. ${resp.message} (${resp.status})`, 'error')
  }
  closeModal()
  await booksStore.syncBook()
  await engine.doPrac()
}

const deleteWord = async () => {
  const resp = await booksStore.deleteWord(currentWord.value)
  if (resp.status == 200) {
    toastRef.value?.showAlert(`Deleted word: ${currentWord.value?.word} (id: ${currentWord.value?.id})`, 'success')
    booksStore.pracs.splice(engine.pracIdx ?? 99999, 1) // delete the prac
    engine.resetWindows()
  } else {
    toastRef.value?.showAlert(`Failed to delete word: ${currentWord.value?.word}. ${resp.message} (${resp.status})`, 'error')
  }
  closeModal()
  await booksStore.syncBook()
  await engine.doPrac()
}



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
    if (engine.pracIdx !== null) {
      //engine.isFlipped = !engine.isFlipped
      flipCard()
    }
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

const speakFront = () => {
  if (booksStore.pracDir !== 'dw') {
    if (currentWord.value?.word) {
      speakTts(currentWord.value.word)
    }
  } else {
    if (currentWord.value?.definition) {
      speakTts(currentWord.value.definition)
    }
  }
}

const speakRest = () => {
  let sentence = ''
  if (booksStore.pracDir !== 'dw') {
    sentence = currentWord.value?.definition + '; ' + currentWord.value?.sample
  } else {
    sentence = currentWord.value?.word + '; ' + currentWord.value?.sample
  }
  if (sentence) {
    speakTts(sentence)
  }
}

const loadVoices = () => {
  if (!('speechSynthesis' in window)) return
  voices.value = window.speechSynthesis.getVoices()
}

let speakTimer: number | null = null

const speakTts = (txt: string) => {
  if (!('speechSynthesis' in window) || !txt) return
  if (speakTimer !== null) window.clearTimeout(speakTimer)
  
  window.speechSynthesis.cancel()

  // Defer the speak() to the next macrotask so Chromium doesn't drop it
  // when it follows cancel() in the same tick.
  speakTimer = window.setTimeout(() => {
    speakTimer = null
    const utterance = new SpeechSynthesisUtterance(txt)
    utterance.lang = 'en-US'
    utterance.rate = 1.1

    const preferredFemaleVoices = [
      'Karen', 'Samantha', 'Tessa',
      'Microsoft Zira',
      'Microsoft Jenny Online (Natural) - English (United States)',
      'Microsoft Aria Online (Natural) - English (United States)',
      'Google US English',
    ]

    const availableVoices = voices.value.length > 0
						? voices.value
						: window.speechSynthesis.getVoices()

    const bestVoice =
      availableVoices.find(v => preferredFemaleVoices.includes(v.name)) ||
      availableVoices.find(v => preferredFemaleVoices.some(p => v.name.includes(p)))

    if (bestVoice) utterance.voice = bestVoice
    else console.warn('[speakTts] no preferred voice matched, voices=', availableVoices.map(v => v.name))

    window.speechSynthesis.speak(utterance)
  }, 80)
}

// 1. When a new card is loaded, reset flip and speak the front (if autoplay on)
watch(() => engine.infoTried, async (id) => {
  if (id == null) return
  engine.isFlipped = false
  if (!isAutoplay.value) return
  await nextTick()
  speakFront()
})

// 2. When the user toggles autoplay ON, immediately speak the current front
watch(isAutoplay, (on) => {
  if (!on) {
    window.speechSynthesis?.cancel()
    return
  }
  if (engine.pracIdx == null) return
  engine.isFlipped ? speakRest() : speakFront()
})

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
    <div class="flex mt-4 mx-4 items-end gap-1">
      <h1 class="text-3xl font-semibold">Practice</h1>
      <div class="text-base-content/50 ml-3">{{ booksStore.pracDir == 'wd' ? 'Word to Definition' : 'Definiton to Word' }}</div>
      <input type="checkbox" class="toggle ml-2" v-model="isAutoplay" />
      <div>Autoplay</div>
    </div>

    <!-- info stats -->
    <div class="card card-lg bg-base-100 border border-base-300 rounded-xl shadow-sm mt-4 mx-3 sm:mx-8 md:mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200 " :class="booksStore.pracDir == 'wd' ? 'bg-success text-success-content' : 'bg-info text-info-content'">
      <div class="card-body py-3 sm:py-4">
	<div class="grid grid-cols-3 gap-4">
	  <div class="flex items-center gap-1"><Check />{{ infoMem }} <X />{{ infoTried }}</div>
	  <div>{{ infoRemain }} left</div>
	  <div>+{{ infoWithin3 }} coming up</div>
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

	  <!-- Buttons -->
	  <div class="relative flex items-center justify-center pt-2">
	    <!-- TTS -->
	    <div class="flex justify-center gap-2" data-no-flip>
	      <button @click.stop="speakFront" class="btn btn-sm btn-success text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null"><Music3 />Front</button>
	      <button @click.stop="speakRest" class="btn btn-sm btn-info text-sm" :disabled="engine.pracIdx === null || booksStore.pracDir === null || !engine.isFlipped"><Music />Rest</button>
	    </div>
	    <div class="flex justify-center gap-3 absolute left-0">
	      <button @click.stop="openModal" class="btn btn-primary btn-sm rounded-2xl">
		<SquarePen class="size-4" />
	      </button>
	    </div>
	    <div class="flex justify-center gap-3 absolute right-0">
	      <button @click.stop="engine.undo" class="btn btn-primary btn-sm rounded-3xl" :disabled="!engine.undoArray.length">
		<RefreshCw class="size-4" />
	      </button>
	    </div>
	  </div>
	  
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
              <div v-else key="back" class="flex flex-col items-center justify-center space-y-4">
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
	<button @click="engine.undo" class="btn btn-primary btn-sm rounded-3xl" :disabled="!engine.undoArray.length">
	  <RefreshCw class="size-4" />
	</button>
      </div>

    </div>
    
  </div>

  <!-- word add/edit modal -->
  <dialog ref="modalRef" class="modal modal-bottom sm:modal-middle backdrop:backdrop-blur-sm transition-all duration-300">
    <div class="modal-box p-6 max-w-lg rounded-2xl border border-base-200/60 shadow-xl bg-base-100/95 backdrop-blur-md">
    
      <!-- Header with Close Button -->
      <div class="flex items-center justify-between pb-4 mb-6 border-b border-base-200">
	<div>
          <h3 class="text-xl font-bold tracking-tight text-base-content">
            {{ 'Edit Word' }}
          </h3>
          <p class="text-xs text-base-content/60 mt-0.5">
            {{ 'Make changes to your existing word.' }}
          </p>
	</div>
	<button 
          type="button" 
          class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:text-base-content" 
          @click="closeModal"
          aria-label="Close modal"
	>
          ✕
	</button>
      </div>

      <!-- Form Fields -->
      <form @submit.prevent="updateWord" class="space-y-4">
	<!-- Word Input -->
	<div class="form-control w-full">
          <label class="label py-1">
            <span class="label-text font-medium text-xs uppercase tracking-wider text-base-content/70">Word</span>
          </label>
          <input 
            v-model="editWord" 
            type="text" 
            placeholder="e.g. Serendipity" 
            class="input input-bordered w-full rounded-xl focus:input-primary transition-all duration-200" 
            required 
          />
	</div>

	<!-- Definition Input -->
	<div class="form-control w-full">
          <label class="label py-1">
            <span class="label-text font-medium text-xs uppercase tracking-wider text-base-content/70">Definition</span>
          </label>
          <textarea 
            v-model="editDef" 
            placeholder="e.g. The occurrence of events by chance in a happy way." 
            class="textarea textarea-bordered w-full h-20 rounded-xl focus:textarea-primary transition-all duration-200 resize-none" 
            required
          ></textarea>
	</div>
      
	<!-- Sample Sentence Input -->
	<div class="form-control w-full">
          <label class="label py-1">
            <span class="label-text font-medium text-xs uppercase tracking-wider text-base-content/70">Sample Sentence</span>
          </label>
          <input 
            v-model="editSample" 
            type="text" 
            placeholder="e.g. Finding that cozy cafe was pure serendipity." 
            class="input input-bordered w-full rounded-xl focus:input-primary transition-all duration-200" 
          />
	</div>
	
	<!-- Action Footer -->
	<div class="pt-4 mt-6 border-t border-base-200 flex items-center justify-between gap-3">
          <!-- Delete action on the left to prevent accidental clicks -->
          <div>
            <button 
              type="button" 
              class="btn btn-error btn-ghost text-error hover:bg-error/10 rounded-xl transition-colors" 
              @click="deleteWord"
            >
              Delete
            </button>
          </div>
	  
          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-ghost rounded-xl" @click="closeModal">
              Cancel
            </button>
            <button type="submit" class="btn btn-primary rounded-xl px-6">
              {{ 'Save Changes' }}
            </button>
          </div>
	</div>
      </form>
      
    </div>
    
    <!-- Backdrop click to close trigger -->
    <form method="dialog" class="modal-backdrop">
      <button @click="closeModal">close</button>
    </form>
  </dialog>  
  
</template>
