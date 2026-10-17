import db from '../db/database'
import { ensureDefaultOffice, getOfficeById } from './officeService'

/**
 * Default routing folder: TCYSDO OFFICE is the canonical default location.
 */
export const DEFAULT_WORKFLOW_FOLDER = {
  name: 'TCYSDO OFFICE',
  description: 'Default office location for incoming Activity Designs and document routing slips',
  behavior: 'destination',
  associatedOfficeId: null, // Linked dynamically to TCYSDO OFFICE id
  sortOrder: 1,
  color: 'forest',
  isDefaultRegistration: true,
  isCompletedFolder: false,
  isArchived: false
}

export const DUMMY_FOLDER_NAMES = [
  'New Documents',
  'For Processing',
  'For Signature/Approval',
  'For Dispatch',
  'In Transit',
  'Returned for Revision',
  'Completed / Released'
]

// Backwards compatibility export
export const DEFAULT_WORKFLOW_FOLDERS = [DEFAULT_WORKFLOW_FOLDER]

let defaultFoldersEnsured = false

/**
 * Automatically ensures TCYSDO OFFICE folder exists as the default routing folder,
 * removes dummy folders, and ensures each office has a board column.
 */
export async function seedDefaultFoldersIfEmpty() {
  try {
    const tcysdoOffice = await ensureDefaultOffice()
    const allFolders = await db.workflowFolders.toArray()

    let tcysdoFolder = allFolders.find(
      (f) => !f.isArchived && (f.name || '').trim().toUpperCase() === 'TCYSDO OFFICE'
    )

    const now = new Date().toISOString()

    if (!tcysdoFolder) {
      const newId = await db.workflowFolders.add({
        ...DEFAULT_WORKFLOW_FOLDER,
        associatedOfficeId: tcysdoOffice ? tcysdoOffice.id : null,
        createdAt: now,
        updatedAt: now
      })
      tcysdoFolder = await db.workflowFolders.get(newId)
    } else if (tcysdoOffice && (!tcysdoFolder.associatedOfficeId || !tcysdoFolder.isDefaultRegistration)) {
      await db.workflowFolders.update(tcysdoFolder.id, {
        associatedOfficeId: tcysdoOffice.id,
        isDefaultRegistration: true,
        behavior: 'destination',
        updatedAt: now
      })
      tcysdoFolder = await db.workflowFolders.get(tcysdoFolder.id)
    }

    // Clean up known dummy folders and auto-generated office folders safely
    // to ensure only 1 default routing folder (TCYSDO OFFICE) is present by default
    const foldersToRemove = allFolders.filter((f) =>
      f.id !== tcysdoFolder.id &&
      (DUMMY_FOLDER_NAMES.some((dummy) => dummy.toLowerCase() === (f.name || '').trim().toLowerCase()) ||
       (f.description && (f.description.startsWith('Routing location for ') || f.description.startsWith('Physical routing destination for '))))
    )

    if (foldersToRemove.length > 0 && tcysdoFolder) {
      for (const df of foldersToRemove) {
        // Reassign any documents in removed folder to TCYSDO OFFICE folder
        const docsInFolder = await db.documents
          .filter((d) => d.workflowFolderId === df.id)
          .toArray()
        for (const doc of docsInFolder) {
          await db.documents.update(doc.id, {
            workflowFolderId: tcysdoFolder.id,
            currentOfficeId: tcysdoOffice ? tcysdoOffice.id : doc.currentOfficeId,
            updatedAt: now
          })
        }
        await db.workflowFolders.delete(df.id)
      }
    }

    // Ensure documents without a workflowFolderId are assigned to TCYSDO OFFICE folder
    const unassignedDocs = await db.documents
      .filter((d) => !d.workflowFolderId)
      .toArray()
    if (unassignedDocs.length > 0 && tcysdoFolder) {
      for (const doc of unassignedDocs) {
        await db.documents.update(doc.id, {
          workflowFolderId: tcysdoFolder.id,
          updatedAt: now
        })
      }
    }
  } catch (err) {
    console.error('Error ensuring default workflow folders:', err)
  }
}

/**
 * Get all active workflow folders sorted by sortOrder
 */
export async function getWorkflowFolders(includeArchived = false) {
  try {
    await seedDefaultFoldersIfEmpty()
    let folders = await db.workflowFolders.toArray()

    if (!includeArchived) {
      folders = folders.filter((f) => !f.isArchived)
    }

    folders.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    return folders
  } catch (err) {
    console.error('Failed to get workflow folders from Dexie:', err)
    return []
  }
}

/**
 * Get a single workflow folder by ID
 */
export async function getWorkflowFolderById(id) {
  if (!id) return null
  return await db.workflowFolders.get(Number(id))
}

/**
 * Get the initial registration folder for new documents
 */
export async function getDefaultRegistrationFolder() {
  await seedDefaultFoldersIfEmpty()
  const def = await db.workflowFolders
    .filter((f) => !f.isArchived && Boolean(f.isDefaultRegistration))
    .first()

  if (def) return def
  const fallback = await db.workflowFolders.filter((f) => !f.isArchived).first()
  return fallback
}

/**
 * Create a new routing folder
 */
export async function createWorkflowFolder(folderData) {
  const now = new Date().toISOString()
  const name = folderData.name?.trim() || 'Untitled Folder'

  // Validate duplicate active name
  const existingSameName = await db.workflowFolders
    .filter((f) => !f.isArchived && f.name.toLowerCase() === name.toLowerCase())
    .first()
  if (existingSameName) {
    throw new Error(`A routing folder named "${name}" already exists.`)
  }

  // Get next sort order
  const allFolders = await db.workflowFolders.toArray()
  const maxOrder = allFolders.reduce((max, f) => Math.max(max, f.sortOrder || 0), 0)

  const isDefaultRegistration = Boolean(folderData.isDefaultRegistration)

  return await db.transaction('rw', [db.workflowFolders, db.activities], async () => {
    // If setting as default registration, unset on all others
    if (isDefaultRegistration) {
      const currentDefaults = await db.workflowFolders
        .filter((f) => f.isDefaultRegistration)
        .toArray()
      for (const cur of currentDefaults) {
        await db.workflowFolders.update(cur.id, { isDefaultRegistration: false })
      }
    }

    const cleanFolder = {
      name,
      description: folderData.description?.trim() || '',
      behavior: folderData.behavior || 'internal',
      associatedOfficeId: folderData.associatedOfficeId ? Number(folderData.associatedOfficeId) : null,
      sortOrder: maxOrder + 1,
      color: folderData.color || 'forest',
      isDefaultRegistration,
      isCompletedFolder: Boolean(folderData.isCompletedFolder),
      isArchived: false,
      createdAt: now,
      updatedAt: now
    }

    const newId = await db.workflowFolders.add(cleanFolder)

    await db.activities.add({
      type: 'workflow_folder_created',
      entityType: 'workflow_folder',
      entityId: newId,
      description: `Created routing folder: "${name}" (${cleanFolder.behavior})`,
      timestamp: now
    })

    return newId
  })
}

/**
 * Update an existing routing folder
 */
export async function updateWorkflowFolder(id, folderData) {
  const numId = Number(id)
  const existing = await db.workflowFolders.get(numId)
  if (!existing) throw new Error(`Folder #${id} not found`)

  const now = new Date().toISOString()
  const name = folderData.name !== undefined ? folderData.name.trim() : existing.name

  // Check name uniqueness if changed
  if (name.toLowerCase() !== existing.name.toLowerCase()) {
    const existingSameName = await db.workflowFolders
      .filter((f) => !f.isArchived && f.id !== numId && f.name.toLowerCase() === name.toLowerCase())
      .first()
    if (existingSameName) {
      throw new Error(`Another routing folder named "${name}" already exists.`)
    }
  }

  const isDefaultRegistration = folderData.isDefaultRegistration !== undefined
    ? Boolean(folderData.isDefaultRegistration)
    : existing.isDefaultRegistration

  return await db.transaction('rw', [db.workflowFolders, db.activities], async () => {
    if (isDefaultRegistration && !existing.isDefaultRegistration) {
      const currentDefaults = await db.workflowFolders
        .filter((f) => f.isDefaultRegistration && f.id !== numId)
        .toArray()
      for (const cur of currentDefaults) {
        await db.workflowFolders.update(cur.id, { isDefaultRegistration: false })
      }
    }

    const updatedFields = {
      name,
      description: folderData.description !== undefined ? folderData.description.trim() : existing.description,
      behavior: folderData.behavior !== undefined ? folderData.behavior : existing.behavior,
      associatedOfficeId: folderData.associatedOfficeId !== undefined
        ? (folderData.associatedOfficeId ? Number(folderData.associatedOfficeId) : null)
        : existing.associatedOfficeId,
      color: folderData.color !== undefined ? folderData.color : existing.color,
      isDefaultRegistration,
      isCompletedFolder: folderData.isCompletedFolder !== undefined
        ? Boolean(folderData.isCompletedFolder)
        : existing.isCompletedFolder,
      updatedAt: now
    }

    await db.workflowFolders.update(numId, updatedFields)

    await db.activities.add({
      type: 'workflow_folder_updated',
      entityType: 'workflow_folder',
      entityId: numId,
      description: `Updated routing folder: "${name}"`,
      timestamp: now
    })

    return numId
  })
}

/**
 * Reorder workflow folders
 */
export async function reorderWorkflowFolders(orderedFolderIds) {
  const now = new Date().toISOString()
  return await db.transaction('rw', [db.workflowFolders], async () => {
    for (let index = 0; index < orderedFolderIds.length; index++) {
      const folderId = Number(orderedFolderIds[index])
      await db.workflowFolders.update(folderId, {
        sortOrder: index + 1,
        updatedAt: now
      })
    }
  })
}

/**
 * Archive a workflow folder.
 * Protects default registration folder and documents inside.
 */
export async function archiveWorkflowFolder(folderId, targetFolderIdForDocs = null) {
  const numId = Number(folderId)
  const folder = await db.workflowFolders.get(numId)
  if (!folder) throw new Error(`Folder #${folderId} not found`)

  if (folder.isDefaultRegistration) {
    throw new Error(
      'Cannot archive the initial registration folder. Please designate another folder as the default registration folder first.'
    )
  }

  const docsInFolder = await db.documents
    .filter((d) => !d.isArchived && d.workflowFolderId === numId)
    .toArray()

  if (docsInFolder.length > 0) {
    if (!targetFolderIdForDocs) {
      throw new Error(
        `This folder contains ${docsInFolder.length} active document(s). Please specify a target folder to move them to before archiving.`
      )
    }
    const targetFolder = await db.workflowFolders.get(Number(targetFolderIdForDocs))
    if (!targetFolder || targetFolder.isArchived) {
      throw new Error('Target destination folder is invalid or archived.')
    }
  }

  const now = new Date().toISOString()

  return await db.transaction('rw', [db.workflowFolders, db.documents, db.activities], async () => {
    // Reassign documents if any
    if (docsInFolder.length > 0 && targetFolderIdForDocs) {
      const targetId = Number(targetFolderIdForDocs)
      for (const doc of docsInFolder) {
        await db.documents.update(doc.id, {
          workflowFolderId: targetId,
          updatedAt: now
        })
      }
    }

    // Archive folder
    await db.workflowFolders.update(numId, {
      isArchived: true,
      updatedAt: now
    })

    await db.activities.add({
      type: 'workflow_folder_archived',
      entityType: 'workflow_folder',
      entityId: numId,
      description: `Archived routing folder: "${folder.name}" (${docsInFolder.length} documents moved)`,
      timestamp: now
    })
  })
}

/**
 * Core Move Document to Folder Handler.
 * Connected directly to Dexie.
 * Handles Internal Workflow Stages vs Physical Routing Destinations.
 */
export async function moveDocumentToFolder(documentId, targetFolderId, options = {}) {
  const numDocId = Number(documentId)
  const numFolderId = Number(targetFolderId)

  const doc = await db.documents.get(numDocId)
  if (!doc) throw new Error(`Document #${documentId} not found`)
  if (doc.isArchived) throw new Error('Cannot move an archived document.')

  const targetFolder = await db.workflowFolders.get(numFolderId)
  if (!targetFolder) throw new Error(`Routing folder #${targetFolderId} not found`)
  if (targetFolder.isArchived) throw new Error('Target routing folder is archived.')

  // No-op if dropping into same folder
  if (doc.workflowFolderId === numFolderId) {
    return doc
  }

  const currentFolder = doc.workflowFolderId
    ? await db.workflowFolders.get(doc.workflowFolderId)
    : null
  const currentFolderName = currentFolder ? currentFolder.name : 'Unassigned'
  const now = new Date().toISOString()

  // Determine target physical office location
  let targetOfficeId = targetFolder.associatedOfficeId ? Number(targetFolder.associatedOfficeId) : null
  if (!targetOfficeId) {
    // Attempt lookup by folder name in offices table
    const matchingOffice = await db.offices
      .filter((o) => (o.name || '').toLowerCase() === (targetFolder.name || '').toLowerCase())
      .first()
    if (matchingOffice) {
      targetOfficeId = matchingOffice.id
    }
  }

  return await db.transaction('rw', [db.documents, db.movements, db.activities], async () => {
    let nextStatus = doc.status

    if (targetOfficeId) {
      // Physical office location update
      const previousOfficeId = doc.currentOfficeId || null

      // If there was an active in_transit movement, mark it as received
      const activeMovements = await db.movements
        .where({ documentId: numDocId, status: 'in_transit' })
        .toArray()
      for (const m of activeMovements) {
        await db.movements.update(m.id, {
          status: 'received',
          receiptDate: now,
          updatedAt: now
        })
      }

      // Record chronological routing movement
      await db.movements.add({
        documentId: numDocId,
        fromOfficeId: previousOfficeId,
        toOfficeId: targetOfficeId,
        dispatchDate: now,
        receiptDate: now,
        status: 'received',
        senderName: options.senderName || 'Workflow Officer',
        receivingPersonName: options.receivingPersonName || targetFolder.name,
        notes: options.notes || `Location updated via Workflow Board to "${targetFolder.name}"`,
        cancellationReason: '',
        correctionReason: '',
        syncStatus: 'local',
        createdAt: now,
        updatedAt: now
      })

      nextStatus = targetFolder.isCompletedFolder ? 'completed' : 'received'

      await db.documents.update(numDocId, {
        workflowFolderId: numFolderId,
        currentOfficeId: targetOfficeId,
        lastConfirmedOfficeId: targetOfficeId,
        dateReceived: now.split('T')[0],
        status: nextStatus,
        updatedAt: now
      })

      await db.activities.add({
        type: 'workflow_moved',
        entityType: 'document',
        entityId: numDocId,
        description: `Moved document ${doc.trackingNumber} to "${targetFolder.name}" (Office: #${targetOfficeId})`,
        timestamp: now
      })
    } else {
      // Internal stage without office binding
      if (targetFolder.isCompletedFolder) {
        nextStatus = 'completed'
      } else {
        const lowerName = targetFolder.name.toLowerCase()
        if (lowerName.includes('signature') || lowerName.includes('approval')) {
          nextStatus = 'for_approval'
        } else if (lowerName.includes('review') || lowerName.includes('processing')) {
          nextStatus = 'under_review'
        } else if (lowerName.includes('dispatch')) {
          nextStatus = 'for_dispatch'
        } else if (lowerName.includes('revision')) {
          nextStatus = 'returned_for_revision'
        } else if (lowerName.includes('new') || lowerName.includes('incoming')) {
          nextStatus = 'registered'
        }
      }

      await db.documents.update(numDocId, {
        workflowFolderId: numFolderId,
        status: nextStatus,
        updatedAt: now
      })

      await db.activities.add({
        type: 'workflow_moved',
        entityType: 'document',
        entityId: numDocId,
        description: `Moved document ${doc.trackingNumber} from "${currentFolderName}" to "${targetFolder.name}"`,
        timestamp: now
      })
    }

    return await db.documents.get(numDocId)
  })
}

/**
 * Fetch Board Data: active folders with grouped document cards matching search & filters.
 */
export async function getBoardData(criteria = {}) {
  try {
    await seedDefaultFoldersIfEmpty()

    // 1. Get active folders
    const folders = await getWorkflowFolders(false)

    // 2. Get active offices for lookup
    const offices = await db.offices.toArray()
    const officeMap = new Map(offices.map((o) => [o.id, o]))

    // 3. Get active in-transit movements for destination lookup
    const inTransitMovements = await db.movements
      .where('status')
      .equals('in_transit')
      .toArray()
    const activeMovementMap = new Map(inTransitMovements.map((m) => [m.documentId, m]))

    // 4. Get finance records for AD data lookup
    let financeRecords = []
    try {
      financeRecords = await db.financeRecords.toArray()
    } catch {}
    const financeMap = new Map(financeRecords.map((f) => [f.id, f]))

    // 5. Get active documents
    let docs = await db.documents.filter((d) => !d.isArchived && d.status !== 'archived').toArray()

    // Apply Filters:
    // Search
    if (criteria.search && criteria.search.trim()) {
      const q = criteria.search.trim().toLowerCase()
      docs = docs.filter((d) => {
        const orig = officeMap.get(d.originatingOfficeId)?.name || ''
        const curr = officeMap.get(d.currentOfficeId)?.name || ''
        const fin = d.relatedFinanceRecordId ? financeMap.get(d.relatedFinanceRecordId) : null
        return (
          (d.title && d.title.toLowerCase().includes(q)) ||
          (d.trackingNumber && d.trackingNumber.toLowerCase().includes(q)) ||
          (d.referenceNumber && d.referenceNumber.toLowerCase().includes(q)) ||
          (fin && fin.activityDesign && fin.activityDesign.toLowerCase().includes(q)) ||
          (fin && fin.supplierName && fin.supplierName.toLowerCase().includes(q)) ||
          orig.toLowerCase().includes(q) ||
          curr.toLowerCase().includes(q)
        )
      })
    }

    // Priority filter
    if (criteria.priority && criteria.priority !== 'all') {
      docs = docs.filter((d) => d.priority === criteria.priority)
    }

    // Document type filter
    if (criteria.documentType && criteria.documentType !== 'all') {
      docs = docs.filter((d) => d.documentType === criteria.documentType)
    }

    // Status filter
    if (criteria.status && criteria.status !== 'all') {
      docs = docs.filter((d) => d.status === criteria.status)
    }

    // Office filter
    if (criteria.officeId && criteria.officeId !== 'all') {
      const numOffice = Number(criteria.officeId)
      docs = docs.filter((d) => d.currentOfficeId === numOffice || d.originatingOfficeId === numOffice)
    }

    // Enrich documents with office and finance details
    const enrichedDocs = docs.map((doc) => {
      const origOffice = officeMap.get(doc.originatingOfficeId)
      const currOffice = officeMap.get(doc.currentOfficeId)
      const activeMovement = activeMovementMap.get(doc.id)
      const destOffice = activeMovement ? officeMap.get(activeMovement.toOfficeId) : null
      const fin = doc.relatedFinanceRecordId ? financeMap.get(doc.relatedFinanceRecordId) : null

      return {
        ...doc,
        title: fin?.activityDesign || doc.title,
        originatingOfficeName: origOffice ? origOffice.name : 'Unknown Office',
        originatingOfficeCode: origOffice ? origOffice.code : '',
        currentOfficeName: currOffice ? currOffice.name : 'Unknown Office',
        currentOfficeCode: currOffice ? currOffice.code : '',
        activeDestinationOfficeName: destOffice ? destOffice.name : '',
        activeDestinationOfficeCode: destOffice ? destOffice.code : '',
        activeMovement: activeMovement || null,
        relatedFinanceRecord: fin || null
      }
    })

    // Group by folder ID
    const docsByFolder = new Map()
    folders.forEach((f) => docsByFolder.set(f.id, []))

    const defaultFolder = folders.find((f) => f.isDefaultRegistration) || folders[0]

    enrichedDocs.forEach((doc) => {
      const folderId = doc.workflowFolderId || defaultFolder?.id
      if (docsByFolder.has(folderId)) {
        docsByFolder.get(folderId).push(doc)
      } else if (defaultFolder) {
        docsByFolder.get(defaultFolder.id).push(doc)
      }
    })

    // Return columns structure
    return folders.map((folder) => {
      const associatedOffice = folder.associatedOfficeId
        ? officeMap.get(folder.associatedOfficeId)
        : null

      return {
        folder: {
          ...folder,
          associatedOfficeName: associatedOffice ? associatedOffice.name : '',
          associatedOfficeCode: associatedOffice ? associatedOffice.code : ''
        },
        items: docsByFolder.get(folder.id) || []
      }
    })
  } catch (err) {
    console.error('Failed to get board data:', err)
    return []
  }
}
