<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useBooksStore } from '@/stores/books'
import { ThumbsUp, ThumbsDown, SkipForward } from '@lucide/vue'

const booksStore = useBooksStore()
const isFlipped = ref<boolean>(false)

const flipCard = () => { isFlipped.value = !isFlipped.value }

onMounted(async () => {
  await booksStore.syncBook()
})

</script>

<template>
  <div>
    <div class="flex items-center justify-center">

      <div class="card card-lg bg-base-100 w-full h-[240px] border border-base-300 rounded-3xl shadow-sm mt-8 mx-16 select-none flex flex-col justify-between hover:border-base-content/24 hover:shadow-xl transition-all duration-200">
	<!-- Card Header/Body Wrapper -->
	<div @click="isFlipped = !isFlipped" class="card-body flex flex-col justify-between h-full p-4 cursor-pointer">
    
	  <div 
	    class="flex-1 flex flex-col justify-center"
	  >
	    <Transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 scale-95"
              enter-to-class="opacity-100 scale-100"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 scale-100"
              leave-to-class="opacity-0 scale-95"
              mode="out-in"
	    >
              <!-- Front Content -->
              <div v-if="!isFlipped" key="front" class="flex flex-col items-center justify-center space-y-4">
		<h1 class="text-4xl font-bold text-center">Hello</h1>
              </div>

              <!-- Back Content -->
              <div v-else key="back" class="flex flex-col items-center justify-center space-y-4 overflow-y-auto max-h-[220px] px-2">
		<h1 class="text-3xl font-bold text-center">Hello</h1>
          
		<p class="text-lg opacity-80 text-center">
		  Used as a greeting or to begin a phone conversation.
		</p>

		<p class="italic text-base-content/70 bg-base-100/50 rounded-xl text-center">
		  "Hello, how can I help you today?"
		</p>
              </div>
	    </Transition>
	  </div>

	  <!-- Static Action Buttons -->
	  <div class="card-actions justify-center gap-2 pt-1 border-t border-base-200/50">
	    <button @click.stop="handleRating('once_more')" class="btn btn-secondary rounded-3xl btn-outline btn-lg"><ThumbsDown />Once More </button>
	    <button @click.stop="handleRating('ok')" class="btn btn-success rounded-3xl btn-outline btn-lg"><ThumbsUp />Okay</button>
	    <button @click.stop="handleRating('memorized')" class="btn btn-info rounded-3xl btn-outline btn-lg ml-8"><SkipForward />Memorized</button>
	  </div>

	</div>
      </div>

    </div>
  </div>
  
</template>
