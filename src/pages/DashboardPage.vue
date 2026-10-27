<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import FinanceRecordModal from '../components/finance/FinanceRecordModal.vue'
import FinanceDetailModal from '../components/finance/FinanceDetailModal.vue'
import TaskModal from '../components/tasks/TaskModal.vue'
import {
  getFinanceSummaryMetrics,
  getFinanceRecords,
  createFinanceRecord,
  updateFinanceRecord,
  formatCurrency,
  formatDate
} from '../services/financeService'
import { normalizeChargedTo } from '../constants/chargedToOptions'
import {
  getTaskSummaryMetrics,
  getTasks,
  createTask,
  toggleTaskComplete,
  formatTaskDate,
  isTaskOverdue,
  isTaskDueToday
} from '../services/taskService'
import {
  getDocumentSummaryMetrics,
  getDocuments,
  createDocument,
  formatDocDate,
  formatDocDateTime
} from '../services/documentService'
import DocumentModal from '../components/documents/DocumentModal.vue'
import DocumentDetailDrawer from '../components/documents/DocumentDetailDrawer.vue'
import { toast } from '../composables/useToast'
import {
  Landmark,
  FileText,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  FilePlus,
  ArrowRight,
  Building2,
  Calendar as CalendarIcon,
  CheckSquare,
  Search,
  Copy,
  Info,
  DollarSign,
  Plus,
  Eye,
  Edit2,
  ListTodo,
  Tag,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  ExternalLink,
  CalendarCheck2
} from 'lucide-vue-next'

const router = useRouter()

// Dynamic time greeting
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

const dismissNotice = ref(false)

// Live Dexie finance metrics
const financeMetrics = ref({
  totalRecords: 0,
  totalAmount: 0,
  pendingPaymentCount: 0,
  pendingPaymentAmount: 0,
  completedPaymentCount: 0,
  awaitingAdCount: 0,
  upcomingEventsCount: 0,
  upcomingEvents: [],
  recentRecords: []
})
const isLoadingFinance = ref(true)

// Live Dexie task metrics
const taskMetrics = ref({
  totalTasks: 0,
  dueTodayCount: 0,
  overdueCount: 0,
  inProgressCount: 0,
  completedCount: 0,
  pendingCount: 0,
  recentTasks: []
})
const isLoadingTasks = ref(true)

// Live Dexie document metrics
const documentMetrics = ref({
  totalActive: 0,
  inTransitCount: 0,
  pendingActionCount: 0,
  overdueCount: 0,
  recentlyMoved: []
})
const isLoadingDocuments = ref(true)

// Calendar items and state
const allTasks = ref([])
const allDocuments = ref([])
const allFinanceRecords = ref([])
const isLoadingCalendar = ref(true)

const currentDate = ref(new Date())
const selectedDate = ref(null) // 'YYYY-MM-DD'
const selectedModuleFilter = ref('all') // 'all' | 'tasks' | 'documents' | 'finance'
const isDayModalOpen = ref(false)
const selectedDayData = ref({ dateStr: '', items: [] })

// Modals state
const isFinanceModalOpen = ref(false)
const recordToEdit = ref(null)
const isDetailModalOpen = ref(false)
const selectedRecord = ref(null)
const isTaskModalOpen = ref(false)
const isDocModalOpen = ref(false)
const isDocDrawerOpen = ref(false)
const selectedDocId = ref(null)

// Normalize date to 'YYYY-MM-DD'
const normalizeDateKey = (val) => {
  if (!val) return null
  if (typeof val === 'string' && val.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    return val.slice(0, 10)
  }
  try {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  } catch {}
  return null
}

const loadDashboardData = async () => {
  isLoadingFinance.value = true
  isLoadingTasks.value = true
  isLoadingDocuments.value = true
  isLoadingCalendar.value = true
  try {
    const [financeData, taskData, docData, tasksList, docsList, financeList] = await Promise.all([
      getFinanceSummaryMetrics(),
      getTaskSummaryMetrics(),
      getDocumentSummaryMetrics(),
      getTasks().catch(() => []),
      getDocuments({ includeArchived: false }).catch(() => []),
      getFinanceRecords().catch(() => [])
    ])
    financeMetrics.value = financeData
    taskMetrics.value = taskData
    documentMetrics.value = docData
    allTasks.value = tasksList || []
    allDocuments.value = docsList || []
    allFinanceRecords.value = financeList || []
  } catch (err) {
    console.error('Failed to load dashboard metrics from Dexie:', err)
  } finally {
    isLoadingFinance.value = false
    isLoadingTasks.value = false
    isLoadingDocuments.value = false
    isLoadingCalendar.value = false
  }
}

onMounted(() => {
  loadDashboardData()
  window.addEventListener('flowdesk:refresh-counts', loadDashboardData)
  window.addEventListener('focus', loadDashboardData)
})

onUnmounted(() => {
  window.removeEventListener('flowdesk:refresh-counts', loadDashboardData)
  window.removeEventListener('focus', loadDashboardData)
})

// Calendar Navigation
const currentMonthYearName = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })
})

const currentMonthIndex = computed(() => currentDate.value.getMonth())
const currentYear = computed(() => currentDate.value.getFullYear())

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
  selectedDate.value = normalizeDateKey(new Date())
}

// Unified Deadlines & Events
const unifiedDeadlines = computed(() => {
  const items = []
  const todayStr = normalizeDateKey(new Date())

  // 1. Tasks with dueDate
  for (const t of allTasks.value) {
    const dKey = normalizeDateKey(t.dueDate)
    if (dKey) {
      const isCompleted = !!t.isCompleted || t.status === 'Completed'
      const isOverdue = !isCompleted && dKey < todayStr
      const isDueToday = !isCompleted && dKey === todayStr
      items.push({
        id: `task-${t.id}`,
        rawId: t.id,
        module: 'tasks',
        moduleLabel: 'Task',
        title: t.title,
        subtitle: t.category || 'General Task',
        dateKey: dKey,
        time: '5:00 PM',
        priority: (t.priority || 'Medium').toLowerCase(),
        status: t.status || (isCompleted ? 'Completed' : 'To Do'),
        isCompleted,
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
        moduleLabel: 'Document',
        title: `${doc.trackingNumber ? doc.trackingNumber + ': ' : ''}${doc.title}`,
        subtitle: `${doc.documentType || 'Paper Slip'} • ${doc.currentOfficeCode || doc.currentOfficeName || 'In Transit'}`,
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
        moduleLabel: 'Finance',
        title: `${f.activityDesign || f.supplierName || 'Procurement Event'} (${formatCurrency(f.adAmount || 0)})`,
        subtitle: `Supplier: ${f.supplierName || 'N/A'} • Status: ${f.paymentStatus || 'Pending'}`,
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

  items.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return items
})

const moduleCounts = computed(() => {
  const counts = { all: unifiedDeadlines.value.length, tasks: 0, documents: 0, finance: 0 }
  for (const item of unifiedDeadlines.value) {
    if (counts[item.module] !== undefined) {
      counts[item.module]++
    }
  }
  return counts
})

const filteredDeadlines = computed(() => {
  if (selectedModuleFilter.value === 'all') return unifiedDeadlines.value
  return unifiedDeadlines.value.filter((i) => i.module === selectedModuleFilter.value)
})

const deadlinesByDateMap = computed(() => {
  const map = {}
  for (const item of filteredDeadlines.value) {
    if (!map[item.dateKey]) {
      map[item.dateKey] = []
    }
    map[item.dateKey].push(item)
  }
  return map
})

const calendarGridDays = computed(() => {
  const year = currentYear.value
  const month = currentMonthIndex.value

  const firstDayOfWeek = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const todayStr = normalizeDateKey(new Date())
  const days = []

  // Previous month leading days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i
    const prevDate = new Date(year, month - 1, dayNum)
    const mStr = String(prevDate.getMonth() + 1).padStart(2, '0')
    const dStr = String(dayNum).padStart(2, '0')
    const dKey = `${prevDate.getFullYear()}-${mStr}-${dStr}`
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
    const mStr = String(month + 1).padStart(2, '0')
    const dStr = String(d).padStart(2, '0')
    const dKey = `${year}-${mStr}-${dStr}`
    days.push({
      dayNumber: d,
      dateString: dKey,
      isCurrentMonth: true,
      isToday: dKey === todayStr,
      items: deadlinesByDateMap.value[dKey] || []
    })
  }

  // Next month trailing days
  const remainingCells = (7 - (days.length % 7)) % 7
  for (let d = 1; d <= remainingCells; d++) {
    const nextDate = new Date(year, month + 1, d)
    const mStr = String(nextDate.getMonth() + 1).padStart(2, '0')
    const dStr = String(d).padStart(2, '0')
    const dKey = `${nextDate.getFullYear()}-${mStr}-${dStr}`
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

const handleItemClick = (item) => {
  if (item.module === 'finance') {
    openDetailModal(item.source)
  } else if (item.module === 'documents') {
    openDocDetails(item.source)
  } else if (item.module === 'tasks') {
    openDayModal(item.dateKey)
  }
}

const openDayModal = (dateString) => {
  selectedDate.value = dateString
  const itemsOnDate = unifiedDeadlines.value.filter((i) => i.dateKey === dateString)
  selectedDayData.value = {
    dateStr: dateString,
    items: itemsOnDate
  }
  isDayModalOpen.value = true
}

const handleToggleDayTask = async (taskItem) => {
  try {
    await toggleTaskComplete(taskItem.rawId)
    await loadDashboardData()
    if (selectedDayData.value?.dateStr) {
      selectedDayData.value.items = unifiedDeadlines.value.filter(
        (i) => i.dateKey === selectedDayData.value.dateStr
      )
    }
    toast.success('Task status updated')
  } catch (err) {
    console.error('Error toggling task:', err)
    toast.error('Failed to update task')
  }
}

const formatHumanDate = (dateKey) => {
  if (!dateKey) return ''
  const parts = dateKey.split('-')
  if (parts.length < 3) return dateKey
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  return dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Finance Modal Handlers
const openAddFinanceModal = () => {
  recordToEdit.value = null
  isFinanceModalOpen.value = true
}

const openEditFinanceModal = (record) => {
  recordToEdit.value = record
  isFinanceModalOpen.value = true
  if (isDetailModalOpen.value) {
    isDetailModalOpen.value = false
  }
}

const openDetailModal = (record) => {
  selectedRecord.value = record
  isDetailModalOpen.value = true
}

const handleFinanceSaved = async ({ isEdit, id, data, budgetEntries }) => {
  try {
    if (isEdit) {
      await updateFinanceRecord(id, data, budgetEntries)
    } else {
      await createFinanceRecord(data, budgetEntries)
    }
    isFinanceModalOpen.value = false
    await loadDashboardData()
  } catch (err) {
    alert('Error saving finance record: ' + err.message)
  }
}

// Task Modal Handlers
const openAddTaskModal = () => {
  isTaskModalOpen.value = true
}

const handleTaskSaved = async ({ data }) => {
  try {
    await createTask(data)
    isTaskModalOpen.value = false
    await loadDashboardData()
  } catch (err) {
    alert('Error saving task: ' + err.message)
  }
}

const handleToggleTask = async (task) => {
  try {
    await toggleTaskComplete(task.id)
    await loadDashboardData()
  } catch (err) {
    console.error('Error toggling task:', err)
  }
}

// Document Tracker Handlers
const openAddDocModal = () => {
  isDocModalOpen.value = true
}

const openDocDetails = (doc) => {
  selectedDocId.value = doc.id
  isDocDrawerOpen.value = true
}

const handleDocSaved = async ({ data }) => {
  try {
    await createDocument(data)
    isDocModalOpen.value = false
    await loadDashboardData()
  } catch (err) {
    alert('Error logging document: ' + err.message)
  }
}

const getPaymentBadgeVariant = (status) => {
  if (!status) return 'routine'
  if (status === 'Paid') return 'success'
  if (status.includes('Pending')) return 'urgent'
  if (status.includes('Processing') || status.includes('Obligated')) return 'warning'
  return 'info'
}

const getPriorityBadgeVariant = (priority) => {
  if (priority === 'Urgent') return 'urgent'
  if (priority === 'High') return 'warning'
  if (priority === 'Medium') return 'info'
  return 'routine'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <!-- <div
      v-if="!dismissNotice"
      class="bg-forest-50/80 border border-forest-200/80 rounded-xl p-3.5 sm:p-4 flex items-start gap-3 text-xs text-forest-900 transition-all shadow-2xs"
    >
      <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div class="flex-1 space-y-1">
        <div class="font-semibold text-forest-950 flex items-center gap-2">
          <span>FlowDesk Workspace</span>
          <span class="px-1.5 py-0.2 rounded bg-forest-200/60 text-forest-800 text-[10px] font-medium uppercase">
            Local IndexedDB Active
          </span>
        </div>
        <p class="text-forest-800 leading-relaxed text-[11px] sm:text-xs">
          Finance metrics and task records are computed live from your offline database. All purchase requests, supplier disbursements, and daily checklists remain private on this device.
        </p>
      </div>
      <button
        @click="dismissNotice = true"
        type="button"
        class="text-forest-600 hover:text-forest-950 p-1 rounded-md hover:bg-forest-100/60 transition-colors cursor-pointer"
        aria-label="Dismiss notice"
      >
        ✕
      </button>
    </div> -->

    <!-- Page Welcome Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1] tracking-tight">
          {{ greeting }}, Swettie 💕
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 dark:text-[#BCAEBA] mt-0.5">
          Finance internal control monitoring, disbursement pipeline, and compliance schedule.
        </p>
      </div>
    </div>

    <!-- Live Finance & Tasks Summary Metrics Row (5 Cards) -->
    <div class="w-full max-w-full overflow-x-auto pb-2 scrollbar-thin">
      <div class="flex items-stretch gap-3.5 min-w-max lg:min-w-full">
        <!-- Metric 1: Total Finance Records -->
        <BaseCard
          compact
          class="flex-1 min-w-[220px] max-w-[280px] h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors shrink-0"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-zinc-500 dark:text-[#BCAEBA] truncate">Finance Records</span>
            <span class="p-1.5 rounded-lg bg-forest-50 dark:bg-forest-950/40 text-forest-800 dark:text-forest-300 shrink-0">
              <Landmark class="w-4 h-4" />
            </span>
          </div>
          <div class="mt-2.5 flex items-baseline gap-2 overflow-x-auto scrollbar-none whitespace-nowrap">
            <span class="text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1]">
              {{ financeMetrics.totalRecords }}
            </span>
            <span class="text-xs text-forest-700 dark:text-forest-400 font-medium">monitored</span>
          </div>
          <div
            class="mt-2 pt-1 border-t border-zinc-100 dark:border-[#2D252B] overflow-x-auto scrollbar-none"
            :title="'Total tracked: ' + formatCurrency(financeMetrics.totalAmount)"
          >
            <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] whitespace-nowrap">
              Total tracked: <strong class="text-zinc-800 dark:text-[#DDD2D9] font-mono">{{ formatCurrency(financeMetrics.totalAmount) }}</strong>
            </p>
          </div>
        </BaseCard>

        <!-- Metric 2: Pending Payment -->
        <BaseCard
          compact
          class="flex-1 min-w-[220px] max-w-[280px] h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors shrink-0"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-zinc-500 dark:text-[#BCAEBA] truncate">Pending Payment</span>
            <span class="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 shrink-0">
              <Clock class="w-4 h-4" />
            </span>
          </div>
          <div class="mt-2.5 flex items-baseline gap-2 overflow-x-auto scrollbar-none whitespace-nowrap">
            <span class="text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1]">
              {{ financeMetrics.pendingPaymentCount }}
            </span>
            <span class="text-xs text-amber-700 dark:text-amber-400 font-medium">records</span>
          </div>
          <div
            class="mt-2 pt-1 border-t border-zinc-100 dark:border-[#2D252B] overflow-x-auto scrollbar-none"
            :title="'Amount: ' + formatCurrency(financeMetrics.pendingPaymentAmount)"
          >
            <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] whitespace-nowrap">
              Amount: <strong class="text-zinc-800 dark:text-[#DDD2D9] font-mono">{{ formatCurrency(financeMetrics.pendingPaymentAmount) }}</strong>
            </p>
          </div>
        </BaseCard>

        <!-- Metric 3: Awaiting AD Action -->
        <BaseCard
          compact
          class="flex-1 min-w-[220px] max-w-[280px] h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors shrink-0"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-zinc-500 dark:text-[#BCAEBA] truncate">Awaiting AD Action</span>
            <span class="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 shrink-0">
              <AlertCircle class="w-4 h-4" />
            </span>
          </div>
          <div class="mt-2.5 flex items-baseline gap-2 overflow-x-auto scrollbar-none whitespace-nowrap">
            <span class="text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1]">
              {{ financeMetrics.awaitingAdCount }}
            </span>
            <span class="text-xs text-sky-700 dark:text-sky-400 font-medium">actions</span>
          </div>
          <div
            class="mt-2 pt-1 border-t border-zinc-100 dark:border-[#2D252B] overflow-x-auto scrollbar-none"
            title="Pending AD issuance or compliance"
          >
            <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] whitespace-nowrap">
              Pending AD issuance or compliance
            </p>
          </div>
        </BaseCard>

        <!-- Metric 4: Upcoming Event Dates -->
        <BaseCard
          compact
          class="flex-1 min-w-[220px] max-w-[280px] h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors shrink-0"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-zinc-500 dark:text-[#BCAEBA] truncate">Upcoming Events</span>
            <span class="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 shrink-0">
              <Calendar class="w-4 h-4" />
            </span>
          </div>
          <div class="mt-2.5 flex items-baseline gap-2 overflow-x-auto scrollbar-none whitespace-nowrap">
            <span class="text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1]">
              {{ financeMetrics.upcomingEventsCount }}
            </span>
            <span class="text-xs text-emerald-700 dark:text-emerald-400 font-medium">dates scheduled</span>
          </div>
          <div
            class="mt-2 pt-1 border-t border-zinc-100 dark:border-[#2D252B] overflow-x-auto scrollbar-none"
            :title="financeMetrics.upcomingEvents[0] ? 'Next: ' + formatDate(financeMetrics.upcomingEvents[0].eventDate) : 'No pending events'"
          >
            <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] whitespace-nowrap">
              {{ financeMetrics.upcomingEvents[0] ? 'Next: ' + formatDate(financeMetrics.upcomingEvents[0].eventDate) : 'No pending events' }}
            </p>
          </div>
        </BaseCard>

        <!-- Metric 5: My Tasks Overview -->
        <BaseCard
          compact
          class="flex-1 min-w-[220px] max-w-[280px] h-full flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors cursor-pointer group shrink-0"
          @click="router.push('/tasks')"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-zinc-500 dark:text-[#BCAEBA] truncate">My Tasks Overview</span>
            <span class="p-1.5 rounded-lg bg-pink-50 dark:bg-pink-950/40 text-[#D9467B] dark:text-[#F472B6] shrink-0">
              <CheckSquare class="w-4 h-4" />
            </span>
          </div>
          <div class="mt-2.5 flex items-baseline gap-2 overflow-x-auto scrollbar-none whitespace-nowrap">
            <span class="text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1]">
              {{ taskMetrics.totalTasks }}
            </span>
            <span class="text-xs text-[#D9467B] dark:text-[#F472B6] font-medium">
              Documents
            </span>
          </div>
          <div
            class="mt-2 pt-1 border-t border-zinc-100 dark:border-[#2D252B] overflow-x-auto scrollbar-none"
            :title="`Due: ${taskMetrics.dueTodayCount} • Overdue: ${taskMetrics.overdueCount} • Active: ${taskMetrics.inProgressCount} • Done: ${taskMetrics.completedCount}`"
          >
            <div class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] whitespace-nowrap flex items-center gap-1.5">
              <span :class="taskMetrics.dueTodayCount > 0 ? 'font-bold text-amber-600 dark:text-amber-400' : ''">
                Due: {{ taskMetrics.dueTodayCount }}
              </span>
              <span>•</span>
              <span :class="taskMetrics.overdueCount > 0 ? 'font-bold text-rose-600 dark:text-rose-400' : ''">
                Overdue: {{ taskMetrics.overdueCount }}
              </span>
              <span>•</span>
              <span>Active: {{ taskMetrics.inProgressCount }}</span>
              <span>•</span>
              <span>Done: {{ taskMetrics.completedCount }}</span>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- Quick Action Shortcut Hub -->
    <!-- <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <button
        @click="openAddFinanceModal"
        type="button"
        class="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-zinc-200/80 hover:border-forest-400 hover:bg-forest-50/30 transition-all text-left shadow-2xs group cursor-pointer"
      >
        <div class="w-8 h-8 rounded-md bg-forest-100 text-forest-800 flex items-center justify-center shrink-0 group-hover:bg-forest-800 group-hover:text-white transition-colors">
          <Plus class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-semibold text-zinc-800 group-hover:text-forest-900 truncate">
            New Finance Record
          </div>
          <div class="text-[10px] text-zinc-400 truncate">PR, PO, supplier AD</div>
        </div>
      </button>

      <button
        @click="openAddTaskModal"
        type="button"
        class="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-zinc-200/80 hover:border-forest-400 hover:bg-forest-50/30 transition-all text-left shadow-2xs group cursor-pointer"
      >
        <div class="w-8 h-8 rounded-md bg-forest-100 text-forest-800 flex items-center justify-center shrink-0 group-hover:bg-forest-800 group-hover:text-white transition-colors">
          <CheckSquare class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-semibold text-zinc-800 group-hover:text-forest-900 truncate">
            Add Priority Task
          </div>
          <div class="text-[10px] text-zinc-400 truncate">Create checklist item</div>
        </div>
      </button>

      <button
        @click="router.push('/finance')"
        type="button"
        class="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-zinc-200/80 hover:border-forest-400 hover:bg-forest-50/30 transition-all text-left shadow-2xs group cursor-pointer"
      >
        <div class="w-8 h-8 rounded-md bg-forest-100 text-forest-800 flex items-center justify-center shrink-0 group-hover:bg-forest-800 group-hover:text-white transition-colors">
          <Landmark class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-semibold text-zinc-800 group-hover:text-forest-900 truncate">
            Finance Monitoring
          </div>
          <div class="text-[10px] text-zinc-400 truncate">View control table</div>
        </div>
      </button>

      <button
        @click="openAddDocModal"
        type="button"
        class="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-zinc-200/80 hover:border-forest-400 hover:bg-forest-50/30 transition-all text-left shadow-2xs group cursor-pointer"
      >
        <div class="w-8 h-8 rounded-md bg-forest-100 text-forest-800 flex items-center justify-center shrink-0 group-hover:bg-forest-800 group-hover:text-white transition-colors">
          <FilePlus class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <div class="text-xs font-semibold text-zinc-800 group-hover:text-forest-900 truncate">
            Track Paper Slip
          </div>
          <div class="text-[10px] text-zinc-400 truncate">Log new incoming file</div>
        </div>
      </button>
    </div> -->

    <!-- Full Width Calendar -->
    <div class="bg-white dark:bg-[#1E171C] rounded-2xl border border-zinc-200/80 dark:border-[#2D252B] shadow-2xs overflow-hidden">
      <!-- Calendar Header & Navigation Controls -->
      <div class="p-4 sm:p-5 border-b border-zinc-100 dark:border-[#2D252B] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <!-- Month Navigation -->
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-forest-50 dark:bg-forest-950/40 text-forest-800 dark:text-forest-300 flex items-center justify-center shrink-0">
            <CalendarIcon class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-bold text-zinc-900 dark:text-[#F5EDF1] tracking-tight">
              {{ currentMonthYearName }}
            </h3>
            <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA]">
              Scheduled tasks, document review deadlines & finance events
            </p>
          </div>

          <div class="flex items-center gap-1 ml-2">
            <button
              @click="goToToday"
              type="button"
              class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-[#2D252B] hover:bg-zinc-100 dark:hover:bg-[#251F23] text-zinc-700 dark:text-[#DDD2D9] transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              @click="prevMonth"
              type="button"
              class="p-1.5 rounded-lg border border-zinc-200 dark:border-[#2D252B] hover:bg-zinc-100 dark:hover:bg-[#251F23] text-zinc-600 dark:text-[#BCAEBA] transition-colors cursor-pointer"
              title="Previous month"
            >
              <ChevronLeft class="w-4 h-4" />
            </button>
            <button
              @click="nextMonth"
              type="button"
              class="p-1.5 rounded-lg border border-zinc-200 dark:border-[#2D252B] hover:bg-zinc-100 dark:hover:bg-[#251F23] text-zinc-600 dark:text-[#BCAEBA] transition-colors cursor-pointer"
              title="Next month"
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Filter Pills & Module Counts -->
        <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          <button
            v-for="tab in [
              { id: 'all', label: 'All Items', count: moduleCounts.all },
              { id: 'tasks', label: 'Tasks', count: moduleCounts.tasks },
              { id: 'documents', label: 'Documents', count: moduleCounts.documents },
              { id: 'finance', label: 'Finance', count: moduleCounts.finance }
            ]"
            :key="tab.id"
            @click="selectedModuleFilter = tab.id"
            type="button"
            :class="[
              'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1',
              selectedModuleFilter === tab.id
                ? 'bg-forest-800 dark:bg-forest-700 text-white shadow-2xs font-semibold'
                : 'text-zinc-600 dark:text-[#BCAEBA] hover:text-zinc-900 dark:hover:text-white bg-zinc-50 dark:bg-[#251F23] hover:bg-zinc-100 dark:hover:bg-[#2D252B]'
            ]"
          >
            <span>{{ tab.label }}</span>
            <span class="text-[10px] opacity-80 font-mono">({{ tab.count }})</span>
          </button>
        </div>

        <!-- Legend and Full Calendar Link -->
        <div class="flex items-center gap-3 text-xs text-zinc-500 dark:text-[#BCAEBA] shrink-0">
          <div class="hidden sm:flex items-center gap-3">
            <span class="inline-flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-sky-500"></span>
              Tasks
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              Documents
            </span>
            <span class="inline-flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              Finance
            </span>
          </div>

          <button
            @click="router.push('/calendar')"
            type="button"
            class="text-xs text-forest-800 dark:text-forest-400 hover:text-forest-950 dark:hover:text-forest-300 font-semibold inline-flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>Full Calendar</span>
            <ArrowRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Calendar Month Grid Container -->
      <div class="w-full overflow-x-auto">
        <div class="min-w-[720px] lg:min-w-full">
          <!-- Day of Week Headers -->
          <div class="grid grid-cols-7 border-b border-zinc-200 dark:border-[#2D252B] bg-zinc-50/70 dark:bg-[#191317]/70 text-center text-xs font-semibold text-zinc-600 dark:text-[#BCAEBA]">
            <div class="py-2.5">Sun</div>
            <div class="py-2.5">Mon</div>
            <div class="py-2.5">Tue</div>
            <div class="py-2.5">Wed</div>
            <div class="py-2.5">Thu</div>
            <div class="py-2.5">Fri</div>
            <div class="py-2.5">Sat</div>
          </div>

          <!-- 7-Column Days Grid -->
          <div class="grid grid-cols-7 border-l border-t border-zinc-200/80 dark:border-[#2D252B]">
            <div
              v-for="(cell, idx) in calendarGridDays"
              :key="idx"
              @click="openDayModal(cell.dateString)"
              :class="[
                'min-h-[115px] sm:min-h-[125px] p-1.5 sm:p-2 border-r border-b border-zinc-200/80 dark:border-[#2D252B] flex flex-col justify-between transition-colors cursor-pointer group',
                cell.isCurrentMonth
                  ? (cell.isToday
                      ? 'bg-rose-50/20 dark:bg-rose-950/10'
                      : 'bg-white dark:bg-[#1E171C] hover:bg-zinc-50/90 dark:hover:bg-[#231C21]')
                  : 'bg-zinc-50/50 dark:bg-[#181216]/50 opacity-60 hover:opacity-90'
              ]"
            >
              <!-- Cell Top: Day Number and Badges -->
              <div class="flex items-center justify-between gap-1">
                <span
                  :class="[
                    'text-xs font-semibold inline-flex items-center justify-center transition-transform',
                    cell.isToday
                      ? 'w-6 h-6 rounded-full bg-[#D9467B] text-white font-bold shadow-xs'
                      : (cell.isCurrentMonth
                          ? 'text-zinc-800 dark:text-[#F5EDF1]'
                          : 'text-zinc-400 dark:text-zinc-600')
                  ]"
                >
                  {{ cell.dayNumber }}
                </span>

                <span
                  v-if="cell.items.length > 0"
                  class="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-[#2D252B] text-zinc-600 dark:text-[#DDD2D9] font-medium"
                >
                  {{ cell.items.length }}
                </span>
              </div>

              <!-- Cell Content: Event items -->
              <div class="mt-1 space-y-1 flex-1 overflow-hidden">
                <div
                  v-for="(item, itemIdx) in cell.items.slice(0, 3)"
                  :key="item.id || itemIdx"
                  @click.stop="handleItemClick(item)"
                  :title="`${item.title} (${item.moduleLabel})`"
                  :class="[
                    'text-[11px] px-1.5 py-0.5 rounded-md truncate flex items-center gap-1 transition-all hover:scale-[1.01] cursor-pointer',
                    item.module === 'documents'
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200/80 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                      : (item.module === 'finance'
                          ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                          : 'bg-sky-50 dark:bg-sky-950/50 text-sky-800 dark:text-sky-200 border border-sky-200/80 dark:border-sky-800/60 hover:bg-sky-100 dark:hover:bg-sky-900/60'),
                    item.isCompleted ? 'line-through opacity-55' : ''
                  ]"
                >
                  <span
                    v-if="item.isOverdue"
                    class="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0"
                    title="Overdue"
                  />
                  <CheckSquare v-else-if="item.module === 'tasks'" class="w-3 h-3 shrink-0 opacity-70" />
                  <FileText v-else-if="item.module === 'documents'" class="w-3 h-3 shrink-0 opacity-70" />
                  <Landmark v-else class="w-3 h-3 shrink-0 opacity-70" />

                  <span class="truncate font-medium">{{ item.title }}</span>
                </div>

                <!-- More items badge -->
                <button
                  v-if="cell.items.length > 3"
                  @click.stop="openDayModal(cell.dateString)"
                  type="button"
                  class="text-[10px] font-medium text-forest-700 dark:text-forest-400 hover:text-forest-900 dark:hover:text-forest-300 hover:underline pt-0.5 block text-left"
                >
                  +{{ cell.items.length - 3 }} more
                </button>
              </div>

              <!-- Bottom subtle indicator on hover -->
              <div class="h-1"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Day Schedule Details Modal -->
    <div
      v-if="isDayModalOpen"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div class="bg-white dark:bg-[#1E171C] rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl border border-zinc-200 dark:border-[#2D252B] space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-forest-50 dark:bg-forest-950/40 text-forest-800 dark:text-forest-300 flex items-center justify-center">
              <CalendarCheck2 class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm sm:text-base font-bold text-zinc-900 dark:text-[#F5EDF1]">
                {{ formatHumanDate(selectedDayData.dateStr) }}
              </h3>
              <p class="text-xs text-zinc-500 dark:text-[#BCAEBA]">
                {{ selectedDayData.items.length }} scheduled deadline(s) / event(s)
              </p>
            </div>
          </div>
          <button
            @click="isDayModalOpen = false"
            type="button"
            class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1 rounded-lg cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Items list for selected day -->
        <div v-if="selectedDayData.items.length > 0" class="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
          <div
            v-for="ev in selectedDayData.items"
            :key="ev.id"
            class="p-3 rounded-xl border border-zinc-200/80 dark:border-[#2D252B] bg-zinc-50/60 dark:bg-[#251F23]/60 flex items-start justify-between gap-3"
          >
            <div class="flex items-start gap-2.5 min-w-0 flex-1">
              <!-- Task checkbox or module icon -->
              <div class="pt-0.5 shrink-0">
                <input
                  v-if="ev.module === 'tasks'"
                  type="checkbox"
                  :checked="ev.isCompleted"
                  @change="handleToggleDayTask(ev)"
                  class="rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
                />
                <span
                  v-else-if="ev.module === 'documents'"
                  class="p-1 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 inline-block"
                >
                  <FileText class="w-3.5 h-3.5" />
                </span>
                <span
                  v-else
                  class="p-1 rounded bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 inline-block"
                >
                  <Landmark class="w-3.5 h-3.5" />
                </span>
              </div>

              <div class="min-w-0 flex-1 space-y-0.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span
                    :class="[
                      'text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider border',
                      ev.module === 'documents' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300' :
                      (ev.module === 'finance' ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300')
                    ]"
                  >
                    {{ ev.moduleLabel }}
                  </span>

                  <span
                    v-if="ev.isOverdue"
                    class="text-[9px] font-semibold text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 px-1.5 py-0.2 rounded border border-rose-200 flex items-center gap-0.5"
                  >
                    <AlertTriangle class="w-2.5 h-2.5" />
                    Overdue
                  </span>
                </div>

                <h4
                  :class="[
                    'text-xs font-semibold text-zinc-900 dark:text-[#F5EDF1] leading-snug',
                    ev.isCompleted ? 'line-through text-zinc-400 dark:text-zinc-500' : ''
                  ]"
                >
                  {{ ev.title }}
                </h4>

                <p class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] truncate">
                  {{ ev.subtitle }}
                </p>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex flex-col items-end gap-1.5 shrink-0">
              <BaseBadge :variant="ev.priority" size="xs">
                {{ ev.priority }}
              </BaseBadge>

              <button
                v-if="ev.module === 'documents'"
                @click="openDocDetails(ev.source); isDayModalOpen = false"
                type="button"
                class="text-[11px] text-forest-800 dark:text-forest-400 hover:underline font-medium cursor-pointer"
              >
                View Tracking
              </button>
              <button
                v-else-if="ev.module === 'finance'"
                @click="openDetailModal(ev.source); isDayModalOpen = false"
                type="button"
                class="text-[11px] text-forest-800 dark:text-forest-400 hover:underline font-medium cursor-pointer"
              >
                View Record
              </button>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-xs text-zinc-400 dark:text-zinc-500">
          <CalendarIcon class="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
          No deadlines or events scheduled for this day.
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-[#2D252B]">
          <BaseButton variant="secondary" size="sm" @click="isDayModalOpen = false">
            Close
          </BaseButton>
          <BaseButton variant="primary" size="sm" @click="router.push('/calendar')">
            <ExternalLink class="w-3.5 h-3.5 text-white mr-1.5" />
            Open Full Calendar
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Quick Add/Edit Finance Modal -->
    <FinanceRecordModal
      :is-open="isFinanceModalOpen"
      :record-to-edit="recordToEdit"
      @close="isFinanceModalOpen = false"
      @saved="handleFinanceSaved"
    />

    <!-- Quick Detail Modal -->
    <FinanceDetailModal
      :is-open="isDetailModalOpen"
      :record="selectedRecord"
      @close="isDetailModalOpen = false"
      @edit="openEditFinanceModal"
      @delete="loadDashboardData"
    />

    <!-- Quick Add Task Modal -->
    <TaskModal
      :is-open="isTaskModalOpen"
      @close="isTaskModalOpen = false"
      @saved="handleTaskSaved"
    />

    <!-- Quick Add Document Modal -->
    <DocumentModal
      :is-open="isDocModalOpen"
      @close="isDocModalOpen = false"
      @saved="handleDocSaved"
    />

    <!-- Document Detail Drawer -->
    <DocumentDetailDrawer
      :is-open="isDocDrawerOpen"
      :document-id="selectedDocId"
      @close="isDocDrawerOpen = false"
      @updated="loadDashboardData"
      @deleted="loadDashboardData"
    />
  </div>
</template>
