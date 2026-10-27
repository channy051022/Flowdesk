import db from '../db/database'
import { getOutstandingPrReminders } from './taskService'

/**
 * Returns YYYY-MM-DD in local time
 */
export function getLocalDateString(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calculate difference in whole calendar days (target - base)
 * Negative = target is in the past (overdue)
 * 0 = target is today (due today)
 * Positive = target is in the future
 */
export function getDaysDifference(targetDateStr, baseDateStr = getLocalDateString()) {
  if (!targetDateStr) return 0
  const [tY, tM, tD] = targetDateStr.split('-').map(Number)
  const [bY, bM, bD] = baseDateStr.split('-').map(Number)
  
  const target = new Date(tY, tM - 1, tD)
  const base = new Date(bY, bM - 1, bD)
  
  const diffMs = target.getTime() - base.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Gather all documents, tasks, and PR reminders that are overdue or due today
 */
export async function getSystemDueAndOverdueItems() {
  try {
    const todayStr = getLocalDateString()

    const [docs, tasks, prReminders, offices] = await Promise.all([
      db.documents.toArray().catch(() => []),
      db.tasks.toArray().catch(() => []),
      getOutstandingPrReminders().catch(() => []),
      db.offices.toArray().catch(() => [])
    ])

    const officeMap = new Map(offices.map((o) => [o.id, o]))
    const items = []

    // 1. Process Physical Documents
    for (const doc of docs) {
      if (doc.isArchived || doc.status === 'completed' || doc.status === 'archived') continue
      if (!doc.dueDate) continue

      const diff = getDaysDifference(doc.dueDate, todayStr)
      if (diff <= 0) {
        const isOverdue = diff < 0
        const office = officeMap.get(doc.currentOfficeId)
        items.push({
          id: `doc-${doc.id}`,
          originalId: doc.id,
          category: 'document',
          categoryLabel: 'Paper Document',
          title: doc.title,
          subtitle: doc.trackingNumber ? `Tracking: ${doc.trackingNumber}` : doc.documentType,
          trackingNumber: doc.trackingNumber,
          documentType: doc.documentType,
          dueDate: doc.dueDate,
          urgency: isOverdue ? 'overdue' : 'due_today',
          urgencyLabel: isOverdue
            ? (diff === -1 ? 'Overdue by 1 day' : `Overdue by ${Math.abs(diff)} days`)
            : 'Due Today',
          diffDays: diff,
          officeName: office ? office.name : 'Originating Desk',
          priority: doc.priority || 'Routine',
          routePath: '/documents',
          routeQuery: { search: doc.trackingNumber || doc.title }
        })
      }
    }

    // 2. Process Action Tasks
    for (const task of tasks) {
      if (task.isCompleted || task.status === 'Completed') continue
      if (!task.dueDate) continue

      const diff = getDaysDifference(task.dueDate, todayStr)
      if (diff <= 0) {
        const isOverdue = diff < 0
        items.push({
          id: `task-${task.id}`,
          originalId: task.id,
          category: 'task',
          categoryLabel: 'Action Task',
          title: task.title,
          subtitle: task.category || 'General Desk Task',
          dueDate: task.dueDate,
          urgency: isOverdue ? 'overdue' : 'due_today',
          urgencyLabel: isOverdue
            ? (diff === -1 ? 'Overdue by 1 day' : `Overdue by ${Math.abs(diff)} days`)
            : 'Due Today',
          diffDays: diff,
          priority: task.priority || 'Medium',
          routePath: '/tasks',
          routeQuery: { search: task.title }
        })
      }
    }

    // 3. Process Activity Design PR Creation Reminders
    for (const item of prReminders) {
      const rec = item.financeRecord
      const rem = item.reminder
      const isOverdue = rem.isOverdue
      items.push({
        id: `pr-${rec.id}`,
        originalId: rec.id,
        category: 'pr_reminder',
        categoryLabel: 'PR Creation Reminder',
        title: rec.activityDesign || rec.supplierName || 'Activity Design',
        subtitle: `40-day creation requirement • ${rec.adAmount ? `₱${Number(rec.adAmount).toLocaleString()}` : 'Budget allocation'}`,
        dueDate: rem.dueDate || '40-day deadline',
        urgency: isOverdue ? 'overdue' : 'due_today',
        urgencyLabel: isOverdue ? rem.badgeText || 'PR Overdue' : 'PR Due Today',
        diffDays: isOverdue ? -1 : 0,
        priority: 'Urgent',
        routePath: '/finance',
        routeQuery: { search: rec.activityDesign || rec.supplierName }
      })
    }

    // Sort: overdue first (most overdue first: lowest diffDays), then due today
    items.sort((a, b) => {
      if (a.urgency === 'overdue' && b.urgency !== 'overdue') return -1
      if (a.urgency !== 'overdue' && b.urgency === 'overdue') return 1
      return a.diffDays - b.diffDays
    })

    const overdueCount = items.filter((i) => i.urgency === 'overdue').length
    const dueTodayCount = items.filter((i) => i.urgency === 'due_today').length
    const documentsCount = items.filter((i) => i.category === 'document').length
    const tasksCount = items.filter((i) => i.category === 'task').length
    const prRemindersCount = items.filter((i) => i.category === 'pr_reminder').length

    return {
      items,
      overdueCount,
      dueTodayCount,
      totalCount: items.length,
      documentsCount,
      tasksCount,
      prRemindersCount,
      hasUrgentItems: items.length > 0
    }
  } catch (err) {
    console.error('Failed to get system due and overdue items:', err)
    return {
      items: [],
      overdueCount: 0,
      dueTodayCount: 0,
      totalCount: 0,
      documentsCount: 0,
      tasksCount: 0,
      prRemindersCount: 0,
      hasUrgentItems: false
    }
  }
}
