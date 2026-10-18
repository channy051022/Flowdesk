<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  getFinanceRecords,
  createFinanceRecord,
  updateFinanceRecord,
  deleteFinanceRecord,
  updateBudgetUtilizationStatus,
  seedSampleFinanceRecords,
  clearSampleRecords,
  formatCurrency,
  formatDate,
  PAYMENT_STATUS_OPTIONS,
  AD_STATUS_OPTIONS,
  CHARGED_TO_OPTIONS,
  INTERNAL_ARRANGEMENT_OPTIONS,
  MOOE_OPTIONS,
  LFP_OPTIONS,
  normalizeChargedTo,
  getChargeCategory
} from '../services/financeService'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import FinanceRecordModal from '../components/finance/FinanceRecordModal.vue'
import FinanceDetailModal from '../components/finance/FinanceDetailModal.vue'
import ScannerModal from '../components/scanner/ScannerModal.vue'
import { toast } from '../composables/useToast'
import {
  Landmark,
  Plus,
  Search,
  Filter,
  X,
  Edit2,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
  Info,
  DollarSign,
  Coins,
  Check,
  RotateCcw,
  Scan
} from 'lucide-vue-next'

// State
const records = ref([])
const isLoading = ref(true)
const errorMessage = ref('')
const toastMessage = ref('')

// Expandable subtable rows state (stores record IDs whose budget breakdown is open)
const expandedRowIds = ref([])
const updatingBudgetId = ref(null)

const toggleRowExpand = (recordId) => {
  const idx = expandedRowIds.value.indexOf(recordId)
  if (idx > -1) {
    expandedRowIds.value.splice(idx, 1)
  } else {
    expandedRowIds.value.push(recordId)
  }
}

const isRowExpanded = (recordId) => expandedRowIds.value.includes(recordId)

const getBudgetPaidTotal = (entries = []) => {
  if (!Array.isArray(entries)) return 0
  const paidCentavos = entries
    .filter((e) => e.status === 'Paid')
    .reduce((acc, e) => acc + Math.round((Number(e.amount) || 0) * 100), 0)
  return paidCentavos / 100
}

const getBudgetUnpaidTotal = (entries = []) => {
  if (!Array.isArray(entries)) return 0
  const unpaidCentavos = entries
    .filter((e) => e.status !== 'Paid')
    .reduce((acc, e) => acc + Math.round((Number(e.amount) || 0) * 100), 0)
  return unpaidCentavos / 100
}

const handleUpdateBudgetStatus = async (record, budgetItem, newStatus) => {
  if (!budgetItem?.id) return
  updatingBudgetId.value = budgetItem.id
  try {
    await updateBudgetUtilizationStatus(budgetItem.id, newStatus)
    budgetItem.status = newStatus
    showToast(`"${budgetItem.name}" marked as ${newStatus}.`)
  } catch (err) {
    console.error('Failed to update budget status:', err)
    alert('Could not update budget status: ' + err.message)
  } finally {
    updatingBudgetId.value = null
  }
}

const handleMarkAllBudgetStatus = async (record, newStatus) => {
  if (!record?.budgetEntries?.length) return
  try {
    for (const b of record.budgetEntries) {
      if (b.status !== newStatus && b.id) {
        await updateBudgetUtilizationStatus(b.id, newStatus)
        b.status = newStatus
      }
    }
    showToast(`All budget items for "${record.activityDesign || 'Record'}" marked as ${newStatus}.`)
  } catch (err) {
    console.error('Failed to mark all budget status:', err)
    alert('Error updating items: ' + err.message)
  }
}

// Filters
const searchQuery = ref('')
const selectedPaymentStatus = ref('all')
const selectedAdStatus = ref('all')
const selectedChargedTo = ref('all')
const selectedArrangement = ref('all')
const startDate = ref('')
const endDate = ref('')
const showAdvancedFilters = ref(false)

// Modals
const isFormModalOpen = ref(false)
const recordToEdit = ref(null)
const isDetailModalOpen = ref(false)
const selectedRecord = ref(null)

// Hardware Scanner Modal State
const isScannerModalOpen = ref(false)
const recordToScan = ref(null)

const openScannerModal = (record = null) => {
  recordToScan.value = record
  isScannerModalOpen.value = true
}

const handleScanAttached = async () => {
  await loadRecords()
}

// Delete confirmation state
const isDeleteConfirmOpen = ref(false)
const recordToDelete = ref(null)

// Pagination
const currentPage = ref(1)
const pageSize = ref(10)

// Load records from Dexie
const loadRecords = async () => {
  isLoading.value = true
  errorMessage.value = ''
  try {
    const data = await getFinanceRecords({
      search: searchQuery.value,
      paymentStatus: selectedPaymentStatus.value,
      adStatus: selectedAdStatus.value,
      chargedTo: selectedChargedTo.value,
      internalArrangement: selectedArrangement.value,
      startDate: startDate.value,
      endDate: endDate.value
    })
    records.value = data
  } catch (err) {
    console.error('Error loading finance records:', err)
    errorMessage.value = 'Failed to load finance records from offline database.'
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  try {
    await clearSampleRecords()
  } catch {}
  loadRecords()
})

// Trigger search/filter reload
const handleFilterChange = () => {
  currentPage.value = 1
  loadRecords()
}

const clearFilters = () => {
  searchQuery.value = ''
  selectedPaymentStatus.value = 'all'
  selectedAdStatus.value = 'all'
  selectedChargedTo.value = 'all'
  selectedArrangement.value = 'all'
  startDate.value = ''
  endDate.value = ''
  currentPage.value = 1
  loadRecords()
}

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value.trim() !== '' ||
    selectedPaymentStatus.value !== 'all' ||
    selectedAdStatus.value !== 'all' ||
    selectedChargedTo.value !== 'all' ||
    selectedArrangement.value !== 'all' ||
    startDate.value !== '' ||
    endDate.value !== ''
  )
})

// Toast notification helper
const showToast = (msg) => {
  toastMessage.value = msg
  setTimeout(() => {
    toastMessage.value = ''
  }, 3500)
}

// Add/Edit modal handlers
const openAddModal = () => {
  recordToEdit.value = null
  isFormModalOpen.value = true
}

const openEditModal = (record) => {
  recordToEdit.value = record
  isFormModalOpen.value = true
  if (isDetailModalOpen.value) {
    isDetailModalOpen.value = false
  }
}

const handleRecordSaved = async ({ isEdit, id, data, budgetEntries }) => {
  try {
    if (isEdit) {
      await updateFinanceRecord(id, data, budgetEntries)
      toast.success(
        'Activity Design updated successfully.',
        'Changes synced to Document Tracker, Workflow Board, and My Tasks.'
      )
    } else {
      await createFinanceRecord(data, budgetEntries)
      toast.success(
        'Activity Design created successfully.',
        'It has been added to My Tasks, Document Tracker, and Workflow Board.'
      )
    }
    isFormModalOpen.value = false
    await loadRecords()
  } catch (err) {
    toast.error('Unable to save changes. Please try again.', err.message)
  }
}

// Details modal handlers
const openDetailModal = (record) => {
  selectedRecord.value = record
  isDetailModalOpen.value = true
}

// Delete handlers
const confirmDelete = (record) => {
  recordToDelete.value = record
  isDeleteConfirmOpen.value = true
  if (isDetailModalOpen.value) {
    isDetailModalOpen.value = false
  }
}

const executeDelete = async () => {
  if (!recordToDelete.value) return
  try {
    await deleteFinanceRecord(recordToDelete.value.id)
    toast.success('Finance record deleted successfully.')
    isDeleteConfirmOpen.value = false
    recordToDelete.value = null
    await loadRecords()
  } catch (err) {
    toast.error('Unable to delete record.', err.message)
  }
}

// Demo Sample Records handlers
const handleSeedSamples = async () => {
  try {
    await seedSampleFinanceRecords()
    showToast('Loaded sample finance records for testing.')
    await loadRecords()
  } catch (err) {
    console.error('Error seeding sample records:', err)
  }
}

const handleClearSamples = async () => {
  if (confirm('Clear all sample demo records from database? Real records will be preserved.')) {
    await clearSampleRecords()
    showToast('Sample records cleared.')
    await loadRecords()
  }
}

// Pagination computations
const totalRecords = computed(() => records.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalRecords.value / pageSize.value)))

const paginatedRecords = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return records.value.slice(start, start + pageSize.value)
})

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++
}

// Badge color helpers
const getPaymentBadgeVariant = (status) => {
  if (!status) return 'routine'
  if (status === 'Paid') return 'success'
  if (status.includes('Pending')) return 'urgent'
  if (status.includes('Processing') || status.includes('Obligated')) return 'warning'
  if (status === 'Cancelled' || status === 'Disapproved') return 'routine'
  return 'info'
}

const getAdBadgeVariant = (status) => {
  if (!status) return 'routine'
  const s = status.toLowerCase()
  if (s.includes('approved') || s.includes('completed') || s.includes('liquidated')) return 'forest'
  if (s.includes('for approval') || s.includes('review') || s.includes('issued')) return 'info'
  if (s.includes('returned') || s.includes('rejected')) return 'urgent'
  if (s.includes('pending')) return 'warning'
  return 'routine'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Toast Notification -->
    <transition
      enter-active-class="transition ease-out duration-200"
      enter-from-class="transform opacity-0 -translate-y-2"
      enter-to-class="transform opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-150"
      leave-from-class="transform opacity-100 translate-y-0"
      leave-to-class="transform opacity-0 -translate-y-2"
    >
      <div
        v-if="toastMessage"
        class="fixed top-18 right-6 z-50 bg-forest-900 text-white px-3.5 py-2 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 border border-forest-700 animate-fade"
      >
        <CheckCircle2 class="w-4 h-4 text-emerald-300" />
        <span>{{ toastMessage }}</span>
      </div>
    </transition>

    <!-- Page Header & Action Controls -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-forest-800 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Landmark class="w-4 h-4 text-rose-100" />
          </div>
          <div>
            <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
              Finance Internal Control Monitoring
            </h2>
            <p class="text-xs sm:text-sm text-zinc-500 mt-0.5">
              Tracks finance monitoring records, purchase requests, disbursements, and internal arrangements.
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <!-- Scan Document Button -->
        <BaseButton variant="secondary" size="sm" @click="openScannerModal(null)">
          <Scan class="w-3.5 h-3.5 text-forest-700 mr-1.5" />
          Scan Document
        </BaseButton>

        <!-- Add Record Button -->
        <BaseButton variant="primary" size="sm" @click="openAddModal">
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Add Activity Design
        </BaseButton>
      </div>
    </div>

    <!-- Search & Quick Filters Toolbar -->
    <div class="bg-white rounded-xl border border-zinc-200/80 p-3.5 shadow-2xs space-y-3">
      <div class="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        <!-- Keyword Search Input -->
        <div class="relative flex-1">
          <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            @input="handleFilterChange"
            type="text"
            placeholder="Search Activity Design, supplier name, PR #, PO #, PPMP #..."
            class="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-50/70 hover:bg-zinc-50 focus:bg-white border border-zinc-200/80 rounded-lg text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-forest-600 transition-colors"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''; handleFilterChange()"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Filter Dropdowns & Controls -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Payment Status Filter -->
          <select
            v-model="selectedPaymentStatus"
            @change="handleFilterChange"
            class="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600"
            title="Filter by Status of Payment"
          >
            <option value="all">All Payment Statuses</option>
            <option v-for="st in PAYMENT_STATUS_OPTIONS" :key="st" :value="st">
              {{ st }}
            </option>
          </select>

          <!-- AD Status Filter -->
          <select
            v-model="selectedAdStatus"
            @change="handleFilterChange"
            class="px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600"
            title="Filter by Status of AD"
          >
            <option value="all">All AD Statuses</option>
            <option v-for="st in AD_STATUS_OPTIONS" :key="st" :value="st">
              {{ st }}
            </option>
          </select>

          <!-- Toggle Advanced Filters -->
          <button
            @click="showAdvancedFilters = !showAdvancedFilters"
            type="button"
            :class="[
              'px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1.5',
              showAdvancedFilters || startDate || endDate || selectedChargedTo !== 'all' || selectedArrangement !== 'all'
                ? 'bg-forest-50 border-forest-200 text-forest-800'
                : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
            ]"
          >
            <Filter class="w-3.5 h-3.5" />
            <span>More Filters</span>
          </button>

          <!-- Clear Filters Button -->
          <button
            v-if="hasActiveFilters"
            @click="clearFilters"
            type="button"
            class="px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <X class="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <!-- Advanced Filter Row (Charged To, Internal Arrangement, Date Range) -->
      <div
        v-if="showAdvancedFilters"
        class="pt-3 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs"
      >
        <!-- Charged To -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-zinc-500">3. Charged to</label>
          <select
            v-model="selectedChargedTo"
            @change="handleFilterChange"
            class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600"
          >
            <option value="all">All Categories</option>
            <option value="MOOE">All MOOE Categories</option>
            <option value="LFP">All LFP Categories</option>
            <optgroup label="Group A: MOOE">
              <option v-for="opt in MOOE_OPTIONS" :key="opt.id" :value="opt.value">
                {{ opt.label }}
              </option>
            </optgroup>
            <optgroup label="Group B: LFP">
              <option v-for="opt in LFP_OPTIONS" :key="opt.id" :value="opt.value">
                {{ opt.label }}
              </option>
            </optgroup>
          </select>
        </div>

        <!-- Internal Arrangement -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-zinc-500">9. Internal arrangement?</label>
          <select
            v-model="selectedArrangement"
            @change="handleFilterChange"
            class="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600"
          >
            <option value="all">All</option>
            <option v-for="opt in INTERNAL_ARRANGEMENT_OPTIONS" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
        </div>

        <!-- Date From -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-zinc-500">Event Date From</label>
          <input
            v-model="startDate"
            @change="handleFilterChange"
            type="date"
            class="w-full px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
          />
        </div>

        <!-- Date To -->
        <div class="space-y-1">
          <label class="text-[11px] font-medium text-zinc-500">Event Date To</label>
          <input
            v-model="endDate"
            @change="handleFilterChange"
            type="date"
            class="w-full px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-forest-600 text-xs"
          />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div
      v-if="errorMessage"
      class="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-center justify-between text-xs"
    >
      <div class="flex items-center gap-2">
        <AlertCircle class="w-4 h-4 shrink-0" />
        <span>{{ errorMessage }}</span>
      </div>
      <button
        @click="loadRecords"
        type="button"
        class="text-xs font-medium underline hover:text-red-900"
      >
        Retry
      </button>
    </div>

    <!-- Monitoring Table Card -->
    <BaseCard>
      <!-- Card Toolbar: Record Count & Sample Controls -->
      <template #header>
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-semibold text-zinc-900">
            Internal Control Monitoring Table
          </h3>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-forest-50 text-forest-800 border border-forest-100">
            {{ totalRecords }} {{ totalRecords === 1 ? 'Record' : 'Records' }}
          </span>
        </div>
      </template>



      <!-- Horizontally Scrollable Table Container -->
      <div class="overflow-x-auto -mx-5 -my-5">
        <table class="w-full text-left border-collapse text-xs whitespace-nowrap">
          <thead>
            <tr class="border-b border-zinc-200/90 bg-zinc-50/80 text-zinc-600 font-semibold text-[11px] tracking-tight">
              <th class="py-3 px-3.5">#</th>
              <th class="py-3 px-3.5">1. Activity Design</th>
              <th class="py-3 px-3.5 text-right">2. Amount of AD</th>
              <th class="py-3 px-3.5">3. Charged to</th>
              <th class="py-3 px-3.5">4. Date of Event</th>
              <th class="py-3 px-3.5">5. PPMP Number</th>
              <th class="py-3 px-3.5">6. PR Number</th>
              <th class="py-3 px-3.5">7. PO Number</th>
              <th class="py-3 px-3.5 text-center">8. Internal Arrangement?</th>
              <th class="py-3 px-3.5">Status of Payment</th>
              <th class="py-3 px-3.5">Status of AD</th>
              <th class="py-3 px-3.5 text-right sticky right-0 bg-zinc-50/90 backdrop-blur-xs shadow-xs">
                Actions
              </th>
            </tr>
          </thead>

          <tbody class="divide-y divide-zinc-100">
            <!-- Loading Row -->
            <tr v-if="isLoading">
              <td colspan="12" class="py-12 text-center text-zinc-400 text-xs">
                <div class="inline-flex items-center gap-2">
                  <span class="w-3.5 h-3.5 rounded-full border-2 border-forest-600 border-t-transparent animate-spin"></span>
                  <span>Loading records from local database...</span>
                </div>
              </td>
            </tr>

            <!-- Empty Row -->
            <tr v-else-if="paginatedRecords.length === 0">
              <td colspan="12" class="py-12 text-center">
                <div class="flex flex-col items-center justify-center space-y-2">
                  <div class="w-10 h-10 rounded-xl bg-forest-50 text-forest-700 flex items-center justify-center">
                    <FileSpreadsheet class="w-5 h-5" />
                  </div>
                  <h4 class="text-xs font-semibold text-zinc-800">
                    {{ hasActiveFilters ? 'No matching finance records found' : 'No finance records recorded yet' }}
                  </h4>
                  <p class="text-[11px] text-zinc-400 max-w-sm">
                    {{ hasActiveFilters ? 'Try adjusting your search criteria or clear the filters.' : 'Click "Add Activity Design" to log your first finance monitoring entry.' }}
                  </p>
                  <div class="pt-2 flex items-center gap-2">
                    <button
                      v-if="hasActiveFilters"
                      @click="clearFilters"
                      type="button"
                      class="px-3 py-1.5 rounded-md border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                    >
                      Clear Filters
                    </button>
                    <BaseButton v-else variant="primary" size="sm" @click="openAddModal">
                      <Plus class="w-3.5 h-3.5 text-rose-200 mr-1" />
                      Add Activity Design
                    </BaseButton>
                  </div>
                </div>
              </td>
            </tr>

            <!-- Data Rows with Expandable Subtable for Budget Utilization Breakdown -->
            <template
              v-for="(item, idx) in paginatedRecords"
              :key="item.id"
            >
              <tr
                class="hover:bg-zinc-50/90 transition-colors group"
                :class="{ 'bg-pink-50/20 font-medium': isRowExpanded(item.id) }"
              >
                <!-- Index + Expand Toggle -->
                <td class="py-3 px-3.5 text-zinc-400 font-mono text-[11px] whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <!-- Dropdown chevron button if budget breakdown exists -->
                    <button
                      v-if="item.budgetEntries && item.budgetEntries.length > 0"
                      @click.stop="toggleRowExpand(item.id)"
                      type="button"
                      class="p-1 rounded-md text-pink-700 hover:text-pink-900 hover:bg-pink-100/70 transition-all cursor-pointer"
                      :title="isRowExpanded(item.id) ? 'Collapse budget breakdown subtable' : 'Expand budget breakdown subtable'"
                      :aria-expanded="isRowExpanded(item.id)"
                    >
                      <ChevronDown
                        class="w-3.5 h-3.5 transition-transform duration-200"
                        :class="{ 'rotate-180': isRowExpanded(item.id) }"
                      />
                    </button>
                    <span v-else class="w-5 inline-block"></span>
                    <span>{{ (currentPage - 1) * pageSize + idx + 1 }}</span>
                  </div>
                </td>

                <!-- 1. Activity Design -->
                <td class="py-3 px-3.5 max-w-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-zinc-900 truncate" :title="item.activityDesign || item.columnK">
                      {{ item.activityDesign || item.columnK || '—' }}
                    </span>

                    <!-- Interactive Badge Dropdown Toggle for Budget Breakdown -->
                    <button
                      v-if="item.budgetEntries && item.budgetEntries.length > 0"
                      @click.stop="toggleRowExpand(item.id)"
                      type="button"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer shadow-2xs shrink-0"
                      :class="isRowExpanded(item.id)
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'"
                      :title="isRowExpanded(item.id) ? 'Hide Budget Utilization Breakdown' : 'Click to view Budget Utilization Breakdown subtable'"
                    >
                      <Coins class="w-3 h-3" />
                      <span>{{ item.budgetEntries.length }} breakdown{{ item.budgetEntries.length > 1 ? 's' : '' }}</span>
                      <ChevronDown
                        class="w-2.5 h-2.5 transition-transform duration-200"
                        :class="{ 'rotate-180': isRowExpanded(item.id) }"
                      />
                    </button>

                    <span
                      v-if="item.isSample"
                      class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 uppercase shrink-0"
                      title="Illustrative demo record"
                    >
                      Sample
                    </span>
                  </div>
                </td>

                <!-- 2. Amount of AD -->
                <td class="py-3 px-3.5 text-right font-mono font-medium text-zinc-900">
                  <div class="inline-flex items-center justify-end gap-1">
                    <span>{{ formatCurrency(item.adAmount) }}</span>
                    <button
                      v-if="item.budgetEntries && item.budgetEntries.length > 0"
                      @click.stop="toggleRowExpand(item.id)"
                      type="button"
                      class="text-rose-500 hover:text-rose-700 p-0.5 transition-colors cursor-pointer"
                      :title="isRowExpanded(item.id) ? 'Hide subtable' : 'View breakdown subtable'"
                    >
                      <Coins class="w-3 h-3" />
                    </button>
                  </div>
                </td>

                <!-- 3. Charged to -->
                <td class="py-3 px-3.5 text-zinc-600 max-w-[210px]" :title="normalizeChargedTo(item.chargedTo).join('; ')">
                  <div class="flex items-center gap-1 flex-wrap">
                    <template v-if="normalizeChargedTo(item.chargedTo).length > 0">
                      <span
                        class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[145px]"
                        :class="getChargeCategory(normalizeChargedTo(item.chargedTo)[0]) === 'MOOE' ? 'bg-pink-50 text-pink-700 border border-pink-200' : 'bg-purple-50 text-purple-700 border border-purple-200'"
                      >
                        {{ normalizeChargedTo(item.chargedTo)[0] }}
                      </span>
                      <span
                        v-if="normalizeChargedTo(item.chargedTo).length > 1"
                        class="px-1 py-0.5 rounded text-[9px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200 shrink-0"
                        :title="normalizeChargedTo(item.chargedTo).slice(1).join('\n')"
                      >
                        +{{ normalizeChargedTo(item.chargedTo).length - 1 }}
                      </span>
                    </template>
                    <span v-else class="text-zinc-400">—</span>
                  </div>
                </td>

                <!-- 4. Date of Event -->
                <td class="py-3 px-3.5 text-zinc-600">
                  {{ formatDate(item.eventDate) }}
                </td>

                <!-- 5. PPMP Number -->
                <td class="py-3 px-3.5 font-mono text-zinc-700">
                  {{ item.ppmpNumber || '—' }}
                </td>

                <!-- 6. PR Number -->
                <td class="py-3 px-3.5 font-mono text-zinc-800 font-semibold">
                  {{ item.prNumber || '—' }}
                </td>

                <!-- 7. PO Number -->
                <td class="py-3 px-3.5 font-mono text-zinc-700">
                  {{ item.poNumber || '—' }}
                </td>

                <!-- 8. Is there internal arrangement? -->
                <td class="py-3 px-3.5 text-center">
                  <span
                    :class="[
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                      item.internalArrangement === 'Yes'
                        ? 'bg-amber-100 text-amber-800'
                        : item.internalArrangement === 'No'
                        ? 'bg-zinc-100 text-zinc-600'
                        : 'text-zinc-400'
                    ]"
                  >
                    {{ item.internalArrangement || '—' }}
                  </span>
                </td>

                <!-- Status of Payment -->
                <td class="py-3 px-3.5">
                  <BaseBadge :variant="getPaymentBadgeVariant(item.paymentStatus)" size="xs" dot>
                    {{ item.paymentStatus || '—' }}
                  </BaseBadge>
                </td>

                <!-- Status of AD -->
                <td class="py-3 px-3.5">
                  <BaseBadge :variant="getAdBadgeVariant(item.adStatus)" size="xs">
                    {{ item.adStatus || '—' }}
                  </BaseBadge>
                </td>

                <!-- Actions (Sticky Right) -->
                <td class="py-3 px-3.5 text-right sticky right-0 bg-white group-hover:bg-zinc-50/90 shadow-xs">
                  <div class="flex items-center justify-end gap-1">
                    <!-- View Details Button -->
                    <button
                      @click="openDetailModal(item)"
                      type="button"
                      class="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                      title="View full record details"
                      aria-label="View details"
                    >
                      <Eye class="w-3.5 h-3.5" />
                    </button>

                    <!-- Scan & Attach Document Button -->
                    <button
                      @click="openScannerModal(item)"
                      type="button"
                      class="p-1.5 rounded-md text-zinc-400 hover:text-[#D9467B] hover:bg-pink-50 transition-colors"
                      title="Scan & attach document to this Activity Design"
                      aria-label="Scan document"
                    >
                      <Scan class="w-3.5 h-3.5" />
                    </button>

                    <!-- Edit Button -->
                    <button
                      @click="openEditModal(item)"
                      type="button"
                      class="p-1.5 rounded-md text-zinc-400 hover:text-forest-700 hover:bg-forest-50 transition-colors"
                      title="Edit record"
                      aria-label="Edit record"
                    >
                      <Edit2 class="w-3.5 h-3.5" />
                    </button>

                    <!-- Delete Button -->
                    <button
                      @click="confirmDelete(item)"
                      type="button"
                      class="p-1.5 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete record"
                      aria-label="Delete record"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>

              <!-- Subtable Row: Budget Utilization Breakdown -->
              <tr
                v-if="isRowExpanded(item.id) && item.budgetEntries && item.budgetEntries.length > 0"
                class="bg-[#FFF7FA] transition-all"
              >
                <td colspan="12" class="px-5 py-4 border-b border-rose-200/90 bg-[#FFF7FA]">
                  <div class="rounded-xl border border-rose-200 bg-white overflow-hidden shadow-xs">
                    <!-- Subtable Toolbar & Header -->
                    <div class="px-4 py-2.5 bg-gradient-to-r from-[#FFF5F8] to-[#FCE7F0] border-b border-rose-100 flex flex-wrap items-center justify-between gap-3">
                      <div class="flex items-center gap-2.5">
                        <div class="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 shadow-2xs">
                          <Coins class="w-4 h-4 text-rose-600" />
                        </div>
                        <div>
                          <div class="flex items-center gap-2">
                            <h4 class="text-xs font-bold text-[#3D2934]">
                              Budget Utilization Breakdown Subtable
                            </h4>
                            <span class="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                              {{ item.budgetEntries.length }} {{ item.budgetEntries.length === 1 ? 'Item' : 'Items' }}
                            </span>
                          </div>
                          <p class="text-[11px] text-[#806B76]">
                            Activity Design: <strong class="text-zinc-800">{{ item.activityDesign || item.columnK }}</strong>
                          </p>
                        </div>
                      </div>

                      <!-- Subtable Summary Badges & Batch Actions -->
                      <div class="flex items-center gap-2 flex-wrap text-xs">
                        <!-- Total -->
                        <div class="px-2.5 py-1 rounded-md bg-white border border-rose-100 shadow-2xs font-mono text-[11px]">
                          <span class="text-zinc-500 mr-1">Total:</span>
                          <strong class="text-[#3D2934]">{{ formatCurrency(item.adAmount) }}</strong>
                        </div>
                        <!-- Paid Total -->
                        <div class="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-2xs font-mono text-[11px]">
                          <span class="text-emerald-600 mr-1">Paid:</span>
                          <strong>{{ formatCurrency(getBudgetPaidTotal(item.budgetEntries)) }}</strong>
                        </div>
                        <!-- Unpaid Total -->
                        <div class="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 shadow-2xs font-mono text-[11px]">
                          <span class="text-amber-600 mr-1">Unpaid:</span>
                          <strong>{{ formatCurrency(getBudgetUnpaidTotal(item.budgetEntries)) }}</strong>
                        </div>

                        <!-- Quick Batch Buttons -->
                        <div class="h-4 w-px bg-rose-200 mx-1"></div>
                        <button
                          @click="handleMarkAllBudgetStatus(item, 'Paid')"
                          type="button"
                          class="px-2 py-1 text-[10px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="Mark all breakdown items as Paid"
                        >
                          <Check class="w-3 h-3" />
                          <span>All Paid</span>
                        </button>
                        <button
                          @click="handleMarkAllBudgetStatus(item, 'Unpaid')"
                          type="button"
                          class="px-2 py-1 text-[10px] font-semibold rounded bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="Mark all breakdown items as Unpaid"
                        >
                          <RotateCcw class="w-3 h-3 text-amber-600" />
                          <span>All Unpaid</span>
                        </button>
                      </div>
                    </div>

                    <!-- Subtable Data Grid -->
                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-xs whitespace-nowrap">
                        <thead>
                          <tr class="bg-zinc-50 border-b border-zinc-200/80 text-zinc-600 font-semibold text-[10px] tracking-wide uppercase">
                            <th class="py-2.5 px-4 w-12 text-center">#</th>
                            <th class="py-2.5 px-4">Budget Utilization</th>
                            <th class="py-2.5 px-4 text-right w-44">Amount</th>
                            <th class="py-2.5 px-4 w-48">Supplier</th>
                            <th class="py-2.5 px-4 text-center w-36">Status</th>
                            <th class="py-2.5 px-4 text-center w-48">Action</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-zinc-100">
                          <tr
                            v-for="(bEntry, bIdx) in item.budgetEntries"
                            :key="bEntry.id || bIdx"
                            class="hover:bg-rose-50/40 transition-colors"
                          >
                            <!-- # -->
                            <td class="py-2.5 px-4 text-center text-zinc-400 font-mono text-[11px]">
                              {{ bIdx + 1 }}
                            </td>

                            <!-- Budget Breakdown Item Name -->
                            <td class="py-2.5 px-4 font-medium text-zinc-900">
                              <div class="flex items-center gap-2">
                                <span class="w-1.5 h-1.5 rounded-full" :class="bEntry.status === 'Paid' ? 'bg-emerald-500' : 'bg-rose-400'"></span>
                                <span>{{ bEntry.name }}</span>
                              </div>
                            </td>

                            <!-- Amount -->
                            <td class="py-2.5 px-4 text-right font-mono font-bold text-[#3D2934] text-xs">
                              {{ formatCurrency(bEntry.amount) }}
                            </td>

                            <!-- Supplier -->
                            <td class="py-2.5 px-4 text-zinc-700 max-w-[200px] truncate" :title="bEntry.supplier || ''">
                              <span v-if="bEntry.supplier" class="font-medium text-zinc-800">{{ bEntry.supplier }}</span>
                              <span v-else class="text-zinc-400">—</span>
                            </td>

                            <!-- Status Badge -->
                            <td class="py-2.5 px-4 text-center">
                              <span
                                :class="[
                                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-2xs',
                                  bEntry.status === 'Paid'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                ]"
                              >
                                <span
                                  class="w-1.5 h-1.5 rounded-full"
                                  :class="bEntry.status === 'Paid' ? 'bg-emerald-500' : 'bg-rose-500'"
                                ></span>
                                {{ bEntry.status === 'Paid' ? 'Paid' : 'Unpaid' }}
                              </span>
                            </td>

                            <!-- Action Column: Update Status -->
                            <td class="py-2.5 px-4 text-center">
                              <div class="inline-flex items-center justify-center gap-1.5">
                                <!-- If Unpaid, button to mark as Paid -->
                                <button
                                  v-if="bEntry.status !== 'Paid'"
                                  @click="handleUpdateBudgetStatus(item, bEntry, 'Paid')"
                                  :disabled="updatingBudgetId === bEntry.id"
                                  type="button"
                                  class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-xs inline-flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                  title="Mark this budget item as Paid"
                                >
                                  <Check class="w-3 h-3" />
                                  <span>Mark Paid</span>
                                </button>

                                <!-- If Paid, button to mark as Unpaid -->
                                <button
                                  v-else
                                  @click="handleUpdateBudgetStatus(item, bEntry, 'Unpaid')"
                                  :disabled="updatingBudgetId === bEntry.id"
                                  type="button"
                                  class="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white hover:bg-rose-50 active:bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs inline-flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                                  title="Mark this budget item as Unpaid"
                                >
                                  <RotateCcw class="w-3 h-3 text-rose-600" />
                                  <span>Mark Unpaid</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                        <tfoot class="bg-rose-50/30 border-t border-rose-100 text-xs font-semibold">
                          <tr>
                            <td colspan="2" class="py-2.5 px-4 text-zinc-600">
                              Total Budget Breakdown Sum ({{ item.budgetEntries.length }} items)
                            </td>
                            <td class="py-2.5 px-4 text-right font-mono font-bold text-rose-950">
                              {{ formatCurrency(item.adAmount) }}
                            </td>
                            <td colspan="3" class="py-2.5 px-4 text-center text-[11px] text-zinc-500 font-normal">
                              {{ item.budgetEntries.filter(e => e.status === 'Paid').length }} Paid • {{ item.budgetEntries.filter(e => e.status !== 'Paid').length }} Unpaid
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <template #footer>
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div class="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              v-model="pageSize"
              @change="currentPage = 1"
              class="px-2 py-1 rounded border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-forest-600 text-xs"
            >
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
            </select>

            <span class="ml-2">
              Showing
              <strong>{{ totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1 }}</strong>
              to
              <strong>{{ Math.min(currentPage * pageSize, totalRecords) }}</strong>
              of
              <strong>{{ totalRecords }}</strong>
            </span>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              @click="prevPage"
              :disabled="currentPage === 1"
              type="button"
              class="p-1.5 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft class="w-4 h-4" />
            </button>

            <span class="px-2 font-medium text-zinc-700">
              Page {{ currentPage }} of {{ totalPages }}
            </span>

            <button
              @click="nextPage"
              :disabled="currentPage >= totalPages"
              type="button"
              class="p-1.5 rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      </template>
    </BaseCard>

    <!-- Add/Edit Record Form Modal -->
    <FinanceRecordModal
      :is-open="isFormModalOpen"
      :record-to-edit="recordToEdit"
      @close="isFormModalOpen = false"
      @saved="handleRecordSaved"
    />

    <!-- View Record Details Modal -->
    <FinanceDetailModal
      :is-open="isDetailModalOpen"
      :record="selectedRecord"
      @close="isDetailModalOpen = false"
      @edit="openEditModal"
      @delete="confirmDelete"
      @scan="openScannerModal"
    />

    <!-- FlowDesk Desktop Hardware Scanner Modal -->
    <ScannerModal
      :isOpen="isScannerModalOpen"
      :activityDesign="recordToScan"
      @close="isScannerModalOpen = false"
      @attached="handleScanAttached"
    />

    <!-- Delete Confirmation Modal Dialog -->
    <div
      v-if="isDeleteConfirmOpen && recordToDelete"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-xs"
      @click.self="isDeleteConfirmOpen = false"
      role="alertdialog"
    >
      <div class="bg-white rounded-xl shadow-xl border border-zinc-200 p-5 w-full max-w-sm space-y-4 animate-in fade-in duration-150">
        <div class="flex items-start gap-3">
          <div class="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <Trash2 class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-sm font-semibold text-zinc-900">Confirm Record Deletion</h4>
            <p class="text-xs text-zinc-500 mt-1 leading-relaxed">
              Are you sure you want to delete the finance record for
              <strong class="text-zinc-800">{{ recordToDelete.activityDesign || recordToDelete.supplierName || recordToDelete.prNumber || 'Entry #' + recordToDelete.id }}</strong>?
              This action cannot be undone.
            </p>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 text-xs">
          <button
            @click="isDeleteConfirmOpen = false"
            type="button"
            class="px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            @click="executeDelete"
            type="button"
            class="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors cursor-pointer"
          >
            Delete Record
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
