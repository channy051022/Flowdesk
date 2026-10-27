<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../../stores/app'
import { useThemeStore } from '../../stores/theme'
import db from '../../db/database'
import { formatCurrency } from '../../services/financeService'
import {
  Menu,
  Search,
  Calendar as CalendarIcon,
  X,
  Bell,
  ExternalLink,
  FileText,
  Landmark,
  CheckSquare,
  Building2,
  ArrowRight,
  CornerDownLeft,
  AlertCircle,
  Clock,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Check,
  Settings
} from 'lucide-vue-next'
import { getSystemDueAndOverdueItems } from '../../services/notificationService'

const appStore = useAppStore()
const themeStore = useThemeStore()
const route = useRoute()
const router = useRouter()

// Theme switcher dropdown state
const showThemeDropdown = ref(false)

// Notification state
const showNotificationDropdown = ref(false)
const notificationFilter = ref('all') // 'all' | 'overdue' | 'due_today' | 'document' | 'task' | 'pr_reminder'
const dueOverdueItems = ref([])
const dueOverdueSummary = computed(() => appStore.dueOverdueSummary)
const now = ref(new Date())

const filteredNotificationItems = computed(() => {
  const all = dueOverdueItems.value || []
  if (notificationFilter.value === 'all') return all
  if (notificationFilter.value === 'overdue') return all.filter((i) => i.urgency === 'overdue')
  if (notificationFilter.value === 'due_today') return all.filter((i) => i.urgency === 'due_today')
  return all.filter((i) => i.category === notificationFilter.value)
})

const getCategoryBadgeClass = (category) => {
  switch (category) {
    case 'document':
      return 'bg-forest-50 dark:bg-forest-950/40 text-forest-700 dark:text-forest-300 border-forest-200 dark:border-forest-900/60'
    case 'task':
      return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/60'
    case 'pr_reminder':
    default:
      return 'bg-pink-50 dark:bg-pink-950/40 text-[#D9467B] dark:text-[#F472B6] border-pink-200 dark:border-pink-900/60'
  }
}

// Quick Search Modal state
const showSearchModal = ref(false)
const searchQuery = ref('')
const selectedCategory = ref('all') // 'all' | 'finance' | 'documents' | 'tasks' | 'offices'
const searchResults = ref([])
const isSearching = ref(false)
const selectedIndex = ref(0)
const searchInputRef = ref(null)

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
    const res = await getSystemDueAndOverdueItems()
    dueOverdueItems.value = res.items
    appStore.setDueOverdueSummary(res)
  } catch (err) {
    console.warn('Failed to load due and overdue notifications in header:', err)
  }
}

// Open / Close Search Modal
const openSearchModal = () => {
  showSearchModal.value = true
  selectedCategory.value = 'all'
  selectedIndex.value = 0
  nextTick(() => {
    if (searchInputRef.value) {
      searchInputRef.value.focus()
      searchInputRef.value.select?.()
    }
  })
}

const closeSearchModal = () => {
  showSearchModal.value = false
  searchQuery.value = ''
  searchResults.value = []
  selectedIndex.value = 0
}

// Execute live search across all Work Desk tables in local Dexie IndexedDB
const performSearch = async (queryText) => {
  const query = (queryText || '').trim().toLowerCase()
  if (!query) {
    searchResults.value = []
    isSearching.value = false
    return
  }

  isSearching.value = true
  try {
    const [finRecords, docs, tasksList, officesList] = await Promise.all([
      db.financeRecords.toArray().catch(() => []),
      db.documents.toArray().catch(() => []),
      db.tasks.toArray().catch(() => []),
      db.offices.toArray().catch(() => [])
    ])

    const tokens = query.split(/\s+/).filter(Boolean)

    // Match scoring helper
    const calculateScore = (fields = []) => {
      const combined = fields.filter(Boolean).join(' ').toLowerCase()
      if (combined.includes(query)) return 100 // exact phrase match
      if (tokens.every((t) => combined.includes(t))) return 60 // all tokens match
      if (tokens.some((t) => combined.includes(t))) return 20 // partial match
      return 0
    }

    const hits = []

    // 1. Finance Records (Activity Designs, PR, PO, Suppliers)
    for (const r of finRecords) {
      const score = calculateScore([
        r.activityDesign,
        r.supplierName,
        r.ppmpNumber,
        r.prNumber,
        r.poNumber,
        r.columnK,
        Array.isArray(r.chargedTo) ? r.chargedTo.join(' ') : r.chargedTo,
        r.isSample ? 'sample' : '',
        'ad',
        'activity design',
        'finance'
      ])

      if (score > 0) {
        hits.push({
          id: `fin-${r.id}`,
          module: 'finance',
          moduleName: 'Finance Monitoring',
          title: r.activityDesign || r.supplierName || 'Activity Design Record',
          subtitle: `Supplier: ${r.supplierName || 'N/A'} • PR: ${r.prNumber || 'None'} • AD Status: ${r.adStatus || 'Draft'} • ${formatCurrency(r.adAmount || 0)}`,
          status: r.paymentStatus || r.adStatus || 'Draft',
          icon: Landmark,
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          score,
          targetRoute: { path: '/finance', query: { search: r.activityDesign || r.supplierName || query } }
        })
      }
    }

    // 2. Document Tracker (Routing slips, tracking numbers, titles)
    for (const d of docs) {
      if (!d.isArchived) {
        const score = calculateScore([
          d.trackingNumber,
          d.title,
          d.documentType,
          d.referenceNumber,
          d.status,
          'document',
          'slip'
        ])

        if (score > 0) {
          hits.push({
            id: `doc-${d.id}`,
            module: 'documents',
            moduleName: 'Document Tracker',
            title: `${d.trackingNumber}: ${d.title}`,
            subtitle: `${d.documentType || 'Official Document'} • Priority: ${d.priority || 'Normal'} • Status: ${(d.status || 'Active').replace(/_/g, ' ')}`,
            status: d.status || 'Active',
            icon: FileText,
            badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
            score,
            targetRoute: { path: '/documents', query: { search: d.trackingNumber } }
          })
        }
      }
    }

    // 3. My Tasks (Daily tasks, compliance follow-ups)
    for (const t of tasksList) {
      const score = calculateScore([
        t.title,
        t.category,
        t.status,
        t.priority,
        'task'
      ])

      if (score > 0) {
        hits.push({
          id: `task-${t.id}`,
          module: 'tasks',
          moduleName: 'My Tasks',
          title: t.title,
          subtitle: `Category: ${t.category || 'General'} • Priority: ${t.priority || 'Medium'} • Status: ${t.status || 'Pending'}`,
          status: t.status || (t.isCompleted ? 'Completed' : 'Pending'),
          icon: CheckSquare,
          badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
          score,
          targetRoute: { path: '/tasks', query: { search: t.title } }
        })
      }
    }

    // 4. Office Directory (Divisions, sections, contacts, rooms)
    for (const o of officesList) {
      const score = calculateScore([
        o.name,
        o.code,
        o.room,
        o.location,
        'office',
        'division'
      ])

      if (score > 0) {
        hits.push({
          id: `off-${o.id}`,
          module: 'offices',
          moduleName: 'Office Directory',
          title: o.name,
          subtitle: `Code: ${o.code || 'N/A'} • Location: ${o.room || 'Main Office'}`,
          status: o.type || 'Internal',
          icon: Building2,
          badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
          score,
          targetRoute: { path: '/directory', query: { search: o.name } }
        })
      }
    }

    // Sort by score descending (exact match first)
    hits.sort((a, b) => b.score - a.score)
    searchResults.value = hits
    selectedIndex.value = 0
  } catch (err) {
    console.error('Failed to search local database:', err)
  } finally {
    isSearching.value = false
  }
}

// Watch search query with quick execution
let searchDebounceTimer = null
watch(searchQuery, (newVal) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => {
    performSearch(newVal)
  }, 100)
})

// Filtered results by active category tab
const filteredResults = computed(() => {
  if (selectedCategory.value === 'all') {
    return searchResults.value
  }
  return searchResults.value.filter((r) => r.module === selectedCategory.value)
})

// Counts per category
const categoryCounts = computed(() => {
  const counts = { all: searchResults.value.length, finance: 0, documents: 0, tasks: 0, offices: 0 }
  for (const item of searchResults.value) {
    if (counts[item.module] !== undefined) {
      counts[item.module]++
    }
  }
  return counts
})

// Navigate to selected result
const selectResult = (item) => {
  if (!item) return
  closeSearchModal()
  if (item.targetRoute) {
    router.push(item.targetRoute)
  }
}

// Keyboard controls inside the modal
const handleModalKeydown = (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (filteredResults.value.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % filteredResults.value.length
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filteredResults.value.length > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + filteredResults.value.length) % filteredResults.value.length
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filteredResults.value.length > 0) {
      selectResult(filteredResults.value[selectedIndex.value])
    }
  }
}

// Global Keyboard shortcuts (Ctrl+K or / to open search)
const handleKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (showSearchModal.value) {
      closeSearchModal()
    } else {
      openSearchModal()
    }
  } else if (e.key === 'Escape') {
    closeSearchModal()
    showNotificationDropdown.value = false
    showThemeDropdown.value = false
  }
}

const handleDocClick = (e) => {
  if (!e.target.closest?.('.relative')) {
    showNotificationDropdown.value = false
    showThemeDropdown.value = false
  }
}

let notificationTimer = null
let clockTimer = null

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('click', handleDocClick)
  loadNotifications()
  notificationTimer = setInterval(loadNotifications, 30000)
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('click', handleDocClick)
  if (notificationTimer) clearInterval(notificationTimer)
  if (clockTimer) clearInterval(clockTimer)
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
})
</script>

<template>
  <header class="h-14 bg-white dark:bg-[#1A1719] border-b border-[#F0E3E9] dark:border-[#2D252B] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shrink-0 transition-colors">
    <!-- Left Section: Mobile Toggle & Page Title -->
    <div class="flex items-center gap-3 min-w-0">
      <!-- Mobile Sidebar Toggle -->
      <button
        @click="appStore.openMobileSidebar"
        type="button"
        class="lg:hidden p-1.5 -ml-1 text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#D9467B]"
        aria-label="Open navigation sidebar"
      >
        <Menu class="w-5 h-5" />
      </button>

      <!-- Page Title & Breadcrumb -->
      <div class="flex flex-col min-w-0">
        <div class="flex items-center gap-2">
          <h1 class="text-sm sm:text-base font-bold text-[#3D2934] dark:text-[#F5EDF1] tracking-tight truncate">
            {{ currentTitle }}
          </h1>
        </div>
        <p v-if="currentSubtitle" class="hidden sm:block text-[11px] text-[#806B76] dark:text-[#BCAEBA] truncate -mt-0.5">
          {{ currentSubtitle }}
        </p>
      </div>
    </div>

    <!-- Center Section: Quick Search Trigger Button -->
    <div class="hidden md:flex items-center flex-1 max-w-sm mx-4">
      <button
        @click="openSearchModal"
        type="button"
        class="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[#806B76] dark:text-[#BCAEBA] bg-[#FFF7FA] dark:bg-[#251F23] hover:bg-[#FFF0F5] dark:hover:bg-[#2F262C] border border-[#F0E3E9] dark:border-[#3D2D38] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#D9467B] cursor-pointer shadow-3xs"
      >
        <span class="flex items-center gap-2 truncate">
          <Search class="w-3.5 h-3.5 text-[#D9467B]" />
          <span>Search Work Desk records...</span>
        </span>
        <kbd class="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-[#806B76] dark:text-[#BCAEBA] bg-white dark:bg-[#1A1719] border border-[#F0E3E9] dark:border-[#3D2D38] rounded shadow-3xs">
          ⌘K
        </kbd>
      </button>
    </div>

    <!-- Right Section: Status, Date, Theme Switcher, Notification Bell -->
    <div class="flex items-center gap-2 sm:gap-2.5 shrink-0">
      <!-- Date & Current Time Display -->
      <div class="hidden sm:flex items-center gap-1.5 text-xs text-[#806B76] dark:text-[#BCAEBA] font-medium px-2.5 py-1 rounded-lg bg-[#FFF7FA] dark:bg-[#251F23] border border-[#F0E3E9] dark:border-[#3D2D38]">
        <CalendarIcon class="w-3.5 h-3.5 text-[#D9467B]" />
        <span>{{ currentDateTimeFormatted }}</span>
      </div>

      <!-- Theme Selector Dropdown -->
      <div class="relative">
        <button
          @click.stop="showThemeDropdown = !showThemeDropdown; showNotificationDropdown = false"
          type="button"
          class="p-1.5 rounded-lg text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] transition-colors cursor-pointer flex items-center justify-center border border-transparent hover:border-[#F0E3E9] dark:hover:border-[#3D2D38]"
          :title="`Theme: ${themeStore.preference} (Click to switch)`"
          aria-label="Theme settings"
        >
          <Sun v-if="themeStore.preference === 'light'" class="w-4 h-4 text-amber-500" />
          <Moon v-else-if="themeStore.preference === 'dark'" class="w-4 h-4 text-rose-400" />
          <Monitor v-else class="w-4 h-4 text-[#D9467B]" />
        </button>

        <!-- Dropdown Menu for Theme Selection -->
        <div
          v-if="showThemeDropdown"
          class="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A1719] rounded-xl shadow-xl border border-[#F0E3E9] dark:border-[#2D252B] py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
          @click.stop
        >
          <div class="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-[#A18D98] uppercase border-b border-[#F0E3E9] dark:border-[#2D252B]">
            Appearance
          </div>
          <div class="p-1 space-y-0.5">
            <button
              @click="themeStore.setPreference('light'); showThemeDropdown = false"
              type="button"
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-[#3D2934] dark:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23]"
              :class="{ 'font-bold bg-[#FFF0F5] dark:bg-[#2D1F28] text-[#D9467B] dark:text-[#F294B7]': themeStore.preference === 'light' }"
            >
              <span class="flex items-center gap-2">
                <Sun class="w-3.5 h-3.5 text-amber-500" />
                <span>Light</span>
              </span>
              <Check v-if="themeStore.preference === 'light'" class="w-3.5 h-3.5 text-[#D9467B]" />
            </button>

            <button
              @click="themeStore.setPreference('dark'); showThemeDropdown = false"
              type="button"
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-[#3D2934] dark:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23]"
              :class="{ 'font-bold bg-[#FFF0F5] dark:bg-[#2D1F28] text-[#D9467B] dark:text-[#F294B7]': themeStore.preference === 'dark' }"
            >
              <span class="flex items-center gap-2">
                <Moon class="w-3.5 h-3.5 text-rose-400" />
                <span>Dark</span>
              </span>
              <Check v-if="themeStore.preference === 'dark'" class="w-3.5 h-3.5 text-[#D9467B]" />
            </button>

            <button
              @click="themeStore.setPreference('system'); showThemeDropdown = false"
              type="button"
              class="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer text-[#3D2934] dark:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23]"
              :class="{ 'font-bold bg-[#FFF0F5] dark:bg-[#2D1F28] text-[#D9467B] dark:text-[#F294B7]': themeStore.preference === 'system' }"
            >
              <span class="flex items-center gap-2">
                <Monitor class="w-3.5 h-3.5 text-[#D9467B]" />
                <span>System</span>
              </span>
              <Check v-if="themeStore.preference === 'system'" class="w-3.5 h-3.5 text-[#D9467B]" />
            </button>
          </div>
        </div>
      </div>

      <!-- Due & Overdue Notification Bell -->
      <div class="relative">
        <button
          @click.stop="showNotificationDropdown = !showNotificationDropdown; showThemeDropdown = false"
          type="button"
          class="relative p-1.5 rounded-lg text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] transition-colors cursor-pointer border border-transparent hover:border-[#F0E3E9] dark:hover:border-[#3D2D38]"
          title="Notification Center (Due Dates & Overdue Items)"
          aria-label="View Due Dates & Overdue Items"
        >
          <Bell class="w-4 h-4 text-[#806B76] dark:text-[#BCAEBA]" />
          <span
            v-if="dueOverdueSummary.totalCount > 0"
            class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#D9467B] text-white text-[10px] font-bold flex items-center justify-center animate-pulse"
          >
            {{ dueOverdueSummary.totalCount }}
          </span>
        </button>

        <!-- Dropdown for Deadlines & Reminders -->
        <div
          v-if="showNotificationDropdown"
          class="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-[420px] bg-white dark:bg-[#1A1719] rounded-2xl shadow-2xl border border-[#F0E3E9] dark:border-[#2D252B] py-2.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[85vh]"
          @click.stop
        >
          <!-- Dropdown Header -->
          <div class="px-3.5 pb-2.5 border-b border-[#F0E3E9] dark:border-[#2D252B] flex items-center justify-between gap-2">
            <div>
              <span class="font-bold text-[#3D2934] dark:text-[#F5EDF1] text-xs block">
                Deadlines & Overdue Reminders
              </span>
              <p class="text-[10px] text-zinc-400 dark:text-[#806B76]">
                {{ dueOverdueSummary.totalCount }} pending items requiring action
              </p>
            </div>
            
            <div class="flex items-center gap-1.5">
              <span
                v-if="dueOverdueSummary.overdueCount > 0"
                class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60"
              >
                {{ dueOverdueSummary.overdueCount }} Overdue
              </span>
              <span
                v-if="dueOverdueSummary.dueTodayCount > 0"
                class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60"
              >
                {{ dueOverdueSummary.dueTodayCount }} Due
              </span>
              <button
                type="button"
                @click="appStore.openDueReminderModal(); showNotificationDropdown = false"
                class="p-1 rounded-md text-zinc-500 hover:text-zinc-800 dark:hover:text-[#F5EDF1] hover:bg-zinc-100 dark:hover:bg-[#251F23] transition-colors cursor-pointer"
                title="Expand into full popup dialog"
              >
                <ExternalLink class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Category Filter Pills -->
          <div class="px-3 py-1.5 border-b border-[#F0E3E9] dark:border-[#2D252B] flex items-center gap-1 overflow-x-auto text-[11px] shrink-0">
            <button
              v-for="pill in [
                { id: 'all', label: `All (${dueOverdueSummary.totalCount})` },
                { id: 'overdue', label: `Overdue (${dueOverdueSummary.overdueCount})` },
                { id: 'due_today', label: `Due (${dueOverdueSummary.dueTodayCount})` },
                { id: 'document', label: `Docs (${dueOverdueSummary.documentsCount})` },
                { id: 'task', label: `Tasks (${dueOverdueSummary.tasksCount})` },
                { id: 'pr_reminder', label: `PRs (${dueOverdueSummary.prRemindersCount})` }
              ]"
              :key="pill.id"
              type="button"
              @click="notificationFilter = pill.id"
              :class="[
                'px-2 py-0.5 rounded-full font-medium whitespace-nowrap transition-colors cursor-pointer text-[10px]',
                notificationFilter === pill.id
                  ? 'bg-[#3D2934] text-white dark:bg-[#F5EDF1] dark:text-[#1A1719]'
                  : 'text-zinc-500 dark:text-[#BCAEBA] hover:bg-zinc-100 dark:hover:bg-[#251F23]'
              ]"
            >
              {{ pill.label }}
            </button>
          </div>

          <!-- Empty State -->
          <div v-if="filteredNotificationItems.length === 0" class="p-6 text-center text-zinc-400 dark:text-[#806B76] space-y-1.5">
            <Check class="w-6 h-6 mx-auto text-emerald-500" />
            <p class="font-medium text-zinc-700 dark:text-[#DDD2D9] text-xs">All caught up!</p>
            <p class="text-[11px]">No documents, tasks, or PR reminders are currently due or overdue.</p>
          </div>

          <!-- List of Reminders -->
          <div v-else class="flex-1 overflow-y-auto divide-y divide-[#F0E3E9] dark:divide-[#2D252B]">
            <div
              v-for="item in filteredNotificationItems"
              :key="item.id"
              class="p-3 hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] transition-colors space-y-1.5"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span
                    class="text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase"
                    :class="getCategoryBadgeClass(item.category)"
                  >
                    {{ item.categoryLabel }}
                  </span>
                  <span
                    :class="[
                      'px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0',
                      item.urgency === 'overdue'
                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50'
                    ]"
                  >
                    {{ item.urgencyLabel }}
                  </span>
                </div>
                <span class="text-[10px] text-zinc-400 dark:text-[#806B76] font-mono shrink-0">
                  {{ item.dueDate }}
                </span>
              </div>

              <p class="font-semibold text-zinc-900 dark:text-[#F5EDF1] line-clamp-1 text-xs">
                {{ item.title }}
              </p>

              <div class="flex items-center justify-between text-[10px] text-zinc-500 dark:text-[#BCAEBA] pt-0.5">
                <span class="truncate max-w-[240px]">
                  {{ item.subtitle || item.officeName }}
                </span>
                <router-link
                  :to="{ path: item.routePath, query: item.routeQuery }"
                  @click="showNotificationDropdown = false"
                  class="font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 hover:underline inline-flex items-center gap-1 shrink-0 ml-2"
                >
                  <span>Open & Act</span>
                  <ExternalLink class="w-3 h-3" />
                </router-link>
              </div>
            </div>
          </div>

          <!-- Dropdown Footer Action -->
          <div class="px-3.5 pt-2 border-t border-[#F0E3E9] dark:border-[#2D252B] flex items-center justify-between shrink-0">
            <span class="text-[10px] text-zinc-400 dark:text-[#806B76]">
              Auto-refreshed every 30s
            </span>
            <button
              type="button"
              @click="appStore.openDueReminderModal(); showNotificationDropdown = false"
              class="font-semibold text-[11px] text-[#D9467B] dark:text-[#F472B6] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Open Detailed Pop-up</span>
              <ExternalLink class="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      <!-- Quick Settings Button -->
      <button
        @click="router.push('/settings')"
        type="button"
        class="p-1.5 rounded-lg text-[#806B76] dark:text-[#BCAEBA] hover:text-[#3D2934] dark:hover:text-[#F5EDF1] hover:bg-[#FFF7FA] dark:hover:bg-[#251F23] transition-colors cursor-pointer border border-transparent hover:border-[#F0E3E9] dark:hover:border-[#3D2D38]"
        title="Settings & System Management"
        aria-label="Settings"
      >
        <Settings class="w-4 h-4 text-[#806B76] dark:text-[#BCAEBA]" />
      </button>
    </div>

    <!-- Quick Search Dialog Overlay -->
    <div
      v-if="showSearchModal"
      class="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 px-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs"
    >
      <div
        class="w-full max-w-xl bg-white dark:bg-[#1A1719] rounded-2xl shadow-2xl border border-zinc-200/90 dark:border-[#2D252B] overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        @keydown="handleModalKeydown"
      >
        <!-- Search Input Bar -->
        <div class="flex items-center gap-2.5 px-4 py-3.5 border-b border-zinc-100 dark:border-[#2D252B] bg-white dark:bg-[#1A1719]">
          <Search class="w-4 h-4 text-[#D9467B] shrink-0" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="Search Activity Designs, tracking slips, tasks, or offices..."
            class="flex-1 text-xs sm:text-sm text-zinc-900 dark:text-[#F5EDF1] placeholder:text-zinc-400 dark:placeholder:text-[#806B76] focus:outline-none bg-transparent"
            autofocus
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''; searchResults = []"
            type="button"
            class="p-1 text-zinc-400 dark:text-[#806B76] hover:text-zinc-600 dark:hover:text-[#F5EDF1] rounded-md cursor-pointer"
            title="Clear search"
          >
            <X class="w-4 h-4" />
          </button>
          <button
            @click="closeSearchModal"
            type="button"
            class="px-2 py-0.5 text-xs text-zinc-500 dark:text-[#BCAEBA] hover:text-zinc-800 dark:hover:text-[#F5EDF1] rounded bg-zinc-100 dark:bg-[#251F23] hover:bg-zinc-200 dark:hover:bg-[#2D232A] font-medium cursor-pointer"
          >
            ESC
          </button>
        </div>

        <!-- Filter Category Tabs (Active when search has results) -->
        <div
          v-if="searchResults.length > 0"
          class="flex items-center gap-1 px-4 py-2 border-b border-zinc-100 dark:border-[#2D252B] bg-zinc-50/70 dark:bg-[#141214] overflow-x-auto text-xs"
        >
          <button
            v-for="cat in [
              { id: 'all', label: 'All Results', count: categoryCounts.all },
              { id: 'finance', label: 'Finance (ADs)', count: categoryCounts.finance },
              { id: 'documents', label: 'Documents', count: categoryCounts.documents },
              { id: 'tasks', label: 'Tasks', count: categoryCounts.tasks },
              { id: 'offices', label: 'Offices', count: categoryCounts.offices }
            ]"
            :key="cat.id"
            @click="selectedCategory = cat.id; selectedIndex = 0"
            type="button"
            :class="[
              'px-2.5 py-1 rounded-md font-medium text-[11px] whitespace-nowrap cursor-pointer transition-colors inline-flex items-center gap-1',
              selectedCategory === cat.id
                ? 'bg-[#D9467B] text-white font-semibold shadow-2xs'
                : 'text-zinc-600 dark:text-[#BCAEBA] hover:bg-zinc-200/60 dark:hover:bg-[#251F23]'
            ]"
          >
            <span>{{ cat.label }}</span>
            <span class="opacity-80 font-mono">({{ cat.count }})</span>
          </button>
        </div>

        <!-- Scrollable Modal Body -->
        <div class="overflow-y-auto flex-1 min-h-[160px] max-h-[380px] p-2 sm:p-3">
          <!-- 1. EMPTY QUERY STATE: Helpful Guide & Quick Shortcuts -->
          <div v-if="!searchQuery.trim()" class="py-5 px-3 text-center space-y-4">
            <div>
              <p class="text-xs sm:text-sm font-bold text-zinc-900 dark:text-[#F5EDF1]">
                Work Desk Universal Search
              </p>
              <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] mt-1 max-w-sm mx-auto">
                Search instantly across all records stored in your local database:
              </p>
            </div>

            <!-- Helpful Search Tips Grid -->
            <div class="grid grid-cols-2 gap-2 text-left max-w-md mx-auto pt-1">
              <div class="p-2.5 rounded-xl border border-zinc-200/80 dark:border-[#2D252B] bg-zinc-50/70 dark:bg-[#251F23] hover:bg-white dark:hover:bg-[#2D232A] transition-colors">
                <span class="text-[11px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                  <Landmark class="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                  Finance & ADs
                </span>
                <p class="text-[10px] text-zinc-500 dark:text-[#806B76] leading-snug">
                  Activity Designs (e.g. "Sample AD"), suppliers, and PR/PO numbers.
                </p>
              </div>

              <div class="p-2.5 rounded-xl border border-zinc-200/80 dark:border-[#2D252B] bg-zinc-50/70 dark:bg-[#251F23] hover:bg-white dark:hover:bg-[#2D232A] transition-colors">
                <span class="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-1">
                  <FileText class="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  Document Tracker
                </span>
                <p class="text-[10px] text-zinc-500 dark:text-[#806B76] leading-snug">
                  Physical routing slips, tracking numbers (e.g. DOC-), and titles.
                </p>
              </div>

              <div class="p-2.5 rounded-xl border border-zinc-200/80 dark:border-[#2D252B] bg-zinc-50/70 dark:bg-[#251F23] hover:bg-white dark:hover:bg-[#2D232A] transition-colors">
                <span class="text-[11px] font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-1.5 mb-1">
                  <CheckSquare class="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                  My Tasks
                </span>
                <p class="text-[10px] text-zinc-500 dark:text-[#806B76] leading-snug">
                  Compliance follow-ups, daily tasks, and administrative to-dos.
                </p>
              </div>

              <div class="p-2.5 rounded-xl border border-zinc-200/80 dark:border-[#2D252B] bg-zinc-50/70 dark:bg-[#251F23] hover:bg-white dark:hover:bg-[#2D232A] transition-colors">
                <span class="text-[11px] font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-1.5 mb-1">
                  <Building2 class="w-3.5 h-3.5 text-purple-700 dark:text-purple-400" />
                  Office Directory
                </span>
                <p class="text-[10px] text-zinc-500 dark:text-[#806B76] leading-snug">
                  Divisions, contact officers, rooms, and regional sections.
                </p>
              </div>
            </div>
          </div>

          <!-- 2. SEARCH RESULTS LIST (When user types and records match) -->
          <div v-else-if="filteredResults.length > 0" class="space-y-1">
            <div
              v-for="(item, idx) in filteredResults"
              :key="item.id"
              @click="selectResult(item)"
              @mouseenter="selectedIndex = idx"
              :class="[
                'p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3',
                selectedIndex === idx
                  ? 'bg-rose-50/50 dark:bg-[#2D1F28] border-[#D9467B] ring-1 ring-[#D9467B] shadow-2xs'
                  : 'bg-white dark:bg-[#1A1719] border-zinc-100 dark:border-[#2D252B] hover:border-zinc-200 dark:hover:border-[#3D2D38] hover:bg-zinc-50/80 dark:hover:bg-[#251F23]'
              ]"
            >
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" :class="item.badgeClass">
                  <component :is="item.icon" class="w-4 h-4" />
                </div>

                <div class="min-w-0 flex-1 space-y-0.5">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span
                      :class="[
                        'text-[10px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider',
                        item.badgeClass
                      ]"
                    >
                      {{ item.moduleName }}
                    </span>
                    <span class="text-[10px] font-medium text-zinc-500 dark:text-[#806B76] capitalize">
                      {{ item.status }}
                    </span>
                  </div>

                  <h4 class="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-[#F5EDF1] truncate">
                    {{ item.title }}
                  </h4>

                  <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] truncate">
                    {{ item.subtitle }}
                  </p>
                </div>
              </div>

              <!-- Jump Indicator -->
              <div class="flex items-center gap-1 text-zinc-400 dark:text-[#806B76] shrink-0">
                <span class="hidden sm:inline text-[11px] font-medium text-[#D9467B]" v-if="selectedIndex === idx">
                  Open record
                </span>
                <ArrowRight class="w-4 h-4" :class="{ 'text-[#D9467B]': selectedIndex === idx }" />
              </div>
            </div>
          </div>

          <!-- 3. ZERO RESULTS FOUND -->
          <div v-else class="py-12 px-4 text-center">
            <AlertCircle class="w-10 h-10 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p class="text-xs sm:text-sm font-bold text-zinc-800 dark:text-[#F5EDF1]">
              No records found matching "{{ searchQuery }}"
            </p>
            <p class="text-[11px] text-zinc-400 dark:text-[#806B76] mt-1 max-w-sm mx-auto">
              Please check your search keywords. You can search by Activity Design title, tracking number (e.g. DOC-), supplier name, task description, or office code.
            </p>
          </div>
        </div>

        <!-- Modal Footer Navigation Tips -->
        <div class="px-4 py-2.5 bg-zinc-50 dark:bg-[#141214] border-t border-zinc-100 dark:border-[#2D252B] flex items-center justify-between text-[11px] text-zinc-500 dark:text-[#BCAEBA] flex-wrap gap-2">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1">
              <kbd class="px-1.5 py-0.5 font-mono text-[9px] bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded shadow-3xs text-zinc-600 dark:text-[#BCAEBA]">↑</kbd>
              <kbd class="px-1.5 py-0.5 font-mono text-[9px] bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded shadow-3xs text-zinc-600 dark:text-[#BCAEBA]">↓</kbd>
              <span>navigate</span>
            </span>
            <span class="flex items-center gap-1">
              <kbd class="px-1.5 py-0.5 font-mono text-[9px] bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded shadow-3xs text-zinc-600 dark:text-[#BCAEBA]">↵</kbd>
              <span>open</span>
            </span>
          </div>

          <div class="flex items-center gap-1 text-zinc-400 dark:text-[#806B76]">
            <kbd class="px-1.5 py-0.5 font-mono text-[9px] bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded shadow-3xs text-zinc-600 dark:text-[#BCAEBA]">ESC</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
