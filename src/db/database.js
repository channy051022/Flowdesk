import Dexie from 'dexie'

export const dexieDb = new Dexie('FlowDeskDB')

// Schema definition for FlowDesk local-first storage (Dexie Browser Mode)
// Version 1: Initial schema for physical documents, tasks, and basic logs
dexieDb.version(1).stores({
  documents: '++id, trackingNumber, title, documentType, originOffice, destinationOffice, status, urgency, dateReceived, deadline, physicalLocation, createdAt, updatedAt',
  tasks: '++id, title, category, priority, status, dueDate, relatedDocumentId, isCompleted, createdAt, completedAt',
  routingLogs: '++id, documentId, action, fromOffice, toOffice, timestamp',
  offices: '++id, name, code, contactPerson, location, isFavorite',
  activities: '++id, type, description, timestamp'
})

// Version 2: Added Finance Internal Control Monitoring table and enhanced activity logging
dexieDb.version(2).stores({
  financeRecords: '++id, supplierName, paymentStatus, ppmpNumber, prNumber, poNumber, adStatus, chargedTo, adAmount, eventDate, internalArrangement, columnK, isSample, syncStatus, createdAt, updatedAt',
  activities: '++id, type, description, entityType, entityId, timestamp'
})

// Version 3: Enhanced My Tasks schema with startDate, syncStatus, isSample, and timestamps
dexieDb.version(3).stores({
  tasks: '++id, title, category, priority, status, dueDate, startDate, isCompleted, syncStatus, isSample, createdAt, updatedAt, completedAt'
})

// Version 4: Document Tracker module with movements, offices, and syncQueue
dexieDb.version(4).stores({
  documents: '++id, trackingNumber, title, documentType, referenceNumber, originatingOfficeId, currentOfficeId, lastConfirmedOfficeId, status, priority, dueDate, relatedFinanceRecordId, isArchived, syncStatus, isSample, createdAt, updatedAt, archivedAt',
  movements: '++id, documentId, fromOfficeId, toOfficeId, dispatchDate, receiptDate, status, syncStatus, createdAt, updatedAt',
  offices: '++id, name, code, type, contactPerson, location, room, extension, email, isFavorite, createdAt, updatedAt',
  syncQueue: '++id, entityType, entityId, operation, status, createdAt'
})

// Version 5: Workflow Board routing folders & workflowFolderId index on documents
dexieDb.version(5).stores({
  documents: '++id, trackingNumber, title, documentType, referenceNumber, originatingOfficeId, currentOfficeId, lastConfirmedOfficeId, workflowFolderId, status, priority, dueDate, relatedFinanceRecordId, isArchived, syncStatus, isSample, createdAt, updatedAt, archivedAt',
  workflowFolders: '++id, name, behavior, associatedOfficeId, sortOrder, isDefaultRegistration, isCompletedFolder, isArchived, createdAt, updatedAt'
})

// Version 6: Activity Design renaming and repeatable Budget Utilization entries
dexieDb.version(6).stores({
  financeRecords: '++id, supplierName, paymentStatus, ppmpNumber, prNumber, poNumber, adStatus, chargedTo, adAmount, eventDate, internalArrangement, activityDesign, columnK, isSample, syncStatus, createdAt, updatedAt',
  budgetUtilizations: '++id, financeRecordId, name, amount, createdAt, updatedAt'
}).upgrade(tx => {
  return tx.financeRecords.toCollection().modify(record => {
    if (!record.activityDesign && record.columnK) {
      record.activityDesign = record.columnK
    }
  })
})

// Version 7: Charged To multi-select and financeRecordCharges table
dexieDb.version(7).stores({
  financeRecords: '++id, supplierName, paymentStatus, ppmpNumber, prNumber, poNumber, adStatus, *chargedTo, adAmount, eventDate, internalArrangement, activityDesign, columnK, isSample, syncStatus, createdAt, updatedAt',
  financeRecordCharges: '++id, financeRecordId, chargeName, chargeCategory, createdAt',
  budgetUtilizations: '++id, financeRecordId, name, amount, createdAt, updatedAt'
}).upgrade(async tx => {
  const records = await tx.table('financeRecords').toArray()
  for (const record of records) {
    let charges = []
    if (typeof record.chargedTo === 'string') {
      const trimmed = record.chargedTo.trim()
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          charges = JSON.parse(trimmed)
        } catch {
          charges = trimmed ? [trimmed] : []
        }
      } else if (trimmed) {
        charges = [trimmed]
      }
    } else if (Array.isArray(record.chargedTo)) {
      charges = record.chargedTo
    }

    await tx.table('financeRecords').update(record.id, {
      chargedTo: charges
    })

    for (const ch of charges) {
      if (typeof ch === 'string' && ch.trim()) {
        const cat = ch.startsWith('MOOE-') ? 'MOOE' : (ch.startsWith('LFP-') ? 'LFP' : 'Custom')
        await tx.table('financeRecordCharges').add({
          financeRecordId: record.id,
          chargeName: ch.trim(),
          chargeCategory: cat,
          createdAt: record.createdAt || new Date().toISOString()
        })
      }
    }
  }
})

// Version 8: Added status column to budgetUtilizations table (Paid / Unpaid)
dexieDb.version(8).stores({
  financeRecords: '++id, supplierName, paymentStatus, ppmpNumber, prNumber, poNumber, adStatus, *chargedTo, adAmount, eventDate, internalArrangement, activityDesign, columnK, isSample, syncStatus, createdAt, updatedAt',
  financeRecordCharges: '++id, financeRecordId, chargeName, chargeCategory, createdAt',
  budgetUtilizations: '++id, financeRecordId, name, amount, status, createdAt, updatedAt'
}).upgrade(async tx => {
  return tx.table('budgetUtilizations').toCollection().modify(item => {
    if (!item.status) {
      item.status = 'Unpaid'
    }
  })
})

// Version 9: Added relatedFinanceRecordId to tasks table for Activity Design PR reminders
dexieDb.version(9).stores({
  financeRecords: '++id, supplierName, paymentStatus, ppmpNumber, prNumber, poNumber, adStatus, *chargedTo, adAmount, eventDate, internalArrangement, activityDesign, columnK, isSample, syncStatus, createdAt, updatedAt',
  financeRecordCharges: '++id, financeRecordId, chargeName, chargeCategory, createdAt',
  budgetUtilizations: '++id, financeRecordId, name, amount, status, createdAt, updatedAt',
  tasks: '++id, title, category, priority, status, dueDate, startDate, isCompleted, relatedDocumentId, relatedFinanceRecordId, syncStatus, isSample, createdAt, updatedAt, completedAt'
})

// Version 10: Added supplier column to budgetUtilizations table (Optional per-entry supplier)
dexieDb.version(10).stores({
  financeRecords: '++id, supplierName, paymentStatus, ppmpNumber, prNumber, poNumber, adStatus, *chargedTo, adAmount, eventDate, internalArrangement, activityDesign, columnK, isSample, syncStatus, createdAt, updatedAt',
  financeRecordCharges: '++id, financeRecordId, chargeName, chargeCategory, createdAt',
  budgetUtilizations: '++id, financeRecordId, name, amount, supplier, status, createdAt, updatedAt',
  tasks: '++id, title, category, priority, status, dueDate, startDate, isCompleted, relatedDocumentId, relatedFinanceRecordId, syncStatus, isSample, createdAt, updatedAt, completedAt'
}).upgrade(async tx => {
  return tx.table('budgetUtilizations').toCollection().modify(item => {
    if (item.supplier === undefined) {
      item.supplier = ''
    }
  })
})

// Version 11: Attachments table for documents, tasks, and finance Activity Designs
dexieDb.version(11).stores({
  attachments: '++id, entityType, entityId, fileName, fileSize, fileType, relativePath, notes, createdAt'
})

// Version 12: Extended document tracking relationships and dynamic fields
dexieDb.version(12).stores({
  documents: '++id, trackingNumber, title, documentType, referenceNumber, originatingOfficeId, currentOfficeId, lastConfirmedOfficeId, workflowFolderId, status, priority, dueDate, relatedFinanceRecordId, relatedPrDocumentId, relatedPpmpDocumentId, relatedBudgetUtilizationId, isArchived, syncStatus, isSample, createdAt, updatedAt, archivedAt'
})

export const FOLDER_BEHAVIORS = [
  { value: 'internal', label: 'Internal Workflow Stage' },
  { value: 'destination', label: 'Physical Routing Destination' }
]

// Standard document tracker constants
export const DOCUMENT_TYPES = [
  'Activity Design',
  'PPMP',
  'Purchase Request',
  'Purchase Order',
  'Payroll / Honorarium',
  'Disbursement Voucher',
  'Memo',
  'Letter',
  'Report',
  'Endorsement',
  'Special Order',
  'Transmittal',
  'Circular',
  'Other'
]

export const DOCUMENT_STATUSES = [
  { value: 'registered', label: 'Registered' },
  { value: 'for_dispatch', label: 'For Dispatch' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'received', label: 'Received by Office' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'for_approval', label: 'For Signature/Approval' },
  { value: 'returned_for_revision', label: 'Returned for Revision' },
  { value: 'completed', label: 'Completed/Released' },
  { value: 'archived', label: 'Archived' }
]

export const DOCUMENT_PRIORITIES = [
  'Routine',
  'Low',
  'Medium',
  'High',
  'Urgent'
]

export const MOVEMENT_STATUSES = [
  { value: 'in_transit', label: 'In Transit' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'corrected', label: 'Corrected' }
]

/**
 * Determine if running in the Electron desktop environment
 */
export function isElectronEnv() {
  return typeof window !== 'undefined' && Boolean(window.flowdeskAPI?.isDesktop)
}

/**
 * Create a transparent SQLite table adapter for Electron mode
 * that strictly adheres to the Dexie table interface used by FlowDesk services.
 */
function createSqliteTableProxy(tableName) {
  return {
    async toArray() {
      return await window.flowdeskAPI.db.getAll(tableName)
    },
    async get(id) {
      if (id === null || id === undefined) return undefined
      return await window.flowdeskAPI.db.getById(tableName, Number(id))
    },
    async add(data) {
      return await window.flowdeskAPI.db.insert(tableName, data)
    },
    async update(id, changes) {
      return await window.flowdeskAPI.db.update(tableName, Number(id), changes)
    },
    async delete(id) {
      return await window.flowdeskAPI.db.delete(tableName, Number(id))
    },
    async count() {
      return await window.flowdeskAPI.db.count(tableName)
    },
    async bulkAdd(items) {
      return await window.flowdeskAPI.db.bulkInsert(tableName, items)
    },
    where(fieldOrCriteria) {
      if (typeof fieldOrCriteria === 'string') {
        const field = fieldOrCriteria
        return {
          equals: (val) => ({
            async toArray() {
              const all = await window.flowdeskAPI.db.getAll(tableName)
              return all.filter((item) => {
                const itemVal = item[field]
                if (typeof itemVal === 'boolean') {
                  return itemVal === Boolean(val)
                }
                return itemVal == val
              })
            },
            async first() {
              const list = await this.toArray()
              return list[0] || undefined
            },
            async delete() {
              return await window.flowdeskAPI.db.deleteWhere(tableName, { [field]: val })
            }
          })
        }
      }

      // Object criteria: e.g. { documentId: 1, status: 'in_transit' }
      const criteria = fieldOrCriteria || {}
      return {
        async toArray() {
          const all = await window.flowdeskAPI.db.getAll(tableName)
          return all.filter((item) => {
            for (const [k, v] of Object.entries(criteria)) {
              const itemVal = item[k]
              if (typeof itemVal === 'boolean') {
                if (itemVal !== Boolean(v)) return false
              } else if (itemVal != v) {
                return false
              }
            }
            return true
          })
        },
        async first() {
          const list = await this.toArray()
          return list[0] || undefined
        },
        async delete() {
          return await window.flowdeskAPI.db.deleteWhere(tableName, criteria)
        }
      }
    },
    filter(predicate) {
      return {
        async toArray() {
          const all = await window.flowdeskAPI.db.getAll(tableName)
          return all.filter(predicate)
        },
        async first() {
          const all = await window.flowdeskAPI.db.getAll(tableName)
          return all.find(predicate) || undefined
        },
        async count() {
          const all = await window.flowdeskAPI.db.getAll(tableName)
          return all.filter(predicate).length
        }
      }
    }
  }
}

// Cache of SQLite table proxy instances
const sqliteTableProxies = {}
function getSqliteTable(tableName) {
  if (!sqliteTableProxies[tableName]) {
    sqliteTableProxies[tableName] = createSqliteTableProxy(tableName)
  }
  return sqliteTableProxies[tableName]
}

let migrationAttempted = false

/**
 * Automatically migrate existing records from Dexie IndexedDB to SQLite
 * if launching in Electron for the first time and SQLite is empty.
 */
async function autoMigrateIfEmpty() {
  if (migrationAttempted || !isElectronEnv()) return
  migrationAttempted = true

  try {
    const docCount = await window.flowdeskAPI.db.count('documents')
    const taskCount = await window.flowdeskAPI.db.count('tasks')
    if (docCount > 0 || taskCount > 0) {
      return // SQLite already has records, no migration needed
    }

    const dexieDocCount = await dexieDb.documents.count()
    const dexieTaskCount = await dexieDb.tasks.count()
    if (dexieDocCount > 0 || dexieTaskCount > 0) {
      console.log('[FlowDesk] Found existing IndexedDB data. Performing safe migration to SQLite...')
      const exportData = {
        offices: await dexieDb.offices.toArray(),
        workflowFolders: await dexieDb.workflowFolders.toArray(),
        documents: await dexieDb.documents.toArray(),
        movements: await dexieDb.movements.toArray(),
        tasks: await dexieDb.tasks.toArray(),
        financeRecords: await dexieDb.financeRecords.toArray(),
        financeRecordCharges: await dexieDb.financeRecordCharges.toArray(),
        budgetUtilizations: await dexieDb.budgetUtilizations.toArray(),
        activities: await dexieDb.activities.toArray()
      }
      const res = await window.flowdeskAPI.db.migrateFromDexie(exportData)
      console.log('[FlowDesk] Safe migration to SQLite completed successfully:', res)
    }
  } catch (err) {
    console.warn('[FlowDesk] Notice during Dexie-to-SQLite migration check:', err)
  }
}

// Trigger initial migration check when running in Electron
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', autoMigrateIfEmpty)
  } else {
    autoMigrateIfEmpty()
  }
}

/**
 * Universal database proxy:
 * - In Desktop Electron: Routes to SQLite via secure IPC
 * - In Web Browser: Routes to Dexie.js (IndexedDB)
 */
export const db = new Proxy({}, {
  get(target, prop) {
    if (isElectronEnv()) {
      if (prop === 'transaction') {
        return async (mode, tables, callback) => {
          const fn = typeof tables === 'function' ? tables : callback
          return await fn()
        }
      }
      if (prop === 'isDesktop') return true
      if (prop === 'storageType') return 'sqlite'
      return getSqliteTable(prop)
    }

    // Browser environment
    if (prop === 'isDesktop') return false
    if (prop === 'storageType') return 'indexeddb'
    return dexieDb[prop]
  }
})

export default db
