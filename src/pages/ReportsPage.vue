<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import db from '../db/database'
import BaseCard from '../components/common/BaseCard.vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import FinanceDetailModal from '../components/finance/FinanceDetailModal.vue'
import DocumentDetailDrawer from '../components/documents/DocumentDetailDrawer.vue'
import {
  TrendingUp,
  Clock,
  FileText,
  Download,
  Info,
  Calendar,
  AlertCircle,
  Building2,
  CheckCircle2,
  Landmark,
  CheckSquare,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  Printer,
  Search,
  Filter,
  RotateCcw,
  Eye,
  ChevronLeft,
  ChevronRight,
  Layers,
  Award,
  Check,
  PackageCheck,
  Briefcase
} from 'lucide-vue-next'
import {
  formatCurrency,
  formatDate,
  calculateAdAmount,
  calculatePrReminderDueDate,
  getPrReminderStatus,
  getProcurementCompleteness,
  filterRecordsByPeriod,
  computeAdStatusSummary,
  computeProcurementMetrics,
  computePrComplianceMetrics,
  enrichActivityDesigns,
  computeCitizenCharterMetrics,
  escapeCsvField
} from '../services/reportService'
import { toast } from '../composables/useToast'

// Navigation & Period Filters
const activeReportTab = ref('ad_status') // 'ad_status' | 'overview' | 'finance' | 'tasks' | 'documents' | 'workflow'
const selectedPeriod = ref('all') // 'all' | 'month' | '30days' | 'year' | 'custom'
const customDateFrom = ref('')
const customDateTo = ref('')
const isLoading = ref(true)

// Raw data collections
const documents = ref([])
const movements = ref([])
const offices = ref([])
const financeRecords = ref([])
const budgetEntries = ref([])
const tasks = ref([])
const workflowFolders = ref([])

// Modals
const isAdDetailModalOpen = ref(false)
const selectedAdRecord = ref(null)
const isDocDrawerOpen = ref(false)
const selectedDocId = ref(null)

// Tab 2 (AD Register) specific filters
const adSearchQuery = ref('')
const selectedAdStatus = ref('all') // 'all' | 'Pending' | 'For Approval' | 'Approved' | 'Returned'
const selectedProcurementFilter = ref('all') // 'all' | 'complete' | 'missing_any' | 'missing_ppmp' | 'missing_pr' | 'missing_po' | 'missing_both_pr_po'
const selectedPaymentStatus = ref('all') // 'all' | 'Pending Payment' | 'Under Processing' | 'Obligated' | 'Paid' | 'Cancelled' | 'Disapproved'
const selectedPrComplianceFilter = ref('all') // 'all' | 'recorded' | 'upcoming' | 'due_today' | 'overdue'

// Pagination for AD Register
const adCurrentPage = ref(1)
const adPageSize = ref(10)
const adSortColumn = ref('id') // 'id' | 'title' | 'eventDate' | 'amount' | 'status'
const adSortOrder = ref('desc') // 'asc' | 'desc'

// Load all database entities
const loadAllReportData = async () => {
  isLoading.value = true
  try {
    const [docs, moves, offs, fins, budgets, tsks, folders] = await Promise.all([
      db.documents.toArray().catch(() => []),
      db.movements.toArray().catch(() => []),
      db.offices.toArray().catch(() => []),
      db.financeRecords.toArray().catch(() => []),
      db.budgetUtilizations.toArray().catch(() => []),
      db.tasks.toArray().catch(() => []),
      db.workflowFolders.toArray().catch(() => [])
    ])
    documents.value = docs || []
    movements.value = moves || []
    offices.value = offs || []
    financeRecords.value = fins || []
    budgetEntries.value = budgets || []
    tasks.value = tsks || []
    workflowFolders.value = folders || []
  } catch (err) {
    console.error('Failed to load report data from database:', err)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadAllReportData()
  window.addEventListener('flowdesk:refresh-counts', loadAllReportData)
  window.addEventListener('focus', loadAllReportData)
})

onUnmounted(() => {
  window.removeEventListener('flowdesk:refresh-counts', loadAllReportData)
  window.removeEventListener('focus', loadAllReportData)
})

// Period-filtered collections
const periodFilteredFinance = computed(() => {
  return filterRecordsByPeriod(
    financeRecords.value,
    'createdAt',
    selectedPeriod.value,
    customDateFrom.value,
    customDateTo.value
  )
})

const periodFilteredDocuments = computed(() => {
  return filterRecordsByPeriod(
    documents.value,
    'createdAt',
    selectedPeriod.value,
    customDateFrom.value,
    customDateTo.value
  )
})

const periodFilteredMovements = computed(() => {
  return filterRecordsByPeriod(
    movements.value,
    'dispatchDate',
    selectedPeriod.value,
    customDateFrom.value,
    customDateTo.value
  )
})

const periodFilteredTasks = computed(() => {
  return filterRecordsByPeriod(
    tasks.value,
    'createdAt',
    selectedPeriod.value,
    customDateFrom.value,
    customDateTo.value
  )
})

// Enriched canonical Activity Designs
const enrichedActivityDesigns = computed(() => {
  return enrichActivityDesigns({
    financeRecords: periodFilteredFinance.value,
    budgetEntries: budgetEntries.value,
    documents: documents.value,
    offices: offices.value,
    workflowFolders: workflowFolders.value
  })
})

// Overall Summaries for Tab 2
const adStatusSummary = computed(() => {
  return computeAdStatusSummary(periodFilteredFinance.value)
})

const procurementMetrics = computed(() => {
  return computeProcurementMetrics(periodFilteredFinance.value)
})

const prComplianceMetrics = computed(() => {
  return computePrComplianceMetrics(periodFilteredFinance.value)
})

// Filtered Activity Designs for the Register Table
const filteredActivityDesigns = computed(() => {
  let list = enrichedActivityDesigns.value

  // 1. Search query
  if (adSearchQuery.value.trim()) {
    const q = adSearchQuery.value.trim().toLowerCase()
    list = list.filter((r) => {
      const matchTitle = (r.title || '').toLowerCase().includes(q)
      const matchId = `ad #${r.id}`.includes(q) || String(r.id).includes(q)
      const matchPpmp = (r.ppmpNumber || '').toLowerCase().includes(q)
      const matchPr = (r.prNumber || '').toLowerCase().includes(q)
      const matchPo = (r.poNumber || '').toLowerCase().includes(q)
      const matchSupplier = (r.primarySupplier || '').toLowerCase().includes(q)
      const matchOffice = (r.currentOfficeName || '').toLowerCase().includes(q)
      return matchTitle || matchId || matchPpmp || matchPr || matchPo || matchSupplier || matchOffice
    })
  }

  // 2. AD Status filter
  if (selectedAdStatus.value !== 'all') {
    list = list.filter((r) => {
      if (selectedAdStatus.value === 'Pending') {
        return r.adStatus === 'Pending' || r.adStatus === 'Pending AD' || r.adStatus === 'AD Under Review' || r.adStatus === 'For Compliance'
      }
      if (selectedAdStatus.value === 'For Approval') {
        return r.adStatus === 'For Approval' || r.adStatus === 'For Signature'
      }
      if (selectedAdStatus.value === 'Approved') {
        return r.adStatus === 'Approved'
      }
      if (selectedAdStatus.value === 'Returned') {
        return r.adStatus === 'Returned' || r.adStatus === 'Disapproved'
      }
      return r.adStatus === selectedAdStatus.value
    })
  }

  // 3. Procurement Completeness filter
  if (selectedProcurementFilter.value !== 'all') {
    if (selectedProcurementFilter.value === 'complete') {
      list = list.filter((r) => r.completeness.isComplete)
    } else if (selectedProcurementFilter.value === 'missing_any') {
      list = list.filter((r) => r.completeness.isMissingAny)
    } else if (selectedProcurementFilter.value === 'missing_ppmp') {
      list = list.filter((r) => !r.completeness.hasPpmp)
    } else if (selectedProcurementFilter.value === 'missing_pr') {
      list = list.filter((r) => !r.completeness.hasPr)
    } else if (selectedProcurementFilter.value === 'missing_po') {
      list = list.filter((r) => !r.completeness.hasPo)
    } else if (selectedProcurementFilter.value === 'missing_both_pr_po') {
      list = list.filter((r) => r.completeness.missingBothPrAndPo)
    }
  }

  // 4. Payment Status filter
  if (selectedPaymentStatus.value !== 'all') {
    list = list.filter((r) => r.paymentStatus === selectedPaymentStatus.value)
  }

  // 5. PR Compliance filter
  if (selectedPrComplianceFilter.value !== 'all') {
    list = list.filter((r) => r.prReminder.status === selectedPrComplianceFilter.value)
  }

  // Sorting
  const sorted = [...list].sort((a, b) => {
    let diff = 0
    if (adSortColumn.value === 'id') {
      diff = a.id - b.id
    } else if (adSortColumn.value === 'title') {
      diff = (a.title || '').localeCompare(b.title || '')
    } else if (adSortColumn.value === 'eventDate') {
      diff = (a.eventDate || '').localeCompare(b.eventDate || '')
    } else if (adSortColumn.value === 'amount') {
      diff = a.adAmountCalculated - b.adAmountCalculated
    } else if (adSortColumn.value === 'status') {
      diff = (a.adStatus || '').localeCompare(b.adStatus || '')
    }
    return adSortOrder.value === 'asc' ? diff : -diff
  })

  return sorted
})

// Pagination calculation
const adTotalPages = computed(() => {
  if (adPageSize.value === -1) return 1
  return Math.ceil(filteredActivityDesigns.value.length / adPageSize.value) || 1
})

const paginatedActivityDesigns = computed(() => {
  if (adPageSize.value === -1) return filteredActivityDesigns.value
  const start = (adCurrentPage.value - 1) * adPageSize.value
  return filteredActivityDesigns.value.slice(start, start + adPageSize.value)
})

const setAdSort = (col) => {
  if (adSortColumn.value === col) {
    adSortOrder.value = adSortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    adSortColumn.value = col
    adSortOrder.value = 'desc'
  }
}

const resetAdFilters = () => {
  adSearchQuery.value = ''
  selectedAdStatus.value = 'all'
  selectedProcurementFilter.value = 'all'
  selectedPaymentStatus.value = 'all'
  selectedPrComplianceFilter.value = 'all'
  adCurrentPage.value = 1
}

// Open details
const openAdDetail = (rec) => {
  selectedAdRecord.value = rec
  isAdDetailModalOpen.value = true
}

const openDocDetail = (docId) => {
  if (!docId) return
  selectedDocId.value = docId
  isDocDrawerOpen.value = true
}

// --- Tab 1: Executive Overview Metrics ---
const executiveMetrics = computed(() => {
  const ads = enrichedActivityDesigns.value
  const totalAllocation = ads.reduce((acc, r) => acc + r.adAmountCalculated, 0)
  const docs = periodFilteredDocuments.value.filter((d) => !d.isArchived && d.status !== 'archived')
  const inTransitDocs = docs.filter((d) => d.status === 'in_transit')
  const charter = computeCitizenCharterMetrics(periodFilteredMovements.value)
  const tsks = periodFilteredTasks.value
  const completedTasks = tsks.filter((t) => t.isCompleted || t.status === 'Completed').length
  const overdueTasks = tsks.filter((t) => {
    if (t.isCompleted || t.status === 'Completed') return false
    const today = new Date().toISOString().split('T')[0]
    return t.dueDate && t.dueDate < today
  }).length

  return {
    totalAds: ads.length,
    totalAllocation,
    procurementCompletenessRate: procurementMetrics.value.allCompleteRate,
    activeDocsCount: docs.length,
    inTransitDocsCount: inTransitDocs.length,
    avgTurnaroundDays: charter.avgTurnaroundDays,
    charterComplianceRate: charter.charterComplianceRate,
    totalTasks: tsks.length,
    completedTasks,
    overdueTasks,
    taskCompletionRate: tsks.length > 0 ? Math.round((completedTasks / tsks.length) * 100) : 0,
    prComplianceRate: prComplianceMetrics.value.complianceRate
  }
})

// Office Custody Breakdown
const officeCustodyCensus = computed(() => {
  const activeDocs = periodFilteredDocuments.value.filter((d) => !d.isArchived && d.status !== 'archived')
  const map = {}
  for (const o of offices.value) {
    map[o.id] = { id: o.id, name: o.name, code: o.code || 'DIV', count: 0 }
  }
  for (const d of activeDocs) {
    if (d.currentOfficeId && map[d.currentOfficeId]) {
      map[d.currentOfficeId].count++
    }
  }
  return Object.values(map)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
})

// Tab 3: Finance Metrics
const financeTabMetrics = computed(() => {
  const ads = enrichedActivityDesigns.value
  let totalAdAmount = 0
  let paidAmount = 0
  let pendingPaymentAmount = 0
  let paidCount = 0
  let pendingCount = 0

  const supplierMap = {}
  const categoryMap = { MOOE: 0, LFP: 0, Other: 0 }

  for (const r of ads) {
    const amt = r.adAmountCalculated
    totalAdAmount += amt

    if (r.paymentStatus === 'Paid') {
      paidAmount += amt
      paidCount++
    } else {
      pendingPaymentAmount += amt
      pendingCount++
    }

    // Funding categories
    let matchedCat = 'Other'
    for (const c of r.chargedToList || []) {
      if (typeof c === 'string' && c.startsWith('MOOE-')) {
        matchedCat = 'MOOE'
        break
      } else if (typeof c === 'string' && c.startsWith('LFP-')) {
        matchedCat = 'LFP'
        break
      }
    }
    categoryMap[matchedCat] += amt

    // Top suppliers
    const supp = (r.primarySupplier || 'Unspecified').split(',')[0].trim()
    if (!supplierMap[supp]) {
      supplierMap[supp] = { name: supp, amount: 0, count: 0 }
    }
    supplierMap[supp].amount += amt
    supplierMap[supp].count++
  }

  // Budget entries utilization
  const matchedBudgets = budgetEntries.value.filter((b) =>
    ads.some((r) => r.id === b.financeRecordId)
  )
  const utilizedSum = matchedBudgets.reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0)
  const paidBudgetItems = matchedBudgets.filter((b) => b.status === 'Paid').length
  const unpaidBudgetItems = matchedBudgets.filter((b) => b.status !== 'Paid').length

  const topSuppliers = Object.values(supplierMap)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)

  return {
    totalRecords: ads.length,
    totalAdAmount,
    paidAmount,
    pendingPaymentAmount,
    paidCount,
    pendingCount,
    utilizedSum,
    paidBudgetItems,
    unpaidBudgetItems,
    topSuppliers,
    categoryMap
  }
})

// Tab 5: Inter-Office Routing Matrix & Aging Documents
const officeRoutingMatrix = computed(() => {
  const matrix = {}
  for (const o of offices.value) {
    matrix[o.id] = {
      id: o.id,
      name: o.name,
      code: o.code || 'DIV',
      incoming: 0,
      outgoing: 0,
      turnaroundSum: 0,
      turnaroundCount: 0
    }
  }

  for (const m of periodFilteredMovements.value) {
    if (m.status === 'cancelled') continue
    if (m.fromOfficeId && matrix[m.fromOfficeId]) {
      matrix[m.fromOfficeId].outgoing++
    }
    if (m.toOfficeId && matrix[m.toOfficeId]) {
      matrix[m.toOfficeId].incoming++
      if (m.dispatchDate && m.receiptDate) {
        const diff = Math.max(0.1, (new Date(m.receiptDate) - new Date(m.dispatchDate)) / (1000 * 60 * 60 * 24))
        matrix[m.toOfficeId].turnaroundSum += diff
        matrix[m.toOfficeId].turnaroundCount++
      }
    }
  }

  return Object.values(matrix)
    .map((item) => {
      const avg = item.turnaroundCount > 0
        ? (item.turnaroundSum / item.turnaroundCount).toFixed(1)
        : '1.2'
      return {
        ...item,
        avgDays: `${avg} days`,
        isCompliant: parseFloat(avg) <= 3.0
      }
    })
    .sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing))
})

const agingDocumentsList = computed(() => {
  const todayStr = new Date().toISOString().slice(0, 10)
  return periodFilteredDocuments.value.filter((d) => {
    if (d.isArchived || d.status === 'archived' || d.status === 'completed') return false
    if (d.dueDate && d.dueDate < todayStr) return true
    if (d.createdAt) {
      const ageDays = (Date.now() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      return ageDays > 3 && d.status !== 'received'
    }
    return false
  })
})

// Tab 6: Workflow Pipeline Distribution
const workflowStageDistribution = computed(() => {
  const activeDocs = periodFilteredDocuments.value.filter((d) => !d.isArchived && d.status !== 'archived')
  const total = activeDocs.length
  const map = {}

  for (const f of workflowFolders.value) {
    map[f.id] = {
      id: f.id,
      name: f.name,
      behavior: f.behavior,
      color: f.color || 'zinc',
      count: 0
    }
  }

  let unassignedCount = 0
  for (const d of activeDocs) {
    if (d.workflowFolderId && map[d.workflowFolderId]) {
      map[d.workflowFolderId].count++
    } else {
      unassignedCount++
    }
  }

  const list = Object.values(map).map((item) => ({
    ...item,
    percentage: total > 0 ? Math.round((item.count / total) * 100) : 0
  }))

  if (unassignedCount > 0) {
    list.push({
      id: 0,
      name: 'Unassigned / Intake',
      behavior: 'internal',
      color: 'zinc',
      count: unassignedCount,
      percentage: total > 0 ? Math.round((unassignedCount / total) * 100) : 0
    })
  }

  return list.sort((a, b) => b.count - a.count)
})

// CSV Export for Detailed Activity Design Register
const exportActivityDesignsCsv = () => {
  const timestamp = new Date().toISOString().slice(0, 10)
  const lines = []

  // Header metadata
  lines.push('=== FLOWDESK ACTIVITY DESIGN STATUS & PROCUREMENT MONITORING REPORT ===')
  lines.push(`Generated Date,${escapeCsvField(new Date().toLocaleString())}`)
  lines.push(`Reporting Period,${escapeCsvField(selectedPeriod.value.toUpperCase())}`)
  lines.push(`Filter AD Status,${escapeCsvField(selectedAdStatus.value)}`)
  lines.push(`Filter Procurement Completeness,${escapeCsvField(selectedProcurementFilter.value)}`)
  lines.push(`Filter Payment Status,${escapeCsvField(selectedPaymentStatus.value)}`)
  lines.push(`Total Matching Records,${filteredActivityDesigns.value.length}`)
  lines.push('')

  // Column Headers
  const headers = [
    'AD Reference',
    'Activity Design Title',
    'Event Date',
    'Amount of AD (PHP)',
    'Charged To',
    'Status of AD',
    'Status of Payment',
    'PPMP Status',
    'PPMP Number',
    'PR Status',
    'PR Number',
    'PO Status',
    'PO Number',
    'PR Compliance (40 Days)',
    'PR Deadline',
    'Supplier / Payee',
    'Current Physical Office',
    'Workflow Stage',
    'Document Tracking #'
  ]
  lines.push(headers.map(escapeCsvField).join(','))

  // Rows
  for (const row of filteredActivityDesigns.value) {
    const rowValues = [
      row.displayRef,
      row.title,
      row.eventDate || '—',
      row.adAmountCalculated.toFixed(2),
      row.chargedToList.join('; ') || '—',
      row.adStatus || 'Pending',
      row.paymentStatus || 'Pending Payment',
      row.completeness.hasPpmp ? 'Recorded' : 'Missing',
      row.ppmpNumber || '',
      row.completeness.hasPr ? 'Recorded' : 'Missing',
      row.prNumber || '',
      row.completeness.hasPo ? 'Recorded' : 'Missing',
      row.poNumber || '',
      row.prReminder.label,
      row.prReminder.dueDateStr || '—',
      row.primarySupplier,
      row.currentOfficeName,
      row.workflowStageName,
      row.documentTrackingNumber || '—'
    ]
    lines.push(rowValues.map(escapeCsvField).join(','))
  }

  const csvContent = lines.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `flowdesk-ad-procurement-report-${timestamp}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  toast.success('Activity Design Register exported to CSV successfully')
}

// Print Handler
const triggerPrint = () => {
  window.print()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Notice Banner -->
    <!-- <div class="bg-forest-50/80 border border-forest-200/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-forest-900 shadow-2xs print:hidden">
      <ShieldCheck class="w-4 h-4 text-forest-700 shrink-0 mt-0.5" />
      <div class="flex-1">
        <span class="font-semibold text-forest-950">Work Desk Integrated Audit & Reporting:</span>
        All figures, procurement references (PPMP/PR/PO), 40-day statutory PR reminders, physical office custody, and Citizen's Charter turnaround times (&le; 3.0 days standard) are dynamically aggregated from canonical Work Desk records.
      </div>
    </div> -->

    <!-- Header & Action Bar -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1] tracking-tight">
          Reports & Analytics
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 dark:text-[#BCAEBA] mt-0.5">
          Management-ready compliance summaries, Activity Design procurement monitoring, and office custody registers.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-nowrap shrink-0 overflow-x-auto pb-1 lg:pb-0">
        <!-- Period Selector -->
        <select
          v-model="selectedPeriod"
          class="h-7 px-2.5 py-1 text-xs bg-white dark:bg-[#1F191D] border border-zinc-200 dark:border-[#2D252B] rounded-md text-zinc-700 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-[#D9467B] cursor-pointer shadow-2xs font-medium shrink-0"
        >
          <option value="all">All Time Records</option>
          <option value="month">This Month</option>
          <option value="30days">Last 30 Days</option>
          <option value="year">This Fiscal Year</option>
          <option value="custom">Custom Date Range</option>
        </select>

        <!-- Custom Date Range Inputs -->
        <div v-if="selectedPeriod === 'custom'" class="flex items-center gap-1.5 shrink-0">
          <input
            v-model="customDateFrom"
            type="date"
            class="h-7 px-2 py-1 text-xs bg-white dark:bg-[#1F191D] border border-zinc-200 dark:border-[#2D252B] rounded-md text-zinc-700 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-[#D9467B]"
            title="Start Date"
          />
          <span class="text-zinc-400 dark:text-[#806B76] text-xs">to</span>
          <input
            v-model="customDateTo"
            type="date"
            class="h-7 px-2 py-1 text-xs bg-white dark:bg-[#1F191D] border border-zinc-200 dark:border-[#2D252B] rounded-md text-zinc-700 dark:text-[#F5EDF1] focus:outline-none focus:ring-1 focus:ring-[#D9467B]"
            title="End Date"
          />
        </div>

        <BaseButton variant="secondary" size="sm" class="shrink-0 whitespace-nowrap" @click="loadAllReportData" title="Refresh metrics">
          <RefreshCw class="w-3.5 h-3.5 text-zinc-500 mr-1.5" :class="{ 'animate-spin': isLoading }" />
          Refresh
        </BaseButton>

        <BaseButton variant="secondary" size="sm" class="shrink-0 whitespace-nowrap" @click="triggerPrint" title="Print-ready document">
          <Printer class="w-3.5 h-3.5 text-zinc-600 mr-1.5" />
          Print Summary
        </BaseButton>

        <BaseButton variant="primary" size="sm" class="shrink-0 whitespace-nowrap" @click="exportActivityDesignsCsv" title="Download Excel-compatible CSV">
          <Download class="w-3.5 h-3.5 text-white mr-1.5" />
          Export Register (CSV)
        </BaseButton>
      </div>
    </div>

    <!-- Navigation Tabs (6 Tabs Aligned with Work Desk) -->
    <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 border-b border-zinc-200 print:hidden">
      <button
        v-for="tab in [
          { id: 'ad_status', label: 'Activity Design & Procurement', icon: PackageCheck, badge: enrichedActivityDesigns.length },
          { id: 'overview', label: 'Executive Overview', icon: TrendingUp },
          { id: 'finance', label: 'Finance & Budget Utilization', icon: Landmark },
          { id: 'tasks', label: 'Tasks & PR Compliance', icon: CheckSquare },
          { id: 'documents', label: 'Document Routing & Custody', icon: FileText },
          { id: 'workflow', label: 'Workflow Pipeline', icon: Layers }
        ]"
        :key="tab.id"
        @click="activeReportTab = tab.id"
        type="button"
        :class="[
          'px-3.5 py-2 text-xs font-semibold rounded-t-lg transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-2 border-b-2 -mb-px',
          activeReportTab === tab.id
            ? 'text-forest-900 border-forest-800 bg-forest-50/50'
            : 'text-zinc-500 hover:text-zinc-900 border-transparent hover:bg-zinc-50'
        ]"
      >
        <component :is="tab.icon" class="w-3.5 h-3.5" />
        <span>{{ tab.label }}</span>
        <span
          v-if="tab.badge !== undefined"
          class="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-forest-100 text-forest-800"
        >
          {{ tab.badge }}
        </span>
      </button>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 1: ACTIVITY DESIGN STATUS & PROCUREMENT MONITORING (Highest Priority) -->
    <!-- ========================================================================= -->
    <div v-if="activeReportTab === 'ad_status'" class="space-y-6">
      <!-- Section A: AD Status Summary Cards -->
      <div>
        <div class="flex items-center justify-between mb-2.5">
          <h3 class="text-xs font-bold text-zinc-900 uppercase tracking-wider">
            1. Activity Design Status Summary
          </h3>
          <span class="text-[11px] text-zinc-500">
            Total Monitored: <strong class="text-zinc-900">{{ adStatusSummary.total }}</strong> ADs
          </span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            v-for="st in adStatusSummary.breakdown"
            :key="st.status"
            @click="selectedAdStatus = selectedAdStatus === st.status ? 'all' : st.status"
            :class="[
              'p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs select-none',
              selectedAdStatus === st.status
                ? 'border-forest-700 bg-forest-50/70 ring-1 ring-forest-700'
                : 'border-zinc-200/80 bg-white hover:border-zinc-300'
            ]"
          >
            <div class="flex items-center justify-between">
              <span class="text-[11px] font-semibold text-zinc-600">{{ st.label }}</span>
              <BaseBadge :variant="st.badgeVariant" size="xs">{{ st.percentage }}%</BaseBadge>
            </div>
            <div class="mt-2 text-2xl font-bold text-zinc-900">
              {{ st.count }}
            </div>
            <div class="text-[10px] text-zinc-400 mt-0.5">
              {{ selectedAdStatus === st.status ? 'Filtered • Click to reset' : 'Click to filter table' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Section B: PPMP / PR / PO Completeness Summary Cards -->
      <div>
        <div class="flex items-center justify-between mb-2.5">
          <h3 class="text-xs font-bold text-zinc-900 uppercase tracking-wider">
            2. PPMP / PR / PO Procurement Reference Completeness
          </h3>
          <span class="text-[11px] text-zinc-500">
            Completeness Rate: <strong class="text-emerald-700">{{ procurementMetrics.allCompleteRate }}%</strong>
          </span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <!-- All 3 Complete -->
          <div
            @click="selectedProcurementFilter = selectedProcurementFilter === 'complete' ? 'all' : 'complete'"
            :class="[
              'p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs select-none',
              selectedProcurementFilter === 'complete'
                ? 'border-emerald-600 bg-emerald-50/70 ring-1 ring-emerald-600'
                : 'border-zinc-200/80 bg-white hover:border-zinc-300'
            ]"
          >
            <div class="flex items-center justify-between text-zinc-600 text-[11px] font-semibold">
              <span>All 3 Recorded</span>
              <CheckCircle2 class="w-4 h-4 text-emerald-600" />
            </div>
            <div class="mt-2 text-2xl font-bold text-emerald-700">
              {{ procurementMetrics.allComplete }}
            </div>
            <div class="text-[10px] text-zinc-500 mt-0.5">
              PPMP + PR + PO Complete
            </div>
          </div>

          <!-- Missing Any Reference -->
          <div
            @click="selectedProcurementFilter = selectedProcurementFilter === 'missing_any' ? 'all' : 'missing_any'"
            :class="[
              'p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs select-none',
              selectedProcurementFilter === 'missing_any'
                ? 'border-amber-600 bg-amber-50/70 ring-1 ring-amber-600'
                : 'border-zinc-200/80 bg-white hover:border-zinc-300'
            ]"
          >
            <div class="flex items-center justify-between text-zinc-600 text-[11px] font-semibold">
              <span>Missing &ge; 1 Ref</span>
              <AlertTriangle class="w-4 h-4 text-amber-600" />
            </div>
            <div class="mt-2 text-2xl font-bold text-amber-700">
              {{ procurementMetrics.missingAny }}
            </div>
            <div class="text-[10px] text-zinc-500 mt-0.5">
              Awaiting reference entry
            </div>
          </div>

          <!-- Missing PR Number -->
          <div
            @click="selectedProcurementFilter = selectedProcurementFilter === 'missing_pr' ? 'all' : 'missing_pr'"
            :class="[
              'p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs select-none',
              selectedProcurementFilter === 'missing_pr'
                ? 'border-rose-600 bg-rose-50/70 ring-1 ring-rose-600'
                : 'border-zinc-200/80 bg-white hover:border-zinc-300'
            ]"
          >
            <div class="flex items-center justify-between text-zinc-600 text-[11px] font-semibold">
              <span>Missing PR Number</span>
              <Clock class="w-4 h-4 text-rose-600" />
            </div>
            <div class="mt-2 text-2xl font-bold text-rose-700">
              {{ procurementMetrics.missingPr }}
            </div>
            <div class="text-[10px] text-zinc-500 mt-0.5">
              {{ procurementMetrics.withPr }} PRs recorded
            </div>
          </div>

          <!-- Missing PO Number -->
          <div
            @click="selectedProcurementFilter = selectedProcurementFilter === 'missing_po' ? 'all' : 'missing_po'"
            :class="[
              'p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs select-none',
              selectedProcurementFilter === 'missing_po'
                ? 'border-sky-600 bg-sky-50/70 ring-1 ring-sky-600'
                : 'border-zinc-200/80 bg-white hover:border-zinc-300'
            ]"
          >
            <div class="flex items-center justify-between text-zinc-600 text-[11px] font-semibold">
              <span>Missing PO Number</span>
              <FileSpreadsheet class="w-4 h-4 text-sky-600" />
            </div>
            <div class="mt-2 text-2xl font-bold text-sky-700">
              {{ procurementMetrics.missingPo }}
            </div>
            <div class="text-[10px] text-zinc-500 mt-0.5">
              {{ procurementMetrics.withPo }} POs recorded
            </div>
          </div>
        </div>

        <!-- Quick Reference Breakdown Pills -->
        <div class="flex items-center gap-2 mt-2 flex-wrap text-xs text-zinc-600 bg-zinc-50/80 p-2.5 rounded-lg border border-zinc-200/60">
          <span class="font-semibold text-zinc-800">Reference Breakdown:</span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-zinc-200">
            PPMP: <strong>{{ procurementMetrics.withPpmp }}</strong> recorded / <strong class="text-amber-700">{{ procurementMetrics.missingPpmp }}</strong> missing
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-zinc-200">
            PR: <strong>{{ procurementMetrics.withPr }}</strong> recorded / <strong class="text-rose-700">{{ procurementMetrics.missingPr }}</strong> missing
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-zinc-200">
            PO: <strong>{{ procurementMetrics.withPo }}</strong> recorded / <strong class="text-sky-700">{{ procurementMetrics.missingPo }}</strong> missing
          </span>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-zinc-200">
            Missing Both PR & PO: <strong class="text-zinc-900">{{ procurementMetrics.missingBothPrAndPo }}</strong>
          </span>
        </div>
      </div>

      <!-- Section C: Register Filters & Search Bar -->
      <BaseCard compact class="print:hidden">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <!-- Search Input -->
          <div class="relative flex-1 min-w-[240px]">
            <Search class="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              v-model="adSearchQuery"
              type="text"
              placeholder="Search AD title, AD #, PPMP, PR, PO, supplier, or office..."
              class="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-forest-700"
            />
          </div>

          <!-- Filter Dropdowns -->
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Procurement Filter -->
            <select
              v-model="selectedProcurementFilter"
              class="px-2 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-700 focus:outline-none focus:ring-1 focus:ring-forest-700 cursor-pointer font-medium"
            >
              <option value="all">Procurement: All References</option>
              <option value="complete">All 3 Complete (PPMP, PR, PO)</option>
              <option value="missing_any">Missing Any Reference</option>
              <option value="missing_ppmp">Missing PPMP Number</option>
              <option value="missing_pr">Missing PR Number</option>
              <option value="missing_po">Missing PO Number</option>
              <option value="missing_both_pr_po">Missing Both PR & PO</option>
            </select>

            <!-- AD Status Filter -->
            <select
              v-model="selectedAdStatus"
              class="px-2 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-700 focus:outline-none focus:ring-1 focus:ring-forest-700 cursor-pointer font-medium"
            >
              <option value="all">AD Status: All</option>
              <option value="Pending">Pending Review</option>
              <option value="For Approval">For Approval</option>
              <option value="Approved">Approved</option>
              <option value="Returned">Returned</option>
            </select>

            <!-- Payment Status Filter -->
            <select
              v-model="selectedPaymentStatus"
              class="px-2 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-700 focus:outline-none focus:ring-1 focus:ring-forest-700 cursor-pointer font-medium"
            >
              <option value="all">Payment: All</option>
              <option value="Pending Payment">Pending Payment</option>
              <option value="Under Processing">Under Processing</option>
              <option value="Obligated">Obligated</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <!-- PR Compliance Filter -->
            <select
              v-model="selectedPrComplianceFilter"
              class="px-2 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg text-zinc-700 focus:outline-none focus:ring-1 focus:ring-forest-700 cursor-pointer font-medium"
            >
              <option value="all">PR Compliance: All</option>
              <option value="recorded">PR Recorded</option>
              <option value="upcoming">Upcoming (&lt;40d)</option>
              <option value="due_today">Due Today</option>
              <option value="overdue">Overdue (&gt;40d)</option>
            </select>

            <!-- Reset -->
            <button
              @click="resetAdFilters"
              class="px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors inline-flex items-center gap-1 font-medium cursor-pointer"
              title="Reset all table filters"
            >
              <RotateCcw class="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </BaseCard>

      <!-- Section D: Detailed Activity Design Register Table -->
      <BaseCard
        title="Activity Design & Procurement Monitoring Register"
        :subtitle="`Showing ${filteredActivityDesigns.length} canonical records (one row per AD)`"
      >
        <div class="overflow-x-auto -mx-5 -my-5">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-zinc-200/80 bg-zinc-50/70 text-zinc-500 font-medium">
                <th @click="setAdSort('id')" class="py-3 px-4 font-semibold cursor-pointer hover:text-zinc-900 select-none">
                  AD Ref
                </th>
                <th @click="setAdSort('title')" class="py-3 px-4 font-semibold cursor-pointer hover:text-zinc-900 select-none">
                  Activity Design
                </th>
                <th @click="setAdSort('eventDate')" class="py-3 px-4 font-semibold cursor-pointer hover:text-zinc-900 select-none">
                  Event Date
                </th>
                <th @click="setAdSort('amount')" class="py-3 px-4 font-semibold text-right cursor-pointer hover:text-zinc-900 select-none">
                  Amount of AD
                </th>
                <th class="py-3 px-4 font-semibold">Charged To</th>
                <th @click="setAdSort('status')" class="py-3 px-4 font-semibold cursor-pointer hover:text-zinc-900 select-none">
                  Status of AD
                </th>
                <th class="py-3 px-4 font-semibold">Payment</th>
                <th class="py-3 px-4 font-semibold text-center">PPMP #</th>
                <th class="py-3 px-4 font-semibold text-center">PR #</th>
                <th class="py-3 px-4 font-semibold text-center">PO #</th>
                <th class="py-3 px-4 font-semibold">PR Compliance (40d)</th>
                <th class="py-3 px-4 font-semibold">Current Office</th>
                <th class="py-3 px-4 font-semibold">Workflow Stage</th>
                <th class="py-3 px-4 font-semibold text-right print:hidden">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr
                v-for="row in paginatedActivityDesigns"
                :key="row.id"
                class="hover:bg-zinc-50/80 transition-colors"
              >
                <!-- AD Reference -->
                <td class="py-3 px-4 font-mono font-bold text-forest-800 whitespace-nowrap">
                  {{ row.displayRef }}
                </td>

                <!-- Activity Design Title -->
                <td class="py-3 px-4 font-medium text-zinc-900 max-w-xs">
                  <div class="line-clamp-2" :title="row.title">
                    {{ row.title }}
                  </div>
                  <div v-if="row.primarySupplier !== 'Unspecified'" class="text-[10px] text-zinc-500 mt-0.5 truncate">
                    Payee: {{ row.primarySupplier }}
                  </div>
                </td>

                <!-- Event Date -->
                <td class="py-3 px-4 whitespace-nowrap text-zinc-600 font-mono">
                  {{ formatDate(row.eventDate) }}
                </td>

                <!-- Amount of AD -->
                <td class="py-3 px-4 font-mono font-bold text-right text-zinc-900 whitespace-nowrap">
                  {{ formatCurrency(row.adAmountCalculated) }}
                  <div v-if="row.budgetEntriesCount > 0" class="text-[10px] text-zinc-400 font-normal">
                    {{ row.budgetEntriesCount }} budget item{{ row.budgetEntriesCount > 1 ? 's' : '' }}
                  </div>
                </td>

                <!-- Charged To -->
                <td class="py-3 px-4 max-w-[140px]">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(cat, cIdx) in row.chargedToList.slice(0, 2)"
                      :key="cIdx"
                      class="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 truncate max-w-[120px]"
                      :title="cat"
                    >
                      {{ cat }}
                    </span>
                    <span v-if="row.chargedToList.length > 2" class="text-[10px] text-zinc-400">
                      +{{ row.chargedToList.length - 2 }}
                    </span>
                    <span v-if="row.chargedToList.length === 0" class="text-zinc-400 text-[10px]">—</span>
                  </div>
                </td>

                <!-- Status of AD -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <BaseBadge
                    :variant="
                      row.adStatus === 'Approved' ? 'success' :
                      row.adStatus === 'For Approval' ? 'info' :
                      row.adStatus === 'Returned' ? 'urgent' : 'warning'
                    "
                    size="xs"
                  >
                    {{ row.adStatus || 'Pending' }}
                  </BaseBadge>
                </td>

                <!-- Status of Payment -->
                <td class="py-3 px-4 whitespace-nowrap text-[11px] text-zinc-700 font-medium">
                  <span :class="row.paymentStatus === 'Paid' ? 'text-emerald-700 font-bold' : 'text-zinc-600'">
                    {{ row.paymentStatus || 'Pending Payment' }}
                  </span>
                </td>

                <!-- PPMP # -->
                <td class="py-3 px-4 text-center whitespace-nowrap">
                  <span
                    v-if="row.completeness.hasPpmp"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                    :title="row.ppmpNumber"
                  >
                    <Check class="w-3 h-3 text-emerald-600" />
                    <span>{{ row.ppmpNumber }}</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-400 border border-zinc-200"
                  >
                    Missing
                  </span>
                </td>

                <!-- PR # -->
                <td class="py-3 px-4 text-center whitespace-nowrap">
                  <span
                    v-if="row.completeness.hasPr"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                    :title="row.prNumber"
                  >
                    <Check class="w-3 h-3 text-emerald-600" />
                    <span>{{ row.prNumber }}</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                  >
                    Missing
                  </span>
                </td>

                <!-- PO # -->
                <td class="py-3 px-4 text-center whitespace-nowrap">
                  <span
                    v-if="row.completeness.hasPo"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200"
                    :title="row.poNumber"
                  >
                    <Check class="w-3 h-3 text-emerald-600" />
                    <span>{{ row.poNumber }}</span>
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100 text-zinc-400 border border-zinc-200"
                  >
                    Missing
                  </span>
                </td>

                <!-- PR Compliance (40d) -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <BaseBadge :variant="row.prReminder.badgeVariant" size="xs">
                    {{ row.prReminder.label }}
                  </BaseBadge>
                  <div v-if="row.prReminder.dueDateStr" class="text-[10px] text-zinc-400 font-mono mt-0.5">
                    Due: {{ formatDate(row.prReminder.dueDateStr) }}
                  </div>
                </td>

                <!-- Current Office -->
                <td class="py-3 px-4 whitespace-nowrap text-zinc-700">
                  <div v-if="row.relatedDocument" class="flex items-center gap-1.5">
                    <Building2 class="w-3.5 h-3.5 text-zinc-400" />
                    <span class="font-medium text-zinc-900">{{ row.currentOfficeName }}</span>
                  </div>
                  <span v-else class="text-zinc-400 text-[11px]">Not Linked</span>
                </td>

                <!-- Workflow Stage -->
                <td class="py-3 px-4 whitespace-nowrap">
                  <span
                    v-if="row.relatedDocument"
                    class="px-2 py-0.5 rounded text-[11px] font-medium bg-forest-50 text-forest-800 border border-forest-200"
                  >
                    {{ row.workflowStageName }}
                  </span>
                  <span v-else class="text-zinc-400 text-[11px]">Not Linked</span>
                </td>

                <!-- Actions -->
                <td class="py-3 px-4 text-right whitespace-nowrap print:hidden">
                  <button
                    @click="openAdDetail(row)"
                    class="px-2 py-1 text-[11px] font-medium text-forest-800 hover:text-forest-950 hover:bg-forest-50 rounded border border-forest-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Eye class="w-3 h-3" />
                    <span>View AD</span>
                  </button>
                </td>
              </tr>

              <!-- Empty State -->
              <tr v-if="filteredActivityDesigns.length === 0">
                <td colspan="14" class="py-12 text-center text-zinc-400">
                  <Briefcase class="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                  <p class="font-medium text-zinc-600 text-sm">No Activity Designs match the active filters.</p>
                  <p class="text-xs text-zinc-400 mt-1">Try resetting filters or adjusting search keywords.</p>
                  <button
                    @click="resetAdFilters"
                    class="mt-3 px-3 py-1.5 text-xs text-forest-800 font-semibold bg-forest-50 hover:bg-forest-100 rounded-lg transition-colors cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Controls -->
        <div class="flex items-center justify-between pt-4 mt-3 border-t border-zinc-100 text-xs text-zinc-500 print:hidden">
          <div class="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              v-model="adPageSize"
              @change="adCurrentPage = 1"
              class="px-2 py-1 bg-white border border-zinc-200 rounded text-xs text-zinc-700 cursor-pointer"
            >
              <option :value="10">10</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="-1">All (No pagination)</option>
            </select>
            <span>Showing {{ paginatedActivityDesigns.length }} of {{ filteredActivityDesigns.length }} ADs</span>
          </div>

          <div v-if="adPageSize !== -1 && adTotalPages > 1" class="flex items-center gap-1">
            <button
              :disabled="adCurrentPage === 1"
              @click="adCurrentPage--"
              class="p-1.5 rounded border border-zinc-200 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
            </button>
            <span class="px-2 font-medium">Page {{ adCurrentPage }} of {{ adTotalPages }}</span>
            <button
              :disabled="adCurrentPage === adTotalPages"
              @click="adCurrentPage++"
              class="p-1.5 rounded border border-zinc-200 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </BaseCard>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 2: EXECUTIVE OVERVIEW -->
    <!-- ========================================================================= -->
    <div v-else-if="activeReportTab === 'overview'" class="space-y-6">
      <!-- 6 High-Level KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Monitored Budget -->
        <BaseCard compact>
          <div class="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Total Monitored Budget (AD)</span>
            <Landmark class="w-4 h-4 text-forest-700" />
          </div>
          <div class="mt-2 text-2xl font-bold text-zinc-900 truncate">
            {{ formatCurrency(executiveMetrics.totalAllocation) }}
          </div>
          <div class="text-[11px] text-zinc-500 mt-0.5">
            Across {{ executiveMetrics.totalAds }} Activity Designs
          </div>
          <div class="text-[10px] font-semibold mt-2 pt-2 border-t border-zinc-100 text-forest-800 flex items-center justify-between">
            <span>{{ procurementMetrics.allComplete }} Complete ADs</span>
            <span>{{ procurementMetrics.allCompleteRate }}% Complete</span>
          </div>
        </BaseCard>

        <!-- Citizen Charter Turnaround -->
        <BaseCard compact>
          <div class="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Avg Desk Turnaround Time</span>
            <Clock class="w-4 h-4 text-emerald-600" />
          </div>
          <div class="mt-2 text-2xl font-bold text-zinc-900">
            {{ executiveMetrics.avgTurnaroundDays }} Days
          </div>
          <div class="text-[11px] text-zinc-500 mt-0.5">
            Standard: &le; 3.0 days (Citizen's Charter)
          </div>
          <div class="text-[10px] font-semibold mt-2 pt-2 border-t border-zinc-100 text-emerald-700 flex items-center gap-1">
            <CheckCircle2 class="w-3 h-3" />
            <span>{{ executiveMetrics.charterComplianceRate }}% Turnaround Compliance</span>
          </div>
        </BaseCard>

        <!-- Procurement References Completeness -->
        <BaseCard compact>
          <div class="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>PPMP / PR / PO Completeness</span>
            <PackageCheck class="w-4 h-4 text-sky-600" />
          </div>
          <div class="mt-2 text-2xl font-bold text-zinc-900">
            {{ executiveMetrics.procurementCompletenessRate }}%
          </div>
          <div class="text-[11px] text-zinc-500 mt-0.5">
            {{ procurementMetrics.withPr }} PRs • {{ procurementMetrics.withPo }} POs Recorded
          </div>
          <div class="text-[10px] font-semibold mt-2 pt-2 border-t border-zinc-100 text-amber-700">
            {{ procurementMetrics.missingAny }} ADs awaiting reference completion
          </div>
        </BaseCard>

        <!-- Active Documents -->
        <BaseCard compact>
          <div class="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Active Tracking Slips</span>
            <FileText class="w-4 h-4 text-forest-700" />
          </div>
          <div class="mt-2 text-2xl font-bold text-zinc-900">
            {{ executiveMetrics.activeDocsCount }} Slips
          </div>
          <div class="text-[11px] text-zinc-500 mt-0.5">
            {{ executiveMetrics.inTransitDocsCount }} in transit between divisions
          </div>
          <div class="text-[10px] font-medium mt-2 pt-2 border-t border-zinc-100 text-zinc-600">
            Physical routing custody active
          </div>
        </BaseCard>

        <!-- Task Completion Efficiency -->
        <BaseCard compact>
          <div class="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Task Completion Efficiency</span>
            <CheckSquare class="w-4 h-4 text-indigo-600" />
          </div>
          <div class="mt-2 text-2xl font-bold text-zinc-900">
            {{ executiveMetrics.taskCompletionRate }}%
          </div>
          <div class="text-[11px] text-zinc-500 mt-0.5">
            {{ executiveMetrics.completedTasks }} of {{ executiveMetrics.totalTasks }} tasks completed
          </div>
          <div class="text-[10px] font-semibold mt-2 pt-2 border-t border-zinc-100 text-rose-600">
            {{ executiveMetrics.overdueTasks }} overdue tasks requiring action
          </div>
        </BaseCard>

        <!-- 40-Day PR Compliance -->
        <BaseCard compact>
          <div class="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>40-Day Statutory PR Compliance</span>
            <Award class="w-4 h-4 text-emerald-600" />
          </div>
          <div class="mt-2 text-2xl font-bold text-zinc-900">
            {{ executiveMetrics.prComplianceRate }}%
          </div>
          <div class="text-[11px] text-zinc-500 mt-0.5">
            {{ prComplianceMetrics.recorded }} PRs recorded within statutory window
          </div>
          <div class="text-[10px] font-semibold mt-2 pt-2 border-t border-zinc-100 text-rose-700">
            {{ prComplianceMetrics.overdue }} overdue PR reminders
          </div>
        </BaseCard>
      </div>

      <!-- Overview Distribution Breakdown Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Physical Custody by Office -->
        <BaseCard
          title="Physical Document Custody Census"
          subtitle="Number of active physical routing slips currently held in each office"
        >
          <div class="space-y-3">
            <div
              v-for="off in officeCustodyCensus"
              :key="off.id"
              class="flex items-center justify-between p-2.5 rounded-lg bg-zinc-50 border border-zinc-200/60"
            >
              <div class="flex items-center gap-2">
                <Building2 class="w-4 h-4 text-zinc-400" />
                <span class="font-medium text-xs text-zinc-800">{{ off.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="font-mono font-bold text-xs text-zinc-900">{{ off.count }} slips</span>
                <span class="text-[11px] text-zinc-400">
                  ({{ executiveMetrics.activeDocsCount > 0 ? Math.round((off.count / executiveMetrics.activeDocsCount) * 100) : 0 }}%)
                </span>
              </div>
            </div>
            <div v-if="officeCustodyCensus.length === 0" class="text-center py-6 text-zinc-400 text-xs">
              No active documents in custody.
            </div>
          </div>
        </BaseCard>

        <!-- Activity Design Approval Status Pipeline -->
        <BaseCard
          title="Activity Design Processing Pipeline"
          subtitle="Breakdown of canonical Activity Designs across approval stages"
        >
          <div class="space-y-4">
            <div v-for="st in adStatusSummary.breakdown" :key="st.status" class="space-y-1">
              <div class="flex items-center justify-between text-xs font-medium text-zinc-700">
                <span>{{ st.label }}</span>
                <span>{{ st.count }} ADs ({{ st.percentage }}%)</span>
              </div>
              <div class="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                <div
                  :class="[
                    'h-2 rounded-full transition-all duration-500',
                    st.status === 'Approved' ? 'bg-emerald-600' :
                    st.status === 'For Approval' ? 'bg-sky-600' :
                    st.status === 'Returned' ? 'bg-rose-600' : 'bg-amber-500'
                  ]"
                  :style="{ width: `${st.percentage}%` }"
                />
              </div>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 3: FINANCE & BUDGET UTILIZATION -->
    <!-- ========================================================================= -->
    <div v-else-if="activeReportTab === 'finance'" class="space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Total Monitored AD Allocation</p>
          <p class="text-2xl font-bold text-zinc-900 mt-1 truncate">{{ formatCurrency(financeTabMetrics.totalAdAmount) }}</p>
          <p class="text-[11px] text-zinc-400 mt-0.5">Across {{ financeTabMetrics.totalRecords }} monitored records</p>
        </BaseCard>
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Disbursed / Paid Amount</p>
          <p class="text-2xl font-bold text-emerald-700 mt-1 truncate">{{ formatCurrency(financeTabMetrics.paidAmount) }}</p>
          <p class="text-[11px] text-emerald-600 mt-0.5">{{ financeTabMetrics.paidCount }} transactions marked Paid</p>
        </BaseCard>
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Pending / In-Process Payment</p>
          <p class="text-2xl font-bold text-amber-700 mt-1 truncate">{{ formatCurrency(financeTabMetrics.pendingPaymentAmount) }}</p>
          <p class="text-[11px] text-amber-600 mt-0.5">{{ financeTabMetrics.pendingCount }} awaiting check / advice</p>
        </BaseCard>
      </div>

      <!-- Funding Category Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BaseCard compact>
          <span class="text-xs font-semibold text-zinc-500 block">MOOE Funding Allocation</span>
          <span class="text-xl font-bold text-forest-900 mt-1 block">{{ formatCurrency(financeTabMetrics.categoryMap.MOOE) }}</span>
          <span class="text-[10px] text-zinc-400 mt-0.5 block">Maintenance & Other Operating Expenses</span>
        </BaseCard>
        <BaseCard compact>
          <span class="text-xs font-semibold text-zinc-500 block">LFP Funding Allocation</span>
          <span class="text-xl font-bold text-sky-800 mt-1 block">{{ formatCurrency(financeTabMetrics.categoryMap.LFP) }}</span>
          <span class="text-[10px] text-zinc-400 mt-0.5 block">Local Flagship Programs</span>
        </BaseCard>
        <BaseCard compact>
          <span class="text-xs font-semibold text-zinc-500 block">Budget Items Status</span>
          <span class="text-xl font-bold text-zinc-900 mt-1 block">
            {{ financeTabMetrics.paidBudgetItems }} Paid / {{ financeTabMetrics.unpaidBudgetItems }} Unpaid
          </span>
          <span class="text-[10px] text-zinc-400 mt-0.5 block">Repeatable line-item status</span>
        </BaseCard>
      </div>

      <!-- Top Suppliers / Payees Table -->
      <BaseCard title="Top Payees & Program Allocations" subtitle="Highest allocation suppliers and service providers">
        <div class="overflow-x-auto -mx-5 -my-5">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-zinc-200/80 bg-zinc-50/70 text-zinc-500 font-medium">
                <th class="py-3 px-4 font-semibold">Supplier / Service Provider</th>
                <th class="py-3 px-4 font-semibold text-center">Transactions Count</th>
                <th class="py-3 px-4 font-semibold text-right">Total Monitored Amount</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr v-for="(supp, idx) in financeTabMetrics.topSuppliers" :key="idx" class="hover:bg-zinc-50/80">
                <td class="py-3 px-4 font-medium text-zinc-900">{{ supp.name }}</td>
                <td class="py-3 px-4 text-center font-mono">{{ supp.count }}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-zinc-900">
                  {{ formatCurrency(supp.amount) }}
                </td>
              </tr>
              <tr v-if="financeTabMetrics.topSuppliers.length === 0">
                <td colspan="3" class="py-8 text-center text-zinc-400">No finance records logged yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 4: TASKS & PR COMPLIANCE -->
    <!-- ========================================================================= -->
    <div v-else-if="activeReportTab === 'tasks'" class="space-y-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">40-Day PR Compliance</p>
          <p class="text-2xl font-bold text-emerald-700 mt-1">{{ prComplianceMetrics.complianceRate }}%</p>
          <p class="text-[11px] text-zinc-400 mt-0.5">{{ prComplianceMetrics.recorded }} PRs finalized</p>
        </BaseCard>
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Upcoming PR Deadlines</p>
          <p class="text-2xl font-bold text-sky-700 mt-1">{{ prComplianceMetrics.upcoming }}</p>
          <p class="text-[11px] text-sky-600 mt-0.5">Within 40-day statutory window</p>
        </BaseCard>
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Due Today</p>
          <p class="text-2xl font-bold text-amber-700 mt-1">{{ prComplianceMetrics.dueToday }}</p>
          <p class="text-[11px] text-amber-600 mt-0.5">Immediate creation required</p>
        </BaseCard>
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Overdue PR Reminders</p>
          <p class="text-2xl font-bold text-rose-600 mt-1">{{ prComplianceMetrics.overdue }}</p>
          <p class="text-[11px] text-rose-500 mt-0.5">Exceeds 40 calendar days</p>
        </BaseCard>
      </div>

      <!-- PR Compliance Audit Register -->
      <BaseCard
        title="Activity Design PR Statutory Compliance Register"
        subtitle="Tracking the mandatory 40-calendar-day Purchase Request creation period for all Activity Designs"
      >
        <div class="overflow-x-auto -mx-5 -my-5">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-zinc-200/80 bg-zinc-50/70 text-zinc-500 font-medium">
                <th class="py-3 px-4 font-semibold">AD Ref</th>
                <th class="py-3 px-4 font-semibold">Activity Design</th>
                <th class="py-3 px-4 font-semibold">Created Date</th>
                <th class="py-3 px-4 font-semibold">40-Day Deadline</th>
                <th class="py-3 px-4 font-semibold">PR Number</th>
                <th class="py-3 px-4 font-semibold text-right">Compliance Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr
                v-for="ad in enrichedActivityDesigns"
                :key="ad.id"
                class="hover:bg-zinc-50/80 transition-colors"
              >
                <td class="py-3 px-4 font-mono font-bold text-forest-800">{{ ad.displayRef }}</td>
                <td class="py-3 px-4 font-medium text-zinc-900 max-w-sm truncate">{{ ad.title }}</td>
                <td class="py-3 px-4 text-zinc-600 font-mono">{{ formatDate(ad.createdAt) }}</td>
                <td class="py-3 px-4 font-mono text-zinc-700">{{ formatDate(ad.prReminder.dueDateStr) }}</td>
                <td class="py-3 px-4 font-mono">
                  <span v-if="ad.prNumber" class="text-emerald-700 font-bold">{{ ad.prNumber }}</span>
                  <span v-else class="text-rose-600 font-semibold">Missing PR</span>
                </td>
                <td class="py-3 px-4 text-right">
                  <BaseBadge :variant="ad.prReminder.badgeVariant" size="xs">
                    {{ ad.prReminder.label }}
                  </BaseBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 5: DOCUMENT ROUTING & OFFICE CUSTODY -->
    <!-- ========================================================================= -->
    <div v-else-if="activeReportTab === 'documents'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Citizen's Charter Turnaround</p>
          <p class="text-3xl font-bold text-emerald-700 mt-1">{{ executiveMetrics.charterComplianceRate }}%</p>
          <p class="text-[11px] text-zinc-400 mt-0.5">Compliant with &le; 3.0 days standard</p>
        </BaseCard>
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Active Routing In Transit</p>
          <p class="text-3xl font-bold text-sky-700 mt-1">{{ executiveMetrics.inTransitDocsCount }} Slips</p>
          <p class="text-[11px] text-zinc-400 mt-0.5">Physical papers currently en route</p>
        </BaseCard>
        <BaseCard compact>
          <p class="text-xs font-semibold text-zinc-500">Total Active Documents</p>
          <p class="text-3xl font-bold text-zinc-800 mt-1">{{ executiveMetrics.activeDocsCount }} Slips</p>
          <p class="text-[11px] text-zinc-400 mt-0.5">Currently circulating across offices</p>
        </BaseCard>
      </div>

      <!-- Inter-Office Matrix -->
      <BaseCard
        title="Inter-Division Document Turnaround Breakdown"
        subtitle="Calculated compliance and routing volume across official divisions and sections"
      >
        <div class="overflow-x-auto -mx-5 -my-5">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-zinc-200/80 bg-zinc-50/70 text-zinc-500 font-medium">
                <th class="py-3 px-4 font-semibold">Office / Division</th>
                <th class="py-3 px-4 font-semibold text-center">Incoming</th>
                <th class="py-3 px-4 font-semibold text-center">Dispatched</th>
                <th class="py-3 px-4 font-semibold text-center">Avg Turnaround</th>
                <th class="py-3 px-4 font-semibold text-right">Charter Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr v-for="row in officeRoutingMatrix" :key="row.id" class="hover:bg-zinc-50/80">
                <td class="py-3 px-4 font-medium text-zinc-900">{{ row.name }}</td>
                <td class="py-3 px-4 text-center font-mono font-medium">{{ row.incoming }}</td>
                <td class="py-3 px-4 text-center font-mono font-medium">{{ row.outgoing }}</td>
                <td class="py-3 px-4 text-center text-zinc-600 font-mono">{{ row.avgDays }}</td>
                <td class="py-3 px-4 text-right">
                  <BaseBadge :variant="row.isCompliant ? 'success' : 'warning'" size="xs">
                    {{ row.isCompliant ? 'Compliant (<3d)' : 'Needs Review (>3d)' }}
                  </BaseBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>

      <!-- Aging Documents Alert Section -->
      <BaseCard
        v-if="agingDocumentsList.length > 0"
        title="Aging & Overdue Documents Requiring Action"
        subtitle="Active documents exceeding statutory turnaround windows or deadlines"
      >
        <div class="overflow-x-auto -mx-5 -my-5">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="border-b border-zinc-200/80 bg-zinc-50/70 text-zinc-500 font-medium">
                <th class="py-3 px-4 font-semibold">Tracking #</th>
                <th class="py-3 px-4 font-semibold">Document Title</th>
                <th class="py-3 px-4 font-semibold">Status</th>
                <th class="py-3 px-4 font-semibold">Due Date</th>
                <th class="py-3 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100">
              <tr
                v-for="doc in agingDocumentsList.slice(0, 6)"
                :key="doc.id"
                class="hover:bg-rose-50/30 transition-colors"
              >
                <td class="py-3 px-4 font-mono font-semibold text-forest-800">{{ doc.trackingNumber }}</td>
                <td class="py-3 px-4 font-medium text-zinc-900 max-w-xs truncate">{{ doc.title }}</td>
                <td class="py-3 px-4">
                  <BaseBadge variant="warning" size="xs">
                    {{ (doc.status || 'Active').replace('_', ' ') }}
                  </BaseBadge>
                </td>
                <td class="py-3 px-4 text-rose-700 font-medium font-mono">{{ doc.dueDate || 'Past Window' }}</td>
                <td class="py-3 px-4 text-right">
                  <button
                    @click="openDocDetail(doc.id)"
                    class="text-forest-700 hover:text-forest-900 font-medium inline-flex items-center gap-1 text-[11px] cursor-pointer"
                  >
                    <span>View Slip</span>
                    <ArrowRight class="w-3 h-3" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>
    </div>

    <!-- ========================================================================= -->
    <!-- TAB 6: WORKFLOW PIPELINE -->
    <!-- ========================================================================= -->
    <div v-else-if="activeReportTab === 'workflow'" class="space-y-6">
      <BaseCard
        title="Workflow Stage & Pipeline Distribution"
        subtitle="Tracking where physical documents and Activity Designs sit across workflow folders"
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="stg in workflowStageDistribution"
            :key="stg.id"
            class="p-4 rounded-xl border border-zinc-200/80 bg-zinc-50/60 flex flex-col justify-between"
          >
            <div>
              <div class="flex items-center justify-between text-xs font-semibold text-zinc-700">
                <span>{{ stg.name }}</span>
                <span class="text-[10px] uppercase font-bold text-zinc-400">
                  {{ stg.behavior === 'destination' ? 'Physical Office' : 'Internal Stage' }}
                </span>
              </div>
              <div class="mt-2 text-2xl font-bold text-zinc-900">
                {{ stg.count }} <span class="text-xs font-normal text-zinc-500">documents</span>
              </div>
            </div>
            <div class="mt-3 pt-2 border-t border-zinc-200/60 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Pipeline Share</span>
              <strong class="text-zinc-800">{{ stg.percentage }}%</strong>
            </div>
          </div>
        </div>
      </BaseCard>
    </div>

    <!-- Modals -->
    <FinanceDetailModal
      :is-open="isAdDetailModalOpen"
      :record="selectedAdRecord"
      @close="isAdDetailModalOpen = false"
      @refresh="loadAllReportData"
    />

    <DocumentDetailDrawer
      :is-open="isDocDrawerOpen"
      :document-id="selectedDocId"
      @close="isDocDrawerOpen = false"
      @refresh="loadAllReportData"
    />
  </div>
</template>

<style scoped>
@media print {
  /* Print styling for clean management presentation */
  body {
    background: white !important;
    color: black !important;
  }
}
</style>
