<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBooksStore } from '@/stores/books'
import type { components } from '@/types/api'
import { SquarePen, Download, Upload, Search, Plus } from '@lucide/vue'
import Navbar from '@/components/Navbar.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import { useRouter } from 'vue-router'
import { formatDate } from '@/utils/utils'
import { client } from '@/api/client'

type BookSchema = components['schemas']['BookSchema']


const booksStore = useBooksStore()
const router = useRouter()
const modalRef = ref<HTMLDialogElement | null>(null)
const toastRef = ref<InstanceType<typeof ToastContainer> | null>(null)
const selectedBook = ref<BookSchema | null>(null)
const isNew = ref<boolean>(false)
const bookName = ref<string>('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const searchQuery = ref('')
type SortKey = 'recent' | 'name' | 'edited'
const sortKey = ref<SortKey>('recent')

function wordsView(bid: number) {
  booksStore.activeBookId = bid
  router.push('/words')
}

const openModal = (book: BookSchema | null) => {
  console.log(book)
  if (book != null) {
    selectedBook.value = book
    isNew.value = false
    bookName.value = book.name
  } else {
    selectedBook.value = null
    isNew.value = true
    bookName.value = ''
  }
  modalRef.value?.showModal()
}

const closeModal = () => {
  modalRef.value?.close()
}

const updateBook = async () => {
  console.log(`updateBook called!: ${bookName.value}`)
  if (selectedBook.value) {
    const resp = await booksStore.editBook(bookName.value, selectedBook.value.id)
    if (resp.status == 200) {
      toastRef.value?.showAlert(`Updated book: ${bookName.value}`, 'success')
    } else {
      toastRef.value?.showAlert(`Failed updating book: ${bookName.value}. ${resp.message} (${resp.status})`, 'error')
    }
  } else {
    const resp = await booksStore.addBook(bookName.value)
    if (resp.status == 200) {
      toastRef.value?.showAlert(`Added book: ${bookName.value}`, 'success')
    } else {
      toastRef.value?.showAlert(`Failed adding book: ${bookName.value}. ${resp.message} (${resp.status})`, 'error')
    }
  }
  closeModal()
  await booksStore.fetchBooks()
}

const deleteBook = async () => {
  const resp = await booksStore.deleteBook(selectedBook.value)
  if (resp.status == 200) {
    toastRef.value?.showAlert(`Deleted book: ${bookName.value}`, 'success')
  } else {
    toastRef.value?.showAlert(`Failed to delete book: ${bookName.value}. ${resp.message} (${resp.status})`, 'error')
  }
  closeModal()
  await booksStore.fetchBooks()
}

async function exportAll() {
  const { data, error, response } = await client.GET('/export')
  if (error) {
    if ('message' in error) {
      toastRef.value?.showAlert(`Export failed: ${error.message} (${response.status})`, 'error')
    } else {
      toastRef.value?.showAlert(`Export failed: unknown error (${response.status})`, 'error')
    }
    return
  }
  const jsonData = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonData], { type: 'application/json'})
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'vb_export.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function triggerImport() {
  fileInputRef.value?.click()
}

async function importAll(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  let data = null
  try {
    const rawText = await file.text()
    data = JSON.parse(rawText)
  } catch (err) {
    toastRef.value?.showAlert(`Import failed: ${err}`, 'error')
    // target.value = ''
    return
  } finally {
    target.value = ''
  }
  const { error, response } = await client.POST('/import', {
    body: data,
  })
  if (error) {
    if ('message' in error) {
      toastRef.value?.showAlert(`Import failed: ${error.message} (${response.status})`, 'error')
    } else {
      toastRef.value?.showAlert(`Import failed: unknown error (${response.status})`, 'error')
    }
  } else {
    toastRef.value?.showAlert(`Successfuly imported`, 'success')
  }
  await booksStore.fetchBooks()
}

function latestPracticeTs(book: BookSchema): number {
  const times: number[] = []
  if (book.wd_last_practiced) times.push(new Date(book.wd_last_practiced).getTime())
  if (book.dw_last_practiced) times.push(new Date(book.dw_last_practiced).getTime())
  return times.length ? Math.max(...times) : 0
}

function latestPracticeLabel(book: BookSchema): string {
  const ts = latestPracticeTs(book)
  if (!ts) return '-'
  return formatDate(new Date(ts).toISOString())
}

const recentBooks = computed(() => {
  return [...booksStore.books]
    .filter(b => latestPracticeTs(b) > 0)
    .sort((a, b) => latestPracticeTs(b) - latestPracticeTs(a))
    .slice(0, 4)
})

const visibleBooks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let list = booksStore.books
  if (q) list = list.filter(b => b.name.toLowerCase().includes(q))
  const sorted = [...list]
  if (sortKey.value == 'recent') {
    sorted.sort((a, b) => latestPracticeTs(b) - latestPracticeTs(a))
  } else if (sortKey.value == 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name))
  } else if (sortKey.value == 'edited') {
    sorted.sort((a, b) => new Date(b.last_edited ?? 0).getTime() - new Date(a.last_edited ?? 0).getTime())
  }
  return sorted
})

const isSearching = computed(() => searchQuery.value.trim().length > 0)


const isEmpty = computed(() => booksStore.books.length === 0)

onMounted(async () => {
  booksStore.books = []
  booksStore.words = []
  booksStore.pracs = []
  await booksStore.fetchBooks()
})
</script>

<template>
  <Navbar>
    <input ref="fileInputRef" type="file" accept=".json,application/json" class="hidden-input" @change="importAll" />
    <li><div @click="exportAll"><Download />Export All</div></li>
    <li><div @click="triggerImport"><Upload />Import All</div></li>
    <div class="divider my-1"></div>
  </Navbar>

  <ToastContainer ref="toastRef" />


  <div class="px-4 md:px-8 py-6 max-w-6xl mx-auto">

    <!-- Header -->
    <header class="flex flex-wrap gap-3 items-center justify-between mb-6">
      <div class="flex items-baseline gap-3">
        <h1 class="text-3xl font-semibold">Books</h1>
        <span v-if="!isEmpty" class="text-sm opacity-60">
          {{ booksStore.books.length }}
          {{ booksStore.books.length === 1 ? 'book' : 'books' }}
        </span>
      </div>
      <button
        v-if="!isEmpty"
        @click="openModal(null)"
        class="btn btn-secondary btn-outline btn-sm rounded-3xl"
      >
        <Plus class="size-4" /> Add book
      </button>
    </header>

    <!-- Empty state -->
    <div v-if="isEmpty" class="flex flex-col items-center text-center py-20 gap-3">
      <div class="text-6xl opacity-30">&#x1F4DA;</div>
      <h2 class="text-xl font-medium">No books yet</h2>
      <p class="opacity-70 max-w-sm">
        Create your first word book to start practicing vocabulary.
      </p>
      <div class="flex flex-wrap gap-2 mt-2 justify-center">
        <button @click="openModal(null)" class="btn btn-primary btn-sm rounded-2xl">
          <Plus class="size-4" /> Create book
        </button>
        <button @click="triggerImport" class="btn btn-ghost btn-sm rounded-2xl">
          <Upload class="size-4" /> Import backup
        </button>
      </div>
      <div class="flex justify-center text-base-content/60 mt-2 items-center">
	<div>New member?  How about interactive</div>
	<div @click="router.push('/demo')" class="btn btn-primary mx-1 rounded-xl">Demo</div>
	  <div>?</div>
      </div>
    </div>

    <!-- Non-empty -->
    <template v-else>

      <!-- Continue practicing -->
      <section v-if="recentBooks.length" class="mb-10">
	<div class="flex items-baseline justify-between mb-4">
	  <div>
	    <h2 class="text-xl font-semibold">Continue practicing</h2>
	    <p class="text-sm opacity-60 mt-0.5">Pick up where you left off</p>
	  </div>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
	  <button
	    v-for="book in recentBooks"
	    :key="book.id"
	    @click="wordsView(book.id)"
	    class="group text-left rounded-2xl p-5 bg-primary/50 border border-primary/20
		   hover:bg-primary/15 hover:border-primary/30 hover:shadow-lg
		   transition-all duration-200 cursor-pointer"
	  >
	    <div class="flex items-start gap-3">
              <div
		class="shrink-0 size-10 rounded-xl bg-primary/80 flex items-center justify-center
                       text-primary"
              >
		<span class="text-lg">📖</span>
              </div>

              <div class="min-w-0">
		<div class="font-semibold truncate group-hover:text-primary transition-colors">
		  {{ book.name }}
		</div>
		<div class="text-xs opacity-60 mt-1">
		  Last practiced {{ latestPracticeLabel(book) }}
		</div>
              </div>
	    </div>

	  </button>
	</div>
      </section>

      <!-- Search + sort -->
      <section class="mb-4 flex flex-wrap gap-2 items-center">
        <label class="input input-sm input-bordered flex items-center gap-2 rounded-xl flex-1 min-w-[200px]">
          <Search class="size-4 opacity-60" />
          <input
            v-model="searchQuery"
            type="text"
            class="grow bg-transparent outline-none"
            placeholder="Search books..."
          />
        </label>
        <select v-model="sortKey" class="select select-sm select-bordered rounded-xl">
          <option value="recent">Last practiced</option>
          <option value="name">Name (A&rarr;Z)</option>
          <option value="edited">Last edited</option>
        </select>
      </section>

      <!-- All books -->
      <section>
        <h2 class="text-xs uppercase tracking-wider font-medium opacity-60 mb-3">
          {{ isSearching ? `Results (${visibleBooks.length})` : 'All books' }}
        </h2>

        <div v-if="visibleBooks.length === 0" class="text-center py-10 opacity-60 text-sm">
          No books match \u201c{{ searchQuery }}\u201d.
          <button @click="searchQuery = ''" class="link link-primary ml-1">Clear search</button>
        </div>

        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          <div
            v-for="book in visibleBooks"
            :key="book.id"
            @click="wordsView(book.id)"
            class="group card bg-base-100 border border-base-300 hover:border-base-content/20 hover:shadow-md transition-all rounded-2xl p-4 cursor-pointer flex flex-col"
          >
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-medium leading-tight line-clamp-2 pr-1">
                {{ book.name }}
              </h3>
              <button
                @click.stop="openModal(book)"
                class="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                aria-label="Edit book"
              >
                <SquarePen class="size-3.5" />
              </button>
            </div>

            <div class="mt-3 text-xs space-y-0.5 opacity-70">
              <div>W&rarr;D: {{ formatDate(book.wd_last_practiced) || '-' }}</div>
              <div>D&rarr;W: {{ formatDate(book.dw_last_practiced) || '-' }}</div>
            </div>

            <div class="mt-auto pt-3 text-[10px] uppercase tracking-wider opacity-40">
              edited {{ formatDate(book.last_edited) || '-' }}
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>

  <!-- add/edit book modal -->
  <dialog ref="modalRef" class="modal modal-bottom sm:modal-middle backdrop:backdrop-blur-sm transition-all duration-300">
    <div class="modal-box p-6 max-w-lg rounded-2xl border border-base-200/60 shadow-xl bg-base-100/96 backdrop-blur-md">
      <div class="flex items-center justify-between mb-4">
	<h3 class="text-xl font-bold tracking-tight text-base-content">
          {{ isNew ? 'Create New Book' : 'Edit Book' }}
	</h3>
	<button type="button" class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:text-base-content" @click="closeModal" aria-label="Close modal">✕</button>
      </div>

      <!-- Form starts here and wraps input fields + actions -->
      <form @submit.prevent="updateBook" class="space-y-4">
	<div class="form-control w-full">
          <label class="label py-1">
            <span class="label-text font-medium text-xs uppercase tracking-wider text-base-content/70">Book Name</span>
          </label>
          <input v-model="bookName" type="text" placeholder="eg. book1" class="input input-bordered w-full rounded-xl focus:input-primary transition-all duration-200" required />
	</div>

	<!-- Action Buttons inside the form -->
	<div class="pt-4 mt-6 border-t border-base-200 flex items-center justify-between gap-3">
          <div>
            <button v-if="!isNew" type="button" class="btn btn-error btn-ghost text-error hover:bg-error/10 rounded-xl transition-colors" @click="deleteBook">Delete</button>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="btn btn-ghost rounded-xl" @click="closeModal">Cancel</button>
            <button type="submit" class="btn btn-primary rounded-xl px-6">
              {{ isNew ? 'Create' : 'Save Changes' }}
            </button>
          </div>
	</div>
      </form>
    </div>

    <form method="dialog" class="modal-backdrop">
      <button @click="closeModal">close</button>
    </form>
  </dialog>
</template>

<style scoped>
.hidden-input {
  display: none
}
</style>

