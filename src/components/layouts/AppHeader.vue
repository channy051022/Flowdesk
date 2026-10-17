<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '../../stores/app'
import {
  Menu,
  Search,
  Calendar as CalendarIcon,
  X,
  Bell,
  ExternalLink
} from 'lucide-vue-next'
import { getOutstandingPrReminders } from '../../services/taskService'

const appStore = useAppStore()
const route = useRoute()

const showSearchModal = ref(false)
const searchQuery = ref('')
const showNotificationDropdown = ref(false)
const outstandingReminders = ref([])
const now = ref(new Date())

// Formatted today's date & live current time for government office reference
const currentDateTimeFormatted = computed(() => {
  const d = now.value
  const dateStr = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  })
  return `${dateStr} • ${timeStr}`
})

const currentTitle = computed(() => route.meta.title || 'FlowDesk')
const currentSubtitle = computed(() => route.meta.subtitle || '')

const loadNotifications = async () => {
  try {
    outstandingReminders.value = await getOutstandingPrReminders()
  } catch (err) {
    console.warn('Failed to load PR notifications in header:', err)
  }
}

// Keyboard shortcuts (Ctrl+K or / to open search)
const handleKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showSearchModal.value = true
  } else if (e.key === 'Escape') {
    showSearchModal.value = false
    showNotificationDropdown.value = false
  }
}

let notificationTimer = null
let clockTimer = null

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  loadNotifications()
  notificationTimer = setInterval(loadNotifications, 30000)
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (notificationTimer) clearInterval(notificationTimer)
  if (clockTimer) clearInterval(clockTimer)
})
</script>

<template>
  <header class="h-14 bg-white border-b border-[#F0E3E9] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
    <!-- Left Section: Mobile Toggle & Page Title -->
    <div class="flex items-center gap-3 min-w-0">
      <!-- Mobile Sidebar Toggle -->
      <button
        @click="appStore.openMobileSidebar"
        type="button"
        class="lg:hidden p-1.5 -ml-1 text-[#806B76] hover:text-[#3D2934] hover:bg-[#FFF7FA] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#D9467B]"
        aria-label="Open navigation sidebar"
      >
        <Menu class="w-5 h-5" />
      </button>

      <!-- Page Title & Breadcrumb -->
      <div class="flex flex-col min-w-0">
        <div class="flex items-center gap-2">
          <h1 class="text-sm sm:text-base font-bold text-[#3D2934] tracking-tight truncate">
            {{ currentTitle }}
          </h1>
          <span class="hidden md:inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF0F5] text-[#D9467B] border border-[#F3C4D7]">
            Gov Desk
          </span>
        </div>
        <p v-if="currentSubtitle" class="hidden sm:block text-[11px] text-[#806B76] truncate -mt-0.5">
          {{ currentSubtitle }}
        </p>
      </div>
    </div>

    <!-- Center Section: Quick Search Trigger -->
    <div class="hidden md:flex items-center flex-1 max-w-xs mx-4">
      <button
        @click="showSearchModal = true"
        type="button"
        class="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[#806B76] bg-[#FFF7FA] hover:bg-[#FFF0F5] border border-[#F0E3E9] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#D9467B]"
      >
        <span class="flex items-center gap-2 truncate">
          <Search class="w-3.5 h-3.5 text-[#A18D98]" />
          <span>Search tracking slips, tasks...</span>
        </span>
        <kbd class="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#806B76] bg-white border border-[#F0E3E9] rounded">
          ⌘K
        </kbd>
      </button>
    </div>

    <!-- Right Section: Status, Date, Quick Action -->
    <div class="flex items-center gap-2.5 sm:gap-3 shrink-0">
      <!-- Date & Current Time Display -->
      <div class="hidden sm:flex items-center gap-1.5 text-xs text-[#806B76] font-medium px-2.5 py-1 rounded-lg bg-[#FFF7FA] border border-[#F0E3E9]">
        <CalendarIcon class="w-3.5 h-3.5 text-[#D9467B]" />
        <span>{{ currentDateTimeFormatted }}</span>
      </div>

      <!-- PR Reminder Notification Bell -->
      <div class="relative">
        <button
          @click="showNotificationDropdown = !showNotificationDropdown"
          type="button"
          class="relative p-1.5 rounded-lg text-[#806B76] hover:text-[#3D2934] hover:bg-[#FFF7FA] transition-colors cursor-pointer"
          title="Notification Center (PR Creation Reminders)"
          aria-label="View PR Creation Reminders"
        >
          <Bell class="w-4 h-4 text-[#806B76]" />
          <span
            v-if="outstandingReminders.length > 0"
            class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#D9467B] text-white text-[10px] font-bold flex items-center justify-center animate-pulse"
          >
            {{ outstandingReminders.length }}
          </span>
        </button>

        <!-- Dropdown for Outstanding Reminders -->
        <div
          v-if="showNotificationDropdown"
          class="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-[#F0E3E9] py-2 z-50 text-xs"
          @click.stop
        >
          <div class="px-3.5 py-1.5 border-b border-[#F0E3E9] flex items-center justify-between">
            <span class="font-bold text-[#3D2934] text-xs">PR Creation Reminders</span>
            <span
              v-if="outstandingReminders.length > 0"
              class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
            >
              {{ outstandingReminders.length }} Outstanding
            </span>
          </div>

          <div v-if="outstandingReminders.length === 0" class="p-4 text-center text-zinc-400 space-y-1">
            <p class="font-medium text-zinc-600">All PRs are up to date!</p>
            <p class="text-[11px]">No Activity Designs have reached their 40-day PR creation deadline without a recorded PR number.</p>
          </div>

          <div v-else class="max-h-80 overflow-y-auto divide-y divide-[#F0E3E9]">
            <div
              v-for="item in outstandingReminders"
              :key="item.financeRecord.id"
              class="p-3 hover:bg-[#FFF7FA] transition-colors space-y-1.5"
            >
              <div class="flex items-start justify-between gap-2">
                <span class="font-semibold text-zinc-900 line-clamp-1">
                  {{ item.financeRecord.activityDesign || item.financeRecord.title }}
                </span>
                <span
                  :class="[
                    'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0',
                    item.reminder.isOverdue ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  ]"
                >
                  {{ item.reminder.badgeText }}
                </span>
              </div>
              <p class="text-[11px] text-zinc-600 leading-snug">
                “The Activity Design ‘{{ item.financeRecord.activityDesign || item.financeRecord.title }}’ was created 40 days ago. Please create the Purchase Request (PR) for this AD.”
              </p>
              <div class="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
                <span>Due: {{ item.reminder.dueDate }}</span>
                <router-link
                  :to="{ path: '/finance', query: { search: item.financeRecord.activityDesign || item.financeRecord.title } }"
                  @click="showNotificationDropdown = false"
                  class="font-semibold text-rose-600 hover:text-rose-800 hover:underline inline-flex items-center gap-1"
                >
                  <span>Open in Finance</span>
                  <ExternalLink class="w-3 h-3" />
                </router-link>
              </div>
            </div>
          </div>
        </div>
      </div>


    </div>

    <!-- Quick Search Dialog Overlay -->
    <div
      v-if="showSearchModal"
      class="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/30 backdrop-blur-xs"
      @click.self="showSearchModal = false"
    >
      <div class="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100">
          <Search class="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Type tracking number (e.g. DOC-2026), task, or office name..."
            class="flex-1 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none bg-transparent"
            autofocus
          />
          <button
            @click="showSearchModal = false"
            type="button"
            class="p-1 text-zinc-400 hover:text-zinc-600 rounded-md"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="p-4 text-center">
          <p class="text-xs text-zinc-500 mb-2">
            Instant search traverses your local IndexedDB records.
          </p>
          <div class="flex items-center justify-center gap-2 text-[11px] text-zinc-400">
            <span>Press</span>
            <kbd class="px-1.5 py-0.5 font-mono text-[10px] bg-zinc-100 border border-zinc-200 rounded">ESC</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
