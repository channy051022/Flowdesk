<script setup>
import { ref, watch, computed } from 'vue'
import {
  formatCurrency,
  formatDate,
  getBudgetUtilizationsForRecord
} from '../../services/financeService'
import { normalizeChargedTo, getChargeCategory } from '../../constants/chargedToOptions'
import BaseBadge from '../common/BaseBadge.vue'
import {
  getEntityAttachments,
  openAttachment,
  deleteEntityAttachment,
  isDesktopApp
} from '../../services/scannerService'
import {
  X,
  Edit2,
  Trash2,
  Copy,
  Calendar,
  Landmark,
  ShieldCheck,
  Check,
  Coins,
  Layers,
  Scan,
  FileText,
  Paperclip,
  ExternalLink
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  record: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'edit', 'delete', 'scan', 'refresh'])

const copiedKey = ref('')
const budgetEntries = ref([])
const isLoadingBudgets = ref(false)
const attachmentsList = ref([])
const isLoadingAttachments = ref(false)

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const loadAttachments = async () => {
  if (!props.record?.id) {
    attachmentsList.value = []
    return
  }
  isLoadingAttachments.value = true
  try {
    attachmentsList.value = await getEntityAttachments('finance', props.record.id)
  } catch (err) {
    console.warn('Failed to load attachments in detail modal:', err)
    attachmentsList.value = []
  } finally {
    isLoadingAttachments.value = false
  }
}

const handleOpenAttachment = async (att) => {
  try {
    await openAttachment(att)
  } catch (err) {
    alert('Failed to open attachment: ' + err.message)
  }
}

const handleDeleteAttachment = async (att) => {
  if (!confirm(`Remove attachment "${att.fileName}"? This will delete the saved file.`)) return
  try {
    await deleteEntityAttachment(att.id)
    await loadAttachments()
  } catch (err) {
    alert('Error deleting attachment: ' + err.message)
  }
}

const normalizedCharges = computed(() => {
  return normalizeChargedTo(props.record?.chargedTo)
})

const loadBudgetEntries = async () => {
  if (!props.record?.id) {
    budgetEntries.value = []
    return
  }
  isLoadingBudgets.value = true
  try {
    budgetEntries.value = await getBudgetUtilizationsForRecord(props.record.id)
  } catch (err) {
    console.error('Failed to load budget entries in detail modal:', err)
    budgetEntries.value = []
  } finally {
    isLoadingBudgets.value = false
  }
}

watch(
  () => [props.isOpen, props.record?.id],
  ([isOpen, recordId]) => {
    if (isOpen && recordId) {
      loadBudgetEntries()
      loadAttachments()
    } else {
      budgetEntries.value = []
      attachmentsList.value = []
    }
  },
  { immediate: true }
)

const copyValue = (val, key) => {
  if (!val || !navigator.clipboard) return
  navigator.clipboard.writeText(String(val))
  copiedKey.value = key
  setTimeout(() => {
    copiedKey.value = ''
  }, 1800)
}
</script>

<template>
  <div
    v-if="isOpen && record"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/40 backdrop-blur-xs overflow-y-auto"
    @click.self="emit('close')"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-white rounded-xl shadow-xl border border-zinc-200/90 w-full max-w-xl my-6 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in duration-150"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-forest-100 text-forest-800 flex items-center justify-center shrink-0">
            <Landmark class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-semibold text-zinc-900 truncate">
                {{ record.activityDesign || record.columnK || record.supplierName || 'Activity Design Record' }}
              </h3>
              <span v-if="record.isSample" class="text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">
                SAMPLE
              </span>
            </div>
            <p class="text-[11px] text-zinc-500">
              Record #{{ record.id }} • Activity Design Monitoring
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
          aria-label="Close details"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-5 overflow-y-auto space-y-4 text-xs">
        <!-- Highlights Card: Amount & Statuses -->
        <div class="p-3.5 rounded-xl bg-forest-50/50 border border-forest-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span class="text-[10px] font-medium text-forest-700 uppercase tracking-wider block">
              2. Amount of AD
            </span>
            <span class="text-xl font-bold text-forest-950 font-mono">
              {{ formatCurrency(record.adAmount) }}
            </span>
            <span class="text-[10px] text-forest-600/80 block mt-0.5">
              {{ budgetEntries.length > 0 ? `Calculated from ${budgetEntries.length} budget item${budgetEntries.length > 1 ? 's' : ''}` : 'Total allocation' }}
            </span>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <div>
              <span class="text-[10px] text-zinc-500 block mb-0.5">Status of Payment</span>
              <BaseBadge
                :variant="record.paymentStatus === 'Paid' ? 'success' : (record.paymentStatus?.includes('Pending') ? 'urgent' : 'warning')"
                size="sm"
                dot
              >
                {{ record.paymentStatus || '—' }}
              </BaseBadge>
            </div>

            <div>
              <span class="text-[10px] text-zinc-500 block mb-0.5">Status of AD</span>
              <BaseBadge
                :variant="record.adStatus?.includes('Completed') ? 'forest' : 'info'"
                size="sm"
              >
                {{ record.adStatus || '—' }}
              </BaseBadge>
            </div>
          </div>
        </div>

        <!-- 1. Activity Design (Primary) -->
        <div class="p-3 rounded-lg bg-pink-50/40 border border-pink-100/80">
          <span class="text-[10px] text-forest-800 font-semibold uppercase tracking-wider block mb-1">
            1. Activity Design
          </span>
          <p class="text-zinc-900 font-medium text-xs leading-relaxed whitespace-pre-wrap">
            {{ record.activityDesign || record.columnK || '— (No activity design specified)' }}
          </p>
        </div>

        <!-- Detail Attributes Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <!-- 3. Charged to -->
          <div class="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100 sm:col-span-2">
            <span class="text-[10px] text-zinc-400 font-medium block mb-1.5">
              3. Charged to
            </span>
            <div class="flex items-center gap-1.5 flex-wrap">
              <template v-if="normalizedCharges.length > 0">
                <span
                  v-for="ch in normalizedCharges"
                  :key="ch"
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border',
                    getChargeCategory(ch) === 'MOOE'
                      ? 'bg-pink-50 text-pink-800 border-pink-200'
                      : getChargeCategory(ch) === 'LFP'
                      ? 'bg-purple-50 text-purple-800 border-purple-200'
                      : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                  ]"
                >
                  {{ ch }}
                </span>
              </template>
              <span v-else class="text-zinc-400">
                — (No category specified)
              </span>
            </div>
          </div>

          <!-- 4. Date of Event -->
          <div class="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
            <span class="text-[10px] text-zinc-400 font-medium block mb-1">
              4. Date of Event
            </span>
            <div class="text-zinc-800 font-medium flex items-center gap-1.5">
              <Calendar class="w-3.5 h-3.5 text-zinc-400" />
              <span>{{ formatDate(record.eventDate) }}</span>
            </div>
          </div>

          <!-- 8. Is there internal arrangement? -->
          <div class="p-2.5 rounded-lg bg-zinc-50 border border-zinc-100">
            <span class="text-[10px] text-zinc-400 font-medium block mb-1">
              8. Is there internal arrangement?
            </span>
            <div class="text-zinc-800 font-medium">
              <span
                :class="[
                  'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                  record.internalArrangement === 'Yes'
                    ? 'bg-amber-100 text-amber-800'
                    : record.internalArrangement === 'No'
                    ? 'bg-zinc-100 text-zinc-600'
                    : 'text-zinc-400'
                ]"
              >
                {{ record.internalArrangement || 'Not specified' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Reference Numbers (PR, PO, PPMP) with Copy -->
        <div class="space-y-2 pt-2 border-t border-zinc-100">
          <span class="text-[11px] font-semibold text-zinc-700 block">
            Official Reference Identifiers
          </span>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <!-- 5. PPMP -->
            <div class="p-2 rounded-lg bg-white border border-zinc-200/80 flex items-center justify-between">
              <div>
                <span class="text-[10px] text-zinc-400 block">5. PPMP Number</span>
                <span class="font-mono text-xs font-semibold text-zinc-800">
                  {{ record.ppmpNumber || '—' }}
                </span>
              </div>
              <button
                v-if="record.ppmpNumber"
                @click="copyValue(record.ppmpNumber, 'ppmp')"
                type="button"
                class="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                title="Copy PPMP Number"
              >
                <component :is="copiedKey === 'ppmp' ? Check : Copy" class="w-3.5 h-3.5" :class="copiedKey === 'ppmp' ? 'text-emerald-600' : ''" />
              </button>
            </div>

            <!-- 6. PR -->
            <div class="p-2 rounded-lg bg-white border border-zinc-200/80 flex items-center justify-between">
              <div>
                <span class="text-[10px] text-zinc-400 block">6. PR Number</span>
                <span class="font-mono text-xs font-semibold text-zinc-800">
                  {{ record.prNumber || '—' }}
                </span>
              </div>
              <button
                v-if="record.prNumber"
                @click="copyValue(record.prNumber, 'pr')"
                type="button"
                class="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                title="Copy PR Number"
              >
                <component :is="copiedKey === 'pr' ? Check : Copy" class="w-3.5 h-3.5" :class="copiedKey === 'pr' ? 'text-emerald-600' : ''" />
              </button>
            </div>

            <!-- 7. PO -->
            <div class="p-2 rounded-lg bg-white border border-zinc-200/80 flex items-center justify-between">
              <div>
                <span class="text-[10px] text-zinc-400 block">7. PO Number</span>
                <span class="font-mono text-xs font-semibold text-zinc-800">
                  {{ record.poNumber || '—' }}
                </span>
              </div>
              <button
                v-if="record.poNumber"
                @click="copyValue(record.poNumber, 'po')"
                type="button"
                class="p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                title="Copy PO Number"
              >
                <component :is="copiedKey === 'po' ? Check : Copy" class="w-3.5 h-3.5" :class="copiedKey === 'po' ? 'text-emerald-600' : ''" />
              </button>
            </div>
          </div>
        </div>

        <!-- 10. Budget Utilization Section -->
        <div class="space-y-2 pt-2 border-t border-zinc-100">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-zinc-800 flex items-center gap-1.5">
              <Coins class="w-3.5 h-3.5 text-forest-700" />
              10. Budget Utilization Breakdown
            </span>
            <span class="text-[10px] text-zinc-400">
              {{ budgetEntries.length }} {{ budgetEntries.length === 1 ? 'entry' : 'entries' }}
            </span>
          </div>

          <!-- Loading state -->
          <div v-if="isLoadingBudgets" class="p-4 text-center text-zinc-400 text-xs">
            Loading budget utilization details...
          </div>

          <!-- Items Table -->
          <div v-else-if="budgetEntries.length > 0" class="overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium text-[11px]">
                <tr>
                  <th class="py-2 px-3">#</th>
                  <th class="py-2 px-3">Budget Utilization Item</th>
                  <th class="py-2 px-3 text-right">Amount</th>
                  <th class="py-2 px-3">Supplier</th>
                  <th class="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100">
                <tr v-for="(entry, idx) in budgetEntries" :key="entry.id || idx" class="hover:bg-zinc-50/60">
                  <td class="py-2 px-3 text-zinc-400 font-mono text-[11px] w-8">{{ idx + 1 }}</td>
                  <td class="py-2 px-3 text-zinc-800 font-medium">{{ entry.name }}</td>
                  <td class="py-2 px-3 text-right font-mono text-zinc-900 font-semibold">{{ formatCurrency(entry.amount) }}</td>
                  <td class="py-2 px-3 text-zinc-600">
                    <span v-if="entry.supplier" class="font-medium text-zinc-800">{{ entry.supplier }}</span>
                    <span v-else class="text-zinc-400">—</span>
                  </td>
                  <td class="py-2 px-3 text-center">
                    <span
                      :class="[
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1',
                        entry.status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      ]"
                    >
                      <span class="w-1.5 h-1.5 rounded-full" :class="entry.status === 'Paid' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                      {{ entry.status || 'Unpaid' }}
                    </span>
                  </td>
                </tr>
              </tbody>
              <tfoot class="bg-forest-50/40 border-t border-forest-100 font-semibold text-xs">
                <tr>
                  <td colspan="2" class="py-2.5 px-3 text-forest-900">Total Budget Utilization</td>
                  <td class="py-2.5 px-3 text-right font-mono text-forest-950 font-bold">
                    {{ formatCurrency(record.adAmount) }}
                  </td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Empty state for legacy / non-itemized records -->
          <div v-else class="p-3 rounded-lg bg-zinc-50 border border-dashed border-zinc-200 text-center text-zinc-400 text-xs">
            No itemized budget utilization entries recorded for this entry. Historical Amount of AD: <strong class="text-zinc-700 font-mono">{{ formatCurrency(record.adAmount) }}</strong>.
          </div>
        </div>

        <!-- 11. Attached Scans & Documents Section -->
        <div class="space-y-2 pt-2 border-t border-zinc-100">
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-semibold text-zinc-800 flex items-center gap-1.5">
              <Paperclip class="w-3.5 h-3.5 text-forest-700" />
              11. Attached Scans & Documents
            </span>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-zinc-400">
                {{ attachmentsList.length }} {{ attachmentsList.length === 1 ? 'file' : 'files' }}
              </span>
              <button
                @click="emit('scan', record)"
                type="button"
                class="px-2 py-0.5 rounded-md bg-[#FFF0F5] hover:bg-[#FCE7F0] text-[#D9467B] border border-[#F3C4D7] text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="Scan document for this Activity Design"
              >
                <Scan class="w-3 h-3" />
                <span>Scan Document</span>
              </button>
            </div>
          </div>

          <!-- Attachments List -->
          <div v-if="isLoadingAttachments" class="p-3 text-center text-zinc-400 text-xs">
            Loading attachments...
          </div>
          <div v-else-if="attachmentsList.length > 0" class="space-y-1.5">
            <div
              v-for="att in attachmentsList"
              :key="att.id"
              class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 border border-zinc-200/80 hover:bg-zinc-100/60 transition-colors group"
            >
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="w-7 h-7 rounded-md bg-white border border-zinc-200 flex items-center justify-center text-forest-700 shrink-0">
                  <FileText class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-semibold text-zinc-900 truncate text-xs" :title="att.fileName">
                      {{ att.fileName }}
                    </span>
                    <span class="text-[10px] text-zinc-400 font-mono shrink-0">
                      ({{ formatBytes(att.fileSize) }})
                    </span>
                  </div>
                  <p v-if="att.notes" class="text-[10px] text-zinc-500 truncate mt-0.5">
                    {{ att.notes }}
                  </p>
                </div>
              </div>

              <!-- Action buttons for attachment -->
              <div class="flex items-center gap-1 shrink-0 ml-2">
                <button
                  @click="handleOpenAttachment(att)"
                  type="button"
                  class="px-2 py-1 rounded text-[11px] font-medium text-forest-800 hover:bg-forest-100/70 border border-forest-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  title="Open attachment in default application"
                >
                  <ExternalLink class="w-3 h-3" />
                  <span>Open</span>
                </button>
                <button
                  @click="handleDeleteAttachment(att)"
                  type="button"
                  class="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  title="Delete attachment"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="p-3 rounded-lg bg-zinc-50 border border-dashed border-zinc-200 text-center text-zinc-400 text-xs">
            No physical scans attached to this Activity Design yet. Click <strong>Scan Document</strong> to scan paperwork directly into FlowDesk.
          </div>
        </div>

        <!-- Audit & Sync Metadata -->
        <div class="pt-2 text-[10px] text-zinc-400 flex items-center justify-between border-t border-zinc-100">
          <span>Created: {{ formatDate(record.createdAt) }}</span>
          <span class="flex items-center gap-1">
            <ShieldCheck class="w-3 h-3 text-forest-700" />
            Storage: FlowDesk Local Database
          </span>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="px-5 py-3 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between shrink-0">
        <button
          @click="emit('delete', record)"
          type="button"
          class="px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Delete Record</span>
        </button>

        <div class="flex items-center gap-2">
          <button
            @click="emit('scan', record)"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-[#D9467B] border border-[#F3C4D7] text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Scan class="w-3.5 h-3.5" />
            <span>Scan Document</span>
          </button>

          <button
            @click="emit('close')"
            type="button"
            class="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 text-xs font-medium transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            @click="emit('edit', record)"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-forest-800 hover:bg-forest-900 text-white text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Edit2 class="w-3.5 h-3.5 text-rose-200" />
            <span>Edit Record</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
