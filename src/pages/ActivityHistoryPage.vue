<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import db from '../db/database'
import BaseCard from '../components/common/BaseCard.vue'
import BaseButton from '../components/common/BaseButton.vue'
import {
  History,
  FileText,
  Send,
  CheckCircle2,
  Archive,
  Search,
  Filter,
  Info,
  Clock,
  Landmark,
  Trash2,
  Edit2,
  Plus,
  Kanban,
  CheckSquare,
  ArrowRight,
  Download,
  RefreshCw,
  X,
  Layers,
  Sparkles,
  Calendar
} from 'lucide-vue-next'

const liveActivities = ref([])
const isLoading = ref(true)
const selectedFilter = ref('all')
const searchQuery = ref('')
const timeframeFilter = ref('all')

const loadActivities = async () => {
  isLoading.value = true
  try {
    const list = await db.activities.toArray()
    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    liveActivities.value = list
  } catch (err) {
    console.error('Failed to load activities from Dexie:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadActivities()
  window.addEventListener('flowdesk:refresh-counts', loadActivities)
  window.addEventListener('focus', loadActivities)
})

onUnmounted(() => {
  window.removeEventListener('flowdesk:refresh-counts', loadActivities)
  window.removeEventListener('focus', loadActivities)
})

const formatTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Fallback demo activities if table has no entries yet on fresh install
const fallbackActivities = [
  {
    id: 1,
    type: 'document_registered',
    entityType: 'document',
    description: 'Received Physical Document: RO-2026-0482 from Planning & Policy Division (Logged by desk officer)',
    timestamp: new Date().toISOString()
  },
  {
    id: 2,
    type: 'transfer_initiated',
    entityType: 'document',
    description: 'Dispatched to Outbox: DISP-2026-0304 to Records Section with Routing Slip #84',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 3,
    type: 'finance_created',
    entityType: 'finance',
    description: 'Encoded Activity Design for Regional Youth Governance Summit with allocation ₱85,000.00',
    timestamp: new Date(Date.now() - 86400000).toISOString()
  },
  {
    id: 4,
    type: 'task_completed',
    entityType: 'task',
    description: 'Completed Task: Follow up pending endorsement routing slip for Budget Section',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString()
  }
]

// Determine which Work Desk module an activity belongs to
const getModuleCategory = (act) => {
  const type = act.type || ''
  const entityType = act.entityType || ''

  if (
    entityType === 'document' ||
    type.startsWith('document') ||
    type.startsWith('transfer') ||
    type === 'receipt_confirmed' ||
    type === 'scan_attached' ||
    type === 'received' ||
    type === 'dispatched'
  ) {
    return 'documents'
  }
  if (
    entityType === 'finance' ||
    type.startsWith('finance') ||
    type.startsWith('budget')
  ) {
    return 'finance'
  }
  if (
    entityType === 'task' ||
    type.startsWith('task')
  ) {
    return 'tasks'
  }
  if (
    entityType === 'workflow' ||
    type.startsWith('workflow')
  ) {
    return 'workflow'
  }
  return 'general'
}

const getModuleInfo = (act) => {
  const cat = getModuleCategory(act)
  switch (cat) {
    case 'documents':
      return {
        key: 'documents',
        label: 'Document Tracker',
        class: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        icon: FileText,
        route: '/documents'
      }
    case 'finance':
      return {
        key: 'finance',
        label: 'Finance Monitoring',
        class: 'bg-amber-50 text-amber-800 border-amber-200',
        icon: Landmark,
        route: '/finance'
      }
    case 'tasks':
      return {
        key: 'tasks',
        label: 'My Tasks',
        class: 'bg-sky-50 text-sky-800 border-sky-200',
        icon: CheckSquare,
        route: '/tasks'
      }
    case 'workflow':
      return {
        key: 'workflow',
        label: 'Workflow Board',
        class: 'bg-purple-50 text-purple-800 border-purple-200',
        icon: Kanban,
        route: '/workflow'
      }
    default:
      return {
        key: 'general',
        label: 'System Audit',
        class: 'bg-zinc-50 text-zinc-700 border-zinc-200',
        icon: History,
        route: null
      }
  }
}

// Module counts
const moduleCounts = computed(() => {
  const source = liveActivities.value.length > 0 ? liveActivities.value : fallbackActivities
  const counts = { all: source.length, documents: 0, finance: 0, tasks: 0, workflow: 0 }
  for (const act of source) {
    const cat = getModuleCategory(act)
    if (counts[cat] !== undefined) {
      counts[cat]++
    }
  }
  return counts
})

// Metrics
const metrics = computed(() => {
  const source = liveActivities.value.length > 0 ? liveActivities.value : fallbackActivities
  const today = new Date().toDateString()
  const todayCount = source.filter(a => a.timestamp && new Date(a.timestamp).toDateString() === today).length
  return {
    total: source.length,
    today: todayCount,
    latestTime: source[0]?.timestamp ? formatTime(source[0].timestamp) : 'None'
  }
})

// Filtered and searched activities
const displayedActivities = computed(() => {
  let list = liveActivities.value.length > 0 ? [...liveActivities.value] : [...fallbackActivities]

  // Module filter
  if (selectedFilter.value !== 'all') {
    list = list.filter((a) => getModuleCategory(a) === selectedFilter.value)
  }

  // Timeframe filter
  if (timeframeFilter.value !== 'all') {
    const now = Date.now()
    if (timeframeFilter.value === 'today') {
      const today = new Date().toDateString()
      list = list.filter(a => a.timestamp && new Date(a.timestamp).toDateString() === today)
    } else if (timeframeFilter.value === 'week') {
      const sevenDaysAgo = now - 7 * 86400000
      list = list.filter(a => a.timestamp && new Date(a.timestamp).getTime() >= sevenDaysAgo)
    } else if (timeframeFilter.value === 'month') {
      const thirtyDaysAgo = now - 30 * 86400000
      list = list.filter(a => a.timestamp && new Date(a.timestamp).getTime() >= thirtyDaysAgo)
    }
  }

  // Search filter
  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter((a) => {
      const desc = (a.description || '').toLowerCase()
      const type = (a.type || '').toLowerCase()
      const mod = getModuleCategory(a)
      return desc.includes(query) || type.includes(query) || mod.includes(query)
    })
  }

  return list
})

const getActivityIcon = (type = '') => {
  if (type === 'finance_created' || type === 'finance_ad_created') return Landmark
  if (type === 'finance_updated') return Edit2
  if (type === 'finance_deleted') return Trash2
  if (type === 'budget_status_updated') return Landmark
  if (type === 'document_registered' || type === 'scan_attached' || type === 'received') return FileText
  if (type === 'transfer_initiated' || type === 'dispatched') return Send
  if (type === 'receipt_confirmed' || type === 'task_completed') return CheckCircle2
  if (type === 'transfer_cancelled' || type === 'document_deleted' || type === 'task_deleted') return Trash2
  if (type === 'transfer_corrected' || type === 'document_updated' || type === 'task_updated') return Edit2
  if (type === 'document_archived') return Archive
  if (type === 'document_restored' || type === 'task_reopened') return History
  if (type === 'task_created') return Plus
  if (type.startsWith('task_')) return CheckSquare
  if (type.startsWith('workflow_folder')) return Kanban
  if (type.startsWith('workflow_')) return Send
  return History
}

const getActivityColorClass = (type = '') => {
  if (type === 'finance_created' || type === 'finance_ad_created') return 'bg-amber-600 text-white'
  if (type === 'finance_updated') return 'bg-amber-500 text-white'
  if (type === 'finance_deleted' || type === 'transfer_cancelled' || type === 'document_deleted' || type === 'task_deleted' || type === 'workflow_folder_deleted') return 'bg-rose-600 text-white'
  if (type === 'budget_status_updated') return 'bg-emerald-600 text-white'
  if (type === 'document_registered' || type === 'scan_attached' || type === 'received') return 'bg-forest-800 text-white'
  if (type === 'transfer_initiated' || type === 'dispatched') return 'bg-sky-600 text-white'
  if (type === 'receipt_confirmed' || type === 'task_completed') return 'bg-emerald-600 text-white'
  if (type === 'transfer_corrected' || type === 'document_updated' || type === 'task_updated') return 'bg-amber-600 text-white'
  if (type === 'document_archived') return 'bg-zinc-600 text-white'
  if (type === 'document_restored') return 'bg-forest-700 text-white'
  if (type === 'task_created') return 'bg-teal-700 text-white'
  if (type === 'task_reopened') return 'bg-amber-600 text-white'
  if (type.startsWith('task_')) return 'bg-teal-600 text-white'
  if (type.startsWith('workflow_folder')) return 'bg-purple-700 text-white'
  if (type.startsWith('workflow_')) return 'bg-purple-600 text-white'
  return 'bg-zinc-600 text-white'
}

// Export Activity Logs to CSV
const exportToCsv = () => {
  const source = displayedActivities.value
  if (!source || source.length === 0) return

  const headers = ['Timestamp', 'Date & Time', 'Module', 'Action Type', 'Entity ID', 'Description']
  const rows = source.map((a) => {
    const timeStr = a.timestamp ? new Date(a.timestamp).toLocaleString() : ''
    const mod = getModuleInfo(a).label
    const cleanDesc = `"${(a.description || '').replace(/"/g, '""')}"`
    return [a.timestamp || '', `"${timeStr}"`, `"${mod}"`, `"${a.type || ''}"`, a.entityId || '', cleanDesc].join(',')
  })

  const csvContent = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `flowdesk-activity-history-${new Date().toISOString().slice(0, 10)}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <!-- <div class="bg-forest-50/80 border border-forest-200/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-forest-900 shadow-2xs">
      <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div class="flex-1">
        <span class="font-semibold text-forest-950">Work Desk Audit Trail:</span>
        Chronological audit records dynamically logged by the Work Desk modules: Document Tracker, Finance Monitoring, My Tasks, and Workflow Board. Every record is stored securely in your local database.
      </div>
    </div> -->

    <!-- Header & Actions -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Activity History
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Comprehensive compliance audit trail across all Work Desk operations.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <BaseButton
          variant="secondary"
          size="sm"
          @click="loadActivities"
          :title="'Refresh audit log'"
        >
          <RefreshCw class="w-3.5 h-3.5 text-zinc-500 mr-1.5" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </BaseButton>
        <BaseButton
          variant="secondary"
          size="sm"
          @click="exportToCsv"
          :disabled="displayedActivities.length === 0"
        >
          <Download class="w-3.5 h-3.5 text-zinc-500 mr-1.5" />
          Export CSV
        </BaseButton>
      </div>
    </div>

    <!-- Summary KPI Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Total Audit Logs</p>
        <p class="text-xl font-bold text-zinc-900 mt-0.5">{{ metrics.total }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Across all modules</p>
      </div>
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Logged Today</p>
        <p class="text-xl font-bold text-emerald-700 mt-0.5">{{ metrics.today }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Actions past 24h</p>
      </div>
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Document Actions</p>
        <p class="text-xl font-bold text-forest-800 mt-0.5">{{ moduleCounts.documents }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Tracker & routing slips</p>
      </div>
      <div class="p-3.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
        <p class="text-[11px] font-medium text-zinc-500">Finance & Tasks</p>
        <p class="text-xl font-bold text-amber-700 mt-0.5">{{ moduleCounts.finance + moduleCounts.tasks }}</p>
        <p class="text-[10px] text-zinc-400 mt-0.5">Disbursements & tasks</p>
      </div>
    </div>

    <!-- Filter Controls: Modules, Timeframe, Search -->
    <div class="space-y-3">
      <!-- Work Desk Module Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        <button
          v-for="tab in [
            { id: 'all', label: 'All Modules', count: moduleCounts.all },
            { id: 'documents', label: 'Document Tracker', count: moduleCounts.documents },
            { id: 'finance', label: 'Finance Monitoring', count: moduleCounts.finance },
            { id: 'tasks', label: 'My Tasks', count: moduleCounts.tasks },
            { id: 'workflow', label: 'Workflow Board', count: moduleCounts.workflow }
          ]"
          :key="tab.id"
          @click="selectedFilter = tab.id"
          type="button"
          :class="[
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 shadow-2xs',
            selectedFilter === tab.id
              ? 'bg-forest-800 text-white font-semibold'
              : 'text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 hover:bg-zinc-50'
          ]"
        >
          <span>{{ tab.label }}</span>
          <span
            :class="[
              'px-1.5 py-0.2 rounded-full text-[10px] font-mono',
              selectedFilter === tab.id
                ? 'bg-white/20 text-white'
                : 'bg-zinc-100 text-zinc-600'
            ]"
          >
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Search & Timeframe Bar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="relative flex-1 max-w-md">
          <Search class="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by keywords, tracking slip, supplier, or action..."
            class="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-forest-700"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="flex items-center gap-1 text-xs">
          <span class="text-zinc-400 text-[11px] font-medium mr-1">Timeframe:</span>
          <button
            v-for="tf in [
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: '7 Days' },
              { id: 'month', label: '30 Days' }
            ]"
            :key="tf.id"
            @click="timeframeFilter = tf.id"
            type="button"
            :class="[
              'px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer',
              timeframeFilter === tf.id
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-600 hover:bg-zinc-100'
            ]"
          >
            {{ tf.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Timeline Audit Trail (with 100% physically centered node icons and continuous connecting line) -->
    <BaseCard>
      <div v-if="displayedActivities.length > 0" class="space-y-0">
        <div
          v-for="(act, index) in displayedActivities"
          :key="act.id || act.timestamp || index"
          class="flex items-start gap-3.5 sm:gap-4 group relative"
        >
          <!-- Left Column: Centered Bullet and Vertical Connecting Line -->
          <div class="flex flex-col items-center self-stretch shrink-0 w-8">
            <!-- Centered Circle Icon Bullet with clean white ring overlay -->
            <div
              :class="[
                'relative z-10 w-7 h-7 rounded-full flex items-center justify-center ring-4 ring-white shadow-xs shrink-0 transition-transform group-hover:scale-105',
                getActivityColorClass(act.type)
              ]"
            >
              <component :is="getActivityIcon(act.type)" class="w-3.5 h-3.5 text-white" />
            </div>

            <!-- Vertical continuous connecting line dead-centered beneath the circle -->
            <div
              v-if="index < displayedActivities.length - 1"
              class="w-0.5 grow bg-zinc-200 my-1 rounded-full"
            />
          </div>

          <!-- Right Column: Content Card -->
          <div class="flex-1 min-w-0 pb-5 pt-0.5">
            <div class="bg-white rounded-xl border border-zinc-200/80 p-3 sm:p-3.5 shadow-2xs hover:border-zinc-300 transition-colors">
              <div class="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <!-- Work Desk Module Badge -->
                  <span
                    :class="[
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border',
                      getModuleInfo(act).class
                    ]"
                  >
                    <component :is="getModuleInfo(act).icon" class="w-3 h-3" />
                    {{ getModuleInfo(act).label }}
                  </span>

                  <!-- Action Type -->
                  <span class="font-semibold text-zinc-900 text-xs capitalize">
                    {{ act.type?.replace(/_/g, ' ') }}
                  </span>
                </div>

                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
                    <Clock class="w-3 h-3 text-zinc-400" />
                    {{ formatTime(act.timestamp) }}
                  </span>
                  <!-- Quick link to Work Desk module -->
                  <router-link
                    v-if="getModuleInfo(act).route"
                    :to="getModuleInfo(act).route"
                    class="text-[11px] text-forest-700 hover:text-forest-900 font-medium inline-flex items-center gap-0.5 ml-1 transition-colors"
                  >
                    <span>View in {{ getModuleInfo(act).label.split(' ')[0] }}</span>
                    <ArrowRight class="w-3 h-3" />
                  </router-link>
                </div>
              </div>

              <!-- Description Body -->
              <p class="text-zinc-700 text-xs leading-relaxed break-words">
                {{ act.description }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="text-center py-12 px-4">
        <History class="w-10 h-10 text-zinc-300 mx-auto mb-2" />
        <p class="text-sm font-semibold text-zinc-700">No audit logs found</p>
        <p class="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
          No activity logs match your selected filter or search keyword. Activities will automatically record here as you work in Document Tracker, Finance Monitoring, My Tasks, or Workflow Board.
        </p>
        <button
          v-if="selectedFilter !== 'all' || searchQuery || timeframeFilter !== 'all'"
          @click="selectedFilter = 'all'; searchQuery = ''; timeframeFilter = 'all'"
          type="button"
          class="mt-3 text-xs text-forest-700 hover:text-forest-900 font-medium cursor-pointer"
        >
          Clear filters
        </button>
      </div>
    </BaseCard>
  </div>
</template>
