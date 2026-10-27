<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useAppStore } from './stores/app'
import { useThemeStore } from './stores/theme'
import AppLayout from './layouts/AppLayout.vue'
import { ensureDefaultOffice } from './services/officeService'
import { seedDefaultFoldersIfEmpty } from './services/workflowService'
import { syncAllActivityDesigns } from './services/financeService'
import { getSystemDueAndOverdueItems } from './services/notificationService'
import { useToast } from './composables/useToast'

const appStore = useAppStore()
const themeStore = useThemeStore()
const toast = useToast()

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

  // Check for due and overdue documents, tasks, and PR reminders on system startup
  try {
    const summary = await getSystemDueAndOverdueItems()
    appStore.setDueOverdueSummary(summary)

    const isDismissed = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('flowdesk_startup_reminder_dismissed') === 'true'
    if (!isDismissed && summary.hasUrgentItems) {
      // Automatically pop up the reminder dialog
      appStore.openDueReminderModal()

      // Show companion alert toast
      const countDesc = [
        summary.overdueCount > 0 ? `${summary.overdueCount} overdue` : null,
        summary.dueTodayCount > 0 ? `${summary.dueTodayCount} due today` : null
      ].filter(Boolean).join(' and ')

      toast.warning(
        'Action Required: Pending Deadlines',
        `You have ${countDesc} item(s) requiring your attention.`,
        7000
      )
    }
  } catch (err) {
    console.warn('Startup due/overdue reminders notice:', err)
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
