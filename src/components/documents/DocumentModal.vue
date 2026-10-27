<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import BaseButton from '../common/BaseButton.vue'
import { DOCUMENT_TYPES, DOCUMENT_STATUSES, DOCUMENT_PRIORITIES } from '../../db/database'
import { getOffices, generateCodeFromName } from '../../services/officeService'
import { getFinanceRecords, getBudgetUtilizationsForRecord, formatCurrency } from '../../services/financeService'
import { getWorkflowFolders } from '../../services/workflowService'
import { getDocumentsForFinanceRecord } from '../../services/documentService'
import {
  X,
  FileText,
  AlertCircle,
  Landmark,
  Folder,
  Layers,
  Calendar,
  Building2,
  Coins,
  Package,
  ShoppingCart,
  Receipt,
  FileSpreadsheet,
  Send,
  Sparkles,
  Info,
  CheckCircle2
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  documentToEdit: {
    type: Object,
    default: null
  },
  initialValues: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const isEdit = computed(() => !!props.documentToEdit)

// Form fields - Section A: Document Information
const title = ref('')
const documentType = ref('Memo')
const isCustomType = ref(false)
const customType = ref('')
const referenceNumber = ref('')
const documentDate = ref('')
const description = ref('')

// Form fields - Section B: Relationships
const relatedFinanceRecordId = ref('')
const relatedPpmpDocumentId = ref('')
const relatedPrDocumentId = ref('')
const relatedBudgetUtilizationId = ref('')

// Form fields - Section C: Routing & Physical Custody
const originatingOfficeId = ref('')
const currentOfficeId = ref('')
const workflowFolderId = ref('')
const status = ref('registered')
const priority = ref('Routine')
const dueDate = ref('')
const registeredBy = ref('Desk Officer')
const initialNotes = ref('')

// Form fields - Section D: Document-Specific Attributes
const documentAmount = ref('')
const supplierName = ref('')
const eventDate = ref('')
const recipientOfficeId = ref('')
const procurementPurpose = ref('')
const customFields = ref({})

// UI & Data State
const errors = ref({})
const isSubmitting = ref(false)
const officesList = ref([])
const financeRecordsList = ref([])
const workflowFoldersList = ref([])
const availablePpmpDocs = ref([])
const availablePrDocs = ref([])
const availableBudgetEntries = ref([])
const isLoadingRelations = ref(false)

const loadDependencies = async () => {
  try {
    const [offices, finance, folders] = await Promise.all([
      getOffices(),
      getFinanceRecords(),
      getWorkflowFolders()
    ])
    officesList.value = offices || []
    financeRecordsList.value = finance || []
    workflowFoldersList.value = folders || []
  } catch (err) {
    console.error('Failed to load dependencies in DocumentModal:', err)
  }
}

onMounted(() => {
  loadDependencies()
})

// Selected Parent Activity Design computed
const selectedParentAd = computed(() => {
  if (!relatedFinanceRecordId.value) return null
  return financeRecordsList.value.find((f) => f.id === Number(relatedFinanceRecordId.value)) || null
})

// Load child relations (PPMPs, PRs, budget utilizations) whenever relatedFinanceRecordId changes
watch(
  relatedFinanceRecordId,
  async (newAdId) => {
    if (!newAdId) {
      availablePpmpDocs.value = []
      availablePrDocs.value = []
      availableBudgetEntries.value = []
      relatedPpmpDocumentId.value = ''
      relatedPrDocumentId.value = ''
      relatedBudgetUtilizationId.value = ''
      return
    }

    isLoadingRelations.value = true
    try {
      const numId = Number(newAdId)
      const [adDocs, budgets] = await Promise.all([
        getDocumentsForFinanceRecord(numId),
        getBudgetUtilizationsForRecord(numId)
      ])

      availablePpmpDocs.value = (adDocs || []).filter((d) => d.documentType === 'PPMP')
      availablePrDocs.value = (adDocs || []).filter((d) => d.documentType === 'Purchase Request')
      availableBudgetEntries.value = budgets || []

      // If document title is empty, suggest sensible title based on AD
      if (!title.value.trim() && selectedParentAd.value) {
        const adName = selectedParentAd.value.activityDesign || selectedParentAd.value.columnK || 'Activity'
        if (documentType.value === 'PPMP') {
          title.value = `PPMP: ${adName}`
        } else if (documentType.value === 'Purchase Request') {
          title.value = `PR for ${adName}`
        } else if (documentType.value === 'Purchase Order') {
          title.value = `PO for ${adName}`
        } else if (documentType.value === 'Payroll / Honorarium') {
          title.value = `Payroll for ${adName}`
        } else if (documentType.value === 'Activity Design') {
          title.value = adName
        }
      }

      // If reference number is empty and AD has a recorded reference, offer default
      if (!referenceNumber.value.trim() && selectedParentAd.value) {
        if (documentType.value === 'PPMP' && selectedParentAd.value.ppmpNumber) {
          referenceNumber.value = selectedParentAd.value.ppmpNumber
        } else if (documentType.value === 'Purchase Request' && selectedParentAd.value.prNumber) {
          referenceNumber.value = selectedParentAd.value.prNumber
        } else if (documentType.value === 'Purchase Order' && selectedParentAd.value.poNumber) {
          referenceNumber.value = selectedParentAd.value.poNumber
        }
      }
    } catch (err) {
      console.warn('Failed to load related AD resources:', err)
    } finally {
      isLoadingRelations.value = false
    }
  }
)

// When a Budget Utilization item is selected for Payroll, optionally pre-fill amount and purpose
const handleBudgetUtilizationChange = () => {
  if (!relatedBudgetUtilizationId.value) return
  const item = availableBudgetEntries.value.find((b) => b.id === Number(relatedBudgetUtilizationId.value))
  if (item) {
    if (!documentAmount.value || Number(documentAmount.value) === 0) {
      documentAmount.value = item.amount ? String(item.amount) : ''
    }
    if (!description.value.trim()) {
      description.value = `Payment for ${item.name}${item.supplier ? ` (Supplier: ${item.supplier})` : ''}`
    }
    if (!supplierName.value.trim() && item.supplier) {
      supplierName.value = item.supplier
    }
  }
}

// Reset or load initial values on modal open
watch(
  () => props.isOpen,
  async (val) => {
    if (val) {
      await loadDependencies()
      errors.value = {}

      if (props.documentToEdit) {
        // Edit mode
        const d = props.documentToEdit
        title.value = d.title || ''
        if (DOCUMENT_TYPES.includes(d.documentType)) {
          documentType.value = d.documentType
          isCustomType.value = false
          customType.value = ''
        } else {
          documentType.value = 'Other'
          isCustomType.value = true
          customType.value = d.documentType || ''
        }
        referenceNumber.value = d.referenceNumber || ''
        documentDate.value = d.documentDate || d.dateRegistered || ''
        description.value = d.description || ''
        originatingOfficeId.value = d.originatingOfficeId || ''
        currentOfficeId.value = d.currentOfficeId || ''
        workflowFolderId.value = d.workflowFolderId ? String(d.workflowFolderId) : ''
        status.value = d.status || 'registered'
        priority.value = d.priority || 'Routine'
        dueDate.value = d.dueDate || ''
        relatedFinanceRecordId.value = d.relatedFinanceRecordId ? String(d.relatedFinanceRecordId) : ''
        relatedPpmpDocumentId.value = d.relatedPpmpDocumentId ? String(d.relatedPpmpDocumentId) : ''
        relatedPrDocumentId.value = d.relatedPrDocumentId ? String(d.relatedPrDocumentId) : ''
        relatedBudgetUtilizationId.value = d.relatedBudgetUtilizationId ? String(d.relatedBudgetUtilizationId) : ''

        documentAmount.value = d.documentAmount !== undefined && d.documentAmount !== null ? String(d.documentAmount) : ''
        supplierName.value = d.supplierName || ''
        eventDate.value = d.eventDate || ''
        recipientOfficeId.value = d.recipientOfficeId ? String(d.recipientOfficeId) : ''
        registeredBy.value = ''
        initialNotes.value = ''
      } else {
        // New document registration mode
        const init = props.initialValues || {}
        title.value = init.title || ''
        documentType.value = init.documentType && DOCUMENT_TYPES.includes(init.documentType) ? init.documentType : 'Memo'
        isCustomType.value = false
        customType.value = ''
        referenceNumber.value = init.referenceNumber || ''
        documentDate.value = init.documentDate || new Date().toISOString().split('T')[0]
        description.value = init.description || ''

        originatingOfficeId.value = init.originatingOfficeId || (officesList.value.length > 0 ? officesList.value[0].id : '')
        currentOfficeId.value = originatingOfficeId.value

        const defFolder = workflowFoldersList.value.find((f) => f.isDefaultRegistration) || workflowFoldersList.value[0]
        workflowFolderId.value = defFolder ? String(defFolder.id) : ''

        status.value = 'registered'
        priority.value = 'Routine'
        dueDate.value = init.dueDate || ''
        relatedFinanceRecordId.value = init.relatedFinanceRecordId ? String(init.relatedFinanceRecordId) : ''
        relatedPpmpDocumentId.value = init.relatedPpmpDocumentId ? String(init.relatedPpmpDocumentId) : ''
        relatedPrDocumentId.value = init.relatedPrDocumentId ? String(init.relatedPrDocumentId) : ''
        relatedBudgetUtilizationId.value = init.relatedBudgetUtilizationId ? String(init.relatedBudgetUtilizationId) : ''

        documentAmount.value = init.documentAmount ? String(init.documentAmount) : ''
        supplierName.value = init.supplierName || ''
        eventDate.value = init.eventDate || ''
        recipientOfficeId.value = init.recipientOfficeId ? String(init.recipientOfficeId) : ''
        registeredBy.value = 'Desk Officer'
        initialNotes.value = ''
      }
    }
  }
)

watch(originatingOfficeId, (newVal) => {
  if (!isEdit.value && !currentOfficeId.value) {
    currentOfficeId.value = newVal
  }
})

const handleTypeChange = (e) => {
  const val = e.target.value
  isCustomType.value = val === 'Other'
}

// Validation logic
const validate = () => {
  errors.value = {}
  if (!title.value.trim()) {
    errors.value.title = 'Document title & subject is required'
  }
  if (!originatingOfficeId.value) {
    errors.value.originatingOfficeId = 'Originating office is required'
  }

  // Cross-relationship validation
  if (documentType.value === 'Purchase Order' && relatedPrDocumentId.value && relatedFinanceRecordId.value) {
    const prDoc = availablePrDocs.value.find((p) => p.id === Number(relatedPrDocumentId.value))
    if (prDoc && Number(prDoc.relatedFinanceRecordId) !== Number(relatedFinanceRecordId.value)) {
      errors.value.relatedPrDocumentId = 'The selected PR belongs to a different Activity Design.'
    }
  }

  if (documentType.value === 'Payroll / Honorarium' && relatedBudgetUtilizationId.value && relatedFinanceRecordId.value) {
    const budgetItem = availableBudgetEntries.value.find((b) => b.id === Number(relatedBudgetUtilizationId.value))
    if (budgetItem && Number(budgetItem.financeRecordId) !== Number(relatedFinanceRecordId.value)) {
      errors.value.relatedBudgetUtilizationId = 'The selected budget item belongs to a different Activity Design.'
    }
  }

  return Object.keys(errors.value).length === 0
}

const handleSubmit = async () => {
  if (!validate()) return

  isSubmitting.value = true
  try {
    const finalDocType = isCustomType.value && customType.value.trim()
      ? customType.value.trim()
      : documentType.value

    const payload = {
      title: title.value.trim(),
      documentType: finalDocType,
      referenceNumber: referenceNumber.value.trim(),
      documentDate: documentDate.value || null,
      description: description.value.trim(),
      originatingOfficeId: Number(originatingOfficeId.value),
      currentOfficeId: Number(currentOfficeId.value || originatingOfficeId.value),
      workflowFolderId: workflowFolderId.value ? Number(workflowFolderId.value) : null,
      status: status.value,
      priority: priority.value,
      dueDate: dueDate.value || null,
      relatedFinanceRecordId: relatedFinanceRecordId.value ? Number(relatedFinanceRecordId.value) : null,
      relatedPpmpDocumentId: relatedPpmpDocumentId.value ? Number(relatedPpmpDocumentId.value) : null,
      relatedPrDocumentId: relatedPrDocumentId.value ? Number(relatedPrDocumentId.value) : null,
      relatedBudgetUtilizationId: relatedBudgetUtilizationId.value ? Number(relatedBudgetUtilizationId.value) : null,
      documentAmount: documentAmount.value ? Number(documentAmount.value) : 0,
      supplierName: supplierName.value.trim(),
      eventDate: eventDate.value || null,
      recipientOfficeId: recipientOfficeId.value ? Number(recipientOfficeId.value) : null,
      registeredBy: registeredBy.value.trim(),
      initialNotes: initialNotes.value.trim()
    }

    emit('saved', {
      isEdit: isEdit.value,
      id: props.documentToEdit?.id,
      data: payload
    })
  } catch (err) {
    console.error('Error submitting document form:', err)
  } finally {
    isSubmitting.value = false
  }
}

const getPriorityChipClass = (p) => {
  if (priority.value === p) {
    if (p === 'Urgent') return 'bg-rose-700 text-white border-rose-700 font-semibold shadow-2xs'
    if (p === 'High') return 'bg-amber-600 text-white border-amber-600 font-semibold shadow-2xs'
    if (p === 'Medium') return 'bg-sky-700 text-white border-sky-700 font-semibold shadow-2xs'
    return 'bg-forest-800 text-white border-forest-800 font-semibold shadow-2xs'
  }
  return 'bg-white dark:bg-[#201A1E] text-zinc-700 dark:text-[#DDD2D9] border-zinc-200 dark:border-[#3D2D38] hover:bg-zinc-50 dark:hover:bg-[#2A2228]'
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-xs overflow-y-auto"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="w-full max-w-3xl bg-white dark:bg-[#1E171C] rounded-2xl shadow-2xl border border-zinc-200 dark:border-[#3D2D38] overflow-hidden text-left my-6 flex flex-col max-h-[92vh] animate-in fade-in duration-150"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-zinc-200 dark:border-[#3D2D38] flex items-center justify-between bg-zinc-50/80 dark:bg-[#251D23] shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-forest-100 dark:bg-forest-950/80 text-forest-800 dark:text-forest-300 flex items-center justify-center shrink-0 border border-forest-200 dark:border-forest-900">
            <FileText class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base font-bold text-zinc-900 dark:text-[#F5EDF1] leading-tight">
                {{ isEdit ? 'Edit Document Details' : 'Register New Paper Document' }}
              </h3>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-forest-50 dark:bg-forest-950/60 text-forest-800 dark:text-forest-300 border border-forest-200/60 dark:border-forest-800">
                {{ documentType }}
              </span>
            </div>
            <p class="text-xs text-zinc-500 dark:text-[#BCAEBA] mt-0.5">
              {{ isEdit ? 'Update metadata while preserving movement audit history' : 'Record physical routing slip and link to parent Activity Design' }}
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-[#DDD2D9] hover:bg-zinc-100 dark:hover:bg-[#2A2228] transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Form Body (Scrollable) -->
      <form @submit.prevent="handleSubmit" class="p-5 overflow-y-auto space-y-5 text-xs flex-1">
        
        <!-- SECTION A: Document Information -->
        <div class="p-4 rounded-xl bg-zinc-50/70 dark:bg-[#251D23]/60 border border-zinc-200 dark:border-[#3D2D38] space-y-3.5">
          <div class="flex items-center gap-2 text-zinc-900 dark:text-[#F5EDF1] font-bold text-xs uppercase tracking-wider pb-2 border-b border-zinc-200/80 dark:border-[#3D2D38]">
            <FileText class="w-3.5 h-3.5 text-forest-700 dark:text-forest-400" />
            <span>Section A — Document Information</span>
          </div>

          <!-- Document Title & Document Type (Side-by-Side) -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <!-- Document Title & Subject (Required) -->
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Document Title & Subject <span class="text-rose-500">*</span>
              </label>
              <input
                v-model="title"
                type="text"
                placeholder="e.g. Purchase Request for Youth Summit Training Materials"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border rounded-lg text-zinc-800 dark:text-[#F5EDF1] placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs font-medium"
                :class="errors.title ? 'border-rose-400 bg-rose-50/20' : 'border-zinc-300 dark:border-[#4D3A47]'"
              />
              <p v-if="errors.title" class="text-rose-600 dark:text-rose-400 text-[11px] mt-1 flex items-center gap-1 font-medium">
                <AlertCircle class="w-3 h-3" />
                {{ errors.title }}
              </p>
            </div>

            <!-- Document Type & Custom Type -->
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Document Type <span class="text-rose-500">*</span>
              </label>
              <select
                v-model="documentType"
                @change="handleTypeChange"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer font-medium"
              >
                <option v-for="t in DOCUMENT_TYPES" :key="t" :value="t">
                  {{ t }}
                </option>
              </select>

              <input
                v-if="isCustomType"
                v-model="customType"
                type="text"
                placeholder="Specify custom document type..."
                class="w-full mt-2 px-3 py-1.5 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>

          <!-- 2-Col: Document Date & Description -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Document Date
              </label>
              <input
                v-model="documentDate"
                type="date"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>

            <div class="sm:col-span-2">
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Description & Key Routing Instructions
              </label>
              <input
                v-model="description"
                type="text"
                placeholder="Scope, particulars, or special compliance instructions..."
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>
        </div>

        <!-- SECTION B: Relationships & Activity Design Lifecycle Link -->
        <div class="p-4 rounded-xl bg-forest-50/50 dark:bg-forest-950/20 border border-forest-200 dark:border-forest-900 space-y-3.5">
          <div class="flex items-center justify-between pb-2 border-b border-forest-200/70 dark:border-forest-900">
            <div class="flex items-center gap-2 text-forest-950 dark:text-forest-200 font-bold text-xs uppercase tracking-wider">
              <Landmark class="w-3.5 h-3.5 text-forest-700 dark:text-forest-400" />
              <span>Section B — Relationships (Activity Design Lifecycle)</span>
            </div>
            <span class="text-[10px] text-forest-700 dark:text-forest-400 font-medium">
              Optional for standalone administrative documents
            </span>
          </div>

          <!-- Parent Activity Design Selector -->
          <div>
            <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1 flex items-center justify-between">
              <span>Linked Master Activity Design (AD)</span>
              <span v-if="relatedFinanceRecordId" class="text-[10px] text-forest-700 dark:text-forest-300 font-normal">
                Linked to Finance Record #{{ relatedFinanceRecordId }}
              </span>
            </label>
            <select
              v-model="relatedFinanceRecordId"
              class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer font-medium"
            >
              <option value="">— No linked Activity Design (Standalone Document) —</option>
              <option v-for="rec in financeRecordsList" :key="rec.id" :value="rec.id">
                #{{ rec.id }} | {{ rec.activityDesign || rec.supplierName }} ({{ rec.eventDate ? `Date: ${rec.eventDate} | ` : '' }}{{ formatCurrency(rec.adAmount) }})
              </option>
            </select>
            <p class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] mt-1">
              Select an existing Activity Design from Finance Monitoring. Multiple documents can link to the same AD.
            </p>
          </div>

          <!-- Parent AD Summary Preview Card -->
          <div
            v-if="selectedParentAd"
            class="p-3 rounded-lg bg-white dark:bg-[#1E171C] border border-forest-200 dark:border-forest-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <span class="text-[10px] font-bold text-forest-800 dark:text-forest-300 uppercase tracking-wider block">
                Selected Activity Design Summary
              </span>
              <h4 class="font-bold text-zinc-900 dark:text-[#F5EDF1] text-xs mt-0.5">
                {{ selectedParentAd.activityDesign || selectedParentAd.supplierName }}
              </h4>
              <div class="flex items-center gap-2 mt-1 text-[11px] text-zinc-600 dark:text-[#BCAEBA] flex-wrap">
                <span>Amount: <strong class="text-zinc-900 dark:text-[#F5EDF1] font-mono">{{ formatCurrency(selectedParentAd.adAmount) }}</strong></span>
                <span v-if="selectedParentAd.eventDate">• Event: {{ selectedParentAd.eventDate }}</span>
                <span v-if="selectedParentAd.adStatus">• AD Status: {{ selectedParentAd.adStatus }}</span>
              </div>
            </div>

            <div class="text-[10px] text-zinc-500 dark:text-[#BCAEBA] font-mono">
              <span v-if="selectedParentAd.prNumber">PR Ref: {{ selectedParentAd.prNumber }}<br /></span>
              <span v-if="selectedParentAd.poNumber">PO Ref: {{ selectedParentAd.poNumber }}<br /></span>
              <span v-if="selectedParentAd.ppmpNumber">PPMP Ref: {{ selectedParentAd.ppmpNumber }}</span>
            </div>
          </div>

          <!-- Dynamic Related Selectors based on Document Type & Selected AD -->
          <div v-if="relatedFinanceRecordId" class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-forest-100 dark:border-forest-900/60">
            <!-- PR: Related PPMP Selector -->
            <div v-if="documentType === 'Purchase Request' || documentType === 'Purchase Order'">
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Related PPMP Document
              </label>
              <select
                v-model="relatedPpmpDocumentId"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
              >
                <option value="">— No linked PPMP document —</option>
                <option v-for="p in availablePpmpDocs" :key="p.id" :value="p.id">
                  {{ p.trackingNumber }} | {{ p.referenceNumber || p.title }}
                </option>
              </select>
              <p v-if="availablePpmpDocs.length === 0" class="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                No registered PPMP document found for this AD.
              </p>
            </div>

            <!-- PO: Related PR Selector -->
            <div v-if="documentType === 'Purchase Order'">
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Related Purchase Request (PR)
              </label>
              <select
                v-model="relatedPrDocumentId"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
                :class="errors.relatedPrDocumentId ? 'border-rose-400 bg-rose-50/20' : ''"
              >
                <option value="">— No linked PR document —</option>
                <option v-for="pr in availablePrDocs" :key="pr.id" :value="pr.id">
                  {{ pr.trackingNumber }} | {{ pr.referenceNumber || pr.title }} ({{ formatCurrency(pr.documentAmount) }})
                </option>
              </select>
              <p v-if="errors.relatedPrDocumentId" class="text-rose-600 dark:text-rose-400 text-[10px] mt-0.5">
                {{ errors.relatedPrDocumentId }}
              </p>
              <p v-else-if="availablePrDocs.length === 0" class="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                No registered PR documents found for this AD.
              </p>
            </div>

            <!-- Payroll / Honorarium: Related Budget Utilization Item -->
            <div v-if="documentType === 'Payroll / Honorarium'" class="sm:col-span-2">
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1 flex items-center justify-between">
                <span>Linked Budget Utilization Entry</span>
                <span class="text-[10px] text-zinc-500 font-normal">Connects payment package to allocation item</span>
              </label>
              <select
                v-model="relatedBudgetUtilizationId"
                @change="handleBudgetUtilizationChange"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
                :class="errors.relatedBudgetUtilizationId ? 'border-rose-400 bg-rose-50/20' : ''"
              >
                <option value="">— No linked budget entry —</option>
                <option v-for="b in availableBudgetEntries" :key="b.id" :value="b.id">
                  #{{ b.id }} | {{ b.name }} ({{ formatCurrency(b.amount) }}) {{ b.supplier ? `• Supplier: ${b.supplier}` : '' }} • Status: {{ b.status }}
                </option>
              </select>
              <p v-if="errors.relatedBudgetUtilizationId" class="text-rose-600 dark:text-rose-400 text-[10px] mt-0.5">
                {{ errors.relatedBudgetUtilizationId }}
              </p>
              <p v-else-if="availableBudgetEntries.length === 0" class="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                No budget utilization entries recorded under this AD yet.
              </p>
            </div>
          </div>
        </div>

        <!-- SECTION C: Routing & Physical Custody Information -->
        <div class="p-4 rounded-xl bg-zinc-50/70 dark:bg-[#251D23]/60 border border-zinc-200 dark:border-[#3D2D38] space-y-3.5">
          <div class="flex items-center gap-2 text-zinc-900 dark:text-[#F5EDF1] font-bold text-xs uppercase tracking-wider pb-2 border-b border-zinc-200/80 dark:border-[#3D2D38]">
            <Building2 class="w-3.5 h-3.5 text-forest-700 dark:text-forest-400" />
            <span>Section C — Routing & Physical Custody Information</span>
          </div>

          <!-- 2-Col Grid: Originating Office & Initial Office -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Originating Office <span class="text-rose-500">*</span>
              </label>
              <select
                v-model="originatingOfficeId"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer font-medium"
                :class="errors.originatingOfficeId ? 'border-rose-400 bg-rose-50/20' : 'border-zinc-300 dark:border-[#4D3A47]'"
                :disabled="isEdit"
              >
                <option value="" disabled>Select originating office...</option>
                <option v-for="off in officesList" :key="off.id" :value="off.id">
                  [{{ off.code || generateCodeFromName(off.name) }}] {{ off.name }}
                </option>
              </select>
              <p v-if="errors.originatingOfficeId" class="text-rose-600 dark:text-rose-400 text-[11px] mt-1">
                {{ errors.originatingOfficeId }}
              </p>
            </div>

            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                {{ isEdit ? 'Current Confirmed Office' : 'Initial Physical Location' }}
              </label>
              <select
                v-model="currentOfficeId"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
                :disabled="isEdit"
              >
                <option v-for="off in officesList" :key="off.id" :value="off.id">
                  [{{ off.code || generateCodeFromName(off.name) }}] {{ off.name }}
                </option>
              </select>
              <p v-if="isEdit" class="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                To move this document, use the official Transfer action.
              </p>
            </div>
          </div>

          <!-- Priority Selector -->
          <div>
            <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1.5">
              Priority Level
            </label>
            <div class="flex items-center gap-2 flex-wrap">
              <button
                v-for="p in DOCUMENT_PRIORITIES"
                :key="p"
                type="button"
                @click="priority = p"
                :class="[
                  'px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all',
                  getPriorityChipClass(p)
                ]"
              >
                {{ p }}
              </button>
            </div>
          </div>

          <!-- 3-Col Grid: Routing Folder, Status & Due Date -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1 flex items-center gap-1">
                <Folder class="w-3 h-3 text-forest-700 dark:text-forest-400" />
                <span>Routing Folder</span>
              </label>
              <select
                v-model="workflowFolderId"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer font-medium"
              >
                <option v-for="f in workflowFoldersList" :key="f.id" :value="f.id">
                  {{ f.name }}
                </option>
              </select>
            </div>

            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Processing Status
              </label>
              <select
                v-model="status"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
              >
                <option v-for="st in DOCUMENT_STATUSES" :key="st.value" :value="st.value">
                  {{ st.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Target Due Date
              </label>
              <input
                v-model="dueDate"
                type="date"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>

          <!-- Initial Registration Logging Fields -->
          <div v-if="!isEdit" class="pt-2 border-t border-zinc-200/80 dark:border-[#3D2D38] grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-700 dark:text-[#BCAEBA] mb-1">
                Registered By Officer
              </label>
              <input
                v-model="registeredBy"
                type="text"
                placeholder="Desk Officer name..."
                class="w-full px-3 py-1.5 bg-zinc-50 dark:bg-[#201A1E] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>
        </div>

        <!-- SECTION D: Adaptive Document-Type Specific Details -->
        <div class="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 space-y-3.5">
          <div class="flex items-center justify-between pb-2 border-b border-amber-200/70 dark:border-amber-900/60">
            <div class="flex items-center gap-2 text-amber-950 dark:text-amber-200 font-bold text-xs uppercase tracking-wider">
              <Sparkles class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Section D — Document-Specific Details ({{ documentType }})</span>
            </div>
            <span class="text-[10px] text-amber-800 dark:text-amber-300">
              Adaptive fields for {{ documentType }}
            </span>
          </div>

          <!-- D.1: PPMP Specific Fields -->
          <div v-if="documentType === 'PPMP'" class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Estimated PPMP Budget Amount (₱)
              </label>
              <input
                v-model="documentAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] font-mono focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Procurement Planning Period / Calendar Year
              </label>
              <input
                v-model="eventDate"
                type="text"
                placeholder="e.g. FY 2026 Annual Procurement"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>

          <!-- D.2: Purchase Request (PR) Specific Fields -->
          <div v-else-if="documentType === 'Purchase Request'" class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Requested Amount (₱)
              </label>
              <input
                v-model="documentAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] font-mono focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Target Procurement / Delivery Date
              </label>
              <input
                v-model="eventDate"
                type="date"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>

          <!-- D.3: Purchase Order (PO) Specific Fields -->
          <div v-else-if="documentType === 'Purchase Order'" class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Awarded Supplier / Contractor
              </label>
              <input
                v-model="supplierName"
                type="text"
                placeholder="e.g. Davao Prime Logistics Inc."
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs font-medium"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                PO Order Amount (₱)
              </label>
              <input
                v-model="documentAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] font-mono focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                PO Award Date
              </label>
              <input
                v-model="eventDate"
                type="date"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>

          <!-- D.4: Payroll / Honorarium Specific Fields -->
          <div v-else-if="documentType === 'Payroll / Honorarium'" class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Total Payroll / Honorarium Amount (₱)
              </label>
              <input
                v-model="documentAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] font-mono focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs font-semibold"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Covered Period / Event Date
              </label>
              <input
                v-model="eventDate"
                type="text"
                placeholder="e.g. October 15-18, 2026 or Oct 2026"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Disbursing Officer / Payee Group
              </label>
              <input
                v-model="supplierName"
                type="text"
                placeholder="e.g. Youth Summit Facilitators"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>

          <!-- D.5: Activity Design Specific Fields -->
          <div v-else-if="documentType === 'Activity Design'" class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Total Approved AD Amount (₱)
              </label>
              <input
                v-model="documentAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] font-mono focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs font-semibold"
              />
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Scheduled Activity Date
              </label>
              <input
                v-model="eventDate"
                type="date"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>

          <!-- D.6: Memo / Letter / Transmittal / Other Specific Fields -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Recipient Office / Division (Optional)
              </label>
              <select
                v-model="recipientOfficeId"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs cursor-pointer"
              >
                <option value="">— Internal / Not specified —</option>
                <option v-for="off in officesList" :key="off.id" :value="off.id">
                  [{{ off.code || generateCodeFromName(off.name) }}] {{ off.name }}
                </option>
              </select>
            </div>
            <div>
              <label class="block font-semibold text-zinc-800 dark:text-[#DDD2D9] mb-1">
                Associated Financial Value / Cost (Optional)
              </label>
              <input
                v-model="documentAmount"
                type="number"
                step="0.01"
                placeholder="0.00"
                class="w-full px-3 py-2 bg-white dark:bg-[#1E171C] border border-zinc-300 dark:border-[#4D3A47] rounded-lg text-zinc-800 dark:text-[#F5EDF1] font-mono focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
              />
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="pt-3 border-t border-zinc-200 dark:border-[#3D2D38] flex items-center justify-between gap-2 shrink-0">
          <p class="text-[11px] text-zinc-400 dark:text-zinc-500">
            Fields marked with <span class="text-rose-500 font-bold">*</span> are required.
          </p>

          <div class="flex items-center gap-2">
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              @click="emit('close')"
            >
              Cancel
            </BaseButton>

            <BaseButton
              type="submit"
              variant="primary"
              size="sm"
              :loading="isSubmitting"
            >
              <CheckCircle2 class="w-3.5 h-3.5 mr-1 text-emerald-200" />
              <span>{{ isEdit ? 'Save Changes' : 'Register Document' }}</span>
            </BaseButton>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
