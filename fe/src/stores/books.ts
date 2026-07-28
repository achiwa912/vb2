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
  
  
  return { books, words, pracs, activeBookId, pracDir, fetchBooks, fetchWords, syncBook }
})
