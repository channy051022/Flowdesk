<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import BaseCard from '../components/common/BaseCard.vue'
import FolderModal from '../components/workflow/FolderModal.vue'
import ArchiveFolderModal from '../components/workflow/ArchiveFolderModal.vue'
import DocumentModal from '../components/documents/DocumentModal.vue'
import DocumentDetailDrawer from '../components/documents/DocumentDetailDrawer.vue'
import TransferModal from '../components/documents/TransferModal.vue'
import ReceiveModal from '../components/documents/ReceiveModal.vue'
import {
  getBoardData,
  moveDocumentToFolder,
  reorderWorkflowFolders,
  getWorkflowFolders
} from '../services/workflowService'
import {
  createDocument,
  formatDocDate,
  isDocumentOverdue
} from '../services/documentService'
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from '../db/database'
import { toast } from '../composables/useToast'
import {
  Kanban,
  Plus,
  Search,
  Filter,
  FolderOpen,
  MoreVertical,
  Send,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ArrowRight,
  Eye,
  Edit2,
  Archive,
  ArrowLeft,
  ArrowRight as ArrowRightIcon,
  Check,
  X,
  Building2,
  FileText,
  Sparkles,
  Info,
  ChevronDown,
  Table,
  RotateCcw
} from 'lucide-vue-next'

// State
const boardColumns = ref([])
const allActiveFolders = ref([])
const isLoading = ref(true)

// Filter & Search
const searchQuery = ref('')
const selectedPriority = ref('all')
const selectedType = ref('all')
const selectedStatus = ref('all')

// Drag & Drop State
const draggedDocument = ref(null)
const dragOverFolderId = ref(null)

// UI Feedback Toast / Banner
const feedback = ref(null) // { type: 'success' | 'error', text: '' }
let feedbackTimer = null

const showFeedback = (text, type = 'success') => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedback.value = { text, type }
  feedbackTimer = setTimeout(() => {
    feedback.value = null
  }, 4000)
}

// Menus
const openFolderMenuId = ref(null)
const openCardMenuId = ref(null)

const toggleFolderMenu = (folderId, event) => {
  event?.stopPropagation()
  openFolderMenuId.value = openFolderMenuId.value === folderId ? null : folderId
  openCardMenuId.value = null
}

const toggleCardMenu = (cardId, event) => {
  event?.stopPropagation()
  openCardMenuId.value = openCardMenuId.value === cardId ? null : cardId
  openFolderMenuId.value = null
}

const closeAllMenus = () => {
  openFolderMenuId.value = null
  openCardMenuId.value = null
}

// Modals State
const isFolderModalOpen = ref(false)
const folderToEdit = ref(null)

const isArchiveModalOpen = ref(false)
const folderToArchive = ref(null)
const folderToArchiveCount = ref(0)

const isAddDocModalOpen = ref(false)
const selectedDocumentId = ref(null)
const isDetailDrawerOpen = ref(false)

const isTransferModalOpen = ref(false)
const documentForTransfer = ref(null)

const isReceiveModalOpen = ref(false)
const documentForReceive = ref(null)

const copiedNumber = ref('')

const copySlip = (num) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(num)
    copiedNumber.value = num
    setTimeout(() => {
      copiedNumber.value = ''
    }, 2000)
  }
}

// Load Board Data from Dexie
const loadBoard = async () => {
  isLoading.value = true
  try {
    const [data, folders] = await Promise.all([
      getBoardData({
        search: searchQuery.value,
        priority: selectedPriority.value,
        documentType: selectedType.value,
        status: selectedStatus.value
      }),
      getWorkflowFolders(false)
    ])

    boardColumns.value = data
    allActiveFolders.value = folders
  } catch (err) {
    console.error('Failed to load workflow board:', err)
    showFeedback('Error loading workflow board: ' + err.message, 'error')
  } finally {
    isLoading.value = false
  }
}

// Debounce filter watch
watch([searchQuery, selectedPriority, selectedType, selectedStatus], () => {
  loadBoard()
})

onMounted(() => {
  loadBoard()
  window.addEventListener('click', closeAllMenus)
})

onUnmounted(() => {
  window.removeEventListener('click', closeAllMenus)
  if (feedbackTimer) clearTimeout(feedbackTimer)
})

// Drag and Drop Handlers
const onDragStart = (event, card) => {
  draggedDocument.value = card
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(card.id))
  }
}

const onDragEnd = () => {
  draggedDocument.value = null
  dragOverFolderId.value = null
}

const onDragOver = (event, folderId) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverFolderId.value = folderId
}

const onDragLeave = (event, folderId) => {
  if (dragOverFolderId.value === folderId) {
    dragOverFolderId.value = null
  }
}

const onDrop = async (event, targetFolder) => {
  event.preventDefault()
  dragOverFolderId.value = null

  if (!draggedDocument.value) return
  await executeMove(draggedDocument.value, targetFolder)
}

// Execute Card Move with Optimistic UI & Safe Rollback
const executeMove = async (doc, targetFolder) => {
  if (doc.workflowFolderId === targetFolder.id) {
    return
  }

  // Pre-validate physical destination requirements
  if (targetFolder.behavior === 'destination' && !targetFolder.associatedOfficeId) {
    showFeedback(
      `Cannot move to "${targetFolder.name}": this destination folder has no assigned office configured.`,
      'error'
    )
    return
  }

  // Snapshot current columns for rollback
  const previousColumns = JSON.parse(JSON.stringify(boardColumns.value))

  // Optimistic UI update: relocate card immediately in local state
  try {
    for (const col of boardColumns.value) {
      col.items = col.items.filter((item) => item.id !== doc.id)
    }
    const targetCol = boardColumns.value.find((c) => c.folder.id === targetFolder.id)
    if (targetCol) {
      targetCol.items.unshift({
        ...doc,
        workflowFolderId: targetFolder.id
      })
    }
  } catch (optErr) {
    console.warn('Optimistic update skipped:', optErr)
  }

  // Commit move to Dexie transaction
  try {
    const updated = await moveDocumentToFolder(doc.id, targetFolder.id)
    toast.success('Document location updated successfully.')
    showFeedback(`Moved ${doc.trackingNumber} to "${targetFolder.name}"`, 'success')
    await loadBoard()
  } catch (err) {
    console.error('Move failed, rolling back:', err)
    // Rollback to prior snapshot
    boardColumns.value = previousColumns
    toast.error('Unable to save changes. Please try again.', err.message)
    showFeedback(`Failed to move document: ${err.message}`, 'error')
  }
}

// Folder Menu Operations: Add, Edit, Move, Archive
const openAddFolderModal = () => {
  folderToEdit.value = null
  isFolderModalOpen.value = true
  closeAllMenus()
}

const openEditFolderModal = (folder) => {
  folderToEdit.value = folder
  isFolderModalOpen.value = true
  closeAllMenus()
}

const openArchiveFolderModal = (col) => {
  folderToArchive.value = col.folder
  folderToArchiveCount.value = col.items.length
  isArchiveModalOpen.value = true
  closeAllMenus()
}

const handleFolderSaved = async () => {
  isFolderModalOpen.value = false
  folderToEdit.value = null
  showFeedback('Folder saved successfully.')
  await loadBoard()
}

const handleFolderArchived = async () => {
  isArchiveModalOpen.value = false
  folderToArchive.value = null
  showFeedback('Folder archived successfully.')
  await loadBoard()
}

const moveFolderOrder = async (index, direction) => {
  closeAllMenus()
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= boardColumns.value.length) return

  const reordered = [...boardColumns.value]
  const [removed] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, removed)

  const orderedIds = reordered.map((c) => c.folder.id)
  try {
    await reorderWorkflowFolders(orderedIds)
    await loadBoard()
    showFeedback('Folders reordered.')
  } catch (err) {
    showFeedback('Failed to reorder folders: ' + err.message, 'error')
  }
}

// Card Actions
const openDetailDrawer = (doc) => {
  selectedDocumentId.value = doc.id
  isDetailDrawerOpen.value = true
  closeAllMenus()
}

const openAddDocumentModal = () => {
  isAddDocModalOpen.value = true
}

const handleDocumentSaved = async ({ data }) => {
  try {
    await createDocument(data)
    isAddDocModalOpen.value = false
    showFeedback('Document registered and placed in initial workflow folder.')
    await loadBoard()
  } catch (err) {
    alert('Error saving document: ' + err.message)
  }
}

const openReceiveModal = (doc) => {
  documentForReceive.value = doc
  isReceiveModalOpen.value = true
}

const handleReceived = async () => {
  isReceiveModalOpen.value = false
  documentForReceive.value = null
  showFeedback('Receipt confirmed. Document office custody updated.')
  await loadBoard()
}

const openTransferModal = (doc) => {
  documentForTransfer.value = doc
  isTransferModalOpen.value = true
}

const handleTransferred = async () => {
  isTransferModalOpen.value = false
  documentForTransfer.value = null
  showFeedback('Transfer dispatched. Document marked in transit.')
  await loadBoard()
}

const resetFilters = () => {
  searchQuery.value = ''
  selectedPriority.value = 'all'
  selectedType.value = 'all'
  selectedStatus.value = 'all'
}

// Helpers for badges and color accents
const getPriorityBadgeVariant = (p) => {
  if (p === 'Urgent') return 'urgent'
  if (p === 'High') return 'warning'
  if (p === 'Medium') return 'info'
  return 'routine'
}

const getFolderColorClass = (color) => {
  switch (color) {
    case 'blue':
      return 'border-t-blue-500'
    case 'amber':
      return 'border-t-amber-500'
    case 'teal':
      return 'border-t-teal-500'
    case 'sky':
      return 'border-t-sky-500'
    case 'rose':
      return 'border-t-[#D9467B]'
    case 'blush':
      return 'border-t-[#F3C4D7]'
    case 'mauve':
      return 'border-t-[#806B76]'
    case 'lavender':
      return 'border-t-purple-400'
    case 'slate':
      return 'border-t-slate-400'
    case 'emerald':
      return 'border-t-emerald-600'
    case 'purple':
      return 'border-t-purple-500'
    case 'forest':
    default:
      return 'border-t-[#D9467B]'
  }
}

const getPriorityBorderClass = () => ''
</script>

<template>
  <div class="space-y-5">
    <!-- Notice Banner -->
    <div class="bg-forest-50/70 border border-forest-200/70 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-forest-900 shadow-2xs">
      <div class="flex items-start gap-3">
        <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
        <div>
          <span class="font-semibold text-forest-950">Workflow Board (Routing Pipeline):</span>
          Drag document cards between routing folders to advance administrative processing. Connected directly to Document Tracker with instant offline persistence.
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <router-link
          to="/documents"
          class="text-xs text-forest-800 hover:text-forest-950 underline font-medium inline-flex items-center gap-1 cursor-pointer"
        >
          <Table class="w-3.5 h-3.5 text-forest-700" />
          <span>Switch to Registry Table</span>
        </router-link>
      </div>
    </div>

    <!-- Feedback Toast Alert -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-2 opacity-0"
    >
      <div
        v-if="feedback"
        :class="[
          'p-3 rounded-lg text-xs font-medium flex items-center justify-between gap-2 shadow-sm border',
          feedback.type === 'error'
            ? 'bg-red-50 text-red-800 border-red-200'
            : 'bg-emerald-50 text-emerald-900 border-emerald-200'
        ]"
      >
        <div class="flex items-center gap-2">
          <AlertTriangle v-if="feedback.type === 'error'" class="w-4 h-4 text-red-600 shrink-0" />
          <CheckCircle2 v-else class="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{{ feedback.text }}</span>
        </div>
        <button
          @click="feedback = null"
          type="button"
          class="text-zinc-400 hover:text-zinc-700 cursor-pointer"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </transition>

    <!-- Header & Action Buttons -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
          <Kanban class="w-6 h-6 text-forest-800" />
          <span>Workflow Board</span>
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Visual staging of physical paper folders through administrative review and dispatch.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <BaseButton
          variant="secondary"
          size="sm"
          @click="openAddFolderModal"
        >
          <FolderOpen class="w-3.5 h-3.5 text-zinc-600 mr-1.5" />
          Add Routing Folder
        </BaseButton>

        <BaseButton
          variant="primary"
          size="sm"
          @click="openAddDocumentModal"
        >
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Register Document
        </BaseButton>
      </div>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="bg-white rounded-xl border border-zinc-200/80 p-3 shadow-2xs space-y-3">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <!-- Search -->
        <div class="relative flex-1">
          <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search tracking #, title, reference #, or office..."
            class="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600"
          />
        </div>

        <!-- Reset Button -->
        <button
          v-if="searchQuery || selectedPriority !== 'all' || selectedType !== 'all' || selectedStatus !== 'all'"
          @click="resetFilters"
          type="button"
          class="text-xs text-zinc-500 hover:text-forest-900 underline shrink-0 cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      <!-- Quick Filter Selects -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <!-- Priority Filter -->
        <div>
          <select
            v-model="selectedPriority"
            class="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <!-- Document Type Filter -->
        <div>
          <select
            v-model="selectedType"
            class="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 cursor-pointer"
          >
            <option value="all">All Document Types</option>
            <option v-for="t in DOCUMENT_TYPES" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
        </div>

        <!-- Status Filter -->
        <div>
          <select
            v-model="selectedStatus"
            class="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option v-for="st in DOCUMENT_STATUSES" :key="st.value" :value="st.value">
              {{ st.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="p-12 text-center text-xs text-zinc-400 space-y-2">
      <div class="animate-spin w-6 h-6 border-2 border-forest-700 border-t-transparent rounded-full mx-auto"></div>
      <p>Organizing routing columns...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="boardColumns.length === 0"
      class="bg-white rounded-xl border border-zinc-200/80 p-12 text-center text-xs text-zinc-500 space-y-3"
    >
      <FolderOpen class="w-10 h-10 text-rose-300 mx-auto" />
      <p class="font-medium text-zinc-700 text-sm">No routing folders found</p>
      <p class="text-zinc-400 max-w-sm mx-auto">Click below to initialize or refresh the default TCYSDO OFFICE routing folder.</p>
      <button
        @click="loadBoard"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-xs font-semibold cursor-pointer shadow-xs"
      >
        <RotateCcw class="w-3.5 h-3.5" />
        <span>Reload Routing Folders</span>
      </button>
    </div>

    <!-- Kanban Board Canvas (Horizontal Scroll for Columns) -->
    <div
      v-else
      class="flex gap-4 overflow-x-auto pb-6 pt-1 items-start min-h-[620px] select-none"
    >
      <!-- Column -->
      <div
        v-for="(col, colIndex) in boardColumns"
        :key="col.folder.id"
        :class="[
          'w-[320px] shrink-0 bg-[#FAF4F7] rounded-xl border border-[#F0E3E9] p-3 flex flex-col transition-all duration-150 border-t-4 shadow-2xs',
          getFolderColorClass(col.folder.color),
          dragOverFolderId === col.folder.id ? 'ring-2 ring-forest-500 bg-forest-50/50 border-forest-400' : ''
        ]"
        @dragover="onDragOver($event, col.folder.id)"
        @dragleave="onDragLeave($event, col.folder.id)"
        @drop="onDrop($event, col.folder)"
      >
        <!-- Column Header -->
        <div class="flex items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-zinc-200/70 relative">
          <div class="space-y-0.5 flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <h3 class="text-xs font-bold text-zinc-900 truncate">
                {{ col.folder.name }}
              </h3>
              <span class="text-[11px] font-bold px-2 py-0.2 rounded-full bg-white text-zinc-700 border border-zinc-200/80 shadow-2xs">
                {{ col.items.length }}
              </span>
            </div>

            <!-- Behavior Pill -->
            <div class="flex items-center gap-1 flex-wrap text-[10px]">
              <span
                v-if="col.folder.isDefaultRegistration"
                class="px-1.5 py-0.2 rounded bg-forest-100 text-forest-800 font-semibold"
                title="Default inbox for new documents registered in Document Tracker"
              >
                Default Inbox
              </span>

              <span
                v-if="col.folder.isCompletedFolder"
                class="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-semibold"
              >
                Completed Stage
              </span>

              <span
                v-if="col.folder.behavior === 'destination'"
                class="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-medium truncate max-w-[170px]"
                :title="col.folder.associatedOfficeName ? `Physical Routing: ${col.folder.associatedOfficeName}` : 'Destination'"
              >
                Dest: {{ col.folder.associatedOfficeCode || col.folder.associatedOfficeName || 'Office' }}
              </span>

              <span
                v-else
                class="px-1.5 py-0.2 rounded bg-zinc-200/80 text-zinc-600 font-medium"
              >
                Internal Stage
              </span>
            </div>

            <!-- Description (if any) -->
            <p v-if="col.folder.description" class="text-[10px] text-zinc-400 truncate mt-0.5">
              {{ col.folder.description }}
            </p>
          </div>

          <!-- Column 3-dot Menu Button -->
          <div class="relative shrink-0">
            <button
              @click="toggleFolderMenu(col.folder.id, $event)"
              type="button"
              class="p-1 rounded-md hover:bg-zinc-200/80 text-zinc-500 hover:text-zinc-800 cursor-pointer"
              title="Folder options"
            >
              <MoreVertical class="w-3.5 h-3.5" />
            </button>

            <!-- Folder Dropdown Menu -->
            <div
              v-if="openFolderMenuId === col.folder.id"
              class="absolute right-0 top-7 w-44 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-30 text-xs"
              @click.stop
            >
              <button
                @click="openEditFolderModal(col.folder)"
                type="button"
                class="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer"
              >
                <Edit2 class="w-3 h-3 text-zinc-400" />
                <span>Configure Folder</span>
              </button>

              <button
                v-if="colIndex > 0"
                @click="moveFolderOrder(colIndex, -1)"
                type="button"
                class="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeft class="w-3 h-3 text-zinc-400" />
                <span>Move Left</span>
              </button>

              <button
                v-if="colIndex < boardColumns.length - 1"
                @click="moveFolderOrder(colIndex, 1)"
                type="button"
                class="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer"
              >
                <ArrowRightIcon class="w-3 h-3 text-zinc-400" />
                <span>Move Right</span>
              </button>

              <div class="border-t border-zinc-100 my-1"></div>

              <button
                @click="openArchiveFolderModal(col)"
                type="button"
                class="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                :disabled="col.folder.isDefaultRegistration"
                :class="col.folder.isDefaultRegistration ? 'opacity-50 cursor-not-allowed' : ''"
              >
                <Archive class="w-3 h-3 text-red-500" />
                <span>Archive Folder</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Cards Container (Drop Target) -->
        <div class="space-y-2.5 flex-1 min-h-[300px]">
          <!-- Visual Drop Target Placeholder when dragging over -->
          <div
            v-if="dragOverFolderId === col.folder.id"
            class="p-4 rounded-xl border-2 border-dashed border-forest-500 bg-forest-50/80 text-forest-800 text-center text-xs font-semibold animate-pulse"
          >
            Drop to move into "{{ col.folder.name }}"
          </div>

          <!-- Empty State -->
          <div
            v-if="col.items.length === 0 && dragOverFolderId !== col.folder.id"
            class="h-44 border-2 border-dashed border-zinc-200/90 rounded-xl flex flex-col items-center justify-center p-4 text-center text-zinc-400 space-y-1"
          >
            <FolderOpen class="w-6 h-6 text-zinc-300 stroke-1" />
            <p class="text-[11px] font-medium text-zinc-500">Folder Empty</p>
            <p class="text-[10px] text-zinc-400">Drag & drop document slips here</p>
          </div>

          <!-- Document Cards -->
          <div
            v-for="card in col.items"
            :key="card.id"
            draggable="true"
            @dragstart="onDragStart($event, card)"
            @dragend="onDragEnd"
            :class="[
              'bg-white rounded-xl border border-[#F0E3E9] p-3 shadow-2xs hover:shadow-sm transition-all text-xs cursor-grab active:cursor-grabbing space-y-2.5',
              draggedDocument?.id === card.id ? 'opacity-40 scale-95' : ''
            ]"
            @click="openDetailDrawer(card)"
          >
            <!-- Card Top: Tracking # and Priority Badge -->
            <div class="flex items-center justify-between gap-1" @click.stop>
              <div class="flex items-center gap-1 font-mono text-[10px] font-semibold">
                <button
                  @click="copySlip(card.trackingNumber)"
                  type="button"
                  class="px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200/70 inline-flex items-center gap-1 cursor-pointer"
                  title="Copy Tracking #"
                >
                  <span>{{ card.trackingNumber }}</span>
                  <Copy class="w-2.5 h-2.5 text-zinc-400" />
                </button>
                <span v-if="copiedNumber === card.trackingNumber" class="text-[9px] text-emerald-600 font-sans">
                  Copied!
                </span>
              </div>

              <BaseBadge :variant="getPriorityBadgeVariant(card.priority)" size="xs">
                {{ card.priority }}
              </BaseBadge>
            </div>

            <!-- Subject / Title & Activity Design Badges -->
            <div class="space-y-1">
              <div v-if="card.relatedFinanceRecordId" class="flex items-center gap-1.5 flex-wrap">
                <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                  Activity Design
                </span>
                <span v-if="card.prNumber" class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                  PR: {{ card.prNumber }}
                </span>
                <span v-if="card.amountOfAd" class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700">
                  ₱{{ Number(card.amountOfAd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </span>
              </div>
              <h4 class="font-semibold text-zinc-900 leading-snug line-clamp-2 hover:text-forest-900">
                {{ card.title }}
              </h4>
              <p v-if="card.referenceNumber" class="font-mono text-[10px] text-zinc-400 mt-0.5 truncate">
                Ref: {{ card.referenceNumber }}
              </p>
            </div>

            <!-- Document Type & Due Date -->
            <div class="flex items-center justify-between gap-1 text-[11px] pt-1">
              <span class="font-medium text-forest-800 bg-forest-50 px-2 py-0.2 rounded text-[10px] border border-forest-100 truncate max-w-[140px]">
                {{ card.documentType }}
              </span>

              <span
                v-if="card.dueDate"
                :class="[
                  'text-[10px] shrink-0 font-medium',
                  isDocumentOverdue(card) ? 'text-red-700 font-bold' : 'text-zinc-500'
                ]"
              >
                Due: {{ formatDocDate(card.dueDate) }}
                <span v-if="isDocumentOverdue(card)" class="text-[9px] text-red-600 font-bold uppercase ml-0.5">!</span>
              </span>
            </div>

            <!-- Custody Location / In-Transit Status -->
            <div class="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px]">
              <!-- If In Transit -->
              <div v-if="card.status === 'in_transit'" class="flex items-center gap-1 text-sky-800 font-semibold truncate">
                <Send class="w-3 h-3 text-sky-600 animate-pulse shrink-0" />
                <span class="truncate">En Route &rarr; {{ card.activeDestinationOfficeCode || 'Dest' }}</span>
              </div>

              <!-- If Confirmed at Office -->
              <div v-else class="flex items-center gap-1 text-zinc-600 truncate max-w-[180px]">
                <MapPin class="w-3 h-3 text-zinc-400 shrink-0" />
                <span class="truncate">{{ card.currentOfficeCode || card.currentOfficeName || 'Office' }}</span>
              </div>

              <!-- In-transit Receive Button -->
              <button
                v-if="card.status === 'in_transit'"
                @click.stop="openReceiveModal(card)"
                type="button"
                class="px-1.5 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-semibold inline-flex items-center gap-1 shadow-2xs cursor-pointer shrink-0"
                title="Confirm physical receipt"
              >
                <CheckCircle2 class="w-2.5 h-2.5" />
                <span>Receive</span>
              </button>
            </div>

            <!-- Card Bottom Accessible Actions & "Move to..." -->
            <div class="pt-1.5 border-t border-zinc-100/80 flex items-center justify-between gap-1" @click.stop>
              <!-- Accessible "Move to..." dropdown (touch/keyboard support) -->
              <div class="relative">
                <button
                  @click="toggleCardMenu(card.id, $event)"
                  type="button"
                  class="px-2 py-0.5 rounded bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer"
                  title="Move document to another folder"
                >
                  <span>Move to</span>
                  <ChevronDown class="w-2.5 h-2.5 text-zinc-400" />
                </button>

                <!-- Move to Target Folders Menu -->
                <div
                  v-if="openCardMenuId === card.id"
                  class="absolute left-0 bottom-6 w-48 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-30 text-xs"
                  @click.stop
                >
                  <div class="px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    Select Target Folder
                  </div>
                  <button
                    v-for="targetFolder in allActiveFolders.filter((f) => f.id !== card.workflowFolderId)"
                    :key="targetFolder.id"
                    @click="executeMove(card, targetFolder); closeAllMenus()"
                    type="button"
                    class="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 flex items-center justify-between gap-2 cursor-pointer text-xs"
                  >
                    <span class="truncate">{{ targetFolder.name }}</span>
                    <span
                      v-if="targetFolder.behavior === 'destination'"
                      class="text-[9px] px-1 bg-sky-50 text-sky-700 rounded border border-sky-100"
                    >
                      Dest
                    </span>
                  </button>
                </div>
              </div>

              <!-- Quick Action Buttons -->
              <div class="flex items-center gap-1">
                <!-- Jump to Finance if AD linked -->
                <router-link
                  v-if="card.relatedFinanceRecordId"
                  :to="{ path: '/finance', query: { search: card.title } }"
                  class="p-1 rounded text-zinc-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                  title="View Activity Design in Finance"
                >
                  <FileText class="w-3 h-3 text-rose-600" />
                </router-link>

                <button
                  v-if="card.status !== 'in_transit'"
                  @click="openTransferModal(card)"
                  type="button"
                  class="p-1 rounded text-zinc-400 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                  title="Dispatch transfer to office"
                >
                  <Send class="w-3 h-3" />
                </button>

                <button
                  @click="openDetailDrawer(card)"
                  type="button"
                  class="p-1 rounded text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors"
                  title="View full history and movements"
                >
                  <Eye class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals Mount -->
    <!-- 1. Folder Modal (Create & Edit) -->
    <FolderModal
      :is-open="isFolderModalOpen"
      :folder-to-edit="folderToEdit"
      @close="isFolderModalOpen = false"
      @saved="handleFolderSaved"
    />

    <!-- 2. Archive Folder Modal (With safe document relocation) -->
    <ArchiveFolderModal
      :is-open="isArchiveModalOpen"
      :folder="folderToArchive"
      :document-count="folderToArchiveCount"
      :available-folders="allActiveFolders"
      @close="isArchiveModalOpen = false"
      @archived="handleFolderArchived"
    />

    <!-- 3. Add Document Modal (Registers into default or configured folder) -->
    <DocumentModal
      :is-open="isAddDocModalOpen"
      :document-to-edit="null"
      @close="isAddDocModalOpen = false"
      @saved="handleDocumentSaved"
    />

    <!-- 4. Document Detail Drawer (Complete audit log, movements, live folder switcher) -->
    <DocumentDetailDrawer
      :is-open="isDetailDrawerOpen"
      :document-id="selectedDocumentId"
      @close="isDetailDrawerOpen = false; selectedDocumentId = null"
      @updated="loadBoard"
      @transfer-requested="openTransferModal"
      @receive-requested="openReceiveModal"
    />

    <!-- 5. Transfer Modal (When dispatching to external/destination office) -->
    <TransferModal
      :is-open="isTransferModalOpen"
      :document="documentForTransfer"
      @close="isTransferModalOpen = false; documentForTransfer = null"
      @transferred="handleTransferred"
    />

    <!-- 6. Receive Modal (When confirming physical receipt) -->
    <ReceiveModal
      :is-open="isReceiveModalOpen"
      :document="documentForReceive"
      @close="isReceiveModalOpen = false; documentForReceive = null"
      @received="handleReceived"
    />
  </div>
</template>
