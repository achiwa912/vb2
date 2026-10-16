<script setup lang="ts">
import ToastContainer from '@/components/ToastContainer.vue'
import { toastRef } from '@/lib/toast'
</script>

<template>
  <RouterView />
  <ToastContainer ref="toastRef" />
</template>
