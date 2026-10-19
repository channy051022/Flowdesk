<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import BaseBadge from '../components/common/BaseBadge.vue'
import BaseButton from '../components/common/BaseButton.vue'
import BaseCard from '../components/common/BaseCard.vue'
import FolderModal from '../components/workflow/FolderModal.vue'
import ArchiveFolderModal from '../components/workflow/ArchiveFolderModal.vue'
import DocumentModal from '../components/documents/DocumentModal.vue'
import DocumentDetailDrawer from '../components/documents/DocumentDetailDrawer.vue'
import TransferModal from '../components/documents/TransferModal.vue'
import ReceiveModal from '../components/documents/ReceiveModal.vue'
import {
  getBoardData,
  moveDocumentToFolder,
  reorderWorkflowFolders,
  getWorkflowFolders
} from '../services/workflowService'
import {
  createDocument,
  formatDocDate,
  isDocumentOverdue
} from '../services/documentService'
import { getOffices } from '../services/officeService'
import { DOCUMENT_TYPES, DOCUMENT_STATUSES } from '../db/database'
import { toast } from '../composables/useToast'
import {
  Kanban,
  Plus,
  Search,
  Filter,
  FolderOpen,
  MoreVertical,
  Send,
  MapPin,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Copy,
  ArrowRight,
  Eye,
  Edit2,
  Archive,
  ArrowLeft,
  ArrowRight as ArrowRightIcon,
  Check,
  X,
  Building2,
  FileText,
  Sparkles,
  Info,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Table,
  RotateCcw
} from 'lucide-vue-next'

// State
const boardColumns = ref([])
const allActiveFolders = ref([])
const officesList = ref([])
const isLoading = ref(true)

// Filter & Search
const searchQuery = ref('')
const selectedPriority = ref('all')
const selectedType = ref('all')
const selectedStatus = ref('all')
const selectedOffice = ref('all')

// Drag & Drop State
const draggedDocument = ref(null)
const isDraggingCardId = ref(null)
const dragOverFolderId = ref(null)
const dragEnterCounts = ref({})
const recentlyMovedFolderId = ref(null)
let recentlyMovedTimer = null
const isMovingDocument = ref(false)

// UI Feedback Toast / Banner
const feedback = ref(null) // { type: 'success' | 'error', text: '' }
let feedbackTimer = null

const showFeedback = (text, type = 'success') => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedback.value = { text, type }
  feedbackTimer = setTimeout(() => {
    feedback.value = null
  }, 4000)
}

// Menus
const openFolderMenuId = ref(null)
const openCardMenuId = ref(null)

const toggleFolderMenu = (folderId, event) => {
  event?.stopPropagation()
  openFolderMenuId.value = openFolderMenuId.value === folderId ? null : folderId
  openCardMenuId.value = null
}

const toggleCardMenu = (cardId, event) => {
  event?.stopPropagation()
  openCardMenuId.value = openCardMenuId.value === cardId ? null : cardId
  openFolderMenuId.value = null
}

const closeAllMenus = () => {
  openFolderMenuId.value = null
  openCardMenuId.value = null
}

// Modals State
const isFolderModalOpen = ref(false)
const folderToEdit = ref(null)

const isArchiveModalOpen = ref(false)
const folderToArchive = ref(null)
const folderToArchiveCount = ref(0)

const isAddDocModalOpen = ref(false)
const selectedDocumentId = ref(null)
const isDetailDrawerOpen = ref(false)

const isTransferModalOpen = ref(false)
const documentForTransfer = ref(null)

const isReceiveModalOpen = ref(false)
const documentForReceive = ref(null)

const copiedNumber = ref('')
let copyTimer = null

const copySlip = (num) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(num)
    copiedNumber.value = num
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedNumber.value = ''
    }, 2000)
  }
}

// Load Board Data from Dexie
const loadBoard = async () => {
  isLoading.value = true
  try {
    const [data, folders, offices] = await Promise.all([
      getBoardData({
        search: searchQuery.value,
        priority: selectedPriority.value,
        documentType: selectedType.value,
        status: selectedStatus.value,
        officeId: selectedOffice.value
      }),
      getWorkflowFolders(false),
      getOffices()
    ])

    boardColumns.value = data
    allActiveFolders.value = folders
    officesList.value = offices
  } catch (err) {
    console.error('Failed to load workflow board:', err)
    showFeedback('Error loading workflow board: ' + err.message, 'error')
  } finally {
    isLoading.value = false
    nextTick(() => {
      updateScrollIndicators()
    })
  }
}

// Debounced filter watch for smooth, non-blocking typing
let searchDebounceTimer = null
watch(
  [searchQuery, selectedPriority, selectedType, selectedStatus, selectedOffice],
  () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      loadBoard()
    }, 150)
  }
)

// Active filters count computation
const activeFiltersCount = computed(() => {
  let count = 0
  if (searchQuery.value.trim()) count++
  if (selectedPriority.value !== 'all') count++
  if (selectedType.value !== 'all') count++
  if (selectedStatus.value !== 'all') count++
  if (selectedOffice.value !== 'all') count++
  return count
})

// Total documents displayed across all columns
const totalDisplayedDocs = computed(() => {
  return boardColumns.value.reduce((total, col) => total + (col.items?.length || 0), 0)
})

// Board Horizontal Drag-to-Scroll State (Trello-style click-and-drag)
const boardContainerRef = ref(null)
const isDraggingBoard = ref(false)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let isPointerDown = false
let startX = 0
let startScrollLeft = 0
let activePointerId = null
let didDragBoard = false
let dragCleanupTimer = null

const updateScrollIndicators = () => {
  if (!boardContainerRef.value) return
  const { scrollLeft, scrollWidth, clientWidth } = boardContainerRef.value
  canScrollLeft.value = scrollLeft > 10
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 10
}

const scrollBoardBy = (amount) => {
  if (!boardContainerRef.value) return
  boardContainerRef.value.scrollBy({
    left: amount,
    behavior: 'smooth'
  })
}

const handleBoardPointerDown = (e) => {
  // Only handle primary left mouse button; preserve native touch gestures
  if (e.pointerType !== 'mouse' || e.button !== 0) return

  // Prevent board dragging when gesture starts on document cards, buttons, links, inputs, menus, dialogs, or card lists
  const interactiveTarget = e.target.closest(
    'button, a, input, select, textarea, [draggable="true"], [role="button"], [role="menu"], [role="dialog"], .folder-cards-list, .folder-menu-dropdown'
  )
  if (interactiveTarget) return

  if (!boardContainerRef.value) return

  isPointerDown = true
  didDragBoard = false
  startX = e.clientX
  startScrollLeft = boardContainerRef.value.scrollLeft
  activePointerId = e.pointerId
}

const handleBoardPointerMove = (e) => {
  if (!isPointerDown || !boardContainerRef.value) return

  const dx = e.clientX - startX

  // Apply a small 4px threshold to distinguish intentional drag from a static click
  if (!isDraggingBoard.value) {
    if (Math.abs(dx) > 4) {
      isDraggingBoard.value = true
      didDragBoard = true
      try {
        if (activePointerId !== null && boardContainerRef.value.setPointerCapture) {
          boardContainerRef.value.setPointerCapture(activePointerId)
        }
      } catch (_) {}
    }
  }

  if (isDraggingBoard.value) {
    e.preventDefault()
    boardContainerRef.value.scrollLeft = startScrollLeft - dx
    updateScrollIndicators()
  }
}

const handleBoardPointerUp = () => {
  if (!isPointerDown && !isDraggingBoard.value) return

  if (activePointerId !== null && boardContainerRef.value?.releasePointerCapture) {
    try {
      boardContainerRef.value.releasePointerCapture(activePointerId)
    } catch (_) {}
  }

  isPointerDown = false
  activePointerId = null

  if (isDraggingBoard.value) {
    isDraggingBoard.value = false
    updateScrollIndicators()
    // Briefly hold didDragBoard to suppress accidental click triggers immediately after dragging
    if (dragCleanupTimer) clearTimeout(dragCleanupTimer)
    dragCleanupTimer = setTimeout(() => {
      didDragBoard = false
    }, 80)
  }
}

const handleBoardClickCapture = (e) => {
  // Suppress click events if the user just completed a drag scroll gesture
  if (didDragBoard) {
    e.stopPropagation()
    e.preventDefault()
  }
}

// Mouse wheel horizontal navigation support when over empty board canvas
const handleBoardWheel = (e) => {
  const scrollableList = e.target.closest('.folder-cards-list')
  if (scrollableList && scrollableList.scrollHeight > scrollableList.clientHeight) {
    // If inside a vertically scrollable card list, allow vertical scrolling unless Shift is pressed
    if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      return
    }
  }

  if (boardContainerRef.value) {
    const delta = e.deltaX !== 0 ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
    if (delta !== 0) {
      boardContainerRef.value.scrollLeft += delta
      updateScrollIndicators()
    }
  }
}

// Keyboard arrow horizontal navigation for accessibility
const handleBoardKeyDown = (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
  if (e.key === 'ArrowRight' && !e.altKey && !e.ctrlKey) {
    scrollBoardBy(340)
  } else if (e.key === 'ArrowLeft' && !e.altKey && !e.ctrlKey) {
    scrollBoardBy(-340)
  }
}

// =========================================================================
// Auto-Scroll during Document Drag-and-Drop
// =========================================================================
const EDGE_ZONE_WIDTH = 90 // Proximity in px to board boundary to trigger auto-scroll
const MIN_AUTO_SCROLL_SPEED = 5 // Base scroll speed (pixels per frame)
const MAX_AUTO_SCROLL_SPEED = 18 // Maximum scroll speed at extreme edge (pixels per frame)

let autoScrollRafId = null
let autoScrollDirection = 0 // -1 for left, 1 for right, 0 for stop
let autoScrollSpeed = 0
let lastDragClientX = 0
let lastDragClientY = 0

const evaluateAutoScroll = (clientX, clientY) => {
  if (!draggedDocument.value || !boardContainerRef.value) {
    stopAutoScroll()
    return
  }

  const container = boardContainerRef.value
  const rect = container.getBoundingClientRect()

  // Verify pointer is within the vertical bounds of the board container
  if (clientY < rect.top - 60 || clientY > rect.bottom + 60) {
    stopAutoScroll()
    return
  }

  const maxScrollLeft = container.scrollWidth - container.clientWidth

  // Left edge auto-scroll zone
  if (clientX <= rect.left + EDGE_ZONE_WIDTH) {
    if (container.scrollLeft <= 0) {
      stopAutoScroll()
      return
    }
    const dist = Math.max(0, clientX - rect.left)
    const ratio = Math.min(1, Math.max(0, (EDGE_ZONE_WIDTH - dist) / EDGE_ZONE_WIDTH))
    autoScrollSpeed = Math.round(MIN_AUTO_SCROLL_SPEED + ratio * (MAX_AUTO_SCROLL_SPEED - MIN_AUTO_SCROLL_SPEED))
    autoScrollDirection = -1
    startAutoScroll()
  }
  // Right edge auto-scroll zone
  else if (clientX >= rect.right - EDGE_ZONE_WIDTH) {
    if (container.scrollLeft >= maxScrollLeft - 1) {
      stopAutoScroll()
      return
    }
    const dist = Math.max(0, rect.right - clientX)
    const ratio = Math.min(1, Math.max(0, (EDGE_ZONE_WIDTH - dist) / EDGE_ZONE_WIDTH))
    autoScrollSpeed = Math.round(MIN_AUTO_SCROLL_SPEED + ratio * (MAX_AUTO_SCROLL_SPEED - MIN_AUTO_SCROLL_SPEED))
    autoScrollDirection = 1
    startAutoScroll()
  }
  // Neutral center zone
  else {
    stopAutoScroll()
  }
}

const updateHoveredFolderFromPoint = (x, y) => {
  try {
    const el = document.elementFromPoint(x, y)
    if (!el) return
    const folderEl = el.closest('[data-folder-id]')
    if (folderEl) {
      const fId = Number(folderEl.dataset.folderId)
      if (fId && dragOverFolderId.value !== fId) {
        dragOverFolderId.value = fId
      }
    }
  } catch (_) {}
}

const startAutoScroll = () => {
  if (autoScrollRafId !== null) return

  const loop = () => {
    if (!draggedDocument.value || autoScrollDirection === 0 || !boardContainerRef.value) {
      stopAutoScroll()
      return
    }

    const container = boardContainerRef.value
    const maxScrollLeft = container.scrollWidth - container.clientWidth

    if (autoScrollDirection < 0) {
      if (container.scrollLeft > 0) {
        container.scrollLeft = Math.max(0, container.scrollLeft - autoScrollSpeed)
        updateScrollIndicators()
      } else {
        stopAutoScroll()
        return
      }
    } else if (autoScrollDirection > 0) {
      if (container.scrollLeft < maxScrollLeft) {
        container.scrollLeft = Math.min(maxScrollLeft, container.scrollLeft + autoScrollSpeed)
        updateScrollIndicators()
      } else {
        stopAutoScroll()
        return
      }
    }

    // While auto-scrolling, dynamically update the folder hovered under the pointer
    // even if the mouse is held stationary at the edge
    if (lastDragClientX && lastDragClientY) {
      updateHoveredFolderFromPoint(lastDragClientX, lastDragClientY)
    }

    autoScrollRafId = requestAnimationFrame(loop)
  }

  autoScrollRafId = requestAnimationFrame(loop)
}

const stopAutoScroll = () => {
  if (autoScrollRafId !== null) {
    cancelAnimationFrame(autoScrollRafId)
    autoScrollRafId = null
  }
  autoScrollDirection = 0
  autoScrollSpeed = 0
}

const handleWindowDragOver = (e) => {
  if (!draggedDocument.value) return
  lastDragClientX = e.clientX
  lastDragClientY = e.clientY
  evaluateAutoScroll(e.clientX, e.clientY)
}

const handleBoardDragOver = (event) => {
  if (draggedDocument.value) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }
}

const handleBoardDrop = async (event) => {
  event.preventDefault()
  stopAutoScroll()
  if (!draggedDocument.value) return

  let targetFolder = null
  if (dragOverFolderId.value) {
    targetFolder = allActiveFolders.value.find((f) => f.id === dragOverFolderId.value)
  }
  if (!targetFolder && lastDragClientX && lastDragClientY) {
    const el = document.elementFromPoint(lastDragClientX, lastDragClientY)
    const folderEl = el?.closest('[data-folder-id]')
    if (folderEl) {
      const fId = Number(folderEl.dataset.folderId)
      targetFolder = allActiveFolders.value.find((f) => f.id === fId)
    }
  }

  if (targetFolder) {
    await onDrop(event, targetFolder)
  } else {
    onDragEnd()
  }
}

onMounted(() => {
  loadBoard()
  window.addEventListener('click', closeAllMenus)
  window.addEventListener('pointermove', handleBoardPointerMove, { passive: false })
  window.addEventListener('pointerup', handleBoardPointerUp)
  window.addEventListener('pointercancel', handleBoardPointerUp)
  window.addEventListener('blur', handleBoardPointerUp)
  window.addEventListener('blur', onDragEnd)
  window.addEventListener('resize', updateScrollIndicators)
  window.addEventListener('dragover', handleWindowDragOver, { passive: false })
  window.addEventListener('dragend', onDragEnd)
})

onUnmounted(() => {
  stopAutoScroll()
  window.removeEventListener('click', closeAllMenus)
  window.removeEventListener('pointermove', handleBoardPointerMove)
  window.removeEventListener('pointerup', handleBoardPointerUp)
  window.removeEventListener('pointercancel', handleBoardPointerUp)
  window.removeEventListener('blur', handleBoardPointerUp)
  window.removeEventListener('blur', onDragEnd)
  window.removeEventListener('resize', updateScrollIndicators)
  window.removeEventListener('dragover', handleWindowDragOver)
  window.removeEventListener('dragend', onDragEnd)
  if (feedbackTimer) clearTimeout(feedbackTimer)
  if (dragCleanupTimer) clearTimeout(dragCleanupTimer)
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  if (recentlyMovedTimer) clearTimeout(recentlyMovedTimer)
  if (copyTimer) clearTimeout(copyTimer)
})

// Drag and Drop Handlers with Anti-Flicker & Smooth Ghosting
const onDragStart = (event, card) => {
  draggedDocument.value = card
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(card.id))
  }
  // Defer setting isDraggingCardId to the next animation frame so the browser
  // captures a full crisp card snapshot for the drag ghost image
  requestAnimationFrame(() => {
    isDraggingCardId.value = card.id
  })
}

const onDragEnd = () => {
  stopAutoScroll()
  draggedDocument.value = null
  isDraggingCardId.value = null
  dragOverFolderId.value = null
  dragEnterCounts.value = {}
  lastDragClientX = 0
  lastDragClientY = 0
}

const onDragEnterFolder = (event, folderId) => {
  event.preventDefault()
  dragEnterCounts.value[folderId] = (dragEnterCounts.value[folderId] || 0) + 1
  dragOverFolderId.value = folderId
}

const onDragOverFolder = (event, folderId) => {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  if (dragOverFolderId.value !== folderId) {
    dragOverFolderId.value = folderId
  }
}

const onDragLeaveFolder = (event, folderId) => {
  dragEnterCounts.value[folderId] = Math.max(0, (dragEnterCounts.value[folderId] || 1) - 1)
  if (dragEnterCounts.value[folderId] === 0 && dragOverFolderId.value === folderId) {
    dragOverFolderId.value = null
  }
}

const onDrop = async (event, targetFolder) => {
  event.preventDefault()
  stopAutoScroll()
  dragOverFolderId.value = null
  dragEnterCounts.value = {}

  if (!draggedDocument.value) return
  const doc = draggedDocument.value
  draggedDocument.value = null
  isDraggingCardId.value = null
  await executeMove(doc, targetFolder)
}

// Execute Card Move with Optimistic UI & Safe Rollback
const executeMove = async (doc, targetFolder) => {
  if (doc.workflowFolderId === targetFolder.id) {
    return
  }

  if (isMovingDocument.value) return
  isMovingDocument.value = true

  // Pre-validate physical destination requirements
  if (targetFolder.behavior === 'destination' && !targetFolder.associatedOfficeId) {
    showFeedback(
      `Cannot move to "${targetFolder.name}": this destination folder has no assigned office configured.`,
      'error'
    )
    isMovingDocument.value = false
    return
  }

  // Snapshot current columns for rollback
  const previousColumns = JSON.parse(JSON.stringify(boardColumns.value))

  // Optimistic UI update: relocate card immediately in local state
  try {
    for (const col of boardColumns.value) {
      col.items = col.items.filter((item) => item.id !== doc.id)
    }
    const targetCol = boardColumns.value.find((c) => c.folder.id === targetFolder.id)
    if (targetCol) {
      targetCol.items.unshift({
        ...doc,
        workflowFolderId: targetFolder.id
      })
    }
  } catch (optErr) {
    console.warn('Optimistic update skipped:', optErr)
  }

  // Commit move to Dexie transaction
  try {
    await moveDocumentToFolder(doc.id, targetFolder.id)
    toast.success(`Moved ${doc.trackingNumber} to "${targetFolder.name}".`)
    showFeedback(`Moved ${doc.trackingNumber} to "${targetFolder.name}"`, 'success')

    // Brief highlight pulse on destination folder
    recentlyMovedFolderId.value = targetFolder.id
    if (recentlyMovedTimer) clearTimeout(recentlyMovedTimer)
    recentlyMovedTimer = setTimeout(() => {
      recentlyMovedFolderId.value = null
    }, 1500)

    await loadBoard()
  } catch (err) {
    console.error('Move failed, rolling back:', err)
    boardColumns.value = previousColumns
    toast.error('Unable to save changes. Please try again.', err.message)
    showFeedback(`Failed to move document: ${err.message}`, 'error')
  } finally {
    isMovingDocument.value = false
  }
}

// Folder Menu Operations: Add, Edit, Move, Archive
const openAddFolderModal = () => {
  folderToEdit.value = null
  isFolderModalOpen.value = true
  closeAllMenus()
}

const openEditFolderModal = (folder) => {
  folderToEdit.value = folder
  isFolderModalOpen.value = true
  closeAllMenus()
}

const openArchiveFolderModal = (col) => {
  folderToArchive.value = col.folder
  folderToArchiveCount.value = col.items.length
  isArchiveModalOpen.value = true
  closeAllMenus()
}

const handleFolderSaved = async () => {
  isFolderModalOpen.value = false
  folderToEdit.value = null
  toast.success('Routing folder saved successfully.')
  showFeedback('Folder saved successfully.')
  await loadBoard()
}

const handleFolderArchived = async () => {
  isArchiveModalOpen.value = false
  folderToArchive.value = null
  showFeedback('Folder archived successfully.')
  await loadBoard()
}

const moveFolderOrder = async (index, direction) => {
  closeAllMenus()
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= boardColumns.value.length) return

  const reordered = [...boardColumns.value]
  const [removed] = reordered.splice(index, 1)
  reordered.splice(targetIndex, 0, removed)

  const orderedIds = reordered.map((c) => c.folder.id)
  try {
    await reorderWorkflowFolders(orderedIds)
    await loadBoard()
    showFeedback('Folders reordered.')
  } catch (err) {
    showFeedback('Failed to reorder folders: ' + err.message, 'error')
  }
}

// Card Actions
const openDetailDrawer = (doc) => {
  selectedDocumentId.value = doc.id
  isDetailDrawerOpen.value = true
  closeAllMenus()
}

const openAddDocumentModal = () => {
  isAddDocModalOpen.value = true
}

const handleDocumentSaved = async ({ data }) => {
  try {
    await createDocument(data)
    isAddDocModalOpen.value = false
    showFeedback('Document registered and placed in initial workflow folder.')
    await loadBoard()
  } catch (err) {
    alert('Error saving document: ' + err.message)
  }
}

const openReceiveModal = (doc) => {
  documentForReceive.value = doc
  isReceiveModalOpen.value = true
}

const handleReceived = async () => {
  isReceiveModalOpen.value = false
  documentForReceive.value = null
  showFeedback('Receipt confirmed. Document office custody updated.')
  await loadBoard()
}

const openTransferModal = (doc) => {
  documentForTransfer.value = doc
  isTransferModalOpen.value = true
}

const handleTransferred = async () => {
  isTransferModalOpen.value = false
  documentForTransfer.value = null
  showFeedback('Transfer dispatched. Document marked in transit.')
  await loadBoard()
}

const resetFilters = () => {
  searchQuery.value = ''
  selectedPriority.value = 'all'
  selectedType.value = 'all'
  selectedStatus.value = 'all'
  selectedOffice.value = 'all'
}

// Helpers for badges and color accents
const getPriorityBadgeVariant = (p) => {
  if (p === 'Urgent') return 'urgent'
  if (p === 'High') return 'warning'
  if (p === 'Medium') return 'info'
  return 'routine'
}

// Soft pastel background tint for routing folders (no heavy solid colors, fully dark-mode aware)
const getFolderBgClass = (color) => {
  switch (color) {
    case 'blue':
      return 'bg-blue-50/50 dark:bg-blue-950/25'
    case 'amber':
      return 'bg-amber-50/50 dark:bg-amber-950/25'
    case 'teal':
      return 'bg-teal-50/50 dark:bg-teal-950/25'
    case 'sky':
      return 'bg-sky-50/50 dark:bg-sky-950/25'
    case 'rose':
      return 'bg-[#FFF5F8] dark:bg-[#261720]'
    case 'blush':
      return 'bg-[#FAF4F7] dark:bg-[#231821]'
    case 'mauve':
      return 'bg-[#F8F5F7] dark:bg-[#20181F]'
    case 'lavender':
      return 'bg-purple-50/50 dark:bg-purple-950/25'
    case 'slate':
      return 'bg-slate-50/80 dark:bg-slate-900/40'
    case 'emerald':
      return 'bg-emerald-50/50 dark:bg-emerald-950/25'
    case 'purple':
      return 'bg-purple-50/50 dark:bg-purple-950/25'
    case 'forest':
    default:
      return 'bg-[#FFF7FA] dark:bg-[#24171F]'
  }
}

// Subtle matching neutral border for routing folders (no heavy borders, no colored top border)
const getFolderBorderClass = (color) => {
  switch (color) {
    case 'blue':
      return 'border-blue-100/90 dark:border-blue-900/40'
    case 'amber':
      return 'border-amber-100/90 dark:border-amber-900/40'
    case 'teal':
      return 'border-teal-100/90 dark:border-teal-900/40'
    case 'sky':
      return 'border-sky-100/90 dark:border-sky-900/40'
    case 'rose':
      return 'border-[#F5DEE7] dark:border-[#3D2332]'
    case 'blush':
      return 'border-[#F0E3E9] dark:border-[#3A2230]'
    case 'mauve':
      return 'border-[#EAE1E6] dark:border-[#36222F]'
    case 'lavender':
      return 'border-purple-100/80 dark:border-purple-900/40'
    case 'slate':
      return 'border-slate-200/80 dark:border-slate-800/60'
    case 'emerald':
      return 'border-emerald-100/90 dark:border-emerald-900/40'
    case 'purple':
      return 'border-purple-100/80 dark:border-purple-900/40'
    case 'forest':
    default:
      return 'border-[#F2DEE7] dark:border-[#3D2332]'
  }
}

// Small restrained status indicator dot for the folder header
const getFolderDotClass = (color) => {
  switch (color) {
    case 'blue':
      return 'bg-blue-500'
    case 'amber':
      return 'bg-amber-500'
    case 'teal':
      return 'bg-teal-500'
    case 'sky':
      return 'bg-sky-500'
    case 'rose':
      return 'bg-[#D9467B]'
    case 'blush':
      return 'bg-[#E883A9]'
    case 'mauve':
      return 'bg-[#806B76]'
    case 'lavender':
      return 'bg-purple-400'
    case 'slate':
      return 'bg-slate-400'
    case 'emerald':
      return 'bg-emerald-600'
    case 'purple':
      return 'bg-purple-500'
    case 'forest':
    default:
      return 'bg-[#D9467B]'
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Feedback Toast Alert Banner -->
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="transform -translate-y-2 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform -translate-y-2 opacity-0"
    >
      <div
        v-if="feedback"
        :class="[
          'p-3 rounded-xl text-xs font-medium flex items-center justify-between gap-2 shadow-xs border',
          feedback.type === 'error'
            ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-200 dark:border-red-900/50'
            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-900/50'
        ]"
      >
        <div class="flex items-center gap-2">
          <AlertTriangle v-if="feedback.type === 'error'" class="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
          <CheckCircle2 v-else class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{{ feedback.text }}</span>
        </div>
        <button
          @click="feedback = null"
          type="button"
          class="text-zinc-400 hover:text-zinc-700 dark:hover:text-[#F5EDF1] cursor-pointer"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </transition>

    <!-- Header & Action Buttons -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 class="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-[#F5EDF1] tracking-tight flex items-center gap-2">
          <Kanban class="w-6 h-6 text-[#D9467B] dark:text-[#F294B7]" />
          <span>Workflow Board</span>
        </h2>
        <p class="text-xs sm:text-sm text-zinc-500 dark:text-[#BCAEBA] mt-0.5">
          Visual staging of physical paper folders through administrative review, approval, and office dispatch.
        </p>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <BaseButton
          variant="secondary"
          size="sm"
          @click="openAddFolderModal"
        >
          <FolderOpen class="w-3.5 h-3.5 text-zinc-600 dark:text-[#BCAEBA] mr-1.5" />
          Add Routing Folder
        </BaseButton>

        <BaseButton
          variant="primary"
          size="sm"
          @click="openAddDocumentModal"
        >
          <Plus class="w-3.5 h-3.5 text-rose-200 mr-1.5" />
          Register Document
        </BaseButton>
      </div>
    </div>

    <!-- Filters & Search Toolbar -->
    <div class="bg-white dark:bg-[#1A1719] rounded-2xl border border-zinc-200/80 dark:border-[#2D252B] p-3.5 shadow-2xs space-y-3">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <!-- Search Input -->
        <div class="relative flex-1">
          <Search class="w-3.5 h-3.5 text-zinc-400 dark:text-[#806B76] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search tracking #, title, reference #, or office..."
            class="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-50 dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-xl text-zinc-800 dark:text-[#F5EDF1] placeholder:text-zinc-400 dark:placeholder:text-[#806B76] focus:outline-none focus:ring-2 focus:ring-[#D9467B] transition-all"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            type="button"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-[#F5EDF1] p-0.5"
            title="Clear search"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Document Count & Reset Summary -->
        <div class="flex items-center gap-2 shrink-0 text-xs">
          <span class="text-zinc-500 dark:text-[#BCAEBA] text-[11px] font-medium hidden md:inline">
            Showing <strong class="text-zinc-800 dark:text-[#F5EDF1]">{{ totalDisplayedDocs }}</strong> documents across <strong class="text-zinc-800 dark:text-[#F5EDF1]">{{ boardColumns.length }}</strong> folders
          </span>

          <span
            v-if="activeFiltersCount > 0"
            class="px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-[#D9467B] dark:text-[#F294B7] text-[11px] font-semibold border border-rose-200 dark:border-rose-900/50 inline-flex items-center gap-1"
          >
            <Filter class="w-2.5 h-2.5" />
            <span>{{ activeFiltersCount }} active</span>
          </span>

          <button
            v-if="activeFiltersCount > 0"
            @click="resetFilters"
            type="button"
            class="text-xs text-zinc-500 dark:text-[#BCAEBA] hover:text-[#D9467B] dark:hover:text-[#F294B7] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RotateCcw class="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <!-- Quick Filter Selects Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <!-- Priority Filter -->
        <div>
          <select
            v-model="selectedPriority"
            class="w-full px-2.5 py-1.5 bg-zinc-50/80 dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-xl text-zinc-700 dark:text-[#F5EDF1] text-xs focus:outline-none focus:ring-2 focus:ring-[#D9467B] cursor-pointer transition-all"
          >
            <option value="all">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low / Routine</option>
          </select>
        </div>

        <!-- Document Type Filter -->
        <div>
          <select
            v-model="selectedType"
            class="w-full px-2.5 py-1.5 bg-zinc-50/80 dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-xl text-zinc-700 dark:text-[#F5EDF1] text-xs focus:outline-none focus:ring-2 focus:ring-[#D9467B] cursor-pointer transition-all"
          >
            <option value="all">All Document Types</option>
            <option v-for="t in DOCUMENT_TYPES" :key="t" :value="t">
              {{ t }}
            </option>
          </select>
        </div>

        <!-- Status Filter -->
        <div>
          <select
            v-model="selectedStatus"
            class="w-full px-2.5 py-1.5 bg-zinc-50/80 dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-xl text-zinc-700 dark:text-[#F5EDF1] text-xs focus:outline-none focus:ring-2 focus:ring-[#D9467B] cursor-pointer transition-all"
          >
            <option value="all">All Statuses</option>
            <option v-for="st in DOCUMENT_STATUSES" :key="st.value" :value="st.value">
              {{ st.label }}
            </option>
          </select>
        </div>

        <!-- Physical Office Filter -->
        <div>
          <select
            v-model="selectedOffice"
            class="w-full px-2.5 py-1.5 bg-zinc-50/80 dark:bg-[#251F23] border border-zinc-200 dark:border-[#3D2D38] rounded-xl text-zinc-700 dark:text-[#F5EDF1] text-xs focus:outline-none focus:ring-2 focus:ring-[#D9467B] cursor-pointer transition-all truncate"
          >
            <option value="all">All Offices</option>
            <option v-for="off in officesList" :key="off.id" :value="off.id">
              {{ off.code ? `[${off.code}] ` : '' }}{{ off.name }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Board Area with Scroll Buttons and Smooth Skeleton Loading -->
    <div class="relative group/board">
      <!-- Left Floating Scroll Button -->
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-90"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-90"
      >
        <button
          v-if="canScrollLeft && !isLoading"
          @click="scrollBoardBy(-340)"
          type="button"
          class="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/95 dark:bg-[#1A1719]/95 text-zinc-700 dark:text-[#F5EDF1] shadow-md border border-zinc-200/80 dark:border-[#3D2D38] flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-[#251F23] hover:scale-105 transition-all cursor-pointer"
          title="Scroll left"
        >
          <ChevronLeft class="w-5 h-5" />
        </button>
      </transition>

      <!-- Right Floating Scroll Button -->
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-90"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-90"
      >
        <button
          v-if="canScrollRight && !isLoading"
          @click="scrollBoardBy(340)"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/95 dark:bg-[#1A1719]/95 text-zinc-700 dark:text-[#F5EDF1] shadow-md border border-zinc-200/80 dark:border-[#3D2D38] flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-[#251F23] hover:scale-105 transition-all cursor-pointer"
          title="Scroll right"
        >
          <ChevronRight class="w-5 h-5" />
        </button>
      </transition>

      <!-- Kanban Column Skeletons (Prevents layout shift during loading) -->
      <div
        v-if="isLoading"
        class="flex gap-4 overflow-x-hidden pb-6 pt-1 px-1 min-h-[580px]"
      >
        <div
          v-for="i in 4"
          :key="i"
          class="w-[320px] shrink-0 rounded-2xl border border-zinc-200/60 dark:border-[#2D252B] bg-zinc-50/60 dark:bg-[#1F191D] p-3 flex flex-col h-[560px] animate-pulse space-y-3"
        >
          <!-- Skeleton Header -->
          <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-200/50 dark:border-[#2D252B]">
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full bg-zinc-200 dark:bg-zinc-800"></div>
              <div class="w-28 h-4 rounded bg-zinc-200 dark:bg-zinc-800"></div>
            </div>
            <div class="w-6 h-4 rounded-full bg-zinc-200 dark:bg-zinc-800"></div>
          </div>
          <!-- Skeleton Cards -->
          <div class="space-y-2.5 flex-1 overflow-hidden">
            <div
              v-for="c in 3"
              :key="c"
              class="h-28 rounded-xl bg-white dark:bg-[#261E24] border border-zinc-200/50 dark:border-[#33252E] p-3 space-y-2"
            >
              <div class="flex justify-between">
                <div class="w-20 h-3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
                <div class="w-12 h-3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
              </div>
              <div class="w-full h-4 rounded bg-zinc-200 dark:bg-zinc-800"></div>
              <div class="w-3/4 h-3 rounded bg-zinc-200 dark:bg-zinc-800"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- No Folders Found Empty State -->
      <div
        v-else-if="boardColumns.length === 0"
        class="bg-white dark:bg-[#1A1719] rounded-2xl border border-zinc-200/80 dark:border-[#2D252B] p-12 text-center text-xs text-zinc-500 dark:text-[#BCAEBA] space-y-3 shadow-2xs"
      >
        <FolderOpen class="w-10 h-10 text-rose-300 dark:text-rose-500 mx-auto" />
        <p class="font-semibold text-zinc-800 dark:text-[#F5EDF1] text-sm">No routing folders configured</p>
        <p class="text-zinc-400 dark:text-[#806B76] max-w-sm mx-auto">Click below to initialize or refresh the default TCYSDO OFFICE routing folder.</p>
        <button
          @click="loadBoard"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#D9467B] text-white rounded-xl hover:bg-[#BE3568] text-xs font-semibold cursor-pointer shadow-xs transition-colors"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>Reload Routing Folders</span>
        </button>
      </div>

      <!-- No Documents Matching Filter State -->
      <div
        v-else-if="totalDisplayedDocs === 0 && activeFiltersCount > 0"
        class="bg-white dark:bg-[#1A1719] rounded-2xl border border-zinc-200/80 dark:border-[#2D252B] p-10 text-center text-xs text-zinc-500 dark:text-[#BCAEBA] space-y-3 shadow-2xs mb-4"
      >
        <Search class="w-9 h-9 text-rose-300 dark:text-rose-500 mx-auto" />
        <p class="font-semibold text-zinc-800 dark:text-[#F5EDF1] text-sm">No documents match the active filters</p>
        <p class="text-zinc-400 dark:text-[#806B76] max-w-sm mx-auto">Try modifying your search keywords or resetting your filter criteria to display all routing cards.</p>
        <button
          @click="resetFilters"
          type="button"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-[#251F23] text-zinc-800 dark:text-[#F5EDF1] border border-zinc-200 dark:border-[#3D2D38] rounded-xl hover:bg-zinc-200 dark:hover:bg-[#2D232A] text-xs font-semibold cursor-pointer transition-colors"
        >
          <RotateCcw class="w-3.5 h-3.5" />
          <span>Reset All Filters</span>
        </button>
      </div>

      <!-- Kanban Board Canvas (Horizontal Scroll for Columns with Trello-style Grab Drag) -->
      <div
        v-show="!isLoading && boardColumns.length > 0"
        ref="boardContainerRef"
        tabindex="0"
        role="region"
        aria-label="Workflow Kanban Board"
        :class="[
          'flex gap-4 overflow-x-auto pb-6 pt-1 px-1 items-start min-h-[580px] select-none focus:outline-none focus-visible:ring-1 focus-visible:ring-[#D9467B]/50 rounded-2xl',
          isDraggingBoard ? 'cursor-grabbing' : 'cursor-grab'
        ]"
        @pointerdown="handleBoardPointerDown"
        @click.capture="handleBoardClickCapture"
        @wheel="handleBoardWheel"
        @keydown="handleBoardKeyDown"
        @scroll.passive="updateScrollIndicators"
        @dragover="handleBoardDragOver"
        @drop="handleBoardDrop"
      >
        <!-- Column Container -->
        <div
          v-for="(col, colIndex) in boardColumns"
          :key="col.folder.id"
          :data-folder-id="col.folder.id"
          :class="[
            'w-[320px] shrink-0 rounded-2xl border p-3 flex flex-col max-h-[calc(100vh-14rem)] min-h-[420px] shadow-2xs transition-all duration-200 relative',
            getFolderBgClass(col.folder.color),
            getFolderBorderClass(col.folder.color),
            dragOverFolderId === col.folder.id ? 'ring-2 ring-[#D9467B] dark:ring-rose-400 bg-rose-50/60 dark:bg-rose-950/30 shadow-md scale-[1.01]' : '',
            recentlyMovedFolderId === col.folder.id ? 'ring-2 ring-emerald-500/70 shadow-md' : ''
          ]"
          @dragenter="onDragEnterFolder($event, col.folder.id)"
          @dragover="onDragOverFolder($event, col.folder.id)"
          @dragleave="onDragLeaveFolder($event, col.folder.id)"
          @drop="onDrop($event, col.folder)"
        >
          <!-- Column Header (Sticky/Fixed top of folder) -->
          <div class="flex items-start justify-between gap-2 pb-2.5 mb-2.5 border-b border-zinc-200/70 dark:border-[#3D2D38]/70 relative shrink-0">
            <div class="space-y-1 flex-1 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span
                  :class="['w-2.5 h-2.5 rounded-full shrink-0 shadow-3xs', getFolderDotClass(col.folder.color)]"
                  :title="`Folder color: ${col.folder.color || 'default'}`"
                />
                <h3
                  class="text-xs font-bold text-zinc-900 dark:text-[#F5EDF1] truncate"
                  :title="col.folder.name"
                >
                  {{ col.folder.name }}
                </h3>
                <span
                  :class="[
                    'text-[11px] font-bold px-2 py-0.2 rounded-full border shadow-2xs transition-all duration-200',
                    recentlyMovedFolderId === col.folder.id
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 scale-110'
                      : 'bg-white dark:bg-[#1A1719] text-zinc-700 dark:text-[#F5EDF1] border-zinc-200/80 dark:border-[#3D2D38]'
                  ]"
                >
                  {{ col.items.length }}
                </span>
              </div>

              <!-- Behavioral Pill -->
              <div class="flex items-center gap-1 flex-wrap text-[10px]">
                <span
                  v-if="col.folder.isDefaultRegistration"
                  class="px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 font-semibold"
                  title="Default inbox for new documents registered in Document Tracker"
                >
                  Default Inbox
                </span>

                <span
                  v-if="col.folder.isCompletedFolder"
                  class="px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-semibold"
                >
                  Completed Stage
                </span>

                <span
                  v-if="col.folder.behavior === 'destination'"
                  class="px-1.5 py-0.2 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-medium truncate max-w-[170px]"
                  :title="col.folder.associatedOfficeName ? `Physical Routing: ${col.folder.associatedOfficeName}` : 'Destination'"
                >
                  Dest: {{ col.folder.associatedOfficeCode || col.folder.associatedOfficeName || 'Office' }}
                </span>

                <span
                  v-else
                  class="px-1.5 py-0.2 rounded bg-zinc-200/80 dark:bg-[#2D232A] text-zinc-600 dark:text-[#BCAEBA] font-medium"
                >
                  Internal Stage
                </span>
              </div>

              <!-- Description (if any) -->
              <p
                v-if="col.folder.description"
                class="text-[10px] text-zinc-400 dark:text-[#806B76] truncate mt-0.5"
                :title="col.folder.description"
              >
                {{ col.folder.description }}
              </p>
            </div>

            <!-- Column 3-dot Menu Button -->
            <div class="relative shrink-0 flex items-center gap-0.5">
              <button
                @click="openAddDocumentModal"
                type="button"
                class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-700 dark:text-[#806B76] dark:hover:text-[#F5EDF1] cursor-pointer transition-colors"
                title="Register document"
              >
                <Plus class="w-3.5 h-3.5" />
              </button>

              <button
                @click="toggleFolderMenu(col.folder.id, $event)"
                type="button"
                class="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-[#BCAEBA] hover:text-zinc-800 dark:hover:text-[#F5EDF1] cursor-pointer transition-colors"
                title="Folder options"
              >
                <MoreVertical class="w-3.5 h-3.5" />
              </button>

              <!-- Folder Dropdown Menu -->
              <div
                v-if="openFolderMenuId === col.folder.id"
                class="folder-menu-dropdown absolute right-0 top-7 w-44 bg-white dark:bg-[#1A1719] rounded-xl shadow-lg border border-zinc-200 dark:border-[#2D252B] py-1 z-30 text-xs"
                @click.stop
              >
                <button
                  @click="openEditFolderModal(col.folder)"
                  type="button"
                  class="w-full px-3 py-1.5 text-left text-zinc-700 dark:text-[#F5EDF1] hover:bg-zinc-50 dark:hover:bg-[#251F23] flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Edit2 class="w-3 h-3 text-zinc-400 dark:text-[#806B76]" />
                  <span>Configure Folder</span>
                </button>

                <button
                  v-if="colIndex > 0"
                  @click="moveFolderOrder(colIndex, -1)"
                  type="button"
                  class="w-full px-3 py-1.5 text-left text-zinc-700 dark:text-[#F5EDF1] hover:bg-zinc-50 dark:hover:bg-[#251F23] flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <ArrowLeft class="w-3 h-3 text-zinc-400 dark:text-[#806B76]" />
                  <span>Move Left</span>
                </button>

                <button
                  v-if="colIndex < boardColumns.length - 1"
                  @click="moveFolderOrder(colIndex, 1)"
                  type="button"
                  class="w-full px-3 py-1.5 text-left text-zinc-700 dark:text-[#F5EDF1] hover:bg-zinc-50 dark:hover:bg-[#251F23] flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <ArrowRightIcon class="w-3 h-3 text-zinc-400 dark:text-[#806B76]" />
                  <span>Move Right</span>
                </button>

                <div class="border-t border-zinc-100 dark:border-[#2D252B] my-1"></div>

                <button
                  @click="openArchiveFolderModal(col)"
                  type="button"
                  class="w-full px-3 py-1.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 cursor-pointer transition-colors"
                  :disabled="col.folder.isDefaultRegistration"
                  :class="col.folder.isDefaultRegistration ? 'opacity-50 cursor-not-allowed' : ''"
                >
                  <Archive class="w-3 h-3 text-red-500" />
                  <span>Archive Folder</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Cards Container (Drop Target & Vertically Scrollable Content Area) -->
          <div class="folder-cards-list space-y-2.5 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-1 cursor-default scroll-smooth">
            <!-- Inline Drop Target Placeholder Slot when dragging over a different folder -->
            <transition
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 -translate-y-1"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-100 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-1"
            >
              <div
                v-if="dragOverFolderId === col.folder.id && draggedDocument && draggedDocument.workflowFolderId !== col.folder.id"
                class="py-2.5 px-3 rounded-xl border-2 border-dashed border-[#D9467B] dark:border-rose-400 bg-rose-50/80 dark:bg-rose-950/40 text-[#D9467B] dark:text-rose-200 text-center text-xs font-semibold flex items-center justify-center gap-1.5 shadow-inner"
              >
                <ArrowRight class="w-3.5 h-3.5" />
                <span>Move to {{ col.folder.name }}</span>
              </div>
            </transition>

            <!-- Empty Folder State (Active drop target area) -->
            <div
              v-if="col.items.length === 0 && dragOverFolderId !== col.folder.id"
              class="h-44 border-2 border-dashed border-zinc-200/80 dark:border-[#3D2D38] rounded-xl flex flex-col items-center justify-center p-4 text-center text-zinc-400 dark:text-[#806B76] space-y-1.5 my-auto"
            >
              <FolderOpen class="w-6 h-6 text-zinc-300 dark:text-zinc-600 stroke-1" />
              <p class="text-[11px] font-semibold text-zinc-600 dark:text-[#DDD2D9]">No documents in this stage</p>
              <p class="text-[10px] text-zinc-400 dark:text-[#806B76]">Drag and drop document slips here</p>
            </div>

            <!-- Document Cards -->
            <div
              v-for="card in col.items"
              :key="card.id"
              tabindex="0"
              role="button"
              :aria-label="`Document ${card.trackingNumber}: ${card.title}`"
              draggable="true"
              @dragstart="onDragStart($event, card)"
              @dragend="onDragEnd"
              :class="[
                'bg-white dark:bg-[#1E1A1D] rounded-xl border border-zinc-200/80 dark:border-[#332A30] p-3 shadow-2xs hover:shadow-md hover:border-[#D9467B]/50 dark:hover:border-rose-400/50 hover:-translate-y-0.5 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9467B] text-xs cursor-grab active:cursor-grabbing space-y-2.5 transition-all duration-150',
                isDraggingCardId === card.id ? 'opacity-35 scale-[0.98] border-dashed border-[#D9467B] dark:border-rose-400 shadow-none' : ''
              ]"
              @click="openDetailDrawer(card)"
              @keydown.enter="openDetailDrawer(card)"
            >
              <!-- Card Top: Tracking # and Priority Badge -->
              <div class="flex items-center justify-between gap-1" @click.stop>
                <div class="flex items-center gap-1 font-mono text-[10px] font-semibold">
                  <button
                    @click="copySlip(card.trackingNumber)"
                    type="button"
                    class="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-[#251F23] hover:bg-zinc-200 dark:hover:bg-[#2D232A] text-zinc-800 dark:text-[#F5EDF1] border border-zinc-200/70 dark:border-[#3D2D38] inline-flex items-center gap-1 cursor-pointer transition-colors"
                    title="Click to copy Tracking #"
                  >
                    <span>{{ card.trackingNumber }}</span>
                    <Check v-if="copiedNumber === card.trackingNumber" class="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                    <Copy v-else class="w-2.5 h-2.5 text-zinc-400 dark:text-[#806B76]" />
                  </button>
                  <span v-if="copiedNumber === card.trackingNumber" class="text-[9px] text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
                    Copied!
                  </span>
                </div>

                <BaseBadge :variant="getPriorityBadgeVariant(card.priority)" size="xs">
                  {{ card.priority }}
                </BaseBadge>
              </div>

              <!-- Subject / Title & Activity Design Badges -->
              <div class="space-y-1">
                <div v-if="card.relatedFinanceRecordId || card.amountOfAd" class="flex items-center gap-1 flex-wrap">
                  <span
                    v-if="card.relatedFinanceRecordId"
                    class="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50"
                  >
                    <Sparkles class="w-2.5 h-2.5 text-[#D9467B] dark:text-[#F294B7]" />
                    <span>AD</span>
                  </span>
                  <span
                    v-if="card.prNumber"
                    class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 font-mono"
                  >
                    PR: {{ card.prNumber }}
                  </span>
                  <span
                    v-if="card.amountOfAd"
                    class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-100 dark:bg-[#251F23] text-zinc-800 dark:text-[#F5EDF1]"
                  >
                    ₱{{ Number(card.amountOfAd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                  </span>
                </div>

                <h4 class="font-semibold text-zinc-900 dark:text-[#F5EDF1] leading-snug line-clamp-2 hover:text-[#D9467B] dark:hover:text-[#F294B7] transition-colors">
                  {{ card.title }}
                </h4>

                <p v-if="card.referenceNumber" class="font-mono text-[10px] text-zinc-400 dark:text-[#806B76] mt-0.5 truncate">
                  Ref: {{ card.referenceNumber }}
                </p>
              </div>

              <!-- Document Type & Due Date -->
              <div class="flex items-center justify-between gap-1 text-[11px] pt-1">
                <span class="font-medium text-[#D9467B] dark:text-[#F294B7] bg-[#FFF0F5] dark:bg-[#2D1F28] px-2 py-0.2 rounded text-[10px] border border-[#F3C4D7] dark:border-[#4A2D3C] truncate max-w-[130px]">
                  {{ card.documentType }}
                </span>

                <span
                  v-if="card.dueDate"
                  :class="[
                    'text-[10px] shrink-0 font-medium inline-flex items-center gap-1',
                    isDocumentOverdue(card) ? 'text-red-700 dark:text-red-400 font-bold' : 'text-zinc-500 dark:text-[#806B76]'
                  ]"
                >
                  <Clock class="w-3 h-3" :class="isDocumentOverdue(card) ? 'text-red-600 dark:text-red-400' : 'text-zinc-400 dark:text-[#806B76]'" />
                  <span>Due: {{ formatDocDate(card.dueDate) }}</span>
                  <span v-if="isDocumentOverdue(card)" class="text-[9px] px-1 py-0.2 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded font-bold uppercase">
                    Overdue
                  </span>
                </span>
              </div>

              <!-- Physical Custody Location / In-Transit Status -->
              <div class="pt-2 border-t border-zinc-100 dark:border-[#2D252B] flex items-center justify-between text-[11px]">
                <!-- If In Transit -->
                <div v-if="card.status === 'in_transit'" class="flex items-center gap-1 text-sky-800 dark:text-sky-300 font-semibold truncate">
                  <Send class="w-3 h-3 text-sky-600 dark:text-sky-400 animate-pulse shrink-0" />
                  <span class="truncate">En Route &rarr; {{ card.activeDestinationOfficeCode || 'Dest' }}</span>
                </div>

                <!-- If Confirmed at Office -->
                <div v-else class="flex items-center gap-1 text-zinc-600 dark:text-[#BCAEBA] truncate max-w-[180px]">
                  <MapPin class="w-3 h-3 text-zinc-400 dark:text-[#806B76] shrink-0" />
                  <span class="truncate font-medium">{{ card.currentOfficeCode || card.currentOfficeName || 'Office' }}</span>
                </div>

                <!-- In-transit Receive Button -->
                <button
                  v-if="card.status === 'in_transit'"
                  @click.stop="openReceiveModal(card)"
                  type="button"
                  class="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-[10px] font-semibold inline-flex items-center gap-1 shadow-2xs cursor-pointer shrink-0 transition-colors"
                  title="Confirm physical receipt"
                >
                  <CheckCircle2 class="w-2.5 h-2.5" />
                  <span>Receive</span>
                </button>
              </div>

              <!-- Card Bottom Accessible Actions & "Move to..." -->
              <div class="pt-1.5 border-t border-zinc-100/80 dark:border-[#2D252B] flex items-center justify-between gap-1" @click.stop>
                <!-- Accessible "Move to..." dropdown (touch/keyboard support) -->
                <div class="relative">
                  <button
                    @click="toggleCardMenu(card.id, $event)"
                    type="button"
                    class="px-2 py-0.5 rounded-md bg-zinc-50 dark:bg-[#251F23] hover:bg-zinc-100 dark:hover:bg-[#2D232A] border border-zinc-200 dark:border-[#3D2D38] text-zinc-700 dark:text-[#F5EDF1] text-[10px] font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                    title="Move document to another folder"
                  >
                    <span>Move to</span>
                    <ChevronDown class="w-2.5 h-2.5 text-zinc-400 dark:text-[#806B76]" />
                  </button>

                  <!-- Move to Target Folders Menu -->
                  <div
                    v-if="openCardMenuId === card.id"
                    class="absolute left-0 bottom-6 w-48 bg-white dark:bg-[#1A1719] rounded-xl shadow-lg border border-zinc-200 dark:border-[#2D252B] py-1 z-30 text-xs"
                    @click.stop
                  >
                    <div class="px-2.5 py-1 text-[10px] font-bold text-zinc-400 dark:text-[#806B76] uppercase tracking-wider">
                      Select Target Folder
                    </div>
                    <button
                      v-for="targetFolder in allActiveFolders.filter((f) => f.id !== card.workflowFolderId)"
                      :key="targetFolder.id"
                      @click="executeMove(card, targetFolder); closeAllMenus()"
                      type="button"
                      class="w-full px-3 py-1.5 text-left text-zinc-700 dark:text-[#F5EDF1] hover:bg-zinc-50 dark:hover:bg-[#251F23] flex items-center justify-between gap-2 cursor-pointer text-xs transition-colors"
                    >
                      <span class="truncate">{{ targetFolder.name }}</span>
                      <span
                        v-if="targetFolder.behavior === 'destination'"
                        class="text-[9px] px-1 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 rounded border border-sky-100 dark:border-sky-900/50"
                      >
                        Dest
                      </span>
                    </button>
                  </div>
                </div>

                <!-- Quick Action Buttons -->
                <div class="flex items-center gap-1">
                  <!-- Jump to Finance if AD linked -->
                  <router-link
                    v-if="card.relatedFinanceRecordId"
                    :to="{ path: '/finance', query: { search: card.title } }"
                    class="p-1 rounded-md text-zinc-400 dark:text-[#806B76] hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="View Activity Design in Finance"
                  >
                    <FileText class="w-3.5 h-3.5 text-[#D9467B] dark:text-[#F294B7]" />
                  </router-link>

                  <button
                    v-if="card.status !== 'in_transit'"
                    @click="openTransferModal(card)"
                    type="button"
                    class="p-1 rounded-md text-zinc-400 dark:text-[#806B76] hover:text-sky-700 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors"
                    title="Dispatch transfer to office"
                  >
                    <Send class="w-3.5 h-3.5" />
                  </button>

                  <button
                    @click="openDetailDrawer(card)"
                    type="button"
                    class="p-1 rounded-md text-zinc-400 dark:text-[#806B76] hover:text-zinc-800 dark:hover:text-[#F5EDF1] hover:bg-zinc-100 dark:hover:bg-[#251F23] transition-colors"
                    title="View full audit log and routing history"
                  >
                    <Eye class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals Mount -->
    <!-- 1. Folder Modal (Create & Edit) -->
    <FolderModal
      :is-open="isFolderModalOpen"
      :folder-to-edit="folderToEdit"
      @close="isFolderModalOpen = false"
      @saved="handleFolderSaved"
    />

    <!-- 2. Archive Folder Modal (With safe document relocation) -->
    <ArchiveFolderModal
      :is-open="isArchiveModalOpen"
      :folder="folderToArchive"
      :document-count="folderToArchiveCount"
      :available-folders="allActiveFolders"
      @close="isArchiveModalOpen = false"
      @archived="handleFolderArchived"
    />

    <!-- 3. Add Document Modal (Registers into default or configured folder) -->
    <DocumentModal
      :is-open="isAddDocModalOpen"
      :document-to-edit="null"
      @close="isAddDocModalOpen = false"
      @saved="handleDocumentSaved"
    />

    <!-- 4. Document Detail Drawer (Complete audit log, movements, live folder switcher) -->
    <DocumentDetailDrawer
      :is-open="isDetailDrawerOpen"
      :document-id="selectedDocumentId"
      @close="isDetailDrawerOpen = false; selectedDocumentId = null"
      @updated="loadBoard"
      @transfer-requested="openTransferModal"
      @receive-requested="openReceiveModal"
    />

    <!-- 5. Transfer Modal (When dispatching to external/destination office) -->
    <TransferModal
      :is-open="isTransferModalOpen"
      :document="documentForTransfer"
      @close="isTransferModalOpen = false; documentForTransfer = null"
      @transferred="handleTransferred"
    />

    <!-- 6. Receive Modal (When confirming physical receipt) -->
    <ReceiveModal
      :is-open="isReceiveModalOpen"
      :document="documentForReceive"
      @close="isReceiveModalOpen = false; documentForReceive = null"
      @received="handleReceived"
    />
  </div>
</template>

<style scoped>
/* Scoped refined scrollbars for routing folders */
.folder-cards-list::-webkit-scrollbar {
  width: 5px;
}
.folder-cards-list::-webkit-scrollbar-track {
  background: transparent;
}
.folder-cards-list::-webkit-scrollbar-thumb {
  background: rgba(217, 70, 123, 0.22);
  border-radius: 9999px;
}
.folder-cards-list::-webkit-scrollbar-thumb:hover {
  background: rgba(217, 70, 123, 0.45);
}

:global(.dark) .folder-cards-list::-webkit-scrollbar-thumb {
  background: rgba(242, 148, 183, 0.22);
}
:global(.dark) .folder-cards-list::-webkit-scrollbar-thumb:hover {
  background: rgba(242, 148, 183, 0.45);
}

/* Accessibility: Respect Reduced Motion Preferences */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
