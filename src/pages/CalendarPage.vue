<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  FileText,
  Plus,
  Info,
  CheckSquare,
  Landmark,
  Kanban,
  CheckCircle2,
  CalendarCheck2,
  Filter,
  ArrowRight,
  X,
  AlertTriangle,
  RefreshCw,
  Tag
} from 'lucide-vue-next'
import { getTasks, createTask, toggleTaskComplete } from '../services/taskService'
import { getDocuments } from '../services/documentService'
import { getFinanceRecords, formatCurrency } from '../services/financeService'
import { toast } from '../composables/useToast'

const router = useRouter()

// Current calendar date state
const currentDate = ref(new Date())
const selectedDate = ref(null) // 'YYYY-MM-DD' or null
const selectedModuleFilter = ref('all') // 'all' | 'tasks' | 'documents' | 'finance'
const selectedUrgencyFilter = ref('all') // 'all' | 'overdue' | 'today' | 'upcoming'
const isLoading = ref(true)

// Data from Work Desk modules
const allTasks = ref([])
const allDocuments = ref([])
const allFinanceRecords = ref([])

// Add Deadline Reminder Modal state
const isAddModalOpen = ref(false)
const newReminder = ref({
  title: '',
  dueDate: new Date().toISOString().slice(0, 10),
  priority: 'High',
  category: 'Administrative'
})
const isSavingReminder = ref(false)

// Helper: Normalize any date string / timestamp to 'YYYY-MM-DD'
const normalizeDateKey = (val) => {
  if (!val) return null
  if (typeof val === 'string' && val.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.slice(0, 10)
  }
  try {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10)
    }
  } catch {}
  return null
}

const loadCalendarData = async () => {
  isLoading.value = true
  try {
    const [tasksList, docsList, financeList] = await Promise.all([
      getTasks().catch(() => []),
      getDocuments({ includeArchived: false }).catch(() => []),
      getFinanceRecords().catch(() => [])
    ])
    allTasks.value = tasksList || []
    allDocuments.value = docsList || []
    allFinanceRecords.value = financeList || []
  } catch (err) {
    console.error('Failed to load Work Desk items for Calendar:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadCalendarData()
  window.addEventListener('flowdesk:refresh-counts', loadCalendarData)
  window.addEventListener('focus', loadCalendarData)
})

onUnmounted(() => {
  window.removeEventListener('flowdesk:refresh-counts', loadCalendarData)
  window.removeEventListener('focus', loadCalendarData)
})

// Current month/year display
const currentMonthYearName = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })
})

const currentMonthIndex = computed(() => currentDate.value.getMonth())
const currentYear = computed(() => currentDate.value.getFullYear())

// Navigation methods
const prevMonth = () => {
  const d = new Date(currentDate.value)
  d.setMonth(d.getMonth() - 1)
  currentDate.value = d
}

const nextMonth = () => {
  const d = new Date(currentDate.value)
  d.setMonth(d.getMonth() + 1)
  currentDate.value = d
}

const goToToday = () => {
  currentDate.value = new Date()
  selectedDate.value = new Date().toISOString().slice(0, 10)
}

// Unified items from Work Desk modules with deadlines
const unifiedDeadlines = computed(() => {
  const items = []
  const todayStr = new Date().toISOString().slice(0, 10)

  // 1. Tasks with dueDate
  for (const t of allTasks.value) {
    const dKey = normalizeDateKey(t.dueDate)
    if (dKey) {
      const isOverdue = !t.isCompleted && t.status !== 'Completed' && dKey < todayStr
      const isDueToday = !t.isCompleted && dKey === todayStr
      items.push({
        id: `task-${t.id}`,
        rawId: t.id,
        module: 'tasks',
        moduleLabel: 'My Tasks',
        title: t.title,
        subtitle: t.category || 'Work Desk Task',
        dateKey: dKey,
        time: '5:00 PM',
        priority: (t.priority || 'Medium').toLowerCase(),
        status: t.status || (t.isCompleted ? 'Completed' : 'Pending'),
        isCompleted: !!t.isCompleted || t.status === 'Completed',
        isOverdue,
        isDueToday,
        source: t
      })
    }
  }

  // 2. Documents with dueDate
  for (const doc of allDocuments.value) {
    const dKey = normalizeDateKey(doc.dueDate)
    if (dKey && !doc.isArchived) {
      const isCompleted = doc.status === 'received' || doc.status === 'archived'
      const isOverdue = !isCompleted && dKey < todayStr
      const isDueToday = !isCompleted && dKey === todayStr
      items.push({
        id: `doc-${doc.id}`,
        rawId: doc.id,
        module: 'documents',
        moduleLabel: 'Document Tracker',
        title: `${doc.trackingNumber}: ${doc.title}`,
        subtitle: `${doc.documentType || 'Official Document'} • To: ${doc.destinationOffice?.name || 'Destination'}`,
        dateKey: dKey,
        time: '4:30 PM',
        priority: (doc.priority || 'Medium').toLowerCase(),
        status: doc.status || 'Active',
        isCompleted,
        isOverdue,
        isDueToday,
        source: doc
      })
    }
  }

  // 3. Finance records with eventDate
  for (const f of allFinanceRecords.value) {
    const dKey = normalizeDateKey(f.eventDate)
    if (dKey) {
      const isCompleted = f.paymentStatus === 'Paid'
      const isOverdue = !isCompleted && dKey < todayStr && f.adStatus !== 'Approved'
      const isDueToday = dKey === todayStr
      items.push({
        id: `fin-${f.id}`,
        rawId: f.id,
        module: 'finance',
        moduleLabel: 'Finance Monitoring',
        title: `${f.activityDesign || f.supplierName || 'Procurement Event'} (${formatCurrency(f.adAmount || 0)})`,
        subtitle: `Supplier: ${f.supplierName || 'N/A'} • AD: ${f.adStatus || 'Draft'} • Status: ${f.paymentStatus || 'Pending'}`,
        dateKey: dKey,
        time: '9:00 AM',
        priority: f.adStatus === 'Draft' ? 'urgent' : 'high',
        status: f.paymentStatus || 'Pending',
        isCompleted,
        isOverdue,
        isDueToday,
        source: f
      })
    }
  }

  // Sort ascending by dateKey
  items.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return items
})

// Map of dateKey -> Array of deadlines for calendar cells
const deadlinesByDateMap = computed(() => {
  const map = {}
  for (const item of unifiedDeadlines.value) {
    if (!map[item.dateKey]) {
      map[item.dateKey] = []
    }
    map[item.dateKey].push(item)
  }
  return map
})

// Calendar Grid Days computation
const calendarGridDays = computed(() => {
  const year = currentYear.value
  const month = currentMonthIndex.value

  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const todayStr = new Date().toISOString().slice(0, 10)
  const days = []

  // Leading days from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i
    const prevDate = new Date(year, month - 1, dayNum)
    const dKey = prevDate.toISOString().slice(0, 10)
    days.push({
      dayNumber: dayNum,
      dateString: dKey,
      isCurrentMonth: false,
      isToday: dKey === todayStr,
      items: deadlinesByDateMap.value[dKey] || []
    })
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(month + 1).padStart(2, '0')
    const dayStr = String(d).padStart(2, '0')
    const dKey = `${year}-${monthStr}-${dayStr}`
    days.push({
      dayNumber: d,
      dateString: dKey,
      isCurrentMonth: true,
      isToday: dKey === todayStr,
      items: deadlinesByDateMap.value[dKey] || []
    })
  }

  // Trailing days from next month to complete 35 or 42 cells
  const remainingCells = (7 - (days.length % 7)) % 7
  for (let d = 1; d <= remainingCells; d++) {
    const nextDate = new Date(year, month + 1, d)
    const dKey = nextDate.toISOString().slice(0, 10)
    days.push({
      dayNumber: d,
      dateString: dKey,
      isCurrentMonth: false,
      isToday: dKey === todayStr,
      items: deadlinesByDateMap.value[dKey] || []
    })
  }

  return days
})

// KPI Metrics
const calendarKpis = computed(() => {
  const todayStr = new Date().toISOString().slice(0, 10)
  const now = Date.now()
  const next7DaysStr = new Date(now + 7 * 86400000).toISOString().slice(0, 10)

  let overdue = 0
  let dueToday = 0
  let dueThisWeek = 0

  for (const item of unifiedDeadlines.value) {
    if (!item.isCompleted) {
      if (item.dateKey < todayStr) overdue++
      else if (item.dateKey === todayStr) dueToday++
      else if (item.dateKey <= next7DaysStr) dueThisWeek++
    }
  }

  return {
    overdue,
    dueToday,
    dueThisWeek,
    total: unifiedDeadlines.value.length
  }
})

// Module counts for filtering tabs
const moduleCounts = computed(() => {
  const counts = { all: unifiedDeadlines.value.length, tasks: 0, documents: 0, finance: 0 }
  for (const item of unifiedDeadlines.value) {
    if (counts[item.module] !== undefined) {
      counts[item.module]++
    }
  }
  return counts
})

// Filtered Agenda List
const filteredAgendaList = computed(() => {
  let list = [...unifiedDeadlines.value]
  const todayStr = new Date().toISOString().slice(0, 10)

  // Filter by selected date on calendar grid if any
  if (selectedDate.value) {
    list = list.filter((i) => i.dateKey === selectedDate.value)
  }

  // Filter by module
  if (selectedModuleFilter.value !== 'all') {
    list = list.filter((i) => i.module === selectedModuleFilter.value)
  }

  // Filter by urgency
  if (selectedUrgencyFilter.value === 'overdue') {
    list = list.filter((i) => i.isOverdue)
  } else if (selectedUrgencyFilter.value === 'today') {
    list = list.filter((i) => i.isDueToday)
  } else if (selectedUrgencyFilter.value === 'upcoming') {
    list = list.filter((i) => i.dateKey >= todayStr && !i.isCompleted)
  }

  return list
})

// Date selection
const handleSelectDate = (dateString) => {
  if (selectedDate.value === dateString) {
    selectedDate.value = null // Toggle off
  } else {
    selectedDate.value = dateString
  }
}

// Quick action: toggle task complete
const handleToggleTask = async (ev) => {
  if (ev.module !== 'tasks') return
  try {
    await toggleTaskComplete(ev.rawId)
    toast.success('Task status updated successfully')
    await loadCalendarData()
  } catch (err) {
    toast.error('Failed to update task')
  }
}

// Add Deadline Reminder Handler
const handleCreateReminder = async () => {
  if (!newReminder.value.title.trim()) {
    toast.error('Please enter a deadline title')
    return
  }

  isSavingReminder.value = true
  try {
    await createTask({
      title: newReminder.value.title.trim(),
      dueDate: newReminder.value.dueDate,
      priority: newReminder.value.priority,
      category: newReminder.value.category,
      status: 'To Do',
      isCompleted: false
    })
    toast.success('Deadline reminder saved to Work Desk schedule')
    isAddModalOpen.value = false
    newReminder.value = {
      title: '',
      dueDate: new Date().toISOString().slice(0, 10),
      priority: 'High',
      category: 'Administrative'
    }
    await loadCalendarData()
  } catch (err) {
    console.error('Failed to create deadline reminder:', err)
    toast.error('Failed to save reminder')
  } finally {
    isSavingReminder.value = false
  }
}

// Format date for badge
const formatBadgeDate = (dateKey) => {
  if (!dateKey) return { month: 'OCT', day: '15' }
  const parts = dateKey.split('-')
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  const month = dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return { month, day: parts[2] }
}

const formatHumanDate = (dateKey) => {
  if (!dateKey) return ''
  const parts = dateKey.split('-')
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <!-- <div class="bg-forest-50/80 border border-forest-200/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-forest-900 shadow-2xs">
      <CalendarCheck2 class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div class="flex-1">
        <span class="font-semibold text-forest-950">Work Desk Synchronized Schedule:</span>
        All statutory deadlines, physical document turnaround dates, finance event schedules, and daily tasks are automatically aggregated into this interactive calendar.
      </div>
    </div> -->

    <!-- Header & Quick Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Calendar & Deadlines
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Consolidated compliance calendar across Document Tracking, Finance Monitoring, and My Tasks.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <BaseButton variant="secondary" size="sm" @click="loadCalendarData">
          <RefreshCw class="w-3.5 h-3.5 text-zinc-500 mr-1.5" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </BaseButton>
        <BaseButton variant="primary" size="sm" @click="isAddModalOpen = true">
          <Plus class="w-3.5 h-3.5 text-white mr-1.5" />
          Add Deadline Reminder
        </BaseButton>
      </div>
    </div>

    <!-- KPI Metric Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Overdue Deadlines</p>
        <p class="text-xl font-bold text-rose-600 mt-0.5">{{ calendarKpis.overdue }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Requires immediate attention</p>
      </div>
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Due Today</p>
        <p class="text-xl font-bold text-amber-600 mt-0.5">{{ calendarKpis.dueToday }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Expiring by end of day</p>
      </div>
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Due This Week</p>
        <p class="text-xl font-bold text-sky-700 mt-0.5">{{ calendarKpis.dueThisWeek }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Upcoming within 7 days</p>
      </div>
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Total Tracked Deadlines</p>
        <p class="text-xl font-bold text-forest-800 mt-0.5">{{ calendarKpis.total }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Across all modules</p>
      </div>
    </div>

    <!-- Main Grid: Agenda List + Month Mini-Calendar Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Agenda List (Col 12 -> lg:7) -->
      <div class="lg:col-span-7 space-y-4">
        <BaseCard>
          <template #header>
            <div class="flex items-center justify-between w-full flex-wrap gap-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-zinc-900">
                  {{ selectedDate ? `Deadlines for ${formatHumanDate(selectedDate)}` : 'Upcoming Official Deadlines' }}
                </span>
                <span class="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full font-mono font-medium">
                  {{ filteredAgendaList.length }}
                </span>
              </div>

              <button
                v-if="selectedDate"
                @click="selectedDate = null"
                type="button"
                class="text-xs text-forest-700 hover:text-forest-900 font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Show all upcoming</span>
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          </template>

          <!-- Module Filters -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-zinc-100">
            <button
              v-for="tab in [
                { id: 'all', label: 'All Items', count: moduleCounts.all },
                { id: 'tasks', label: 'My Tasks', count: moduleCounts.tasks },
                { id: 'documents', label: 'Document Tracker', count: moduleCounts.documents },
                { id: 'finance', label: 'Finance Monitoring', count: moduleCounts.finance }
              ]"
              :key="tab.id"
              @click="selectedModuleFilter = tab.id"
              type="button"
              :class="[
                'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1',
                selectedModuleFilter === tab.id
                  ? 'bg-forest-800 text-white shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100'
              ]"
            >
              <span>{{ tab.label }}</span>
              <span class="text-[10px] opacity-80 font-mono">({{ tab.count }})</span>
            </button>
          </div>

          <!-- Agenda Items List -->
          <div v-if="filteredAgendaList.length > 0" class="divide-y divide-zinc-100 -mx-5 -mb-5">
            <div
              v-for="ev in filteredAgendaList"
              :key="ev.id"
              class="p-4 hover:bg-zinc-50/80 transition-colors flex items-start justify-between gap-3 group"
            >
              <div class="flex items-start gap-3 min-w-0 flex-1">
                <!-- Date Node Badge -->
                <div
                  :class="[
                    'w-11 h-11 rounded-xl border flex flex-col items-center justify-center shrink-0 transition-transform group-hover:scale-105',
                    ev.isOverdue
                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                      : (ev.isDueToday
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-forest-50 border-forest-200 text-forest-800')
                  ]"
                >
                  <span class="text-[9px] font-bold uppercase leading-none">{{ formatBadgeDate(ev.dateKey).month }}</span>
                  <span class="text-sm font-extrabold leading-tight">{{ formatBadgeDate(ev.dateKey).day }}</span>
                </div>

                <!-- Event Details -->
                <div class="space-y-1 min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span
                      :class="[
                        'text-[10px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider border',
                        ev.module === 'documents' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        (ev.module === 'finance' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-sky-50 text-sky-800 border-sky-200')
                      ]"
                    >
                      {{ ev.moduleLabel }}
                    </span>

                    <span
                      v-if="ev.isOverdue"
                      class="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200 flex items-center gap-0.5"
                    >
                      <AlertTriangle class="w-3 h-3" />
                      Overdue
                    </span>
                    <span
                      v-else-if="ev.isDueToday"
                      class="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200"
                    >
                      Due Today
                    </span>
                  </div>

                  <h4
                    :class="[
                      'text-xs sm:text-sm font-medium text-zinc-900 leading-snug',
                      ev.isCompleted ? 'line-through text-zinc-400' : ''
                    ]"
                  >
                    {{ ev.title }}
                  </h4>

                  <p class="text-[11px] text-zinc-500 truncate">
                    {{ ev.subtitle }}
                  </p>

                  <div class="flex items-center gap-3 text-[11px] text-zinc-500 pt-0.5 flex-wrap">
                    <span class="flex items-center gap-1 text-zinc-600">
                      <Clock class="w-3 h-3 text-zinc-400" />
                      {{ ev.time }}
                    </span>
                    <span>•</span>
                    <span class="capitalize text-zinc-600">Status: {{ ev.status }}</span>
                    <span>•</span>
                    <router-link
                      :to="ev.module === 'documents' ? '/documents' : (ev.module === 'finance' ? '/finance' : '/tasks')"
                      class="text-forest-700 hover:text-forest-900 font-medium inline-flex items-center gap-0.5"
                    >
                      <span>Open {{ ev.moduleLabel.split(' ')[0] }}</span>
                      <ArrowRight class="w-3 h-3" />
                    </router-link>
                  </div>
                </div>
              </div>

              <!-- Right Actions: Priority & Toggle -->
              <div class="flex flex-col items-end gap-2 shrink-0">
                <BaseBadge :variant="ev.priority" size="xs">
                  {{ ev.priority }}
                </BaseBadge>

                <!-- Checkbox toggle for tasks -->
                <button
                  v-if="ev.module === 'tasks'"
                  @click="handleToggleTask(ev)"
                  type="button"
                  :class="[
                    'text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer inline-flex items-center gap-1',
                    ev.isCompleted
                      ? 'bg-zinc-100 text-zinc-500 border-zinc-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  ]"
                  :title="ev.isCompleted ? 'Mark pending' : 'Mark task completed'"
                >
                  <CheckCircle2 class="w-3 h-3" />
                  <span>{{ ev.isCompleted ? 'Done' : 'Mark Done' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="text-center py-12 px-4">
            <CalendarIcon class="w-10 h-10 text-zinc-300 mx-auto mb-2" />
            <p class="text-sm font-semibold text-zinc-700">No deadlines scheduled</p>
            <p class="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              {{ selectedDate ? `There are no deadlines for ${formatHumanDate(selectedDate)}.` : 'No upcoming deadlines match your current filter.' }}
            </p>
            <button
              v-if="selectedDate"
              @click="selectedDate = null"
              type="button"
              class="mt-3 text-xs text-forest-700 hover:text-forest-900 font-medium cursor-pointer"
            >
              Clear date selection
            </button>
          </div>
        </BaseCard>
      </div>

      <!-- Month Overview Dynamic Calendar (Col 12 -> lg:5) -->
      <div class="lg:col-span-5 space-y-4">
        <BaseCard>
          <template #header>
            <div class="flex items-center justify-between w-full">
              <span class="text-sm font-bold text-zinc-900">{{ currentMonthYearName }}</span>
              <div class="flex items-center gap-1">
                <button
                  @click="goToToday"
                  type="button"
                  class="px-2 py-0.5 text-[11px] font-medium text-forest-800 hover:bg-forest-50 rounded transition-colors mr-1 cursor-pointer"
                >
                  Today
                </button>
                <button
                  @click="prevMonth"
                  type="button"
                  class="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                  title="Previous month"
                >
                  <ChevronLeft class="w-4 h-4" />
                </button>
                <button
                  @click="nextMonth"
                  type="button"
                  class="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                  title="Next month"
                >
                  <ChevronRight class="w-4 h-4" />
                </button>
              </div>
            </div>
          </template>

          <!-- Day of Week Header -->
          <div class="grid grid-cols-7 gap-1 text-center text-[11px] text-zinc-500 mb-2 font-semibold">
            <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
          </div>

          <!-- Interactive Calendar Grid -->
          <div class="grid grid-cols-7 gap-1 text-center text-xs">
            <button
              v-for="(cell, idx) in calendarGridDays"
              :key="idx"
              @click="handleSelectDate(cell.dateString)"
              type="button"
              :class="[
                'h-10 rounded-lg flex flex-col items-center justify-center relative transition-colors cursor-pointer font-medium',
                !cell.isCurrentMonth ? 'text-zinc-300 dark:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-[#251F23]' : 'text-zinc-800 dark:text-[#F5EDF1] hover:bg-zinc-100 dark:hover:bg-[#251F23]',
                cell.isToday ? 'border-2 border-[#D9467B] font-bold' : '',
                selectedDate === cell.dateString ? 'bg-[#D9467B] text-white font-bold hover:bg-[#BE3568] shadow-2xs' : ''
              ]"
            >
              <span>{{ cell.dayNumber }}</span>

              <!-- Event indicator dots -->
              <div v-if="cell.items.length > 0" class="flex items-center justify-center gap-0.5 mt-0.5">
                <span
                  v-for="(ev, evIdx) in cell.items.slice(0, 3)"
                  :key="evIdx"
                  :class="[
                    'w-1.5 h-1.5 rounded-full',
                    selectedDate === cell.dateString ? 'bg-white' : (
                      ev.module === 'documents' ? 'bg-emerald-600' :
                      (ev.module === 'finance' ? 'bg-amber-500' : 'bg-sky-600')
                    )
                  ]"
                />
                <span
                  v-if="cell.items.length > 3"
                  class="text-[8px] font-bold leading-none opacity-80"
                >+</span>
              </div>
            </button>
          </div>

          <!-- Calendar Legend -->
          <div class="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500 flex-wrap gap-2">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-sky-600 inline-block" />
              <span>My Tasks</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
              <span>Documents</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span>Finance Events</span>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- Add Deadline Reminder Modal -->
    <div
      v-if="isAddModalOpen"
      class="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-zinc-200 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-forest-50 text-forest-700 flex items-center justify-center">
              <CalendarIcon class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-zinc-900">Add Deadline Reminder</h3>
              <p class="text-xs text-zinc-500">Record a compliance deadline in your Work Desk schedule</p>
            </div>
          </div>
          <button
            @click="isAddModalOpen = false"
            type="button"
            class="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <form @submit.prevent="handleCreateReminder" class="space-y-3.5 text-xs">
          <div>
            <label class="block font-semibold text-zinc-700 mb-1">Deadline Title *</label>
            <input
              v-model="newReminder.title"
              type="text"
              placeholder="e.g. Endorse Regional Budget Proposal to COA"
              required
              class="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-forest-700"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-semibold text-zinc-700 mb-1">Due Date *</label>
              <input
                v-model="newReminder.dueDate"
                type="date"
                required
                class="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-forest-700"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-700 mb-1">Priority</label>
              <select
                v-model="newReminder.priority"
                class="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-forest-700"
              >
                <option value="Urgent">Urgent</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block font-semibold text-zinc-700 mb-1">Category</label>
            <select
              v-model="newReminder.category"
              class="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-forest-700"
            >
              <option value="Administrative">Administrative</option>
              <option value="Document Routing">Document Routing</option>
              <option value="Finance & Procurement">Finance & Procurement</option>
              <option value="Compliance Audit">Compliance Audit</option>
              <option value="Legal & Charter">Legal & Charter</option>
            </select>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
            <BaseButton
              variant="secondary"
              size="sm"
              type="button"
              @click="isAddModalOpen = false"
            >
              Cancel
            </BaseButton>
            <BaseButton
              variant="primary"
              size="sm"
              type="submit"
              :disabled="isSavingReminder"
            >
              <Plus class="w-3.5 h-3.5 text-white mr-1.5" />
              Save Reminder
            </BaseButton>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
