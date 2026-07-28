<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBooksStore } from '@/stores/books'
import { ThumbsUp, ThumbsDown, SkipForward, Music, Music2, Music3, RefreshCw } from '@lucide/vue'
import type { components } from '@/types/api'
import Navbar from '@/components/Navbar.vue'

type PracticeSchema = components['schemas']['PracticeSchema']

const LWSIZE = 5
const WWSIZE = 5
const booksStore = useBooksStore()
const isFlipped = ref<boolean>(false)
const lw = ref<number[]>([])  // learning window
const ww = ref<number[]>([])  // waiting window
const wordsNoPrac = ref<number[]>([])
const lastSyncTime = ref<Date | null>(null)
const pracIdx = ref<number | null>(null) // the one currently practicing
const voices = ref<SpeechSynthesisVoice[]>([]) // for TTS

const flipCard = () => { isFlipped.value = !isFlipped.value }

function isNextDayOrLater(referenceDate: Date, now: Date = new Date()): boolean {
  if (referenceDate == null) return false
  const startOfNextDay = new Date(referenceDate);
  startOfNextDay.setHours(24, 0, 0, 0); // Rolls over to 00:00:00 of tomorrow
  console.log(`Firing sync from isNextDayOrLater?: ${now >= startOfNextDay}`)
  return now >= startOfNextDay;
}

function id2ixWord(wid: number): number | null {
  for (const [ix, w] of booksStore.words.entries()) {
    if (w.id == wid) return ix
  }
  return null
}

function id2ixBook(bid: number): number | null {
  for (const [ix, b] of booksStore.books.entries()) {
    if (b.id == bid) return ix
  }
  return null
}


async function syncServer() {
  await booksStore.syncBook()

  // create WordsNoPrac
  let wnp = [...Array(booksStore.words.length).keys()]
  for (const prac of booksStore.pracs) {
    if (prac.direction == booksStore.pracDir) {
      const ixDel = wnp.indexOf(id2ixWord(prac.word_id))
      if (ixDel !== -1) {
	wnp.splice(ixDel, 1)
      }
    }
  }
  for (let i=wnp.length-1; i>0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [wnp[i], wnp[j]] = [wnp[j], wnp[i]]
  }
  wordsNoPrac.value = wnp

  // decrement due_counters
  if (id2ixBook(booksStore.activeBookId) === null) return
  if (booksStore.pracDir == 'wd') {
    if (!isNextDayOrLater(
      booksStore.books[id2ixBook(booksStore.activeBookId)].wd_last_practiced
    )) return
  } else {
    if (!isNextDayOrLater(
      booksStore.books[id2ixBook(booksStore.activeBookId)].dw_last_practiced
    )) return
  }
  for (let prac of booksStore.pracs) {
    if (booksStore.pracDir == prac.direction && prac.status == 'review') {
      prac.due_counter = Math.max(prac.due_counter-1, 0)
    }
  }
  lastSyncTime.value = new Date() // now
}

function moveToWins(pracs: number[]): boolean {  // randomly pick from ps
  const ps = [...pracs]
  for (let i = ps.length-1; i> 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [ps[i], ps[j]] = [ps[j], ps[i]]
  }
  while (ps.length && lw.value.length < LWSIZE) {
    let pix = ps.pop()
    if (!['review', 'waiting'].includes(booksStore.pracs[pix].status)) {
      booksStore.pracs[pix].status = 'learning'
    }
    lw.value.push(pix) // put to tail
  }
  while (ps.length && ww.value.length < WWSIZE) {
    let pix = ps.pop()
    ww.value.push(pix) // put to tail
  }
  if (lw.value.length >= LWSIZE && ww.value.length >= WWSIZE) {
    return true
  }
  return false
}

function statusMove(status: string): boolean {
  let ps = []
  for (let [ix, p] of booksStore.pracs.entries()) {
    if (p.status == status && ![...lw.value, ...ww.value].includes(ix)) {
      ps.push(ix)
    }
  }
  if (moveToWins(ps)) return true
  return false
}

function fillWins() {
  while (lw.value.length > LWSIZE) {
    let p = lw.value.pop()  // from tail
    ww.value.unshift(p) // to head
  }
  while (ww.value.length > WWSIZE) {
    ww.value.pop()  // from tail
  }
  //while (lw.value.length != LWSIZE || ww.value.length != WWSIZE) {
  // pick 'due' ones first
  let ps = []
  for (let [ix, p] of booksStore.pracs.entries()) {
    if (p.status == 'review' && p.due_counter == 0) {
      ps.unshift(ix)
    }
  }
  if (moveToWins(ps)) return

  // move from ww to lw
  while (ww.value.length && lw.value.length < LWSIZE) {
    let pix = ww.value.shift()  // from head
    if (pix == null) {
      console.log('+++pix null!!!1')
    }
    if (!['review', 'waiting'].includes(booksStore.pracs[pix].status)) {
      booksStore.pracs[pix].status = 'learning'
    }
    lw.value.push(pix)  // to tail
  }

  // status == learning -> waiting -> new
  if (statusMove('learning')) return
  if (statusMove('waiting')) return
  if (statusMove('new')) return

  // words without practice
  const wnp = [...wordsNoPrac.value]
  for (let wix of wordsNoPrac.value) {
    const p: PracticeSchema = {
      direction: booksStore.pracDir,
      due_counter: null,
      due_dates: null,
      id: null,
      last_edited: new Date(), // now
      last_practiced: null,
      status: 'new',
      user_id: 1,  // +++ current_user.id
      word_id: booksStore.words[wix].id,
    }
    const idx = wnp.indexOf(wix)
    if (idx !== -1) {
      wnp.splice(idx, 1)
    }
    booksStore.pracs.push(p)
    let pix = booksStore.pracs.length-1  // one just added
    if (lw.value.length < LWSIZE) {
      booksStore.pracs[pix].status = 'learning'
      if (pix == null) {
	console.log('+++pix null!!!2')
      }
      lw.value.push(pix)
    } else if (ww.value.length < WWSIZE) {
      // booksStore.pracs[pix].status = 'waiting'
      ww.value.push(pix)
    }
    if (lw.value.length == LWSIZE && ww.value.length == WWSIZE) return
  }
  wordsNoPrac.value = [...wnp]

  // non-due review items in the order of due_counter (large to small)
  // ps = []
  // for (let [ix, p] of booksStore.pracs.entries()) {
  //   if (p.status == 'review' && p.due_counter > 0) {
  // 	ps.unshift(ix)
  //   }
  // }
  // ps.sort((a, b) => booksStore.pracs[b].due_counter - booksStore.pracs[a].due_counter)  // descending (large to small)
  // while (ps.length && lw.value.length < LWSIZE) {
  //   let pix = ps.pop()  // smallest
  //   if (!['review', 'waiting'].includes(booksStore.pracs[pix].status)) {
  // 	booksStore.pracs[pix].status = 'learning'
  //   }
  //   lw.value.push(pix)  // tail
  // }
  // while (ps.length && ww.value.length < WWSIZE) {
  //   let pix = ps.pop()  // smallest
  //   ww.value.push(pix) // tail
  // }
  //}
}

async function doPrac() {
  if (isNextDayOrLater(lastSyncTime.value)) {
    await syncServer()
  }
  fillWins()
  if (lw.value.length == 0) {
    pracIdx.value = null
    return
  }
  pracIdx.value = lw.value[0]  // not remove yet
}

function onceMore() {
  isFlipped.value = false
  lw.value.push(lw.value.shift())
  booksStore.pracs[pracIdx.value].last_edited = new Date()
  booksStore.pracs[pracIdx.value].last_practiced = new Date()
  doPrac()
}

function memorized() {
  isFlipped.value = false
  if (booksStore.pracs[pracIdx.value].status == 'review') {
    booksStore.pracs[pracIdx.value].due_dates *= 2
    booksStore.pracs[pracIdx.value].due_counter = booksStore.pracs[pracIdx.value].due_dates
  } else {
    booksStore.pracs[pracIdx.value].status = 'review'
    booksStore.pracs[pracIdx.value].due_dates = 1
    booksStore.pracs[pracIdx.value].due_counter = 1
  }
  lw.value.shift()
  booksStore.pracs[pracIdx.value].last_edited = new Date()
  booksStore.pracs[pracIdx.value].last_practiced = new Date()
  doPrac()
}

function okay() {
  //console.log('ok is pushed')
  isFlipped.value = false
  if (booksStore.pracs[pracIdx.value].status == 'review') {
    ww.value.push(lw.value.shift()) // put tail of ww
    lw.value.push(ww.value.shift())
  } else if (booksStore.pracs[pracIdx.value].status == 'waiting'){
    booksStore.pracs[pracIdx.value].status = 'review'
    booksStore.pracs[pracIdx.value].due_dates = 1
    booksStore.pracs[pracIdx.value].due_counter = 1
    lw.value.shift()
    const pix = ww.value.shift()    
    if (pix == null) {
      console.log('+++pix null!!!3')
    } else {
      lw.value.push(pix)
    }
  } else {  // new or learning
    //console.log(`change to waiting: ${pracIdx.value}`)
    booksStore.pracs[pracIdx.value].status = 'waiting'
    ww.value.push(lw.value.shift()) // put tail of ww
    lw.value.push(ww.value.shift())
    //console.log(`${booksStore.pracs[pracIdx.value].status}`)
  }
  booksStore.pracs[pracIdx.value].last_edited = new Date()
  booksStore.pracs[pracIdx.value].last_practiced = new Date()
  doPrac()
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
    console.log('Using female voice:', bestVoice.name)
  } else {
    console.warn('No preferred female voice matched, using browser default.')
  }

  window.speechSynthesis.speak(utterance)
}

onMounted(async () => {
  loadVoices()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadVoices
  }
  await syncServer()
  doPrac()
})

</script>

<template>
  <Navbar>
    <li><div @click="syncServer"><RefreshCw />Sync</div></li>
    <div class="divider my-1"></div>
  </Navbar>
  <div>
    <div class="flex items-center justify-center">

      <div v-if="lw.length > 0" class="card card-lg bg-base-100 w-full h-[280px] border border-base-300 rounded-3xl shadow-sm mt-8 mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200">
	<!-- Card Header/Body Wrapper -->
	<div @click="pracIdx !== null && (isFlipped = !isFlipped)" class="card-body flex flex-col justify-between h-full p-4 cursor-pointer">
    
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
		<h1 v-if="booksStore.pracdir === 'dw'" class="text-4xl font-bold text-center">
		  {{ booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.word }}
		</h1>
		<h1 v-else class="text-4xl font-bold text-center">
		  {{ booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.definition }}
		</h1>
              </div>

              <!-- Back Content -->
              <div v-else key="back" class="flex flex-col items-center justify-center space-y-4 overflow-y-auto max-h-[220px] px-2">
		<h1 class="text-3xl font-bold text-center">{{ booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.word }}</h1>
          
		<p class="text-lg opacity-80 text-center">
		  {{ booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.definition }}
		</p>

		<p class="italic text-base-content/70 bg-base-100/50 rounded-xl text-center">
		  {{ booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.sample }}
		</p>
              </div>
	    </Transition>
	  </div>

	  <!-- Static Action Buttons -->
	  <div class="flex flex-col items-center gap-3 pt-2 border-t border-base-200/50">
	    <!-- TTS -->
	    <div class="flex justify-center gap-2 mb-3" @click.stop>
	      <button @click.stop="speakTts(booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.word)" class="btn btn-sm btn-success text-sm" :disabled="pracIdx === null || booksStore.pracDir === null || (!isFlipped && booksStore.pracDir !== 'wd')"><Music2 />Word</button>
	      <button @click.stop="speakTts(booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.sample)" class="btn btn-sm btn-info text-sm" :disabled="pracIdx === null || booksStore.pracDir === null || !isFlipped"><Music />Sample</button>
	      <button @click.stop="speakTts(booksStore.words[id2ixWord(booksStore.pracs[pracIdx]?.word_id)]?.definition)" class="btn btn-sm btn-error text-sm" :disabled="pracIdx === null || booksStore.pracDir === null || (!isFlipped && booksStore.pracDir !== 'dw')"><Music3 />Definition</button>
	    </div>
	    <!-- Action buttons -->
	    <div class="card-actions justify-center gap-2">
	      <button @click.stop="onceMore" class="btn btn-secondary rounded-3xl btn-outline btn-lg" :disabled="pracIdx === null"><ThumbsDown />Once More </button>
	      <button @click.stop="okay" class="btn btn-success rounded-3xl btn-outline btn-lg" :disabled="pracIdx === null"><ThumbsUp />Okay</button>
	      <button @click.stop="memorized" class="btn btn-info rounded-3xl btn-outline btn-lg ml-8"  :disabled="pracIdx === null"><SkipForward />Memorized</button>
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
  <p>LW: {{ lw }}</p>
  <p>WW: {{ ww }}</p>
</template>
