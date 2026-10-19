<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from './stores/app'
import { useThemeStore } from './stores/theme'
import AppLayout from './layouts/AppLayout.vue'
import { ensureDefaultOffice } from './services/officeService'
import { seedDefaultFoldersIfEmpty } from './services/workflowService'
import { syncAllActivityDesigns } from './services/financeService'

const appStore = useAppStore()
const themeStore = useThemeStore()

onMounted(async () => {
  themeStore.initTheme()
  appStore.initNetworkListeners()
  try {
    await ensureDefaultOffice()
    await seedDefaultFoldersIfEmpty()
    await syncAllActivityDesigns()
  } catch (err) {
    console.warn('Startup sync initialization notice:', err)
  }
})

onUnmounted(() => {
  appStore.cleanupNetworkListeners()
  themeStore.cleanupTheme()
})
</script>

<template>
  <AppLayout>
    <router-view />
  </AppLayout>
</template>
