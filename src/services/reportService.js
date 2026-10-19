/**
 * FlowDesk Report Service
 * Pure calculation functions, data enrichment, and audit analytics for the Reports Module.
 * Fully compatible with both Browser (Dexie.js) and Electron (SQLite) environments.
 */

/**
 * Format numeric value as Philippine currency format (₱ 0,000.00)
 */
export const formatCurrency = (val) => {
  const num = Number(val)
  if (isNaN(num)) return '₱0.00'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num).replace('PHP', '₱')
}

/**
 * Format standard ISO or YYYY-MM-DD date string
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Calculate actual Amount of AD.
 * If budget utilization entries exist, the amount is the exact sum of entries
 * using integer centavos arithmetic to prevent floating-point rounding errors.
 * If no budget entries exist, fallback to manualAdAmount.
 */
export function calculateAdAmount(budgetEntries = [], manualAdAmount = 0) {
  if (Array.isArray(budgetEntries) && budgetEntries.length > 0) {
    const totalCentavos = budgetEntries.reduce((acc, entry) => {
      const val = Number(entry?.amount) || 0
      if (val > 0) {
        return acc + Math.round(val * 100)
      }
      return acc
    }, 0)
    return totalCentavos / 100
  }
  const fallback = Number(manualAdAmount)
  return isNaN(fallback) || fallback < 0 ? 0 : fallback
}

/**
 * Calculate 40-calendar-day PR creation reminder due date from AD creation timestamp.
 */
export function calculatePrReminderDueDate(createdAt) {
  if (!createdAt) return ''
  const date = new Date(createdAt)
  if (isNaN(date.getTime())) return ''
  const due = new Date(date)
  due.setDate(due.getDate() + 40)
  return due.toISOString().split('T')[0]
}

/**
 * Determine statutory PR reminder compliance status from creation timestamp and PR Number.
 * 40 calendar days standard from AD creation date.
 */
export function getPrReminderStatus(createdAt, prNumber) {
  const trimmedPr = prNumber ? String(prNumber).trim() : ''
  const dueDateStr = calculatePrReminderDueDate(createdAt)

  if (trimmedPr) {
    return {
      status: 'recorded',
      label: 'PR Recorded',
      badgeVariant: 'success',
      isOutstanding: false,
      isDue: false,
      isOverdue: false,
      daysRemaining: null,
      dueDateStr
    }
  }

  if (!createdAt || !dueDateStr) {
    return {
      status: 'unknown',
      label: 'Unknown',
      badgeVariant: 'routine',
      isOutstanding: false,
      isDue: false,
      isOverdue: false,
      daysRemaining: null,
      dueDateStr: ''
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const todayDate = new Date(todayStr + 'T00:00:00')
  const targetDate = new Date(dueDateStr + 'T00:00:00')
  const diffTime = targetDate.getTime() - todayDate.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return {
      status: 'overdue',
      label: 'PR Overdue',
      badgeVariant: 'urgent',
      isOutstanding: true,
      isDue: false,
      isOverdue: true,
      daysRemaining: diffDays,
      dueDateStr
    }
  } else if (diffDays === 0) {
    return {
      status: 'due_today',
      label: 'PR Due Today',
      badgeVariant: 'warning',
      isOutstanding: true,
      isDue: true,
      isOverdue: false,
      daysRemaining: 0,
      dueDateStr
    }
  } else {
    return {
      status: 'upcoming',
      label: `PR Due in ${diffDays}d`,
      badgeVariant: 'info',
      isOutstanding: false,
      isDue: false,
      isOverdue: false,
      daysRemaining: diffDays,
      dueDateStr
    }
  }
}

/**
 * Check procurement reference completeness (PPMP, PR, PO numbers).
 * A reference is recorded when non-null and non-empty after trimming whitespace.
 */
export function getProcurementCompleteness(record = {}) {
  const ppmp = record.ppmpNumber ? String(record.ppmpNumber).trim() : ''
  const pr = record.prNumber ? String(record.prNumber).trim() : ''
  const po = record.poNumber ? String(record.poNumber).trim() : ''

  const hasPpmp = Boolean(ppmp)
  const hasPr = Boolean(pr)
  const hasPo = Boolean(po)

  const isComplete = hasPpmp && hasPr && hasPo
  const isMissingAny = !hasPpmp || !hasPr || !hasPo
  const missingBothPrAndPo = !hasPr && !hasPo

  const missingList = []
  if (!hasPpmp) missingList.push('PPMP')
  if (!hasPr) missingList.push('PR')
  if (!hasPo) missingList.push('PO')

  return {
    ppmpValue: ppmp,
    prValue: pr,
    poValue: po,
    hasPpmp,
    hasPr,
    hasPo,
    isComplete,
    isMissingAny,
    missingBothPrAndPo,
    missingCount: missingList.length,
    missingList
  }
}

/**
 * Filter records by date period.
 * Supports: 'all', 'month', '30days', 'year', 'custom'
 * Includes end-of-day boundary for custom date range to prevent off-by-one exclusions.
 */
export function filterRecordsByPeriod(records = [], dateField = 'createdAt', period = 'all', customStart = null, customEnd = null) {
  if (!Array.isArray(records)) return []
  if (period === 'all') return records

  const now = new Date()
  let startMs = 0
  let endMs = Infinity

  if (period === 'month') {
    startMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  } else if (period === '30days') {
    startMs = Date.now() - 30 * 86400000
  } else if (period === 'year') {
    startMs = new Date(now.getFullYear(), 0, 1).getTime()
  } else if (period === 'custom') {
    if (customStart) {
      const s = new Date(customStart + 'T00:00:00')
      if (!isNaN(s.getTime())) startMs = s.getTime()
    }
    if (customEnd) {
      const e = new Date(customEnd + 'T23:59:59.999')
      if (!isNaN(e.getTime())) endMs = e.getTime()
    }
  }

  return records.filter((item) => {
    const rawVal = item[dateField] || item.createdAt || item.dateRegistered || item.dispatchDate || item.timestamp
    if (!rawVal) return true
    const time = new Date(rawVal).getTime()
    if (isNaN(time)) return true
    return time >= startMs && time <= endMs
  })
}

/**
 * Normalize and categorize AD status into canonical groups.
 * Handles legacy and edge case statuses cleanly.
 */
export function normalizeAdStatus(rawStatus) {
  if (!rawStatus) return 'Pending'
  const s = String(rawStatus).trim()
  if (s === 'Pending AD' || s === 'AD Under Review' || s === 'For Compliance' || s === 'Pending') {
    return 'Pending'
  }
  if (s === 'For Approval' || s === 'For Signature' || s === 'Under Approval') {
    return 'For Approval'
  }
  if (s === 'Approved' || s === 'Completed') {
    return 'Approved'
  }
  if (s === 'Returned' || s === 'Disapproved' || s === 'Rejected' || s === 'Returned for Revision') {
    return 'Returned'
  }
  return s
}

/**
 * Compute AD Status Summary distribution and percentages.
 */
export function computeAdStatusSummary(adRecords = []) {
  const total = adRecords.length
  const counts = {
    Pending: 0,
    'For Approval': 0,
    Approved: 0,
    Returned: 0,
    Other: 0
  }

  for (const r of adRecords) {
    const norm = normalizeAdStatus(r.adStatus)
    if (counts[norm] !== undefined) {
      counts[norm]++
    } else {
      counts.Other++
    }
  }

  const result = [
    {
      status: 'Pending',
      label: 'Pending Review',
      count: counts.Pending,
      percentage: total > 0 ? Math.round((counts.Pending / total) * 100) : 0,
      badgeVariant: 'warning'
    },
    {
      status: 'For Approval',
      label: 'For Approval / Signature',
      count: counts['For Approval'],
      percentage: total > 0 ? Math.round((counts['For Approval'] / total) * 100) : 0,
      badgeVariant: 'info'
    },
    {
      status: 'Approved',
      label: 'Approved & Finalized',
      count: counts.Approved,
      percentage: total > 0 ? Math.round((counts.Approved / total) * 100) : 0,
      badgeVariant: 'success'
    },
    {
      status: 'Returned',
      label: 'Returned for Revision',
      count: counts.Returned,
      percentage: total > 0 ? Math.round((counts.Returned / total) * 100) : 0,
      badgeVariant: 'urgent'
    }
  ]

  if (counts.Other > 0) {
    result.push({
      status: 'Other',
      label: 'Other Statuses',
      count: counts.Other,
      percentage: total > 0 ? Math.round((counts.Other / total) * 100) : 0,
      badgeVariant: 'routine'
    })
  }

  return {
    total,
    breakdown: result,
    counts
  }
}

/**
 * Compute procurement reference completeness metrics across all ADs.
 */
export function computeProcurementMetrics(adRecords = []) {
  const total = adRecords.length
  let withPpmp = 0
  let withPr = 0
  let withPo = 0
  let allComplete = 0
  let missingAny = 0
  let missingBothPrAndPo = 0

  for (const r of adRecords) {
    const comp = getProcurementCompleteness(r)
    if (comp.hasPpmp) withPpmp++
    if (comp.hasPr) withPr++
    if (comp.hasPo) withPo++
    if (comp.isComplete) allComplete++
    if (comp.isMissingAny) missingAny++
    if (comp.missingBothPrAndPo) missingBothPrAndPo++
  }

  return {
    total,
    withPpmp,
    missingPpmp: total - withPpmp,
    withPr,
    missingPr: total - withPr,
    withPo,
    missingPo: total - withPo,
    allComplete,
    missingAny,
    missingBothPrAndPo,
    allCompleteRate: total > 0 ? Math.round((allComplete / total) * 100) : 0,
    prRecordedRate: total > 0 ? Math.round((withPr / total) * 100) : 0
  }
}

/**
 * Compute PR compliance summary across all ADs (using 40-day rule).
 */
export function computePrComplianceMetrics(adRecords = []) {
  const total = adRecords.length
  let recorded = 0
  let upcoming = 0
  let dueToday = 0
  let overdue = 0
  let unknown = 0

  for (const r of adRecords) {
    const comp = getPrReminderStatus(r.createdAt, r.prNumber)
    if (comp.status === 'recorded') recorded++
    else if (comp.status === 'upcoming') upcoming++
    else if (comp.status === 'due_today') dueToday++
    else if (comp.status === 'overdue') overdue++
    else unknown++
  }

  return {
    total,
    recorded,
    upcoming,
    dueToday,
    overdue,
    unknown,
    complianceRate: total > 0 ? Math.round((recorded / total) * 100) : 0
  }
}

/**
 * Enrich canonical Activity Designs with budget entries, procurement completeness,
 * PR compliance, linked documents, physical office custody, and workflow stages.
 */
export function enrichActivityDesigns({
  financeRecords = [],
  budgetEntries = [],
  documents = [],
  offices = [],
  workflowFolders = []
}) {
  const officeMap = new Map((offices || []).map((o) => [o.id, o]))
  const folderMap = new Map((workflowFolders || []).map((f) => [f.id, f]))

  // Index budget entries by financeRecordId
  const budgetsByRecord = new Map()
  for (const b of budgetEntries || []) {
    const recId = Number(b.financeRecordId)
    if (!recId) continue
    if (!budgetsByRecord.has(recId)) {
      budgetsByRecord.set(recId, [])
    }
    budgetsByRecord.get(recId).push(b)
  }

  // Index active documents by relatedFinanceRecordId
  const docByRecord = new Map()
  for (const d of documents || []) {
    if (d.relatedFinanceRecordId && !d.isArchived && d.status !== 'archived') {
      docByRecord.set(Number(d.relatedFinanceRecordId), d)
    }
  }

  return financeRecords.map((r) => {
    const budgets = budgetsByRecord.get(r.id) || []
    const doc = docByRecord.get(r.id) || null
    const computedAmount = calculateAdAmount(budgets, r.adAmount)
    const completeness = getProcurementCompleteness(r)
    const prReminder = getPrReminderStatus(r.createdAt, r.prNumber)

    // Collect distinct suppliers
    const supplierSet = new Set()
    if (r.supplierName && r.supplierName.trim()) {
      supplierSet.add(r.supplierName.trim())
    }
    for (const b of budgets) {
      if (b.supplier && b.supplier.trim()) {
        supplierSet.add(b.supplier.trim())
      }
    }
    const suppliersList = Array.from(supplierSet)
    const primarySupplier = suppliersList.length > 0 ? suppliersList.join(', ') : 'Unspecified'

    // Format Charged To
    let chargedToList = []
    if (Array.isArray(r.chargedTo)) {
      chargedToList = r.chargedTo
    } else if (typeof r.chargedTo === 'string' && r.chargedTo.trim()) {
      try {
        const parsed = JSON.parse(r.chargedTo)
        chargedToList = Array.isArray(parsed) ? parsed : [r.chargedTo]
      } catch {
        chargedToList = [r.chargedTo]
      }
    }

    // Physical custody and workflow stage from linked document
    let currentOfficeName = 'Not Linked'
    let currentOfficeCode = ''
    let workflowStageName = 'Not Linked'
    let documentTrackingNumber = ''
    let documentStatus = ''

    if (doc) {
      const office = officeMap.get(doc.currentOfficeId)
      currentOfficeName = office ? office.name : 'Unknown Office'
      currentOfficeCode = office ? (office.code || '') : ''

      const folder = folderMap.get(doc.workflowFolderId)
      workflowStageName = folder ? folder.name : 'Unassigned Stage'

      documentTrackingNumber = doc.trackingNumber || ''
      documentStatus = doc.status || ''
    }

    return {
      ...r,
      displayRef: `AD #${r.id}`,
      title: r.activityDesign || 'Untitled Activity Design',
      adAmountCalculated: computedAmount,
      budgetEntriesCount: budgets.length,
      budgetEntriesTotal: budgets.reduce((acc, b) => acc + (Number(b.amount) || 0), 0),
      completeness,
      prReminder,
      suppliersList,
      primarySupplier,
      chargedToList,
      relatedDocument: doc,
      currentOfficeName,
      currentOfficeCode,
      workflowStageName,
      documentTrackingNumber,
      documentStatus
    }
  })
}

/**
 * Calculate Citizen's Charter Turnaround Time and Compliance from completed movements.
 * Threshold: <= 3.0 calendar days standard.
 */
export function computeCitizenCharterMetrics(movements = []) {
  const completedMoves = (movements || []).filter(
    (m) => m.dispatchDate && m.receiptDate && m.status !== 'cancelled'
  )

  let totalDays = 0
  let compliantCount = 0

  for (const m of completedMoves) {
    const start = new Date(m.dispatchDate).getTime()
    const end = new Date(m.receiptDate).getTime()
    const diffDays = Math.max(0.1, (end - start) / (1000 * 60 * 60 * 24))
    totalDays += diffDays
    if (diffDays <= 3.0) {
      compliantCount++
    }
  }

  const avgTurnaroundDays = completedMoves.length > 0
    ? (totalDays / completedMoves.length).toFixed(1)
    : '0.0'

  const charterComplianceRate = completedMoves.length > 0
    ? Math.round((compliantCount / completedMoves.length) * 100)
    : 100

  return {
    totalCompletedMoves: completedMoves.length,
    compliantCount,
    nonCompliantCount: completedMoves.length - compliantCount,
    avgTurnaroundDays,
    charterComplianceRate
  }
}

/**
 * Escape CSV fields with formula-injection protection and standard CSV quoting.
 * Protects against spreadsheet execution vulnerabilities (=, +, -, @, \t, \r).
 */
export function escapeCsvField(val) {
  if (val === null || val === undefined) return '""'
  let str = String(val)

  // Prevent spreadsheet formula injection by prefixing with a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`
  }

  // Escape double quotes and enclose if necessary
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return `"${str}"`
}
