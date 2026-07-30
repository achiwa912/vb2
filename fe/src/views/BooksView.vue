<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBooksStore } from '@/stores/books'
import type { components } from '@/types/api'
import Navbar from '@/components/Navbar.vue'
import { useRouter } from 'vue-router'
import { formatDate } from '@/utils/utils'

type BookSchema = components['schemas']['BookSchema']

const booksStore = useBooksStore()
const router = useRouter()

function wordsView(bid) {
  booksStore.activeBookId = bid
  router.push('/words')
}

onMounted(async () => {
  booksStore.books = []
  booksStore.words = []
  booksStore.pracs = []
  await booksStore.fetchBooks()
})
</script>

<template>
  <Navbar>
  </Navbar>

  <div class="p-6">
    <h1 class="text-3xl font-semibold">Books</h1>
    
    <div v-for="book in booksStore.books">
      <div @click="wordsView(book.id)" class="card card-border bg-base-100 w-128 mt-4 hover:bg-base-200 border border-base-300 rounded-3xl px-6 transition-all duration-300 hover:shadow-xl cursor-pointer flex">
	<div class="card-body">
	  <h2 class="card-title">{{ book.name }}</h2>
	  <p>Word to def: {{ formatDate(book.wd_last_practiced) || '-' }}</p>
	  <p>Def to word: {{ formatDate(book.dw_last_practiced) || '-' }}</p>
	  <p>Last modified: {{ formatDate(book.last_edited) || '-' }}</p>
	</div>
      </div>
    </div>
  </div>
</template>
