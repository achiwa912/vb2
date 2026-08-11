<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { SquarePen, SquareArrowRight, SquareArrowLeft } from '@lucide/vue'
import { useBooksStore } from '@/stores/books'
import type { components } from '@/types/api'
import Navbar from '@/components/Navbar.vue'
import ToastContainer from '@/components/ToastContainer.vue'

type BookSchema = components['schemas']['BookSchema']
type WordSchema = components['schemas']['WordSchema']

//const alerts = ref([])
const toastRef = ref(null)
const modalRef = ref(null)
const selectedWord = ref(null)
const isNew = ref<boolean>(false)
const editWord = ref<string>('')
const editDef = ref<string>('')
const editSample = ref<string>('')
const booksStore = useBooksStore()
const router = useRouter()
const bix = booksStore.id2ixBook(booksStore.activeBookId)


const openModal = (word) => {
  selectedWord.value = word
  if (word != null) {
    isNew.value = false
    editWord.value = word.word
    editDef.value = word.definition
    editSample.value = word.sample
  } else {
    isNew.value = true
    editWord.value = ''
    editDef.value = ''
    editSample.value = ''
  }
  modalRef.value?.showModal()
}

const closeModal = () => {
  modalRef.value?.close()
}

const updateWord = async () => {
  if (selectedWord.value){
    if (await booksStore.editWord(editWord.value, editDef.value, editSample.value, selectedWord.value.book_id, selectedWord.value.id)) {
      toastRef.value?.showAlert(`Updated word: ${editWord.value} (id: ${selectedWord.value.id})`, 'success')
    } else {
      toastRef.value?.showAlert(`Failed updating word: ${selectedWord.value.word} (id: ${selectedWord.value.id})`, 'error')
    }
  } else {
    if (await booksStore.addWord(editWord.value, editDef.value, editSample.value, booksStore.activeBookId)) {
      toastRef.value?.showAlert(`Added word: ${editWord.value}`, 'success')
    } else {
      toastRef.value?.showAlert(`Failed to add word: ${editWord.value}`, 'error')
    }
  }
  closeModal()
  await booksStore.fetchWords()
}

const deleteWord = async () => {
  if (await booksStore.deleteWord(selectedWord.value)) {
    toastRef.value?.showAlert(`Deleted word: ${selectedWord.value.word} (id: ${selectedWord.value.id})`, 'success')
  } else {
    toastRef.value?.showAlert(`Failed to delete word: ${selectedWord.value.word} (id: ${selectedWord.value.id})`, 'error')
  }
  closeModal()
  await booksStore.fetchWords()
}

function practice(dir) {
  booksStore.pracDir = dir
  router.push('/prac')
}

onMounted(async () => {
  booksStore.words = []
  booksStore.pracs = []
  await booksStore.fetchWords()
})
</script>

<template>
  <Navbar>
  </Navbar>

  <ToastContainer ref="toastRef" />
  
  <div class="p-6">
    <h1 class="text-3xl font-semibold">{{ booksStore.books[bix].name }}</h1>

    <!-- buttons -->
    <div class="flex my-4 gap-2 items-center">
    <button @click="practice('wd')" class="btn btn-success rounded-3xl"><SquareArrowRight />Word to def</button>
    <button @click="practice('dw')" class="btn btn-info rounded-3xl"><SquareArrowLeft />Def to word</button>
    <button @click="openModal(null)" class="btn btn-secondary btn-outline btn-sm rounded-3xl ml-4">Add word</button>
    </div>

    
    <!-- cards -->
    <div v-for="([idx, word]) in booksStore.words.entries()" :key="idx">
      <div class="card card-border bg-base-100 w-192 mt-4 hover:bg-base-200 border border-base-300 rounded-3xl px-6 transition-all duration-300 hover:shadow-xl flex">

	<!-- Outer row: items-center vertically centers the index with the content on the right -->
	<div class="flex items-center gap-3 py-4">
	  <!-- Left: Vertically centered Index -->
	  <span class="font-semibold text-md text-base-content/70 mr-4">
	    {{ idx + 1 }}
	  </span>

	  <!-- Right: The 2 lines stacked together -->
	  <div class="card-body gap-1 p-0 flex-1">
	    <!-- Row 1: Title + Edit Button -->
	    <div class="flex items-center justify-between">
	      <h2 class="card-title text-xl m-0">{{ word.word }}</h2>

	      <!-- Edit Button -->
	      <button @click="openModal(word)" class="btn btn-primary btn-sm rounded-2xl">
		<SquarePen class="size-4" />Edit
	      </button>
	    </div>

	    <!-- Row 2: Definition + Sample -->
	    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
	      <p class="text-base-content/80 leading-relaxed m-0">
		{{ word.definition }}
	      </p>

	      <p class="text-sm text-base-content/60 italic border-l-2 border-base-300 pl-3 m-0">
		{{ word.sample }}
	      </p>
	    </div>
	  </div>
	</div>

      </div>
    </div>

  </div>

  <!-- word add/edit modal -->
<dialog ref="modalRef" class="modal modal-bottom sm:modal-middle backdrop:backdrop-blur-sm transition-all duration-300">
  <div class="modal-box p-6 max-w-lg rounded-2xl border border-base-200/60 shadow-xl bg-base-100/95 backdrop-blur-md">
    
    <!-- Header with Close Button -->
    <div class="flex items-center justify-between pb-4 mb-6 border-b border-base-200">
      <div>
        <h3 class="text-xl font-bold tracking-tight text-base-content">
          {{ isNew ? 'Add New Word' : 'Edit Word' }}
        </h3>
        <p class="text-xs text-base-content/60 mt-0.5">
          {{ isNew ? 'Add a new entry to your dictionary.' : 'Make changes to your existing word.' }}
        </p>
      </div>
      <button 
        type="button" 
        class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:text-base-content" 
        @click="closeModal"
        aria-label="Close modal"
      >
        ✕
      </button>
    </div>

    <!-- Form Fields -->
    <form @submit.prevent="updateWord" class="space-y-4">
      <!-- Word Input -->
      <div class="form-control w-full">
        <label class="label py-1">
          <span class="label-text font-medium text-xs uppercase tracking-wider text-base-content/70">Word</span>
        </label>
        <input 
          v-model="editWord" 
          type="text" 
          placeholder="e.g. Serendipity" 
          class="input input-bordered w-full rounded-xl focus:input-primary transition-all duration-200" 
          required 
        />
      </div>

      <!-- Definition Input -->
      <div class="form-control w-full">
        <label class="label py-1">
          <span class="label-text font-medium text-xs uppercase tracking-wider text-base-content/70">Definition</span>
        </label>
        <textarea 
          v-model="editDef" 
          placeholder="e.g. The occurrence of events by chance in a happy way." 
          class="textarea textarea-bordered w-full h-20 rounded-xl focus:textarea-primary transition-all duration-200 resize-none" 
          required
        ></textarea>
      </div>

      <!-- Sample Sentence Input -->
      <div class="form-control w-full">
        <label class="label py-1">
          <span class="label-text font-medium text-xs uppercase tracking-wider text-base-content/70">Sample Sentence</span>
        </label>
        <input 
          v-model="editSample" 
          type="text" 
          placeholder="e.g. Finding that cozy cafe was pure serendipity." 
          class="input input-bordered w-full rounded-xl focus:input-primary transition-all duration-200" 
        />
      </div>

      <!-- Action Footer -->
      <div class="pt-4 mt-6 border-t border-base-200 flex items-center justify-between gap-3">
        <!-- Delete action on the left to prevent accidental clicks -->
        <div>
          <button 
            v-if="!isNew" 
            type="button" 
            class="btn btn-error btn-ghost text-error hover:bg-error/10 rounded-xl transition-colors" 
            @click="deleteWord"
          >
            Delete
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button type="button" class="btn btn-ghost rounded-xl" @click="closeModal">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary rounded-xl px-6">
            {{ isNew ? 'Create' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </form>

  </div>

  <!-- Backdrop click to close trigger -->
  <form method="dialog" class="modal-backdrop">
    <button @click="closeModal">close</button>
  </form>
</dialog>  
</template>
