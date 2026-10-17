import db from '../db/database'
import { syncDocumentForAd } from './documentService'
import { syncPrReminderTaskForAd } from './taskService'
import {
  MOOE_OPTIONS,
  LFP_OPTIONS,
  ALL_CHARGED_TO_OPTIONS,
  CHARGED_TO_GROUPS,
  normalizeChargedTo,
  getChargeCategory
} from '../constants/chargedToOptions'

export {
  MOOE_OPTIONS,
  LFP_OPTIONS,
  ALL_CHARGED_TO_OPTIONS,
  CHARGED_TO_GROUPS,
  normalizeChargedTo,
  getChargeCategory
}

/**
 * Standard configuration options for dropdowns and filters.
 * Kept configurable to adapt easily as business rules evolve.
 */
export const PAYMENT_STATUS_OPTIONS = [
  'Pending Payment',
  'Under Processing',
  'Obligated',
  'Paid',
  'Cancelled',
  'Disapproved'
]

export const AD_STATUS_OPTIONS = [
  'Pending',
  'For Approval',
  'Approved',
  'Returned'
]

// Backwards-compatible flat array of charged to options
export const CHARGED_TO_OPTIONS = ALL_CHARGED_TO_OPTIONS.map((o) => o.value)

export const INTERNAL_ARRANGEMENT_OPTIONS = [
  'Not specified',
  'Yes',
  'No'
]

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
 * Calculate actual Amount of AD as the exact sum of Budget Utilization amounts.
 * Uses integer centavos arithmetic to prevent floating-point rounding errors.
 */
export function calculateAdAmount(budgetEntries = []) {
  if (!Array.isArray(budgetEntries) || budgetEntries.length === 0) return 0
  const totalCentavos = budgetEntries.reduce((acc, entry) => {
    const val = Number(entry.amount) || 0
    if (val > 0) {
      return acc + Math.round(val * 100)
    }
    return acc
  }, 0)
  return totalCentavos / 100
}

/**
 * Fetch all Budget Utilization entries for a given Finance Record
 */
export async function getBudgetUtilizationsForRecord(financeRecordId) {
  try {
    const numId = Number(financeRecordId)
    if (!numId) return []
    const entries = await db.budgetUtilizations.where('financeRecordId').equals(numId).toArray()
    return (entries || []).map((e) => ({
      ...e,
      supplier: e.supplier || '',
      status: e.status || 'Unpaid'
    }))
  } catch (err) {
    console.warn('Failed to fetch budget utilizations for record #' + financeRecordId, err)
    return []
  }
}

/**
 * Update the status of a specific Budget Utilization entry (e.g. 'Paid' or 'Unpaid')
 */
export async function updateBudgetUtilizationStatus(budgetId, status) {
  try {
    const numId = Number(budgetId)
    const validStatus = status === 'Paid' ? 'Paid' : 'Unpaid'
    const now = new Date().toISOString()

    await db.budgetUtilizations.update(numId, {
      status: validStatus,
      updatedAt: now
    })

    try {
      const budgetItem = await db.budgetUtilizations.get(numId)
      if (budgetItem) {
        await logActivity({
          type: 'finance_budget_status_updated',
          entityType: 'finance_record',
          entityId: budgetItem.financeRecordId,
          description: `Budget item "${budgetItem.name}" marked as ${validStatus}`
        })
      }
    } catch (logErr) {
      console.warn('Notice logging budget status update:', logErr)
    }

    return { id: numId, status: validStatus }
  } catch (error) {
    console.error('Failed to update budget utilization status:', error)
    throw error
  }
}

/**
 * Fetch all normalized charge names for a given Finance Record
 */
export async function getChargesForRecord(financeRecordId) {
  try {
    const numId = Number(financeRecordId)
    if (!numId) return []
    try {
      const entries = await db.financeRecordCharges.where('financeRecordId').equals(numId).toArray()
      if (entries && entries.length > 0) {
        return entries.map((e) => e.chargeName)
      }
    } catch {}
    const parent = await db.financeRecords.get(numId)
    return normalizeChargedTo(parent?.chargedTo)
  } catch (err) {
    console.warn('Failed to fetch charges for record #' + financeRecordId, err)
    return []
  }
}

/**
 * Fetch all finance records applying search query and filters
 */
export async function getFinanceRecords(filterCriteria = {}) {
  try {
    let collection = await db.financeRecords.toArray()

    // Normalize records before filtering
    for (const item of collection) {
      if (!item.activityDesign && item.columnK) {
        item.activityDesign = item.columnK
      }
      item.chargedTo = normalizeChargedTo(item.chargedTo)
    }

    // 1. Keyword search (Activity Design, Supplier name, PR, PO, PPMP, Charged To, Column K)
    if (filterCriteria.search && filterCriteria.search.trim()) {
      const q = filterCriteria.search.trim().toLowerCase()
      collection = collection.filter((item) => {
        const itemCharges = item.chargedTo || []
        const chargedToMatch = itemCharges.some((c) => c.toLowerCase().includes(q))
        return (
          (item.activityDesign && item.activityDesign.toLowerCase().includes(q)) ||
          (item.columnK && item.columnK.toLowerCase().includes(q)) ||
          (item.supplierName && item.supplierName.toLowerCase().includes(q)) ||
          (item.ppmpNumber && item.ppmpNumber.toLowerCase().includes(q)) ||
          (item.prNumber && item.prNumber.toLowerCase().includes(q)) ||
          (item.poNumber && item.poNumber.toLowerCase().includes(q)) ||
          chargedToMatch
        )
      })
    }

    // 2. Filter by Payment Status
    if (filterCriteria.paymentStatus && filterCriteria.paymentStatus !== 'all') {
      collection = collection.filter((item) => item.paymentStatus === filterCriteria.paymentStatus)
    }

    // 3. Filter by AD Status
    if (filterCriteria.adStatus && filterCriteria.adStatus !== 'all') {
      collection = collection.filter((item) => item.adStatus === filterCriteria.adStatus)
    }

    // 4. Filter by Charged To (supports individual option, group 'MOOE', or group 'LFP')
    if (filterCriteria.chargedTo && filterCriteria.chargedTo !== 'all') {
      const target = filterCriteria.chargedTo
      collection = collection.filter((item) => {
        const list = item.chargedTo || []
        if (target === 'MOOE') {
          return list.some((c) => c.startsWith('MOOE-'))
        }
        if (target === 'LFP') {
          return list.some((c) => c.startsWith('LFP-'))
        }
        return list.includes(target)
      })
    }

    // 5. Filter by Internal Arrangement
    if (filterCriteria.internalArrangement && filterCriteria.internalArrangement !== 'all') {
      collection = collection.filter((item) => item.internalArrangement === filterCriteria.internalArrangement)
    }

    // 6. Filter by Date range
    if (filterCriteria.startDate) {
      collection = collection.filter((item) => item.eventDate && item.eventDate >= filterCriteria.startDate)
    }
    if (filterCriteria.endDate) {
      collection = collection.filter((item) => item.eventDate && item.eventDate <= filterCriteria.endDate)
    }

    // Default sort by updatedAt descending
    collection.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))

    // Attach budget utilization breakdown items to each record
    try {
      const allBudgets = await db.budgetUtilizations.toArray()
      const budgetsByRecord = {}
      for (const b of allBudgets) {
        const recId = b.financeRecordId
        if (!budgetsByRecord[recId]) {
          budgetsByRecord[recId] = []
        }
        budgetsByRecord[recId].push({
          ...b,
          supplier: b.supplier || '',
          status: b.status || 'Unpaid'
        })
      }
      for (const item of collection) {
        item.budgetEntries = budgetsByRecord[item.id] || []
      }
    } catch (budgetErr) {
      console.warn('Could not load budget utilizations for records list:', budgetErr)
      for (const item of collection) {
        item.budgetEntries = []
      }
    }

    return collection
  } catch (error) {
    console.error('Failed to get finance records from storage:', error)
    throw error
  }
}

/**
 * Fetch a single finance record by ID with normalized activityDesign and chargedTo
 */
export async function getFinanceRecordById(id) {
  const record = await db.financeRecords.get(Number(id))
  if (record) {
    if (!record.activityDesign && record.columnK) {
      record.activityDesign = record.columnK
    }
    record.chargedTo = normalizeChargedTo(record.chargedTo)
  }
  return record
}

/**
 * Fetch finance record along with its itemized budget utilizations
 */
export async function getFinanceRecordWithBudget(id) {
  const numId = Number(id)
  const record = await getFinanceRecordById(numId)
  if (!record) return null
  const budgetUtilizations = await getBudgetUtilizationsForRecord(numId)
  return {
    ...record,
    budgetUtilizations
  }
}

/**
 * Create a new finance record with multi-chargedTo, flexible Amount of AD,
 * budget utilization entries, and audit logging
 */
export async function createFinanceRecord(recordData, budgetEntries = []) {
  try {
    const now = new Date().toISOString()
    const activityDesignText = recordData.activityDesign?.trim() || recordData.columnK?.trim() || ''
    const cleanCharges = normalizeChargedTo(recordData.chargedTo)

    // Calculate actual Amount of AD:
    // If budget entries exist (> 0), their sum is the source of truth.
    // If no budget entries exist (=== 0), persist user's manually entered amount.
    let computedAmount = 0
    if (Array.isArray(budgetEntries) && budgetEntries.length > 0) {
      computedAmount = calculateAdAmount(budgetEntries)
    } else {
      const manualVal = Number(recordData.adAmount) || 0
      computedAmount = Math.max(0, Math.round(manualVal * 100) / 100)
    }

    const cleanData = {
      supplierName: (recordData.supplierName || '').trim(),
      paymentStatus: recordData.paymentStatus || 'Pending Payment',
      ppmpNumber: (recordData.ppmpNumber || '').trim(),
      prNumber: (recordData.prNumber || '').trim(),
      poNumber: (recordData.poNumber || '').trim(),
      adStatus: recordData.adStatus || 'Pending',
      chargedTo: cleanCharges,
      adAmount: computedAmount,
      eventDate: recordData.eventDate || '',
      internalArrangement: recordData.internalArrangement || 'Not specified',
      activityDesign: activityDesignText,
      columnK: activityDesignText, // Maintain legacy field compatibility
      isSample: Boolean(recordData.isSample),
      syncStatus: 'local',
      createdAt: now,
      updatedAt: now
    }

    const newId = await db.financeRecords.add(cleanData)

    // Save associated Charges in normalized table safely
    if (cleanCharges.length > 0) {
      try {
        for (const ch of cleanCharges) {
          await db.financeRecordCharges.add({
            financeRecordId: newId,
            chargeName: ch,
            chargeCategory: getChargeCategory(ch),
            createdAt: now
          })
        }
      } catch (err) {
        console.warn('Notice saving financeRecordCharges:', err)
      }
    }

    // Save associated Budget Utilization entries safely
    if (Array.isArray(budgetEntries) && budgetEntries.length > 0) {
      for (const entry of budgetEntries) {
        if (entry.name && entry.name.trim()) {
          try {
            await db.budgetUtilizations.add({
              financeRecordId: newId,
              name: entry.name.trim(),
              amount: Number(entry.amount) || 0,
              supplier: (entry.supplier || '').trim(),
              status: entry.status === 'Paid' ? 'Paid' : 'Unpaid',
              createdAt: now,
              updatedAt: now
            })
          } catch (budgetErr) {
            console.warn('Notice saving budget utilization:', budgetErr)
          }
        }
      }
    }

    // Log to activities table safely
    try {
      await logActivity({
        type: 'finance_created',
        entityType: 'finance_record',
        entityId: newId,
        description: `Logged finance record for "${cleanData.activityDesign || cleanData.supplierName || 'Entry #' + newId}" (${formatCurrency(cleanData.adAmount)})`
      })
    } catch {}

    // Automatically synchronize Activity Design to Document Tracker, Workflow Board, and My Tasks
    try {
      const savedRecord = await db.financeRecords.get(newId)
      if (savedRecord) {
        try { await syncDocumentForAd(savedRecord) } catch (docErr) { console.warn('Notice syncing document for AD:', docErr) }
        try { await syncPrReminderTaskForAd(savedRecord) } catch (taskErr) { console.warn('Notice syncing task for AD:', taskErr) }
      }
    } catch (syncErr) {
      console.warn('Notice syncing AD to connected modules on creation:', syncErr)
    }

    return newId
  } catch (error) {
    console.error('Error creating finance record:', error)
    throw error
  }
}

/**
 * Update an existing finance record, its charges, and its budget utilization entries
 */
export async function updateFinanceRecord(id, recordData, budgetEntries = null) {
  try {
    const numId = Number(id)
    const existing = await db.financeRecords.get(numId)
    if (!existing) throw new Error(`Finance record #${id} not found`)

    const now = new Date().toISOString()
    const activityDesignText = recordData.activityDesign !== undefined
      ? (recordData.activityDesign?.trim() || '')
      : (recordData.columnK?.trim() || existing.activityDesign || existing.columnK || '')

    // Determine actual Amount of AD:
    let computedAmount = existing.adAmount || 0
    if (Array.isArray(budgetEntries)) {
      if (budgetEntries.length > 0) {
        computedAmount = calculateAdAmount(budgetEntries)
      } else {
        const manualVal = recordData.adAmount !== undefined
          ? (Number(recordData.adAmount) || 0)
          : (existing.adAmount || 0)
        computedAmount = Math.max(0, Math.round(manualVal * 100) / 100)
      }
    } else if (recordData.adAmount !== undefined) {
      const manualVal = Number(recordData.adAmount) || 0
      computedAmount = Math.max(0, Math.round(manualVal * 100) / 100)
    }

    const cleanCharges = recordData.chargedTo !== undefined
      ? normalizeChargedTo(recordData.chargedTo)
      : normalizeChargedTo(existing.chargedTo)

    const updatedFields = {
      supplierName: recordData.supplierName !== undefined ? (recordData.supplierName?.trim() || '') : (existing.supplierName || ''),
      paymentStatus: recordData.paymentStatus || existing.paymentStatus || 'Pending Payment',
      ppmpNumber: recordData.ppmpNumber !== undefined ? (recordData.ppmpNumber?.trim() || '') : (existing.ppmpNumber || ''),
      prNumber: recordData.prNumber !== undefined ? (recordData.prNumber?.trim() || '') : (existing.prNumber || ''),
      poNumber: recordData.poNumber !== undefined ? (recordData.poNumber?.trim() || '') : (existing.poNumber || ''),
      adStatus: recordData.adStatus || existing.adStatus || 'Pending',
      chargedTo: cleanCharges,
      adAmount: computedAmount,
      eventDate: recordData.eventDate !== undefined ? recordData.eventDate || '' : existing.eventDate,
      internalArrangement: recordData.internalArrangement || existing.internalArrangement || 'Not specified',
      activityDesign: activityDesignText,
      columnK: activityDesignText, // Maintain legacy field compatibility
      isSample: existing.isSample && recordData.isSample !== false,
      syncStatus: 'local',
      updatedAt: now
    }

    await db.financeRecords.update(numId, updatedFields)

    // Synchronize associated Charges in normalized table
    if (recordData.chargedTo !== undefined) {
      try {
        await db.financeRecordCharges.where('financeRecordId').equals(numId).delete()
        for (const ch of cleanCharges) {
          await db.financeRecordCharges.add({
            financeRecordId: numId,
            chargeName: ch,
            chargeCategory: getChargeCategory(ch),
            createdAt: now
          })
        }
      } catch (err) {
        console.warn('Notice updating financeRecordCharges:', err)
      }
    }

    // Update associated Budget Utilization entries if explicitly provided
    if (Array.isArray(budgetEntries)) {
      await db.budgetUtilizations.where('financeRecordId').equals(numId).delete()
      for (const entry of budgetEntries) {
        if (entry.name && entry.name.trim()) {
          await db.budgetUtilizations.add({
            financeRecordId: numId,
            name: entry.name.trim(),
            amount: Number(entry.amount) || 0,
            supplier: (entry.supplier || '').trim(),
            status: entry.status === 'Paid' ? 'Paid' : 'Unpaid',
            createdAt: entry.createdAt || now,
            updatedAt: now
          })
        }
      }
    }

    // Log to activities table
    await logActivity({
      type: 'finance_updated',
      entityType: 'finance_record',
      entityId: numId,
      description: `Updated finance record for "${updatedFields.activityDesign || updatedFields.supplierName || 'Entry #' + numId}" (${formatCurrency(updatedFields.adAmount)})`
    })

    // Synchronize changes to connected Document Tracker and My Tasks
    try {
      const fullRecord = await db.financeRecords.get(numId)
      if (fullRecord) {
        await syncDocumentForAd(fullRecord)
        await syncPrReminderTaskForAd(fullRecord)
      }
    } catch (syncErr) {
      console.warn('Notice syncing AD updates to connected modules:', syncErr)
    }

    return numId
  } catch (error) {
    console.error(`Error updating finance record #${id}:`, error)
    throw error
  }
}

/**
 * Delete a finance record, its charges, and its budget entries
 */
export async function deleteFinanceRecord(id) {
  try {
    const numId = Number(id)
    const existing = await db.financeRecords.get(numId)
    if (!existing) return false

    // Cascade delete child budget entries and charges
    try {
      await db.budgetUtilizations.where('financeRecordId').equals(numId).delete()
    } catch {}
    try {
      await db.financeRecordCharges.where('financeRecordId').equals(numId).delete()
    } catch {}

    // Safely handle connected task and document
    try {
      const linkedTask = await db.tasks
        .filter((t) => Number(t.relatedFinanceRecordId) === numId)
        .first()
      if (linkedTask) {
        await db.tasks.delete(linkedTask.id)
      }
    } catch (taskDelErr) {
      console.warn('Notice removing linked task on finance record deletion:', taskDelErr)
    }

    try {
      const linkedDoc = await db.documents
        .filter((d) => Number(d.relatedFinanceRecordId) === numId)
        .first()
      if (linkedDoc) {
        const moves = await db.movements
          .where('documentId')
          .equals(linkedDoc.id)
          .toArray()
        // If it only has initial registration movement, clean up cleanly
        if (moves.length <= 1) {
          await db.movements.where('documentId').equals(linkedDoc.id).delete()
          await db.documents.delete(linkedDoc.id)
        } else {
          // Keep document routing history intact, disassociate finance record
          await db.documents.update(linkedDoc.id, {
            relatedFinanceRecordId: null,
            updatedAt: new Date().toISOString()
          })
        }
      }
    } catch (docDelErr) {
      console.warn('Notice handling linked document on finance record deletion:', docDelErr)
    }

    await db.financeRecords.delete(numId)

    // Log deletion to activities table
    await logActivity({
      type: 'finance_deleted',
      entityType: 'finance_record',
      entityId: numId,
      description: `Deleted finance record for "${existing.activityDesign || existing.columnK || existing.supplierName || 'Entry #' + numId}"`
    })

    return true
  } catch (error) {
    console.error(`Error deleting finance record #${id}:`, error)
    throw error
  }
}

/**
 * Synchronize all existing Activity Designs across My Tasks, Document Tracker, and Workflow Board
 */
export async function syncAllActivityDesigns() {
  try {
    const records = await db.financeRecords.toArray()
    for (const record of records) {
      await syncDocumentForAd(record)
      await syncPrReminderTaskForAd(record)
    }
    return records.length
  } catch (err) {
    console.error('Error in syncAllActivityDesigns:', err)
    return 0
  }
}

/**
 * Log activity for finance actions
 */
async function logActivity({ type, description, entityType, entityId }) {
  try {
    await db.activities.add({
      type,
      description,
      entityType,
      entityId,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.warn('Failed to record finance audit activity:', err)
  }
}

/**
 * Generate finance summary metrics for dashboard widgets and reports
 */
export async function getFinanceSummaryMetrics() {
  try {
    const allRecords = await db.financeRecords.toArray()
    const todayStr = new Date().toISOString().split('T')[0]

    let totalAmount = 0
    let pendingPaymentCount = 0
    let pendingPaymentAmount = 0
    let completedPaymentCount = 0
    let awaitingAdCount = 0
    let upcomingEventsCount = 0

    const upcomingEvents = []

    for (const record of allRecords) {
      const amount = Number(record.adAmount) || 0
      totalAmount += amount

      // Payment status analysis
      if (record.paymentStatus === 'Pending Payment' || record.paymentStatus === 'Under Processing') {
        pendingPaymentCount++
        pendingPaymentAmount += amount
      } else if (record.paymentStatus === 'Paid') {
        completedPaymentCount++
      }

      // AD Status analysis
      if (record.adStatus === 'Pending AD' || record.adStatus === 'AD Under Review' || record.adStatus === 'For Compliance') {
        awaitingAdCount++
      }

      // Upcoming dates
      if (record.eventDate && record.eventDate >= todayStr) {
        upcomingEventsCount++
        upcomingEvents.push(record)
      }
    }

    // Sort upcoming events by nearest date
    upcomingEvents.sort((a, b) => a.eventDate.localeCompare(b.eventDate))

    // Sort recent records by update timestamp descending
    const recentRecords = [...allRecords]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 5)

    return {
      totalRecords: allRecords.length,
      totalAmount,
      pendingPaymentCount,
      pendingPaymentAmount,
      completedPaymentCount,
      awaitingAdCount,
      upcomingEventsCount,
      upcomingEvents: upcomingEvents.slice(0, 4),
      recentRecords
    }
  } catch (error) {
    console.error('Error calculating finance summary metrics:', error)
    return {
      totalRecords: 0,
      totalAmount: 0,
      pendingPaymentCount: 0,
      pendingPaymentAmount: 0,
      completedPaymentCount: 0,
      awaitingAdCount: 0,
      upcomingEventsCount: 0,
      upcomingEvents: [],
      recentRecords: []
    }
  }
}

/**
 * Seed initial sample records for demo testing, clearly labeled
 */
export async function seedSampleFinanceRecords() {
  try {
    await clearSampleRecords()
  } catch {}
}

/**
 * Clear all demo sample records (marked with isSample = true)
 */
export async function clearSampleRecords() {
  try {
    const samples = await db.financeRecords.filter((r) => Boolean(r.isSample)).toArray()
    for (const rec of samples) {
      await deleteFinanceRecord(rec.id)
    }
    return samples.length
  } catch (error) {
    console.error('Error clearing sample records:', error)
    throw error
  }
}
