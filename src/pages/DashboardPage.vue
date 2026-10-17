<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import FinanceRecordModal from '../components/finance/FinanceRecordModal.vue'
import FinanceDetailModal from '../components/finance/FinanceDetailModal.vue'
import TaskModal from '../components/tasks/TaskModal.vue'
import {
  getFinanceSummaryMetrics,
  createFinanceRecord,
  updateFinanceRecord,
  formatCurrency,
  formatDate
} from '../services/financeService'
import { normalizeChargedTo } from '../constants/chargedToOptions'
import {
  getTaskSummaryMetrics,
  createTask,
  toggleTaskComplete,
  formatTaskDate,
  isTaskOverdue,
  isTaskDueToday
} from '../services/taskService'
import {
  getDocumentSummaryMetrics,
  createDocument,
  formatDocDate,
  formatDocDateTime
} from '../services/documentService'
import DocumentModal from '../components/documents/DocumentModal.vue'
import DocumentDetailDrawer from '../components/documents/DocumentDetailDrawer.vue'
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
  Calendar,
  CheckSquare,
  ShieldCheck,
  Search,
  Copy,
  Info,
  DollarSign,
  Plus,
  Eye,
  Edit2,
  ListTodo,
  Tag
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

// Modals state
const isFinanceModalOpen = ref(false)
const recordToEdit = ref(null)
const isDetailModalOpen = ref(false)
const selectedRecord = ref(null)
const isTaskModalOpen = ref(false)
const isDocModalOpen = ref(false)
const isDocDrawerOpen = ref(false)
const selectedDocId = ref(null)

const loadDashboardData = async () => {
  isLoadingFinance.value = true
  isLoadingTasks.value = true
  isLoadingDocuments.value = true
  try {
    const [financeData, taskData, docData] = await Promise.all([
      getFinanceSummaryMetrics(),
      getTaskSummaryMetrics(),
      getDocumentSummaryMetrics()
    ])
    financeMetrics.value = financeData
    taskMetrics.value = taskData
    documentMetrics.value = docData
  } catch (err) {
    console.error('Failed to load dashboard metrics from Dexie:', err)
  } finally {
    isLoadingFinance.value = false
    isLoadingTasks.value = false
    isLoadingDocuments.value = false
  }
}

onMounted(() => {
  loadDashboardData()
})

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

    <!-- Page Welcome & Action Bar -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          {{ greeting }}, Swettie 💕
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Finance internal control monitoring, disbursement pipeline, and pending document matters.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <BaseButton
          variant="secondary"
          size="sm"
          @click="router.push('/finance')"
        >
          <Landmark class="w-3.5 h-3.5 text-forest-700 mr-1.5" />
          Finance Monitoring
        </BaseButton>

        <BaseButton
          variant="primary"
          size="sm"
          @click="openAddFinanceModal"
        >
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Add Finance Record
        </BaseButton>
      </div>
    </div>

    <!-- Live Finance Control Summary Metrics Row (4 Cards) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      <!-- Metric 1: Total Finance Records -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-zinc-500">Finance Records</span>
          <span class="p-1.5 rounded-lg bg-forest-50 text-forest-800">
            <Landmark class="w-4 h-4" />
          </span>
        </div>
        <div class="mt-2.5 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-zinc-900">
            {{ financeMetrics.totalRecords }}
          </span>
          <span class="text-xs text-forest-700 font-medium">monitored</span>
        </div>
        <p class="text-[11px] text-zinc-500 mt-1 truncate">
          Total tracked: <strong>{{ formatCurrency(financeMetrics.totalAmount) }}</strong>
        </p>
      </BaseCard>

      <!-- Metric 2: Pending Payment -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-zinc-500">Pending Payment</span>
          <span class="p-1.5 rounded-lg bg-amber-50 text-amber-700">
            <Clock class="w-4 h-4" />
          </span>
        </div>
        <div class="mt-2.5 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-zinc-900">
            {{ financeMetrics.pendingPaymentCount }}
          </span>
          <span class="text-xs text-amber-700 font-medium">records</span>
        </div>
        <p class="text-[11px] text-zinc-500 mt-1 truncate">
          Amount: <strong>{{ formatCurrency(financeMetrics.pendingPaymentAmount) }}</strong>
        </p>
      </BaseCard>

      <!-- Metric 3: Awaiting AD Action -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-zinc-500">Awaiting AD Action</span>
          <span class="p-1.5 rounded-lg bg-sky-50 text-sky-700">
            <AlertCircle class="w-4 h-4" />
          </span>
        </div>
        <div class="mt-2.5 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-zinc-900">
            {{ financeMetrics.awaitingAdCount }}
          </span>
          <span class="text-xs text-sky-700 font-medium">actions</span>
        </div>
        <p class="text-[11px] text-zinc-500 mt-1">
          Pending AD issuance or compliance
        </p>
      </BaseCard>

      <!-- Metric 4: Upcoming Event Dates -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-zinc-500">Upcoming Events</span>
          <span class="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
            <Calendar class="w-4 h-4" />
          </span>
        </div>
        <div class="mt-2.5 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-zinc-900">
            {{ financeMetrics.upcomingEventsCount }}
          </span>
          <span class="text-xs text-emerald-700 font-medium">dates scheduled</span>
        </div>
        <p class="text-[11px] text-zinc-500 mt-1 truncate">
          {{ financeMetrics.upcomingEvents[0] ? 'Next: ' + formatDate(financeMetrics.upcomingEvents[0].eventDate) : 'No pending events' }}
        </p>
      </BaseCard>
    </div>

    <!-- Live Task Summary Sub-Bar (Real IndexedDB Counts) -->
    <div class="bg-white rounded-xl border border-zinc-200/80 p-3 shadow-2xs">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <CheckSquare class="w-4 h-4 text-forest-700" />
          <span class="text-xs font-semibold text-zinc-900">My Tasks Overview</span>
          <span class="text-[11px] text-zinc-400">({{ taskMetrics.totalTasks }} total in database)</span>
        </div>

        <div class="flex items-center gap-3 sm:gap-4 flex-wrap text-xs">
          <!-- Due Today -->
          <div class="flex items-center gap-1.5">
            <span class="text-zinc-500 text-[11px]">Due Today:</span>
            <span :class="['font-bold font-mono px-1.5 py-0.2 rounded text-[11px]', taskMetrics.dueTodayCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-600']">
              {{ taskMetrics.dueTodayCount }}
            </span>
          </div>

          <!-- Overdue -->
          <div class="flex items-center gap-1.5">
            <span class="text-zinc-500 text-[11px]">Overdue:</span>
            <span :class="['font-bold font-mono px-1.5 py-0.2 rounded text-[11px]', taskMetrics.overdueCount > 0 ? 'bg-red-100 text-red-700 font-semibold' : 'bg-zinc-100 text-zinc-600']">
              {{ taskMetrics.overdueCount }}
            </span>
          </div>

          <!-- In Progress -->
          <div class="flex items-center gap-1.5">
            <span class="text-zinc-500 text-[11px]">In Progress:</span>
            <span class="font-bold font-mono px-1.5 py-0.2 rounded bg-forest-50 text-forest-800 text-[11px]">
              {{ taskMetrics.inProgressCount }}
            </span>
          </div>

          <!-- Completed -->
          <div class="flex items-center gap-1.5">
            <span class="text-zinc-500 text-[11px]">Completed:</span>
            <span class="font-bold font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 text-[11px]">
              {{ taskMetrics.completedCount }}
            </span>
          </div>

          <button
            @click="router.push('/tasks')"
            class="text-[11px] text-forest-700 hover:text-forest-900 font-medium hover:underline flex items-center gap-0.5 ml-auto sm:ml-0"
          >
            <span>Open Tasks</span>
            <ArrowRight class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Quick Action Shortcut Hub -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
    </div>

    <!-- Main 2-Column Split: Finance & Document Queue (Left 7) | Tasks & Events (Right 5) -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left Column: Finance Control Table & Physical Slips (Col 12 -> lg:7) -->
      <div class="lg:col-span-7 space-y-6">
        <!-- Live Recent Finance Monitoring Records -->
        <BaseCard>
          <template #header>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-zinc-900">
                  Finance Internal Control Monitoring
                </h3>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-forest-50 text-forest-800 font-semibold border border-forest-100">
                  {{ financeMetrics.totalRecords }} Records in Local DB
                </span>
              </div>
              <p class="text-xs text-zinc-500 mt-0.5">
                Active internal control entries, payment statuses, and purchase requests
              </p>
            </div>
          </template>

          <template #actions>
            <button
              @click="router.push('/finance')"
              class="text-xs text-forest-800 hover:text-forest-950 font-medium flex items-center gap-1 hover:underline cursor-pointer"
            >
              Open Full Monitoring Table
              <ArrowRight class="w-3.5 h-3.5" />
            </button>
          </template>

          <!-- Records List / Table -->
          <div v-if="financeMetrics.recentRecords.length > 0" class="divide-y divide-zinc-100 -mx-5 -my-5">
            <div
              v-for="rec in financeMetrics.recentRecords"
              :key="rec.id"
              class="p-4 sm:px-5 hover:bg-zinc-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div class="space-y-1 min-w-0 flex-1 text-xs">
                <!-- Supplier / Identifier and Badges -->
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-semibold text-zinc-900 text-sm truncate max-w-xs" :title="rec.activityDesign || rec.supplierName">
                    {{ rec.activityDesign || rec.supplierName || '— (No activity design specified)' }}
                  </span>

                  <BaseBadge :variant="getPaymentBadgeVariant(rec.paymentStatus)" size="xs" dot>
                    {{ rec.paymentStatus }}
                  </BaseBadge>

                  <span v-if="rec.isSample" class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                    SAMPLE
                  </span>
                </div>

                <!-- Reference numbers & amounts -->
                <div class="flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap">
                  <span v-if="rec.prNumber" class="font-mono text-zinc-700">
                    PR: <strong>{{ rec.prNumber }}</strong>
                  </span>
                  <span v-if="rec.poNumber" class="font-mono text-zinc-700">
                    PO: <strong>{{ rec.poNumber }}</strong>
                  </span>
                  <span :title="normalizeChargedTo(rec.chargedTo).join('; ')">
                    Charged: <strong>{{ normalizeChargedTo(rec.chargedTo).length > 1 ? normalizeChargedTo(rec.chargedTo)[0] + ' (+' + (normalizeChargedTo(rec.chargedTo).length - 1) + ')' : (normalizeChargedTo(rec.chargedTo)[0] || 'General') }}</strong>
                  </span>
                  <span>•</span>
                  <span>Event: {{ formatDate(rec.eventDate) }}</span>
                </div>
              </div>

              <!-- Amount and Actions -->
              <div class="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                <span class="font-mono font-bold text-zinc-900 text-xs sm:text-sm">
                  {{ formatCurrency(rec.adAmount) }}
                </span>

                <div class="flex items-center gap-1">
                  <button
                    @click="openDetailModal(rec)"
                    type="button"
                    class="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-100 transition-colors"
                  >
                    Details
                  </button>
                  <button
                    @click="openEditFinanceModal(rec)"
                    type="button"
                    class="text-[11px] px-2 py-0.5 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-100 transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty state when no records yet -->
          <div v-else class="text-center py-8 text-xs text-zinc-400 space-y-2">
            <p>No finance monitoring records logged yet.</p>
            <BaseButton variant="primary" size="sm" @click="openAddFinanceModal">
              <Plus class="w-3.5 h-3.5 text-rose-200 mr-1" />
              Add First Finance Record
            </BaseButton>
          </div>
        </BaseCard>

        <!-- Physical Documents Queue (Live Dexie Records) -->
        <BaseCard>
          <template #header>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-zinc-900">
                  Physical Document Tracking Queue
                </h3>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 font-semibold border border-sky-100">
                  {{ documentMetrics.totalActive }} Active Files
                </span>
              </div>
              <p class="text-xs text-zinc-500 mt-0.5">
                Paper files on desk, recent transit dispatches, and incoming slips
              </p>
            </div>
          </template>

          <template #actions>
            <div class="flex items-center gap-1.5">
              <button
                @click="openAddDocModal"
                type="button"
                class="p-1 rounded text-zinc-500 hover:text-forest-800 hover:bg-zinc-100"
                title="Log new paper file"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
              <button
                @click="router.push('/documents')"
                class="text-xs text-forest-800 hover:text-forest-950 font-medium flex items-center gap-1 hover:underline cursor-pointer"
              >
                Document Tracker
                <ArrowRight class="w-3.5 h-3.5" />
              </button>
            </div>
          </template>

          <!-- Document Metrics Strip -->
          <div class="grid grid-cols-3 gap-2 p-2.5 bg-zinc-50 rounded-lg border border-zinc-100 text-xs text-center mb-3">
            <div>
              <span class="text-[10px] text-zinc-400 block uppercase font-medium">In Transit</span>
              <span class="font-bold font-mono text-sky-700 text-sm">{{ documentMetrics.inTransitCount }}</span>
            </div>
            <div>
              <span class="text-[10px] text-zinc-400 block uppercase font-medium">Pending Action</span>
              <span class="font-bold font-mono text-amber-700 text-sm">{{ documentMetrics.pendingActionCount }}</span>
            </div>
            <div>
              <span class="text-[10px] text-zinc-400 block uppercase font-medium">Overdue</span>
              <span :class="['font-bold font-mono text-sm', documentMetrics.overdueCount > 0 ? 'text-red-700' : 'text-zinc-700']">
                {{ documentMetrics.overdueCount }}
              </span>
            </div>
          </div>

          <!-- Recently Moved Documents List -->
          <div v-if="documentMetrics.recentlyMoved.length > 0" class="divide-y divide-zinc-100 -mx-5 -my-2">
            <div
              v-for="doc in documentMetrics.recentlyMoved"
              :key="doc.id"
              class="p-3.5 sm:px-5 hover:bg-zinc-50/80 transition-colors flex items-center justify-between gap-3 text-xs cursor-pointer"
              @click="openDocDetails(doc)"
            >
              <div class="space-y-0.5 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[11px] font-semibold text-zinc-800 bg-zinc-100 px-1.5 py-0.2 rounded border border-zinc-200">
                    {{ doc.trackingNumber }}
                  </span>
                  <BaseBadge :variant="doc.priority === 'Urgent' ? 'urgent' : (doc.priority === 'High' ? 'warning' : 'routine')" size="xs" dot>
                    {{ doc.priority }}
                  </BaseBadge>
                  <span class="text-[11px] text-zinc-500 truncate">
                    {{ doc.status === 'in_transit' ? 'In Transit' : doc.currentOfficeCode || doc.currentOfficeName }}
                  </span>
                </div>
                <h4 class="font-medium text-zinc-900 truncate">
                  {{ doc.title }}
                </h4>
              </div>

              <span class="text-[11px] text-zinc-400 shrink-0">
                {{ formatDocDate(doc.updatedAt || doc.createdAt) }}
              </span>
            </div>
          </div>

          <div v-else class="text-center py-6 text-xs text-zinc-400 space-y-2">
            <p>No document tracking slips logged yet.</p>
            <BaseButton variant="secondary" size="sm" @click="openAddDocModal">
              <Plus class="w-3.5 h-3.5 text-zinc-500 mr-1" />
              Log First Document
            </BaseButton>
          </div>
        </BaseCard>
      </div>

      <!-- Right Column: Recent Tasks & Upcoming Events (Col 12 -> lg:5) -->
      <div class="lg:col-span-5 space-y-6">
        <!-- Live Priority Tasks (Real Dexie Records) -->
        <BaseCard>
          <template #header>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-sm font-semibold text-zinc-900">
                  Priority Tasks
                </h3>
                <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-700 font-medium font-mono">
                  {{ taskMetrics.pendingCount }} Pending
                </span>
              </div>
              <p class="text-xs text-zinc-500 mt-0.5">
                Daily administrative matters and finance audit actions
              </p>
            </div>
          </template>

          <template #actions>
            <div class="flex items-center gap-1.5">
              <button
                @click="openAddTaskModal"
                type="button"
                class="p-1 rounded text-zinc-500 hover:text-forest-800 hover:bg-zinc-100"
                title="Add task"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>
              <button
                @click="router.push('/tasks')"
                class="text-xs text-forest-800 hover:text-forest-950 font-medium flex items-center gap-1 hover:underline cursor-pointer"
              >
                All Tasks
                <ArrowRight class="w-3.5 h-3.5" />
              </button>
            </div>
          </template>

          <!-- Interactive Tasks List -->
          <div v-if="taskMetrics.recentTasks.length > 0" class="space-y-2 -mx-1">
            <div
              v-for="task in taskMetrics.recentTasks"
              :key="task.id"
              class="p-2.5 rounded-lg border bg-white border-zinc-200/90 hover:border-forest-300 transition-all flex items-start gap-2.5"
            >
              <input
                type="checkbox"
                :checked="task.status === 'Completed' || task.isCompleted"
                @change="handleToggleTask(task)"
                class="mt-0.5 rounded border-zinc-300 text-forest-800 focus:ring-forest-600 cursor-pointer"
              />

              <div class="flex-1 min-w-0 cursor-pointer" @click="router.push('/tasks')">
                <p class="text-xs font-medium text-zinc-900 leading-snug">
                  {{ task.title }}
                </p>

                <div class="flex items-center gap-2 mt-1 text-[10px] text-zinc-500 flex-wrap">
                  <span class="text-zinc-600 bg-zinc-100 px-1 py-0.2 rounded">{{ task.category || 'General' }}</span>
                  <span>•</span>
                  <span
                    :class="[
                      'flex items-center gap-1 font-medium',
                      isTaskOverdue(task) ? 'text-red-700 font-semibold' : (isTaskDueToday(task) ? 'text-amber-700 font-semibold' : 'text-zinc-600')
                    ]"
                  >
                    <Clock class="w-3 h-3 text-zinc-400" />
                    {{ formatTaskDate(task.dueDate) }}
                    <span v-if="isTaskOverdue(task)" class="text-[9px] text-red-600 font-bold">OVERDUE</span>
                  </span>
                </div>
              </div>

              <BaseBadge :variant="getPriorityBadgeVariant(task.priority)" size="xs">
                {{ task.priority }}
              </BaseBadge>
            </div>
          </div>

          <div v-else class="text-center py-6 text-xs text-zinc-400 space-y-2">
            <p>No pending tasks. You are all caught up!</p>
            <BaseButton variant="secondary" size="sm" @click="openAddTaskModal">
              <Plus class="w-3.5 h-3.5 text-zinc-500 mr-1" />
              Add Task
            </BaseButton>
          </div>
        </BaseCard>

        <!-- Upcoming Events from Finance Records -->
        <BaseCard title="Upcoming Event Dates" subtitle="Scheduled events and disbursement milestones">
          <template #actions>
            <button
              @click="router.push('/calendar')"
              class="text-xs text-forest-800 hover:text-forest-950 font-medium hover:underline cursor-pointer"
            >
              Calendar
            </button>
          </template>

          <div v-if="financeMetrics.upcomingEvents.length > 0" class="space-y-2.5 text-xs">
            <div
              v-for="ev in financeMetrics.upcomingEvents"
              :key="ev.id"
              class="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100 flex items-start justify-between gap-2"
            >
              <div class="min-w-0">
                <div class="font-medium text-zinc-800 truncate">
                  {{ ev.supplierName || ev.prNumber || 'Milestone #' + ev.id }}
                </div>
                <div class="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-2">
                  <span>{{ ev.chargedTo || 'General Fund' }}</span>
                  <span>•</span>
                  <span class="font-mono font-medium text-zinc-700">{{ formatCurrency(ev.adAmount) }}</span>
                </div>
              </div>

              <span class="text-[11px] font-semibold text-forest-800 bg-forest-50 px-2 py-0.5 rounded border border-forest-100 shrink-0">
                {{ formatDate(ev.eventDate) }}
              </span>
            </div>
          </div>

          <div v-else class="text-center py-4 text-xs text-zinc-400">
            No upcoming events scheduled.
          </div>
        </BaseCard>

        <!-- Local Storage Architecture Notice Card -->
        <div class="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-2xs space-y-2.5 text-xs">
          <div class="flex items-center gap-2 text-forest-900 font-semibold">
            <ShieldCheck class="w-4 h-4 text-forest-700" />
            <span>Private Local Storage Environment</span>
          </div>
          <p class="text-zinc-600 text-[11px] leading-relaxed">
            All finance internal control records, task checklists, and routing logs are preserved in your local Dexie IndexedDB.
          </p>
          <div class="pt-1 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-100">
            <span>Database: <strong>FlowDeskDB v4</strong></span>
            <span class="text-emerald-700 font-medium">100% Offline Active</span>
          </div>
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
