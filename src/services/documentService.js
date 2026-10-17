import db, {
  DOCUMENT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_PRIORITIES,
  MOVEMENT_STATUSES
} from '../db/database'
import { getOffices, getOfficeById, seedDefaultOfficesIfEmpty } from './officeService'

/**
 * Generate human-readable tracking number: FD-YYYY-XXXXXX
 * Guarantees uniqueness by inspecting existing database tracking numbers.
 */
export async function generateTrackingNumber() {
  try {
    const year = new Date().getFullYear()
    const prefix = `FD-${year}-`
    const allDocs = await db.documents.toArray()
    const matching = allDocs.filter((d) => d.trackingNumber && d.trackingNumber.startsWith(prefix))

    let maxSeq = 0
    for (const doc of matching) {
      const seqPart = doc.trackingNumber.replace(prefix, '')
      const num = parseInt(seqPart, 10)
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num
      }
    }

    const nextSeq = maxSeq + 1
    return `${prefix}${String(nextSeq).padStart(6, '0')}`
  } catch (err) {
    console.error('Error generating tracking number:', err)
    const randomSuffix = Math.floor(100000 + Math.random() * 900000)
    return `FD-${new Date().getFullYear()}-${randomSuffix}`
  }
}

/**
 * Audit logging helper for Document Tracker events
 */
export async function logDocumentActivity({ type, entityId, description }) {
  try {
    await db.activities.add({
      type,
      entityType: 'document',
      entityId: Number(entityId),
      description,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.error('Failed to log document activity:', err)
  }
}

/**
 * Format standard date
 */
export const formatDocDate = (dateStr) => {
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
 * Format standard date and time
 */
export const formatDocDateTime = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Check if document is overdue
 */
export const isDocumentOverdue = (doc) => {
  if (!doc.dueDate) return false
  if (doc.status === 'completed' || doc.status === 'archived' || doc.isArchived) return false
  const today = new Date().toISOString().split('T')[0]
  return doc.dueDate < today
}

/**
 * Fetch documents applying filters and search criteria.
 * Populates office names for display.
 */
export async function getDocuments(criteria = {}) {
  try {
    await seedDefaultOfficesIfEmpty()
    const offices = await db.offices.toArray()
    const officeMap = new Map(offices.map((o) => [o.id, o]))

    let docs = await db.documents.toArray()

    // 1. Quick Filters
    if (criteria.quickFilter) {
      if (criteria.quickFilter === 'my_office') {
        // Filter by user's office (defaults to BFMD or criteria.userOfficeId)
        const myOfficeId = criteria.userOfficeId || 3 // Default BFMD is ID 3
        docs = docs.filter(
          (d) =>
            !d.isArchived &&
            (d.currentOfficeId === myOfficeId || d.originatingOfficeId === myOfficeId)
        )
      } else if (criteria.quickFilter === 'in_transit') {
        docs = docs.filter((d) => !d.isArchived && d.status === 'in_transit')
      } else if (criteria.quickFilter === 'pending_action') {
        docs = docs.filter(
          (d) =>
            !d.isArchived &&
            ['under_review', 'for_approval', 'returned_for_revision', 'for_dispatch', 'registered'].includes(
              d.status
            )
        )
      } else if (criteria.quickFilter === 'completed') {
        docs = docs.filter((d) => !d.isArchived && d.status === 'completed')
      } else if (criteria.quickFilter === 'archived') {
        docs = docs.filter((d) => d.isArchived || d.status === 'archived')
      } else {
        // 'all' excludes archived unless explicitly requested
        docs = docs.filter((d) => !d.isArchived && d.status !== 'archived')
      }
    } else {
      // Default: exclude archived
      docs = docs.filter((d) => !d.isArchived && d.status !== 'archived')
    }

    // 2. Status Filter
    if (criteria.status && criteria.status !== 'all') {
      docs = docs.filter((d) => d.status === criteria.status)
    }

    // 3. Office Filter (Current Office)
    if (criteria.officeId && criteria.officeId !== 'all') {
      const officeNum = Number(criteria.officeId)
      docs = docs.filter((d) => d.currentOfficeId === officeNum)
    }

    // 4. Document Type Filter
    if (criteria.documentType && criteria.documentType !== 'all') {
      docs = docs.filter((d) => d.documentType === criteria.documentType)
    }

    // 5. Date Filter (registered after or on)
    if (criteria.dateFrom) {
      docs = docs.filter((d) => d.dateRegistered && d.dateRegistered >= criteria.dateFrom)
    }
    if (criteria.dateTo) {
      docs = docs.filter((d) => d.dateRegistered && d.dateRegistered <= criteria.dateTo)
    }

    // 6. Workflow Folder Filter
    if (criteria.workflowFolderId && criteria.workflowFolderId !== 'all') {
      const folderNum = Number(criteria.workflowFolderId)
      docs = docs.filter((d) => d.workflowFolderId === folderNum)
    }

    // Fetch active movements for in-transit destination lookup
    const inTransitMovements = await db.movements
      .where('status')
      .equals('in_transit')
      .toArray()
    const activeMovementMap = new Map(inTransitMovements.map((m) => [m.documentId, m]))

    // Fetch workflow folders for display
    const workflowFolders = await db.workflowFolders.toArray()
    const folderMap = new Map(workflowFolders.map((f) => [f.id, f]))

    // Fetch finance records for related AD lookup
    let financeRecords = []
    try {
      financeRecords = await db.financeRecords.toArray()
    } catch {}
    const financeMap = new Map(financeRecords.map((f) => [f.id, f]))

    // Populate office names, workflow folders, finance details, and active movement destinations
    const enrichedDocs = docs.map((doc) => {
      const origOffice = officeMap.get(doc.originatingOfficeId)
      const currOffice = officeMap.get(doc.currentOfficeId)
      const lastOffice = officeMap.get(doc.lastConfirmedOfficeId)
      const activeMovement = activeMovementMap.get(doc.id)
      const destOffice = activeMovement ? officeMap.get(activeMovement.toOfficeId) : null
      const wfFolder = doc.workflowFolderId ? folderMap.get(doc.workflowFolderId) : null
      const fin = doc.relatedFinanceRecordId ? financeMap.get(Number(doc.relatedFinanceRecordId)) : null

      return {
        ...doc,
        title: fin?.activityDesign || doc.title,
        amountOfAd: fin ? fin.adAmount : 0,
        dateOfActivity: fin ? fin.eventDate : '',
        supplierName: fin ? fin.supplierName : '',
        prNumber: fin ? fin.prNumber : '',
        poNumber: fin ? fin.poNumber : '',
        paymentStatus: fin ? fin.paymentStatus : '',
        adStatus: fin ? fin.adStatus : '',
        relatedFinanceRecord: fin || null,
        workflowFolderName: wfFolder ? wfFolder.name : 'TCYSDO OFFICE',
        workflowFolderColor: wfFolder ? wfFolder.color : 'forest',
        workflowFolder: wfFolder || null,
        originatingOfficeName: origOffice ? origOffice.name : 'Unknown Office',
        originatingOfficeCode: origOffice ? origOffice.code : '',
        currentOfficeName: currOffice ? currOffice.name : 'Unknown Office',
        currentOfficeCode: currOffice ? currOffice.code : '',
        lastConfirmedOfficeName: lastOffice ? lastOffice.name : 'Unknown Office',
        activeDestinationOfficeName: destOffice ? destOffice.name : '',
        activeDestinationOfficeCode: destOffice ? destOffice.code : '',
        activeMovement: activeMovement || null
      }
    })

    // 6. Text Search (title, trackingNumber, referenceNumber, sender, current office, destination, finance info)
    if (criteria.search && criteria.search.trim()) {
      const q = criteria.search.trim().toLowerCase()
      return enrichedDocs.filter((d) => {
        const fin = d.relatedFinanceRecord
        return (
          (d.title && d.title.toLowerCase().includes(q)) ||
          (d.trackingNumber && d.trackingNumber.toLowerCase().includes(q)) ||
          (d.referenceNumber && d.referenceNumber.toLowerCase().includes(q)) ||
          (d.description && d.description.toLowerCase().includes(q)) ||
          (d.originatingOfficeName && d.originatingOfficeName.toLowerCase().includes(q)) ||
          (d.currentOfficeName && d.currentOfficeName.toLowerCase().includes(q)) ||
          (d.activeDestinationOfficeName && d.activeDestinationOfficeName.toLowerCase().includes(q)) ||
          (fin && fin.activityDesign && fin.activityDesign.toLowerCase().includes(q)) ||
          (fin && fin.supplierName && fin.supplierName.toLowerCase().includes(q)) ||
          (fin && fin.prNumber && fin.prNumber.toLowerCase().includes(q)) ||
          (fin && fin.poNumber && fin.poNumber.toLowerCase().includes(q))
        )
      })
    }

    // Sort: In transit first, then by updatedAt descending
    enrichedDocs.sort((a, b) => {
      if (a.status === 'in_transit' && b.status !== 'in_transit') return -1
      if (a.status !== 'in_transit' && b.status === 'in_transit') return 1
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    })

    return enrichedDocs
  } catch (err) {
    console.error('Failed to get documents from Dexie:', err)
    return []
  }
}

/**
 * Fetch a single document by ID with populated office details and active movement
 */
export async function getDocumentById(id) {
  try {
    const numId = Number(id)
    const doc = await db.documents.get(numId)
    if (!doc) return null

    const [origOffice, currOffice, lastOffice, activeMovement] = await Promise.all([
      getOfficeById(doc.originatingOfficeId),
      getOfficeById(doc.currentOfficeId),
      getOfficeById(doc.lastConfirmedOfficeId),
      db.movements.where({ documentId: numId, status: 'in_transit' }).first()
    ])

    let activeDestinationOffice = null
    if (activeMovement) {
      activeDestinationOffice = await getOfficeById(activeMovement.toOfficeId)
    }

    let relatedFinanceRecord = null
    if (doc.relatedFinanceRecordId) {
      relatedFinanceRecord = await db.financeRecords.get(Number(doc.relatedFinanceRecordId))
    }

    let workflowFolder = null
    if (doc.workflowFolderId) {
      workflowFolder = await db.workflowFolders.get(Number(doc.workflowFolderId))
    }

    return {
      ...doc,
      originatingOffice: origOffice,
      currentOffice: currOffice,
      lastConfirmedOffice: lastOffice,
      workflowFolder: workflowFolder || null,
      activeMovement: activeMovement || null,
      activeDestinationOffice: activeDestinationOffice || null,
      relatedFinanceRecord: relatedFinanceRecord || null
    }
  } catch (err) {
    console.error(`Failed to get document #${id}:`, err)
    return null
  }
}

/**
 * A. Register a new document
 * Atomically creates document, initial movement record, and activity log.
 */
export async function createDocument(docData) {
  const now = new Date().toISOString()
  const trackingNumber = docData.trackingNumber || (await generateTrackingNumber())
  const originatingOfficeId = Number(docData.originatingOfficeId)
  const initialCurrentOfficeId = docData.currentOfficeId
    ? Number(docData.currentOfficeId)
    : originatingOfficeId

  // Assign initial workflow folder (default registration folder)
  let assignedFolderId = docData.workflowFolderId ? Number(docData.workflowFolderId) : null
  if (!assignedFolderId) {
    const defaultFolder = await db.workflowFolders
      .filter((f) => !f.isArchived && Boolean(f.isDefaultRegistration))
      .first()
    if (defaultFolder) {
      assignedFolderId = defaultFolder.id
    } else {
      const firstFolder = await db.workflowFolders.filter((f) => !f.isArchived).first()
      if (firstFolder) assignedFolderId = firstFolder.id
    }
  }

  const cleanDoc = {
    trackingNumber,
    title: docData.title?.trim() || 'Untitled Document',
    documentType: docData.documentType || 'Memo',
    referenceNumber: docData.referenceNumber?.trim() || '',
    description: docData.description?.trim() || '',
    dateRegistered: docData.dateRegistered || now.split('T')[0],
    dateReceived: docData.dateReceived || now.split('T')[0],
    originatingOfficeId,
    currentOfficeId: initialCurrentOfficeId,
    lastConfirmedOfficeId: initialCurrentOfficeId,
    workflowFolderId: assignedFolderId,
    status: docData.status || 'registered',
    priority: docData.priority || 'Routine',
    dueDate: docData.dueDate || '',
    relatedFinanceRecordId: docData.relatedFinanceRecordId
      ? Number(docData.relatedFinanceRecordId)
      : null,
    isArchived: false,
    syncStatus: 'local',
    isSample: Boolean(docData.isSample),
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  }

  return await db.transaction('rw', [db.documents, db.movements, db.activities], async () => {
    // 1. Create document
    const newDocId = await db.documents.add(cleanDoc)

    // 2. Create initial registration movement record
    await db.movements.add({
      documentId: newDocId,
      fromOfficeId: null,
      toOfficeId: initialCurrentOfficeId,
      dispatchDate: now,
      receiptDate: now,
      status: 'received',
      senderName: docData.registeredBy || 'Desk Officer',
      receivingPersonName: docData.receivingPersonName || 'Desk Officer',
      notes: docData.initialNotes || 'Document registered into FlowDesk',
      cancellationReason: '',
      correctionReason: '',
      syncStatus: 'local',
      createdAt: now,
      updatedAt: now
    })

    // 3. Log activity
    await db.activities.add({
      type: 'document_registered',
      entityType: 'document',
      entityId: newDocId,
      description: `Registered document: ${trackingNumber} — "${cleanDoc.title}"`,
      timestamp: now
    })

    return newDocId
  })
}

/**
 * Edit document metadata (title, type, reference number, description, priority, dueDate, related finance record).
 * Never mutates historical movements.
 */
export async function updateDocument(id, docData) {
  const numId = Number(id)
  const existing = await db.documents.get(numId)
  if (!existing) throw new Error(`Document #${id} not found`)

  const now = new Date().toISOString()
  const updatedDoc = {
    title: docData.title !== undefined ? docData.title.trim() : existing.title,
    documentType: docData.documentType !== undefined ? docData.documentType : existing.documentType,
    referenceNumber: docData.referenceNumber !== undefined ? docData.referenceNumber.trim() : existing.referenceNumber,
    description: docData.description !== undefined ? docData.description.trim() : existing.description,
    priority: docData.priority !== undefined ? docData.priority : existing.priority,
    dueDate: docData.dueDate !== undefined ? docData.dueDate : existing.dueDate,
    workflowFolderId: docData.workflowFolderId !== undefined
      ? (docData.workflowFolderId ? Number(docData.workflowFolderId) : null)
      : existing.workflowFolderId,
    relatedFinanceRecordId: docData.relatedFinanceRecordId !== undefined
      ? (docData.relatedFinanceRecordId ? Number(docData.relatedFinanceRecordId) : null)
      : existing.relatedFinanceRecordId,
    status: docData.status !== undefined ? docData.status : existing.status,
    updatedAt: now
  }

  await db.transaction('rw', [db.documents, db.activities], async () => {
    await db.documents.update(numId, updatedDoc)
    await db.activities.add({
      type: 'document_updated',
      entityType: 'document',
      entityId: numId,
      description: `Updated document details for ${existing.trackingNumber}`,
      timestamp: now
    })
  })

  return numId
}

/**
 * B. Initiate a transfer
 * - Verifies no active transfer is already in transit.
 * - Prevents transfer to same office unless confirmed.
 * - Creates movement with status 'in_transit'.
 * - Sets document status to 'in_transit'.
 * - Keeps currentOfficeId as last confirmed office until receipt is confirmed!
 */
export async function initiateTransfer(documentId, transferData) {
  const numDocId = Number(documentId)
  const doc = await db.documents.get(numDocId)
  if (!doc) throw new Error(`Document #${documentId} not found`)
  if (doc.isArchived) throw new Error('Cannot transfer an archived document.')

  // Guard: check if an active transfer is already in transit
  const existingActive = await db.movements
    .where({ documentId: numDocId, status: 'in_transit' })
    .first()
  if (existingActive) {
    throw new Error(
      'A transfer is already in transit for this document. Please confirm receipt or cancel the active transfer before initiating a new one.'
    )
  }

  const destinationOfficeId = Number(transferData.toOfficeId)
  if (!destinationOfficeId) throw new Error('Destination office is required.')

  if (destinationOfficeId === doc.currentOfficeId && !transferData.allowSameOffice) {
    throw new Error('Destination office cannot be the same as current office without explicit confirmation.')
  }

  const now = new Date().toISOString()
  const dispatchDate = transferData.dispatchDate || now

  return await db.transaction(
    'rw',
    [db.documents, db.movements, db.activities, db.syncQueue],
    async () => {
      // 1. Create in_transit movement record
      const movementId = await db.movements.add({
        documentId: numDocId,
        fromOfficeId: doc.currentOfficeId,
        toOfficeId: destinationOfficeId,
        dispatchDate,
        receiptDate: null,
        status: 'in_transit',
        senderName: transferData.senderName?.trim() || 'Dispatching Officer',
        receivingPersonName: transferData.receivingPersonName?.trim() || '',
        notes: transferData.notes?.trim() || '',
        cancellationReason: '',
        correctionReason: '',
        syncStatus: 'local',
        createdAt: now,
        updatedAt: now
      })

      // 2. Update document status to in_transit
      // Crucial: currentOfficeId remains the last confirmed office!
      await db.documents.update(numDocId, {
        status: 'in_transit',
        lastConfirmedOfficeId: doc.currentOfficeId,
        updatedAt: now
      })

      // 3. Enqueue mutation in syncQueue for future synchronization
      await db.syncQueue.add({
        entityType: 'movement',
        entityId: movementId,
        operation: 'transfer_initiated',
        status: 'pending',
        createdAt: now
      })

      // 4. Log activity
      await db.activities.add({
        type: 'transfer_initiated',
        entityType: 'document',
        entityId: numDocId,
        description: `Dispatched ${doc.trackingNumber} to office ID #${destinationOfficeId} (In Transit)`,
        timestamp: now
      })

      return movementId
    }
  )
}

/**
 * C. Confirm receipt
 * Explicit user action required to mark active movement as received.
 * Updates currentOfficeId and lastConfirmedOfficeId to receiving office.
 */
export async function confirmReceipt(documentId, receiptData = {}) {
  const numDocId = Number(documentId)
  const doc = await db.documents.get(numDocId)
  if (!doc) throw new Error(`Document #${documentId} not found`)

  const activeMovement = await db.movements
    .where({ documentId: numDocId, status: 'in_transit' })
    .first()
  if (!activeMovement) {
    throw new Error('No active in-transit movement found for this document.')
  }

  const now = new Date().toISOString()
  const receiptDate = receiptData.receiptDate || now
  const nextStatus = receiptData.nextStatus || 'received'

  return await db.transaction(
    'rw',
    [db.documents, db.movements, db.activities, db.syncQueue],
    async () => {
      // 1. Mark active movement as received
      await db.movements.update(activeMovement.id, {
        status: 'received',
        receiptDate,
        receivingPersonName: receiptData.receivingPersonName?.trim() || activeMovement.receivingPersonName || 'Receiving Officer',
        notes: receiptData.notes
          ? `${activeMovement.notes ? activeMovement.notes + ' | ' : ''}Receipt note: ${receiptData.notes.trim()}`
          : activeMovement.notes,
        updatedAt: now
      })

      // 2. Update document confirmed office and status
      await db.documents.update(numDocId, {
        currentOfficeId: activeMovement.toOfficeId,
        lastConfirmedOfficeId: activeMovement.toOfficeId,
        status: nextStatus,
        dateReceived: receiptDate.split('T')[0],
        updatedAt: now
      })

      // 3. Enqueue to syncQueue
      await db.syncQueue.add({
        entityType: 'movement',
        entityId: activeMovement.id,
        operation: 'receipt_confirmed',
        status: 'pending',
        createdAt: now
      })

      // 4. Log activity
      await db.activities.add({
        type: 'receipt_confirmed',
        entityType: 'document',
        entityId: numDocId,
        description: `Confirmed physical receipt of ${doc.trackingNumber} at office ID #${activeMovement.toOfficeId}`,
        timestamp: now
      })

      return true
    }
  )
}

/**
 * D. Cancel an erroneous transfer before receipt is confirmed
 * Preserves movement record with status 'cancelled' and reason for audit.
 * Restores document to last confirmed office.
 */
export async function cancelTransfer(documentId, cancelData) {
  const numDocId = Number(documentId)
  const doc = await db.documents.get(numDocId)
  if (!doc) throw new Error(`Document #${documentId} not found`)

  const activeMovement = await db.movements
    .where({ documentId: numDocId, status: 'in_transit' })
    .first()
  if (!activeMovement) {
    throw new Error('No active in-transit transfer found to cancel.')
  }

  const reason = cancelData.cancellationReason?.trim()
  if (!reason) {
    throw new Error('A cancellation reason is required for audit history.')
  }

  const now = new Date().toISOString()

  return await db.transaction(
    'rw',
    [db.documents, db.movements, db.activities, db.syncQueue],
    async () => {
      // 1. Mark movement as cancelled (Never delete)
      await db.movements.update(activeMovement.id, {
        status: 'cancelled',
        cancellationReason: reason,
        updatedAt: now
      })

      // 2. Restore document to last confirmed office & status
      await db.documents.update(numDocId, {
        status: 'received',
        currentOfficeId: doc.lastConfirmedOfficeId,
        updatedAt: now
      })

      // 3. Log activity
      await db.activities.add({
        type: 'transfer_cancelled',
        entityType: 'document',
        entityId: numDocId,
        description: `Cancelled transfer of ${doc.trackingNumber}. Reason: ${reason}`,
        timestamp: now
      })

      return true
    }
  )
}

/**
 * Correct an already confirmed transfer without rewriting history.
 * Records who corrected it, when, and why.
 */
export async function correctMovement(movementId, correctionData) {
  const numMoveId = Number(movementId)
  const movement = await db.movements.get(numMoveId)
  if (!movement) throw new Error(`Movement record #${movementId} not found`)

  const reason = correctionData.correctionReason?.trim()
  if (!reason) throw new Error('A correction reason is required.')

  const correctedBy = correctionData.correctedBy?.trim() || 'Auditing Officer'
  const now = new Date().toISOString()

  return await db.transaction(
    'rw',
    [db.documents, db.movements, db.activities],
    async () => {
      // 1. Mark movement as corrected
      await db.movements.update(numMoveId, {
        status: 'corrected',
        correctionReason: reason,
        correctedBy,
        updatedAt: now
      })

      // 2. If corrected destination office is specified, update document
      if (correctionData.correctedOfficeId) {
        const newOfficeId = Number(correctionData.correctedOfficeId)
        await db.documents.update(movement.documentId, {
          currentOfficeId: newOfficeId,
          lastConfirmedOfficeId: newOfficeId,
          updatedAt: now
        })
      }

      // 3. Log activity
      await db.activities.add({
        type: 'transfer_corrected',
        entityType: 'document',
        entityId: movement.documentId,
        description: `Movement #${numMoveId} corrected by ${correctedBy}. Reason: ${reason}`,
        timestamp: now
      })

      return true
    }
  )
}

/**
 * Update document status directly (e.g. Under Review, For Signature, Returned for Revision, Completed)
 */
export async function updateDocumentStatus(documentId, status) {
  const numId = Number(documentId)
  const doc = await db.documents.get(numId)
  if (!doc) throw new Error(`Document #${documentId} not found`)

  const now = new Date().toISOString()
  await db.transaction('rw', [db.documents, db.activities], async () => {
    await db.documents.update(numId, {
      status,
      updatedAt: now
    })
    await db.activities.add({
      type: 'document_updated',
      entityType: 'document',
      entityId: numId,
      description: `Document ${doc.trackingNumber} status changed to "${status.replace('_', ' ')}"`,
      timestamp: now
    })
  })
}

/**
 * Archive a document
 */
export async function archiveDocument(id) {
  const numId = Number(id)
  const doc = await db.documents.get(numId)
  if (!doc) return

  const now = new Date().toISOString()
  await db.transaction('rw', [db.documents, db.activities], async () => {
    await db.documents.update(numId, {
      isArchived: true,
      status: 'archived',
      archivedAt: now,
      updatedAt: now
    })
    await db.activities.add({
      type: 'document_archived',
      entityType: 'document',
      entityId: numId,
      description: `Archived document ${doc.trackingNumber}`,
      timestamp: now
    })
  })
}

/**
 * Restore an archived document
 */
export async function restoreDocument(id) {
  const numId = Number(id)
  const doc = await db.documents.get(numId)
  if (!doc) return

  const now = new Date().toISOString()
  await db.transaction('rw', [db.documents, db.activities], async () => {
    await db.documents.update(numId, {
      isArchived: false,
      status: 'received',
      archivedAt: null,
      updatedAt: now
    })
    await db.activities.add({
      type: 'document_restored',
      entityType: 'document',
      entityId: numId,
      description: `Restored archived document ${doc.trackingNumber}`,
      timestamp: now
    })
  })
}

/**
 * Delete a document and its movements
 */
export async function deleteDocument(id) {
  const numId = Number(id)
  const doc = await db.documents.get(numId)
  if (!doc) return

  await db.transaction('rw', [db.documents, db.movements, db.activities], async () => {
    await db.movements.where('documentId').equals(numId).delete()
    await db.documents.delete(numId)
    await db.activities.add({
      type: 'document_deleted',
      entityType: 'document',
      entityId: numId,
      description: `Deleted document ${doc.trackingNumber} and movement records`,
      timestamp: new Date().toISOString()
    })
  })
}

/**
 * Fetch complete chronological movement history for a document
 */
export async function getMovementsForDocument(documentId) {
  try {
    const numId = Number(documentId)
    const movements = await db.movements
      .where('documentId')
      .equals(numId)
      .toArray()

    const offices = await db.offices.toArray()
    const officeMap = new Map(offices.map((o) => [o.id, o]))

    // Sort chronological: oldest first
    movements.sort((a, b) => new Date(a.dispatchDate || a.createdAt) - new Date(b.dispatchDate || b.createdAt))

    return movements.map((m) => {
      const fromOff = m.fromOfficeId ? officeMap.get(m.fromOfficeId) : null
      const toOff = officeMap.get(m.toOfficeId)
      return {
        ...m,
        fromOfficeName: fromOff ? fromOff.name : 'Originating Registration',
        fromOfficeCode: fromOff ? fromOff.code : 'ORIGIN',
        toOfficeName: toOff ? toOff.name : 'Unknown Office',
        toOfficeCode: toOff ? toOff.code : ''
      }
    })
  } catch (err) {
    console.error('Failed to get movements for document:', err)
    return []
  }
}

/**
 * Get summary metrics for Dashboard and Document Tracker header
 */
export async function getDocumentSummaryMetrics() {
  try {
    const allDocs = await db.documents.toArray()
    const activeDocs = allDocs.filter((d) => !d.isArchived && d.status !== 'archived')

    const today = new Date().toISOString().split('T')[0]

    const inTransit = activeDocs.filter((d) => d.status === 'in_transit')
    const pendingAction = activeDocs.filter((d) =>
      ['under_review', 'for_approval', 'returned_for_revision', 'for_dispatch', 'registered'].includes(
        d.status
      )
    )
    const overdue = activeDocs.filter((d) => d.dueDate && d.dueDate < today && d.status !== 'completed')

    // Top 5 recently updated / moved documents
    const sorted = [...activeDocs].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    )

    // Populate offices for recent documents
    const offices = await db.offices.toArray()
    const officeMap = new Map(offices.map((o) => [o.id, o]))

    const recentlyMoved = sorted.slice(0, 5).map((d) => {
      const curr = officeMap.get(d.currentOfficeId)
      return {
        ...d,
        currentOfficeName: curr ? curr.name : 'Office',
        currentOfficeCode: curr ? curr.code : ''
      }
    })

    return {
      totalActive: activeDocs.length,
      inTransitCount: inTransit.length,
      pendingActionCount: pendingAction.length,
      overdueCount: overdue.length,
      recentlyMoved
    }
  } catch (err) {
    console.error('Failed to get document metrics:', err)
    return {
      totalActive: 0,
      inTransitCount: 0,
      pendingActionCount: 0,
      overdueCount: 0,
      recentlyMoved: []
    }
  }
}

/**
 * Seed realistic sample documents and movements if database is empty
 */
export async function seedSampleDocumentsIfEmpty() {
  // Sample seeding disabled per user request
  await clearSampleDocuments()
}

/**
 * Clear all sample/dummy demo documents and their movements
 */
export async function clearSampleDocuments() {
  try {
    const sampleDocs = await db.documents
      .filter((d) => d.isSample || (d.trackingNumber && d.trackingNumber.includes('-00010')))
      .toArray()
    const docIds = sampleDocs.map((d) => d.id)

    if (docIds.length === 0) return

    await db.transaction('rw', [db.documents, db.movements, db.activities], async () => {
      for (const id of docIds) {
        await db.movements.where('documentId').equals(id).delete()
        await db.documents.delete(id)
      }
      await db.activities.add({
        type: 'document_deleted',
        entityType: 'document',
        entityId: 0,
        description: `Cleared ${docIds.length} demo sample documents and their movements`,
        timestamp: new Date().toISOString()
      })
    })
  } catch (err) {
    console.error('Failed to clear sample documents:', err)
  }
}

/**
 * Automatically sync/register an Activity Design from Finance into Document Tracker.
 * Guarantees exactly one document per AD using relatedFinanceRecordId.
 * Initial location is set to TCYSDO OFFICE.
 */
export async function syncDocumentForAd(financeRecord) {
  if (!financeRecord || !financeRecord.id) return null
  const adId = Number(financeRecord.id)
  const adTitle = financeRecord.activityDesign || financeRecord.columnK || 'Activity Design'
  const adAmount = Number(financeRecord.adAmount) || 0
  const now = new Date().toISOString()

  // Ensure default office TCYSDO OFFICE exists
  await seedDefaultOfficesIfEmpty()
  const offices = await db.offices.toArray()
  let tcysdoOffice = offices.find(
    (o) => (o.name || '').trim().toUpperCase() === 'TCYSDO OFFICE'
  )
  if (!tcysdoOffice) {
    const newOffId = await db.offices.add({
      name: 'TCYSDO OFFICE',
      code: 'TCYSDO',
      type: 'Internal',
      contactPerson: 'Office Administrator',
      room: 'Main Office',
      extension: '',
      email: '',
      isFavorite: true,
      messengerNotes: 'Default primary office for document routing and Activity Designs.',
      createdAt: now,
      updatedAt: now
    })
    tcysdoOffice = await db.offices.get(newOffId)
  }

  // Ensure default workflow folder TCYSDO OFFICE exists
  const allFolders = await db.workflowFolders.toArray()
  let tcysdoFolder = allFolders.find(
    (f) => !f.isArchived && (f.name || '').trim().toUpperCase() === 'TCYSDO OFFICE'
  )
  if (!tcysdoFolder) {
    const newFId = await db.workflowFolders.add({
      name: 'TCYSDO OFFICE',
      description: 'Default office location for incoming Activity Designs and document routing slips',
      behavior: 'destination',
      associatedOfficeId: tcysdoOffice.id,
      sortOrder: 1,
      color: 'forest',
      isDefaultRegistration: true,
      isCompletedFolder: false,
      isArchived: false,
      createdAt: now,
      updatedAt: now
    })
    tcysdoFolder = await db.workflowFolders.get(newFId)
  }

  const existingDoc = await db.documents
    .filter((d) => Number(d.relatedFinanceRecordId) === adId)
    .first()

  const desc = `Supplier: ${financeRecord.supplierName || 'N/A'} | AD Amount: ₱${adAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const refNum = financeRecord.prNumber || financeRecord.poNumber || financeRecord.ppmpNumber || ''

  if (existingDoc) {
    // Preserve physical location (workflowFolderId and currentOfficeId)! Only update shared finance info
    await updateDocument(existingDoc.id, {
      title: adTitle,
      referenceNumber: refNum || existingDoc.referenceNumber,
      description: desc,
      dueDate: financeRecord.eventDate || existingDoc.dueDate,
      relatedFinanceRecordId: adId
    })
    return existingDoc.id
  } else {
    // Register new document starting at TCYSDO OFFICE
    const newDocId = await createDocument({
      title: adTitle,
      documentType: 'Activity Design',
      referenceNumber: refNum,
      description: desc,
      dateRegistered: financeRecord.createdAt ? financeRecord.createdAt.split('T')[0] : now.split('T')[0],
      originatingOfficeId: tcysdoOffice.id,
      currentOfficeId: tcysdoOffice.id,
      workflowFolderId: tcysdoFolder.id,
      status: 'registered',
      priority: 'High',
      dueDate: financeRecord.eventDate || '',
      relatedFinanceRecordId: adId,
      initialNotes: `Automatically registered from Finance Internal Control Monitoring AD #${adId}`
    })
    return newDocId
  }
}
