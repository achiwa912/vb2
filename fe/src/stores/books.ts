import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { components } from '@/types/api'
import { client } from '@/api/client'
import { useUserStore } from '@/stores/user'

type BookSchema = components['schemas']['BookSchema']
type WordSchema = components['schemas']['WordSchema']
type PracticeSchema = components['schemas']['PracticeSchema']
//type ListBooksResp = components['schemas']['ListBooksResp']
type PracDir = components['schemas']['PracDir']


export const useBooksStore = defineStore('books', () => {
  const books = ref<BookSchema[]>([])
  const words = ref<WordSchema[]>([])
  const pracs = ref<PracticeSchema[]>([])
  const activeBookId = ref<number | null>(1)  // ++++ to (null)
  const pracDir = ref<PracDir | null>("dw")  // ++++ to (null)
  const wordsNoPrac = ref<number[]>([])
  const lastSyncTime = ref<Date | null>(null)

  const userStore = useUserStore()
  const userId = computed(() => userStore.user_id ?? null)
  
  async function fetchBooks() {
    const { data, error } = await client.GET('/books', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`}
    })
    if (error) {
      return
    }

    books.value = data.books
  }

  async function fetchWords() {
    const id = activeBookId.value
    if (id === null) return
    const { data, error } = await client.GET("/books/{id}/words", {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
      params: { path: { id: id } },
    })
    if (error) {
      return
    }
    words.value = data.words
  }

  async function syncBook() {
    if (activeBookId.value === null) return
    const { data, error } = await client.POST('/sync/{id}', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
      params: { path: { id: activeBookId.value } },
      body: { practices: pracs.value },
    })
    if (error) {
      return
    }
    const idx = books.value.findIndex((b) => b.id === activeBookId.value)
    books.value[idx] = data.book
    words.value = data.words
    pracs.value = data.practices
  }
  
  async function addBook(bookName: string | null): Promise<{ status: number, message: string }> {
    if (!bookName) return { status: 404, message: "Book not found" }
    const { data, error } = await client.POST('/books', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
      body: { name: bookName },
    })
    if (error) return { status: 404, message: "Book not found" }
    books.value.push(data.book)
    return { status: 200, message: "Added book"}
  }

  async function editBook(bookName: string, book_id: number): Promise<{ status: number, message: string}> {
    if (!bookName) return { status: 404, message: "Book not found" }
    const { data, error, response } = await client.PATCH('/books/{id}', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
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
    const { error, response } = await client.DELETE('/books/{id}', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
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
    const { data, error, response } = await client.POST('/books/{id}/words', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
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
    const { data, error, response } = await client.PATCH('/books/{bid}/words/{wid}', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
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
    const { error, response } = await client.DELETE('/books/{bid}/words/{wid}', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
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
    let wnp: number[] = [...Array(words.value.length).keys()]
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
    await syncBook()

    createWordsNoPrac()
    lastSyncTime.value = new Date() // now

    // decrement due_counters
    const bookIndex = id2ixBook(activeBookId.value)
    if (bookIndex === null) return
    if (pracDir.value == 'wd') {
      const lastp = books.value[bookIndex]?.wd_last_practiced
      if (!isNextDayOrLater(lastp ? new Date(lastp) : null)) return
    } else {
      const lastp = books.value[bookIndex]?.dw_last_practiced
      if (!isNextDayOrLater(lastp ? new Date(lastp) : null)) return
    }
    for (let prac of pracs.value) {
      if (pracDir.value == prac.direction && prac.status == 'review') {
	const oldCnt = prac.due_counter
	prac.due_counter = Math.max((prac.due_counter ?? 0)-1, 0)
	if (prac.due_counter != oldCnt) {
	  prac.last_edited = new Date().toISOString()
	}
      }
    }
  }
  
  return { books, words, pracs, activeBookId, pracDir, fetchBooks, fetchWords, syncBook, addBook, editBook, deleteBook, addWord, editWord, deleteWord, id2ixWord, id2ixBook, wordsNoPrac, lastSyncTime, isNextDayOrLater, createWordsNoPrac, syncServer, userId }
})
