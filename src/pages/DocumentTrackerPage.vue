<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import DocumentModal from '../components/documents/DocumentModal.vue'
import DocumentDetailDrawer from '../components/documents/DocumentDetailDrawer.vue'
import TransferModal from '../components/documents/TransferModal.vue'
import ReceiveModal from '../components/documents/ReceiveModal.vue'
import CancelTransferModal from '../components/documents/CancelTransferModal.vue'
import {
  getDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  archiveDocument,
  restoreDocument,
  getDocumentSummaryMetrics,
  seedSampleDocumentsIfEmpty,
  clearSampleDocuments,
  formatDocDate,
  formatDocDateTime,
  isDocumentOverdue
} from '../services/documentService'
import { getWorkflowFolders } from '../services/workflowService'
import { getOffices } from '../services/officeService'
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from '../db/database'
import { toast } from '../composables/useToast'
import {
  FileText,
  Search,
  Filter,
  Plus,
  ArrowRight,
  MapPin,
  Clock,
  Send,
  Info,
  Copy,
  ChevronDown,
  CheckCircle2,
  Building2,
  Eye,
  Edit2,
  Archive,
  RotateCcw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FolderOpen,
  Sparkles,
  Kanban,
  Landmark
} from 'lucide-vue-next'

// State
const documentsList = ref([])
const officesList = ref([])
const workflowFoldersList = ref([])
const summaryMetrics = ref({
  totalActive: 0,
  inTransitCount: 0,
  pendingActionCount: 0,
  overdueCount: 0
})
const isLoading = ref(true)

// Filters & Search
const searchQuery = ref('')
const selectedQuickFilter = ref('all') // 'all', 'my_office', 'in_transit', 'pending_action', 'completed', 'archived'
const selectedStatus = ref('all')
const selectedFolder = ref('all')
const selectedOffice = ref('all')
const selectedType = ref('all')
const filterDateFrom = ref('')
const filterDateTo = ref('')

// Pagination
const currentPage = ref(1)
const pageSize = ref(10)

// Modals & Drawer State
const isAddEditModalOpen = ref(false)
const documentToEdit = ref(null)

const isDetailDrawerOpen = ref(false)
const selectedDocumentId = ref(null)

const isTransferModalOpen = ref(false)
const documentForTransfer = ref(null)

const isReceiveModalOpen = ref(false)
const documentForReceive = ref(null)

const isCancelTransferModalOpen = ref(false)
const documentForCancel = ref(null)

const copiedNumber = ref('')

// Quick Copy Helper
const copySlip = (num) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(num)
    copiedNumber.value = num
    setTimeout(() => {
      copiedNumber.value = ''
    }, 2000)
  }
}

// Load data from Dexie
const loadData = async () => {
  isLoading.value = true
  try {
    const [docs, offices, metrics, folders] = await Promise.all([
      getDocuments({
        search: searchQuery.value,
        quickFilter: selectedQuickFilter.value,
        status: selectedStatus.value,
        workflowFolderId: selectedFolder.value !== 'all' ? selectedFolder.value : null,
        officeId: selectedOffice.value,
        documentType: selectedType.value,
        dateFrom: filterDateFrom.value,
        dateTo: filterDateTo.value
      }),
      getOffices(),
      getDocumentSummaryMetrics(),
      getWorkflowFolders()
    ])

    documentsList.value = docs
    officesList.value = offices
    summaryMetrics.value = metrics
    workflowFoldersList.value = folders
  } catch (err) {
    console.error('Failed to load documents:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await clearSampleDocuments()
  await loadData()
})

// Debounced / watcher for filters
watch(
  [searchQuery, selectedQuickFilter, selectedStatus, selectedFolder, selectedOffice, selectedType, filterDateFrom, filterDateTo],
  () => {
    currentPage.value = 1
    loadData()
  }
)

// Pagination slicing
const totalPages = computed(() => {
  return Math.ceil(documentsList.value.length / pageSize.value) || 1
})

const paginatedDocs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return documentsList.value.slice(start, start + pageSize.value)
})

// Modal Openers
const openAddModal = () => {
  documentToEdit.value = null
  isAddEditModalOpen.value = true
}

const openEditModal = (doc) => {
  documentToEdit.value = doc
  isAddEditModalOpen.value = true
}

const openDetailDrawer = (doc) => {
  selectedDocumentId.value = doc.id
  isDetailDrawerOpen.value = true
}

const openTransferModal = (doc) => {
  documentForTransfer.value = doc
  isTransferModalOpen.value = true
}

const openReceiveModal = (doc) => {
  documentForReceive.value = doc
  isReceiveModalOpen.value = true
}

const openCancelModal = (doc) => {
  documentForCancel.value = doc
  isCancelTransferModalOpen.value = true
}

// Save Handlers
const handleDocumentSaved = async ({ isEdit, id, data }) => {
  try {
    if (isEdit) {
      await updateDocument(id, data)
      toast.success('Document updated successfully.')
    } else {
      await createDocument(data)
      toast.success('Document registered and placed in initial workflow folder.')
    }
    isAddEditModalOpen.value = false
    await loadData()
  } catch (err) {
    toast.error('Unable to save changes. Please try again.', err.message)
  }
}

const handleArchiveToggle = async (doc) => {
  try {
    if (doc.isArchived) {
      await restoreDocument(doc.id)
      toast.success('Document restored.')
    } else {
      await archiveDocument(doc.id)
      toast.success('Document archived.')
    }
    await loadData()
  } catch (err) {
    toast.error('Error archiving document: ' + err.message)
  }
}

const handleDeleteDoc = async (doc) => {
  if (
    confirm(
      `Are you sure you want to delete document ${doc.trackingNumber}? All its movements will also be removed.`
    )
  ) {
    try {
      await deleteDocument(doc.id)
      toast.success('Document deleted.')
      await loadData()
    } catch (err) {
      toast.error('Error deleting document: ' + err.message)
    }
  }
}

const resetFilters = () => {
  searchQuery.value = ''
  selectedQuickFilter.value = 'all'
  selectedStatus.value = 'all'
  selectedFolder.value = 'all'
  selectedOffice.value = 'all'
  selectedType.value = 'all'
  filterDateFrom.value = ''
  filterDateTo.value = ''
}

const handleSeedDemo = async () => {
  await seedSampleDocumentsIfEmpty()
  await loadData()
}

const handleClearDemo = async () => {
  if (confirm('Clear all demo sample documents? Custom documents will remain intact.')) {
    await clearSampleDocuments()
    await loadData()
  }
}

// Badge Helpers
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
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <div class="bg-forest-50/70 border border-forest-200/70 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-forest-900 shadow-2xs">
      <div class="flex items-start gap-3">
        <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
        <div>
          <span class="font-semibold text-forest-950">Physical Document Routing System:</span>
          Track incoming paper files, assign permanent tracking slips, and monitor physical custody transfers between government divisions. All movement audits persist offline in IndexedDB.
        </div>
      </div>
    </div>

    <!-- Header & Action -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
          Document Tracker
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
          Register, locate, and monitor documents as they move between offices.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <router-link
          to="/workflow"
          class="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs transition-colors"
        >
          <Kanban class="w-3.5 h-3.5 text-forest-700" />
          <span>Workflow Board</span>
        </router-link>

        <BaseButton
          variant="primary"
          size="sm"
          @click="openAddModal"
        >
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Add Document
        </BaseButton>
      </div>
    </div>

    <!-- Metric Cards Sub-Row (4 Cards) -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <!-- Active Documents -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between text-zinc-500 text-xs">
          <span>Active Files</span>
          <FileText class="w-4 h-4 text-forest-700" />
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-zinc-900">{{ summaryMetrics.totalActive }}</span>
          <span class="text-[11px] text-zinc-500">tracked</span>
        </div>
      </BaseCard>

      <!-- In Transit -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between text-zinc-500 text-xs">
          <span>In Transit</span>
          <Send class="w-4 h-4 text-sky-600" />
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-sky-700">{{ summaryMetrics.inTransitCount }}</span>
          <span class="text-[11px] text-sky-600">in flight</span>
        </div>
      </BaseCard>

      <!-- Pending Action -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between text-zinc-500 text-xs">
          <span>Pending Action</span>
          <Clock class="w-4 h-4 text-amber-600" />
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span class="text-2xl font-bold text-amber-700">{{ summaryMetrics.pendingActionCount }}</span>
          <span class="text-[11px] text-amber-600">awaiting</span>
        </div>
      </BaseCard>

      <!-- Overdue -->
      <BaseCard compact class="hover:border-zinc-300 transition-colors">
        <div class="flex items-center justify-between text-zinc-500 text-xs">
          <span>Overdue</span>
          <AlertTriangle class="w-4 h-4 text-red-600" />
        </div>
        <div class="mt-2 flex items-baseline gap-2">
          <span :class="['text-2xl font-bold', summaryMetrics.overdueCount > 0 ? 'text-red-700' : 'text-zinc-900']">
            {{ summaryMetrics.overdueCount }}
          </span>
          <span class="text-[11px] text-zinc-500">past target</span>
        </div>
      </BaseCard>
    </div>

    <!-- Quick Filters Tabs -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
      <button
        v-for="tab in [
          { id: 'all', label: 'All Documents' },
          { id: 'my_office', label: 'My Office' },
          { id: 'in_transit', label: 'In Transit' },
          { id: 'pending_action', label: 'Pending Action' },
          { id: 'completed', label: 'Completed' },
          { id: 'archived', label: 'Archived' }
        ]"
        :key="tab.id"
        @click="selectedQuickFilter = tab.id"
        type="button"
        :class="[
          'px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer h-7 leading-none inline-flex items-center',
          selectedQuickFilter === tab.id
            ? 'bg-forest-800 text-white shadow-xs'
            : 'text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200/80 hover:bg-zinc-50'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Toolbar: Search + Dropdown Filters -->
    <div class="bg-white rounded-xl border border-zinc-200/80 p-3 shadow-2xs space-y-3">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search tracking #, title, reference #, sender, or office..."
            class="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600"
          />
        </div>

        <!-- Reset Button -->
        <button
          v-if="searchQuery || selectedStatus !== 'all' || selectedFolder !== 'all' || selectedOffice !== 'all' || selectedType !== 'all' || filterDateFrom || filterDateTo"
          @click="resetFilters"
          type="button"
          class="text-xs text-zinc-500 hover:text-forest-900 underline shrink-0 cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      <!-- Advanced Filter Row: Folder, Status, Office, Document Type, Date Range -->
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <!-- Folder Filter -->
        <div>
          <select
            v-model="selectedFolder"
            class="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 cursor-pointer"
          >
            <option value="all">All Routing Folders</option>
            <option v-for="folder in workflowFoldersList" :key="folder.id" :value="folder.id">
              {{ folder.name }}
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

        <!-- Office Filter -->
        <div>
          <select
            v-model="selectedOffice"
            class="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 cursor-pointer"
          >
            <option value="all">All Offices</option>
            <option v-for="off in officesList" :key="off.id" :value="off.id">
              {{ off.code }} — {{ off.name }}
            </option>
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

        <!-- Date From Filter -->
        <div>
          <input
            v-model="filterDateFrom"
            type="date"
            class="w-full px-2 py-1.5 bg-white border border-zinc-200 rounded-lg text-zinc-700 text-xs focus:outline-none focus:ring-1 focus:ring-forest-600"
            title="Registered on or after"
          />
        </div>
      </div>
    </div>

    <!-- Documents Responsive Table Card -->
    <BaseCard>
      <!-- Loading State -->
      <div v-if="isLoading" class="p-8 text-center text-xs text-zinc-400 space-y-2">
        <div class="animate-spin w-6 h-6 border-2 border-forest-700 border-t-transparent rounded-full mx-auto"></div>
        <p>Loading document tracking registry...</p>
      </div>

      <!-- Table View -->
      <div v-else class="overflow-x-auto -mx-5 -my-5">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-zinc-200/80 bg-zinc-50/70 text-zinc-500 font-medium">
              <th class="py-3 px-4 font-semibold whitespace-nowrap">Tracking No.</th>
              <th class="py-3 px-4 font-semibold min-w-[240px]">Document Title & Subject</th>
              <th class="py-3 px-4 font-semibold whitespace-nowrap">Routing Folder</th>
              <th class="py-3 px-4 font-semibold whitespace-nowrap">Document Type</th>
              <th class="py-3 px-4 font-semibold whitespace-nowrap">Registered</th>
              <th class="py-3 px-4 font-semibold whitespace-nowrap">Origin Office</th>
              <th class="py-3 px-4 font-semibold whitespace-nowrap">Current / In Flight Office</th>
              <th class="py-3 px-4 font-semibold whitespace-nowrap">Status</th>
              <th class="py-3 px-4 font-semibold text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-zinc-100">
            <tr
              v-for="doc in paginatedDocs"
              :key="doc.id"
              class="hover:bg-zinc-50/80 transition-colors cursor-pointer group"
              @click="openDetailDrawer(doc)"
            >
              <!-- 1. Tracking Number -->
              <td class="py-3 px-4 font-mono font-medium whitespace-nowrap" @click.stop>
                <div class="flex items-center gap-1.5">
                  <button
                    @click="copySlip(doc.trackingNumber)"
                    type="button"
                    class="px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200/70 inline-flex items-center gap-1 cursor-pointer"
                    title="Click to copy tracking #"
                  >
                    <span>{{ doc.trackingNumber }}</span>
                    <Copy class="w-2.5 h-2.5 text-zinc-400" />
                  </button>
                  <span v-if="copiedNumber === doc.trackingNumber" class="text-[10px] text-emerald-600 font-sans">
                    Copied!
                  </span>
                </div>
              </td>

              <!-- 2. Title & Subject -->
              <td class="py-3 px-4 min-w-[240px]">
                <div class="flex items-center gap-1.5 flex-wrap mb-1">
                  <span v-if="doc.relatedFinanceRecordId" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                    Activity Design
                  </span>
                  <span v-if="doc.prNumber" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                    PR: {{ doc.prNumber }}
                  </span>
                  <span v-if="doc.amountOfAd" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700">
                    ₱{{ Number(doc.amountOfAd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                  </span>
                </div>
                <div class="font-semibold text-zinc-900 group-hover:text-forest-900 line-clamp-1 leading-snug">
                  {{ doc.title }}
                </div>
                <div class="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400 flex-wrap">
                  <span v-if="doc.dateOfActivity" class="text-zinc-600 font-medium">
                    Event: {{ formatDocDate(doc.dateOfActivity) }}
                  </span>
                  <span v-if="doc.description" class="truncate max-w-xs text-zinc-500">
                    {{ doc.description }}
                  </span>
                  <span v-if="doc.dueDate" :class="isDocumentOverdue(doc) ? 'text-red-700 font-bold' : 'text-zinc-500'">
                    Due: {{ formatDocDate(doc.dueDate) }}
                    <span v-if="isDocumentOverdue(doc)" class="text-[9px] text-red-600 uppercase font-bold">OVERDUE</span>
                  </span>
                </div>
              </td>

              <!-- 3. Workflow Folder -->
              <td class="py-3 px-4 whitespace-nowrap">
                <span class="inline-flex items-center gap-1 font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded text-[11px] border border-zinc-200/80">
                  <FolderOpen class="w-3 h-3 text-forest-700 shrink-0" />
                  <span>{{ doc.workflowFolderName || 'TCYSDO OFFICE' }}</span>
                </span>
              </td>

              <!-- 4. Document Type -->
              <td class="py-3 px-4 whitespace-nowrap">
                <span class="font-medium text-forest-800 bg-forest-50 px-2 py-0.5 rounded text-[11px] border border-forest-100">
                  {{ doc.documentType }}
                </span>
              </td>

              <!-- 5. Date Registered -->
              <td class="py-3 px-4 text-zinc-500 whitespace-nowrap text-[11px]">
                {{ formatDocDate(doc.dateRegistered) }}
              </td>

              <!-- 6. Originating Office -->
              <td class="py-3 px-4 whitespace-nowrap text-zinc-700 text-[11px]">
                <span class="font-medium">{{ doc.originatingOfficeCode || '—' }}</span>
                <span class="text-zinc-400 ml-1 truncate max-w-[120px] inline-block align-bottom hidden lg:inline">
                  {{ doc.originatingOfficeName }}
                </span>
              </td>

              <!-- 7. Current Office or In Flight Destination -->
              <td class="py-3 px-4 whitespace-nowrap">
                <div v-if="doc.status === 'in_transit'" class="flex items-center gap-1.5 text-sky-800 font-semibold text-[11px]">
                  <Send class="w-3 h-3 text-sky-600 animate-pulse shrink-0" />
                  <span>En Route &rarr; {{ doc.activeDestinationOfficeCode || 'Destination' }}</span>
                </div>
                <div v-else class="flex items-center gap-1.5 text-zinc-800 text-[11px]">
                  <MapPin class="w-3 h-3 text-zinc-400 shrink-0" />
                  <span>{{ doc.currentOfficeCode || doc.currentOfficeName || 'Office' }}</span>
                </div>
              </td>

              <!-- 8. Document Status -->
              <td class="py-3 px-4 whitespace-nowrap">
                <BaseBadge :variant="getStatusBadgeVariant(doc.status)" size="xs" dot>
                  {{ doc.status.replace(/_/g, ' ').toUpperCase() }}
                </BaseBadge>
              </td>

              <!-- 9. Actions Column -->
              <td class="py-3 px-4 text-right whitespace-nowrap" @click.stop>
                <div class="flex items-center justify-end gap-1">
                  <!-- Link to Finance if AD linked -->
                  <router-link
                    v-if="doc.relatedFinanceRecordId"
                    :to="{ path: '/finance', query: { search: doc.title } }"
                    class="p-1.5 rounded hover:bg-rose-50 text-zinc-500 hover:text-rose-700 transition-colors"
                    title="View Activity Design in Finance Monitoring"
                  >
                    <FileText class="w-3.5 h-3.5 text-rose-600" />
                  </router-link>

                  <!-- If In Transit: show Confirm Receipt button directly -->
                  <button
                    v-if="doc.status === 'in_transit'"
                    @click="openReceiveModal(doc)"
                    type="button"
                    class="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-medium text-[11px] inline-flex items-center gap-1 shadow-2xs cursor-pointer h-7 leading-none"
                    title="Confirm physical receipt"
                  >
                    <CheckCircle2 class="w-3 h-3 text-emerald-200" />
                    <span>Receive</span>
                  </button>

                  <!-- If Not in transit: Quick Transfer -->
                  <button
                    v-else-if="!doc.isArchived"
                    @click="openTransferModal(doc)"
                    type="button"
                    class="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer h-7 leading-none"
                    title="Transfer document"
                  >
                    <Send class="w-3 h-3 text-sky-600" />
                    <span>Transfer</span>
                  </button>

                  <!-- View Details -->
                  <button
                    @click="openDetailDrawer(doc)"
                    type="button"
                    class="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
                    title="View details and movements"
                  >
                    <Eye class="w-3.5 h-3.5" />
                  </button>

                  <!-- Edit -->
                  <button
                    @click="openEditModal(doc)"
                    type="button"
                    class="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
                    title="Edit document"
                  >
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>

                  <!-- Delete -->
                  <button
                    @click="handleDeleteDoc(doc)"
                    type="button"
                    class="p-1.5 rounded hover:bg-red-50 text-zinc-400 hover:text-red-700 transition-colors"
                    title="Delete document"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-if="paginatedDocs.length === 0">
              <td colspan="9" class="py-12 text-center text-xs text-zinc-400 space-y-3">
                <FolderOpen class="w-8 h-8 text-zinc-300 mx-auto" />
                <p class="font-medium text-zinc-600">No physical documents match your criteria.</p>
                <div class="flex items-center justify-center gap-2">
                  <BaseButton variant="primary" size="sm" @click="openAddModal">
                    <Plus class="w-3.5 h-3.5 text-rose-200 mr-1" />
                    Log First Document
                  </BaseButton>
                  <BaseButton variant="secondary" size="sm" @click="resetFilters">
                    Clear Filters
                  </BaseButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div v-if="documentsList.length > 0" class="pt-4 border-t border-zinc-100 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <div>
          Showing <strong>{{ (currentPage - 1) * pageSize + 1 }}</strong> to
          <strong>{{ Math.min(currentPage * pageSize, documentsList.length) }}</strong> of
          <strong>{{ documentsList.length }}</strong> documents
        </div>

        <div class="flex items-center gap-1.5">
          <button
            @click="currentPage = Math.max(1, currentPage - 1)"
            :disabled="currentPage === 1"
            class="p-1.5 rounded border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Previous page"
          >
            <ChevronLeft class="w-3.5 h-3.5" />
          </button>

          <span class="px-2 font-medium">Page {{ currentPage }} of {{ totalPages }}</span>

          <button
            @click="currentPage = Math.min(totalPages, currentPage + 1)"
            :disabled="currentPage === totalPages"
            class="p-1.5 rounded border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Next page"
          >
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </BaseCard>

    <!-- Modals & Drawers -->
    <!-- Add / Edit Document Modal -->
    <DocumentModal
      :is-open="isAddEditModalOpen"
      :document-to-edit="documentToEdit"
      @close="isAddEditModalOpen = false"
      @saved="handleDocumentSaved"
    />

    <!-- Document Detail Drawer -->
    <DocumentDetailDrawer
      :is-open="isDetailDrawerOpen"
      :document-id="selectedDocumentId"
      @close="isDetailDrawerOpen = false"
      @updated="loadData"
      @deleted="loadData"
    />

    <!-- Quick Transfer Modal -->
    <TransferModal
      :is-open="isTransferModalOpen"
      :document="documentForTransfer"
      @close="isTransferModalOpen = false"
      @transferred="loadData"
    />

    <!-- Quick Receive Modal -->
    <ReceiveModal
      :is-open="isReceiveModalOpen"
      :document="documentForReceive"
      @close="isReceiveModalOpen = false"
      @received="loadData"
    />

    <!-- Cancel Transfer Modal -->
    <CancelTransferModal
      :is-open="isCancelTransferModalOpen"
      :document="documentForCancel"
      @close="isCancelTransferModalOpen = false"
      @cancelled="loadData"
    />
  </div>
</template>
