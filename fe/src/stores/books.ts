import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { components } from '@/types/api'
import { client } from '@/api/client'
import { useUserStore } from '@/stores/user'
import { useRoute } from 'vue-router'

type BookSchema = components['schemas']['BookSchema']
type WordSchema = components['schemas']['WordSchema']
type PracticeSchema = components['schemas']['PracticeSchema']
//type ListBooksResp = components['schemas']['ListBooksResp']
type PracDir = components['schemas']['PracDir']

export interface LogRecord {
  prac: PracticeSchema
  infoMem: number
  infoTried: number
  newWordsCap: number
}

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

  const route = useRoute()

  const userStore = useUserStore()
  const userId = computed(() => userStore.user_id ?? null)

  function reset() {
    books.value = []
    words.value = []
    pracs.value = []
    activeBookId.value = null
    pracDir.value = null
    wordsNoPrac.value = []
    lastSyncTime.value = null
    infoMem.value = 0
    infoTried.value = 0
    newWordsCap.value = 20
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
    const { data, error } = await client.GET('/api/books')
    if (error) {
      return
    }

    books.value = data.books
  }

  async function fetchWords() {
    const id = activeBookId.value
    if (id === null) return
    const { data, error } = await client.GET("/api/books/{id}/words", {
      params: { path: { id: id } },
    })
    if (error) {
      return
    }
    words.value = data.words
    return
  }

  async function syncBook() {
    if (route.path.startsWith('/demo')) return true
    if (activeBookId.value === null) return true
    let data, error
    try {
      const res = await client.POST('/api/sync/{id}', {
	params: { path: { id: activeBookId.value } },
	body: { practices: pracs.value },
      })
      data = res.data
      error = res.error
    } catch (err) {
      console.log('syncBook - exception while sync with server', err)
      return false
    }
    if (error) {
      console.log('syncBook - error sync with server', error)
      return false
    }
    const idx = books.value.findIndex((b) => b.id === activeBookId.value)
    if (idx !== -1 && data) {
      books.value[idx] = data.book
      words.value = data.words
      pracs.value = data.practices
      return true
    }
    console.log('syncBook - book dx, words and/or pracs corrupt', idx)
    return false
  }
  
  async function addBook(bookName: string | null): Promise<{ status: number, message: string }> {
    if (!bookName) return { status: 404, message: "Book not found" }
    const { data, error } = await client.POST('/api/books', {
      body: { name: bookName },
    })
    if (error) return { status: 404, message: "Book not found" }
    books.value.push(data.book)
    return { status: 200, message: "Added book"}
  }

  async function editBook(bookName: string, book_id: number): Promise<{ status: number, message: string}> {
    if (!bookName) return { status: 404, message: "Book not found" }
    const { data, error, response } = await client.PATCH('/api/books/{id}', {
      params: { path: { id: book_id }},
      body: { name: bookName },
    })
    if (error) {
      if ('message' in error) {
	return { status: response.status, message: error.message }
      } else {
	return { status: response.status, message: "?(unhandled)"}
      }
    }
    const bix: number | null = id2ixBook(book_id)
    if (bix === null) return { status: 404, message: "Book not found" }
    books.value[bix] = data.book
    return { status: 200, message: "Updated book"}
  }

  async function deleteBook(book: BookSchema | null): Promise<{ status: number, message: string }> {
    if (!book) return { status: 404, message: "Book not found" }
    const { error, response } = await client.DELETE('/api/books/{id}', {
      params: { path: { id: book.id }},
    })
    if (error) {
      if ('message' in error) {
	return { status: response.status, message: error.message }
      } else {
	return { status: response.status, message: "?(unhandled)"}
      }
    }
    const bix: number | null = id2ixBook(book.id)
    if (bix === null) return { status: 404, message: "Book not found" }
    books.value.splice(bix, 1)
  return { status: 200, message: "Deleted book" }
  }
  
  async function addWord(word: string | null, definition: string, sample: string, book_id: number | null): Promise<{ status: number, message: string }> {
    if (!book_id) return { status: 404, message: "Book not found" }
    if (!word) return { status: 404, message: "Word not found" }
    const { data, error, response } = await client.POST('/api/books/{id}/words', {
      params: { path: { id: book_id } },
      body: { word: word, definition: definition, sample: sample },
    })
    if (error) {
      if ('message' in error) {
	return { status: response.status, message: error.message }
      } else {
	return { status: response.status, message: "?(unhandled)"}
      }
    }
    words.value.push(data.word)
    return { status: 200, message: "Added word"}
  }

  async function editWord(word: string | null, definition: string, sample: string, book_id: number, word_id: number): Promise<{ status: number, message: string}> {
    if (!word) return { status: 404, message: "Word not found" }
    const { data, error, response } = await client.PATCH('/api/books/{bid}/words/{wid}', {
      params: { path: { bid: book_id, wid: word_id } },
      body: { word: word, definition: definition, sample: sample },
    })
    if (error) {
      if ('message' in error) {
	return { status: response.status, message: error.message }
      } else {
	return { status: response.status, message: "?(unhandled)"}
      }
    }
    const wix: number | null = id2ixWord(word_id)
    if (wix === null) return { status: 404, message: "Word not found" }
    words.value[wix] = data.word
    return { status: 200, message: "Updated word"}
  }

  async function deleteWord(word: WordSchema | null): Promise<{ status: number, message: string}> {
    if (!word) return { status: 404, message: "Word not found" }
    const { error, response } = await client.DELETE('/api/books/{bid}/words/{wid}', {
      params: { path: { bid: word.book_id, wid: word.id } },
    })
    if (error) {
      if ('message' in error) {
	return { status: response.status, message: error.message }
      } else {
	return { status: response.status, message: "?(unhandled)"}
      }
    }
    const wix: number | null = id2ixWord(word.id)
    if (wix === null) return { status: 404, message: "Word not found" }
    words.value.splice(wix, 1)
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

  async function syncServer() {
    if (route.path.startsWith('/demo')) return true
    if (!(await syncBook())) return false

    createWordsNoPrac()
    lastSyncTime.value = new Date() // now

    // decrement due_counters
    const bookIndex = id2ixBook(activeBookId.value)
    if (bookIndex === null) {
      console.log('syncServer - no activeBookId', activeBookId.value)
      return true  // no need for decrementing (or a bug)
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
    return true
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

  // interface LogRecord {
  //   prac: PracticeSchema
  //   infoMem: number
  //   infoTried: number
  //   newWordsCap: number
  // }
  
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
  
  function syncPending() {
    //console.log('syncPending')
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
    // if (i==sessions.length) -> the session is not in the list. Do I care?
    if (i==sessions.length) {
      sessions.push({'id': sessionId, 'updated': new Date().toISOString()})
    }
    const validSessions = expireOldSessions(sessions)
    localStorage.setItem('vb2:sessions', JSON.stringify(validSessions))

    // replay log to snapshot (for the session)
    //console.log('syncPending: replay start')
    const logList: LogRecord[] = []
    const toRemove = []
    let maxCnt = -1
    let _infoMem = 0
    let _infoTried = 0
    let _newWordsCap = 20
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`vb2:${sessionId}:log:`)) {
	const cnt = Number(key.split(`vb2:${sessionId}:log:`)[1]) || 0
	const raw = localStorage.getItem(key)
	if (raw) {
	  const record: LogRecord = JSON.parse(raw)
	  if (record.prac.user_id !== userId.value) return  // just break?
	  let i = 0
	  for (; i<logList.length; i++) {
	    const log = logList[i]
	    if (log && log.prac.word_id == record.prac.word_id && log.prac.direction == record.prac.direction) {
	      if (log.prac.last_edited < record.prac.last_edited) {
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
    // do replay
    const raw = localStorage.getItem(`vb2:${sessionId}:snapshot`)
    if (!raw) return
    const ss: SnapshotRecord = JSON.parse(raw)
    const toAdd = []
    for (const log of logList) {
      let i = 0
      for (; i<ss.pracs.length; i++) {
	const prac = ss.pracs[i]
	if (prac && prac.word_id == log.prac.word_id && prac.direction == log.prac.direction) {
	  ss.pracs[i] = log.prac
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
    localStorage.setItem(`vb2:${sessionId}:snapshot`, JSON.stringify(ss))
    if (books.value.length == 0) { // reload?
      // restore from snapshot
      books.value = ss.books
      words.value = ss.words
      pracs.value = ss.pracs  // this will go to server
      activeBookId.value = ss.activeBookId
      pracDir.value = ss.pracDir
      infoMem.value = ss.infoMem
      infoTried.value = ss.infoTried
      newWordsCap.value = ss.newWordsCap
    }
    for (const key of toRemove) {
      localStorage.removeItem(key)
    }
    pracCounter.value = 0
  }
  
  return { books, words, pracs, activeBookId, pracDir, fetchBooks, fetchWords, syncBook, addBook, editBook, deleteBook, addWord, editWord, deleteWord, id2ixWord, id2ixBook, wordsNoPrac, lastSyncTime, isNextDayOrLater, createWordsNoPrac, syncServer, userId, reset, prepDemo, updateSnapshot, syncPending, pracCounter, infoMem, infoTried, newWordsCap, loggingOut }
})
