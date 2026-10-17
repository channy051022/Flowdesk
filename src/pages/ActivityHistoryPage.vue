<script setup>
import { ref, onMounted, computed } from 'vue'
import db from '../db/database'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import {
  History,
  FileText,
  Send,
  CheckCircle2,
  Archive,
  Search,
  Filter,
  Info,
  Building2,
  Clock,
  Landmark,
  Trash2,
  Edit2,
  Plus
} from 'lucide-vue-next'

const liveActivities = ref([])
const isLoading = ref(true)
const selectedFilter = ref('all')

const loadActivities = async () => {
  isLoading.value = true
  try {
    const list = await db.activities.toArray()
    // Sort descending by timestamp
    list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    liveActivities.value = list
  } catch (err) {
    console.error('Failed to load activities from Dexie:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadActivities()
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

// Fallback demo activities if table has no entries yet
const fallbackActivities = [
  {
    id: 1,
    type: 'received',
    description: 'Received Physical Document: RO-2026-0482 from Planning & Policy Division (Logged by desk officer)',
    timestamp: new Date().toISOString()
  },
  {
    id: 2,
    type: 'dispatched',
    description: 'Dispatched to Outbox: DISP-2026-0304 to Records Section with Routing Slip #84',
    timestamp: new Date(Date.now() - 86400000).toISOString()
  }
]

const displayedActivities = computed(() => {
  const source = liveActivities.value.length > 0 ? liveActivities.value : fallbackActivities
  if (selectedFilter.value === 'documents') {
    return source.filter((a) => a.type?.startsWith('document_') || a.type?.startsWith('transfer_') || a.type === 'receipt_confirmed')
  }
  if (selectedFilter.value === 'finance') {
    return source.filter((a) => a.type?.startsWith('finance'))
  }
  if (selectedFilter.value === 'tasks') {
    return source.filter((a) => a.type?.startsWith('task_'))
  }
  return source
})

const getActivityIcon = (type) => {
  if (type === 'finance_created') return Landmark
  if (type === 'finance_updated') return Edit2
  if (type === 'finance_deleted') return Trash2
  if (type === 'document_registered') return FileText
  if (type === 'transfer_initiated') return Send
  if (type === 'receipt_confirmed') return CheckCircle2
  if (type === 'transfer_cancelled') return Trash2
  if (type === 'transfer_corrected') return Edit2
  if (type === 'document_archived') return Archive
  if (type === 'document_restored') return History
  if (type?.startsWith('task_')) return CheckCircle2
  return History
}

const getActivityColorClass = (type) => {
  if (type === 'finance_created') return 'bg-forest-700 text-white'
  if (type === 'finance_updated') return 'bg-amber-600 text-white'
  if (type === 'finance_deleted') return 'bg-red-600 text-white'
  if (type === 'document_registered') return 'bg-forest-800 text-white'
  if (type === 'transfer_initiated') return 'bg-sky-600 text-white'
  if (type === 'receipt_confirmed') return 'bg-emerald-700 text-white'
  if (type === 'transfer_cancelled') return 'bg-red-700 text-white'
  if (type === 'transfer_corrected') return 'bg-amber-600 text-white'
  if (type === 'document_archived') return 'bg-zinc-600 text-white'
  if (type === 'document_restored') return 'bg-forest-600 text-white'
  if (type?.startsWith('task_')) return 'bg-teal-700 text-white'
  return 'bg-zinc-600 text-white'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <div class="bg-forest-50/70 border border-forest-200/70 rounded-xl p-3.5 flex items-start gap-3 text-xs text-forest-900 shadow-2xs">
      <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div>
        <span class="font-semibold text-forest-950">Activity History Audit Trail:</span>
        Every action performed in Document Tracking, Finance Monitoring, and Daily Tasks is saved directly to your local Dexie IndexedDB.
      </div>
    </div>

    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Activity History
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Chronological audit log of physical document transfers, receipts, finance monitoring changes, and task updates.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-zinc-500 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg shadow-2xs font-medium">
          {{ displayedActivities.length }} Audit Logs
        </span>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
      <button
        v-for="tab in [
          { id: 'all', label: 'All Activities' },
          { id: 'documents', label: 'Document Tracker & Transfers' },
          { id: 'finance', label: 'Finance Monitoring Only' },
          { id: 'tasks', label: 'My Tasks Only' }
        ]"
        :key="tab.id"
        @click="selectedFilter = tab.id"
        type="button"
        :class="[
          'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer h-7 leading-none inline-flex items-center',
          selectedFilter === tab.id
            ? 'bg-forest-800 text-white shadow-xs'
            : 'text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200/80 hover:bg-zinc-50'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Timeline Card -->
    <BaseCard>
      <div v-if="displayedActivities.length > 0" class="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-zinc-200">
        <div
          v-for="act in displayedActivities"
          :key="act.id || act.timestamp"
          class="relative flex flex-col gap-1.5 text-xs"
        >
          <!-- Timeline Node Bullet -->
          <span
            :class="[
              'absolute -left-6 sm:-left-8 top-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] shadow-2xs',
              getActivityColorClass(act.type)
            ]"
          >
            <component :is="getActivityIcon(act.type)" class="w-3 h-3 text-white" />
          </span>

          <!-- Header / Timestamp -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="font-semibold text-zinc-900 capitalize">
              {{ act.type?.replace('_', ' ') }}
            </span>
            <span class="text-[11px] text-zinc-400 font-medium">
              {{ formatTime(act.timestamp) }}
            </span>
          </div>

          <!-- Description -->
          <p class="text-zinc-700 text-xs leading-relaxed">
            {{ act.description }}
          </p>
        </div>
      </div>

      <div v-else class="text-center py-8 text-xs text-zinc-400">
        No activities found for this filter.
      </div>
    </BaseCard>
  </div>
</template>
