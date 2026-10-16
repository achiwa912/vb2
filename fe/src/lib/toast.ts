import { ref } from 'vue'
import ToastContainer from '@/components/ToastContainer.vue'

export const toastRef = ref<InstanceType<typeof ToastContainer> | null>(null)
