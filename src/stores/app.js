import { defineStore } from 'pinia'
import { ref, onMounted, onUnmounted } from 'vue'

export const useAppStore = defineStore('app', () => {
  // Desktop sidebar collapsed state (persisted in localStorage)
  const isSidebarCollapsed = ref(localStorage.getItem('flowdesk_sidebar_collapsed') === 'true')
  
  // Mobile / iPad drawer visibility
  const isMobileSidebarOpen = ref(false)

  // Real-time network connectivity status
  const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const toggleSidebar = () => {
    isSidebarCollapsed.value = !isSidebarCollapsed.value
    localStorage.setItem('flowdesk_sidebar_collapsed', String(isSidebarCollapsed.value))
  }

  const setSidebarCollapsed = (val) => {
    isSidebarCollapsed.value = val
    localStorage.setItem('flowdesk_sidebar_collapsed', String(val))
  }

  const toggleMobileSidebar = () => {
    isMobileSidebarOpen.value = !isMobileSidebarOpen.value
  }

  const closeMobileSidebar = () => {
    isMobileSidebarOpen.value = false
  }

  const openMobileSidebar = () => {
    isMobileSidebarOpen.value = true
  }

  // Network event handlers
  const updateOnlineStatus = () => {
    isOnline.value = navigator.onLine
  }

  const initNetworkListeners = () => {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', updateOnlineStatus)
      window.addEventListener('offline', updateOnlineStatus)
    }
  }

  const cleanupNetworkListeners = () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }

  // Due & Overdue System Reminder Modal State
  const isDueReminderModalOpen = ref(false)
  const dueOverdueSummary = ref({
    items: [],
    overdueCount: 0,
    dueTodayCount: 0,
    totalCount: 0,
    documentsCount: 0,
    tasksCount: 0,
    prRemindersCount: 0,
    hasUrgentItems: false
  })
  const isLoadingDueSummary = ref(false)

  const openDueReminderModal = () => {
    isDueReminderModalOpen.value = true
  }

  const closeDueReminderModal = () => {
    isDueReminderModalOpen.value = false
  }

  const setDueOverdueSummary = (summary) => {
    dueOverdueSummary.value = summary
  }

  return {
    isSidebarCollapsed,
    isMobileSidebarOpen,
    isOnline,
    isDueReminderModalOpen,
    dueOverdueSummary,
    isLoadingDueSummary,
    openDueReminderModal,
    closeDueReminderModal,
    setDueOverdueSummary,
    toggleSidebar,
    setSidebarCollapsed,
    toggleMobileSidebar,
    closeMobileSidebar,
    openMobileSidebar,
    initNetworkListeners,
    cleanupNetworkListeners
  }
})
