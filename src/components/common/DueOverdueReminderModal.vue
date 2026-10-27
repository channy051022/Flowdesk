<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../stores/app'
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  Calendar,
  FileText,
  CheckSquare,
  Landmark,
  X,
  ExternalLink,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  BellRing
} from 'lucide-vue-next'

const appStore = useAppStore()
const router = useRouter()

const activeFilter = ref('all') // 'all' | 'overdue' | 'due_today' | 'document' | 'task' | 'pr_reminder'
const dontShowThisSession = ref(false)

const summary = computed(() => appStore.dueOverdueSummary || {
  items: [],
  overdueCount: 0,
  dueTodayCount: 0,
  totalCount: 0,
  documentsCount: 0,
  tasksCount: 0,
  prRemindersCount: 0
})

const filteredItems = computed(() => {
  const all = summary.value.items || []
  if (activeFilter.value === 'all') return all
  if (activeFilter.value === 'overdue') return all.filter((i) => i.urgency === 'overdue')
  if (activeFilter.value === 'due_today') return all.filter((i) => i.urgency === 'due_today')
  return all.filter((i) => i.category === activeFilter.value)
})

const handleClose = () => {
  if (dontShowThisSession.value) {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('flowdesk_startup_reminder_dismissed', 'true')
    }
  }
  appStore.closeDueReminderModal()
}

const navigateToItem = (item) => {
  appStore.closeDueReminderModal()
  router.push({
    path: item.routePath,
    query: item.routeQuery
  })
}

const getCategoryIcon = (category) => {
  switch (category) {
    case 'document':
      return FileText
    case 'task':
      return CheckSquare
    case 'pr_reminder':
    default:
      return Landmark
  }
}

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
</script>

<template>
  <div
    v-if="appStore.isDueReminderModalOpen"
    class="fixed inset-0 z-[9990] flex items-center justify-center p-3 sm:p-5 bg-black/60 dark:bg-black/80 backdrop-blur-xs overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-labelledby="due-reminder-modal-title"
  >
    <div
      class="w-full max-w-[580px] bg-white dark:bg-[#1A1719] rounded-2xl shadow-2xl border border-zinc-200 dark:border-[#3D2D38] overflow-hidden flex flex-col max-h-[90vh] my-4 animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-zinc-200 dark:border-[#3D2D38] flex items-center justify-between bg-zinc-50/80 dark:bg-[#251D23] shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 border border-rose-200 dark:border-rose-900/80 shadow-2xs">
            <BellRing class="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 id="due-reminder-modal-title" class="text-base font-bold text-zinc-900 dark:text-[#F5EDF1] leading-tight">
                Pending Deadlines & Overdue Reminders
              </h3>
              <span
                v-if="summary.totalCount > 0"
                class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
              >
                {{ summary.totalCount }} Action Required
              </span>
            </div>
            <p class="text-xs text-zinc-500 dark:text-[#BCAEBA] mt-0.5">
              Items with approaching or lapsed target completion dates
            </p>
          </div>
        </div>

        <button
          @click="handleClose"
          type="button"
          class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-[#DDD2D9] hover:bg-zinc-100 dark:hover:bg-[#2A2228] transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Quick Metrics Ribbon -->
      <div class="p-4 bg-zinc-50/40 dark:bg-[#20181E]/40 border-b border-zinc-200 dark:border-[#3D2D38] grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
        <!-- Overdue Count -->
        <button
          type="button"
          @click="activeFilter = 'overdue'"
          :class="[
            'p-2.5 rounded-xl border text-left transition-all cursor-pointer',
            activeFilter === 'overdue'
              ? 'border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 shadow-xs ring-2 ring-rose-500/20'
              : 'border-rose-200/70 dark:border-rose-900/50 bg-white dark:bg-[#1E171C] hover:bg-rose-50/50 dark:hover:bg-rose-950/20'
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-rose-700 dark:text-rose-300">Overdue</span>
            <AlertCircle class="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          </div>
          <p class="text-xl font-bold font-mono text-rose-700 dark:text-rose-300 mt-0.5">
            {{ summary.overdueCount }}
          </p>
        </button>

        <!-- Due Today Count -->
        <button
          type="button"
          @click="activeFilter = 'due_today'"
          :class="[
            'p-2.5 rounded-xl border text-left transition-all cursor-pointer',
            activeFilter === 'due_today'
              ? 'border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 shadow-xs ring-2 ring-amber-500/20'
              : 'border-amber-200/70 dark:border-amber-900/50 bg-white dark:bg-[#1E171C] hover:bg-amber-50/50 dark:hover:bg-amber-950/20'
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Due Today</span>
            <Clock class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <p class="text-xl font-bold font-mono text-amber-700 dark:text-amber-300 mt-0.5">
            {{ summary.dueTodayCount }}
          </p>
        </button>

        <!-- Documents -->
        <button
          type="button"
          @click="activeFilter = 'document'"
          :class="[
            'p-2.5 rounded-xl border text-left transition-all cursor-pointer',
            activeFilter === 'document'
              ? 'border-forest-400 dark:border-forest-700 bg-forest-50 dark:bg-forest-950/40 shadow-xs ring-2 ring-forest-500/20'
              : 'border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#1E171C] hover:bg-zinc-50 dark:hover:bg-[#251D23]'
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-zinc-700 dark:text-[#DDD2D9]">Documents</span>
            <FileText class="w-3.5 h-3.5 text-forest-600 dark:text-forest-400" />
          </div>
          <p class="text-xl font-bold font-mono text-zinc-800 dark:text-[#F5EDF1] mt-0.5">
            {{ summary.documentsCount }}
          </p>
        </button>

        <!-- Tasks & PRs -->
        <button
          type="button"
          @click="activeFilter = 'all'"
          :class="[
            'p-2.5 rounded-xl border text-left transition-all cursor-pointer',
            activeFilter === 'all'
              ? 'border-[#D9467B] bg-pink-50 dark:bg-pink-950/40 shadow-xs ring-2 ring-pink-500/20'
              : 'border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#1E171C] hover:bg-zinc-50 dark:hover:bg-[#251F23]'
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-zinc-700 dark:text-[#DDD2D9]">Total Items</span>
            <Sparkles class="w-3.5 h-3.5 text-[#D9467B] dark:text-[#F472B6]" />
          </div>
          <p class="text-xl font-bold font-mono text-zinc-800 dark:text-[#F5EDF1] mt-0.5">
            {{ summary.totalCount }}
          </p>
        </button>
      </div>

      <!-- Filter Tabs Bar -->
      <div class="px-5 py-2 border-b border-zinc-200/80 dark:border-[#3D2D38] bg-white dark:bg-[#1A1719] flex items-center gap-1.5 overflow-x-auto text-xs shrink-0">
        <button
          v-for="tab in [
            { id: 'all', label: `All (${summary.totalCount})` },
            { id: 'overdue', label: `Overdue (${summary.overdueCount})` },
            { id: 'due_today', label: `Due Today (${summary.dueTodayCount})` },
            { id: 'document', label: `Documents (${summary.documentsCount})` },
            { id: 'task', label: `Tasks (${summary.tasksCount})` },
            { id: 'pr_reminder', label: `PRs (${summary.prRemindersCount})` }
          ]"
          :key="tab.id"
          type="button"
          @click="activeFilter = tab.id"
          :class="[
            'px-2.5 py-1 rounded-lg font-medium text-xs whitespace-nowrap transition-colors cursor-pointer',
            activeFilter === tab.id
              ? 'bg-[#3D2934] text-white dark:bg-[#F5EDF1] dark:text-[#1A1719]'
              : 'text-zinc-600 dark:text-[#BCAEBA] hover:bg-zinc-100 dark:hover:bg-[#251D23]'
          ]"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- List of Items (Scrollable) -->
      <div class="flex-1 overflow-y-auto divide-y divide-zinc-200/80 dark:divide-[#2D252B] p-2 sm:p-3">
        <div
          v-if="filteredItems.length === 0"
          class="p-8 text-center text-zinc-400 dark:text-[#806B76] space-y-2"
        >
          <CheckCircle2 class="w-8 h-8 mx-auto text-emerald-500" />
          <p class="text-sm font-semibold text-zinc-700 dark:text-[#DDD2D9]">No items in this category</p>
          <p class="text-xs">There are no pending due or overdue items matching this filter.</p>
        </div>

        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="p-3 sm:p-3.5 hover:bg-zinc-50/80 dark:hover:bg-[#251F23]/60 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
        >
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border mt-0.5"
              :class="getCategoryBadgeClass(item.category)"
            >
              <component :is="getCategoryIcon(item.category)" class="w-4 h-4" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase"
                  :class="getCategoryBadgeClass(item.category)"
                >
                  {{ item.categoryLabel }}
                </span>

                <span
                  :class="[
                    'text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase flex items-center gap-1',
                    item.urgency === 'overdue'
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60'
                  ]"
                >
                  <component :is="item.urgency === 'overdue' ? AlertCircle : Clock" class="w-3 h-3" />
                  {{ item.urgencyLabel }}
                </span>

                <span v-if="item.priority" class="text-[10px] text-zinc-500 dark:text-[#806B76] font-medium">
                  Priority: {{ item.priority }}
                </span>
              </div>

              <h4 class="font-bold text-xs text-zinc-900 dark:text-[#F5EDF1] mt-1 line-clamp-1 group-hover:text-rose-700 dark:group-hover:text-rose-400 transition-colors">
                {{ item.title }}
              </h4>

              <div class="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-500 dark:text-[#BCAEBA] flex-wrap">
                <span v-if="item.subtitle">{{ item.subtitle }}</span>
                <span v-if="item.officeName">• Location: {{ item.officeName }}</span>
                <span>• Due: <strong class="text-zinc-800 dark:text-[#DDD2D9] font-mono">{{ item.dueDate }}</strong></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            @click="navigateToItem(item)"
            class="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-[#2A2228] hover:bg-rose-600 hover:text-white dark:hover:bg-rose-600 text-zinc-700 dark:text-[#DDD2D9] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 self-end sm:self-center"
          >
            <span>Open & Act</span>
            <ExternalLink class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-3.5 border-t border-zinc-200 dark:border-[#3D2D38] bg-zinc-50/90 dark:bg-[#20181E] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        <label class="flex items-center gap-2 text-xs text-zinc-600 dark:text-[#BCAEBA] cursor-pointer select-none">
          <input
            v-model="dontShowThisSession"
            type="checkbox"
            class="w-3.5 h-3.5 rounded border-zinc-300 dark:border-[#4D3A47] text-rose-600 focus:ring-rose-500 cursor-pointer"
          />
          <span>Do not pop up again during this browser session</span>
        </label>

        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            @click="handleClose"
            class="w-full sm:w-auto px-4 py-2 rounded-xl bg-zinc-900 dark:bg-[#F5EDF1] text-white dark:text-[#1A1719] text-xs font-bold hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer shadow-xs"
          >
            Acknowledge & Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
