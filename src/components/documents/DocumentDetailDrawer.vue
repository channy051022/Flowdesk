<script setup>
import { ref, watch, computed } from 'vue'
import BaseBadge from '../common/BaseBadge.vue'
import BaseButton from '../common/BaseButton.vue'
import TransferModal from './TransferModal.vue'
import ReceiveModal from './ReceiveModal.vue'
import CancelTransferModal from './CancelTransferModal.vue'
import CorrectTransferModal from './CorrectTransferModal.vue'
import DocumentModal from './DocumentModal.vue'
import ScannerModal from '../scanner/ScannerModal.vue'
import {
  getDocumentById,
  getMovementsForDocument,
  updateDocumentStatus,
  archiveDocument,
  restoreDocument,
  deleteDocument,
  formatDocDate,
  formatDocDateTime,
  isDocumentOverdue
} from '../../services/documentService'
import { getWorkflowFolders, moveDocumentToFolder } from '../../services/workflowService'
import { formatCurrency } from '../../services/financeService'
import {
  getEntityAttachments,
  openAttachment,
  deleteEntityAttachment,
  attachFileBrowserMode
} from '../../services/scannerService'
import { DOCUMENT_STATUSES } from '../../db/database'
import db from '../../db/database'
import {
  X,
  FileText,
  Building2,
  Calendar,
  Clock,
  ArrowRight,
  Send,
  CheckCircle2,
  AlertTriangle,
  Undo2,
  Edit2,
  Archive,
  RotateCcw,
  Trash2,
  Copy,
  Landmark,
  ShieldAlert,
  Info,
  ExternalLink,
  ChevronRight,
  Folder,
  Paperclip,
  Scan
} from 'lucide-vue-next'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  },
  documentId: {
    type: [Number, String],
    default: null
  }
})

const emit = defineEmits(['close', 'updated', 'deleted'])

const docData = ref(null)
const movementsList = ref([])
const activitiesList = ref([])
const isLoading = ref(true)
const activeTab = ref('movements') // 'movements', 'details', 'activities'
const copiedNumber = ref(false)
const workflowFoldersList = ref([])

// Submodals
const isTransferModalOpen = ref(false)
const isReceiveModalOpen = ref(false)
const isCancelModalOpen = ref(false)
const isCorrectModalOpen = ref(false)
const isEditModalOpen = ref(false)
const selectedMovementForCorrection = ref(null)

const isDesktop = computed(() => typeof window !== 'undefined' && Boolean(window.flowdeskAPI?.isDesktop))
const attachmentsList = ref([])
const isAttachingFile = ref(false)
const isLoadingAttachments = ref(false)
const isScannerModalOpen = ref(false)
const fileInputRef = ref(null)

const scannerActivityDesign = computed(() => {
  if (docData.value?.relatedFinanceRecord) {
    return docData.value.relatedFinanceRecord
  }
  if (docData.value?.relatedFinanceRecordId) {
    return {
      id: Number(docData.value.relatedFinanceRecordId),
      activityDesign: docData.value.title
    }
  }
  if (docData.value) {
    return {
      id: Number(docData.value.id),
      activityDesign: docData.value.title
    }
  }
  return null
})

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const loadAttachments = async () => {
  if (!props.documentId) {
    attachmentsList.value = []
    return
  }

  isLoadingAttachments.value = true
  try {
    const docId = Number(props.documentId)

    // 1. Fetch attachments directly associated with this tracking document
    const docAttachments = await getEntityAttachments('document', docId)
    const taggedDocAtts = (docAttachments || []).map((att) => ({
      ...att,
      sourceType: 'document',
      sourceLabel: 'Document Tracking Slip'
    }))

    // 2. Fetch attachments associated with the linked Activity Design / Finance Record
    let finAttachments = []
    let finId = docData.value?.relatedFinanceRecordId || docData.value?.relatedFinanceRecord?.id

    // Fallback: If not explicitly linked by ID, lookup by matching Activity Design title
    if (!finId && docData.value?.title) {
      try {
        const matchingFin = await db.financeRecords
          .where('activityDesign')
          .equals(docData.value.title)
          .first()
        if (matchingFin?.id) {
          finId = matchingFin.id
        }
      } catch (e) {
        console.warn('Failed to lookup matching finance record for attachments:', e)
      }
    }

    if (finId) {
      const rawFinAtts = await getEntityAttachments('finance', Number(finId))
      finAttachments = (rawFinAtts || []).map((att) => ({
        ...att,
        sourceType: 'finance',
        sourceLabel: 'Activity Design Scanned Document'
      }))
    }

    // 3. Deduplicate by attachment ID or relativePath and sort newest first
    const seenKeys = new Set()
    const merged = []
    for (const att of [...finAttachments, ...taggedDocAtts]) {
      const key = att.id ? `id_${att.id}` : `path_${att.relativePath}`
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        merged.push(att)
      }
    }

    merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    attachmentsList.value = merged
  } catch (err) {
    console.warn('Failed to load attachments in DocumentDetailDrawer:', err)
  } finally {
    isLoadingAttachments.value = false
  }
}

const handleAddAttachment = async () => {
  if (isDesktop.value && window.flowdeskAPI?.files?.selectAttachment) {
    try {
      const selected = await window.flowdeskAPI.files.selectAttachment()
      if (!selected) return

      isAttachingFile.value = true
      await window.flowdeskAPI.files.saveAttachment({
        entityType: 'document',
        entityId: Number(props.documentId),
        sourceFilePath: selected.filePath
      })
      await loadAttachments()
      emit('updated')
    } catch (err) {
      alert('Failed to save attachment: ' + err.message)
    } finally {
      isAttachingFile.value = false
    }
  } else {
    // Browser mode fallback via file input
    if (fileInputRef.value) {
      fileInputRef.value.click()
    }
  }
}

const handleBrowserFileUpload = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return

  isAttachingFile.value = true
  try {
    await attachFileBrowserMode({
      entityType: 'document',
      entityId: Number(props.documentId),
      file,
      notes: 'Attached via FlowDesk Document Tracker'
    })
    await loadAttachments()
    emit('updated')
  } catch (err) {
    alert('Failed to attach file in browser mode: ' + err.message)
  } finally {
    isAttachingFile.value = false
    if (event.target) event.target.value = ''
  }
}

const handleOpenAttachment = async (att) => {
  try {
    await openAttachment(att)
  } catch (err) {
    alert('Error opening attachment: ' + err.message)
  }
}

const handleDeleteAttachment = async (att) => {
  const label = att.sourceType === 'finance' ? 'Activity Design scanned document' : 'attachment'
  if (!confirm(`Delete ${label} "${att.fileName}"? This will remove the file from your computer.`)) return
  try {
    await deleteEntityAttachment(att.id)
    await loadAttachments()
    emit('updated')
  } catch (err) {
    alert('Error deleting attachment: ' + err.message)
  }
}

const handleScanAttached = async () => {
  await loadAttachments()
  emit('updated')
}

const loadFullDocument = async () => {
  if (!props.documentId) return
  isLoading.value = true
  try {
    const [doc, movements, acts, folders] = await Promise.all([
      getDocumentById(props.documentId),
      getMovementsForDocument(props.documentId),
      db.activities.where('entityId').equals(Number(props.documentId)).toArray(),
      getWorkflowFolders()
    ])
    docData.value = doc
    movementsList.value = movements
    acts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    activitiesList.value = acts
    workflowFoldersList.value = folders
    await loadAttachments()
  } catch (err) {
    console.error('Failed to load document details:', err)
  } finally {
    isLoading.value = false
  }
}

const handleFolderChange = async (folderId) => {
  if (!docData.value || !folderId) return
  try {
    await moveDocumentToFolder(docData.value.id, folderId)
    await loadFullDocument()
    emit('updated')
  } catch (err) {
    alert(err.message || 'Error moving document to folder')
  }
}

watch(
  () => [props.isOpen, props.documentId],
  ([open, id]) => {
    if (open && id) {
      activeTab.value = 'movements'
      loadFullDocument()
    }
  }
)

const copySlip = (num) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(num)
    copiedNumber.value = true
    setTimeout(() => {
      copiedNumber.value = false
    }, 2000)
  }
}

const handleStatusChange = async (newStatus) => {
  if (!docData.value) return
  try {
    await updateDocumentStatus(docData.value.id, newStatus)
    await loadFullDocument()
    emit('updated')
  } catch (err) {
    alert('Error updating status: ' + err.message)
  }
}

const handleArchive = async () => {
  if (!docData.value) return
  if (confirm(`Archive document ${docData.value.trackingNumber}?`)) {
    await archiveDocument(docData.value.id)
    await loadFullDocument()
    emit('updated')
  }
}

const handleRestore = async () => {
  if (!docData.value) return
  await restoreDocument(docData.value.id)
  await loadFullDocument()
  emit('updated')
}

const handleDelete = async () => {
  if (!docData.value) return
  if (
    confirm(
      `Are you sure you want to permanently delete document ${docData.value.trackingNumber} and all its movements? This action cannot be undone.`
    )
  ) {
    await deleteDocument(docData.value.id)
    emit('deleted')
    emit('close')
  }
}

const openCorrectionModal = (movement) => {
  selectedMovementForCorrection.value = movement
  isCorrectModalOpen.value = true
}

const handleActionComplete = async () => {
  await loadFullDocument()
  emit('updated')
}

const getStatusBadgeVariant = (st) => {
  if (st === 'in_transit') return 'info'
  if (st === 'completed') return 'success'
  if (st === 'under_review' || st === 'for_approval') return 'warning'
  if (st === 'returned_for_revision') return 'urgent'
  return 'routine'
}

const getPriorityBadgeVariant = (p) => {
  if (p === 'Urgent') return 'urgent'
  if (p === 'High') return 'warning'
  if (p === 'Medium') return 'info'
  return 'routine'
}

const getMovementStatusColor = (st) => {
  if (st === 'in_transit') return 'bg-sky-50 text-sky-800 border-sky-200'
  if (st === 'received') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (st === 'cancelled') return 'bg-red-50 text-red-800 border-red-200'
  if (st === 'corrected') return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-zinc-100 text-zinc-700 border-zinc-200'
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end"
  >
    <div
      class="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden animate-slide-left border-l border-zinc-200"
      role="dialog"
      aria-modal="true"
    >
      <!-- Drawer Top Bar -->
      <div class="px-5 py-4 border-b border-zinc-100 bg-zinc-50/70 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-forest-100 text-forest-800 flex items-center justify-center shrink-0">
            <FileText class="w-4 h-4" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono text-xs font-bold text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200">
                {{ docData?.trackingNumber || 'FD-DOCUMENT' }}
              </span>
              <button
                v-if="docData"
                @click="copySlip(docData.trackingNumber)"
                type="button"
                class="text-[11px] text-zinc-500 hover:text-forest-800 flex items-center gap-1 cursor-pointer"
                title="Copy tracking number"
              >
                <Copy class="w-3 h-3" />
                <span v-if="copiedNumber" class="text-emerald-700 font-medium">Copied!</span>
              </button>
            </div>
            <p class="text-[11px] text-zinc-500 truncate mt-0.5">
              {{ docData?.documentType }} • Registered {{ formatDocDate(docData?.dateRegistered) }}
            </p>
          </div>
        </div>

        <button
          @click="emit('close')"
          type="button"
          class="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors cursor-pointer"
          aria-label="Close details"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="p-8 text-center text-xs text-zinc-400 space-y-2 flex-1">
        <div class="animate-spin w-6 h-6 border-2 border-forest-700 border-t-transparent rounded-full mx-auto"></div>
        <p>Loading document history...</p>
      </div>

      <!-- Main Drawer Content -->
      <div v-else-if="docData" class="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        <!-- Title & Status Banner -->
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-base font-bold text-zinc-900 leading-snug">
              {{ docData.title }}
            </h2>

            <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
              <span class="font-medium text-[11px] px-2 py-0.5 rounded bg-forest-50 text-forest-800 border border-forest-200 flex items-center gap-1">
                <Folder class="w-3 h-3 text-forest-700" />
                {{ docData.workflowFolder?.name || 'New Documents' }}
              </span>
              <BaseBadge :variant="getStatusBadgeVariant(docData.status)" size="sm">
                {{ docData.status.replace(/_/g, ' ').toUpperCase() }}
              </BaseBadge>
              <BaseBadge :variant="getPriorityBadgeVariant(docData.priority)" size="sm">
                {{ docData.priority }}
              </BaseBadge>
            </div>
          </div>

          <div v-if="docData.referenceNumber" class="text-zinc-500 text-[11px]">
            Reference No: <strong class="font-mono text-zinc-800">{{ docData.referenceNumber }}</strong>
          </div>
        </div>

        <!-- Distinct Confirmed Location vs Active In-Transit Destination Strip -->
        <div
          :class="[
            'p-3.5 rounded-xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3',
            docData.status === 'in_transit'
              ? 'bg-sky-50/70 border-sky-200'
              : 'bg-zinc-50 border-zinc-200/80'
          ]"
        >
          <!-- Confirmed Current Office -->
          <div class="flex items-center gap-2.5 min-w-0 flex-1">
            <div class="w-7 h-7 rounded-md bg-white border border-zinc-200 flex items-center justify-center shrink-0 text-zinc-700">
              <Building2 class="w-3.5 h-3.5" />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-semibold text-zinc-400 block">
                Last Confirmed Location
              </span>
              <div class="font-semibold text-zinc-900 truncate">
                {{ docData.currentOffice?.name || 'Current Office' }}
              </div>
            </div>
          </div>

          <!-- If In Transit, show Arrow and Active Destination clearly -->
          <div v-if="docData.status === 'in_transit'" class="flex items-center gap-2.5 min-w-0 flex-1 pl-0 sm:pl-3 border-t sm:border-t-0 sm:border-l border-sky-200 pt-2 sm:pt-0">
            <div class="w-7 h-7 rounded-md bg-sky-600 text-white flex items-center justify-center shrink-0 animate-pulse">
              <Send class="w-3.5 h-3.5" />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-semibold text-sky-800 block">
                In Flight Destination
              </span>
              <div class="font-bold text-sky-950 truncate">
                {{ docData.activeDestinationOffice?.name || 'Destination' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Critical Transfer / Receive Action Bar -->
        <div class="p-3 bg-white dark:bg-[#1A1719] rounded-xl border border-zinc-200 dark:border-[#2D252B] shadow-2xs space-y-2">
          <div class="text-[11px] font-semibold text-zinc-700 dark:text-[#DDD2D9] flex items-center justify-between">
            <span>Physical Document Workflow Action:</span>
            <span v-if="docData.status === 'in_transit'" class="text-sky-700 dark:text-sky-400 font-bold text-[10px] uppercase">
              • Awaiting Physical Receipt
            </span>
          </div>

          <div class="flex items-center justify-between gap-2 overflow-x-auto pb-0.5">
            <!-- If IN TRANSIT: show Confirm Receipt and Cancel Transfer -->
            <template v-if="docData.status === 'in_transit'">
              <BaseButton
                variant="primary"
                size="sm"
                class="shrink-0 whitespace-nowrap"
                @click="isReceiveModalOpen = true"
              >
                <CheckCircle2 class="w-3.5 h-3.5 mr-1.5 text-rose-200" />
                Confirm Physical Receipt
              </BaseButton>

              <BaseButton
                variant="danger"
                size="sm"
                class="shrink-0 whitespace-nowrap"
                @click="isCancelModalOpen = true"
              >
                <Undo2 class="w-3.5 h-3.5 mr-1.5" />
                Cancel Transfer
              </BaseButton>
            </template>

            <!-- If NOT in transit: show Initiate Transfer -->
            <template v-else-if="!docData.isArchived">
              <BaseButton
                variant="primary"
                size="sm"
                class="shrink-0 whitespace-nowrap"
                @click="isTransferModalOpen = true"
              >
                <Send class="w-3.5 h-3.5 mr-1.5 text-rose-200" />
                Transfer to Another Office
              </BaseButton>
            </template>

            <!-- Workflow Status Dropdown -->
            <div class="ml-auto flex items-center gap-1.5 shrink-0">
              <span class="text-[11px] text-zinc-500 dark:text-[#BCAEBA] whitespace-nowrap font-medium">Status:</span>
              <select
                :value="docData.status"
                @change="handleStatusChange($event.target.value)"
                class="px-2 py-1 bg-zinc-50 dark:bg-[#251A21] border border-zinc-200 dark:border-[#4D3341] rounded-md text-xs text-zinc-800 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-forest-600 cursor-pointer max-w-[130px] sm:max-w-[150px] truncate"
                :disabled="docData.status === 'in_transit' || docData.isArchived"
              >
                <option v-for="st in DOCUMENT_STATUSES" :key="st.value" :value="st.value" class="dark:bg-[#1A1719] dark:text-[#F5EDF1]">
                  {{ st.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs: Movements | Details | Audit History -->
        <div class="border-b border-zinc-200 flex items-center gap-4">
          <button
            @click="activeTab = 'movements'"
            type="button"
            :class="[
              'pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer',
              activeTab === 'movements'
                ? 'border-forest-700 text-forest-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            ]"
          >
            Movement History ({{ movementsList.length }})
          </button>

          <button
            @click="activeTab = 'details'"
            type="button"
            :class="[
              'pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer',
              activeTab === 'details'
                ? 'border-forest-700 text-forest-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            ]"
          >
            Document Details
          </button>

          <button
            @click="activeTab = 'activities'"
            type="button"
            :class="[
              'pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer',
              activeTab === 'activities'
                ? 'border-forest-700 text-forest-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            ]"
          >
            Audit Log ({{ activitiesList.length }})
          </button>

          <button
            @click="activeTab = 'attachments'"
            type="button"
            :class="[
              'pb-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer',
              activeTab === 'attachments'
                ? 'border-forest-700 text-forest-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            ]"
          >
            Attachments ({{ attachmentsList.length }})
          </button>
        </div>

        <!-- TAB 1: Movement History Timeline -->
        <div v-if="activeTab === 'movements'" class="space-y-4">
          <div class="flex items-center justify-between text-zinc-500 text-[11px]">
            <span>Chronological routing path between offices</span>
            <span>Oldest &rarr; Latest</span>
          </div>

          <div class="space-y-0">
            <div
              v-for="(move, idx) in movementsList"
              :key="move.id"
              class="flex items-start gap-3 group relative"
            >
              <!-- Timeline Node Bullet & Centered Vertical Line -->
              <div class="flex flex-col items-center self-stretch shrink-0 w-7">
                <span
                  :class="[
                    'relative z-10 w-6 h-6 rounded-full ring-4 ring-white flex items-center justify-center text-[10px] shadow-xs font-bold text-white shrink-0',
                    move.status === 'in_transit' ? 'bg-sky-600' : (move.status === 'received' ? 'bg-emerald-600' : 'bg-amber-600')
                  ]"
                >
                  {{ idx + 1 }}
                </span>
                <div
                  v-if="idx < movementsList.length - 1"
                  class="w-0.5 grow bg-zinc-200 my-1 rounded-full"
                />
              </div>

              <div class="flex-1 min-w-0 pb-4">
                <div class="flex flex-col gap-1.5 text-xs bg-zinc-50/70 p-3 rounded-xl border border-zinc-200/80">
                  <!-- Route Header & Status -->
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="font-semibold text-zinc-900 flex items-center gap-1.5">
                  <span>{{ move.fromOfficeName }}</span>
                  <ArrowRight class="w-3.5 h-3.5 text-zinc-400" />
                  <span class="text-forest-900">{{ move.toOfficeName }}</span>
                </div>

                <div class="flex items-center gap-1.5">
                  <span
                    :class="[
                      'px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider',
                      getMovementStatusColor(move.status)
                    ]"
                  >
                    {{ move.status.replace('_', ' ') }}
                  </span>

                  <!-- Audit Correction Button -->
                  <button
                    v-if="move.status === 'received'"
                    @click="openCorrectionModal(move)"
                    type="button"
                    class="text-[10px] text-zinc-500 hover:text-amber-800 p-0.5 rounded hover:bg-zinc-200/60 transition-colors"
                    title="Audit correct this movement"
                  >
                    <ShieldAlert class="w-3 h-3" />
                  </button>
                </div>
              </div>

              <!-- Movement Timestamps -->
              <div class="flex items-center gap-3 text-[11px] text-zinc-500 flex-wrap">
                <span>Dispatched: <strong>{{ formatDocDateTime(move.dispatchDate) }}</strong></span>
                <span v-if="move.receiptDate">• Received: <strong>{{ formatDocDateTime(move.receiptDate) }}</strong></span>
                <span v-if="move.receivingPersonName">• Recipient: <strong>{{ move.receivingPersonName }}</strong></span>
              </div>

              <!-- Notes -->
              <p v-if="move.notes" class="text-zinc-600 text-[11px] bg-white p-2 rounded border border-zinc-100">
                {{ move.notes }}
              </p>

              <!-- Cancellation Reason Banner if cancelled -->
              <div v-if="move.status === 'cancelled'" class="p-2 rounded bg-red-50 border border-red-200 text-red-900 text-[11px]">
                <strong>Cancellation Reason:</strong> {{ move.cancellationReason }}
              </div>

              <!-- Correction Reason Banner if corrected -->
              <div v-if="move.status === 'corrected'" class="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                <strong>Audited Correction:</strong> {{ move.correctionReason }} (By: {{ move.correctedBy }})
              </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: Document Details & Metadata -->
        <div v-if="activeTab === 'details'" class="space-y-4">
          <!-- Metadata Card -->
          <div class="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-3">
            <div class="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <span class="text-zinc-400 block">Originating Office:</span>
                <span class="font-semibold text-zinc-800">{{ docData.originatingOffice?.name }}</span>
              </div>
              <div>
                <span class="text-zinc-400 block">Current Confirmed:</span>
                <span class="font-semibold text-zinc-800">{{ docData.currentOffice?.name }}</span>
              </div>
              <div>
                <span class="text-zinc-400 block">Date Registered:</span>
                <span class="font-semibold text-zinc-800">{{ formatDocDate(docData.dateRegistered) }}</span>
              </div>
              <div>
                <span class="text-zinc-400 block">Target / Due Date:</span>
                <span
                  :class="[
                    'font-semibold',
                    isDocumentOverdue(docData) ? 'text-red-700 font-bold' : 'text-zinc-800'
                  ]"
                >
                  {{ formatDocDate(docData.dueDate) }}
                  <span v-if="isDocumentOverdue(docData)" class="text-[9px] text-red-600 font-bold ml-1">OVERDUE</span>
                </span>
              </div>
            </div>

            <!-- Description -->
            <div v-if="docData.description" class="pt-2 border-t border-zinc-200/60">
              <span class="text-[10px] text-zinc-400 font-semibold block uppercase mb-1">
                Description / Remarks
              </span>
              <p class="text-zinc-700 text-xs leading-relaxed whitespace-pre-wrap">
                {{ docData.description }}
              </p>
            </div>
          </div>

          <!-- Linked Finance Monitoring Record Card -->
          <div v-if="docData.relatedFinanceRecord" class="p-4 rounded-xl bg-rose-50/70 border border-rose-200/80 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 text-rose-950 font-bold text-xs">
                <Landmark class="w-4 h-4 text-rose-600" />
                <span>Finance Internal Control Monitoring (Canonical Source)</span>
              </div>
              <router-link
                :to="{ path: '/finance', query: { search: docData.relatedFinanceRecord.activityDesign || docData.title } }"
                class="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 hover:underline cursor-pointer"
              >
                <span>Open in Finance</span>
                <ExternalLink class="w-3 h-3" />
              </router-link>
            </div>

            <div class="grid grid-cols-2 gap-2.5 text-[11px]">
              <div>
                <span class="text-zinc-500 text-[10px] block font-medium">Activity Design:</span>
                <strong class="text-zinc-900 block truncate">{{ docData.relatedFinanceRecord.activityDesign || docData.title }}</strong>
              </div>
              <div>
                <span class="text-zinc-500 text-[10px] block font-medium">Amount of AD:</span>
                <strong class="text-rose-700 font-mono font-bold block">
                  {{ formatCurrency(docData.relatedFinanceRecord.amountOfAd || docData.relatedFinanceRecord.adAmount || 0) }}
                </strong>
              </div>
              <div>
                <span class="text-zinc-500 text-[10px] block font-medium">Supplier / Payee:</span>
                <span class="text-zinc-800 font-medium block truncate">{{ docData.relatedFinanceRecord.supplier || docData.relatedFinanceRecord.supplierName || '—' }}</span>
              </div>
              <div>
                <span class="text-zinc-500 text-[10px] block font-medium">Date of Event / Activity:</span>
                <span class="text-zinc-800 font-medium block">{{ formatDocDate(docData.relatedFinanceRecord.dateOfActivity) }}</span>
              </div>
              <div>
                <span class="text-zinc-500 text-[10px] block font-medium">Purchase Request (PR):</span>
                <span v-if="docData.relatedFinanceRecord.prNumber" class="font-mono text-emerald-700 font-semibold">
                  {{ docData.relatedFinanceRecord.prNumber }}
                </span>
                <span v-else class="text-amber-700 font-medium italic">
                  Pending (PR Reminder Active)
                </span>
              </div>
              <div>
                <span class="text-zinc-500 text-[10px] block font-medium">Payment Status:</span>
                <span :class="docData.relatedFinanceRecord.paymentStatus === 'Paid' ? 'text-emerald-700 font-bold' : 'text-zinc-700 font-medium'">
                  {{ docData.relatedFinanceRecord.paymentStatus || 'Unpaid' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: Audit Activity History -->
        <div v-if="activeTab === 'activities'" class="space-y-3">
          <div v-if="activitiesList.length > 0" class="divide-y divide-zinc-100">
            <div
              v-for="act in activitiesList"
              :key="act.id || act.timestamp"
              class="py-2.5 flex items-start gap-2.5"
            >
              <div class="w-2 h-2 rounded-full bg-forest-700 mt-1.5 shrink-0"></div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-semibold text-zinc-900 capitalize text-xs">
                    {{ act.type?.replace(/_/g, ' ') }}
                  </span>
                  <span class="text-[10px] text-zinc-400">
                    {{ formatDocDateTime(act.timestamp) }}
                  </span>
                </div>
                <p class="text-zinc-600 text-[11px] mt-0.5">
                  {{ act.description }}
                </p>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-6 text-zinc-400 text-xs">
            No audit events recorded for this document yet.
          </div>
        </div>

        <!-- TAB 4: Attachments & Scans -->
        <div v-if="activeTab === 'attachments'" class="space-y-4">
          <!-- Hidden browser file input for non-desktop environments -->
          <input
            ref="fileInputRef"
            type="file"
            class="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.tif,.tiff"
            @change="handleBrowserFileUpload"
          />

          <div class="flex items-center justify-between text-xs flex-wrap gap-2">
            <div>
              <span class="text-zinc-700 dark:text-[#F5EDF1] font-semibold text-xs block">Document Files & Scans</span>
              <span class="text-zinc-400 dark:text-[#806B76] text-[11px]">Physical scans, transmittal PDFs, and documents</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="isScannerModalOpen = true"
                type="button"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#D9467B] dark:text-[#F294B7] bg-[#FFF0F5] dark:bg-[#2D1F28] hover:bg-[#FCE7F0] dark:hover:bg-[#3D2534] border border-[#F3C4D7] dark:border-[#4A2D3C] rounded-lg transition-colors cursor-pointer shadow-2xs"
                title="Scan document from physical hardware scanner"
              >
                <Scan class="w-3.5 h-3.5 text-[#D9467B] dark:text-[#F294B7]" />
                <span>Scan Document</span>
              </button>
              <button
                @click="handleAddAttachment"
                type="button"
                :disabled="isAttachingFile"
                class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-forest-800 hover:bg-forest-900 rounded-lg transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <Paperclip class="w-3.5 h-3.5" />
                <span>{{ isAttachingFile ? 'Adding...' : 'Attach File' }}</span>
              </button>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="isLoadingAttachments" class="p-6 text-center text-zinc-400 dark:text-[#806B76] text-xs space-y-2">
            <div class="animate-spin w-5 h-5 border-2 border-forest-700 dark:border-[#F294B7] border-t-transparent rounded-full mx-auto"></div>
            <p>Loading attached documents and scans...</p>
          </div>

          <!-- Attachments list -->
          <div v-else-if="attachmentsList.length > 0" class="space-y-2">
            <div
              v-for="att in attachmentsList"
              :key="att.id"
              class="p-3 rounded-xl bg-white dark:bg-[#201A1E] border border-zinc-200 dark:border-[#2D252B] flex items-center justify-between text-xs hover:border-zinc-300 dark:hover:border-[#3D2D38] transition-colors shadow-2xs"
            >
              <div class="flex items-center gap-2.5 min-w-0 pr-2">
                <div class="p-2 rounded-lg bg-zinc-100 dark:bg-[#2A2228] text-zinc-600 dark:text-[#DDD2D9] shrink-0">
                  <FileText class="w-4 h-4 text-forest-700 dark:text-[#F294B7]" />
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-zinc-800 dark:text-[#F5EDF1] truncate" :title="att.fileName">
                      {{ att.fileName }}
                    </span>
                    <span
                      v-if="att.sourceType === 'finance'"
                      class="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 shrink-0"
                      title="Attached to linked Activity Design"
                    >
                      Activity Design Scan
                    </span>
                    <span
                      v-else
                      class="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 dark:bg-[#251F23] text-zinc-600 dark:text-[#DDD2D9] border border-zinc-200 dark:border-[#3D2D38] shrink-0"
                    >
                      Document Attachment
                    </span>
                  </div>
                  <div class="text-[10px] text-zinc-400 dark:text-[#806B76] flex items-center gap-2 mt-0.5 flex-wrap">
                    <span>{{ formatBytes(att.fileSize) }}</span>
                    <span>•</span>
                    <span>{{ formatDocDate(att.createdAt) }}</span>
                    <span v-if="att.notes" class="text-zinc-500 dark:text-[#BCAEBA] truncate max-w-xs" :title="att.notes">
                      • {{ att.notes }}
                    </span>
                    <span v-if="att.existsOnDisk === false" class="text-amber-600 dark:text-amber-400 font-semibold">(File missing on disk)</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button
                  @click="handleOpenAttachment(att)"
                  type="button"
                  class="p-1.5 rounded-lg text-forest-800 dark:text-[#F294B7] hover:bg-forest-50 dark:hover:bg-forest-950/40 transition-colors cursor-pointer"
                  title="Open file in Windows default application"
                >
                  <ExternalLink class="w-4 h-4" />
                </button>
                <button
                  @click="handleDeleteAttachment(att)"
                  type="button"
                  class="p-1.5 rounded-lg text-zinc-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                  title="Delete attachment"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="p-6 rounded-xl border border-dashed border-zinc-200 dark:border-[#2D252B] text-center bg-zinc-50/50 dark:bg-[#201A1E]/50">
            <Paperclip class="w-8 h-8 text-zinc-300 dark:text-[#4A3D46] mx-auto mb-2" />
            <p class="text-xs font-semibold text-zinc-700 dark:text-[#F5EDF1]">No attachments yet</p>
            <p class="text-[11px] text-zinc-400 dark:text-[#806B76] max-w-xs mx-auto mt-1 mb-3">
              Store transmittal sheets, signed memos, receipts, or PDF scans directly in the FlowDesk attachments folder.
            </p>
            <div class="flex items-center justify-center gap-2">
              <button
                @click="isScannerModalOpen = true"
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#D9467B] dark:text-[#F294B7] bg-[#FFF0F5] dark:bg-[#2D1F28] hover:bg-[#FCE7F0] dark:hover:bg-[#3D2534] rounded-lg border border-[#F3C4D7] dark:border-[#4A2D3C] transition-colors cursor-pointer"
              >
                <Scan class="w-3.5 h-3.5 text-[#D9467B] dark:text-[#F294B7]" />
                <span>Scan Document</span>
              </button>
              <button
                @click="handleAddAttachment"
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-forest-800 dark:text-[#DDD2D9] bg-forest-50 dark:bg-[#251F23] hover:bg-forest-100 dark:hover:bg-[#2D232A] rounded-lg border border-forest-200 dark:border-[#3D2D38] transition-colors cursor-pointer"
              >
                <Paperclip class="w-3.5 h-3.5" />
                <span>Select File to Attach</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Drawer Footer Controls -->
      <div v-if="docData" class="px-5 py-3.5 border-t border-zinc-100 bg-zinc-50/80 flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <!-- Archive / Restore button -->
          <button
            v-if="!docData.isArchived"
            @click="handleArchive"
            type="button"
            class="p-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/70 transition-colors flex items-center gap-1 text-xs"
            title="Archive document"
          >
            <Archive class="w-3.5 h-3.5" />
            <span class="hidden sm:inline">Archive</span>
          </button>
          <button
            v-else
            @click="handleRestore"
            type="button"
            class="p-2 rounded-lg text-forest-700 hover:bg-forest-100 transition-colors flex items-center gap-1 text-xs font-medium"
            title="Restore document"
          >
            <RotateCcw class="w-3.5 h-3.5" />
            <span>Restore</span>
          </button>

          <!-- Delete button -->
          <button
            @click="handleDelete"
            type="button"
            class="p-2 rounded-lg text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors text-xs"
            title="Delete document"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <BaseButton
            variant="secondary"
            size="sm"
            @click="isEditModalOpen = true"
          >
            <Edit2 class="w-3.5 h-3.5 mr-1" />
            Edit Details
          </BaseButton>

          <BaseButton
            variant="secondary"
            size="sm"
            @click="emit('close')"
          >
            Close
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Submodals -->
    <TransferModal
      :is-open="isTransferModalOpen"
      :document="docData"
      @close="isTransferModalOpen = false"
      @transferred="handleActionComplete"
    />

    <ReceiveModal
      :is-open="isReceiveModalOpen"
      :document="docData"
      @close="isReceiveModalOpen = false"
      @received="handleActionComplete"
    />

    <CancelTransferModal
      :is-open="isCancelModalOpen"
      :document="docData"
      @close="isCancelModalOpen = false"
      @cancelled="handleActionComplete"
    />

    <CorrectTransferModal
      :is-open="isCorrectModalOpen"
      :movement="selectedMovementForCorrection"
      @close="isCorrectModalOpen = false"
      @corrected="handleActionComplete"
    />

    <DocumentModal
      :is-open="isEditModalOpen"
      :document-to-edit="docData"
      @close="isEditModalOpen = false"
      @saved="async () => { isEditModalOpen = false; await handleActionComplete(); }"
    />

    <!-- Hardware Scanner Modal for Document Scanning -->
    <ScannerModal
      :isOpen="isScannerModalOpen"
      :activityDesign="scannerActivityDesign"
      @close="isScannerModalOpen = false"
      @attached="handleScanAttached"
    />
  </div>
</template>
