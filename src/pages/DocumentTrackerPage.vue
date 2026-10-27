<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import DocumentModal from '../components/documents/DocumentModal.vue'
import DocumentDetailDrawer from '../components/documents/DocumentDetailDrawer.vue'
import FinanceDetailModal from '../components/finance/FinanceDetailModal.vue'
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
import { getFinanceRecords } from '../services/financeService'
import db, { DOCUMENT_TYPES, DOCUMENT_STATUSES } from '../db/database'
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
const financeRecordsList = ref([])
const summaryMetrics = ref({
  totalActive: 0,
  inTransitCount: 0,
  pendingActionCount: 0,
  overdueCount: 0
})
const isLoading = ref(true)

// Filters & Search
const route = useRoute()
const searchQuery = ref(route.query.search ? String(route.query.search) : '')
const selectedQuickFilter = ref('all') // 'all', 'my_office', 'in_transit', 'pending_action', 'completed', 'archived'
const selectedStatus = ref('all')
const selectedFolder = ref('all')
const selectedOffice = ref('all')
const selectedType = ref('all')
const selectedFinanceFilter = ref('all')
const filterDateFrom = ref('')
const filterDateTo = ref('')

// Pagination
const currentPage = ref(1)
const pageSize = ref(10)

// Modals & Drawer State
const isAddEditModalOpen = ref(false)
const documentToEdit = ref(null)
const initialRegistrationValues = ref(null)

const isDetailDrawerOpen = ref(false)
const selectedDocumentId = ref(null)

const isAdDetailModalOpen = ref(false)
const selectedAdRecord = ref(null)

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

// Load data from Dexie / SQLite
const loadData = async () => {
  isLoading.value = true
  try {
    const [docs, offices, metrics, folders, finRecords] = await Promise.all([
      getDocuments({
        search: searchQuery.value,
        quickFilter: selectedQuickFilter.value,
        status: selectedStatus.value,
        workflowFolderId: selectedFolder.value !== 'all' ? selectedFolder.value : null,
        officeId: selectedOffice.value,
        documentType: selectedType.value,
        financeRecordId: selectedFinanceFilter.value !== 'all' ? selectedFinanceFilter.value : null,
        dateFrom: filterDateFrom.value,
        dateTo: filterDateTo.value
      }),
      getOffices(),
      getDocumentSummaryMetrics(),
      getWorkflowFolders(),
      getFinanceRecords()
    ])

    documentsList.value = docs
    officesList.value = offices
    summaryMetrics.value = metrics
    workflowFoldersList.value = folders
    financeRecordsList.value = finRecords || []
  } catch (err) {
    console.error('Failed to load documents:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  if (route.query.search) {
    searchQuery.value = String(route.query.search)
  }
  await clearSampleDocuments()
  await loadData()
})

watch(
  () => route.query.search,
  (newSearch) => {
    if (newSearch !== undefined) {
      searchQuery.value = String(newSearch || '')
    }
  }
)

// Debounced / watcher for filters
watch(
  [searchQuery, selectedQuickFilter, selectedStatus, selectedFolder, selectedOffice, selectedType, selectedFinanceFilter, filterDateFrom, filterDateTo],
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
  initialRegistrationValues.value = null
  isAddEditModalOpen.value = true
}

const openEditModal = (doc) => {
  documentToEdit.value = doc
  initialRegistrationValues.value = null
  isAddEditModalOpen.value = true
}

const openDetailDrawer = (doc) => {
  selectedDocumentId.value = doc.id
  isDetailDrawerOpen.value = true
}

const openAdDetail = async (adIdOrDoc) => {
  let adId = null
  if (typeof adIdOrDoc === 'number' || typeof adIdOrDoc === 'string') {
    adId = Number(adIdOrDoc)
  } else if (adIdOrDoc && adIdOrDoc.relatedFinanceRecordId) {
    adId = Number(adIdOrDoc.relatedFinanceRecordId)
  }
  if (!adId) return

  const rec = (financeRecordsList.value || []).find((r) => r.id === adId) || (await db.financeRecords.get(adId))
  if (rec) {
    selectedAdRecord.value = rec
    isAdDetailModalOpen.value = true
  }
}

const handleRegisterFromAd = (payload) => {
  initialRegistrationValues.value = payload
  documentToEdit.value = null
  isAddEditModalOpen.value = true
}

const handleOpenDocumentFromAd = (doc) => {
  if (doc && doc.id) {
    selectedDocumentId.value = doc.id
    isDetailDrawerOpen.value = true
  }
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
    initialRegistrationValues.value = null
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
  selectedFinanceFilter.value = 'all'
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
    <!-- <div class="bg-forest-50/70 border border-forest-200/70 rounded-xl p-3.5 flex items-start justify-between gap-3 text-xs text-forest-900 shadow-2xs">
      <div class="flex items-start gap-3">
        <Info class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
        <div>
          <span class="font-semibold text-forest-950">Physical Document Routing System:</span>
          Track incoming paper files, assign permanent tracking slips, and monitor physical custody transfers between government divisions. All movement audits persist offline in IndexedDB.
        </div>
      </div>
    </div> -->

    <!-- Header & Action -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1] tracking-tight">
          Document Tracker
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 dark:text-[#BCAEBA] mt-0.5">
          Register, locate, and monitor documents as they move between offices.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <router-link
          to="/workflow"
          class="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#201A1E] hover:bg-zinc-50 dark:hover:bg-[#2A2228] text-zinc-700 dark:text-[#DDD2D9] text-xs font-medium inline-flex items-center gap-1.5 shadow-2xs transition-colors"
        >
          <Kanban class="w-3.5 h-3.5 text-forest-700 dark:text-[#F294B7]" />
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
            : 'text-zinc-600 dark:text-[#DDD2D9] hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-[#201A1E] border border-zinc-200/80 dark:border-[#2D252B] hover:bg-zinc-50 dark:hover:bg-[#2A2228]'
        ]"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Toolbar: Search + Dropdown Filters -->
    <div class="bg-white dark:bg-[#1A1719] rounded-xl border border-zinc-200/80 dark:border-[#2D252B] p-3 shadow-2xs space-y-3">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="w-3.5 h-3.5 text-zinc-400 dark:text-[#806B76] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search tracking #, title, reference #, sender, or office..."
            class="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-lg text-zinc-800 dark:text-[#F5EDF1] placeholder:text-zinc-400 dark:placeholder-[#806B76] focus:outline-none focus:ring-2 focus:ring-forest-600 dark:focus:ring-[#F294B7]"
          />
        </div>

        <!-- Reset Button -->
        <button
          v-if="searchQuery || selectedStatus !== 'all' || selectedFolder !== 'all' || selectedOffice !== 'all' || selectedType !== 'all' || selectedFinanceFilter !== 'all' || filterDateFrom || filterDateTo"
          @click="resetFilters"
          type="button"
          class="text-xs text-zinc-500 dark:text-[#BCAEBA] hover:text-forest-900 dark:hover:text-[#F294B7] underline shrink-0 cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      <!-- Advanced Filter Row: Folder, Status, Office, Document Type, Activity Design, Date Range -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
        <!-- Folder Filter -->
        <div>
          <select
            v-model="selectedFolder"
            class="w-full px-2 py-1.5 bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-lg text-zinc-700 dark:text-[#DDD2D9] text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 dark:focus:ring-[#F294B7] cursor-pointer"
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
            class="w-full px-2 py-1.5 bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-lg text-zinc-700 dark:text-[#DDD2D9] text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 dark:focus:ring-[#F294B7] cursor-pointer"
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
            class="w-full px-2 py-1.5 bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-lg text-zinc-700 dark:text-[#DDD2D9] text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 dark:focus:ring-[#F294B7] cursor-pointer"
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
            class="w-full px-2 py-1.5 bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-lg text-zinc-700 dark:text-[#DDD2D9] text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 dark:focus:ring-[#F294B7] cursor-pointer"
          >
            <option value="all">All Document Types</option>
            <option v-for="t in DOCUMENT_TYPES" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
        </div>

        <!-- Activity Design Filter -->
        <div>
          <select
            v-model="selectedFinanceFilter"
            class="w-full px-2 py-1.5 bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-lg text-zinc-700 dark:text-[#DDD2D9] text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 dark:focus:ring-[#F294B7] cursor-pointer"
          >
            <option value="all">All Activity Designs</option>
            <option v-for="ad in financeRecordsList" :key="ad.id" :value="ad.id">
              {{ ad.activityDesign || ('AD #' + ad.id) }}
            </option>
          </select>
        </div>

        <!-- Date From Filter -->
        <div>
          <input
            v-model="filterDateFrom"
            type="date"
            class="w-full px-2 py-1.5 bg-white dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-lg text-zinc-700 dark:text-[#DDD2D9] text-xs focus:outline-none focus:ring-1 focus:ring-forest-600 dark:focus:ring-[#F294B7]"
            title="Registered on or after"
          />
        </div>
      </div>
    </div>

    <!-- Documents Responsive Table Card -->
    <BaseCard>
      <!-- Loading State -->
      <div v-if="isLoading" class="p-8 text-center text-xs text-zinc-400 dark:text-[#806B76] space-y-2">
        <div class="animate-spin w-6 h-6 border-2 border-forest-700 dark:border-[#F294B7] border-t-transparent rounded-full mx-auto"></div>
        <p>Loading document tracking registry...</p>
      </div>

      <!-- Table View -->
      <div v-else class="overflow-x-auto -mx-5 -my-5">
        <table class="w-full text-left border-collapse text-xs">
          <thead>
            <tr class="border-b border-zinc-200/80 dark:border-[#2D252B] bg-zinc-50/70 dark:bg-[#201A1E] text-zinc-500 dark:text-[#BCAEBA] font-medium align-middle">
              <th class="py-3.5 px-4 font-semibold whitespace-nowrap text-center align-middle w-36">Tracking No.</th>
              <th class="py-3.5 px-4 font-semibold min-w-[200px] max-w-sm align-middle">Document Title</th>
              <th class="py-3.5 px-4 font-semibold min-w-[170px] max-w-xs align-middle">Linked Activity Design</th>
              <th class="py-3.5 px-4 font-semibold whitespace-nowrap text-center align-middle w-44">Routing Folder</th>
              <th class="py-3.5 px-4 font-semibold whitespace-nowrap text-center align-middle w-36">Document Type</th>
              <th class="py-3.5 px-4 font-semibold whitespace-nowrap text-center align-middle w-32">Registered</th>
              <th class="py-3.5 px-4 font-semibold whitespace-nowrap text-center align-middle w-36">Origin Office</th>
              <th class="py-3.5 px-4 font-semibold whitespace-nowrap text-center align-middle w-44">Current / In Flight Office</th>
              <th class="py-3.5 px-4 font-semibold whitespace-nowrap text-center align-middle w-32">Status</th>
              <th class="py-3.5 px-4 font-semibold text-center whitespace-nowrap align-middle w-36">Actions</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-zinc-100 dark:divide-[#2D252B]">
            <tr
              v-for="doc in paginatedDocs"
              :key="doc.id"
              class="hover:bg-zinc-50/80 dark:hover:bg-[#251F23]/60 transition-colors cursor-pointer group align-middle"
              @click="openDetailDrawer(doc)"
            >
              <!-- 1. Tracking Number -->
              <td class="py-3.5 px-4 font-mono font-medium whitespace-nowrap align-middle text-center" @click.stop>
                <div class="inline-flex items-center justify-center gap-1.5">
                  <button
                    @click="copySlip(doc.trackingNumber)"
                    type="button"
                    class="px-2 py-0.5 rounded bg-zinc-100 dark:bg-[#251F23] hover:bg-zinc-200 dark:hover:bg-[#2D232A] text-zinc-800 dark:text-[#F5EDF1] border border-zinc-200/70 dark:border-[#3D2D38] inline-flex items-center gap-1 cursor-pointer transition-colors"
                    title="Click to copy tracking #"
                  >
                    <span>{{ doc.trackingNumber }}</span>
                    <Copy class="w-2.5 h-2.5 text-zinc-400 dark:text-[#806B76]" />
                  </button>
                  <span v-if="copiedNumber === doc.trackingNumber" class="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-medium">
                    Copied!
                  </span>
                </div>
              </td>

              <!-- 2. Document Title -->
              <td class="py-3.5 px-4 min-w-[200px] max-w-sm align-middle">
                <div class="font-semibold text-zinc-900 dark:text-[#F5EDF1] group-hover:text-forest-900 dark:group-hover:text-[#F294B7] leading-snug transition-colors line-clamp-2" :title="doc.title">
                  {{ doc.title }}
                </div>
              </td>

              <!-- 3. Linked Activity Design -->
              <td class="py-3.5 px-4 min-w-[170px] max-w-xs align-middle" @click.stop>
                <button
                  v-if="doc.relatedFinanceRecordId && (doc.linkedAdTitle || doc.relatedFinanceRecord)"
                  @click="openAdDetail(doc.relatedFinanceRecordId)"
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-forest-50 dark:bg-[#2D1F28] hover:bg-forest-100 dark:hover:bg-[#3D2534] text-forest-800 dark:text-[#F294B7] border border-forest-200/80 dark:border-[#4A2D3C] text-[11px] font-medium transition-colors text-left max-w-full group/ad cursor-pointer"
                  :title="'Click to view master Activity Design lifecycle: ' + (doc.linkedAdTitle || 'Activity Design')"
                >
                  <Landmark class="w-3 h-3 text-forest-700 dark:text-[#F294B7] shrink-0" />
                  <span class="truncate">{{ doc.linkedAdTitle || 'Activity Design #' + doc.relatedFinanceRecordId }}</span>
                </button>
                <span v-else class="text-zinc-400 dark:text-[#806B76] text-[11px] italic">
                  — Standalone
                </span>
              </td>

              <!-- 4. Workflow Folder -->
              <td class="py-3.5 px-4 whitespace-nowrap align-middle text-center">
                <div class="flex items-center justify-center">
                  <span class="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-[#DDD2D9] bg-zinc-100 dark:bg-[#251F23] px-2.5 py-1 rounded-md text-[11px] border border-zinc-200/80 dark:border-[#3D2D38]">
                    <FolderOpen class="w-3.5 h-3.5 text-forest-700 dark:text-[#F294B7] shrink-0" />
                    <span>{{ doc.workflowFolderName || 'TCYSDO OFFICE' }}</span>
                  </span>
                </div>
              </td>

              <!-- 5. Document Type -->
              <td class="py-3.5 px-4 whitespace-nowrap align-middle text-center">
                <div class="flex items-center justify-center">
                  <span class="inline-flex items-center font-medium text-forest-800 dark:text-[#F294B7] bg-forest-50 dark:bg-[#2D1F28] px-2.5 py-1 rounded-md text-[11px] border border-forest-100 dark:border-[#4A2D3C]">
                    {{ doc.documentType }}
                  </span>
                </div>
              </td>

              <!-- 6. Date Registered -->
              <td class="py-3.5 px-4 text-zinc-500 dark:text-[#BCAEBA] whitespace-nowrap text-[11px] align-middle text-center font-medium">
                {{ formatDocDate(doc.dateRegistered) }}
              </td>

              <!-- 7. Originating Office -->
              <td class="py-3.5 px-4 whitespace-nowrap text-zinc-700 dark:text-[#DDD2D9] text-[11px] align-middle text-center">
                <div class="inline-flex items-center justify-center gap-1.5 font-medium" :title="doc.originatingOfficeName">
                  <Building2 class="w-3.5 h-3.5 text-zinc-400 dark:text-[#806B76] shrink-0" />
                  <span>{{ doc.originatingOfficeCode || doc.originatingOfficeName || '—' }}</span>
                </div>
              </td>

              <!-- 8. Current Office or In Flight Destination -->
              <td class="py-3.5 px-4 whitespace-nowrap align-middle text-center">
                <div v-if="doc.status === 'in_transit'" class="inline-flex items-center justify-center gap-1.5 text-sky-800 dark:text-sky-300 font-semibold text-[11px] bg-sky-50 dark:bg-sky-950/40 px-2.5 py-1 rounded-md border border-sky-200 dark:border-sky-800">
                  <Send class="w-3 h-3 text-sky-600 dark:text-sky-400 animate-pulse shrink-0" />
                  <span>En Route &rarr; {{ doc.activeDestinationOfficeCode || 'Destination' }}</span>
                </div>
                <div v-else class="inline-flex items-center justify-center gap-1.5 text-zinc-800 dark:text-[#DDD2D9] text-[11px]">
                  <MapPin class="w-3.5 h-3.5 text-zinc-400 dark:text-[#806B76] shrink-0" />
                  <span class="font-medium">{{ doc.currentOfficeCode || doc.currentOfficeName || 'Office' }}</span>
                </div>
              </td>

              <!-- 9. Document Status -->
              <td class="py-3.5 px-4 whitespace-nowrap align-middle text-center">
                <div class="flex items-center justify-center">
                  <BaseBadge :variant="getStatusBadgeVariant(doc.status)" size="xs" dot>
                    {{ doc.status.replace(/_/g, ' ').toUpperCase() }}
                  </BaseBadge>
                </div>
              </td>

              <!-- 10. Actions Column -->
              <td class="py-3.5 px-4 text-center whitespace-nowrap align-middle" @click.stop>
                <div class="flex items-center justify-center gap-1">
                  <!-- View Activity Design Lifecycle if linked -->
                  <button
                    v-if="doc.relatedFinanceRecordId"
                    @click="openAdDetail(doc.relatedFinanceRecordId)"
                    type="button"
                    class="p-1.5 rounded hover:bg-forest-50 dark:hover:bg-forest-950/40 text-zinc-500 dark:text-[#BCAEBA] hover:text-forest-700 dark:hover:text-[#F294B7] transition-colors cursor-pointer"
                    title="View master Activity Design lifecycle"
                  >
                    <Landmark class="w-3.5 h-3.5 text-forest-700 dark:text-[#F294B7]" />
                  </button>

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
                    class="px-2 py-1 rounded bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/40 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer h-7 leading-none"
                    title="Transfer document"
                  >
                    <Send class="w-3 h-3 text-sky-600 dark:text-sky-400" />
                    <span>Transfer</span>
                  </button>

                  <!-- View Details -->
                  <button
                    @click="openDetailDrawer(doc)"
                    type="button"
                    class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-[#251F23] text-zinc-500 dark:text-[#BCAEBA] hover:text-zinc-800 dark:hover:text-[#F5EDF1] transition-colors cursor-pointer"
                    title="View details and movements"
                  >
                    <Eye class="w-3.5 h-3.5" />
                  </button>

                  <!-- Edit -->
                  <button
                    @click="openEditModal(doc)"
                    type="button"
                    class="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-[#251F23] text-zinc-500 dark:text-[#BCAEBA] hover:text-zinc-800 dark:hover:text-[#F5EDF1] transition-colors cursor-pointer"
                    title="Edit document"
                  >
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>

                  <!-- Delete -->
                  <button
                    @click="handleDeleteDoc(doc)"
                    type="button"
                    class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 dark:text-[#806B76] hover:text-red-700 dark:hover:text-red-400 transition-colors cursor-pointer"
                    title="Delete document"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-if="paginatedDocs.length === 0">
              <td colspan="10" class="py-12 text-center text-xs text-zinc-400 dark:text-[#806B76] space-y-3">
                <FolderOpen class="w-8 h-8 text-zinc-300 dark:text-[#4A3D46] mx-auto" />
                <p class="font-medium text-zinc-600 dark:text-[#DDD2D9]">No physical documents match your criteria.</p>
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

      <!-- Pagination Footer Slot in BaseCard -->
      <template #footer v-if="documentsList.length > 0">
        <div class="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-[#BCAEBA]">
          <div>
            Showing <strong class="text-zinc-800 dark:text-[#F5EDF1]">{{ (currentPage - 1) * pageSize + 1 }}</strong> to
            <strong class="text-zinc-800 dark:text-[#F5EDF1]">{{ Math.min(currentPage * pageSize, documentsList.length) }}</strong> of
            <strong class="text-zinc-800 dark:text-[#F5EDF1]">{{ documentsList.length }}</strong> documents
          </div>

          <div class="flex items-center gap-1.5">
            <button
              @click="currentPage = Math.max(1, currentPage - 1)"
              :disabled="currentPage === 1"
              class="p-1.5 rounded border border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#251F23] hover:bg-zinc-50 dark:hover:bg-[#2D232A] text-zinc-700 dark:text-[#F5EDF1] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
            </button>

            <span class="px-2 font-medium text-zinc-700 dark:text-[#DDD2D9]">
              Page {{ currentPage }} of {{ totalPages }}
            </span>

            <button
              @click="currentPage = Math.min(totalPages, currentPage + 1)"
              :disabled="currentPage === totalPages"
              class="p-1.5 rounded border border-zinc-200 dark:border-[#3D2D38] bg-white dark:bg-[#251F23] hover:bg-zinc-50 dark:hover:bg-[#2D232A] text-zinc-700 dark:text-[#F5EDF1] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              aria-label="Next page"
            >
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </template>
    </BaseCard>

    <!-- Modals & Drawers -->
    <!-- Add / Edit Document Modal -->
    <DocumentModal
      :is-open="isAddEditModalOpen"
      :document-to-edit="documentToEdit"
      :initial-values="initialRegistrationValues"
      @close="isAddEditModalOpen = false; initialRegistrationValues = null"
      @saved="handleDocumentSaved"
    />

    <!-- Document Detail Drawer -->
    <DocumentDetailDrawer
      :is-open="isDetailDrawerOpen"
      :document-id="selectedDocumentId"
      @close="isDetailDrawerOpen = false"
      @updated="loadData"
      @deleted="loadData"
      @view-activity-design="openAdDetail"
      @open-document="handleOpenDocumentFromAd"
    />

    <!-- Activity Design Master Lifecycle Modal -->
    <FinanceDetailModal
      :is-open="isAdDetailModalOpen"
      :record="selectedAdRecord"
      @close="isAdDetailModalOpen = false; selectedAdRecord = null"
      @register-document="handleRegisterFromAd"
      @open-document="handleOpenDocumentFromAd"
      @refresh="loadData"
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
