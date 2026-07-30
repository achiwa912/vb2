import {ref } from 'vue'
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

  const userStore = useUserStore()
  
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

  async function addWord(word: WordSchema): Promise<boolean> {
    if (!word) return false
    const { data, error } = await client.POST('/books/{id}/words', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
      params: { path: { id: word.book_id } },
      body: { word: word.word, definition: word.definition, sample: word.sample },
    })
    if (error) return false
    words.value.push(data.word)
    return true
  }

  async function editWord(word: WordSchema): Promise<boolean> {
    if (!word) return false
    const { data, error } = await client.PATCH('/books/{bid}/words/{wid}', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
      params: { path: { bid: word.book_id, wid: word.id } },
      body: { word: word.word, definition: word.definition, sample: word.sample },
    })
    if (error) return false
    const wix: number | null = id2ixWord(word.id)
    if (wix === null) return false
    words.value[wix] = data.word
    return true
  }

  async function deleteWord(word: WordSchema): Promise<boolean> {
    if (!word) return false
    const { error } = await client.DELETE('/books/{bid}/words/{wid}', {
      headers: { 'Authorization': `Bearer ${userStore.access_token}`},
      params: { path: { bid: word.book_id, wid: word.id } },
    })
    if (error) return false
    const wix: number | null = id2ixWord(word.id)
    if (wix === null) return false
    pracs.value.splice(wix, 1)
    return true
  }
    
  function id2ixWord(wid: number): number | null {
    for (const [ix, w] of words.value.entries()) {
      if (w.id == wid) return ix
    }
    return null
  }

  function id2ixBook(bid: number): number | null {
    for (const [ix, b] of books.value.entries()) {
      if (b.id == bid) return ix
    }
    return null
  }
  
  return { books, words, pracs, activeBookId, pracDir, fetchBooks, fetchWords, syncBook, addWord, editWord, deleteWord, id2ixWord, id2ixBook }
})
