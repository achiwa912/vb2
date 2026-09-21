<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBooksStore } from '@/stores/books'
import type { components } from '@/types/api'
import { SquarePen, Download, Upload } from '@lucide/vue'
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
  
  <div class="p-6">
    <div class="flex gap-2 items-end">
      <h1 class="text-3xl font-semibold">Books</h1>
      <button @click="openModal(null)" class="btn btn-secondary btn-outline btn-sm rounded-3xl">Add book</button>
    </div>
    
    <div v-for="book in booksStore.books">
      <div @click="wordsView(book.id)" class="card card-lg card-border bg-base-100 mt-4 hover:bg-base-200 border border-base-300 rounded-3xl px-6 transition-all duration-300 hover:shadow-xl cursor-pointer flex">
	<div class="card-body">
	  <div class="flex items-center justify-between">
	    <h2 class="card-title">{{ book.name }}</h2>
	    <button @click.stop="openModal(book)" class="btn btn-primary btn-sm rounded-2xl"><SquarePen class="size-4" />Edit</button>
	  </div>
	  <p>Word to def: {{ formatDate(book.wd_last_practiced) || '-' }}</p>
	  <p>Def to word: {{ formatDate(book.dw_last_practiced) || '-' }}</p>
	  <p>Last modified: {{ formatDate(book.last_edited) || '-' }}</p>
	</div>
      </div>
    </div>
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

