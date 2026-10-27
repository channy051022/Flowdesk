<script setup>
import { ref, watch, computed } from 'vue'
import {
  formatCurrency,
  formatDate,
  getBudgetUtilizationsForRecord
} from '../../services/financeService'
import {
  getRegisteredDocumentSummaryForAd
} from '../../services/documentService'
import { normalizeChargedTo, getChargeCategory } from '../../constants/chargedToOptions'
import BaseBadge from '../common/BaseBadge.vue'
import {
  getEntityAttachments,
  openAttachment,
  deleteEntityAttachment
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
  ExternalLink,
  Plus,
  AlertTriangle,
  Building2,
  ArrowRight,
  FolderOpen,
  MapPin,
  CheckCircle2,
  Clock
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

const emit = defineEmits([
  'close',
  'edit',
  'delete',
  'scan',
  'refresh',
  'openDocument',
  'registerDocument'
])

const copiedKey = ref('')
const budgetEntries = ref([])
const isLoadingBudgets = ref(false)
const attachmentsList = ref([])
const isLoadingAttachments = ref(false)

const documentSummary = ref({
  adDoc: null,
  ppmpDocs: [],
  prDocs: [],
  poDocs: [],
  payrollDocs: [],
  supportingDocs: [],
  allLinkedDocs: []
})
const isLoadingDocuments = ref(false)

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

const loadLinkedDocuments = async () => {
  if (!props.record?.id) {
    documentSummary.value = {
      adDoc: null,
      ppmpDocs: [],
      prDocs: [],
      poDocs: [],
      payrollDocs: [],
      supportingDocs: [],
      allLinkedDocs: []
    }
    return
  }
  isLoadingDocuments.value = true
  try {
    documentSummary.value = await getRegisteredDocumentSummaryForAd(props.record)
  } catch (err) {
    console.warn('Failed to load linked documents for AD in detail modal:', err)
  } finally {
    isLoadingDocuments.value = false
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
      loadLinkedDocuments()
    } else {
      budgetEntries.value = []
      attachmentsList.value = []
      documentSummary.value = {
        adDoc: null,
        ppmpDocs: [],
        prDocs: [],
        poDocs: [],
        payrollDocs: [],
        supportingDocs: [],
        allLinkedDocs: []
      }
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

// Helpers for registration triggers
const handleTriggerRegister = (type, defaultRef = '', defaultTitle = '') => {
  const adName = props.record?.activityDesign || props.record?.columnK || 'Activity Design'
  let genTitle = defaultTitle
  if (!genTitle) {
    if (type === 'PPMP') genTitle = `PPMP: ${adName}`
    else if (type === 'Purchase Request') genTitle = `PR for ${adName}`
    else if (type === 'Purchase Order') genTitle = `PO for ${adName}`
    else if (type === 'Payroll / Honorarium') genTitle = `Payroll for ${adName}`
    else if (type === 'Activity Design') genTitle = adName
  }

  emit('registerDocument', {
    relatedFinanceRecordId: props.record?.id,
    documentType: type,
    referenceNumber: defaultRef || '',
    title: genTitle,
    documentAmount: type === 'Activity Design' ? props.record?.adAmount : undefined,
    eventDate: props.record?.eventDate || ''
  })
}

const getDocTypeBadgeClass = (type) => {
  if (type === 'PPMP') return 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
  if (type === 'Purchase Request') return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
  if (type === 'Purchase Order') return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
  if (type === 'Payroll / Honorarium') return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
  return 'bg-forest-100 text-forest-800 border-forest-200 dark:bg-forest-950/60 dark:text-forest-300 dark:border-forest-800'
}
</script>

<template>
  <div
    v-if="isOpen && record"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-xs overflow-y-auto"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-white dark:bg-[#1E171C] rounded-2xl shadow-2xl border border-zinc-200 dark:border-[#3D2D38] w-full max-w-3xl my-6 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in duration-150"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-zinc-200 dark:border-[#3D2D38] flex items-center justify-between bg-zinc-50/80 dark:bg-[#251D23] shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-forest-100 dark:bg-forest-950/80 text-forest-800 dark:text-forest-300 flex items-center justify-center shrink-0 border border-forest-200 dark:border-forest-900">
            <Landmark class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-zinc-900 dark:text-[#F5EDF1] truncate">
                {{ record.activityDesign || record.columnK || record.supplierName || 'Activity Design Record' }}
              </h3>
              <span v-if="record.isSample" class="text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                SAMPLE
              </span>
            </div>
            <p class="text-xs text-zinc-500 dark:text-[#BCAEBA]">
              Master Activity Design #{{ record.id }} • Connected Document Lifecycle
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-[#DDD2D9] hover:bg-zinc-100 dark:hover:bg-[#2A2228] transition-colors cursor-pointer"
          aria-label="Close details"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Content (Scrollable) -->
      <div class="p-5 overflow-y-auto space-y-5 text-xs flex-1">
        
        <!-- SECTION 1: AD Overview Card -->
        <div class="p-4 rounded-xl bg-forest-50/60 dark:bg-forest-950/30 border border-forest-200 dark:border-forest-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span class="text-[10px] font-bold text-forest-800 dark:text-forest-400 uppercase tracking-wider block">
              Total Approved Activity Design Amount
            </span>
            <span class="text-2xl font-bold text-forest-950 dark:text-forest-100 font-mono">
              {{ formatCurrency(record.adAmount) }}
            </span>
            <span class="text-[11px] text-forest-700 dark:text-forest-400/90 block mt-0.5">
              {{ budgetEntries.length > 0 ? `Calculated from ${budgetEntries.length} budget item${budgetEntries.length > 1 ? 's' : ''}` : 'Total allocation' }}
            </span>
          </div>

          <div class="flex items-center gap-2.5 flex-wrap">
            <div>
              <span class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] block mb-0.5 font-medium">Status of Payment</span>
              <BaseBadge
                :variant="record.paymentStatus === 'Paid' ? 'success' : (record.paymentStatus?.includes('Pending') ? 'urgent' : 'warning')"
                size="sm"
                dot
              >
                {{ record.paymentStatus || '—' }}
              </BaseBadge>
            </div>

            <div>
              <span class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] block mb-0.5 font-medium">Status of AD</span>
              <BaseBadge
                :variant="record.adStatus?.includes('Approved') || record.adStatus?.includes('Completed') ? 'forest' : 'info'"
                size="sm"
              >
                {{ record.adStatus || '—' }}
              </BaseBadge>
            </div>

            <div v-if="record.eventDate">
              <span class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] block mb-0.5 font-medium">Date of Event</span>
              <span class="font-medium text-zinc-800 dark:text-[#F5EDF1] inline-flex items-center gap-1 bg-white dark:bg-[#1E171C] px-2 py-0.5 rounded border border-zinc-200 dark:border-[#3D2D38]">
                <Calendar class="w-3 h-3 text-zinc-400" />
                {{ formatDate(record.eventDate) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Activity Design Name & Charged To -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div class="sm:col-span-2 p-3 rounded-lg bg-zinc-50 dark:bg-[#251D23] border border-zinc-200 dark:border-[#3D2D38]">
            <span class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] font-semibold uppercase tracking-wider block mb-1">
              Activity Design Title & Purpose
            </span>
            <p class="text-zinc-900 dark:text-[#F5EDF1] font-semibold text-xs leading-relaxed whitespace-pre-wrap">
              {{ record.activityDesign || record.columnK || '— (No title specified)' }}
            </p>
          </div>

          <div class="p-3 rounded-lg bg-zinc-50 dark:bg-[#251D23] border border-zinc-200 dark:border-[#3D2D38]">
            <span class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] font-semibold uppercase tracking-wider block mb-1">
              Charged To
            </span>
            <div class="flex items-center gap-1.5 flex-wrap">
              <template v-if="normalizedCharges.length > 0">
                <span
                  v-for="ch in normalizedCharges"
                  :key="ch"
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border',
                    getChargeCategory(ch) === 'MOOE'
                      ? 'bg-pink-50 dark:bg-pink-950/40 text-pink-800 dark:text-pink-300 border-pink-200 dark:border-pink-800'
                      : getChargeCategory(ch) === 'LFP'
                      ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                  ]"
                >
                  {{ ch }}
                </span>
              </template>
              <span v-else class="text-zinc-400 dark:text-zinc-500">
                — (No category)
              </span>
            </div>
          </div>
        </div>

        <!-- SECTION 2: Master Activity Design Physical Routing Status -->
        <div class="p-3.5 rounded-xl border border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#201A1E] space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] flex items-center gap-1.5 uppercase tracking-wider">
              <Building2 class="w-3.5 h-3.5 text-forest-700 dark:text-forest-400" />
              <span>Activity Design Physical Paper Tracking Slip</span>
            </span>

            <div v-if="documentSummary.adDoc" class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 class="w-3 h-3" />
                Registered ({{ documentSummary.adDoc.trackingNumber }})
              </span>
              <button
                @click="emit('openDocument', documentSummary.adDoc.id)"
                type="button"
                class="px-2 py-0.5 rounded-md border border-zinc-200 dark:border-[#3D2D38] text-forest-800 dark:text-forest-300 hover:bg-zinc-50 dark:hover:bg-[#2A2228] text-[11px] font-medium cursor-pointer inline-flex items-center gap-1"
              >
                <span>View Movements</span>
                <ArrowRight class="w-3 h-3" />
              </button>
            </div>

            <div v-else>
              <button
                @click="handleTriggerRegister('Activity Design')"
                type="button"
                class="px-2.5 py-1 rounded-md bg-forest-800 hover:bg-forest-900 text-white text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 shadow-2xs"
              >
                <Plus class="w-3 h-3" />
                <span>Register AD Tracking Slip</span>
              </button>
            </div>
          </div>

          <div v-if="documentSummary.adDoc" class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px]">
            <div class="p-2 rounded bg-zinc-50 dark:bg-[#251D23]">
              <span class="text-[10px] text-zinc-400 block">Current Physical Location</span>
              <span class="font-semibold text-zinc-800 dark:text-[#F5EDF1] flex items-center gap-1 mt-0.5">
                <MapPin class="w-3 h-3 text-forest-700" />
                {{ documentSummary.adDoc.currentOfficeName }}
              </span>
            </div>
            <div class="p-2 rounded bg-zinc-50 dark:bg-[#251D23]">
              <span class="text-[10px] text-zinc-400 block">Workflow Folder</span>
              <span class="font-semibold text-zinc-800 dark:text-[#F5EDF1] flex items-center gap-1 mt-0.5">
                <FolderOpen class="w-3 h-3 text-forest-700" />
                {{ documentSummary.adDoc.workflowFolderName }}
              </span>
            </div>
            <div class="p-2 rounded bg-zinc-50 dark:bg-[#251D23]">
              <span class="text-[10px] text-zinc-400 block">Processing Status</span>
              <span class="font-semibold text-zinc-800 dark:text-[#F5EDF1] capitalize mt-0.5 block">
                {{ documentSummary.adDoc.status.replace(/_/g, ' ') }}
              </span>
            </div>
          </div>
          <div v-else class="text-[11px] text-zinc-500 dark:text-[#BCAEBA]">
            No physical paper tracking slip is registered for this Activity Design master record yet.
          </div>
        </div>

        <!-- SECTION 3: Official References & Registered Procurement Lifecycle -->
        <div class="space-y-3 pt-2 border-t border-zinc-200 dark:border-[#3D2D38]">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] flex items-center gap-1.5 uppercase tracking-wider">
              <Layers class="w-3.5 h-3.5 text-forest-700 dark:text-forest-400" />
              <span>Procurement & Supporting Paper Documents Lifecycle</span>
            </span>
            <span class="text-[10px] text-zinc-400 dark:text-zinc-500">
              {{ documentSummary.allLinkedDocs.length }} registered physical document{{ documentSummary.allLinkedDocs.length === 1 ? '' : 's' }}
            </span>
          </div>

          <!-- Cards for PPMP, PR, and PO Reference vs Trackable Document -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            
            <!-- 1. PPMP Status Card -->
            <div class="p-3 rounded-xl border border-zinc-200 dark:border-[#3D2D38] bg-zinc-50/70 dark:bg-[#251D23] flex flex-col justify-between space-y-2">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400">1. PPMP</span>
                  <button
                    v-if="record.ppmpNumber"
                    @click="copyValue(record.ppmpNumber, 'ppmp')"
                    type="button"
                    class="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-[#DDD2D9] cursor-pointer"
                    title="Copy PPMP Number"
                  >
                    <component :is="copiedKey === 'ppmp' ? Check : Copy" class="w-3 h-3" :class="copiedKey === 'ppmp' ? 'text-emerald-600' : ''" />
                  </button>
                </div>
                <div class="font-mono text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] truncate">
                  {{ record.ppmpNumber || '— (No PPMP Ref)' }}
                </div>
              </div>

              <!-- Registered state -->
              <div v-if="documentSummary.ppmpDocs.length > 0" class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38] space-y-1">
                <div v-for="p in documentSummary.ppmpDocs" :key="p.id" class="flex items-center justify-between text-[11px]">
                  <span class="font-mono font-semibold text-zinc-800 dark:text-[#F5EDF1]">{{ p.trackingNumber }}</span>
                  <button
                    @click="emit('openDocument', p.id)"
                    class="text-[10px] text-forest-700 dark:text-forest-400 hover:underline cursor-pointer font-medium"
                  >
                    {{ p.currentOfficeName }}
                  </button>
                </div>
              </div>

              <!-- Unregistered Reference State -->
              <div v-else-if="record.ppmpNumber" class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38]">
                <span class="text-[10px] font-medium text-amber-700 dark:text-amber-400 block mb-1.5">
                  Ref Recorded — Document Not Registered
                </span>
                <button
                  @click="handleTriggerRegister('PPMP', record.ppmpNumber)"
                  type="button"
                  class="w-full py-1 px-2 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus class="w-3 h-3" />
                  <span>Register PPMP Document</span>
                </button>
              </div>

              <!-- Empty State -->
              <div v-else class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38]">
                <button
                  @click="handleTriggerRegister('PPMP')"
                  type="button"
                  class="w-full py-1 px-2 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#2A2228] text-[10px] font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus class="w-3 h-3" />
                  <span>Register PPMP</span>
                </button>
              </div>
            </div>

            <!-- 2. Purchase Request (PR) Status Card -->
            <div class="p-3 rounded-xl border border-zinc-200 dark:border-[#3D2D38] bg-zinc-50/70 dark:bg-[#251D23] flex flex-col justify-between space-y-2">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">2. Purchase Request</span>
                  <button
                    v-if="record.prNumber"
                    @click="copyValue(record.prNumber, 'pr')"
                    type="button"
                    class="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-[#DDD2D9] cursor-pointer"
                    title="Copy PR Number"
                  >
                    <component :is="copiedKey === 'pr' ? Check : Copy" class="w-3 h-3" :class="copiedKey === 'pr' ? 'text-emerald-600' : ''" />
                  </button>
                </div>
                <div class="font-mono text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] truncate">
                  {{ record.prNumber || '— (No PR Ref)' }}
                </div>
              </div>

              <!-- Registered PRs -->
              <div v-if="documentSummary.prDocs.length > 0" class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38] space-y-1.5">
                <div v-for="pr in documentSummary.prDocs" :key="pr.id" class="flex items-center justify-between text-[11px]">
                  <span class="font-mono font-semibold text-zinc-800 dark:text-[#F5EDF1]">{{ pr.trackingNumber }}</span>
                  <button
                    @click="emit('openDocument', pr.id)"
                    class="text-[10px] text-forest-700 dark:text-forest-400 hover:underline cursor-pointer font-medium"
                  >
                    {{ pr.currentOfficeName }}
                  </button>
                </div>
                <button
                  @click="handleTriggerRegister('Purchase Request')"
                  type="button"
                  class="text-[10px] text-amber-700 dark:text-amber-400 hover:underline cursor-pointer inline-flex items-center gap-1 font-semibold mt-1"
                >
                  <Plus class="w-2.5 h-2.5" />
                  <span>Add Another PR</span>
                </button>
              </div>

              <!-- Unregistered Reference State -->
              <div v-else-if="record.prNumber" class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38]">
                <span class="text-[10px] font-medium text-amber-700 dark:text-amber-400 block mb-1.5">
                  Ref Recorded — Document Not Registered
                </span>
                <button
                  @click="handleTriggerRegister('Purchase Request', record.prNumber)"
                  type="button"
                  class="w-full py-1 px-2 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus class="w-3 h-3" />
                  <span>Register PR Document</span>
                </button>
              </div>

              <!-- Empty State -->
              <div v-else class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38]">
                <button
                  @click="handleTriggerRegister('Purchase Request')"
                  type="button"
                  class="w-full py-1 px-2 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#2A2228] text-[10px] font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus class="w-3 h-3" />
                  <span>Register PR</span>
                </button>
              </div>
            </div>

            <!-- 3. Purchase Order (PO) Status Card -->
            <div class="p-3 rounded-xl border border-zinc-200 dark:border-[#3D2D38] bg-zinc-50/70 dark:bg-[#251D23] flex flex-col justify-between space-y-2">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">3. Purchase Order</span>
                  <button
                    v-if="record.poNumber"
                    @click="copyValue(record.poNumber, 'po')"
                    type="button"
                    class="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-[#DDD2D9] cursor-pointer"
                    title="Copy PO Number"
                  >
                    <component :is="copiedKey === 'po' ? Check : Copy" class="w-3 h-3" :class="copiedKey === 'po' ? 'text-emerald-600' : ''" />
                  </button>
                </div>
                <div class="font-mono text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] truncate">
                  {{ record.poNumber || '— (No PO Ref)' }}
                </div>
              </div>

              <!-- Registered POs -->
              <div v-if="documentSummary.poDocs.length > 0" class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38] space-y-1.5">
                <div v-for="po in documentSummary.poDocs" :key="po.id" class="flex items-center justify-between text-[11px]">
                  <span class="font-mono font-semibold text-zinc-800 dark:text-[#F5EDF1]">{{ po.trackingNumber }}</span>
                  <button
                    @click="emit('openDocument', po.id)"
                    class="text-[10px] text-forest-700 dark:text-forest-400 hover:underline cursor-pointer font-medium"
                  >
                    {{ po.currentOfficeName }}
                  </button>
                </div>
                <button
                  @click="handleTriggerRegister('Purchase Order')"
                  type="button"
                  class="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1 font-semibold mt-1"
                >
                  <Plus class="w-2.5 h-2.5" />
                  <span>Add Another PO</span>
                </button>
              </div>

              <!-- Unregistered Reference State -->
              <div v-else-if="record.poNumber" class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38]">
                <span class="text-[10px] font-medium text-amber-700 dark:text-amber-400 block mb-1.5">
                  Ref Recorded — Document Not Registered
                </span>
                <button
                  @click="handleTriggerRegister('Purchase Order', record.poNumber)"
                  type="button"
                  class="w-full py-1 px-2 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus class="w-3 h-3" />
                  <span>Register PO Document</span>
                </button>
              </div>

              <!-- Empty State -->
              <div v-else class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38]">
                <button
                  @click="handleTriggerRegister('Purchase Order')"
                  type="button"
                  class="w-full py-1 px-2 rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#2A2228] text-[10px] font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus class="w-3 h-3" />
                  <span>Register PO</span>
                </button>
              </div>
            </div>
          </div>

          <!-- All Registered Supporting & Payroll Documents List Table -->
          <div v-if="documentSummary.allLinkedDocs.length > 0" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#1E171C]">
            <div class="px-3.5 py-2.5 bg-zinc-50 dark:bg-[#251D23] border-b border-zinc-200 dark:border-[#3D2D38] flex items-center justify-between">
              <span class="font-bold text-zinc-800 dark:text-[#DDD2D9] text-[11px] uppercase tracking-wider">
                Independent Physical Document Routing Registry
              </span>
              <div class="flex items-center gap-2">
                <button
                  @click="handleTriggerRegister('Payroll / Honorarium')"
                  type="button"
                  class="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus class="w-2.5 h-2.5" />
                  <span>Register Payroll Package</span>
                </button>

                <button
                  @click="handleTriggerRegister('Other')"
                  type="button"
                  class="px-2 py-0.5 rounded border border-zinc-300 dark:border-[#4D3A47] text-zinc-700 dark:text-[#DDD2D9] hover:bg-zinc-100 dark:hover:bg-[#2A2228] text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus class="w-2.5 h-2.5" />
                  <span>Add Supporting Doc</span>
                </button>
              </div>
            </div>

            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50/50 dark:bg-[#251D23]/50 border-b border-zinc-200 dark:border-[#3D2D38] text-zinc-500 dark:text-[#BCAEBA] text-[11px]">
                <tr>
                  <th class="py-2 px-3">Type</th>
                  <th class="py-2 px-3">Tracking #</th>
                  <th class="py-2 px-3">Title / Reference</th>
                  <th class="py-2 px-3">Current Physical Office</th>
                  <th class="py-2 px-3 text-center">Status</th>
                  <th class="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-[#3D2D38]/60">
                <tr
                  v-for="doc in documentSummary.allLinkedDocs"
                  :key="doc.id"
                  class="hover:bg-zinc-50/80 dark:hover:bg-[#251D23]/70 transition-colors"
                >
                  <td class="py-2 px-3">
                    <span :class="['inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border', getDocTypeBadgeClass(doc.documentType)]">
                      {{ doc.documentType }}
                    </span>
                  </td>
                  <td class="py-2 px-3 font-mono text-[11px] font-semibold text-zinc-900 dark:text-[#F5EDF1]">
                    {{ doc.trackingNumber }}
                  </td>
                  <td class="py-2 px-3">
                    <div class="font-medium text-zinc-900 dark:text-[#F5EDF1] truncate max-w-xs" :title="doc.title">
                      {{ doc.title }}
                    </div>
                    <div v-if="doc.referenceNumber" class="text-[10px] text-zinc-400 font-mono">
                      Ref: {{ doc.referenceNumber }}
                    </div>
                  </td>
                  <td class="py-2 px-3 text-zinc-700 dark:text-[#DDD2D9]">
                    <span class="inline-flex items-center gap-1">
                      <MapPin class="w-3 h-3 text-forest-700 dark:text-forest-400" />
                      {{ doc.currentOfficeName }}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-center">
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
                      :class="doc.status === 'completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : (doc.status === 'in_transit' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300' : 'bg-zinc-100 text-zinc-700 dark:bg-[#251D23] dark:text-[#DDD2D9]')">
                      {{ doc.status.replace(/_/g, ' ') }}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-right">
                    <button
                      @click="emit('openDocument', doc.id)"
                      type="button"
                      class="px-2 py-1 rounded text-[11px] font-medium text-forest-800 dark:text-forest-300 hover:bg-forest-50 dark:hover:bg-[#251D23] border border-forest-200 dark:border-forest-800 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>Track</span>
                      <ArrowRight class="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- SECTION 4: Budget Utilization Breakdown Section -->
        <div class="space-y-2 pt-2 border-t border-zinc-200 dark:border-[#3D2D38]">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] flex items-center gap-1.5 uppercase tracking-wider">
              <Coins class="w-3.5 h-3.5 text-forest-700 dark:text-forest-400" />
              <span>Budget Utilization Breakdown</span>
            </span>
            <span class="text-[10px] text-zinc-400 dark:text-zinc-500">
              {{ budgetEntries.length }} {{ budgetEntries.length === 1 ? 'entry' : 'entries' }}
            </span>
          </div>

          <!-- Loading state -->
          <div v-if="isLoadingBudgets" class="p-4 text-center text-zinc-400 text-xs">
            Loading budget utilization details...
          </div>

          <!-- Items Table -->
          <div v-else-if="budgetEntries.length > 0" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#1E171C]">
            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50 dark:bg-[#251D23] border-b border-zinc-200 dark:border-[#3D2D38] text-zinc-500 dark:text-[#BCAEBA] font-medium text-[11px]">
                <tr>
                  <th class="py-2 px-3">#</th>
                  <th class="py-2 px-3">Budget Utilization Item</th>
                  <th class="py-2 px-3 text-right">Amount</th>
                  <th class="py-2 px-3">Supplier</th>
                  <th class="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-[#3D2D38]/60">
                <tr v-for="(entry, idx) in budgetEntries" :key="entry.id || idx" class="hover:bg-zinc-50/60 dark:hover:bg-[#251D23]/60">
                  <td class="py-2 px-3 text-zinc-400 font-mono text-[11px] w-8">{{ idx + 1 }}</td>
                  <td class="py-2 px-3 text-zinc-800 dark:text-[#F5EDF1] font-medium">{{ entry.name }}</td>
                  <td class="py-2 px-3 text-right font-mono text-zinc-900 dark:text-[#F5EDF1] font-semibold">{{ formatCurrency(entry.amount) }}</td>
                  <td class="py-2 px-3 text-zinc-600 dark:text-[#BCAEBA]">
                    <span v-if="entry.supplier" class="font-medium text-zinc-800 dark:text-[#F5EDF1]">{{ entry.supplier }}</span>
                    <span v-else class="text-zinc-400 dark:text-zinc-500">—</span>
                  </td>
                  <td class="py-2 px-3 text-center">
                    <span
                      :class="[
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1',
                        entry.status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                      ]"
                    >
                      <span class="w-1.5 h-1.5 rounded-full" :class="entry.status === 'Paid' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
                      {{ entry.status || 'Unpaid' }}
                    </span>
                  </td>
                </tr>
              </tbody>
              <tfoot class="bg-forest-50/40 dark:bg-forest-950/20 border-t border-forest-100 dark:border-forest-900 font-semibold text-xs">
                <tr>
                  <td colspan="2" class="py-2.5 px-3 text-forest-900 dark:text-forest-200">Total Budget Utilization</td>
                  <td class="py-2.5 px-3 text-right font-mono text-forest-950 dark:text-forest-100 font-bold">
                    {{ formatCurrency(record.adAmount) }}
                  </td>
                  <td colspan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div v-else class="p-3 rounded-lg bg-zinc-50 dark:bg-[#251D23] border border-dashed border-zinc-200 dark:border-[#3D2D38] text-center text-zinc-400 dark:text-zinc-500 text-xs">
            No itemized budget utilization entries recorded for this entry.
          </div>
        </div>

        <!-- SECTION 5: Attached Scans & Documents Section -->
        <div class="space-y-2 pt-2 border-t border-zinc-200 dark:border-[#3D2D38]">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] flex items-center gap-1.5 uppercase tracking-wider">
              <Paperclip class="w-3.5 h-3.5 text-forest-700 dark:text-forest-400" />
              <span>Attached Physical Scans & Paperwork</span>
            </span>
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-zinc-400 dark:text-zinc-500">
                {{ attachmentsList.length }} {{ attachmentsList.length === 1 ? 'file' : 'files' }}
              </span>
              <button
                @click="emit('scan', record)"
                type="button"
                class="px-2.5 py-1 rounded-md bg-[#FFF0F5] hover:bg-[#FCE7F0] dark:bg-pink-950/60 text-[#D9467B] dark:text-pink-300 border border-[#F3C4D7] dark:border-pink-800 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
              >
                <Scan class="w-3 h-3" />
                <span>Scan Document</span>
              </button>
            </div>
          </div>

          <div v-if="isLoadingAttachments" class="p-3 text-center text-zinc-400 text-xs">
            Loading attachments...
          </div>
          <div v-else-if="attachmentsList.length > 0" class="space-y-1.5">
            <div
              v-for="att in attachmentsList"
              :key="att.id"
              class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 dark:bg-[#251D23] border border-zinc-200 dark:border-[#3D2D38] hover:bg-zinc-100/60 dark:hover:bg-[#2A2228] transition-colors group"
            >
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="w-7 h-7 rounded-md bg-white dark:bg-[#1E171C] border border-zinc-200 dark:border-[#3D2D38] flex items-center justify-center text-forest-700 dark:text-forest-400 shrink-0">
                  <FileText class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="font-semibold text-zinc-900 dark:text-[#F5EDF1] truncate text-xs" :title="att.fileName">
                      {{ att.fileName }}
                    </span>
                    <span class="text-[10px] text-zinc-400 font-mono shrink-0">
                      ({{ formatBytes(att.fileSize) }})
                    </span>
                  </div>
                  <p v-if="att.notes" class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] truncate mt-0.5">
                    {{ att.notes }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-1 shrink-0 ml-2">
                <button
                  @click="handleOpenAttachment(att)"
                  type="button"
                  class="px-2 py-1 rounded text-[11px] font-medium text-forest-800 dark:text-forest-300 hover:bg-forest-100/70 border border-forest-200 dark:border-forest-800 inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ExternalLink class="w-3 h-3" />
                  <span>Open</span>
                </button>
                <button
                  @click="handleDeleteAttachment(att)"
                  type="button"
                  class="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="p-3 rounded-lg bg-zinc-50 dark:bg-[#251D23] border border-dashed border-zinc-200 dark:border-[#3D2D38] text-center text-zinc-400 dark:text-zinc-500 text-xs">
            No physical scans attached to this Activity Design yet. Click <strong>Scan Document</strong> to attach paper scans.
          </div>
        </div>

        <!-- Audit & Sync Metadata -->
        <div class="pt-2 text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center justify-between border-t border-zinc-200 dark:border-[#3D2D38]">
          <span>Created: {{ formatDate(record.createdAt) }}</span>
          <span class="flex items-center gap-1">
            <ShieldCheck class="w-3 h-3 text-forest-700 dark:text-forest-400" />
            Storage: FlowDesk Local Database
          </span>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="px-5 py-3 border-t border-zinc-200 dark:border-[#3D2D38] bg-zinc-50 dark:bg-[#251D23] flex items-center justify-between shrink-0">
        <button
          @click="emit('delete', record)"
          type="button"
          class="px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Delete Record</span>
        </button>

        <div class="flex items-center gap-2">
          <button
            @click="emit('scan', record)"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 dark:bg-pink-950/50 text-[#D9467B] dark:text-pink-300 border border-[#F3C4D7] dark:border-pink-800 text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Scan class="w-3.5 h-3.5" />
            <span>Scan Document</span>
          </button>

          <button
            @click="emit('close')"
            type="button"
            class="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-[#4D3A47] text-zinc-700 dark:text-[#DDD2D9] hover:bg-zinc-100 dark:hover:bg-[#2A2228] text-xs font-medium transition-colors cursor-pointer"
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
