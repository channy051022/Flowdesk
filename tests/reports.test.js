import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateAdAmount,
  calculatePrReminderDueDate,
  getPrReminderStatus,
  getProcurementCompleteness,
  filterRecordsByPeriod,
  normalizeAdStatus,
  computeAdStatusSummary,
  computeProcurementMetrics,
  computePrComplianceMetrics,
  enrichActivityDesigns,
  computeCitizenCharterMetrics,
  escapeCsvField
} from '../src/services/reportService.js'

test('Report Service - calculateAdAmount with centavo arithmetic', () => {
  // Empty budget entries fallback to manual amount
  assert.equal(calculateAdAmount([], 15000), 15000)
  assert.equal(calculateAdAmount(null, 25000.5), 25000.5)
  assert.equal(calculateAdAmount([], 'invalid'), 0)

  // Budget entries override manual amount and prevent float precision loss
  const entries = [
    { name: 'Meals & Snacks', amount: 100.10 },
    { name: 'Materials', amount: 200.20 },
    { name: 'Honorarium', amount: 300.30 }
  ]
  // 100.10 + 200.20 + 300.30 in IEEE 754 floats is 600.6000000000001
  // Centavo arithmetic yields exactly 600.6
  assert.equal(calculateAdAmount(entries, 99999), 600.60)

  // Zero / negative entries ignored
  const entriesWithZero = [
    { name: 'Valid', amount: 500 },
    { name: 'Zero', amount: 0 },
    { name: 'Negative', amount: -50 }
  ]
  assert.equal(calculateAdAmount(entriesWithZero, 0), 500)
})

test('Report Service - 40 calendar day PR reminder calculation and status', () => {
  // 1. Due date calculation (exactly 40 calendar days)
  const baseDate = '2026-01-01T08:00:00.000Z'
  const expectedDueDate = '2026-02-10'
  assert.equal(calculatePrReminderDueDate(baseDate), expectedDueDate)

  // 2. PR Recorded state (overrides any due/overdue calculation)
  const recorded = getPrReminderStatus(baseDate, 'PR-2026-001')
  assert.equal(recorded.status, 'recorded')
  assert.equal(recorded.isOutstanding, false)
  assert.equal(recorded.isOverdue, false)

  // Whitespace-only PR is considered missing
  const whitespacePr = getPrReminderStatus(baseDate, '   ')
  assert.notEqual(whitespacePr.status, 'recorded')

  // 3. Overdue calculation (past 40 days without PR)
  const pastDate = '2020-01-01T00:00:00.000Z'
  const overdueStatus = getPrReminderStatus(pastDate, null)
  assert.equal(overdueStatus.status, 'overdue')
  assert.equal(overdueStatus.isOverdue, true)
  assert.equal(overdueStatus.isOutstanding, true)

  // 4. Unknown when createdAt is missing
  const unknownStatus = getPrReminderStatus(null, null)
  assert.equal(unknownStatus.status, 'unknown')
})

test('Report Service - Procurement Completeness (PPMP, PR, PO)', () => {
  // All complete
  const completeRec = {
    ppmpNumber: 'PPMP-2026-101',
    prNumber: 'PR-2026-202',
    poNumber: 'PO-2026-303'
  }
  const res1 = getProcurementCompleteness(completeRec)
  assert.equal(res1.isComplete, true)
  assert.equal(res1.isMissingAny, false)
  assert.equal(res1.missingCount, 0)
  assert.equal(res1.hasPpmp, true)
  assert.equal(res1.hasPr, true)
  assert.equal(res1.hasPo, true)

  // Missing PR only
  const missingPrRec = {
    ppmpNumber: 'PPMP-2026-101',
    prNumber: '   ',
    poNumber: 'PO-2026-303'
  }
  const res2 = getProcurementCompleteness(missingPrRec)
  assert.equal(res2.isComplete, false)
  assert.equal(res2.isMissingAny, true)
  assert.equal(res2.hasPr, false)
  assert.equal(res2.missingCount, 1)
  assert.deepEqual(res2.missingList, ['PR'])

  // Missing both PR and PO
  const missingBothRec = {
    ppmpNumber: 'PPMP-2026-101',
    prNumber: null,
    poNumber: ''
  }
  const res3 = getProcurementCompleteness(missingBothRec)
  assert.equal(res3.missingBothPrAndPo, true)
  assert.equal(res3.missingCount, 2)
  assert.deepEqual(res3.missingList, ['PR', 'PO'])
})

test('Report Service - AD Status Summary and Normalization', () => {
  const records = [
    { adStatus: 'Pending' },
    { adStatus: 'Pending AD' }, // legacy string
    { adStatus: 'For Approval' },
    { adStatus: 'Approved' },
    { adStatus: 'Approved' },
    { adStatus: 'Returned' }
  ]

  const summary = computeAdStatusSummary(records)
  assert.equal(summary.total, 6)
  assert.equal(summary.counts.Pending, 2)
  assert.equal(summary.counts['For Approval'], 1)
  assert.equal(summary.counts.Approved, 2)
  assert.equal(summary.counts.Returned, 1)

  // Percentages reconcile accurately
  const approvedItem = summary.breakdown.find(b => b.status === 'Approved')
  assert.equal(approvedItem.count, 2)
  assert.equal(approvedItem.percentage, 33) // 2/6 = 33%
})

test('Report Service - Citizen Charter 3.0-Day Turnaround Standard', () => {
  const movements = [
    // 2 days (compliant)
    { dispatchDate: '2026-03-01T08:00:00Z', receiptDate: '2026-03-03T08:00:00Z', status: 'received' },
    // Exactly 3 days (compliant)
    { dispatchDate: '2026-03-01T08:00:00Z', receiptDate: '2026-03-04T08:00:00Z', status: 'received' },
    // 5 days (non-compliant)
    { dispatchDate: '2026-03-01T08:00:00Z', receiptDate: '2026-03-06T08:00:00Z', status: 'received' },
    // Cancelled movement (must be excluded)
    { dispatchDate: '2026-03-01T08:00:00Z', receiptDate: '2026-03-02T08:00:00Z', status: 'cancelled' },
    // In-transit movement without receiptDate (excluded from completed calculation)
    { dispatchDate: '2026-03-01T08:00:00Z', receiptDate: null, status: 'in_transit' }
  ]

  const metrics = computeCitizenCharterMetrics(movements)
  assert.equal(metrics.totalCompletedMoves, 3)
  assert.equal(metrics.compliantCount, 2)
  assert.equal(metrics.nonCompliantCount, 1)
  assert.equal(metrics.charterComplianceRate, 67) // 2 / 3 = 67%
})

test('Report Service - CSV Escaping and Formula-Injection Protection', () => {
  // Normal string
  assert.equal(escapeCsvField('Regular Text'), '"Regular Text"')

  // String with commas and quotes
  assert.equal(escapeCsvField('Hello, "World"'), '"Hello, ""World"""')

  // Formula injection attempts must be prepended with a single quote
  assert.equal(escapeCsvField('=SUM(A1:A10)'), '"\'=SUM(A1:A10)"')
  assert.equal(escapeCsvField('+cmd|calc'), '"\'+cmd|calc"')
  assert.equal(escapeCsvField('-100+20'), '"\'-100+20"')
  assert.equal(escapeCsvField('@lookup'), '"\'@lookup"')
})

test('Report Service - enrichActivityDesigns prevents join duplication', () => {
  const financeRecords = [
    {
      id: 101,
      activityDesign: 'Annual Youth Congress 2026',
      adAmount: 0,
      adStatus: 'Approved',
      paymentStatus: 'Paid',
      ppmpNumber: 'PPMP-001',
      prNumber: 'PR-001',
      poNumber: 'PO-001',
      supplierName: 'ABC Catering',
      createdAt: '2026-01-10T00:00:00Z'
    }
  ]

  // Multiple budget entries for 1 finance record
  const budgetEntries = [
    { financeRecordId: 101, name: 'Food', amount: 30000, supplier: 'ABC Catering' },
    { financeRecordId: 101, name: 'Venue', amount: 20000, supplier: 'City Hall' }
  ]

  const documents = [
    {
      id: 1,
      trackingNumber: 'FD-2026-000101',
      relatedFinanceRecordId: 101,
      currentOfficeId: 10,
      workflowFolderId: 5,
      status: 'received',
      isArchived: false
    }
  ]

  const offices = [
    { id: 10, name: 'Budget & Management Division', code: 'BMD' }
  ]

  const workflowFolders = [
    { id: 5, name: 'For Signature', behavior: 'internal' }
  ]

  const enriched = enrichActivityDesigns({
    financeRecords,
    budgetEntries,
    documents,
    offices,
    workflowFolders
  })

  assert.equal(enriched.length, 1) // Exactly 1 canonical record
  const item = enriched[0]
  assert.equal(item.id, 101)
  assert.equal(item.adAmountCalculated, 50000) // 30,000 + 20,000
  assert.equal(item.budgetEntriesCount, 2)
  assert.equal(item.completeness.isComplete, true)
  assert.equal(item.prReminder.status, 'recorded')
  assert.equal(item.currentOfficeName, 'Budget & Management Division')
  assert.equal(item.workflowStageName, 'For Signature')
  assert.equal(item.documentTrackingNumber, 'FD-2026-000101')
  assert.equal(item.suppliersList.length, 2)
})
