<!-- components/ToastContainer.vue -->
<script setup>
import { ref } from 'vue'

// Reactive array to hold active alerts
const alerts = ref([])

// Global/exported method to trigger alerts
const showAlert = (message, type = 'warning', duration = 3000) => {
  const id = Date.now()
  alerts.value.push({ id, message, type })

  // Auto-remove after duration
  setTimeout(() => {
    removeAlert(id)
  }, duration)
}

const removeAlert = (id) => {
  alerts.value = alerts.value.filter((a) => a.id !== id)
}

// Expose the helper function so parent components or composables can call it
defineExpose({ showAlert })
</script>

<template>
  <div class="toast toast-top toast-end z-50">
    <div
      v-for="alert in alerts"
      :key="alert.id"
      :class="[
        'alert shadow-lg text-white transition-all duration-300',
        alert.type === 'warning' ? 'alert-warning' : '',
        alert.type === 'error' ? 'alert-error' : '',
        alert.type === 'success' ? 'alert-success' : '',
        alert.type === 'info' ? 'alert-info' : ''
      ]"
    >
      <div class="flex items-center gap-2">
        <!-- Warning Icon -->
        <svg v-if="alert.type === 'warning'" xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        
        <span>{{ alert.message }}</span>
      </div>
      <button @click="removeAlert(alert.id)" class="btn btn-sm btn-ghost btn-circle">✕</button>
    </div>
  </div>
</template>
