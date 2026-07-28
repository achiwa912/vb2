<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBooksStore } from '@/stores/books'
import type { components } from '@/types/api'
import Navbar from '@/components/Navbar.vue'

type BookSchema = components['schemas']['BookSchema']

const booksStore = useBooksStore()

onMounted(async () => {
  await booksStore.fetchBooks()
})
</script>

<template>
  <Navbar>
  </Navbar>

  <div>
    <h1>You are logged in.</h1>
    <div v-for="book in booksStore.books">
      {{ book.name }}
    </div>
  </div>
</template>
