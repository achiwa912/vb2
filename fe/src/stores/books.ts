import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { components } from '@/types/api'
import { client } from '@/api/client'
import { useUserStore } from '@/stores/user'
import { useRoute } from 'vue-router'

type BookSchema = components['schemas']['BookSchema']
type WordSchema = components['schemas']['WordSchema']
type PracticeSchema = components['schemas']['PracticeSchema']
type PracDir = components['schemas']['PracDir']

export interface LogRecord {
  prac: PracticeSchema
  infoMem: number
  infoTried: number
  newWordsCap: number
}

export interface CacheRecord {
  bookId: number
  hasPend: boolean
  words: WordSchema[]
  pracs: PracticeSchema[]
}

export type syncBookResult = 'ok' | 'continue' | 'stop'

export const useBooksStore = defineStore('books', () => {
  const books = ref<BookSchema[]>([])
  const words = ref<WordSchema[]>([])
  const pracs = ref<PracticeSchema[]>([])
  const activeBookId = ref<number | null>(null)  // was (1)
  const pracDir = ref<PracDir | null>(null)  // was ("dw")
  const wordsNoPrac = ref<number[]>([])
  const lastSyncTime = ref<Date | null>(null)
  const pracCounter = ref<number>(0)
  const infoMem = ref<number>(0)
  const infoTried = ref<number>(0)
  const newWordsCap = ref<number>(20)
  const loggingOut = ref<boolean>(false)
  const isLoading = ref<number>(0)  // this is counter now! (was boolean)
  const isOffline = ref<boolean>(false)
  const hasPend = ref<Set<number>>(new Set())  // books with dirty cache
  
  const route = useRoute()

  const userStore = useUserStore()
  const userId = computed(() => userStore.user_id ?? null)
  const CACHE_VER = 1  // cache version

  function reset() {
    books.value = []
    words.value = []
    pracs.value = []
    activeBookId.value = null
    pracDir.value = null
    wordsNoPrac.value = []
    lastSyncTime.value = null
    pracCounter.value = 0
    infoMem.value = 0
    infoTried.value = 0
    newWordsCap.value = 20
    loggingOut.value = false
    isLoading.value = 0
    isOffline.value = false
    hasPend.value = new Set()
  }

  function prepDemo() {
    reset()
    books.value.push({id: 1, name: "demo1", user_id: -1, last_edited: null, dw_last_practiced: null, wd_last_practiced: null})
    words.value.push({id: 1, book_id: 1, word: "electoral", definition: "relating to an election", sample: "the electoral system", last_edited: "dummy"})
    words.value.push({id: 2, book_id: 1, word: "hefty", definition: "quite heavy", sample: "He gave the door a hefty kick.", last_edited: "dummy"})
    words.value.push({id: 3, book_id: 1, word: "holistic", definition: "dealing with or treating the whole of something or someone and not just a part", sample: "holistic approaches", last_edited: "dummy"})
    words.value.push({id: 4, book_id: 1, word: "potent", definition: "powerful", sample: "potent medicine", last_edited: "dummy"})
    words.value.push({id: 5, book_id: 1, word: "impersonal", definition: "not influenced by, showing, or involving personal feelings", sample: "She has a very cold and impersonal manner.", last_edited: "dummy"})
    activeBookId.value = 1
    createWordsNoPrac()
  }
  
  async function fetchBooks() {
    const cKey = `vb2:${userId.value}:cache:books:${CACHE_VER}`
    let data, error
    isLoading.value++
    try {
      ({ data, error } = await client.GET('/api/books'))
    } catch (err) {
      error = err
    } finally {
      isLoading.value--
    }
    if (error) {  // loading books from cache
      console.log('fetchBooks - loading from server failed.  Using cache')
      try {
	const raw = localStorage.getItem(cKey)
	if (raw) {
	  books.value = JSON.parse(raw)
	}
      } catch (err) {
	console.log('fetchBooks - loading from cache failed.', err)
      }
      isOffline.value = true
      return
    }
    isOffline.value = false
    books.value = data!.books
    localStorage.setItem(cKey, JSON.stringify(books.value))
  }

  async function fetchWords() {
    const id = activeBookId.value
    if (id === null) return
    let data, error
    isLoading.value++
    try {
      ({ data, error } = await client.GET("/api/books/{id}/words", {
      params: { path: { id: id } },
      }))
    } catch (err) {
      error = err
    } finally {
      isLoading.value--
    }
    if (error) {
      console.log('fetchWords - loading from server failed.  Using cache.')
      try {
	const raw = localStorage.getItem(`vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${id}`)
	if (raw) {
	  const cr: CacheRecord = JSON.parse(raw)
	  words.value = cr.words
	}
      } catch {
	console.log('fetchWords - loading from cache failed.')
      }
      isOffline.value = true
      return
    }
    words.value = data!.words
    isOffline.value = false
    return
  }

  // create hasPend from booksCache
  function createHasPend() {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`vb2:${userId.value}:cache:booksCache:${CACHE_VER}:`)) {
	const bid = Number(key.split(':')[5]) // book id
	try {
	  const raw = localStorage.getItem(key)
	  if (raw) {
	    const cr: CacheRecord = JSON.parse(raw)
	    if (cr.hasPend) {
	      hasPend.value.add(bid)
	    }
	  } else {  // doesn't have a value
	    localStorage.removeItem(key)
	  }
	} catch (err) {
	  console.log(`createHasPend - failed with key: ${key}`, err)
	  continue
	}
      }
    }
  }
  
  // flush all dirty books (ie, in hasPend)
  async function flushPend(skipBookId?: number | null) {
    if (hasPend.value.size == 0) return

    const copyHasPend = new Set(hasPend.value)
    for (const i of copyHasPend) {
      if (i == skipBookId) continue
      if (await syncBook(i) == 'stop') return
    }
  }

  // save book (activeBookId) pinia to cache
  async function saveBook() {
    if (!activeBookId.value) return true  // no book to save

    const lockName = `vb2:${userId.value}:sync:${activeBookId.value}`
    return await navigator.locks.request(lockName, async () => {
      let raw = null
      try {
	raw = localStorage.getItem(`vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${activeBookId.value}`)
      } catch (err) {
	console.log(`saveBook: localStorage.getItem failed for vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${activeBookId.value}`, err)
	return false // read error from localStorage
      }
      if (raw) {
	try {
	  const cr: CacheRecord = JSON.parse(raw)
	  const wordIds = new Set(words.value.map(w => w.id))
	  const filterOrphans = wordIds.size > 0  // empty list = not loaded (or last word deleted), so don't filter
	  const toAdd: PracticeSchema[] = []
	  for (const cp of cr.pracs) {
	    if (filterOrphans && !wordIds.has(cp.word_id)) continue  // word deleted
	    const mix = pracs.value.findIndex(p => p.word_id == cp.word_id && p.direction == cp.direction)
	    if (mix === -1) {
              toAdd.push({ ...cp })
	    } else if (ts(cp.last_edited) > ts(pracs.value[mix]!.last_edited)) {
              pracs.value[mix] = { ...cp }
	    }
	  }
	  pracs.value.push(...toAdd)
	} catch (err) {
	  console.log(`saveBook - JSON parse error`, err)
	}
      }
      const crec: CacheRecord = {
	bookId: activeBookId.value!,
	hasPend: hasPend.value.has(activeBookId.value!),
	words: words.value,
	pracs: pracs.value
      }
      try {
	localStorage.setItem(`vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${activeBookId.value}`, JSON.stringify(crec))
      } catch (err) {
	if (err instanceof DOMException && err.name === 'QuotaExceededError') {
	  console.log('saveBook: localStorage quota exceeded', err)
	} else {
	  console.log('saveBook: localStorage.setItem failed', err)
	}
	return false
      }
      return true
    })
  }

  // epoch ms; unparseable or missing counts as oldest
  function ts(s: string | null | undefined): number {
    const t = Date.parse(s ?? '')
    return Number.isNaN(t) ? 0 : t
  }
  
  // reconcile two arrays of practices
  function reconPracs(p1: PracticeSchema[], p2: PracticeSchema[]) {
    const _p: PracticeSchema[] = [...p1]
    for (const prac of p2) {
      const ix = _p.findIndex(p => (p.word_id == prac.word_id) && (p.direction == prac.direction))
      if (ix == -1) {
	_p.push(prac)
      } else {
	if (ts(prac.last_edited) > ts(_p[ix]!.last_edited)) {
	  _p[ix] = prac
	}
      }
    }
    return _p
  }

  function hasNewWork(pushed: PracticeSchema[], latest: PracticeSchema[]) {
    return latest.some((p) => {
      const q = pushed.find(
	(x) => x.word_id == p.word_id && x.direction == p.direction,
      )
      return !q || ts(p.last_edited) > ts(q.last_edited)
    })
  }

  
  // push pracs to server and pull words and reconciled pracs
  async function syncBook(bookId?: number | null): Promise<syncBookResult> {
    if (route.path.startsWith('/demo')) return 'ok'

    const targetId = bookId ?? activeBookId.value
    const lockName = `vb2:${userId.value}:sync:${targetId}`

    return await navigator.locks.request(lockName, async () => {
    
      if (!targetId) return 'ok'
      const cKey = `vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${targetId}`

      let pushed: PracticeSchema[]
      if (targetId == activeBookId.value) {
	pushed = pracs.value.map((p) => ({...p}))  // use books.pracs
      } else {
	let cr: CacheRecord | null = null
	try {
	  const raw = localStorage.getItem(cKey)
	  if (raw) cr = JSON.parse(raw)
	} catch (err) {
	  console.log('syncBook - cache read failed', err)
	}
	if (!cr) {
	  hasPend.value.delete(targetId)
	  return 'ok'  // if missing cache book, nothing I can do
	}
	pushed = cr.pracs // read from cache
      }

      let data
      isLoading.value++
      // push to server -- many could change before & after
      try {
	const res = await client.POST('/api/sync/{id}', {
	  params: { path: { id: targetId } },
	  body: { practices: pushed },
	})
	if (res.error) {
	  console.log('syncBook - error sync with server', res.error)
	  if (res.response.status == 404) {
	    hasPend.value.delete(targetId)
	    localStorage.removeItem(cKey) // cache not needed anyway
	    return 'ok'  // 404 not found
	  } else if (res.response.status == 400) { // client bug?
	    return 'continue'
	  }
	  isOffline.value = true
	  return 'stop'
	}
	data = res.data
      } catch (err) {
	// network error comes here?
	console.log('syncBook - exception while syncing with server', err)
	isOffline.value = true
	return 'stop'
      } finally {
	isLoading.value--
      }
      if (!data) {
	console.log('syncBook - no data in response from server')
	isOffline.value = true
	return 'stop'
      }

      // might be a whole new world
      let stored: CacheRecord | null = null
      try { // someone might have saved to cache
	const raw = localStorage.getItem(cKey)
	if (raw) stored = JSON.parse(raw)
      } catch (err) {
	console.log('syncBook - cache re-read error', err)
      }

      const word_ids = new Set(data.words.map(word => word.id))
      const isActive = targetId == activeBookId.value
      let local = reconPracs(isActive ? pracs.value : [], stored?.pracs ?? [])
      local = local.filter(p => word_ids.has(p.word_id))
      let merged = reconPracs(local, data.practices)
      merged = merged.filter(p => word_ids.has(p.word_id))
      const dirty = hasNewWork(pushed.filter(p => word_ids.has(p.word_id)), local)
      
      if (isActive) { // this function doesn't contaminate pinia words and pracs if it's not activeBookId!
	words.value = data.words  // from server
	pracs.value = merged
      }
      try {
	const cr: CacheRecord = {
	  bookId: targetId,
	  hasPend: dirty,
	  words: data.words,
	  pracs: merged,
	}
	localStorage.setItem(cKey, JSON.stringify(cr))
      } catch (err) {
	console.log('syncBook - cache write failed', err)
      }
      
      const idx = books.value.findIndex((b) => b.id === targetId)
      if (idx !== -1) books.value[idx] = data.book
      if (dirty) {
	hasPend.value.add(targetId)
      } else {
	hasPend.value.delete(targetId)  // remove from dirty set
      }
      isOffline.value = false
      return 'ok'
    })
  }

  // load activeBookId book from cache
  function loadCacheBook() {
    const bid = activeBookId.value
    if (!bid) return false
    
    const cKey = `vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${bid}`
    try {
      const raw = localStorage.getItem(cKey)
      if (raw) {
	const cr: CacheRecord = JSON.parse(raw)
	words.value = cr.words
	pracs.value = cr.pracs
	if (cr.hasPend) {
	  hasPend.value.add(bid)
	}
      }
    } catch (err) {
      console.log(`loading book id: ${bid} from cache failed`, err)
      return false
    }
    return true
  }
  
  async function addBook(bookName: string | null): Promise<{ status: number, message: string }> {
    if (!bookName) return { status: 404, message: "Book name null" }
    isLoading.value++
    try {
      const { data, error, response } = await client.POST('/api/books', {
      body: { name: bookName },
      })
      if (error) {
	return { status: response.status, message: JSON.stringify(error) }
      }
      books.value.push(data!.book)
      return { status: 200, message: "Added book"}
    } catch (err) { // network or unexpected error?
      return { status: 500, message: err instanceof Error ? err.message : String(err) }
    } finally {
      isLoading.value--
    }
  }

  async function editBook(bookName: string, book_id: number): Promise<{ status: number, message: string}> {
    if (!bookName) return { status: 999, message: "Book name null" }
    isLoading.value++
    try {
      const { data, error, response } = await client.PATCH('/api/books/{id}', {
	params: { path: { id: book_id }},
	body: { name: bookName },
      })
      if (error) {
	return { status: response.status, message: error instanceof Error ? error.message : String(error) }
      }
      const bix: number | null = id2ixBook(book_id)
      if (bix === null) return { status: 404, message: "Book not found" }
      books.value[bix] = data!.book
      return { status: 200, message: "Updated book"}
    } catch (err) {
      return { status: 998, message: err instanceof Error ? err.message : String(err) }
    } finally {
      isLoading.value--
    }
  }

  async function deleteBook(book: BookSchema | null): Promise<{ status: number, message: string }> {
    if (!book) return { status: 999, message: "Book empty" }
    isLoading.value++
    try {
      const { error, response } = await client.DELETE('/api/books/{id}', {
	params: { path: { id: book.id }},
      })
      if (error) {
	return { status: response.status, message: error instanceof Error ? error.message : String(error) }
      }
      const bix: number | null = id2ixBook(book.id)
      if (bix === null) return { status: 998, message: "Book not found" }
      books.value.splice(bix, 1)
      return { status: 200, message: "Deleted book" }
    } catch (err) {
      return { status: 997, message: err instanceof Error ? err.message : String(err) }
    } finally {
      isLoading.value--
    }
  }
  
  async function addWord(word: string | null, definition: string, sample: string, book_id: number | null): Promise<{ status: number, message: string }> {
    if (!book_id) return { status: 999, message: "Book null" }
    if (!word) return { status: 998, message: "Word null" }
    isLoading.value++
    try {
      const { data, error, response } = await client.POST('/api/books/{id}/words', {
	params: { path: { id: book_id } },
	body: { word: word, definition: definition, sample: sample },
      })
      if (error) {
	return { status: response.status, message: error instanceof Error ? error.message : String(error) }
      }
      words.value.push(data!.word)
      return { status: 200, message: "Added word"}
    } catch (err) {
      return { status: 997, message: err instanceof Error ? err.message : String(err) }
    } finally {
      isLoading.value--
    }
  }

  async function editWord(word: string | null, definition: string, sample: string, book_id: number, word_id: number): Promise<{ status: number, message: string}> {
    if (!word) return { status: 999, message: "Word null" }
    isLoading.value++
    try {
      const { data, error, response } = await client.PATCH('/api/books/{bid}/words/{wid}', {
	params: { path: { bid: book_id, wid: word_id } },
	body: { word: word, definition: definition, sample: sample },
      })
      if (error) {
	return { status: response.status, message: error instanceof Error ? error.message : String(error) }
      }
      const wix: number | null = id2ixWord(word_id)
      if (wix === null) return { status: 998, message: "Word not found" }
      words.value[wix] = data!.word
      return { status: 200, message: "Updated word"}
    } catch (err) {
      return { status: 997, message: err instanceof Error ? err.message : String(err) }
    } finally {
      isLoading.value--
    }
  }

  async function deleteWord(word: WordSchema | null): Promise<{ status: number, message: string}> {
    if (!word) return { status: 999, message: "Word null" }
    isLoading.value++
    try {
      const { error, response } = await client.DELETE('/api/books/{bid}/words/{wid}', {
	params: { path: { bid: word.book_id, wid: word.id } },
      })
      if (error) {
	return { status: response.status, message: error instanceof Error ? error.message : String(error) }
      }
    } catch (err) {
      return { status: 997, message: err instanceof Error ? err.message : String(err) }
    } finally {
      isLoading.value--
    }
    const wix: number | null = id2ixWord(word.id)
    if (wix === null) return { status: 998, message: "Word not found" }
    words.value.splice(wix, 1)
    // delete up to 2 pracs of different directions
    pracs.value = pracs.value.filter(p => p.word_id !== word.id)
    await saveBook()  // remove from cache as well
    return { status: 200, message: "Deleted word"}
  }
    
  function id2ixWord(wid: number): number | null {
    for (const [ix, w] of words.value.entries()) {
      if (w.id == wid) return ix
    }
    return null
  }

  function id2ixBook(bid: number | null): number | null {
    if (!bid) return null
    for (const [ix, b] of books.value.entries()) {
      if (b.id == bid) return ix
    }
    return null
  }

  function isNextDayOrLater(referenceDate: Date | null, now: Date = new Date()): boolean {
    if (referenceDate == null) return false
    const startOfNextDay = new Date(referenceDate);
    startOfNextDay.setHours(24, 0, 0, 0); // Rolls over to 00:00:00 of tomorrow
    //console.log(`Firing sync from isNextDayOrLater?: ${now >= startOfNextDay}`)
    return now >= startOfNextDay;
  }
  
  function createWordsNoPrac() {
    const wnp: number[] = [...Array(words.value.length).keys()]
    for (const prac of pracs.value) {
      if (prac.direction == pracDir.value) {
	const ixDel = wnp.indexOf(id2ixWord(prac.word_id) ?? -1)
	if (ixDel !== -1) {
	  wnp.splice(ixDel, 1)
	}
      }
    }
    for (let i=wnp.length-1; i>0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [wnp[i]!, wnp[j]!] = [wnp[j]!, wnp[i]!]
    }
    wordsNoPrac.value = wnp
  }

  async function updateDueCounters() {  // was syncServer()
    if (route.path.startsWith('/demo')) return

    createWordsNoPrac()
    lastSyncTime.value = new Date() // now

    // decrement due_counters
    const bookIndex = id2ixBook(activeBookId.value)
    if (bookIndex === null) {
      console.log('updateDueCounters - no activeBookId', activeBookId.value)
      return
    }
    for (const prac of pracs.value) {
      if (pracDir.value == prac.direction && prac.status == 'review') {
	const lastt = new Date(Math.max(new Date(prac.last_practiced || 0).getTime(), new Date(prac.last_edited).getTime()))
	if (isNextDayOrLater(lastt)) {
	  const oldCnt = prac.due_counter
	  prac.due_counter = Math.max((prac.due_counter ?? 0)-1, 0)
	  if (prac.due_counter != oldCnt) {
	    prac.last_edited = new Date().toISOString()
	  }
	}
      }
    }
    return
  }

  function isDaysOrOlder(timestamp: Date | string | number, days: number): boolean {
    const target = new Date(timestamp).getTime()

    if (Number.isNaN(target)) {
      throw new TypeError(`Invalid timestamp: ${timestamp}`)
    }

    return target <= Date.now() - days * 24 * 60 * 60 * 1000
  }

  interface SessionRecord {
    id: string
    updated: string  // ISO date string
  }

  interface SnapshotRecord {
    userId: number
    books: BookSchema[]
    words: WordSchema[]
    pracs: PracticeSchema[]
    activeBookId: number | null
    pracDir: PracDir | null
    infoMem: number
    infoTried: number
    newWordsCap: number
  }

  function expireOldSessions(sessions: SessionRecord[]): SessionRecord[] {
    const expiredSessionIds = new Set()
    const validSessions = sessions.filter((session: SessionRecord) => {
      if (isDaysOrOlder(session.updated, 30)) {  // 30 days or older?
	expiredSessionIds.add(session.id)
	return false
      }
      return true
    })
    if (expiredSessionIds.size > 0) {
      const KeysToRemove = []
      for (let i=0; i< localStorage.length; i++) {
	const key = localStorage.key(i)
	if (key && Array.from(expiredSessionIds).some(id => key.startsWith(`vb2:${id}:`))) {
	  KeysToRemove.push(key)  // remove both log and snapshot
	}
      }
      KeysToRemove.forEach(key => localStorage.removeItem(key))
    }
    return validSessions
  }

  // create snapshot from pinia
  function updateSnapshot(sessionId?: string | null) {
    if (!userId.value) return
    if (!sessionId) {
      sessionId = sessionStorage.getItem('vb2:sessionId')
    }
    const snapshot: SnapshotRecord = {
      userId: userId.value,
      books: books.value,
      words: words.value,
      pracs: pracs.value,
      activeBookId: activeBookId.value,
      pracDir: pracDir.value,
      infoMem: infoMem.value,
      infoTried: infoTried.value,
      newWordsCap: newWordsCap.value,
    }
    localStorage.setItem(`vb2:${sessionId}:snapshot`, JSON.stringify(snapshot))
  }

  // generate cache from snapshot
  async function cacheSnap(ss: SnapshotRecord, dirty: boolean) {
    if (!ss.activeBookId) return

    const lockName = `vb2:${userId.value}:sync:${ss.activeBookId}`
    return await navigator.locks.request(lockName, async () => {
      let _pracs: PracticeSchema[] = []
      try {
	const raw = localStorage.getItem(`vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${ss.activeBookId}`)
	if (raw) {
	  const cro: CacheRecord = JSON.parse(raw)
	  if (cro.hasPend) {
	    dirty = true
	  }
	  _pracs = reconPracs(cro.pracs, ss.pracs) // reconcile cache & ss
	} else {
	  _pracs = ss.pracs
	}
      } catch (err) {
	console.log('cacheSnap - cache read error', err)
	_pracs = ss.pracs
	dirty = true
      }
    
      if (dirty) {
	hasPend.value.add(ss.activeBookId!)
      }
      const cr: CacheRecord = {
	bookId: ss.activeBookId!,
	hasPend: dirty,
	words: ss.words,
	pracs: _pracs
      }
      try {
	localStorage.setItem(`vb2:${userId.value}:cache:booksCache:${CACHE_VER}:${ss.activeBookId}`, JSON.stringify(cr))
      } catch (err) {
	console.log('cacheSnap - cache write error', err)
      }
      if (ss.activeBookId == activeBookId.value) {
	pracs.value = _pracs
      }
    
      // clean up cache with older versions
      for (const key of Object.keys(localStorage)) {
	if (key.startsWith(`vb2:${userId.value}:cache:booksCache:`)) {
	  const keySubs = key.split(':')
	  const ver = Number(keySubs[4]) || 0
	  if (ver < CACHE_VER) {
	    try {
	      localStorage.removeItem(key)
	    } catch (err) {
	      console.log('cacheSnap - old cache remove error', err)
	    }
	  }
	}
      }
    })
  }

  // Iterate snapshots of all sessions, reconcile cache and sync to server
  // called only from onMounted in BooksView
  async function syncPendAll() {
    const existing = localStorage.getItem('vb2:sessions')
    const sessions = existing ? JSON.parse(existing) : []
    for (const session of sessions) {
      const raw = localStorage.getItem(`vb2:${session.id}:snapshot`)
      if (raw) {
	const ss: SnapshotRecord = JSON.parse(raw)
	if (userId.value && ss.userId !== userId.value) continue
      }
      const retval = replayLogs(session.id)
      if (!retval) continue
      const { ss, isDirty } = retval
      localStorage.setItem(`vb2:${session.id}:snapshot`, JSON.stringify(ss))
      if (isDirty) {
	await cacheSnap(ss, isDirty)
      }
    }
  }
  
  // Create or update snapshot for the session
  async function syncPending() {
    let sessionId = sessionStorage.getItem('vb2:sessionId')
    if (sessionId) {
      let cleanFlag = false
      const raw = localStorage.getItem(`vb2:${sessionId}:snapshot`)
      if (raw) {
	const ss: SnapshotRecord = JSON.parse(raw)
	if (userId.value && ss.userId !== userId.value) {
	  cleanFlag = true
	  console.log("userId don't match.  Cleaning.", userId.value, ss.userId)
	}
      }
      // if different user, clean snapshot and logs
      if (cleanFlag) {
	localStorage.removeItem(`vb2:${sessionId}:snapshot`)
	const toRemove = []
	for (const key of Object.keys(localStorage)) {
	  if (key.startsWith(`vb2:${sessionId}:log:`)) {
	    toRemove.push(key)
	  }
	}
	for (const key of toRemove) {
	  localStorage.removeItem(key)
	}
	const existing = localStorage.getItem('vb2:sessions')
	const sessions = existing ? JSON.parse(existing) : []
	let i = 0
	for (; i<sessions.length; i++) {
	  if (sessions[i].id == sessionId) break
	}
	if (i <sessions.length) {
	  sessions.splice(i, 1)
	  localStorage.setItem('vb2:sessions', JSON.stringify(sessions))
	}
	sessionId = null
      }
    }
    if (sessionId === null) {
      sessionId = crypto.randomUUID()
      sessionStorage.setItem('vb2:sessionId', sessionId)
      pracCounter.value = 0
      
      // clean up old sessions
      const existing = localStorage.getItem('vb2:sessions')
      const sessions = existing ? JSON.parse(existing) : []
      sessions.push({'id': sessionId, 'updated': new Date().toISOString()})

      const validSessions = expireOldSessions(sessions)
      localStorage.setItem('vb2:sessions', JSON.stringify(validSessions))

      updateSnapshot(sessionId)
      return
    }
    
    // update localStorage timestamp & clean up old snapshot & log
    //console.log('update snap timestamp')
    const existing = localStorage.getItem('vb2:sessions')
    const sessions = existing ? JSON.parse(existing) : []
    let i = 0
    for (; i<sessions.length; i++) {
      if (sessions[i].id == sessionId) {
	sessions[i].updated = new Date().toISOString()
	break
      }
    }
    if (i==sessions.length) {
      sessions.push({'id': sessionId, 'updated': new Date().toISOString()})
    }
    const validSessions = expireOldSessions(sessions)
    localStorage.setItem('vb2:sessions', JSON.stringify(validSessions))

    // replay log to snapshot (for the session)
    const retval = replayLogs(sessionId)
    if (!retval) return
    const { ss, logList, isDirty } = retval

    localStorage.setItem(`vb2:${sessionId}:snapshot`, JSON.stringify(ss))
    if (books.value.length == 0 || logList.length > 0) { // reload?
      // restore from snapshot
      books.value = ss.books
      words.value = ss.words
      pracs.value = ss.pracs  // this will go to server
      activeBookId.value = ss.activeBookId
      pracDir.value = ss.pracDir
      infoMem.value = ss.infoMem
      infoTried.value = ss.infoTried
      newWordsCap.value = ss.newWordsCap
      await cacheSnap(ss, isDirty)  // generate cache from snapshot if reload
    }
    pracCounter.value = 0
  }

  function replayLogs(sessionId: string) {
    const logList: LogRecord[] = []
    const toRemove = []
    let maxCnt = -1
    let _infoMem = 0
    let _infoTried = 0
    let _newWordsCap = 20
    let isDirty = false
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`vb2:${sessionId}:log:`)) {
	const cnt = Number(key.split(`vb2:${sessionId}:log:`)[1]) || 0
	const raw = localStorage.getItem(key)
	if (raw) {
	  const record: LogRecord = JSON.parse(raw)
	  if (record.prac.user_id !== userId.value) continue // was return
	  let i = 0
	  for (; i<logList.length; i++) {
	    const log = logList[i]
	    if (log && log.prac.word_id == record.prac.word_id && log.prac.direction == record.prac.direction) {
	      if (ts(log.prac.last_edited) < ts(record.prac.last_edited)) {
		logList[i] = record
		if (cnt > maxCnt) {
		  maxCnt = cnt
		  _infoMem = record.infoMem
		  _infoTried = record.infoTried
		  _newWordsCap = record.newWordsCap
		}
	      }
	      break
	    }
	  }
	  if (i == logList.length) {
	    logList.push(record)
	    if (cnt > maxCnt) {
	      maxCnt = cnt
	      _infoMem = record.infoMem
	      _infoTried = record.infoTried
	      _newWordsCap = record.newWordsCap
	    }
	  }
	}
	toRemove.push(key)
      }
    }
    if (logList.length > 0) {
      isDirty = true
    }
    // do replay
    const raw = localStorage.getItem(`vb2:${sessionId}:snapshot`)
    if (!raw) return null
    const ss: SnapshotRecord = JSON.parse(raw)
    const toAdd = []
    for (const log of logList) {
      let i = 0
      for (; i<ss.pracs.length; i++) {
	const prac = ss.pracs[i]
	if (prac && prac.word_id == log.prac.word_id && prac.direction == log.prac.direction) {
	  if (ts(log.prac.last_edited) > ts(prac.last_edited)) {
	    ss.pracs[i] = log.prac
	  }
	  break
	}
      }
      if (i == ss.pracs.length) {
	toAdd.push(log.prac)
      }
    }
    for (const prac of toAdd) {
      ss.pracs.push(prac)
    }
    ss.infoMem = Math.max(ss.infoMem, _infoMem)
    ss.infoTried = Math.max(ss.infoTried, _infoTried)
    ss.newWordsCap = Math.min(ss.newWordsCap, _newWordsCap)
    
    for (const key of toRemove) {
      localStorage.removeItem(key)
    }
    return { ss, logList, isDirty }
  }
  
  return { books, words, pracs, activeBookId, pracDir, fetchBooks, fetchWords, syncBook, loadCacheBook, addBook, editBook, deleteBook, addWord, editWord, deleteWord, id2ixWord, id2ixBook, wordsNoPrac, lastSyncTime, isNextDayOrLater, createWordsNoPrac, updateDueCounters, userId, reset, prepDemo, updateSnapshot, syncPendAll, syncPending, pracCounter, infoMem, infoTried, newWordsCap, loggingOut, isLoading, isOffline, createHasPend, hasPend, flushPend, saveBook }
})
