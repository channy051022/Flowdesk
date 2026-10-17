import db from '../db/database'

export const TASK_STATUS_OPTIONS = ['To Do', 'In Progress', 'On Hold', 'Completed']

export const TASK_PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent']

export const TASK_CATEGORY_OPTIONS = [
  'Administrative',
  'Document Review',
  'Finance Audit',
  'Procurement',
  'Compliance',
  'Meeting',
  'Courier / Routing',
  'Filing',
  'General'
]

/**
 * Format ISO or YYYY-MM-DD date string nicely
 */
export const formatTaskDate = (dateStr) => {
  if (!dateStr) return 'No due date'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Check if a task is overdue (due date is before today and not completed)
 */
export const isTaskOverdue = (task) => {
  if (!task.dueDate || task.status === 'Completed' || task.isCompleted) return false
  const todayStr = new Date().toISOString().split('T')[0]
  return task.dueDate < todayStr
}

/**
 * Check if a task is due today
 */
export const isTaskDueToday = (task) => {
  if (!task.dueDate || task.status === 'Completed' || task.isCompleted) return false
  const todayStr = new Date().toISOString().split('T')[0]
  return task.dueDate === todayStr
}

/**
 * Calculate completion metrics for a checklist array
 */
export const calculateChecklistProgress = (checklist = []) => {
  if (!checklist || checklist.length === 0) {
    return { completed: 0, total: 0, percent: 0 }
  }
  const total = checklist.length
  const completed = checklist.filter((item) => item.isDone).length
  const percent = Math.round((completed / total) * 100)
  return { completed, total, percent }
}

/**
 * Fetch tasks applying keyword search and quick/advanced filters
 */
export async function getTasks(filterCriteria = {}) {
  try {
    let collection = await db.tasks.toArray()
    const todayStr = new Date().toISOString().split('T')[0]

    // Fetch finance records for related AD lookup
    let financeRecords = []
    try {
      financeRecords = await db.financeRecords.toArray()
    } catch {}
    const financeMap = new Map(financeRecords.map((f) => [f.id, f]))

    // Enrich tasks with linked Activity Design and PR reminder calculations
    collection = collection.map((item) => {
      let fin = null
      let prReminder = null
      if (item.relatedFinanceRecordId) {
        fin = financeMap.get(Number(item.relatedFinanceRecordId)) || null
        if (fin) {
          prReminder = getPrReminderStatus(fin.createdAt, fin.prNumber)
          // If task is linked to AD, keep title and completion synchronized
          if (fin.activityDesign && !item.title.includes(fin.activityDesign)) {
            item.title = `PR Reminder: ${fin.activityDesign}`
          }
        }
      }
      return {
        ...item,
        relatedFinanceRecord: fin,
        prReminder
      }
    })

    // 1. Keyword search (title, description, category, notes, AD title)
    if (filterCriteria.search && filterCriteria.search.trim()) {
      const q = filterCriteria.search.trim().toLowerCase()
      collection = collection.filter((item) => {
        const adTitle = item.relatedFinanceRecord?.activityDesign || ''
        return (
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.category && item.category.toLowerCase().includes(q)) ||
          (item.notes && item.notes.toLowerCase().includes(q)) ||
          (adTitle && adTitle.toLowerCase().includes(q))
        )
      })
    }

    // 2. Quick Filter Tabs
    if (filterCriteria.quickFilter) {
      const qf = filterCriteria.quickFilter
      if (qf === 'today') {
        collection = collection.filter((item) => item.dueDate === todayStr && item.status !== 'Completed')
      } else if (qf === 'upcoming') {
        collection = collection.filter((item) => item.dueDate && item.dueDate > todayStr && item.status !== 'Completed')
      } else if (qf === 'overdue') {
        collection = collection.filter((item) => item.dueDate && item.dueDate < todayStr && item.status !== 'Completed')
      } else if (qf === 'completed') {
        collection = collection.filter((item) => item.status === 'Completed' || item.isCompleted)
      } else if (qf === 'pending') {
        collection = collection.filter((item) => item.status !== 'Completed' && !item.isCompleted)
      }
    }

    // 3. Status filter
    if (filterCriteria.status && filterCriteria.status !== 'all') {
      collection = collection.filter((item) => item.status === filterCriteria.status)
    }

    // 4. Priority filter
    if (filterCriteria.priority && filterCriteria.priority !== 'all') {
      collection = collection.filter((item) => item.priority === filterCriteria.priority)
    }

    // 5. Category filter
    if (filterCriteria.category && filterCriteria.category !== 'all') {
      collection = collection.filter((item) => item.category === filterCriteria.category)
    }

    // Sorting: Incomplete first, then by priority weight (Urgent -> High -> Medium -> Low), then by due date
    const priorityWeight = { Urgent: 4, High: 3, Medium: 2, Low: 1 }

    collection.sort((a, b) => {
      // Completed items go to the bottom
      const aDone = a.status === 'Completed' || a.isCompleted ? 1 : 0
      const bDone = b.status === 'Completed' || b.isCompleted ? 1 : 0
      if (aDone !== bDone) return aDone - bDone

      // Then sort by priority
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0)
      if (pDiff !== 0) return pDiff

      // Then by due date (earliest due date first)
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate) return -1
      if (b.dueDate) return 1

      // Fallback to updated timestamp
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    })

    return collection
  } catch (error) {
    console.error('Failed to get tasks from Dexie:', error)
    throw error
  }
}

/**
 * Fetch a single task by ID
 */
export async function getTaskById(id) {
  const task = await db.tasks.get(Number(id))
  if (task && task.relatedFinanceRecordId) {
    try {
      task.relatedFinanceRecord = await db.financeRecords.get(Number(task.relatedFinanceRecordId))
      if (task.relatedFinanceRecord) {
        task.prReminder = getPrReminderStatus(task.relatedFinanceRecord.createdAt, task.relatedFinanceRecord.prNumber)
      }
    } catch {}
  }
  return task
}

/**
 * Create a new task with audit logging
 */
export async function createTask(taskData) {
  try {
    const now = new Date().toISOString()
    const isCompleted = taskData.status === 'Completed' || Boolean(taskData.isCompleted)

    const cleanData = {
      title: taskData.title?.trim() || 'Untitled Task',
      description: taskData.description?.trim() || '',
      status: taskData.status || (isCompleted ? 'Completed' : 'To Do'),
      priority: taskData.priority || 'Medium',
      startDate: taskData.startDate || '',
      dueDate: taskData.dueDate || '',
      category: taskData.category || 'General',
      checklist: Array.isArray(taskData.checklist) ? taskData.checklist : [],
      subtasks: Array.isArray(taskData.subtasks) ? taskData.subtasks : [],
      notes: taskData.notes || '',
      relatedFinanceRecordId: taskData.relatedFinanceRecordId
        ? Number(taskData.relatedFinanceRecordId)
        : null,
      isCompleted,
      isSample: Boolean(taskData.isSample),
      syncStatus: 'local',
      createdAt: now,
      updatedAt: now,
      completedAt: isCompleted ? now : null
    }

    const newId = await db.tasks.add(cleanData)

    await logActivity({
      type: 'task_created',
      entityType: 'task',
      entityId: newId,
      description: `Created task: "${cleanData.title}"`
    })

    return newId
  } catch (error) {
    console.error('Error creating task:', error)
    throw error
  }
}

/**
 * Update an existing task
 */
export async function updateTask(id, taskData) {
  try {
    const numId = Number(id)
    const existing = await db.tasks.get(numId)
    if (!existing) throw new Error(`Task #${id} not found`)

    const now = new Date().toISOString()
    const newStatus = taskData.status || existing.status || 'To Do'
    const wasCompleted = existing.status === 'Completed' || existing.isCompleted
    const isNowCompleted = newStatus === 'Completed' || Boolean(taskData.isCompleted)

    const completedAt = isNowCompleted
      ? (existing.completedAt || now)
      : null

    const updatedFields = {
      title: taskData.title !== undefined ? taskData.title.trim() : existing.title,
      description: taskData.description !== undefined ? taskData.description.trim() : existing.description,
      status: newStatus,
      priority: taskData.priority !== undefined ? taskData.priority : existing.priority,
      startDate: taskData.startDate !== undefined ? taskData.startDate : existing.startDate,
      dueDate: taskData.dueDate !== undefined ? taskData.dueDate : existing.dueDate,
      category: taskData.category !== undefined ? taskData.category : existing.category,
      checklist: Array.isArray(taskData.checklist) ? taskData.checklist : (existing.checklist || []),
      subtasks: Array.isArray(taskData.subtasks) ? taskData.subtasks : (existing.subtasks || []),
      notes: taskData.notes !== undefined ? taskData.notes : (existing.notes || ''),
      relatedFinanceRecordId: taskData.relatedFinanceRecordId !== undefined
        ? (taskData.relatedFinanceRecordId ? Number(taskData.relatedFinanceRecordId) : null)
        : existing.relatedFinanceRecordId,
      isCompleted: isNowCompleted,
      isSample: existing.isSample && taskData.isSample !== false,
      syncStatus: 'local',
      updatedAt: now,
      completedAt
    }

    await db.tasks.update(numId, updatedFields)

    if (!wasCompleted && isNowCompleted) {
      await logActivity({
        type: 'task_completed',
        entityType: 'task',
        entityId: numId,
        description: `Completed task: "${updatedFields.title}"`
      })
    } else {
      await logActivity({
        type: 'task_updated',
        entityType: 'task',
        entityId: numId,
        description: `Updated task: "${updatedFields.title}"`
      })
    }

    return numId
  } catch (error) {
    console.error('Error updating task:', error)
    throw error
  }
}

/**
 * Toggle task completion status
 */
export async function toggleTaskComplete(id) {
  try {
    const numId = Number(id)
    const existing = await db.tasks.get(numId)
    if (!existing) return null

    const now = new Date().toISOString()
    const isNowDone = !(existing.status === 'Completed' || existing.isCompleted)
    const newStatus = isNowDone ? 'Completed' : 'To Do'

    const changes = {
      status: newStatus,
      isCompleted: isNowDone,
      completedAt: isNowDone ? now : null,
      updatedAt: now
    }

    await db.tasks.update(numId, changes)

    await logActivity({
      type: isNowDone ? 'task_completed' : 'task_updated',
      entityType: 'task',
      entityId: numId,
      description: isNowDone ? `Marked task completed: "${existing.title}"` : `Reopened task: "${existing.title}"`
    })

    return { ...existing, ...changes }
  } catch (error) {
    console.error('Error toggling task completion:', error)
    throw error
  }
}

/**
 * Delete a task
 */
export async function deleteTask(id) {
  try {
    const numId = Number(id)
    const existing = await db.tasks.get(numId)

    await db.tasks.delete(numId)

    await logActivity({
      type: 'task_deleted',
      entityType: 'task',
      entityId: numId,
      description: `Deleted task: "${existing?.title || '#' + numId}"`
    })

    return true
  } catch (error) {
    console.error('Error deleting task:', error)
    throw error
  }
}

/**
 * Calculate task summary counts directly from Dexie records for dashboard and headers
 */
export async function getTaskSummaryMetrics() {
  try {
    const allTasks = await db.tasks.toArray()
    const todayStr = new Date().toISOString().split('T')[0]

    let dueTodayCount = 0
    let overdueCount = 0
    let inProgressCount = 0
    let completedCount = 0

    for (const t of allTasks) {
      const isDone = t.status === 'Completed' || t.isCompleted
      if (isDone) {
        completedCount++
      } else {
        if (t.status === 'In Progress') inProgressCount++
        if (t.dueDate === todayStr) dueTodayCount++
        if (t.dueDate && t.dueDate < todayStr) overdueCount++
      }
    }

    // Get latest active/incomplete tasks for quick view
    const recentTasks = allTasks
      .filter((t) => !(t.status === 'Completed' || t.isCompleted))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 5)

    return {
      totalTasks: allTasks.length,
      dueTodayCount,
      overdueCount,
      inProgressCount,
      completedCount,
      pendingCount: allTasks.length - completedCount,
      recentTasks
    }
  } catch (error) {
    console.error('Error calculating task metrics:', error)
    return {
      totalTasks: 0,
      dueTodayCount: 0,
      overdueCount: 0,
      inProgressCount: 0,
      completedCount: 0,
      pendingCount: 0,
      recentTasks: []
    }
  }
}

/**
 * Seed initial sample tasks for demo testing, clearly labeled
 */
export async function seedSampleTasksIfEmpty() {
  // Sample seeding disabled per user request
  await clearSampleTasks()
}

/**
 * Remove all sample demo tasks
 */
export async function clearSampleTasks() {
  try {
    const sampleTitles = [
      'Review and verify procurement documents for PR-2026-0318',
      'Draft executive transmittal memo for Q3 Physical Asset Inventory',
      'Validate travel authority routing endorsements for Regional Auditors',
      'Dispatch Batch 04 Travel Authorities via courier to Central Records',
      'File signed compliance circulars into Executive Master Cabinet B'
    ]
    const sampleItems = await db.tasks
      .filter((t) => t.isSample === true || (t.title && sampleTitles.includes(t.title)))
      .toArray()
    for (const item of sampleItems) {
      await db.tasks.delete(item.id)
    }
    await logActivity({
      type: 'task_sample_cleared',
      entityType: 'task',
      entityId: 0,
      description: `Cleared ${sampleItems.length} sample tasks from database`
    })
  } catch (err) {
    console.warn('Error clearing sample tasks:', err)
  }
}

/**
 * Helper to log events to Dexie activities table
 */
async function logActivity({ type, entityType, entityId, description }) {
  try {
    await db.activities.add({
      type,
      entityType,
      entityId,
      description,
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    console.warn('Could not record activity history log:', err)
  }
}

/**
 * Calculate the 40-day PR creation reminder due date from the AD creation timestamp.
 * 40 calendar days after AD creation date.
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
 * Recalculate PR reminder status from persisted creation timestamp and PR number.
 * Returns: { status, label, badgeVariant, isOutstanding, isDue, isOverdue, daysRemaining, dueDateStr }
 */
export function getPrReminderStatus(createdAt, prNumber) {
  if (prNumber && String(prNumber).trim()) {
    return {
      status: 'recorded',
      label: 'PR Recorded',
      badgeVariant: 'success',
      isOutstanding: false,
      isDue: false,
      isOverdue: false,
      daysRemaining: null,
      dueDateStr: calculatePrReminderDueDate(createdAt)
    }
  }

  if (!createdAt) {
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

  const dueDateStr = calculatePrReminderDueDate(createdAt)
  if (!dueDateStr) {
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
      label: 'PR Reminder Overdue',
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
      label: 'PR Reminder Due Today',
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
      label: `PR Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
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
 * Sync PR creation reminder task for an Activity Design in Finance.
 * Guarantees exactly one task per AD by checking relatedFinanceRecordId.
 */
export async function syncPrReminderTaskForAd(financeRecord) {
  if (!financeRecord || !financeRecord.id) return null
  const adId = Number(financeRecord.id)
  const adTitle = financeRecord.activityDesign || financeRecord.columnK || 'Activity Design'
  const hasPr = Boolean(financeRecord.prNumber && financeRecord.prNumber.trim())
  const dueDate = calculatePrReminderDueDate(financeRecord.createdAt || new Date().toISOString())

  const taskTitle = `PR Reminder: ${adTitle}`
  const taskDesc = `The Activity Design "${adTitle}" was created 40 days ago. Please create the Purchase Request (PR) for this AD.`
  const taskNotes = `Linked to Activity Design #${adId} (Supplier: ${financeRecord.supplierName || 'N/A'}, Amount: ₱${Number(financeRecord.adAmount || 0).toLocaleString()}, Event: ${financeRecord.eventDate || 'N/A'})`

  const existingTask = await db.tasks
    .filter((t) => Number(t.relatedFinanceRecordId) === adId)
    .first()

  if (existingTask) {
    await updateTask(existingTask.id, {
      title: taskTitle,
      description: taskDesc,
      status: hasPr ? 'Completed' : (existingTask.status === 'Completed' ? 'To Do' : existingTask.status),
      isCompleted: hasPr,
      dueDate: existingTask.dueDate || dueDate,
      notes: taskNotes,
      relatedFinanceRecordId: adId
    })
    return existingTask.id
  } else {
    const newTaskId = await createTask({
      title: taskTitle,
      description: taskDesc,
      status: hasPr ? 'Completed' : 'To Do',
      priority: 'High',
      dueDate,
      startDate: financeRecord.createdAt ? financeRecord.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      category: 'Procurement',
      relatedFinanceRecordId: adId,
      notes: taskNotes,
      isCompleted: hasPr
    })
    return newTaskId
  }
}

/**
 * Get all outstanding (due today or overdue) PR reminders for Activity Designs
 */
export async function getOutstandingPrReminders() {
  try {
    const financeRecords = await db.financeRecords.toArray()
    const outstanding = []

    for (const record of financeRecords) {
      if (record.prNumber && record.prNumber.trim()) continue
      const reminder = getPrReminderStatus(record.createdAt, record.prNumber)
      if (reminder.isOutstanding) {
        outstanding.push({
          financeRecord: record,
          reminder
        })
      }
    }

    return outstanding
  } catch (err) {
    console.error('Failed to get outstanding PR reminders:', err)
    return []
  }
}
